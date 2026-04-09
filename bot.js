const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

http.createServer((req, res) => { res.end('WinGo Sniper Pro - Fixed Current Issue'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

const dbPath = path.join(__dirname, 'user_data.db');
const db = new sqlite3.Database(dbPath);

// Database Setup
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        chat_id TEXT PRIMARY KEY,
        token TEXT,
        phone TEXT,
        running INTEGER DEFAULT 0,
        total_profit REAL DEFAULT 0,
        bet_plan TEXT DEFAULT '10,30,90,270,810,2430,7290',
        stop_limit INTEGER DEFAULT 2,
        loss_limit_start INTEGER DEFAULT 2,
        auto_bet_active INTEGER DEFAULT 0,
        auto_bet_started INTEGER DEFAULT 0,
        current_bet_step INTEGER DEFAULT 0,
        consecutive_losses INTEGER DEFAULT 0,
        consecutive_wins INTEGER DEFAULT 0,
        last_issue TEXT,
        next_issue TEXT,
        last_pred TEXT,
        auto_side TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS bet_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        issue TEXT,
        side TEXT,
        amount INTEGER,
        status TEXT,
        pnl REAL,
        is_auto INTEGER,
        auto_step INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        status TEXT,
        issue TEXT,
        result TEXT,
        prediction TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Database Helpers
function getUserData(chatId, callback) {
    db.get(`SELECT * FROM users WHERE chat_id = ?`, [chatId], (err, row) => {
        if (err || !row) {
            const defaultData = {
                chat_id: chatId, token: null, phone: null, running: 0, total_profit: 0,
                bet_plan: '10,30,90,270,810,2430,7290', stop_limit: 2,
                loss_limit_start: 2, auto_bet_active: 0, auto_bet_started: 0,
                current_bet_step: 0, consecutive_losses: 0, consecutive_wins: 0,
                last_issue: null, next_issue: null, last_pred: null, auto_side: null
            };
            db.run(`INSERT INTO users (chat_id, running, total_profit, bet_plan, stop_limit, loss_limit_start) VALUES (?, ?, ?, ?, ?, ?)`,
                [chatId, 0, 0, defaultData.bet_plan, 2, 2]);
            callback(defaultData);
        } else {
            callback(row);
        }
    });
}

function saveUserData(chatId, data) {
    db.run(`UPDATE users SET 
        token = ?, phone = ?, running = ?, total_profit = ?, bet_plan = ?, stop_limit = ?, 
        loss_limit_start = ?, auto_bet_active = ?, auto_bet_started = ?, 
        current_bet_step = ?, consecutive_losses = ?, consecutive_wins = ?,
        last_issue = ?, next_issue = ?, last_pred = ?, auto_side = ?
        WHERE chat_id = ?`,
        [data.token, data.phone, data.running ? 1 : 0, data.totalProfit || 0,
         data.betPlan ? data.betPlan.join(',') : '10,30,90,270,810,2430,7290',
         data.stopLimit || 2, data.lossLimitStart || 2,
         data.autoBetActive ? 1 : 0, data.autoBetStarted ? 1 : 0,
         data.currentBetStep || 0, data.consecutiveLosses || 0, data.consecutiveWins || 0,
         data.last_issue, data.nextIssue, data.last_pred, data.autoSide, chatId]);
}

function loadBetHistory(chatId, callback) {
    db.all(`SELECT * FROM bet_history WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 50`, [chatId], (err, rows) => {
        callback(rows || []);
    });
}

function saveBetHistory(chatId, bet) {
    db.run(`INSERT INTO bet_history (chat_id, issue, side, amount, status, pnl, is_auto, auto_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [chatId, bet.issue, bet.side, bet.amount, bet.status, bet.pnl || 0, bet.isAuto ? 1 : 0, bet.autoStep || 0]);
}

function loadAILogs(chatId, callback) {
    db.all(`SELECT * FROM ai_logs WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 50`, [chatId], (err, rows) => {
        callback(rows || []);
    });
}

function saveAILog(chatId, log) {
    db.run(`INSERT INTO ai_logs (chat_id, status, issue, result, prediction) VALUES (?, ?, ?, ?, ?)`,
        [chatId, log.status, log.issue, log.result, log.prediction]);
}

let user_cache = {};

async function getCachedUser(chatId) {
    return new Promise((resolve) => {
        if (user_cache[chatId]) {
            resolve(user_cache[chatId]);
        } else {
            getUserData(chatId, (dbData) => {
                user_cache[chatId] = {
                    running: dbData.running === 1,
                    token: dbData.token,
                    phone: dbData.phone,
                    totalProfit: dbData.total_profit || 0,
                    betPlan: dbData.bet_plan ? dbData.bet_plan.split(',').map(Number) : [10,30,90,270,810,2430,7290],
                    stopLimit: dbData.stop_limit || 2,
                    lossLimitStart: dbData.loss_limit_start || 2,
                    autoBetActive: dbData.auto_bet_active === 1,
                    autoBetStarted: dbData.auto_bet_started === 1,
                    currentBetStep: dbData.current_bet_step || 0,
                    consecutiveLosses: dbData.consecutive_losses || 0,
                    consecutiveWins: dbData.consecutive_wins || 0,
                    last_issue: dbData.last_issue,
                    nextIssue: dbData.next_issue,
                    last_pred: dbData.last_pred,
                    autoSide: dbData.auto_side,
                    aiLogs: [],
                    betHistory: []
                };
                loadBetHistory(chatId, (bets) => {
                    user_cache[chatId].betHistory = bets;
                    loadAILogs(chatId, (logs) => {
                        user_cache[chatId].aiLogs = logs;
                        resolve(user_cache[chatId]);
                    });
                });
            });
        }
    });
}

async function updateCachedUser(chatId, updates) {
    const user = await getCachedUser(chatId);
    Object.assign(user, updates);
    user_cache[chatId] = user;
    saveUserData(chatId, user);
    return user;
}

// Security Helpers
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

// AI Logic
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
    let alternationCount = 0;
    for(let i = 1; i < Math.min(10, resArr.length); i++) {
        if(resArr[i] !== resArr[i-1]) alternationCount++;
    }
    let isAlternating = alternationCount >= 7;
    const last20 = resArr.slice(0, 20);
    const bigCount = last20.filter(x => x === "Big").length;
    const smallCount = 20 - bigCount;
    
    let prediction = null;
    if(streak === 1) prediction = currentSide;
    else if(streak === 2) prediction = currentSide;
    else if(streak === 3) prediction = currentSide === "Big" ? "Small" : "Big";
    else if(streak >= 4) prediction = currentSide === "Big" ? "Small" : "Big";
    if(isAlternating && alternationCount >= 8) prediction = resArr[0] === "Big" ? "Small" : "Big";
    if(bigCount >= 13) prediction = "Small";
    else if(smallCount >= 13) prediction = "Big";
    
    let finalPrediction = prediction || "Big";
    let patternTxt = (streak >= 3) ? "Dragon Mode 🐉" : (isAlternating ? "Alternating 🔄" : "Brain Voting 🧠");
    let calcTxt = `${resArr[2]?.charAt(0) || '?'}-${resArr[1]?.charAt(0) || '?'}-${resArr[0]?.charAt(0) || '?'}`;
    let confidence = (streak >= 4) ? "HIGH 🔥" : (streak >= 3 ? "HIGH 🔥" : "NORMAL ⚡");
    
    return { side: finalPrediction, dragon: streak, calc: calcTxt, pattern: patternTxt, confidence: confidence };
}

// ========== FIXED AUTO BET FUNCTION ==========
async function placeAutoBet(chatId, side, amount, stepIndex, targetIssue) {
    const data = await getCachedUser(chatId);
    if (!data || !data.token) return false;
    
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
            autoStep: stepIndex 
        };
        saveBetHistory(chatId, newBet);
        
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        await bot.sendMessage(chatId, `📌 **ပွဲစဉ်: ${targetIssue.slice(-5)}**\n🎲 **${sideText}** | ${amount} MMK ထိုးလိုက်ပြီး ✅\n⏳ **အဖြေခနစောင့်ပါ...**`);
        return true;
    }
    return false;
}

// Monitoring Loop
async function monitoringLoop(chatId) {
    while (true) {
        let data = await getCachedUser(chatId);
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
                
                // Check Pending Bets for THIS round
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
                        
                        // WIN: Reset everything
                        data.consecutiveLosses = 0;
                        data.consecutiveWins++;
                        data.autoBetActive = false;
                        data.autoBetStarted = false;
                        data.currentBetStep = 0;
                        
                        if (data.consecutiveWins >= data.stopLimit) {
                            await bot.sendMessage(chatId, `🛑 **Stop Limit Reached!** (${data.stopLimit} wins)\n✅ Start Auto Bet ပြန်နှိပ်မှ ပြန်ထိုးပါမည်။`);
                        } else {
                            await bot.sendMessage(chatId, `✅ **Auto Bet WIN! Stopped.**\n✅ Start Auto Bet ပြန်နှိပ်မှ ပြန်ထိုးပါမည်။`);
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        roundProfit += pendingBet.pnl;
                        await bot.sendMessage(chatId, `💔 **ရှုံးနိမ့်သည်!** 💔\n📌 ပွဲစဉ်: ${currentIssue.slice(-5)}\n🎲 ရလဒ်: ${resultText} (${lastRound.number})\n💰 အရှုံး: **-${pendingBet.amount} MMK**`);
                        
                        // LOSS: Continue to next step
                        if (pendingBet.isAuto && data.autoBetActive) {
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) {
                                data.currentBetStep = nextStep;
                                const nextAmount = data.betPlan[data.currentBetStep];
                                await bot.sendMessage(chatId, `📉 **ဆက်ရှုံး!** နောက်ထိုးမယ်: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | **${nextAmount} MMK** (အဆင့် ${data.currentBetStep+1}/${data.betPlan.length})`);
                                await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep, nextIssue);
                            } else {
                                await bot.sendMessage(chatId, `❌ **Max bet step reached!** Auto Bet Stopped.`);
                                data.autoBetActive = false;
                                data.autoBetStarted = false;
                                data.currentBetStep = 0;
                            }
                        }
                    }
                    data.totalProfit += roundProfit;
                    await updateCachedUser(chatId, data);
                    data = await getCachedUser(chatId);
                }
                
                // ========== AI LOSS COUNTING ==========
                const aiWasWrong = (data.last_pred && data.last_pred !== realSide);
                
                if (aiWasWrong && !pendingBet?.isAuto && data.autoBetActive) {
                    data.consecutiveLosses++;
                    data.consecutiveWins = 0;
                    await bot.sendMessage(chatId, `⚠️ **AI ခန့်မှန်းမှား!** (${data.consecutiveLosses}/${data.lossLimitStart})`);
                    
                    if (data.consecutiveLosses >= data.lossLimitStart && data.currentBetStep === 0 && !pendingBet) {
                        data.currentBetStep = 0;
                        const firstAmount = data.betPlan[0];
                        await bot.sendMessage(chatId, `⚠️ **AI ${data.consecutiveLosses} ပွဲဆက်မှား!**\n🤖 Auto Bet စတင်ပါပြီ: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | **${firstAmount} MMK**`);
                        await placeAutoBet(chatId, data.autoSide, firstAmount, 0, nextIssue);
                    }
                    await updateCachedUser(chatId, data);
                    data = await getCachedUser(chatId);
                } else if (!aiWasWrong && data.last_pred && data.consecutiveLosses > 0 && data.autoBetActive) {
                    data.consecutiveLosses = 0;
                    await bot.sendMessage(chatId, `✅ **AI ခန့်မှန်းမှန်!** Loss streak reset.`);
                    await updateCachedUser(chatId, data);
                    data = await getCachedUser(chatId);
                }
                
                // VIP Report
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    const resultText = realSide === "Big" ? "Big" : "Small";
                    
                    fullMessage += `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${currentIssue}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${resultText}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${roundProfit >= 0 ? "+" : ""}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    
                    saveAILog(chatId, { status: isWin ? "✅" : "❌", issue: currentIssue.slice(-3), result: realSide, prediction: data.last_pred });
                    data.aiLogs = await new Promise(resolve => loadAILogs(chatId, resolve));
                    
                    fullMessage += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => {
                        fullMessage += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result === "Big" ? "Big" : "Small"}\n`;
                    });
                    fullMessage += `\n`;
                }
                
                // AI New Signal for NEXT issue
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.nextIssue = nextIssue;
                data.last_pred = ai.side;
                data.autoSide = ai.side;
                
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const brainInfo = `B1:${ai.side.charAt(0)}|B2:${ai.side.charAt(0)}|B3:${ai.side === "Big" ? "S" : "B"}`;
                const sideText = ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)";
                
                const statusText = data.autoBetActive ? (data.currentBetStep > 0 ? "BETTING 🎲" : "MONITORING 📊") : "STOPPED ⏹️";
                
                fullMessage += `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${brainInfo}\`\n🛡 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း: **${sideText}**\n📊 Confidence: \`${ai.confidence}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${nextIssue.slice(-5)}\`\n━━━━━━━━━━━━━━━━\n⚙️ **Auto Settings**\n📋 Bet Plan: ${data.betPlan.join(' → ')}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n⚠️ Loss Start: ${data.lossLimitStart} AI loss(es)\n📉 AI Loss Streak: ${data.consecutiveLosses}/${data.lossLimitStart}\n🤖 Status: ${statusText}`;
                
                await bot.sendMessage(chatId, fullMessage, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                        { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                    ]]}
                });
                
                await updateCachedUser(chatId, data);
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// Menus
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
            ["⚠️ Set Loss Start", "✅ Start Auto Bet"],
            ["❌ Stop Auto Bet", "🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// Handlers
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = await getCachedUser(chatId);
    
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
            const newBet = { issue: nextIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false };
            saveBetHistory(chatId, newBet);
            data.betHistory.unshift(newBet);
        } else { 
            await bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); 
        }
        data.pendingSide = null;
        await updateCachedUser(chatId, data);
        return;
    }
    
    // Settings commands
    if (text === "⚙️ Settings") {
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n⚠️ Loss Start: \`${data.lossLimitStart}\` AI loss(es)\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ⏹️"}\n📉 AI Loss Streak: ${data.consecutiveLosses}/${data.lossLimitStart}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,270,810,2430,7290");
    }
    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\n1 = 1 ပွဲအနိုင်ရရင် ရပ်\n2 = 2 ပွဲဆက်နိုင်မှ ရပ်");
    }
    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "⚠️ Loss Start Limit ထည့်ပါ (AI ခန့်မှန်းချက် ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ)\n\nဥပမာ: 2, 3, 5");
    }
    if (text === "✅ Start Auto Bet") {
        data.autoBetActive = true;
        data.autoBetStarted = false;
        data.currentBetStep = 0;
        data.consecutiveLosses = 0;
        data.consecutiveWins = 0;
        await updateCachedUser(chatId, data);
        await bot.sendMessage(chatId, `✅ **Auto Bet Started!**\n\n📋 Bet Plan: ${data.betPlan.join(' → ')}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n⚠️ Loss Start: ${data.lossLimitStart} AI loss(es)\n\n⚠️ AI ${data.lossLimitStart} ပွဲမှားတာနဲ့ စထိုးပါမည်။\n🏆 အနိုင်ရရင် ရပ်ပါမည်။`, mainMenu);
        return;
    }
    if (text === "❌ Stop Auto Bet") {
        data.autoBetActive = false;
        data.autoBetStarted = false;
        data.consecutiveLosses = 0;
        await updateCachedUser(chatId, data);
        await bot.sendMessage(chatId, "❌ **Auto Bet Stopped.**\n✅ Start Auto Bet နှိပ်မှ ပြန်စပါမည်။", mainMenu);
        return;
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
            if (!isNaN(num) && num > 0 && num <= 20) {
                data.lossLimitStart = num;
                await bot.sendMessage(chatId, `✅ Loss Start Limit updated: ${num} AI loss(es) to start betting`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number (1-20).");
            }
        }
        delete data.settingMode;
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }
    
    // Main menu commands
    if (text === '/start') {
        data.running = false;
        data.token = null;
        data.phone = null;
        data.totalProfit = 0;
        data.betHistory = [];
        data.aiLogs = [];
        data.autoBetActive = false;
        data.autoBetStarted = false;
        data.consecutiveLosses = 0;
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "🎯 **WinGo Sniper Pro v3.0** 🎯\n\nအင်္ဂါရပ်များ:\n✅ Pattern-Based AI\n✅ Loss Start Mode (AI သတ်မှတ်အကြိမ်မှားမှထိုး)\n✅ Stop Limit (အနိုင်ပွဲပြည့်ရင်ရပ်)\n✅ Bet Plan အဆင့်လိုက်ထိုး\n✅ Database ဖြင့် အမြဲတမ်းသိမ်း\n\n⚙️ **အရင်ဆုံး Setting ချိန်ပါ:**\n1. 🎲 Set Bet Plan\n2. 🛑 Set Stop Limit  \n3. ⚠️ Set Loss Start\n\n✅ **ပြီးရင် Start Auto Bet နှိပ်ပါ။**\n\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
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
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }
    
    // Login flow
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        await updateCachedUser(chatId, data);
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
            await updateCachedUser(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ **Login Success!**\n\n⚙️ အရင်ဆုံး Setting ချိန်ပါ။\n✅ ပြီးရင် Start Auto Bet နှိပ်ပါ။", mainMenu);
        } else { 
            await bot.sendMessage(chatId, "❌ Login Failed!"); 
            delete data.tempPhone;
            await updateCachedUser(chatId, data);
        }
        return;
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = await getCachedUser(chatId);
    data.pendingSide = query.data.split('_')[1];
    await updateCachedUser(chatId, data);
    await bot.sendMessage(chatId, `💰 **${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

console.log("✅ Bot is running - Fixed: Bet on correct next issue");
