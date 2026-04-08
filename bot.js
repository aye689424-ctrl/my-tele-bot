const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v81: Stop Limit Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Security & API Helpers ---
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

// --- Multi-Brain AI ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    let b1_side = (resArr[0] === resArr[2]) ? (resArr[1] === "Big" ? "Small" : "Big") : (resArr[0] === "Big" ? "Small" : "Big");
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { 
        if(resArr[i] === resArr[i+1]) dragon++; 
        else break; 
    }
    let b2_side = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");
    let bigs = resArr.slice(0, 10).filter(x => x === "Big").length;
    let b3_side = bigs >= 6 ? "Small" : "Big";
    let votes = { Big: 0, Small: 0 };
    votes[b1_side]++; votes[b2_side]++; votes[b3_side]++;
    let finalSide = votes.Big > votes.Small ? "Big" : "Small";
    let confidence = votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡";
    let patternTxt = (dragon >= 3) ? "Dragon Mode 🐉" : "Brain Voting 🧠";
    return { side: finalSide, dragon: dragon, pattern: patternTxt, confidence: confidence, brainInfo: `B1:${b1_side.charAt(0)}|B2:${b2_side.charAt(0)}|B3:${b3_side.charAt(0)}` };
}

// --- Auto Bet Function ---
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = user_db[chatId];
    if (!data || !data.token) {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: No token.`);
        return false;
    }
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: Cannot get current game.`);
        return false;
    }
    
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
    } else {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: ${res?.message || res?.msg || "Unknown"}`);
        return false;
    }
}

// --- Execute Auto Bet Logic (STOP LIMIT FIXED) ---
async function executeAutoBet(chatId, isWin) {
    const data = user_db[chatId];
    if (!data.autoBetActive) return;
    
    if (isWin) {
        // WIN: Increase consecutive wins count
        data.consecutiveWins++;
        data.consecutiveLosses = 0;
        
        bot.sendMessage(chatId, `✅ Auto Bet WIN! (${data.consecutiveWins}/${data.stopLimit} wins needed to stop)`);
        
        // Check if stop limit reached
        if (data.consecutiveWins >= data.stopLimit) {
            bot.sendMessage(chatId, `🛑 **Stop Limit Reached!** (${data.stopLimit} wins)\nAuto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.consecutiveWins = 0;
            data.currentBetStep = 0;
            return;
        }
        
        // Reset bet step after win (start from step 0 again)
        data.currentBetStep = 0;
        
        // Continue auto betting with step 0 (first amount)
        const nextAmount = data.betPlan[0];
        bot.sendMessage(chatId, `📈 WIN! Continuing auto bet with ${nextAmount} MMK (Step 1/${data.betPlan.length})`);
        const success = await placeAutoBet(chatId, data.autoSide, nextAmount, 0);
        if (!success) {
            data.autoBetActive = false;
            data.autoBetStarted = false;
            bot.sendMessage(chatId, `❌ Auto Bet Stopped due to error.`);
        }
        return;
    }
    
    // LOSS
    data.consecutiveLosses++;
    data.consecutiveWins = 0;
    
    bot.sendMessage(chatId, `❌ Auto Bet LOSS! (Loss streak: ${data.consecutiveLosses})`);
    
    if (data.autoMode === "martingale") {
        // Martingale: bet next step after loss
        const nextStep = data.currentBetStep + 1;
        
        if (nextStep < data.betPlan.length) {
            data.currentBetStep = nextStep;
            const nextAmount = data.betPlan[data.currentBetStep];
            bot.sendMessage(chatId, `📉 LOSS! Next auto bet: ${data.autoSide} | ${nextAmount} MMK (Step ${data.currentBetStep+1}/${data.betPlan.length})`);
            
            const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
            if (!success) {
                data.autoBetActive = false;
                data.autoBetStarted = false;
                bot.sendMessage(chatId, `❌ Auto Bet Stopped due to error.`);
            }
        } else {
            bot.sendMessage(chatId, `❌ Max bet step reached (${data.betPlan.length} steps)! Auto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.currentBetStep = 0;
            data.consecutiveWins = 0;
        }
    }
    else if (data.autoMode === "trigger") {
        // Trigger mode: only start after 7 losses
        if (data.consecutiveLosses >= 7 && !data.autoBetActive && !data.autoBetStarted) {
            data.autoBetActive = true;
            data.autoBetStarted = true;
            data.currentBetStep = 0;
            const firstAmount = data.betPlan[0];
            bot.sendMessage(chatId, `⚠️ 7 Consecutive Losses! Starting Auto Bet: ${data.autoSide} | ${firstAmount} MMK`);
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
                bot.sendMessage(chatId, `📉 LOSS! Next: ${data.autoSide} | ${nextAmount} MMK`);
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
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                }

                // Start Martingale Auto Bet (only if not active and no pending)
                const hasPendingAuto = data.betHistory.some(b => b.status === "⏳ Pending" && b.isAuto);
                if (data.autoMode === "martingale" && data.autoBetActive && !hasPendingAuto && !data.autoBetStarted) {
                    data.autoBetStarted = true;
                    data.currentBetStep = 0;
                    data.consecutiveLosses = 0;
                    data.consecutiveWins = 0;
                    const firstAmount = data.betPlan[0];
                    bot.sendMessage(chatId, `🤖 Starting Martingale: ${ai.side} | ${firstAmount} MMK\nStop Limit: ${data.stopLimit} win(s) to stop`);
                    const success = await placeAutoBet(chatId, ai.side, firstAmount, 0);
                    if (!success) {
                        data.autoBetActive = false;
                        data.autoBetStarted = false;
                    }
                }

                // Send message
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let modeText = data.autoMode === "martingale" ? "Martingale (Loss→Bet)" : "Trigger (7 Loss→Bet)";
                let autoStatus = data.autoBetActive ? "ACTIVE ✅" : "STANDBY ⏳";
                
                let msg = `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${ai.brainInfo}\`\n🛡 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}**\n📊 Confidence: \`${ai.confidence}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n━━━━━━━━━━━━━━━━\n🤖 **Auto Bet Settings**\n📋 Bet Plan: \`${data.betPlan.join(' → ')}\`\n🎯 Mode: ${modeText}\n⚡ Status: ${autoStatus}\n🏆 Stop Limit: ${data.stopLimit} win(s) to stop\n📉 Loss Streak: ${data.consecutiveLosses || 0}\n✅ Win Streak: ${data.consecutiveWins || 0}\n🔢 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}`;
                
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

// --- Menu ---
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
            ["⚠️ Set Loss Limit", "🔄 Select Mode"],
            ["✅ Start Auto Bet", "❌ Stop Auto Bet"],
            ["🔙 Main Menu"]
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
            lossLimit: 7,
            autoMode: "martingale",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
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
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n💔 Loss Limit: \`${data.lossLimit}\` loss(es)\n🔄 Mode: \`${data.autoMode === "martingale" ? "Martingale (Loss→Bet)" : "Trigger (7 Loss→Bet)"}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}\n📉 Current Loss Streak: ${data.consecutiveLosses}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        user_db[chatId].settingMode = "betplan";
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,170,610,1800,3800,6000\n\nသို့မဟုတ်: 10,30,90");
    }
    
    if (text === "🛑 Set Stop Limit") {
        user_db[chatId].settingMode = "stoplimit";
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\nဥပမာ: 1 ဆိုရင် 1 ပွဲအနိုင်ရရင် ရပ်မယ်\n2 ဆိုရင် 2 ပွဲဆက်နိုင်မှ ရပ်မယ်");
    }
    
    if (text === "⚠️ Set Loss Limit") {
        user_db[chatId].settingMode = "losslimit";
        return bot.sendMessage(chatId, "💔 Loss Limit ထည့်ပါ (အရှုံးပွဲအရေအတွက်, e.g., 7):");
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
        bot.sendMessage(chatId, `✅ Auto Bet Started!\n\nMode: ${user_db[chatId].autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\nBet Plan: ${user_db[chatId].betPlan.join(' → ')}\nStop Limit: ${user_db[chatId].stopLimit} win(s) to stop\n\n⏳ Next AI signal ကျမှ စထိုးပါမည်။`, mainMenu);
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
        } else if (mode === "losslimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].lossLimit = num;
                bot.sendMessage(chatId, `✅ Loss Limit updated: ${num} loss(es)`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "mode") {
            if (text === "1") {
                user_db[chatId].autoMode = "martingale";
                user_db[chatId].autoBetActive = false;
                user_db[chatId].autoBetStarted = false;
                bot.sendMessage(chatId, "✅ **Mode changed to: Martingale Mode**\n\nရှုံးတိုင်း Bet Plan အတိုင်း ဆက်ထိုးပါမည်။\n\n✅ Start Auto Bet နှိပ်ပါ။");
            } else if (text === "2") {
                user_db[chatId].autoMode = "trigger";
                user_db[chatId].autoBetActive = false;
                user_db[chatId].autoBetStarted = false;
                bot.sendMessage(chatId, "✅ **Mode changed to: Trigger Mode**\n\nရှုံး 7 ပွဲပြည့်မှ စထိုးပါမည်။\n\n✅ Start Auto Bet နှိပ်ပါ။");
            } else {
                bot.sendMessage(chatId, "❌ **မှားယွင်းနေပါသည်။**\n\nကျေးဇူးပြု၍ **1** (Martingale) သို့မဟုတ် **2** (Trigger Mode) ရိုက်ထည့်ပါ။");
                return;
            }
        }
        user_db[chatId].settingMode = null;
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }

    // Original menu commands
    if (text === '/start') {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [10, 30, 90, 170, 610, 1800, 3800, 6000],
            stopLimit: 1,
            lossLimit: 7,
            autoMode: "martingale",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            autoSide: null
        };
        return bot.sendMessage(chatId, "🤖 **WinGo VIP Master v81.0**\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **နိုင်/ရှုံး အသေးစိတ်မှတ်တမ်း**\n💰 စုစုပေါင်းအမြတ်: **${user_db[chatId].totalProfit.toFixed(2)}** MMK\n------------------\n`;
        user_db[chatId].betHistory.slice(0, 20).forEach(h => { 
            const autoTag = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnlTxt = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${autoTag} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} ${pnlTxt}\n`; 
        });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၅၀ ပွဲ)**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 30).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'Big':'Small'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    // Login flow
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; 
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const username = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ VIP Signal စောင့်ကြည့်နေပါသည်-", mainMenu);
        } else { 
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။"); 
            user_db[chatId].tempPhone = null; 
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
