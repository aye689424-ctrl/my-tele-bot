const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const PORT = process.env.PORT || 8080;
const APP_URL = process.env.APP_URL || 'https://my-tele-bot-1-ptlu.onrender.com';

// ========== EXTRA BOT ==========
const EXTRA_BOT_TOKEN = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const EXTRA_BOT_CHAT_ID = '6545674873';
const extraBot = new TelegramBot(EXTRA_BOT_TOKEN, { polling: false });

const bot = new TelegramBot(token);

bot.setWebHook(`${APP_URL}/bot${token}`).then(() => {
    console.log(`✅ Webhook set`);
}).catch(e => console.error('Webhook error:', e.message));

// ========== DATA ==========
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
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3,
            lossStartLimit: 1,
            totalProfit: 0,
            currentSessionWins: 0,
            totalWinsAllTime: 0,
            currentBetStep: 0,
            consecutiveLosses: 0,
            last_issue: null,
            last_pred: null,
            manualBetLock: false,
            betHistory: [],
            aiLogs: [],
            settingMode: null,
            maxLossStreak: 0
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

function saveUserData(chatId, data) {
    allUsers[chatId] = data;
    saveAllData(allUsers);
}

// ========== SEND TO EXTRA BOT ==========
async function sendToExtraBot(chatId, userData, betDetail) {
    try {
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });
        let msg = `📊 *WinGo Pro - ထိုးပွဲအစီရင်ခံစာ*\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🕐 *အချိန်:* ${now}\n`;
        msg += `🎲 *ပွဲစဉ်:* ${betDetail.issue}\n`;
        msg += `🎯 *ထိုးဘက်:* ${betDetail.side === "Big" ? "🔵 BIG (ကြီး)" : "🔴 SMALL (သေး)"}\n`;
        msg += `💵 *ထိုးငွေ:* ${betDetail.amount} MMK\n`;
        msg += `📊 *ပွဲထွက်:* ${betDetail.resultNumber} (${betDetail.resultSide})\n`;
        msg += `💰 *အမြတ်/အရှုံး:* ${betDetail.pnl >= 0 ? `+${betDetail.pnl}` : betDetail.pnl} MMK\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💰 *စုစုပေါင်းအမြတ်:* ${userData.totalProfit?.toFixed(2) || 0} MMK\n`;
        msg += `🏆 *စုစုပေါင်းနိုင်ပွဲ:* ${userData.totalWinsAllTime || 0}\n`;
        await extraBot.sendMessage(EXTRA_BOT_CHAT_ID, msg, { parse_mode: "Markdown" });
    } catch(e) {}
}

// ========== API HELPERS ==========
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
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 8000 });
        return res.data;
    } catch (e) {
        return null;
    }
}

function getSideFromNumber(num) {
    return parseInt(num) >= 5 ? "Big" : "Small";
}

function runAI(history) {
    const sides = history.map(i => getSideFromNumber(i.number));
    let streak = 1;
    for(let i = 1; i < sides.length; i++) {
        if(sides[i] === sides[0]) streak++;
        else break;
    }
    let prediction = sides[0];
    if(streak >= 3) prediction = sides[0] === "Big" ? "Small" : "Big";
    return { side: prediction, streak };
}

async function getNextIssue(chatId, token) {
    try {
        const res = await callApi("GetGameIssue", { typeId: 30 }, token);
        if (res?.msgCode === 0 && res.data?.issueNumber) {
            return (BigInt(res.data.issueNumber) + 1n).toString();
        }
    } catch(e) {}
    const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, token);
    if (historyRes?.data?.list?.length > 0) {
        return (BigInt(historyRes.data.list[0].issueNumber) + 1n).toString();
    }
    return null;
}

async function placeBetNow(chatId, side, amount, targetIssue, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data?.token) return false;
    
    const existingBet = data.betHistory.find(b => b.issue === targetIssue.slice(-5));
    if (existingBet) return false;
    
    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    const selectType = side === "Big" ? 13 : 14;
    
    const betPayload = {
        typeId: 30, issuenumber: targetIssue, gameType: 2,
        amount: baseUnit, betCount: betCount, selectType: selectType, isAgree: true
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        data.betHistory.unshift({
            issue: targetIssue.slice(-5),
            side, amount, status: "⏳ Pending", pnl: 0,
            isAuto, reason: betReason, timestamp: new Date().toISOString()
        });
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ ${targetIssue.slice(-5)} | ${side === "Big" ? "🔵 BIG" : "🔴 SMALL"} | ${amount} MMK ထိုးပြီး!`);
        return true;
    } else {
        await bot.sendMessage(chatId, `❌ ထိုးမအောင်မြင်ပါ: ${res?.msg || 'Unknown'}`);
        return false;
    }
}

async function syncBetHistoryFromAPI(chatId) {
    const data = getUserData(chatId);
    if (!data?.token) return;
    
    const res = await callApi("GetMyEmerdList", { typeId: 30, pageNo: 1, pageSize: 30 }, data.token);
    if (res?.msgCode === 0 && res.data?.list) {
        res.data.list.forEach(apiBet => {
            const issueShort = apiBet.issueNumber.slice(-5);
            const existingBet = data.betHistory.find(b => b.issue === issueShort);
            if (existingBet && existingBet.status === "⏳ Pending") {
                if (apiBet.state === "1") {
                    existingBet.status = "✅ WIN";
                    existingBet.pnl = apiBet.profitAmount;
                    data.totalProfit += existingBet.pnl;
                    data.totalWinsAllTime++;
                    if (existingBet.isAuto) data.currentSessionWins++;
                } else if (apiBet.state === "2") {
                    existingBet.status = "❌ LOSS";
                    existingBet.pnl = -existingBet.amount;
                    data.totalProfit += existingBet.pnl;
                    if (existingBet.isAuto) data.currentBetStep++;
                }
                saveUserData(chatId, data);
            }
        });
    }
}

async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;
        
        await syncBetHistoryFromAPI(chatId);
        data = getUserData(chatId);
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 5, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;
            const realSide = getSideFromNumber(lastRound.number);
            const realNumber = lastRound.number;
            const nextIssue = (BigInt(currentIssue) + 1n).toString();
            
            if (currentIssue !== data.last_issue) {
                // Check pending bet result
                const pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                if (pendingBet) {
                    const isWin = (pendingBet.side === realSide);
                    let pnlAmount = 0;
                    
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        pnlAmount = pendingBet.pnl;
                        data.totalProfit += pnlAmount;
                        data.totalWinsAllTime++;
                        if (pendingBet.isAuto) data.currentSessionWins++;
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        pnlAmount = pendingBet.pnl;
                        data.totalProfit += pnlAmount;
                        if (pendingBet.isAuto) data.currentBetStep++;
                    }
                    saveUserData(chatId, data);
                    
                    // Send to extra bot
                    await sendToExtraBot(chatId, data, {
                        issue: pendingBet.issue,
                        side: pendingBet.side,
                        amount: pendingBet.amount,
                        resultNumber: realNumber,
                        resultSide: realSide,
                        pnl: pnlAmount
                    });
                    
                    // Check stop limit
                    if (pendingBet.isAuto && data.currentSessionWins >= data.stopLimit) {
                        await bot.sendMessage(chatId, `🛑 Stop Limit ပြည့်ပြီ။ Auto ရပ်မည်။`);
                        data.autoRunning = false;
                        data.autoMode = null;
                        data.currentSessionWins = 0;
                        data.currentBetStep = 0;
                        saveUserData(chatId, data);
                    }
                }
                
                // AI prediction
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                
                // AI logs
                data.aiLogs.unshift({
                    status: (ai.side === realSide) ? "✅" : "❌",
                    issue: currentIssue.slice(-5),
                    result: realSide, prediction: ai.side, number: realNumber
                });
                if (data.aiLogs.length > 100) data.aiLogs.pop();
                
                // AI Correction loss tracking
                if (data.autoMode === 'ai_correction') {
                    if (ai.side !== realSide) {
                        data.consecutiveLosses++;
                    } else {
                        data.consecutiveLosses = 0;
                    }
                }
                saveUserData(chatId, data);
                
                // Auto bet
                if (data.autoRunning && data.autoMode === 'follow') {
                    const betAmount = data.betPlan[data.currentBetStep] || data.betPlan[data.betPlan.length-1];
                    setTimeout(async () => {
                        await placeBetNow(chatId, realSide, betAmount, nextIssue, true, `🔄 Follow - ${realSide}`);
                    }, 3000);
                } else if (data.autoRunning && data.autoMode === 'ai_correction' && data.consecutiveLosses >= data.lossStartLimit) {
                    const betAmount = data.betPlan[data.currentBetStep] || data.betPlan[data.betPlan.length-1];
                    setTimeout(async () => {
                        await placeBetNow(chatId, data.last_pred, betAmount, nextIssue, true, `🤖 AI Correction - ${data.consecutiveLosses} ပွဲဆက်မှား`);
                    }, 3000);
                }
                
                // Send status to user
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let statusMsg = `💥 BIGWIN SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `📌 ${currentIssue.slice(-5)} | ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI: ${data.last_pred}\n`;
                statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `🎯 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                statusMsg += `━━━━━━━━━━━━━━━━`;
                
                await bot.sendMessage(chatId, statusMsg, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big", callback_data: "bet_Big" },
                        { text: "🔴 Small", callback_data: "bet_Small" }
                    ]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 500));
    }
}

// ========== MENUS ==========
const mainMenu = {
    reply_markup: {
        keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["⚙️ Settings", "📊 Status"], ["📜 Bet History", "📈 AI History"], ["🚪 Logout"]],
        resize_keyboard: true
    }
};

const autoModeMenu = {
    reply_markup: {
        keyboard: [["🔄 Follow"], ["🤖 AI Correction"], ["🔙 Main Menu"]],
        resize_keyboard: true
    }
};

const settingsMenu = {
    reply_markup: {
        keyboard: [["🎲 Bet Plan", "🛑 Stop Limit"], ["⚠️ Loss Start", "🔙 Main Menu"]],
        resize_keyboard: true
    }
};

// ========== MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);
    
    // Settings mode
    if (data.settingMode) {
        if (data.settingMode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
                await bot.sendMessage(chatId, `✅ Bet Plan: ${numbers.join(' → ')}`);
            }
        } else if (data.settingMode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                await bot.sendMessage(chatId, `✅ Stop Limit: ${num}`);
            }
        } else if (data.settingMode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start: ${num} ပွဲဆက်မှားမှ စထိုး`);
            }
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚙️ Settings", settingsMenu);
    }
    
    // Manual bet amount input
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const nextIssue = await getNextIssue(chatId, data.token);
        if (nextIssue) {
            await placeBetNow(chatId, data.pendingSide, amount, nextIssue, false, "ကိုယ်တိုင်ထိုး");
        } else {
            await bot.sendMessage(chatId, "❌ ပွဲစဉ်မရပါ");
        }
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }
    
    // Commands
    if (text === '/start') {
        data.running = false; data.token = null; data.autoRunning = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo Pro\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }
    
    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးပါ:", autoModeMenu);
    }
    
    if (text === "🔄 Follow") {
        data.autoRunning = true; data.autoMode = 'follow';
        data.currentSessionWins = 0; data.currentBetStep = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Follow Mode Started! Stop: ${data.stopLimit}`, mainMenu);
    }
    
    if (text === "🤖 AI Correction") {
        data.autoRunning = true; data.autoMode = 'ai_correction';
        data.currentSessionWins = 0; data.currentBetStep = 0; data.consecutiveLosses = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ AI Correction Started! Loss: ${data.lossStartLimit}`, mainMenu);
    }
    
    if (text === "🛑 Stop Auto") {
        data.autoRunning = false; data.autoMode = null;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Stopped!", mainMenu);
    }
    
    if (text === "⚙️ Settings") {
        return bot.sendMessage(chatId, "⚙️ Settings", settingsMenu);
    }
    
    if (text === "🎲 Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `📝 Bet Plan ထည့်ပါ\nလက်ရှိ: ${data.betPlan.join(' → ')}`);
    }
    
    if (text === "🛑 Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `🏆 Stop Limit ထည့်ပါ\nလက်ရှိ: ${data.stopLimit}`);
    }
    
    if (text === "⚠️ Loss Start") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `⚠️ Loss Start Limit (1-10)\nလက်ရှိ: ${data.lossStartLimit}`);
    }
    
    if (text === "🔙 Main Menu") {
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }
    
    if (text === "📊 Status") {
        let status = `📊 Status\n━━━━━━━━━━━━━━━━\n`;
        status += `🤖 Mode: ${data.autoRunning ? data.autoMode : "Manual"}\n`;
        status += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
        status += `🏆 Wins: ${data.totalWinsAllTime}\n`;
        status += `📋 Plan: ${data.betPlan.join(' → ')}\n`;
        status += `🎯 Step: ${data.currentBetStep+1}/${data.betPlan.length}\n`;
        status += `🏆 Session: ${data.currentSessionWins}/${data.stopLimit}`;
        return bot.sendMessage(chatId, status);
    }
    
    if (text === "📜 Bet History") {
        let txt = `📜 Bet History\n💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n━━━━━━━━━━━━━━━━\n`;
        if (data.betHistory.length === 0) {
            txt += "မရှိသေးပါ";
        } else {
            data.betHistory.slice(0, 15).forEach(h => {
                txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount} MMK\n`;
            });
        }
        return bot.sendMessage(chatId, txt);
    }
    
    if (text === "📈 AI History") {
        if (!data.aiLogs || data.aiLogs.length === 0) {
            return bot.sendMessage(chatId, "AI မှတ်တမ်းမရှိသေးပါ");
        }
        const wins = data.aiLogs.filter(l => l.status === "✅").length;
        let txt = `📈 AI History\n━━━━━━━━━━━━━━━━\n`;
        txt += `📊 ${wins}/${data.aiLogs.length} (${((wins/data.aiLogs.length)*100).toFixed(1)}%)\n`;
        data.aiLogs.slice(0, 20).forEach(log => {
            txt += `${log.status} ${log.issue} | ${log.prediction}→${log.result}\n`;
        });
        return bot.sendMessage(chatId, txt);
    }
    
    if (text === "🚪 Logout") {
        data.running = false; data.token = null; data.autoRunning = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. /start နဲ့ပြန်ဝင်ပါ။");
    }
    
    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true;
            delete data.tempPhone;
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ Login Success!", mainMenu);
        } else {
            await bot.sendMessage(chatId, "❌ Login Failed!");
            delete data.tempPhone;
            saveUserData(chatId, data);
        }
        return;
    }
});

// ========== CALLBACK ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const action = query.data;
    const data = getUserData(chatId);
    
    if (action === 'bet_Big') {
        data.pendingSide = "Big";
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 BIG အတွက် ပမာဏ ရိုက်ထည့်ပါ:`);
    }
    if (action === 'bet_Small') {
        data.pendingSide = "Small";
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 SMALL အတွက် ပမာဏ ရိုက်ထည့်ပါ:`);
    }
});

// ========== SERVER ==========
http.createServer((req, res) => {
    if (req.url === `/bot${token}` && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { bot.processUpdate(JSON.parse(body)); res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
            catch (e) { res.writeHead(400); res.end(); }
        });
    } else { res.writeHead(200); res.end('WinGo Pro'); }
}).listen(PORT, () => console.log(`✅ Server running`));

console.log("✅ Bot ready");
