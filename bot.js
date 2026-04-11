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

// Webhook Set for Render
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
            stopLimit: 3, lossStartLimit: 1,
            totalProfit: 0,
            currentBetStep: 0, consecutiveWins: 0, consecutiveLosses: 0,
            last_issue: null, last_pred: null,
            manualBetLock: false, manualBetIssue: null,
            betHistory: [],
            aiLogs: [],
            bettingInProgress: null,
            emerdListData: { hotNumbers: [], coldNumbers: [], lastAnalysis: null, lastReason: "" }
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
    let prediction = null;
    if(streak === 1) prediction = currentSide;
    else if(streak === 2) prediction = currentSide;
    else if(streak >= 3) prediction = currentSide === "Big" ? "Small" : "Big";
    return { side: prediction || "Big", dragon: streak };
}

// ========== နောက်ပွဲစဉ် တိကျစွာ ရယူခြင်း ==========
async function getNextIssue(chatId, token) {
    try {
        const res = await callApi("GetGameIssue", { typeId: 30 }, token);
        if (res?.msgCode === 0 && res.data?.issueNumber) {
            return (BigInt(res.data.issueNumber) + 1n).toString();
        }
    } catch (e) {}
    
    const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, token);
    if (historyRes?.data?.list?.length > 0) {
        return (BigInt(historyRes.data.list[0].issueNumber) + 1n).toString();
    }
    return null;
}

// ========== 🆕 ၅ စက္ကန့် စောင့်ပြီးမှ ထိုး (30 Sec Game) ==========
async function waitForBetWindow(chatId, expectedIssue, maxWaitMs = 10000) {
    const data = getUserData(chatId);
    const startTime = Date.now();
    
    // အဆင့် ၁: ပွဲစဖို့ စောင့် (အများဆုံး ၄ စက္ကန့်)
    let issueStarted = false;
    while (Date.now() - startTime < 4000) {
        const res = await callApi("GetGameIssue", { typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.issueNumber === expectedIssue) {
            issueStarted = true;
            console.log(`✅ Issue ${expectedIssue.slice(-5)} started`);
            break;
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    if (!issueStarted) {
        console.log(`⚠️ Issue ${expectedIssue.slice(-5)} not started within 4s`);
        return false;
    }
    
    // အဆင့် ၂: ပွဲစပြီး ၅ စက္ကန့် ထပ်စောင့် (API လက်ခံချိန်)
    console.log(`⏰ Waiting 5s for bet window...`);
    await new Promise(r => setTimeout(r, 5000));
    
    // အဆင့် ၃: ပွဲပိတ်ခါနီး မဟုတ်ကြောင်း အတည်ပြု
    const checkRes = await callApi("GetGameIssue", { typeId: 30 }, data.token);
    if (checkRes?.msgCode === 0 && checkRes.data?.issueNumber === expectedIssue) {
        console.log(`✅ Bet window ready for ${expectedIssue.slice(-5)}`);
        return true;
    }
    
    console.log(`⚠️ Issue ${expectedIssue.slice(-5)} may be closed`);
    return false;
}

// ========== GetMyEmerdList နဲ့ Bet Status စစ်ဆေးခြင်း ==========
async function checkBetStatus(chatId, targetIssue = null) {
    const data = getUserData(chatId);
    if (!data || !data.token) return { hasPending: false, hasBetOnIssue: false };
    
    const res = await callApi("GetMyEmerdList", { typeId: 30, pageNo: 1, pageSize: 20 }, data.token);
    
    if (res?.msgCode === 0 && res.data?.list) {
        const betList = res.data.list;
        const pendingBet = betList.find(bet => bet.state === "0");
        let betOnIssue = null;
        if (targetIssue) {
            betOnIssue = betList.find(bet => bet.issueNumber === targetIssue);
        }
        syncLocalBetHistory(chatId, betList);
        return { hasPending: !!pendingBet, hasBetOnIssue: !!betOnIssue, pendingBet, betOnIssue };
    }
    return { hasPending: false, hasBetOnIssue: false };
}

function syncLocalBetHistory(chatId, apiBets) {
    const data = getUserData(chatId);
    apiBets.forEach(apiBet => {
        const issueShort = apiBet.issueNumber.slice(-5);
        const existingBet = data.betHistory.find(b => b.issue === issueShort);
        const side = apiBet.selectType === "big" ? "Big" : "Small";
        
        if (!existingBet) {
            const status = apiBet.state === "0" ? "⏳ Pending" : apiBet.state === "1" ? "✅ WIN" : "❌ LOSS";
            data.betHistory.push({
                issue: issueShort, side, amount: apiBet.amount, status,
                pnl: apiBet.state === "1" ? apiBet.profitAmount : (apiBet.state === "2" ? -Math.abs(apiBet.amount) : 0),
                isAuto: true, timestamp: apiBet.addTime
            });
        } else {
            if (apiBet.state === "1") { existingBet.status = "✅ WIN"; existingBet.pnl = apiBet.profitAmount; }
            else if (apiBet.state === "2") { existingBet.status = "❌ LOSS"; existingBet.pnl = -Math.abs(apiBet.amount); }
        }
    });
    data.totalProfit = data.betHistory.filter(b => b.status !== "⏳ Pending").reduce((sum, b) => sum + (b.pnl || 0), 0);
    saveUserData(chatId, data);
}

// ========== GetEmerdList Hot/Cold Analysis ==========
async function getEmerdListPrediction(chatId, token) {
    try {
        const statsRes = await callApi("GetEmerdList", { typeId: 30, gameType: 2 }, token);
        const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, token);
        if (statsRes?.msgCode === 0 && historyRes?.msgCode === 0) {
            const freqData = statsRes.data.find(d => d.type === 1);
            const missingData = statsRes.data.find(d => d.type === 2);
            let hotNumbers = [], coldNumbers = [];
            if (freqData) {
                const freqList = [];
                for(let i=0; i<=9; i++) freqList.push({ num: i, val: freqData[`number_${i}`] });
                freqList.sort((a,b) => b.val - a.val);
                hotNumbers = freqList.slice(0, 3).map(i => i.num);
            }
            if (missingData) {
                const missList = [];
                for(let i=0; i<=9; i++) missList.push({ num: i, val: missingData[`number_${i}`] });
                missList.sort((a,b) => b.val - a.val);
                coldNumbers = missList.slice(0, 3).map(i => i.num);
            }
            const history = historyRes.data.list;
            const lastRound = history[0];
            const lastNumber = parseInt(lastRound.number);
            const lastResult = getSideFromNumber(lastNumber);
            const resultsLast10 = history.slice(0, 10).map(i => getSideFromNumber(i.number));
            let bigCount = resultsLast10.filter(r => r === 'Big').length;
            let smallCount = resultsLast10.filter(r => r === 'Small').length;
            const isLastNumberHot = hotNumbers.includes(lastNumber);
            const isLastNumberCold = coldNumbers.includes(lastNumber);
            let finalPrediction = lastResult, reason = "";
            
            if (isLastNumberCold) {
                finalPrediction = lastResult === "Big" ? "Small" : "Big";
                reason = `❄️ Cold Number (${lastNumber}) ဖြစ်နေ၍ ပြောင်းပြန်ထိုး`;
            } else if (isLastNumberHot) {
                finalPrediction = lastResult;
                reason = `🔥 Hot Number (${lastNumber}) ဆက်ကျနေ၍ ဆက်လိုက်ထိုး`;
            } else {
                if (bigCount >= 7) { finalPrediction = "Small"; reason = `📊 BIG ${bigCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`; }
                else if (smallCount >= 7) { finalPrediction = "Big"; reason = `📊 SMALL ${smallCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`; }
                else { reason = `📈 ပုံမှန် Trend အတိုင်း လိုက်ထိုး`; }
            }
            return { prediction: finalPrediction, reason };
        }
    } catch (e) {}
    return { prediction: "Big", reason: "ပုံသေ BIG ထိုးမည်" };
}

// ========== AI History Formatting ==========
function formatAIHistoryForVIP(aiLogs, limit = 8) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const recentLogs = aiLogs.slice(0, limit);
    let winCount = recentLogs.filter(l => l.status === "✅").length;
    let winRate = ((winCount / recentLogs.length) * 100).toFixed(1);
    let txt = `📈 AI မှတ်တမ်း (${recentLogs.length} ပွဲ) | ${winRate}%\n━━━━━━━━━━━━━━━━\n`;
    recentLogs.forEach((log) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🔵" : "🔴";
        let predEmoji = log.prediction === "Big" ? "🔵" : "🔴";
        txt += `${log.status} ${shortIssue} | ${predEmoji}→${resultEmoji} | ${log.number || ''}\n`;
    });
    return txt;
}

// ========== အမြန်ထိုးခြင်း Function ==========
async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;

    // ထိုးပြီးသားလား
    const alreadyBet = data.betHistory.find(b => b.issue === targetIssue.slice(-5) && b.status !== "⏳ Pending");
    if (alreadyBet) { console.log(`⚠️ Already bet on ${targetIssue.slice(-5)}`); return false; }
    
    // ထိုးနေတုန်းလား
    if (data.bettingInProgress) { console.log(`⚠️ Bet in progress`); return false; }
    data.bettingInProgress = targetIssue;
    saveUserData(chatId, data);

    // Local မှာ Pending သိမ်း
    const tempBet = {
        issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", pnl: 0,
        isAuto, autoStep: isAuto ? stepIndex : -1, reason: betReason, timestamp: new Date().toISOString()
    };
    data.betHistory.unshift(tempBet);
    if (!isAuto) { data.manualBetLock = true; data.manualBetIssue = targetIssue.slice(-5); }
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
        const typeText = isAuto ? `[AUTO ${data.autoMode || ''}]` : "[MANUAL]";
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        let successMsg = `✅ ${typeText} ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးပြီး!`;
        if (betReason) successMsg += `\n\n📝 ${betReason}`;
        await bot.sendMessage(chatId, successMsg);
        saveUserData(chatId, data);
        return true;
    } else {
        data.betHistory = data.betHistory.filter(b => b.issue !== targetIssue.slice(-5) || b.status !== "⏳ Pending");
        if (!isAuto) { data.manualBetLock = false; data.manualBetIssue = null; }
        saveUserData(chatId, data);
        
        if (res?.msg === "The current period is settled") {
            await bot.sendMessage(chatId, `⚠️ ပွဲစဉ် ${targetIssue.slice(-5)} ပိတ်သွားပါပြီ။`);
        } else if (res?.msg !== "Do not resubmit") {
            await bot.sendMessage(chatId, `❌ ထိုးမအောင်မြင်ပါ: ${res?.msg || 'Unknown'}`);
        }
        return false;
    }
}

// ========== 🆕 30 Sec Game - Fast Monitoring (5s Wait Window) ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;

        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 5, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;

            if (currentIssue !== data.last_issue) {
                console.log(`🆕 New issue: ${currentIssue}`);
                
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                const realNumber = lastRound.number;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                // Pending Bet Result Check
                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        data.totalProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            data.consecutiveWins++;
                            if (data.consecutiveWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit (${data.stopLimit} wins) ပြည့်။ Auto Bet ရပ်။`);
                                data.autoRunning = false; data.autoMode = null;
                                data.currentBetStep = 0; data.consecutiveWins = 0;
                            } else { data.currentBetStep = 0; }
                        } else { data.manualBetLock = false; }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        data.totalProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            data.consecutiveWins = 0;
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) { data.currentBetStep = nextStep; }
                            else {
                                await bot.sendMessage(chatId, `❌ Max step ရောက်။ Auto Bet ရပ်။`);
                                data.autoRunning = false; data.autoMode = null; data.currentBetStep = 0;
                            }
                        } else { data.manualBetLock = false; }
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // AI Prediction Tracking
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    data.aiLogs.unshift({ status: aiCorrect ? "✅" : "❌", issue: currentIssue.slice(-5), result: realSide, prediction: data.last_pred, number: realNumber });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    data.consecutiveLosses = aiCorrect ? 0 : data.consecutiveLosses + 1;
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // New AI Signal
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveUserData(chatId, data);

                // 🆕 Auto Bet - ၅ စက္ကန့်စောင့်ပြီးမှ ထိုး
                if (data.autoRunning && !data.manualBetLock) {
                    let betSide = null, betAmount = data.betPlan[data.currentBetStep], betReason = "";
                    
                    if (data.autoMode === 'follow') {
                        betSide = realSide;
                        betReason = `🔄 Follow - ${realSide} လိုက်ထိုး`;
                    } else if (data.autoMode === 'ai_correction') {
                        if (data.consecutiveLosses >= data.lossStartLimit) {
                            betSide = data.last_pred;
                            betReason = `🤖 AI Correction - ${data.consecutiveLosses} ပွဲဆက်မှား၍ ထိုး`;
                        }
                    } else if (data.autoMode === 'emerdlist') {
                        const pred = await getEmerdListPrediction(chatId, data.token);
                        betSide = pred.prediction;
                        betReason = `🧠 GetEmerdList - ${pred.reason}`;
                    }
                    
                    if (betSide) {
                        // ⏰ ၅ စက္ကန့် စောင့်ပြီးမှ ထိုး
                        await bot.sendMessage(chatId, `⏰ ပွဲစဉ် ${nextIssue.slice(-5)} အတွက် ၅ စက္ကန့်စောင့်ပြီး ထိုးပါမည်...`);
                        const betWindowReady = await waitForBetWindow(chatId, nextIssue, 10000);
                        
                        if (betWindowReady) {
                            await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                        } else {
                            // ၅ စက္ကန့် မစောင့်နိုင်ရင် ချက်ချင်းထိုး
                            await bot.sendMessage(chatId, `⚠️ အချိန်မမီ၍ ချက်ချင်းထိုးပါမည်...`);
                            await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                        }
                    }
                }

                // Send VIP Signal
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', hour12: false });
                let modeText = "⚪️ Manual";
                if (data.autoRunning) {
                    if (data.autoMode === 'follow') modeText = "🟢 Follow";
                    else if (data.autoMode === 'ai_correction') modeText = "🟡 AI Correction";
                    else if (data.autoMode === 'emerdlist') modeText = "🧠 GetEmerdList";
                }
                
                let statusMsg = `💥 BIGWIN VIP SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue}\n🎲 Result: ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI Pred: ${data.last_pred}\n📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n🚀 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                statusMsg += `🦸 ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n${formatAIHistoryForVIP(data.aiLogs, 6)}`;

                await bot.sendMessage(chatId, statusMsg, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big", callback_data: "bet_Big" },
                        { text: "🔴 Small", callback_data: "bet_Small" }
                    ]] }
                });
            }
        }
        
        // 800ms စောင့် (Rate Limit မဖြစ်အောင်)
        await new Promise(r => setTimeout(r, 800));
    }
}

// ========== MENUS ==========
const mainMenu = {
    reply_markup: {
        keyboard: [
            ["🚀 Start Auto", "🛑 Stop Auto"],
            ["📊 Status", "📜 Bet History"],
            ["🚪 Logout"]
        ],
        resize_keyboard: true
    }
};

const autoModeMenu = {
    reply_markup: {
        keyboard: [
            ["🔄 Follow Pattern"],
            ["🤖 AI Correction"],
            ["🧠 GetEmerdList Auto"],
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

    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const nextIssue = await getNextIssue(chatId, data.token);
        if (!nextIssue) { await bot.sendMessage(chatId, "❌ ပွဲစဉ်ရယူ၍မရပါ။"); data.pendingSide = null; saveUserData(chatId, data); return; }
        await placeBetNow(chatId, data.pendingSide, amount, nextIssue, -1, false, "ကိုယ်တိုင်ထိုး");
        data.pendingSide = null; saveUserData(chatId, data);
        return;
    }

    if (text === '/start') {
        data.running = false; data.token = null; data.autoRunning = false; data.manualBetLock = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo 30 Sec - 5s Wait Window 🎯\n\n⏰ ပွဲစပြီး ၅ စက္ကန့်စောင့်ပြီးမှ ထိုးပါမည်။\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }

    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ။");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးပါ:", autoModeMenu);
    }

    if (text === "🔄 Follow Pattern") {
        data.autoRunning = true; data.autoMode = 'follow'; data.currentBetStep = 0;
        data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ Follow Mode Started! (5s Wait)", mainMenu);
    }

    if (text === "🤖 AI Correction") {
        data.autoRunning = true; data.autoMode = 'ai_correction'; data.currentBetStep = 0;
        data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ AI Correction Started! (5s Wait)", mainMenu);
    }

    if (text === "🧠 GetEmerdList Auto") {
        data.autoRunning = true; data.autoMode = 'emerdlist'; data.currentBetStep = 0;
        data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ GetEmerdList Auto Started! (5s Wait)", mainMenu);
    }

    if (text === "🛑 Stop Auto") {
        data.autoRunning = false; data.autoMode = null; saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Stopped!", mainMenu);
    }

    if (text === "📊 Status") {
        let mode = data.autoRunning ? data.autoMode : "Manual";
        return bot.sendMessage(chatId, `📊 Mode: ${mode}\n💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n📋 Step: ${data.currentBetStep+1}/${data.betPlan.length}`);
    }

    if (text === "📜 Bet History") {
        await checkBetStatus(chatId);
        const d = getUserData(chatId);
        let txt = `📜 Bet History\n💰 Total: ${d.totalProfit.toFixed(2)} MMK\n------------------\n`;
        d.betHistory.slice(0, 15).forEach(h => {
            txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount} (${h.pnl>=0?'+':''}${h.pnl})\n`;
        });
        return bot.sendMessage(chatId, txt || "No history");
    }

    if (text === "🚪 Logout") {
        data.running = false; data.token = null; data.autoRunning = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out.");
    }

    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text; saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password:");
    }

    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.phone = data.tempPhone; data.running = true; delete data.tempPhone;
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ Login Success! 5s Wait Mode Ready!", mainMenu);
        } else {
            await bot.sendMessage(chatId, "❌ Login Failed!"); delete data.tempPhone; saveUserData(chatId, data);
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
        data.pendingSide = action.split('_')[1];
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 ${data.pendingSide} အတွက် ပမာဏ ရိုက်ထည့်ပါ:`);
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
    } else { res.writeHead(200); res.end('WinGo 30 Sec - 5s Wait Bot'); }
}).listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

console.log("✅ Bot initialized - 30 Sec Game with 5s Wait Window");
