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

const bot = new TelegramBot(token);

bot.setWebHook(`${APP_URL}/bot${token}`).then(() => {
    console.log(`✅ Webhook set to: ${APP_URL}/bot${token}`);
}).catch(e => console.error('Webhook error:', e.message));

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
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3,
            lossStartLimit: 1,
            totalProfit: 0,
            currentSessionWins: 0,
            totalWinsAllTime: 0,
            currentBetStep: 0, 
            consecutiveWins: 0, 
            consecutiveLosses: 0,
            last_issue: null, 
            last_pred: null,
            manualBetLock: false, 
            manualBetIssue: null,
            betHistory: [],
            aiLogs: [],
            bettingInProgress: null,
            settingMode: null,
            maxLossStreak: 0,
            currentLossStreak: 0,
            smartPredictions: []
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
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 8000 });
        return res.data;
    } catch (e) {
        console.error('API Error:', e.message);
        return null;
    }
}

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
    return { side: prediction || "Big", dragon: streak };
}

// ========== 🧠 SMART PREDICTION AI ==========
async function getSmartPrediction(chatId, token) {
    try {
        const [statsRes, historyRes] = await Promise.all([
            callApi("GetEmerdList", { typeId: 30, gameType: 2 }, token),
            callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, token)
        ]);
        
        if (!statsRes?.data || !historyRes?.data?.list) {
            return { prediction: "Big", reason: "API ချိတ်ဆက်မှုအမှား", confidence: 50 };
        }
        
        const history = historyRes.data.list;
        const lastRound = history[0];
        const lastNumber = parseInt(lastRound.number);
        const lastResult = getSideFromNumber(lastNumber);
        
        const freqData = statsRes.data.find(d => d.type === 1);
        
        let hotNumbers = [], coldNumbers = [];
        if (freqData) {
            const freqList = [];
            for(let i=0; i<=9; i++) freqList.push({ num: i, val: freqData[`number_${i}`] || 0 });
            freqList.sort((a,b) => b.val - a.val);
            hotNumbers = freqList.slice(0, 3).map(i => i.num);
            coldNumbers = freqList.slice(-3).map(i => i.num);
        }
        
        const resultsLast10 = history.slice(0, 10).map(i => getSideFromNumber(i.number));
        const resultsLast20 = history.slice(0, 20).map(i => getSideFromNumber(i.number));
        
        let bigCount10 = resultsLast10.filter(r => r === 'Big').length;
        let smallCount10 = resultsLast10.filter(r => r === 'Small').length;
        let bigCount20 = resultsLast20.filter(r => r === 'Big').length;
        
        let currentStreak = 1;
        for(let i = 1; i < history.length; i++) {
            if(getSideFromNumber(history[i].number) === lastResult) currentStreak++;
            else break;
        }
        
        let colors = history.slice(0, 10).map(i => i.color);
        let redCount = colors.filter(c => c === 'red').length;
        let greenCount = colors.filter(c => c === 'green').length;
        
        let bigScore = 50;
        let smallScore = 50;
        let reasons = [];
        
        if (bigCount10 >= 7) {
            bigScore -= 15;
            smallScore += 15;
            reasons.push(`Big ${bigCount10}/10 လွန်ကဲ`);
        } else if (smallCount10 >= 7) {
            bigScore += 15;
            smallScore -= 15;
            reasons.push(`Small ${smallCount10}/10 လွန်ကဲ`);
        }
        
        if (bigCount20 >= 14) {
            bigScore -= 10;
            smallScore += 10;
            reasons.push(`Big ${bigCount20}/20 ကြီးစိုး`);
        }
        
        if (currentStreak >= 4) {
            const opposite = lastResult === "Big" ? "Small" : "Big";
            bigScore += (opposite === "Big" ? 20 : 0);
            smallScore += (opposite === "Small" ? 20 : 0);
            reasons.push(`${currentStreak} ပွဲဆက် ${lastResult} ပြောင်းပြန်ထိုး`);
        }
        
        if (redCount >= 7) {
            bigScore += 5;
            smallScore -= 5;
        }
        if (greenCount >= 6) {
            bigScore -= 5;
            smallScore += 5;
        }
        
        let prediction = bigScore > smallScore ? "Big" : "Small";
        let confidence = Math.min(85, Math.max(55, 50 + Math.abs(bigScore - smallScore)));
        
        let mainReason = reasons.length > 0 ? reasons.slice(0, 2).join(" | ") : "ပုံမှန် Trend";
        
        return { prediction, reason: mainReason, confidence };
    } catch (e) {
        return { prediction: "Big", reason: "AI Error", confidence: 50 };
    }
}

// ========== Max Loss Streak Tracking ==========
function updateMaxLossStreak(data) {
    let currentStreak = 0;
    let maxStreak = 0;
    for (let i = 0; i < data.aiLogs.length; i++) {
        if (data.aiLogs[i].status === "❌") {
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
    }
    data.maxLossStreak = maxStreak;
    return maxStreak;
}

// ========== လက်ရှိပွဲစဉ်နဲ့ နောက်ပွဲစဉ် ရယူခြင်း ==========
async function getCurrentAndNextIssue(token) {
    try {
        const res = await callApi("GetGameIssue", { typeId: 30 }, token);
        if (res?.msgCode === 0 && res.data?.issueNumber) {
            const currentIssue = res.data.issueNumber;
            const nextIssue = (BigInt(currentIssue) + 1n).toString();
            return { currentIssue, nextIssue };
        }
    } catch (e) {}
    
    const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, token);
    if (historyRes?.data?.list?.length > 0) {
        const currentIssue = historyRes.data.list[0].issueNumber;
        const nextIssue = (BigInt(currentIssue) + 1n).toString();
        return { currentIssue, nextIssue };
    }
    return null;
}

// ========== ပွဲစဉ်ပိတ်သွားပြီလားစစ် ==========
async function isIssueStillOpen(issue, token) {
    const res = await callApi("GetGameIssue", { typeId: 30 }, token);
    if (res?.msgCode === 0 && res.data?.issueNumber === issue) {
        return true;
    }
    return false;
}

// ========== PLACE BET (ပွဲစဉ်မပိတ်ခင် ထိုးမယ်) ==========
async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;

    const alreadyBet = data.betHistory.find(b => b.issue === targetIssue.slice(-5) && b.status !== "⏳ Pending");
    if (alreadyBet) return false;
    
    if (data.bettingInProgress) return false;
    data.bettingInProgress = targetIssue;
    saveUserData(chatId, data);

    const tempBet = {
        issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", pnl: 0,
        isAuto, autoStep: isAuto ? stepIndex : -1, reason: betReason, timestamp: new Date().toISOString()
    };
    data.betHistory.unshift(tempBet);
    if (!isAuto) { 
        data.manualBetLock = true; 
        data.manualBetIssue = targetIssue.slice(-5);
    }
    saveUserData(chatId, data);

    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    const selectType = side === "Big" ? 13 : 14;
    
    const betPayload = {
        typeId: 30, issuenumber: targetIssue, gameType: 2,
        amount: baseUnit, betCount: betCount, selectType: selectType, isAgree: true
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    data.bettingInProgress = null;
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const typeText = isAuto ? `[AUTO]` : `[MANUAL]`;
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        await bot.sendMessage(chatId, `✅ ${typeText} ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK`);
        saveUserData(chatId, data);
        return true;
    } else {
        data.betHistory = data.betHistory.filter(b => b.issue !== targetIssue.slice(-5) || b.status !== "⏳ Pending");
        if (!isAuto) { 
            data.manualBetLock = false; 
            data.manualBetIssue = null;
        }
        saveUserData(chatId, data);
        
        if (res?.msg === "The current period is settled") {
            await bot.sendMessage(chatId, `⚠️ ပွဲစဉ် ${targetIssue.slice(-5)} ပိတ်သွားပြီ`);
        } else if (res?.msg !== "Do not resubmit") {
            await bot.sendMessage(chatId, `❌ ${res?.msg || 'Error'}`);
        }
        return false;
    }
}

// ========== MANUAL BET - အလိုအလျောက် နောက်ပွဲစဉ်ရှာပြီးထိုး ==========
async function placeManualBet(chatId, side, amount) {
    const data = getUserData(chatId);
    if (!data || !data.token) {
        await bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ။");
        return false;
    }
    
    if (data.manualBetLock) {
        await bot.sendMessage(chatId, "⚠️ ထိုးနေပြီး...");
        return false;
    }
    
    // နောက်ပွဲစဉ်ကို အလိုအလျောက်ရှာ
    const issues = await getCurrentAndNextIssue(data.token);
    if (!issues) {
        await bot.sendMessage(chatId, "❌ ပွဲစဉ်မရှိပါ။");
        return false;
    }
    
    let targetIssue = issues.nextIssue;
    await bot.sendMessage(chatId, `🎯 နောက်ပွဲစဉ်: ${targetIssue.slice(-5)}\n⏳ စတင်ရန်စောင့်နေပါ...`);
    
    // ပွဲစဉ်စဖို့စောင့် (max 30 sec)
    let waited = 0;
    let issueStarted = false;
    while (waited < 30000) {
        const isOpen = await isIssueStillOpen(targetIssue, data.token);
        if (isOpen) {
            issueStarted = true;
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        waited += 500;
    }
    
    if (!issueStarted) {
        await bot.sendMessage(chatId, "❌ ပွဲစဉ်မစတင်နိုင်ပါ။");
        return false;
    }
    
    // 5 စက္ကန့်စောင့်
    await bot.sendMessage(chatId, `⏰ ${targetIssue.slice(-5)} စတင်ပြီ\n💵 5 စက္ကန့်စောင့်ပြီးထိုး...`);
    await new Promise(r => setTimeout(r, 5000));
    
    // ထပ်စစ် - ပွဲမပိတ်သေးဘူးလား
    const stillOpen = await isIssueStillOpen(targetIssue, data.token);
    if (!stillOpen) {
        await bot.sendMessage(chatId, `❌ ပွဲစဉ် ${targetIssue.slice(-5)} ပိတ်သွားပြီ။`);
        return false;
    }
    
    return await placeBetNow(chatId, side, amount, targetIssue, -1, false, "Manual");
}

async function syncBetHistoryFromAPI(chatId) {
    const data = getUserData(chatId);
    if (!data || !data.token) return;
    
    const res = await callApi("GetMyEmerdList", { typeId: 30, pageNo: 1, pageSize: 30 }, data.token);
    
    if (res?.msgCode === 0 && res.data?.list) {
        res.data.list.forEach(apiBet => {
            const issueShort = apiBet.issueNumber.slice(-5);
            const existingBet = data.betHistory.find(b => b.issue === issueShort);
            
            if (!existingBet) {
                const status = apiBet.state === "0" ? "⏳ Pending" : apiBet.state === "1" ? "✅ WIN" : "❌ LOSS";
                data.betHistory.push({
                    issue: issueShort, 
                    side: apiBet.selectType === "big" ? "Big" : "Small", 
                    amount: apiBet.amount, 
                    status,
                    pnl: apiBet.state === "1" ? apiBet.profitAmount : (apiBet.state === "2" ? -Math.abs(apiBet.amount) : 0),
                    isAuto: true, 
                    timestamp: apiBet.addTime
                });
            } else {
                if (apiBet.state === "1") { existingBet.status = "✅ WIN"; existingBet.pnl = apiBet.profitAmount; }
                else if (apiBet.state === "2") { existingBet.status = "❌ LOSS"; existingBet.pnl = -Math.abs(apiBet.amount); }
            }
        });
        
        data.totalProfit = data.betHistory.filter(b => b.status !== "⏳ Pending").reduce((sum, b) => sum + (b.pnl || 0), 0);
        data.totalWinsAllTime = data.betHistory.filter(b => b.status === "✅ WIN" && b.isAuto).length;
        saveUserData(chatId, data);
    }
}

function resetAutoSession(data) {
    data.currentSessionWins = 0;
    data.currentBetStep = 0;
    data.consecutiveLosses = 0;
    data.consecutiveWins = 0;
}

// ========== MONITORING LOOP ==========
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

            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                const realNumber = lastRound.number;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                // Check pending bets
                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        data.totalProfit += pendingBet.pnl;
                        data.totalWinsAllTime++;
                        
                        if (pendingBet.isAuto) {
                            data.currentSessionWins++;
                            if (data.currentSessionWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit ${data.currentSessionWins}/${data.stopLimit} ပြည့် Auto ရပ်`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                resetAutoSession(data);
                            } else {
                                data.currentBetStep = 0;
                            }
                        } else {
                            data.manualBetLock = false;
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        data.totalProfit += pendingBet.pnl;
                        
                        if (pendingBet.isAuto) {
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) {
                                data.currentBetStep = nextStep;
                            } else {
                                await bot.sendMessage(chatId, `❌ Max step ရောက် Auto ရပ်`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                resetAutoSession(data);
                            }
                        } else {
                            data.manualBetLock = false;
                        }
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // AI Log
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    if (data.autoMode === 'ai_correction') {
                        if (!aiCorrect) data.consecutiveLosses++;
                        else data.consecutiveLosses = 0;
                    }
                    
                    data.aiLogs.unshift({ 
                        status: aiCorrect ? "✅" : "❌", 
                        issue: currentIssue.slice(-5), 
                        result: realSide, 
                        prediction: data.last_pred, 
                        number: realNumber 
                    });
                    if (data.aiLogs.length > 100) data.aiLogs.pop();
                    updateMaxLossStreak(data);
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveUserData(chatId, data);

                // Auto Bet
                if (data.autoRunning && !data.manualBetLock) {
                    let betSide = null;
                    let betAmount = data.betPlan[data.currentBetStep];
                    let betReason = "";
                    
                    if (data.autoMode === 'follow') {
                        betSide = realSide;
                        betReason = `Follow ${realSide}`;
                    } 
                    else if (data.autoMode === 'ai_correction') {
                        if (data.consecutiveLosses >= data.lossStartLimit) {
                            betSide = data.last_pred;
                            betReason = `AI Correction (${data.consecutiveLosses}ပွဲမှား)`;
                        }
                    } 
                    else if (data.autoMode === 'emerdlist') {
                        const smartPred = await getSmartPrediction(chatId, data.token);
                        betSide = smartPred.prediction;
                        betReason = `Smart AI: ${smartPred.reason}`;
                    }
                    
                    if (betSide) {
                        await bot.sendMessage(chatId, `⏰ ${nextIssue.slice(-5)} အတွက် 5 စက္ကန့်စောင့်ထိုး`);
                        await new Promise(r => setTimeout(r, 5000));
                        
                        const stillOpen = await isIssueStillOpen(nextIssue, data.token);
                        if (stillOpen) {
                            await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                        } else {
                            await bot.sendMessage(chatId, `⚠️ ${nextIssue.slice(-5)} ပိတ်သွားပြီ`);
                        }
                    }
                }

                // Send Status Message
                let modeText = "⚪ Manual";
                if (data.autoRunning) {
                    if (data.autoMode === 'follow') modeText = "🟢 Follow";
                    else if (data.autoMode === 'ai_correction') modeText = "🟡 AI Correction";
                    else if (data.autoMode === 'emerdlist') modeText = "🧠 Smart AI";
                }
                
                let statusMsg = `💥 BIGWIN VIP SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🎲 ${currentIssue} | ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI: ${data.last_pred}\n`;
                statusMsg += `📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `🏆 Wins: ${data.currentSessionWins}/${data.stopLimit}\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🚀 Next: ${nextIssue.slice(-5)}\n`;
                statusMsg += `🦸 ${data.last_pred === "Big" ? "ကြီး BIG" : "သေး SMALL"}\n`;

                await bot.sendMessage(chatId, statusMsg, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big", callback_data: "bet_Big" },
                        { text: "🔴 Small", callback_data: "bet_Small" }
                    ]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 800));
    }
}

// ========== MENUS ==========
const mainMenu = {
    reply_markup: {
        keyboard: [
            ["🚀 Start Auto", "🛑 Stop Auto"],
            ["⚙️ Settings", "📊 Status"],
            ["📜 Bet History", "📈 AI History"],
            ["🧠 Smart Prediction", "📉 Max Loss Streak"],
            ["🚪 Logout"]
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
            ["🔄 Follow Pattern"],
            ["🤖 AI Correction"],
            ["🧠 Smart AI Auto"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// ========== MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);

    if (data.settingMode) {
        const mode = data.settingMode;
        
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
                await bot.sendMessage(chatId, `✅ Bet Plan: ${numbers.join(' → ')}`);
            } else {
                await bot.sendMessage(chatId, "❌ ဥပမာ: 10,30,60,90,150");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                await bot.sendMessage(chatId, `✅ Stop Limit: ${num} ပွဲ`);
            } else {
                await bot.sendMessage(chatId, "❌ ဂဏန်းထည့်ပါ");
            }
        } else if (mode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start: ${num} ပွဲဆက်မှားမှထိုး`);
            } else {
                await bot.sendMessage(chatId, "❌ 1-10 ထည့်ပါ");
            }
        }
        
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚙️ Settings", settingsMenu);
    }

    // ========== MANUAL BET - ပမာဏထည့်ပြီး အလိုအလျောက် နောက်ပွဲစဉ်ထိုး ==========
    if (data.pendingManualBet && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        if (amount < 10) {
            await bot.sendMessage(chatId, "❌ အနည်းဆုံး 10 MMK");
            return;
        }
        
        const side = data.pendingManualBet;
        data.pendingManualBet = null;
        saveUserData(chatId, data);
        
        // အလိုအလျောက် နောက်ပွဲစဉ်ရှာပြီးထိုး
        await placeManualBet(chatId, side, amount);
        return;
    }

    if (text === '/start') {
        data.running = false; data.token = null; data.autoRunning = false; data.manualBetLock = false;
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }

    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးပါ:", autoModeMenu);
    }

    if (text === "🔄 Follow Pattern") {
        data.autoRunning = true;
        data.autoMode = 'follow';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Follow Mode Start`, mainMenu);
    }

    if (text === "🤖 AI Correction") {
        data.autoRunning = true;
        data.autoMode = 'ai_correction';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ AI Correction Start\nLoss Limit: ${data.lossStartLimit} ပွဲ`, mainMenu);
    }

    if (text === "🧠 Smart AI Auto") {
        data.autoRunning = true;
        data.autoMode = 'emerdlist';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Smart AI Auto Start`, mainMenu);
    }

    if (text === "🛑 Stop Auto") {
        data.autoRunning = false;
        data.autoMode = null;
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Auto Stopped", mainMenu);
    }

    if (text === "⚙️ Settings") {
        return bot.sendMessage(chatId, "⚙️ Settings", settingsMenu);
    }

    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `Bet Plan ထည့်ပါ\nလက်ရှိ: ${data.betPlan.join(' → ')}`);
    }

    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `Stop Limit ထည့်ပါ\nလက်ရှိ: ${data.stopLimit}`);
    }

    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `Loss Start Limit ထည့်ပါ (1-10)\nလက်ရှိ: ${data.lossStartLimit}`);
    }

    if (text === "🔙 Main Menu") {
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }

    if (text === "📊 Status") {
        let mode = data.autoRunning ? data.autoMode : "Manual";
        let status = `📊 Status\n━━━━━━━━━━\n`;
        status += `Mode: ${mode}\n`;
        status += `Bet Plan: ${data.betPlan.join(' → ')}\n`;
        status += `Stop Limit: ${data.stopLimit}\n`;
        status += `Step: ${data.currentBetStep+1}/${data.betPlan.length}\n`;
        status += `Session Wins: ${data.currentSessionWins}/${data.stopLimit}\n`;
        status += `Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
        status += `Max Loss: ${data.maxLossStreak} ပွဲ`;
        return bot.sendMessage(chatId, status);
    }

    if (text === "📜 Bet History") {
        const d = getUserData(chatId);
        let txt = `📜 Bet History\nProfit: ${d.totalProfit.toFixed(2)} MMK\nWins: ${d.totalWinsAllTime}\n------------------\n`;
        if (d.betHistory.length === 0) {
            txt += "မရှိသေး";
        } else {
            d.betHistory.slice(0, 15).forEach(h => {
                txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount}\n`;
            });
        }
        return bot.sendMessage(chatId, txt);
    }

    if (text === "📈 AI History") {
        const d = getUserData(chatId);
        if (!d.aiLogs || d.aiLogs.length === 0) return bot.sendMessage(chatId, "မရှိသေး");
        
        let wins = d.aiLogs.filter(l => l.status === "✅").length;
        let txt = `📈 AI History\n${wins}/${d.aiLogs.length} (${((wins/d.aiLogs.length)*100).toFixed(1)}%)\n━━━━━━━━━━\n`;
        d.aiLogs.slice(0, 20).forEach(log => {
            txt += `${log.status} ${log.issue} | ${log.prediction}→${log.result}\n`;
        });
        return bot.sendMessage(chatId, txt);
    }

    if (text === "🧠 Smart Prediction") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ");
        
        await bot.sendMessage(chatId, "⏳ ခွဲခြမ်းစိတ်ဖြာနေ...");
        const prediction = await getSmartPrediction(chatId, data.token);
        const issues = await getCurrentAndNextIssue(data.token);
        
        let msg = `🧠 Smart AI\n━━━━━━━━━━\n`;
        msg += `🎯 နောက်ပွဲ: ${issues?.nextIssue?.slice(-5) || 'N/A'}\n`;
        msg += `💡 ခန့်မှန်း: ${prediction.prediction === "Big" ? "🔵 BIG" : "🔴 SMALL"}\n`;
        msg += `📊 Confidence: ${prediction.confidence}%\n`;
        msg += `📝 ${prediction.reason}\n`;
        
        await bot.sendMessage(chatId, msg, {
            reply_markup: { inline_keyboard: [[
                { text: `💰 ${prediction.prediction} ထိုးမည်`, callback_data: `bet_${prediction.prediction}` }
            ]] }
        });
        return;
    }

    if (text === "📉 Max Loss Streak") {
        const d = getUserData(chatId);
        if (!d.aiLogs || d.aiLogs.length === 0) return bot.sendMessage(chatId, "မရှိသေး");
        return bot.sendMessage(chatId, `📉 Max Loss Streak: ${d.maxLossStreak} ပွဲဆက်`);
    }

    if (text === "🚪 Logout") {
        data.running = false; data.token = null; data.autoRunning = false;
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. /start");
    }

    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password:");
    }

    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.phone = data.tempPhone;
            data.running = true;
            delete data.tempPhone;
            resetAutoSession(data);
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

// ========== CALLBACK HANDLER ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const action = query.data;
    const data = getUserData(chatId);
    
    if (action.startsWith('bet_')) {
        const side = action.split('_')[1];
        data.pendingManualBet = side;
        saveUserData(chatId, data);
        
        await bot.sendMessage(chatId, `💰 ${side === "Big" ? "BIG 🔵" : "SMALL 🔴"} ပမာဏထည့်ပါ:\n(အနည်းဆုံး 10 MMK)`);
        await bot.answerCallbackQuery(query.id);
    }
});

// ========== HTTP SERVER ==========
http.createServer((req, res) => {
    if (req.url === `/bot${token}` && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { bot.processUpdate(JSON.parse(body)); res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
            catch (e) { res.writeHead(400); res.end(); }
        });
    } else { res.writeHead(200); res.end('WinGo Sniper Pro'); }
}).listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

console.log("✅ Bot Ready - Manual Bet: ပမာဏထည့်ပြီး နောက်ပွဲစဉ်ကို အလိုအလျောက်ထိုးပေး");
