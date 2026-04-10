const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => { res.end('WinGo Sniper Pro - Auto Start'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// ========== LOCAL JSON FILE STORAGE ==========
const DATA_FILE = path.join(__dirname, 'user_data.json');

function loadAllData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveAllData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

let allUsers = loadAllData();

function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false, totalProfit: 0,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3, lossStartLimit: 1,
            currentBetStep: 0, consecutiveLosses: 0, consecutiveWins: 0,
            last_issue: null, nextIssue: null, last_pred: null, autoSide: null,
            betHistory: [], aiLogs: []
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

function saveUserData(chatId, data) {
    allUsers[chatId] = data;
    saveAllData(allUsers);
}

// ========== SECURITY HELPERS ==========
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

// ========== AI LOGIC (1-2-3 RULE) ==========
function getSideFromNumber(num) {
    return parseInt(num) >= 5 ? "Big" : "Small";
}

function runAI(history) {
    const resArr = history.map(i => getSideFromNumber(i.number));
    let streak = 1;
    let currentSide = resArr[0];
    for(let i = 1; i < resArr.length; i++) {
        if(resArr[i] === currentSide) streak++;
        else break;
    }
    
    let prediction = null;
    if(streak === 1) prediction = currentSide;
    else if(streak === 2) prediction = currentSide;
    else if(streak >= 3) prediction = currentSide === "Big" ? "Small" : "Big";
    
    let finalPrediction = prediction || "Big";
    let calcTxt = `${resArr[2]?.charAt(0) || '?'}-${resArr[1]?.charAt(0) || '?'}-${resArr[0]?.charAt(0) || '?'}`;
    return { side: finalPrediction, dragon: streak, calc: calcTxt };
}

// ========== AUTO BET FUNCTION ==========
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) return false;
    
    const currentIssue = fresh.data.list[0].issueNumber;
    const targetIssue = (BigInt(currentIssue) + 1n).toString();
    
    console.log(`🎯 [AUTO] Betting on ${targetIssue.slice(-5)} | ${side} | ${amount} MMK | Step ${stepIndex+1}`);
    
    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    
    const betPayload = { 
        typeId: 30, 
        issuenumber: targetIssue, 
        gameType: 2, 
        amount: baseUnit, 
        betCount: betCount, 
        selectType: side === "Big" ? 13 : 14, 
        isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const newBet = { 
            issue: targetIssue.slice(-5), 
            side, 
            amount, 
            status: "⏳ Pending", 
            pnl: 0, 
            isAuto: true, 
            autoStep: stepIndex,
            timestamp: new Date().toISOString()
        };
        data.betHistory.unshift(newBet);
        saveUserData(chatId, data);
        
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        await bot.sendMessage(chatId, `📌 **ပွဲစဉ်: ${targetIssue.slice(-5)}**\n🎲 **${sideText}** | ${amount} MMK ထိုးလိုက်ပြီး ✅\n⏳ **အဖြေခနစောင့်ပါ...**`);
        return true;
    } else {
        console.log(`❌ Auto Bet Failed: ${JSON.stringify(res)}`);
        return false;
    }
}

// ========== MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;
            const nextIssue = (BigInt(currentIssue) + 1n).toString();
            
            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;
                let fullMessage = "";
                
                // Check Pending Bets
                let pendingBet = null;
                for (let bet of data.betHistory) {
                    if (bet.status === "⏳ Pending" && bet.issue === currentIssue.slice(-5)) {
                        pendingBet = bet;
                        break;
                    }
                }
                
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    const resultText = realSide === "Big" ? "BIG 🔵" : "SMALL 🔴";
                    
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        roundProfit += pendingBet.pnl;
                        await bot.sendMessage(chatId, `🎉 **အနိုင်ရရှိသည်!** 🎉\n📌 ပွဲစဉ်: ${currentIssue.slice(-5)}\n🎲 ရလဒ်: ${resultText} (${lastRound.number})\n💰 အမြတ်: **+${pendingBet.pnl} MMK**`);
                        
                        data.consecutiveWins++;
                        
                        if (data.consecutiveWins >= data.stopLimit) {
                            await bot.sendMessage(chatId, `🛑 **Stop Limit Reached!** (${data.stopLimit} wins)\nAuto Bet Stopped. Setting ပြန်ချိန်မှ ပြန်အလုပ်လုပ်ပါမည်။`);
                            data.currentBetStep = 0;
                            data.consecutiveWins = 0;
                            data.consecutiveLosses = 0;
                        } else {
                            await bot.sendMessage(chatId, `✅ WIN! (${data.consecutiveWins}/${data.stopLimit}) ဆက်ထိုးမည်။`);
                            const nextAmount = data.betPlan[data.currentBetStep];
                            await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        roundProfit += pendingBet.pnl;
                        await bot.sendMessage(chatId, `💔 **ရှုံးနိမ့်သည်!** 💔\n📌 ပွဲစဉ်: ${currentIssue.slice(-5)}\n🎲 ရလဒ်: ${resultText} (${lastRound.number})\n💰 အရှုံး: **-${pendingBet.amount} MMK**`);
                        
                        data.consecutiveWins = 0;
                        const nextStep = data.currentBetStep + 1;
                        if (nextStep < data.betPlan.length) {
                            data.currentBetStep = nextStep;
                            const nextAmount = data.betPlan[data.currentBetStep];
                            await bot.sendMessage(chatId, `📉 **ဆက်ရှုံး!** နောက်ထိုးမယ်: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | **${nextAmount} MMK** (အဆင့် ${data.currentBetStep+1}/${data.betPlan.length})`);
                            await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                        } else {
                            await bot.sendMessage(chatId, `❌ **Max bet step reached!** Auto Bet Stopped. Setting ပြန်ချိန်မှ ပြန်အလုပ်လုပ်ပါမည်။`);
                            data.currentBetStep = 0;
                            data.consecutiveWins = 0;
                            data.consecutiveLosses = 0;
                        }
                    }
                    data.totalProfit += roundProfit;
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }
                
                // ========== AI LOSS COUNTING (Auto Start when limit reached) ==========
                const aiWasWrong = (data.last_pred && data.last_pred !== realSide);
                
                if (aiWasWrong && !pendingBet) {
                    data.consecutiveLosses++;
                    await bot.sendMessage(chatId, `⚠️ **AI ခန့်မှန်းမှား!** (${data.consecutiveLosses}/${data.lossStartLimit})`);
                    
                    // Auto start betting when loss limit reached
                    if (data.consecutiveLosses >= data.lossStartLimit && data.currentBetStep === 0) {
                        data.currentBetStep = 0;
                        data.consecutiveWins = 0;
                        const firstAmount = data.betPlan[0];
                        await bot.sendMessage(chatId, `⚠️ **AI ${data.consecutiveLosses} ပွဲဆက်မှား!**\n🤖 Auto Bet စတင်ပါပြီ: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | **${firstAmount} MMK**`);
                        await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
                        data.consecutiveLosses = 0;
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                } else if (!aiWasWrong && data.consecutiveLosses > 0) {
                    data.consecutiveLosses = 0;
                    await bot.sendMessage(chatId, `✅ **AI ခန့်မှန်းမှန်!** Loss streak reset.`);
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }
                
                // VIP REPORT
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    const resultText = realSide === "Big" ? "Big" : "Small";
                    
                    fullMessage += `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${currentIssue}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${resultText}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${roundProfit >= 0 ? "+" : ""}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    
                    const newLog = { 
                        status: isWin ? "✅" : "❌", 
                        issue: currentIssue.slice(-3), 
                        result: realSide, 
                        prediction: data.last_pred,
                        timestamp: new Date().toISOString()
                    };
                    data.aiLogs.unshift(newLog);
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    saveUserData(chatId, data);
                    
                    fullMessage += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => {
                        fullMessage += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result === "Big" ? "Big" : "Small"}\n`;
                    });
                    fullMessage += `\n`;
                }
                
                // AI NEW SIGNAL
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.nextIssue = nextIssue;
                data.last_pred = ai.side;
                data.autoSide = ai.side;
                saveUserData(chatId, data);
                
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const sideText = ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)";
                const betStatus = (data.currentBetStep > 0) ? "BETTING 🎲" : "MONITORING 📊";
                
                fullMessage += `🚀 **AI Analysis (1-2-3 Rule)**\n━━━━━━━━━━━━━━━━\n📚တွက်ချက်ပုံစံ: \`${ai.calc}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း: **${sideText}**\n🕒 ပွဲစဉ်: \`${nextIssue.slice(-5)}\` (${mmTime})\n━━━━━━━━━━━━━━━━\n⚙️ **Auto Settings**\n📋 Bet Plan: ${data.betPlan.join(' → ')}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n⚠️ Loss Start: ${data.lossStartLimit} AI loss(es)\n📊 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}\n✅ Win Count: ${data.consecutiveWins}/${data.stopLimit}\n🤖 Status: ${betStatus}`;
                
                await bot.sendMessage(chatId, fullMessage, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                        { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                    ]]}
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// ========== MENUS ==========
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
            ["⚠️ Set Loss Start", "🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// ========== HANDLERS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);
    
    // Manual bet amount input
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const currentIssue = fresh?.data?.list[0]?.issueNumber;
        const nextIssue = currentIssue ? (BigInt(currentIssue) + 1n).toString() : data.nextIssue;
        
        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
        if (baseUnit < 10) baseUnit = 10;
        const betPayload = { typeId: 30, issuenumber: nextIssue, gameType: 2, amount: Math.floor(baseUnit), betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, data.token);
        if (res?.msgCode === 0 || res?.msg === "Bet success") {
            const sideText = data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴";
            await bot.sendMessage(chatId, `📌 **ပွဲစဉ်: ${nextIssue.slice(-5)}**\n🎲 **${sideText}** | ${amount} MMK ထိုးလိုက်ပြီး ✅\n⏳ **အဖြေခနစောင့်ပါ...**`);
            const newBet = { issue: nextIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false, timestamp: new Date().toISOString() };
            data.betHistory.unshift(newBet);
            saveUserData(chatId, data);
        } else { 
            await bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); 
        }
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }
    
    // Settings commands
    if (text === "⚙️ Settings") {
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n⚠️ Loss Start: \`${data.lossStartLimit}\` AI loss(es)\n📊 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}\n✅ Win Count: ${data.consecutiveWins}/${data.stopLimit}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,60,90,150,250,400,650");
    }
    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\nဥပမာ: 3 (3 ပွဲနိုင်မှ ရပ်)");
    }
    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚠️ Loss Start Limit ထည့်ပါ (AI ခန့်မှန်းချက် ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ)\n\nဥပမာ: 1 (1 ပွဲမှားမှ စထိုး)");
    }
    if (text === "🔙 Main Menu") {
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }
    
    // Handle settings input
    if (data.settingMode) {
        const mode = data.settingMode;
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
                data.consecutiveWins = 0;
                data.consecutiveLosses = 0;
                await bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid format.");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                await bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s)`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start Limit updated: ${num} AI loss(es) to start betting`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number (1-10).");
            }
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Settings updated! Auto Bet will work automatically.", settingsMenu);
    }
    
    // Main menu commands
    if (text === '/start') {
        data.running = false;
        data.token = null;
        data.phone = null;
        data.totalProfit = 0;
        data.betHistory = [];
        data.aiLogs = [];
        data.currentBetStep = 0;
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 **WinGo Sniper Pro v3.0** 🎯\n\nအင်္ဂါရပ်များ:\n✅ 1-2-3 Rule AI\n✅ Loss Start (AI သတ်မှတ်အကြိမ်မှားမှ စထိုး)\n✅ Stop Limit (အနိုင်ပွဲပြည့်ရင်ရပ်)\n✅ Bet Plan အဆင့်လိုက်ထိုး\n✅ Local File ဖြင့် မှတ်တမ်းအမြဲတမ်းသိမ်း\n✅ Setting ချိန်ပြီးတာနဲ့ အလိုအလျောက်အလုပ်လုပ်\n\n⚙️ **အရင်ဆုံး Setting ချိန်ပါ:**\n1. 🎲 Set Bet Plan\n2. 🛑 Set Stop Limit\n3. ⚠️ Set Loss Start\n\n✅ **ပြီးရင် Auto သည် အလိုအလျောက် အလုပ်လုပ်ပါမည်။**\n\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
    }
    if (text === "📜 Bet History") {
        let txt = `📜 **Bet History**\n💰 Total: **${data.totalProfit.toFixed(2)}** MMK\n------------------\n`;
        data.betHistory.slice(0, 20).forEach(h => { 
            const autoTag = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnlTxt = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${autoTag} | ${h.issue} | ${h.side} | ${h.amount} ${pnlTxt}\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }
    if (text === "📈 AI History") {
        let txt = "📈 **AI Prediction History (30 games)**\n------------------\n";
        data.aiLogs.slice(0, 30).forEach(l => { 
            txt += `${l.status} | ${l.issue} | Pred: ${l.prediction === "Big" ? "BIG" : "SMALL"} | Result: ${l.result === "Big" ? "BIG" : "SMALL"}\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }
    if (text === "📊 Website (100)") {
        if (!data.token) return bot.sendMessage(chatId, "❌ Please login first!");
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token);
        let list = "📊 **Last 20 Games**\n------------------\n";
        res?.data?.list?.forEach(i => { 
            list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5 ? 'BIG 🔵' : 'SMALL 🔴'})\n`; 
        });
        return bot.sendMessage(chatId, list);
    }
    if (text === "🚪 Logout") {
        data.running = false;
        data.token = null;
        data.phone = null;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }
    
    // Login flow
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.phone = data.tempPhone;
            data.running = true;
            delete data.tempPhone;
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ **Login Success!**\n\n⚙️ Setting ချိန်ပြီးတာနဲ့ Auto သည် အလိုအလျောက် အလုပ်လုပ်ပါမည်။", mainMenu);
        } else { 
            await bot.sendMessage(chatId, "❌ Login Failed!"); 
            delete data.tempPhone;
            saveUserData(chatId, data);
        }
        return;
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = getUserData(chatId);
    data.pendingSide = query.data.split('_')[1];
    saveUserData(chatId, data);
    await bot.sendMessage(chatId, `💰 **${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

console.log("✅ Bot is running - Auto Start Mode");
