const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => { res.end('WinGo Sniper Pro - Dual Auto Mode'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// ========== LOCAL STORAGE ==========
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
            token: null, phone: null, 
            // Auto Status
            autoRunning: false,          // Auto လက်ရှိအလုပ်လုပ်နေလား
            autoMode: null,              // "follow" သို့မဟုတ် "ai_correction"
            
            // Settings
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3, 
            lossStartLimit: 1,           // AI ဘယ်နှစ်ခါမှားရင် စထိုးမလဲ
            
            // Runtime Variables
            totalProfit: 0,
            currentBetStep: 0, 
            consecutiveWins: 0,          // Stop Limit အတွက် အနိုင်ရေတွက်
            consecutiveLosses: 0,        // AI Mode အတွက် AI အမှားရေတွက်
            aiPredictionHistory: [],     // AI ခန့်မှန်းချက်မှားမှန်စစ်ဖို့
            last_issue: null, 
            last_pred: null,
            
            // Manual Lock
            manualBetLock: false,
            manualBetIssue: null,
            
            // Logs
            betHistory: [], 
            aiLogs: []
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

async function getNextIssueNumber(token) {
    const res = await callApi("GetGameIssue", { typeId: 30 }, token);
    if (res?.msgCode === 0 && res.data?.issueNumber) {
        return res.data.issueNumber;
    }
    return null;
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

// ========== UNIVERSAL BET PLACEMENT ==========
async function placeBet(chatId, side, amount, stepIndex, isAuto = true) {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;
    
    const targetIssue = await getNextIssueNumber(data.token);
    if (!targetIssue) {
        await bot.sendMessage(chatId, "❌ နောက်ပွဲစဉ်ရယူ၍မရပါ။");
        return false;
    }

    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    const selectType = side === "Big" ? 13 : 14;

    const betPayload = { 
        typeId: 30, issuenumber: targetIssue, gameType: 2, 
        amount: baseUnit, betCount: betCount, 
        selectType: selectType, isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const newBet = { 
            issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", 
            pnl: 0, isAuto: isAuto, autoStep: isAuto ? stepIndex : -1, 
            timestamp: new Date().toISOString()
        };
        data.betHistory.unshift(newBet);
        
        if (!isAuto) {
            data.manualBetLock = true;
            data.manualBetIssue = targetIssue.slice(-5);
        }
        
        saveUserData(chatId, data);
        
        const typeText = isAuto ? "[AUTO]" : "[MANUAL]";
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        await bot.sendMessage(chatId, `📌 ${typeText} ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးပြီး ✅`);
        return true;
    } else {
        await bot.sendMessage(chatId, `❌ Bet Failed: ${res?.msg || 'Unknown Error'}`);
        return false;
    }
}

// ========== MONITORING LOOP (အဓိက ပြင်ဆင်ချက်) ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;
            
            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                
                // 1. Pending Bet Result Check
                let pendingBet = null;
                for (let bet of data.betHistory) {
                    if (bet.status === "⏳ Pending" && bet.issue === currentIssue.slice(-5)) {
                        pendingBet = bet;
                        break;
                    }
                }
                
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        data.totalProfit += pendingBet.pnl;
                        
                        if (pendingBet.isAuto) {
                            data.consecutiveWins++;
                            // Stop Limit Check
                            if (data.consecutiveWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit Reached! (${data.stopLimit} wins) Auto Bet Stopped.`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                data.currentBetStep = 0;
                                data.consecutiveWins = 0;
                            } else {
                                data.currentBetStep = 0; // Reset Step on Win
                            }
                        } else {
                            // Manual Bet Win -> Unlock
                            data.manualBetLock = false;
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        data.totalProfit += pendingBet.pnl;
                        
                        if (pendingBet.isAuto) {
                            data.consecutiveWins = 0;
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) {
                                data.currentBetStep = nextStep;
                            } else {
                                await bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                data.currentBetStep = 0;
                            }
                        } else {
                            // Manual Bet Loss -> Unlock
                            data.manualBetLock = false;
                        }
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // 2. AI Prediction Tracking (AI Mode အတွက် အမှားရေတွက်)
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    const logEntry = { 
                        status: aiCorrect ? "✅" : "❌", 
                        issue: currentIssue.slice(-3), 
                        result: realSide, 
                        prediction: data.last_pred 
                    };
                    data.aiLogs.unshift(logEntry);
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    
                    // AI Correction Mode အတွက် Loss Streak ရေတွက်ခြင်း
                    if (!aiCorrect) {
                        data.consecutiveLosses++;
                    } else {
                        data.consecutiveLosses = 0;
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // 3. New AI Signal Generation
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveUserData(chatId, data);
                
                // 4. Auto Bet Trigger Logic
                if (data.autoRunning && !data.manualBetLock) {
                    let shouldBet = false;
                    let betSide = null;
                    let betAmount = 0;
                    
                    // === MODE 1: FOLLOW PATTERN (နောက်လိုက်ထိုး) ===
                    if (data.autoMode === 'follow') {
                        betSide = realSide; // နောက်ဆုံးထွက်တဲ့ဘက်ကို လိုက်ထိုး
                        betAmount = data.betPlan[data.currentBetStep];
                        shouldBet = true;
                        await bot.sendMessage(chatId, `🔄 [Follow Mode] နောက်ဆုံးရလဒ် ${betSide} ကို ဆက်ထိုးပါမည်။`);
                    }
                    
                    // === MODE 2: AI CORRECTION (AI မှားမှစထိုး) ===
                    else if (data.autoMode === 'ai_correction') {
                        // AI ဆက်တိုက်မှားနေပြီး Loss Start Limit ပြည့်ပြီလား စစ်ဆေး
                        if (data.consecutiveLosses >= data.lossStartLimit) {
                            betSide = data.last_pred; // AI ရဲ့ လက်ရှိ ခန့်မှန်းချက်အတိုင်းထိုး
                            betAmount = data.betPlan[data.currentBetStep];
                            shouldBet = true;
                            await bot.sendMessage(chatId, `🤖 [AI Correction Mode] AI ${data.consecutiveLosses} ပွဲဆက်မှား၍ Auto Bet စတင်ပါပြီ။`);
                        } else {
                            // AI မမှားသေးရင် စောင့်ဆိုင်း
                            await bot.sendMessage(chatId, `⏳ [AI Correction Mode] AI အမှား ${data.consecutiveLosses}/${data.lossStartLimit}။ စောင့်ဆိုင်းနေပါသည်...`);
                        }
                    }
                    
                    if (shouldBet && betSide) {
                        await placeBet(chatId, betSide, betAmount, data.currentBetStep, true);
                    } else if (data.autoRunning && !shouldBet) {
                        // Bet မလုပ်ခင်မှာ autoRunning ကို false လုပ်မထားပါနဲ့။ စောင့်နေရုံပါ။
                    }
                }

                // 5. Send UI Update
                const nextIssue = await getNextIssueNumber(data.token);
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                
                let modeText = "⚪️ Manual Only";
                if (data.autoRunning) {
                    modeText = data.autoMode === 'follow' ? "🟢 Follow Mode" : "🟡 AI Correction";
                }
                
                let statusMsg = `💥 BIGWIN SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue}\n`;
                statusMsg += `🎲 Result: ${realSide} (${lastRound.number})\n`;
                statusMsg += `🤖 AI Pred: ${data.last_pred}\n`;
                statusMsg += `📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🚀 Next Issue: ${nextIssue?.slice(-5) || 'N/A'} (${mmTime})\n`;
                statusMsg += `🦸 AI ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                
                await bot.sendMessage(chatId, statusMsg, {
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

// ========== MENUS & HANDLERS ==========
const mainMenu = { 
    reply_markup: { 
        keyboard: [
            ["🚀 Start Auto", "🛑 Stop Auto"], 
            ["⚙️ Settings", "📊 Status"],
            ["📜 History", "🚪 Logout"]
        ], 
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

const autoModeMenu = {
    reply_markup: {
        keyboard: [
            ["🔄 Follow Pattern (နောက်လိုက်ထိုး)"],
            ["🤖 AI Correction (AIမှားမှထိုး)"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);
    
    // Manual Bet Amount Input
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        await placeBet(chatId, data.pendingSide, amount, -1, false);
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }
    
    // Main Menu Actions
    if (text === '/start') {
        data.running = false;
        data.token = null;
        data.phone = null;
        data.totalProfit = 0;
        data.betHistory = [];
        data.aiLogs = [];
        data.autoRunning = false;
        data.autoMode = null;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro v4.0 🎯\n\nMode နှစ်မျိုး:\n1️⃣ Follow Pattern (နောက်လိုက်ထိုး)\n2️⃣ AI Correction (AIမှားမှစထိုး)\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }
    
    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ Login first!");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးချယ်ပါ:", autoModeMenu);
    }
    
    if (text === "🔄 Follow Pattern (နောက်လိုက်ထိုး)") {
        data.autoRunning = true;
        data.autoMode = 'follow';
        data.currentBetStep = 0;
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ Follow Pattern Mode Started!\n\nနောက်ဆုံးထွက်တဲ့ဘက်ကို ဆက်တိုက်ထိုးပါမည်။\nStop Limit: " + data.stopLimit + " နိုင်ရင်ရပ်မည်။", mainMenu);
    }
    
    if (text === "🤖 AI Correction (AIမှားမှထိုး)") {
        data.autoRunning = true;
        data.autoMode = 'ai_correction';
        data.currentBetStep = 0;
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ AI Correction Mode Started!\n\nAI ခန့်မှန်းချက် " + data.lossStartLimit + " ပွဲဆက်မှားမှ စတင်ထိုးပါမည်။\nStop Limit: " + data.stopLimit + " နိုင်ရင်ရပ်မည်။", mainMenu);
    }
    
    if (text === "🛑 Stop Auto") {
        data.autoRunning = false;
        data.autoMode = null;
        data.currentBetStep = 0;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Auto Bet Stopped!", mainMenu);
    }
    
    if (text === "📊 Status") {
        let modeText = "⚪️ Manual Only";
        if (data.autoRunning) {
            modeText = data.autoMode === 'follow' ? "🟢 Follow Mode" : "🟡 AI Correction";
        }
        let status = `📊 Current Status\n━━━━━━━━━━━━━━━━\n`;
        status += `🤖 Mode: ${modeText}\n`;
        status += `📋 Bet Plan: ${data.betPlan.join(' → ')}\n`;
        status += `🏆 Stop Limit: ${data.stopLimit} win(s)\n`;
        status += `⚠️ Loss Start: ${data.lossStartLimit} AI loss(es)\n`;
        status += `📈 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}\n`;
        status += `✅ Win Count: ${data.consecutiveWins}/${data.stopLimit}\n`;
        status += `❌ AI Losses: ${data.consecutiveLosses}/${data.lossStartLimit}\n`;
        status += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK`;
        return bot.sendMessage(chatId, status);
    }
    
    if (text === "⚙️ Settings") {
        return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,60,90,150,250,400,650");
    }
    
    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\nဥပမာ: 3");
    }
    
    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚠️ Loss Start Limit ထည့်ပါ (AI ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ)\n\nဥပမာ: 1");
    }
    
    if (text === "🔙 Main Menu") {
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }
    
    if (text === "📜 History") {
        let txt = `📜 Bet History\n💰 Total: ${data.totalProfit.toFixed(2)} MMK\n------------------\n`;
        data.betHistory.slice(0, 20).forEach(h => {
            const type = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnl = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${type} | ${h.issue} | ${h.side} | ${h.amount} ${pnl}\n`;
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }
    
    if (text === "🚪 Logout") {
        data.running = false;
        data.token = null;
        data.autoRunning = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }
    
    // Handle Settings Input
    if (data.settingMode) {
        const mode = data.settingMode;
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
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
                await bot.sendMessage(chatId, `✅ Loss Start updated: ${num} AI loss(es)`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number (1-10).");
            }
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }
    
    // Login
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
            await bot.sendMessage(chatId, "✅ Login Success!\n\nStart Auto နှိပ်ပြီး Mode ရွေးချယ်ပါ။", mainMenu);
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
    await bot.sendMessage(chatId, `💰 ${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

console.log("✅ Bot running - Follow Pattern & AI Correction Modes");
