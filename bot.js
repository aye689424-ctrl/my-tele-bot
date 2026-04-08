const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo Sniper Pro v2.0'); }).listen(process.env.PORT || 8080);

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

// --- AI Multi-Brain Signal Logic ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    let b1 = (resArr[0] === resArr[2]) ? (resArr[1] === "Big" ? "Small" : "Big") : (resArr[0] === "Big" ? "Small" : "Big");
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i] === resArr[i+1]) dragon++; else break; }
    let b2 = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");
    let bigs = resArr.slice(0, 10).filter(x => x === "Big").length;
    let b3 = bigs >= 6 ? "Small" : "Big";
    let votes = { Big: 0, Small: 0 };
    votes[b1]++; votes[b2]++; votes[b3]++;
    let finalSide = votes.Big > votes.Small ? "Big" : "Small";
    return { side: finalSide, dragon, confidence: votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡", info: `B1:${b1[0]}|B2:${b2[0]}|B3:${b3[0]}` };
}

// --- Auto Bet Function ---
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = user_db[chatId];
    if (!data || !data.token) return false;
    
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
        bot.sendMessage(chatId, `✅ [AUTO] ${side} | ${amount} MMK | Step ${stepIndex+1}/${data.betPlan.length}`);
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
        
        bot.sendMessage(chatId, `✅ Auto Bet WIN! (${data.consecutiveWins}/${data.stopLimit} wins needed to stop)`);
        
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
        const success = await placeAutoBet(chatId, data.autoSide, nextAmount, 0);
        if (!success) {
            data.autoBetActive = false;
            data.autoBetStarted = false;
        }
        return;
    }
    
    // LOSS
    data.consecutiveLosses++;
    data.consecutiveWins = 0;
    
    bot.sendMessage(chatId, `❌ Auto Bet LOSS! (Loss streak: ${data.consecutiveLosses})`);
    
    if (data.autoMode === "martingale") {
        const nextStep = data.currentBetStep + 1;
        
        if (nextStep < data.betPlan.length) {
            data.currentBetStep = nextStep;
            const nextAmount = data.betPlan[data.currentBetStep];
            const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
            if (!success) {
                data.autoBetActive = false;
                data.autoBetStarted = false;
            }
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
            const success = await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
            if (!success) {
                data.autoBetActive = false;
                data.autoBetStarted = false;
            }
        }
        else if (data.autoBetActive) {
            const nextStep = data.currentBetStep + 1;
            if (nextStep < data.betPlan.length) {
                data.currentBetStep = nextStep;
                const nextAmount = data.betPlan[data.currentBetStep];
                const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                if (!success) {
                    data.autoBetActive = false;
                    data.autoBetStarted = false;
                }
            } else {
                bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                data.autoBetActive = false;
                data.autoBetStarted = false;
                data.currentBetStep = 0;
            }
        }
    }
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;

                // Check pending bets
                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === lastRound.issueNumber.slice(-5));
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        roundProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            await executeAutoBet(chatId, true);
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        roundProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            await executeAutoBet(chatId, false);
                        }
                    }
                    data.totalProfit += roundProfit;
                }

                // AI Prediction
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.autoSide = ai.side;
                data.last_pred = ai.side;

                // Update AI logs
                const isAiWin = data.last_pred === realSide;
                data.aiLogs.unshift({ 
                    status: isAiWin ? "✅" : "❌", 
                    issue: lastRound.issueNumber.slice(-3), 
                    result: realSide,
                    prediction: data.last_pred
                });
                if (data.aiLogs.length > 50) data.aiLogs.pop();

                // Update consecutive losses for trigger mode
                if (!isAiWin) {
                    data.consecutiveLossesAI++;
                } else {
                    data.consecutiveLossesAI = 0;
                }

                // Start Auto Bet (Martingale mode - starts immediately)
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

                // Build message
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let modeText = data.autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)";
                let autoStatus = data.autoBetActive ? "ACTIVE ✅" : "STANDBY ⏳";
                
                let msg = `🎯 **SNIPER PRO v2.0** 🎯\n━━━━━━━━━━━━━━━━\n🧠 AI Logic: \`${ai.info}\`\n🐉 Dragon: ${ai.dragon} ပွဲဆက်\n🎲 Prediction: **${ai.side === "Big" ? "ကြီး (BIG) 🔵" : "သေး (SMALL) 🔴"}**\n📊 Confidence: ${ai.confidence}\n⏰ Time: ${mmTime}\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n━━━━━━━━━━━━━━━━\n🤖 **Auto Bet**\n📋 Plan: ${data.betPlan.join(' → ')}\n🎯 Mode: ${modeText}\n⚡ Status: ${autoStatus}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n📉 AI Loss Streak: ${data.consecutiveLossesAI}/7\n━━━━━━━━━━━━━━━━\n📊 **Last Result:** ${realSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} (${lastRound.number})`;
                
                await bot.sendMessage(chatId, msg, {
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
            betPlan: [10, 30, 90, 270, 810, 2430, 7290],
            stopLimit: 1,
            autoMode: "trigger",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            consecutiveLossesAI: 0,
            autoSide: null
        };
    }

    // Manual bet amount input
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const data = user_db[chatId];
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
        const msg = `⚙️ **Sniper Pro Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n🔄 Mode: \`${data.autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        user_db[chatId].settingMode = "betplan";
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,270,810,2430,7290");
    }
    
    if (text === "🛑 Set Stop Limit") {
        user_db[chatId].settingMode = "stoplimit";
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\n1 = 1 ပွဲအနိုင်ရရင် ရပ်\n2 = 2 ပွဲဆက်နိုင်မှ ရပ်");
    }
    
    if (text === "🔄 Select Mode") {
        user_db[chatId].settingMode = "mode";
        return bot.sendMessage(chatId, "🔁 **Mode ရွေးပါ**\n\n1️⃣ **Martingale Mode** - ရှုံးတိုင်း ဆက်ထိုး\n2️⃣ **Trigger Mode** - ရှုံး 7 ပွဲပြည့်မှ စထိုး\n\nကျေးဇူးပြု၍ **1** သို့မဟုတ် **2** ရိုက်ထည့်ပါ။");
    }
    
    if (text === "✅ Start Auto Bet") {
        user_db[chatId].autoBetActive = true;
        user_db[chatId].autoBetStarted = false;
        user_db[chatId].currentBetStep = 0;
        user_db[chatId].consecutiveLosses = 0;
        user_db[chatId].consecutiveWins = 0;
        bot.sendMessage(chatId, `✅ Auto Bet Started!\n\nMode: ${user_db[chatId].autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\nBet Plan: ${user_db[chatId].betPlan.join(' → ')}\nStop Limit: ${user_db[chatId].stopLimit} win(s)\n\n⏳ Next AI signal ကျမှ စထိုးပါမည်။`, mainMenu);
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
                user_db[chatId].currentBetStep = 0;
                bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: 10,30,90");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].stopLimit = num;
                bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s) needed to stop`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "mode") {
            if (text === "1") {
                user_db[chatId].autoMode = "martingale";
                bot.sendMessage(chatId, "✅ **Mode: Martingale** - ရှုံးတိုင်း ဆက်ထိုးမယ်");
            } else if (text === "2") {
                user_db[chatId].autoMode = "trigger";
                bot.sendMessage(chatId, "✅ **Mode: Trigger** - ရှုံး 7 ပွဲပြည့်မှ စထိုးမယ်");
            } else {
                bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ **1** သို့မဟုတ် **2** ရိုက်ထည့်ပါ။");
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
            betPlan: [10, 30, 90, 270, 810, 2430, 7290],
            stopLimit: 1,
            autoMode: "trigger",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            consecutiveLossesAI: 0,
            autoSide: null
        };
        return bot.sendMessage(chatId, "🎯 **SNIPER PRO v2.0** 🎯\n\nအင်္ဂါရပ်များ:\n✅ AI Multi-Brain Signal\n✅ Martingale & Trigger Mode\n✅ Stop Limit System\n✅ Bet History & AI History\n\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
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
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token);
        let list = "📊 **Last 20 Games (Website Result)**\n------------------\n";
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
            data.running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login Success! Sniper Pro Active...", mainMenu);
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
