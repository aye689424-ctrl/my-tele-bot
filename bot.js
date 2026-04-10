const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Keep Alive for Hosting
http.createServer((req, res) => { res.end('WinGo Sniper Pro - All Features Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// ========== LOCAL STORAGE ==========
const DATA_FILE = path.join(__dirname, 'user_data.json');

function loadAllData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
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
            betHistory: [], aiLogs: [],
            manualBetLock: false, manualBetIssue: null, pendingSide: null
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
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// ========== AI LOGIC (1-2-3 RULE) ==========
function runAI(history) {
    const resArr = history.map(i => parseInt(i.number) >= 5 ? "Big" : "Small");
    let streak = 1;
    let currentSide = resArr[0];
    for(let i = 1; i < resArr.length; i++) {
        if(resArr[i] === currentSide) streak++;
        else break;
    }
    let prediction = (streak >= 3) ? (currentSide === "Big" ? "Small" : "Big") : currentSide;
    let calcTxt = `${resArr[2]?.charAt(0) || '?'}-${resArr[1]?.charAt(0) || '?'}-${resArr[0]?.charAt(0) || '?'}`;
    return { side: prediction, dragon: streak, calc: calcTxt };
}

// ========== CORE BETTING FUNCTION ==========
async function executeBet(chatId, side, amount, isAuto = false) {
    const data = getUserData(chatId);
    if (!data.token) return false;

    // အသစ်ဆုံး Issue ကို ယူခြင်း
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) return false;
    
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
    // Bet Amount တွက်ချက်ခြင်း (Wingo standard unit: 10, 100, 1000)
    let baseUnit = amount < 1000 ? 10 : (amount < 10000 ? 10 : 100);
    const betCount = Math.floor(amount / baseUnit);
    
    const betPayload = { 
        typeId: 30, issuenumber: targetIssue, gameType: 2, 
        amount: baseUnit, betCount: betCount, 
        selectType: side === "Big" ? 13 : 14, isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0) {
        const newBet = { 
            issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", 
            pnl: 0, isAuto, timestamp: new Date().toISOString()
        };
        data.betHistory.unshift(newBet);
        
        if (!isAuto) {
            data.manualBetLock = true;
            data.manualBetIssue = targetIssue.slice(-5);
        }
        
        saveUserData(chatId, data);
        const typeTag = isAuto ? "🤖 AUTO" : "👤 MANUAL";
        await bot.sendMessage(chatId, `📌 [${typeTag}] ပွဲစဉ်: ${targetIssue.slice(-5)} | ${side.toUpperCase()} | ${amount} MMK ထိုးပြီး ✅`);
        return true;
    } else {
        await bot.sendMessage(chatId, `❌ Bet တင်မရပါ: ${res?.msg || "Connection Error"}`);
        return false;
    }
}

// ========== MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;
            
            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;
                
                // ၁။ Pending Bet များအား Result စစ်ခြင်း
                let pendingIdx = data.betHistory.findIndex(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                
                if (pendingIdx !== -1) {
                    let bet = data.betHistory[pendingIdx];
                    const isWin = bet.side === realSide;
                    
                    if (isWin) {
                        bet.status = "✅ WIN";
                        bet.pnl = +(bet.amount * 0.97).toFixed(2);
                        data.consecutiveWins++;
                        data.currentBetStep = 0; // Win ရင် Step ပြန်စ
                        await bot.sendMessage(chatId, `🎉 ${bet.isAuto ? '[AUTO]' : '[MANUAL]'} အနိုင်!\nရလဒ်: ${realSide} (${lastRound.number})\nအမြတ်: +${bet.pnl} MMK`);
                    } else {
                        bet.status = "❌ LOSS";
                        bet.pnl = -bet.amount;
                        data.consecutiveWins = 0;
                        if (bet.isAuto) data.currentBetStep++; // Auto ရှုံးရင် Step တိုး
                        await bot.sendMessage(chatId, `💔 ${bet.isAuto ? '[AUTO]' : '[MANUAL]'} ရှုံး!\nရလဒ်: ${realSide} (${lastRound.number})\nအရှုံး: -${bet.amount} MMK`);
                    }
                    data.totalProfit += bet.pnl;
                    
                    // Manual Lock ဖြုတ်ခြင်း
                    if (!bet.isAuto) {
                        data.manualBetLock = false;
                        data.manualBetIssue = null;
                    }
                }

                // ၂။ Auto Stop / Step Check
                if (data.consecutiveWins >= data.stopLimit && data.stopLimit > 0) {
                    await bot.sendMessage(chatId, `🛑 Stop Limit (${data.stopLimit} wins) ပြည့်သွားလို့ Auto ရပ်ပါပြီ။`);
                    data.currentBetStep = 0;
                }
                
                if (data.currentBetStep >= data.betPlan.length) {
                    await bot.sendMessage(chatId, `⚠️ Max Step ပြည့်သွားပါပြီ။ Step ကို ပြန်စပါမည်။`);
                    data.currentBetStep = 0;
                }

                // ၃။ AI Analysis & Auto Betting Logic
                const ai = runAI(history);
                const aiWasWrong = (data.last_pred && data.last_pred !== realSide);
                
                if (aiWasWrong) {
                    data.consecutiveLosses++;
                } else {
                    data.consecutiveLosses = 0;
                }

                // Auto Bet စတင်ရန် အခြေအနေ (Manual Lock မရှိရ၊ Running ဖြစ်ရ၊ Loss Start ပြည့်ရ)
                if (data.running && !data.manualBetLock) {
                    // AI ဆက်တိုက်မှားမှ ထိုးမယ့် logic
                    if (data.consecutiveLosses >= data.lossStartLimit || data.currentBetStep > 0) {
                        const nextAmount = data.betPlan[data.currentBetStep];
                        await executeBet(chatId, ai.side, nextAmount, true);
                    }
                }

                // ၄။ Update Last Data
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                
                // ၅။ VIP Signal & Dashboard Update
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let dashboard = `💥 BIGWIN VIP SIGNAL 💥\n━━━━━━━━━━━━━━━━\n🗓 ပွဲစဉ်: ${(BigInt(currentIssue)+1n).toString().slice(-5)}\n🎰 AI ခန့်မှန်း: ${ai.side.toUpperCase()}\n🐉 Dragon: ${ai.dragon} ပွဲဆက်\n🕒 အချိန်: ${mmTime}\n━━━━━━━━━━━━━━━━\n⚙️ Status\n📋 Bet Plan: ${data.betPlan[data.currentBetStep]} MMK (Step ${data.currentBetStep + 1})\n🏆 Wins: ${data.consecutiveWins}/${data.stopLimit}\n⚠️ AI Losses: ${data.consecutiveLosses}/${data.lossStartLimit}\n💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK\n🔐 Lock: ${data.manualBetLock ? "🔒 LOCKED" : "🔓 READY"}`;
                
                saveUserData(chatId, data);
                
                await bot.sendMessage(chatId, dashboard, {
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
        keyboard: [["🎲 Set Bet Plan", "🛑 Set Stop Limit"], ["⚠️ Set Loss Start", "🔙 Main Menu"]],
        resize_keyboard: true
    }
};

// ========== MESSAGE HANDLERS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    if (!text) return;
    let data = getUserData(chatId);
    
    // Manual Amount Input Handling
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        await executeBet(chatId, data.pendingSide, amount, false);
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }

    // Settings Mode Handling
    if (data.settingMode) {
        if (data.settingMode === "betplan") {
            const nums = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            if (nums.length > 0) data.betPlan = nums;
        } else if (data.settingMode === "stoplimit") {
            data.stopLimit = parseInt(text) || 3;
        } else if (data.settingMode === "lossstart") {
            data.lossStartLimit = parseInt(text) || 1;
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "✅ Settings Updated!", settingsMenu);
    }

    // Command Handlers
    switch(text) {
        case "/start":
            data.running = false; data.token = null; saveUserData(chatId, data);
            return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro v3.3\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
        case "⚙️ Settings":
            return bot.sendMessage(chatId, `⚙️ Settings\nPlan: ${data.betPlan.join(',')}\nStop: ${data.stopLimit}\nLoss Start: ${data.lossStartLimit}`, settingsMenu);
        case "🎲 Set Bet Plan":
            data.settingMode = "betplan"; saveUserData(chatId, data);
            return bot.sendMessage(chatId, "Bet Plan ထည့်ပါ (comma separated): 10,30,90...");
        case "🛑 Set Stop Limit":
            data.settingMode = "stoplimit"; saveUserData(chatId, data);
            return bot.sendMessage(chatId, "Stop Limit ထည့်ပါ (ပွဲအရေအတွက်):");
        case "⚠️ Set Loss Start":
            data.settingMode = "lossstart"; saveUserData(chatId, data);
            return bot.sendMessage(chatId, "AI ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ:");
        case "🔙 Main Menu":
            return bot.sendMessage(chatId, "Main Menu", mainMenu);
        case "📜 Bet History":
            let hist = data.betHistory.slice(0,15).map(h => `${h.status} | ${h.issue} | ${h.side} | ${h.amount}`).join('\n');
            return bot.sendMessage(chatId, `📜 Bet History\n${hist || "မှတ်တမ်းမရှိသေးပါ"}`);
        case "🚪 Logout":
            data.running = false; data.token = null; saveUserData(chatId, data);
            return bot.sendMessage(chatId, "👋 Logged out.");
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text; saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; delete data.tempPhone;
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ Bot စတင်နေပါပြီ။", mainMenu);
        } else {
            bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။");
            delete data.tempPhone; saveUserData(chatId, data);
        }
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = getUserData(chatId);
    data.pendingSide = query.data.split('_')[1];
    saveUserData(chatId, data);
    bot.sendMessage(chatId, `💰 ${data.pendingSide} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

console.log("✅ WinGo Sniper Pro v3.3 is running with all features...");
