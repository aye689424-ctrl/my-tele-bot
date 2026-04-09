const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo Sniper Pro v3.0 - All in One Message'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Security Helpers ---
function generateRandomKey() {
    return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// ========== 🔄 AUTO RE-LOGIN FUNCTION ==========
async function checkAndReLogin(chatId) {
    const data = user_db[chatId];
    if (!data?.token) return false;
    
    // Test token with a simple API call
    const test = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    
    // Token expired (msgCode 401, 403, or not 0)
    if (test?.msgCode !== 0 && test?.msgCode !== undefined) {
        console.log(`Token expired for user ${chatId}, attempting re-login...`);
        
        // Try to re-login with stored credentials
        if (data.savedUsername && data.savedPassword) {
            const loginRes = await callApi("Login", { 
                phonetype: -1, 
                logintype: "mobile", 
                username: data.savedUsername, 
                pwd: data.savedPassword 
            });
            
            if (loginRes?.msgCode === 0) {
                data.token = loginRes.data.tokenHeader + " " + loginRes.data.token;
                data.running = true;
                bot.sendMessage(chatId, "🔄 Session refreshed automatically! Continue betting...");
                console.log(`Auto re-login successful for user ${chatId}`);
                return true;
            } else {
                bot.sendMessage(chatId, "⚠️ Session expired! Please /start and login again.");
                data.running = false;
                data.token = null;
                return false;
            }
        } else {
            bot.sendMessage(chatId, "⚠️ Session expired! Please /start and login again.");
            data.running = false;
            data.token = null;
            return false;
        }
    }
    return true;
}

// ========== 🧠 PATTERN-BASED AI LOGIC ==========
function getSideFromNumber(num) {
    return parseInt(num) >= 5 ? "Big" : "Small";
}

function runAI(history) {
    const resArr = history.map(i => getSideFromNumber(i.number));
    
    // Streak Analysis
    let streak = 1;
    let currentSide = resArr[0];
    for(let i = 1; i < resArr.length; i++) {
        if(resArr[i] === currentSide) streak++;
        else break;
    }
    
    // Alternation Pattern
    let alternationCount = 0;
    for(let i = 1; i < Math.min(10, resArr.length); i++) {
        if(resArr[i] !== resArr[i-1]) alternationCount++;
    }
    let isAlternating = alternationCount >= 7;
    
    // Big/Small Ratio
    const last20 = resArr.slice(0, 20);
    const bigCount = last20.filter(x => x === "Big").length;
    const smallCount = 20 - bigCount;
    
    let prediction = null;
    
    // Rule 1: Streak Based
    if(streak === 1) {
        prediction = currentSide;
    } 
    else if(streak === 2) {
        prediction = currentSide;
    }
    else if(streak === 3) {
        prediction = currentSide === "Big" ? "Small" : "Big";
    }
    else if(streak >= 4) {
        prediction = currentSide === "Big" ? "Small" : "Big";
    }
    
    // Rule 2: Alternation Pattern
    if(isAlternating && alternationCount >= 8) {
        prediction = resArr[0] === "Big" ? "Small" : "Big";
    }
    
    // Rule 3: Ratio Reversal
    if(bigCount >= 13) {
        prediction = "Small";
    }
    else if(smallCount >= 13) {
        prediction = "Big";
    }
    
    let finalPrediction = prediction || "Big";
    let patternTxt = isAlternating ? "Alternating 🔄" : "Normal 📈";
    let calcTxt = `${resArr[2]?.charAt(0) || '?'}-${resArr[1]?.charAt(0) || '?'}-${resArr[0]?.charAt(0) || '?'}`;
    
    return { 
        side: finalPrediction, 
        dragon: streak, 
        calc: calcTxt,
        pattern: patternTxt
    };
}

// --- Auto Bet Function ---
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = user_db[chatId];
    if (!data || !data.token) return false;
    
    // Check token before betting
    const isLoggedIn = await checkAndReLogin(chatId);
    if (!isLoggedIn) return false;
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) return false;
    
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    
    const betPayload = { 
        typeId: 30, 
        issuenumber: targetIssue, 
        gameType: 2, 
        amount: Math.floor(baseUnit), 
        betCount: Math.floor(amount / baseUnit), 
        selectType: side === "Big" ? 13 : 14, 
        isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        data.betHistory.unshift({ 
            issue: targetIssue.slice(-5), 
            side, 
            amount, 
            status: "⏳ Pending", 
            pnl: 0,
            isAuto: true,
            autoStep: stepIndex
        });
        bot.sendMessage(chatId, `✅ [AUTO] ${side} | ${amount} MMK`);
        return true;
    }
    return false;
}

// --- Execute Auto Bet Logic ---
async function executeAutoBet(chatId, isWin) {
    const data = user_db[chatId];
    if (!data.autoBetActive) return;
    
    if (isWin) {
        data.consecutiveWins++;
        data.consecutiveLosses = 0;
        
        if (data.consecutiveWins >= data.stopLimit) {
            bot.sendMessage(chatId, `🛑 Stop Limit Reached! (${data.stopLimit} wins)\nAuto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.consecutiveWins = 0;
            data.currentBetStep = 0;
            return;
        }
        
        data.currentBetStep = 0;
        const nextAmount = data.betPlan[0];
        await placeAutoBet(chatId, data.autoSide, nextAmount, 0);
        return;
    }
    
    // LOSS
    data.consecutiveLosses++;
    data.consecutiveWins = 0;
    
    if (data.autoMode === "martingale") {
        const nextStep = data.currentBetStep + 1;
        
        if (nextStep < data.betPlan.length) {
            data.currentBetStep = nextStep;
            const nextAmount = data.betPlan[data.currentBetStep];
            await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
        } else {
            bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.currentBetStep = 0;
        }
    }
    else if (data.autoMode === "trigger") {
        if (data.consecutiveLosses >= 7 && !data.autoBetActive && !data.autoBetStarted) {
            data.autoBetActive = true;
            data.autoBetStarted = true;
            data.currentBetStep = 0;
            const firstAmount = data.betPlan[0];
            bot.sendMessage(chatId, `⚠️ 7 Losses! Starting Auto Bet: ${data.autoSide} | ${firstAmount} MMK`);
            await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
        }
        else if (data.autoBetActive) {
            const nextStep = data.currentBetStep + 1;
            if (nextStep < data.betPlan.length) {
                data.currentBetStep = nextStep;
                const nextAmount = data.betPlan[data.currentBetStep];
                await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
            } else {
                bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                data.autoBetActive = false;
                data.autoBetStarted = false;
                data.currentBetStep = 0;
            }
        }
    }
}

// --- Monitoring Loop (All in One Message) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        
        // Check token before each API call
        const isLoggedIn = await checkAndReLogin(chatId);
        if (!isLoggedIn) {
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;
                let fullMessage = "";

                // ========== VIP REPORT (Result of previous signal) ==========
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    const resultText = realSide === "Big" ? "Big" : "Small";
                    
                    // Update bet history
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            if (bet.side === realSide) {
                                bet.status = "✅ WIN";
                                bet.pnl = +(bet.amount * 0.96).toFixed(2);
                                roundProfit += bet.pnl;
                                if (bet.isAuto) executeAutoBet(chatId, true);
                            } else {
                                bet.status = "❌ LOSS";
                                bet.pnl = -bet.amount;
                                roundProfit += bet.pnl;
                                if (bet.isAuto) executeAutoBet(chatId, false);
                            }
                        }
                    });
                    data.totalProfit += roundProfit;
                    
                    // Add VIP Report to message
                    const pnlSign = roundProfit >= 0 ? "+" : "";
                    fullMessage += `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${resultText}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${pnlSign}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    
                    // Update AI logs
                    data.aiLogs.unshift({ 
                        status: isWin ? "✅" : "❌", 
                        issue: lastRound.issueNumber.slice(-3), 
                        result: realSide,
                        prediction: data.last_pred
                    });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    
                    // Add AI History (20 games) to message
                    fullMessage += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => {
                        const resultText2 = l.result === "Big" ? "Big" : "Small";
                        fullMessage += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${resultText2}\n`;
                    });
                    fullMessage += `\n`;
                }

                // ========== AI NEW SIGNAL ==========
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;
                data.autoSide = ai.side;

                // Start Auto Bet for Martingale mode
                const hasPendingAuto = data.betHistory.some(b => b.status === "⏳ Pending" && b.isAuto);
                if (data.autoMode === "martingale" && data.autoBetActive && !hasPendingAuto && !data.autoBetStarted) {
                    data.autoBetStarted = true;
                    data.currentBetStep = 0;
                    data.consecutiveLosses = 0;
                    data.consecutiveWins = 0;
                    const firstAmount = data.betPlan[0];
                    bot.sendMessage(chatId, `🤖 Starting Martingale: ${ai.side} | ${firstAmount} MMK`);
                    await placeAutoBet(chatId, ai.side, firstAmount, 0);
                }

                // ========== ADD AI MULTI-BRAIN ANALYSIS ==========
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                
                const brainInfo = `B1:${ai.side.charAt(0)}|B2:${ai.side.charAt(0)}|B3:${ai.side === "Big" ? "S" : "B"}`;
                const confidenceText = ai.dragon >= 3 ? "HIGH 🔥" : "NORMAL ⚡";
                const patternText = ai.dragon >= 3 ? "Dragon Mode 🐉" : "Brain Voting 🧠";
                const sideText = ai.side === "Big" ? "ကြီး (BIG)🧑‍💻" : "သေး (SMALL)🧑‍💻";
                
                fullMessage += `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${brainInfo}\`\n🛡 Pattern: \`${patternText}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${sideText}**\n📊 Confidence: \`${confidenceText}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;

                // ========== SEND ONE MESSAGE WITH ALL CONTENT + BUTTONS ==========
                await bot.sendMessage(chatId, fullMessage, {
                    reply_markup: { 
                        inline_keyboard: [[
                            { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- Menus ---
const mainMenu = { 
    reply_markup: { 
        keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "⚙️ Settings"], ["🚪 Logout"]], 
        resize_keyboard: true 
    } 
};

const settingsMenu = {
    reply_markup: {
        keyboard: [
            ["🎲 Set Bet Plan", "🛑 Set Stop Limit"],
            ["🔄 Select Mode", "✅ Start Auto Bet"],
            ["❌ Stop Auto Bet", "🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// --- Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [10, 30, 90, 170, 610, 1800, 3800, 6000],
            stopLimit: 1,
            autoMode: "trigger",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            autoSide: null,
            savedUsername: null,
            savedPassword: null
        };
    }

    // Manual bet amount input
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const data = user_db[chatId];
        
        // Check token before betting
        const isLoggedIn = await checkAndReLogin(chatId);
        if (!isLoggedIn) {
            bot.sendMessage(chatId, "❌ Session expired! Please /start and login again.");
            user_db[chatId].pendingSide = null;
            return;
        }
        
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;

        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
        if (baseUnit < 10) baseUnit = 10;

        const betPayload = { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: Math.floor(baseUnit), betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, data.token);
        
        if (res?.msgCode === 0 || res?.msg === "Bet success") {
            bot.sendMessage(chatId, `✅ [MANUAL] ${data.pendingSide} | ${amount} MMK`);
            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false });
        } else { 
            bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); 
        }
        user_db[chatId].pendingSide = null; 
        return;
    }

    // Settings commands
    if (text === "⚙️ Settings") {
        const data = user_db[chatId];
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n🔄 Mode: \`${data.autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        user_db[chatId].settingMode = "betplan";
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,170,610,1800,3800,6000");
    }
    
    if (text === "🛑 Set Stop Limit") {
        user_db[chatId].settingMode = "stoplimit";
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\n1 = 1 ပွဲအနိုင်ရရင် ရပ်\n2 = 2 ပွဲဆက်နိုင်မှ ရပ်");
    }
    
    if (text === "🔄 Select Mode") {
        user_db[chatId].settingMode = "mode";
        return bot.sendMessage(chatId, "🔁 **Mode ရွေးပါ**\n\n1️⃣ **Martingale Mode** - ရှုံးတိုင်း ဆက်ထိုး\n2️⃣ **Trigger Mode** - ရှုံး 7 ပွဲပြည့်မှ စထိုး");
    }
    
    if (text === "✅ Start Auto Bet") {
        user_db[chatId].autoBetActive = true;
        user_db[chatId].autoBetStarted = false;
        user_db[chatId].currentBetStep = 0;
        user_db[chatId].consecutiveLosses = 0;
        user_db[chatId].consecutiveWins = 0;
        bot.sendMessage(chatId, `✅ Auto Bet Started!\n\nMode: ${user_db[chatId].autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\nBet Plan: ${user_db[chatId].betPlan.join(' → ')}\nStop Limit: ${user_db[chatId].stopLimit} win(s)`, mainMenu);
    }
    
    if (text === "❌ Stop Auto Bet") {
        user_db[chatId].autoBetActive = false;
        user_db[chatId].autoBetStarted = false;
        bot.sendMessage(chatId, "❌ Auto Bet Stopped.", mainMenu);
    }
    
    if (text === "🔙 Main Menu") {
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }
    
    // Handle settings input
    if (user_db[chatId].settingMode) {
        const mode = user_db[chatId].settingMode;
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                user_db[chatId].betPlan = numbers;
                bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid format.");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].stopLimit = num;
                bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s)`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "mode") {
            if (text === "1") {
                user_db[chatId].autoMode = "martingale";
                bot.sendMessage(chatId, "✅ Mode: Martingale - ရှုံးတိုင်း ဆက်ထိုးမယ်");
            } else if (text === "2") {
                user_db[chatId].autoMode = "trigger";
                bot.sendMessage(chatId, "✅ Mode: Trigger - ရှုံး 7 ပွဲပြည့်မှ စထိုးမယ်");
            } else {
                bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ 1 သို့မဟုတ် 2 ရိုက်ထည့်ပါ။");
                return;
            }
        }
        user_db[chatId].settingMode = null;
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }

    // Main menu commands
    if (text === '/start') {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [10, 30, 90, 170, 610, 1800, 3800, 6000],
            stopLimit: 1,
            autoMode: "trigger",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            autoSide: null,
            savedUsername: null,
            savedPassword: null
        };
        return bot.sendMessage(chatId, "🎯 **WinGo Sniper Pro v3.0** 🎯\n\nအင်္ဂါရပ်များ:\n✅ Pattern-Based AI\n✅ 1-2-3 ကိုက်စနစ်\n✅ တလှည့်စီဖမ်း\n✅ အချိုးအစားပြန်ညီ\n✅ တစ်ခုတည်းသော မက်ဆေ့ခ်ျမှာ အားလုံးပါ\n✅ Auto Re-login\n\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
    }

    if (text === "📜 Bet History") {
        const data = user_db[chatId];
        let txt = `📜 **Bet History**\n💰 Total: **${data.totalProfit.toFixed(2)}** MMK\n------------------\n`;
        data.betHistory.slice(0, 20).forEach(h => { 
            const autoTag = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnlTxt = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${autoTag} | ${h.issue} | ${h.side} | ${h.amount} ${pnlTxt}\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }

    if (text === "📈 AI History") {
        const data = user_db[chatId];
        let txt = "📈 **AI Prediction History (30 games)**\n------------------\n";
        data.aiLogs.slice(0, 30).forEach(l => { 
            txt += `${l.status} | ${l.issue} | Pred: ${l.prediction === "Big" ? "BIG" : "SMALL"} | Result: ${l.result === "Big" ? "BIG" : "SMALL"}\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }

    if (text === "📊 Website (100)") {
        const data = user_db[chatId];
        if (!data.token) return bot.sendMessage(chatId, "❌ Please login first!");
        
        const isLoggedIn = await checkAndReLogin(chatId);
        if (!isLoggedIn) return bot.sendMessage(chatId, "❌ Session expired! Please /start and login again.");
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token);
        let list = "📊 **Last 20 Games**\n------------------\n";
        res?.data?.list?.forEach(i => { 
            list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5 ? 'BIG 🔵' : 'SMALL 🔴'})\n`; 
        });
        return bot.sendMessage(chatId, list);
    }

    // Login flow
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; 
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const data = user_db[chatId];
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.savedUsername = username;  // Save for auto re-login
            data.savedPassword = text;      // Save for auto re-login
            data.running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login Success! All-in-One Message Active...\n🔄 Auto re-login enabled!", mainMenu);
        } else { 
            bot.sendMessage(chatId, "❌ Login Failed!"); 
            data.tempPhone = null; 
        }
    }
    
    if (text === "🚪 Logout") {
        user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null };
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
