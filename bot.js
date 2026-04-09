const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

http.createServer((req, res) => { res.end('WinGo Sniper Pro - Full Feature'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

const dbPath = path.join(__dirname, 'user_data.db');
const db = new sqlite3.Database(dbPath);

// ========== DATABASE SETUP ==========
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        chat_id TEXT PRIMARY KEY,
        token TEXT,
        phone TEXT,
        running INTEGER DEFAULT 0,
        total_profit REAL DEFAULT 0,
        bet_plan TEXT DEFAULT '10,30,90,170,610,1800,3800,6000',
        stop_limit INTEGER DEFAULT 1,
        loss_limit_start INTEGER DEFAULT 3,
        auto_mode TEXT DEFAULT 'lossstart',
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

// ========== DATABASE HELPERS ==========
function getUserData(chatId, callback) {
    db.get(`SELECT * FROM users WHERE chat_id = ?`, [chatId], (err, row) => {
        if (err || !row) {
            const defaultData = {
                chat_id: chatId, token: null, phone: null, running: 0, total_profit: 0,
                bet_plan: '10,30,90,170,610,1800,3800,6000', stop_limit: 1,
                loss_limit_start: 3, auto_mode: 'lossstart', auto_bet_active: 0, auto_bet_started: 0,
                current_bet_step: 0, consecutive_losses: 0, consecutive_wins: 0,
                last_issue: null, next_issue: null, last_pred: null, auto_side: null
            };
            db.run(`INSERT INTO users (chat_id, running, total_profit, bet_plan, stop_limit, loss_limit_start, auto_mode) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [chatId, 0, 0, defaultData.bet_plan, 1, 3, 'lossstart']);
            callback(defaultData);
        } else {
            callback(row);
        }
    });
}

function saveUserData(chatId, data) {
    db.run(`UPDATE users SET 
        token = ?, phone = ?, running = ?, total_profit = ?, bet_plan = ?, stop_limit = ?, 
        loss_limit_start = ?, auto_mode = ?, auto_bet_active = ?, auto_bet_started = ?, 
        current_bet_step = ?, consecutive_losses = ?, consecutive_wins = ?,
        last_issue = ?, next_issue = ?, last_pred = ?, auto_side = ?
        WHERE chat_id = ?`,
        [data.token, data.phone, data.running ? 1 : 0, data.totalProfit || 0,
         data.betPlan ? data.betPlan.join(',') : '10,30,90,170,610,1800,3800,6000',
         data.stopLimit || 1, data.lossLimitStart || 3, data.autoMode || 'lossstart',
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
                    betPlan: dbData.bet_plan ? dbData.bet_plan.split(',').map(Number) : [10,30,90,170,610,1800,3800,6000],
                    stopLimit: dbData.stop_limit || 1,
                    lossLimitStart: dbData.loss_limit_start || 3,
                    autoMode: dbData.auto_mode || 'lossstart',
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

// ========== AI LOGIC ==========
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
    let patternTxt = isAlternating ? "Alternating 🔄" : "Normal 📈";
    let calcTxt = `${resArr[2]?.charAt(0) || '?'}-${resArr[1]?.charAt(0) || '?'}-${resArr[0]?.charAt(0) || '?'}`;
    return { side: finalPrediction, dragon: streak, calc: calcTxt, pattern: patternTxt };
}

// ========== AUTO BET FUNCTION ==========
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = await getCachedUser(chatId);
    if (!data || !data.token) return false;
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) return false;
    
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
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
        bot.sendMessage(chatId, `📌 ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးလိုက်ပြီး ✅\n⏳ အဖြေခနစောင့်ပါ...`);
        return true;
    }
    return false;
}

// ========== MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = await getCachedUser(chatId);
        if (!data.running) break;
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            
            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;
                let fullMessage = "";
                
                // ========== CHECK PENDING BETS ==========
                let pendingBet = null;
                for (let bet of data.betHistory) {
                    if (bet.status === "⏳ Pending" && bet.issue === lastRound.issueNumber.slice(-5)) {
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
                        bot.sendMessage(chatId, `🎉 **အနိုင်ရရှိသည်!** 🎉\n📌 ပွဲစဉ်: ${lastRound.issueNumber.slice(-5)}\n🎲 ရလဒ်: ${resultText} (${lastRound.number})\n💰 အမြတ်: +${pendingBet.pnl} MMK`);
                        
                        // WIN: Reset everything
                        data.consecutiveLosses = 0;
                        data.consecutiveWins++;
                        data.autoBetActive = false;
                        data.autoBetStarted = false;
                        data.currentBetStep = 0;
                        
                        if (data.consecutiveWins >= data.stopLimit) {
                            bot.sendMessage(chatId, `🛑 Stop Limit Reached! (${data.stopLimit} wins) Auto Bet Stopped.`);
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        roundProfit += pendingBet.pnl;
                        bot.sendMessage(chatId, `💔 **ရှုံးနိမ့်သည်!** 💔\n📌 ပွဲစဉ်: ${lastRound.issueNumber.slice(-5)}\n🎲 ရလဒ်: ${resultText} (${lastRound.number})\n💰 အရှုံး: -${pendingBet.amount} MMK`);
                        
                        // ========== LOSS HANDLING ==========
                        if (pendingBet.isAuto) {
                            // Auto bet loss - continue martingale or loss start steps
                            data.consecutiveLosses++;
                            data.consecutiveWins = 0;
                            
                            if (data.autoMode === "martingale") {
                                const nextStep = data.currentBetStep + 1;
                                if (nextStep < data.betPlan.length) {
                                    data.currentBetStep = nextStep;
                                    const nextAmount = data.betPlan[data.currentBetStep];
                                    bot.sendMessage(chatId, `📉 ဆက်ရှုံး! နောက်ထိုးမယ်: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | ${nextAmount} MMK (အဆင့် ${data.currentBetStep+1}/${data.betPlan.length})`);
                                    await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                                } else {
                                    bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                                    data.autoBetActive = false;
                                    data.autoBetStarted = false;
                                    data.currentBetStep = 0;
                                }
                            }
                        } else {
                            // Manual bet loss - check if AI prediction was wrong (for Loss Start Mode)
                            if (data.last_pred && data.last_pred !== realSide) {
                                // AI prediction was wrong!
                                data.consecutiveLosses++;
                                data.consecutiveWins = 0;
                                bot.sendMessage(chatId, `⚠️ AI ခန့်မှန်းမှား! (${data.consecutiveLosses}/${data.lossLimitStart})`);
                                
                                // Check if we should start auto bet (Loss Start Mode)
                                if (!data.autoBetActive && data.autoMode === "lossstart" && data.consecutiveLosses >= data.lossLimitStart) {
                                    data.autoBetActive = true;
                                    data.autoBetStarted = true;
                                    data.currentBetStep = 0;
                                    const firstAmount = data.betPlan[0];
                                    bot.sendMessage(chatId, `⚠️ AI ခန့်မှန်း ${data.consecutiveLosses} ပွဲဆက်မှား!\n🤖 Auto Bet စတင်ပါပြီ: ${data.autoSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} | ${firstAmount} MMK`);
                                    await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
                                }
                            }
                        }
                    }
                    data.totalProfit += roundProfit;
                    await updateCachedUser(chatId, data);
                    data = await getCachedUser(chatId);
                }
                
                // ========== VIP REPORT ==========
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    const resultText = realSide === "Big" ? "Big" : "Small";
                    
                    fullMessage += `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${resultText}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${roundProfit >= 0 ? "+" : ""}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    
                    saveAILog(chatId, { status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide, prediction: data.last_pred });
                    data.aiLogs = await new Promise(resolve => loadAILogs(chatId, resolve));
                    
                    fullMessage += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => {
                        fullMessage += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result === "Big" ? "Big" : "Small"}\n`;
                    });
                    fullMessage += `\n`;
                }
                
                // ========== AI NEW SIGNAL ==========
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;
                data.autoSide = ai.side;
                
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const brainInfo = `B1:${ai.side.charAt(0)}|B2:${ai.side.charAt(0)}|B3:${ai.side === "Big" ? "S" : "B"}`;
                const confidenceText = ai.dragon >= 3 ? "HIGH 🔥" : "NORMAL ⚡";
                const patternText = ai.dragon >= 3 ? "Dragon Mode 🐉" : "Brain Voting 🧠";
                const sideText = ai.side === "Big" ? "ကြီး (BIG)🧑‍💻" : "သေး (SMALL)🧑‍💻";
                
                const modeText = data.autoMode === "martingale" ? "Martingale (ရှုံးတိုင်းထိုး)" : `Loss Start (${data.lossLimitStart} ပွဲ AI မှားမှထိုး)`;
                
                fullMessage += `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${brainInfo}\`\n🛡 Pattern: \`${patternText}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${sideText}**\n📊 Confidence: \`${confidenceText}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n━━━━━━━━━━━━━━━━\n⚙️ **Auto Settings**\n📋 Bet Plan: ${data.betPlan.join(', ')}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n🎯 Mode: ${modeText}\n📉 AI Loss Streak: ${data.consecutiveLosses}${data.autoMode === "lossstart" ? `/${data.lossLimitStart}` : ""}\n🤖 Status: ${data.autoBetActive ? "ACTIVE ✅" : "STANDBY ⏳"}`;
                
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
            ["⚠️ Set Loss Start", "🔄 Select Mode"],
            ["✅ Start Auto Bet", "❌ Stop Auto Bet"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// ========== HANDLERS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = await getCachedUser(chatId);
    
    // Manual bet amount input
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;
        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
        if (baseUnit < 10) baseUnit = 10;
        const betPayload = { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: Math.floor(baseUnit), betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, data.token);
        if (res?.msgCode === 0 || res?.msg === "Bet success") {
            const sideText = data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴";
            bot.sendMessage(chatId, `📌 ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးလိုက်ပြီး ✅\n⏳ အဖြေခနစောင့်ပါ...`);
            const newBet = { issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false };
            saveBetHistory(chatId, newBet);
            data.betHistory.unshift(newBet);
        } else { 
            bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); 
        }
        data.pendingSide = null;
        await updateCachedUser(chatId, data);
        return;
    }
    
    // Settings commands
    if (text === "⚙️ Settings") {
        const modeText = data.autoMode === "martingale" ? "Martingale (ရှုံးတိုင်းထိုး)" : `Loss Start (${data.lossLimitStart} ပွဲ AI မှားမှထိုး)`;
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n⚠️ Loss Start: \`${data.lossLimitStart}\` AI loss(es)\n🎯 Mode: \`${modeText}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}\n📉 AI Loss Streak: ${data.consecutiveLosses}${data.autoMode === "lossstart" ? `/${data.lossLimitStart}` : ""}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,170,610,1800,3800,6000");
    }
    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\n1 = 1 ပွဲအနိုင်ရရင် ရပ်\n2 = 2 ပွဲဆက်နိုင်မှ ရပ်");
    }
    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "⚠️ Loss Start Limit ထည့်ပါ (AI ခန့်မှန်းချက် ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ)\n\nဥပမာ: 3, 5, 7\n\n3 ဆိုရင် AI ခန့်မှန်းချက် 3 ပွဲဆက်မှားမှ စထိုးမယ်");
    }
    if (text === "🔄 Select Mode") {
        data.settingMode = "mode";
        await updateCachedUser(chatId, data);
        return bot.sendMessage(chatId, "🔁 **Mode ရွေးပါ**\n\n1️⃣ **Martingale Mode** - AI ခန့်မှန်းချက် မှားတိုင်း ဆက်ထိုး\n2️⃣ **Loss Start Mode** - AI ခန့်မှန်းချက် သတ်မှတ်အကြိမ်မှားမှ စထိုး\n\nကျေးဇူးပြု၍ **1** သို့မဟုတ် **2** ရိုက်ထည့်ပါ။");
    }
    if (text === "✅ Start Auto Bet") {
        data.autoBetActive = true;
        data.autoBetStarted = false;
        data.currentBetStep = 0;
        data.consecutiveLosses = 0;
        data.consecutiveWins = 0;
        await updateCachedUser(chatId, data);
        const modeText = data.autoMode === "martingale" ? "Martingale (AI မှားတိုင်းထိုး)" : `Loss Start (AI ${data.lossLimitStart} ပွဲမှားမှထိုး)`;
        bot.sendMessage(chatId, `✅ Auto Bet Started!\n\nBet Plan: ${data.betPlan.join(' → ')}\nStop Limit: ${data.stopLimit} win(s)\nMode: ${modeText}\n\n⏳ Auto Bet စတင်ပါပြီ။`, mainMenu);
        return;
    }
    if (text === "❌ Stop Auto Bet") {
        data.autoBetActive = false;
        data.autoBetStarted = false;
        await updateCachedUser(chatId, data);
        bot.sendMessage(chatId, "❌ Auto Bet Stopped.", mainMenu);
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
                bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid format.");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s)`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 20) {
                data.lossLimitStart = num;
                bot.sendMessage(chatId, `✅ Loss Start Limit updated: ${num} AI loss(es) to start betting`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number (1-20).");
            }
        } else if (mode === "mode") {
            if (text === "1") {
                data.autoMode = "martingale";
                bot.sendMessage(chatId, "✅ Mode: Martingale - AI မှားတိုင်း ဆက်ထိုးမယ်");
            } else if (text === "2") {
                data.autoMode = "lossstart";
                bot.sendMessage(chatId, `✅ Mode: Loss Start - AI ${data.lossLimitStart} ပွဲမှားမှ စထိုးမယ်`);
            } else {
                bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ 1 သို့မဟုတ် 2 ရိုက်ထည့်ပါ။");
                return;
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
        return bot.sendMessage(chatId, "🎯 **WinGo Sniper Pro v3.0** 🎯\n\nအင်္ဂါရပ်များ:\n✅ Pattern-Based AI\n✅ Martingale Mode (AI မှားတိုင်းထိုး)\n✅ Loss Start Mode (AI သတ်မှတ်အကြိမ်မှားမှထိုး)\n✅ Stop Limit (အနိုင်ပွဲပြည့်ရင်ရပ်)\n✅ Bet Plan အဆင့်လိုက်ထိုး\n✅ Database ဖြင့် အမြဲတမ်းသိမ်း\n\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
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
            bot.sendMessage(chatId, "✅ Login Success! Auto Bet Ready.", mainMenu);
        } else { 
            bot.sendMessage(chatId, "❌ Login Failed!"); 
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
    bot.sendMessage(chatId, `💰 **${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

console.log("✅ Bot is running with AI Loss Start Mode");
