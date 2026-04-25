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

// ========== EXTRA BOT (အစီရင်ခံစာ ပို့ရန်) ==========
const EXTRA_BOT_TOKEN = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const EXTRA_BOT_CHAT_ID = '6545674873';
const extraBot = new TelegramBot(EXTRA_BOT_TOKEN, { polling: false });

// ========== PUBLIC CHANNEL (User အားလုံး မြင်ရန်) ==========
// ဒီနေရာမှာ Public Channel ID ထည့်ပါ (ဥပမာ -1001234567890)
// မရှိသေးရင် extra bot ထဲကိုပဲ ပို့မှာပါ
const PUBLIC_CHANNEL_ID = process.env.PUBLIC_CHANNEL_ID || EXTRA_BOT_CHAT_ID;

const bot = new TelegramBot(token);

bot.setWebHook(`${APP_URL}/bot${token}`).then(() => {
    console.log(`✅ Webhook set`);
}).catch(e => console.error('Webhook error:', e.message));

// ========== LOCAL STORAGE ==========
const DATA_FILE = path.join(__dirname, 'user_data.json');
const PUBLIC_DATA_FILE = path.join(__dirname, 'public_data.json');

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

// Public data for all users to see
function loadPublicData() {
    try {
        if (fs.existsSync(PUBLIC_DATA_FILE)) {
            return JSON.parse(fs.readFileSync(PUBLIC_DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return { globalBetHistory: [], globalAILogs: [], globalSignals: [], activeUsers: {} };
}

function savePublicData(data) {
    try {
        fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

let allUsers = loadAllData();
let publicData = loadPublicData();

function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3,
            lossStartLimit: 1,
            totalProfit: 0,
            totalWins: 0,
            sessionWins: 0,
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
            emerdListData: { hotNumbers: [], coldNumbers: [], lastAnalysis: null, lastReason: "" },
            tempPhone: null,
            pendingSide: null,
            username: null,
            nickname: null // User နာမည်ပြောင်
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

function saveUserData(chatId, data) {
    allUsers[chatId] = data;
    saveAllData(allUsers);
}

// ========== PUBLIC DATA HELPERS ==========
function addToPublicHistory(betDetail, username) {
    publicData.globalBetHistory.unshift({
        ...betDetail,
        username: username || "Anonymous",
        time: new Date().toISOString()
    });
    if (publicData.globalBetHistory.length > 200) {
        publicData.globalBetHistory = publicData.globalBetHistory.slice(0, 200);
    }
    savePublicData(publicData);
}

function addToPublicAILogs(aiLog, username) {
    publicData.globalAILogs.unshift({
        ...aiLog,
        username: username || "Anonymous",
        time: new Date().toISOString()
    });
    if (publicData.globalAILogs.length > 200) {
        publicData.globalAILogs = publicData.globalAILogs.slice(0, 200);
    }
    savePublicData(publicData);
}

function addToPublicSignals(signalData) {
    publicData.globalSignals.unshift({
        ...signalData,
        time: new Date().toISOString()
    });
    if (publicData.globalSignals.length > 50) {
        publicData.globalSignals = publicData.globalSignals.slice(0, 50);
    }
    savePublicData(publicData);
}

function updateActiveUser(chatId, username) {
    publicData.activeUsers[chatId] = {
        username: username || "Unknown",
        lastActive: new Date().toISOString()
    };
    savePublicData(publicData);
}

// ========== EXTRA BOT REPORT (အားလုံးမြင်ရအောင် Public ပါ ပို့) ==========
async function sendToExtraBot(chatId, userData, betDetail) {
    try {
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });
        const userDisplay = userData.username ? `95****${userData.username.slice(-3)}` : `User: ***`;
        const nickname = userData.nickname || userDisplay;
        
        // Add to public data
        addToPublicHistory({
            issue: betDetail.issue,
            side: betDetail.side,
            amount: betDetail.amount,
            status: betDetail.status,
            pnl: betDetail.pnl,
            resultNumber: betDetail.resultNumber,
            resultSide: betDetail.resultSide
        }, nickname);
        
        let msg = `📊 *WinGo Pro - ထိုးကြေးအစီရင်ခံစာ*\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🕐 *အချိန်:* ${now}\n`;
        msg += `👤 *အသုံးပြုသူ:* ${nickname}\n`;
        msg += `🎲 *ပွဲစဉ်:* ${betDetail.issue}\n`;
        msg += `🎯 *ထိုးသည့်ဘက်:* ${betDetail.side === "Big" ? "🔵 ကြီး" : "🔴 သေး"}\n`;
        msg += `💵 *ထိုးငွေ:* ${betDetail.amount} MMK\n`;
        msg += `📊 *ထွက်ဂဏန်း:* ${betDetail.resultNumber} (${betDetail.resultSide === "Big" ? "ကြီး" : "သေး"})\n`;
        msg += `📈 *ရလဒ်:* ${betDetail.status === "✅ WIN" ? "✅ နိုင်" : "❌ ရှုံး"}\n`;
        msg += `💰 *အမြတ်/အရှုံး:* ${betDetail.pnl >= 0 ? `+${betDetail.pnl}` : betDetail.pnl} MMK\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💰 *စုစုပေါင်းအမြတ်:* ${(userData.totalProfit || 0).toFixed(2)} MMK\n`;
        msg += `🏆 *စုစုပေါင်းနိုင်ပွဲ:* ${userData.totalWins || 0}\n`;
        if (userData.autoRunning) {
            msg += `🤖 *Auto Mode:* ${userData.autoMode === 'follow' ? 'Follow' : userData.autoMode === 'ai_correction' ? 'AI Correction' : 'GetEmerdList'}\n`;
            msg += `📋 *ထိုးအဆင့်:* ${(userData.currentBetStep || 0) + 1}/${userData.betPlan.length}\n`;
        }
        
        // Extra Bot ဆီ ပို့
        await extraBot.sendMessage(EXTRA_BOT_CHAT_ID, msg, { parse_mode: "Markdown" });
        
        // Public Channel ရှိရင်လည်း ပို့
        if (PUBLIC_CHANNEL_ID !== EXTRA_BOT_CHAT_ID) {
            try {
                await extraBot.sendMessage(PUBLIC_CHANNEL_ID, msg, { parse_mode: "Markdown" });
            } catch(e) {}
        }
        
        // ========== USER ဆီကိုလည်း ပြန်ပို့ပေးမယ် ==========
        try {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
        } catch(e) {
            // Markdown error ဖြစ်ရင် plain text နဲ့ ပို့
            await bot.sendMessage(chatId, msg.replace(/\*/g, ''));
        }
        
    } catch(e) {
        console.error('Extra bot send error:', e.message);
    }
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

function getAIWorstLossStreak(aiLogs) {
    if (!aiLogs || aiLogs.length === 0) return { maxStreak: 0, worstStreak: null, allStreaks: [] };
    let maxStreak = 0, currentStreak = 0, streakStartIndex = -1, maxStreakStartIndex = -1, maxStreakEndIndex = -1, allStreaks = [];
    for (let i = 0; i < aiLogs.length; i++) {
        if (aiLogs[i].status === "❌") {
            if (currentStreak === 0) streakStartIndex = i;
            currentStreak++;
            if (currentStreak > maxStreak) { maxStreak = currentStreak; maxStreakStartIndex = streakStartIndex; maxStreakEndIndex = i; }
        } else {
            if (currentStreak > 0) { allStreaks.push({ streak: currentStreak, startIssue: aiLogs[streakStartIndex]?.issue, endIssue: aiLogs[i-1]?.issue }); currentStreak = 0; }
        }
    }
    if (currentStreak > 0) allStreaks.push({ streak: currentStreak, startIssue: aiLogs[streakStartIndex]?.issue, endIssue: aiLogs[aiLogs.length-1]?.issue });
    let worstStreak = null;
    if (maxStreakStartIndex !== -1 && maxStreakEndIndex !== -1) {
        worstStreak = { streak: maxStreak, startIssue: aiLogs[maxStreakStartIndex]?.issue, endIssue: aiLogs[maxStreakEndIndex]?.issue, lossDetails: aiLogs.slice(maxStreakStartIndex, maxStreakEndIndex + 1) };
    }
    return { maxStreak, worstStreak, allStreaks };
}

function formatLossStreakReport(aiLogs) {
    const analysis = getAIWorstLossStreak(aiLogs);
    if (analysis.maxStreak === 0) return "✅ AI မှတ်တမ်းတွင် အမှားမရှိသေးပါ။";
    let report = `📉 **AI အမှားအများဆုံး ပွဲဆက် မှတ်တမ်း**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔥 **အဆိုးဆုံး အမှားအဆက်:** ${analysis.maxStreak} ပွဲဆက်\n\n`;
    if (analysis.worstStreak) {
        report += `📌 **စတင်သည့်ပွဲ:** ${analysis.worstStreak.startIssue}\n📌 **ပြီးဆုံးသည့်ပွဲ:** ${analysis.worstStreak.endIssue}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 **အသေးစိတ် မှတ်တမ်း:**\n\n`;
        analysis.worstStreak.lossDetails.forEach((loss, idx) => { report += `${idx+1}. ပွဲစဉ် ${loss.issue} | ခန့်: ${loss.prediction} | ထွက်: ${loss.result} (${loss.number})\n`; });
    }
    return report;
}

function formatLossStreakShort(aiLogs) {
    const analysis = getAIWorstLossStreak(aiLogs);
    if (analysis.maxStreak === 0) return "✅ အမှားမရှိ";
    return `🔥 အမှားအဆက်: ${analysis.maxStreak} ပွဲ (${analysis.worstStreak?.startIssue || 'N/A'} → ${analysis.worstStreak?.endIssue || 'N/A'})`;
}

async function getNextIssue(chatId, token) {
    try {
        const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, token);
        if (historyRes?.data?.list?.length > 0) {
            return (BigInt(historyRes.data.list[0].issueNumber) + 1n).toString();
        }
    } catch (e) {}
    return null;
}

async function waitForBetWindow(chatId, expectedIssue, maxWaitMs = 10000) {
    const data = getUserData(chatId);
    const startTime = Date.now();
    let issueStarted = false;
    while (Date.now() - startTime < 4000) {
        const res = await callApi("GetGameIssue", { typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.issueNumber === expectedIssue) { issueStarted = true; break; }
        await new Promise(r => setTimeout(r, 300));
    }
    if (!issueStarted) return false;
    await new Promise(r => setTimeout(r, 5000));
    const checkRes = await callApi("GetGameIssue", { typeId: 30 }, data.token);
    return checkRes?.msgCode === 0 && checkRes.data?.issueNumber === expectedIssue;
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
                const pnl = apiBet.state === "1" ? apiBet.profitAmount : (apiBet.state === "2" ? -Math.abs(apiBet.amount) : 0);
                data.betHistory.push({ 
                    issue: issueShort, 
                    side: apiBet.selectType === "big" ? "Big" : "Small", 
                    amount: apiBet.amount, 
                    status, 
                    pnl, 
                    isAuto: true, 
                    timestamp: apiBet.addTime 
                });
            } else {
                if (apiBet.state === "1") { existingBet.status = "✅ WIN"; existingBet.pnl = apiBet.profitAmount; }
                else if (apiBet.state === "2") { existingBet.status = "❌ LOSS"; existingBet.pnl = -Math.abs(apiBet.amount); }
            }
        });
        data.totalProfit = data.betHistory.filter(b => b.status !== "⏳ Pending").reduce((sum, b) => sum + (b.pnl || 0), 0);
        data.totalWins = data.betHistory.filter(b => b.status === "✅ WIN" && b.isAuto).length;
        saveUserData(chatId, data);
    }
}

async function getEmerdListPrediction(chatId, token) {
    try {
        const statsRes = await callApi("GetEmerdList", { typeId: 30, gameType: 2 }, token);
        const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, token);
        if (statsRes?.msgCode === 0 && historyRes?.msgCode === 0) {
            const freqData = statsRes.data.find(d => d.type === 1);
            const missingData = statsRes.data.find(d => d.type === 2);
            let hotNumbers = [], coldNumbers = [];
            if (freqData) { let freqList = []; for(let i=0;i<=9;i++) freqList.push({num:i, val:freqData[`number_${i}`]}); freqList.sort((a,b)=>b.val-a.val); hotNumbers = freqList.slice(0,3).map(i=>i.num); }
            if (missingData) { let missList = []; for(let i=0;i<=9;i++) missList.push({num:i, val:missingData[`number_${i}`]}); missList.sort((a,b)=>b.val-a.val); coldNumbers = missList.slice(0,3).map(i=>i.num); }
            const history = historyRes.data.list;
            const lastRound = history[0];
            const lastNumber = parseInt(lastRound.number);
            const lastResult = getSideFromNumber(lastNumber);
            const resultsLast10 = history.slice(0,10).map(i=>getSideFromNumber(i.number));
            let bigCount = resultsLast10.filter(r=>r==='Big').length;
            let smallCount = resultsLast10.filter(r=>r==='Small').length;
            const isLastNumberHot = hotNumbers.includes(lastNumber);
            const isLastNumberCold = coldNumbers.includes(lastNumber);
            let finalPrediction = lastResult, reason = "";
            if (isLastNumberCold) { finalPrediction = lastResult === "Big" ? "Small" : "Big"; reason = `❄️ Cold Number (${lastNumber}) ဖြစ်နေ၍ ပြောင်းပြန်ထိုး`; }
            else if (isLastNumberHot) { finalPrediction = lastResult; reason = `🔥 Hot Number (${lastNumber}) ဆက်ကျနေ၍ ဆက်လိုက်ထိုး`; }
            else { if (bigCount>=7) { finalPrediction = "Small"; reason = `📊 BIG ${bigCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`; } else if (smallCount>=7) { finalPrediction = "Big"; reason = `📊 SMALL ${smallCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`; } else { reason = `📈 ပုံမှန် Trend အတိုင်း လိုက်ထိုး`; } }
            return { prediction: finalPrediction, reason };
        }
    } catch(e) {}
    return { prediction: "Big", reason: "ပုံသေ BIG ထိုးမည်" };
}

function formatAIHistoryForVIP(aiLogs, limit = 20) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const recentLogs = aiLogs.slice(0, limit);
    let winCount = recentLogs.filter(l => l.status === "✅").length;
    let winRate = ((winCount / recentLogs.length) * 100).toFixed(1);
    let txt = `📈 AI မှတ်တမ်း (${recentLogs.length} ပွဲ) | မှန်နှုန်း: ${winRate}%\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    recentLogs.forEach((log) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🏞️ကြီး" : "🌄သေး";
        let predEmoji = log.prediction === "Big" ? "🏞️ကြီး" : "🌄သေး";
        txt += `${log.status} ${shortIssue} | ${predEmoji}→${resultEmoji} | ${log.number || ''}\n`;
    });
    return txt;
}

// ========== PUBLIC DASHBOARD FORMATTERS ==========
function formatGlobalBetHistory() {
    if (publicData.globalBetHistory.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    
    // Total profit from all users
    const totalProfit = publicData.globalBetHistory
        .filter(b => b.pnl)
        .reduce((sum, b) => sum + b.pnl, 0);
    
    // Win rate
    const finished = publicData.globalBetHistory.filter(b => b.status !== "⏳ Pending");
    const wins = finished.filter(b => b.status === "✅ WIN").length;
    const winRate = finished.length > 0 ? ((wins / finished.length) * 100).toFixed(1) : 0;
    
    let txt = `🌍 *GLOBAL BET HISTORY*\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    txt += `👥 Users: ${Object.keys(publicData.activeUsers).length}\n`;
    txt += `💰 Total Profit: ${totalProfit.toFixed(2)} MMK\n`;
    txt += `📈 Win Rate: ${winRate}% (${wins}/${finished.length})\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    
    publicData.globalBetHistory.slice(0, 20).forEach(b => {
        const emoji = b.status === "✅ WIN" ? "✅" : b.status === "❌ LOSS" ? "❌" : "⏳";
        const pnl = b.pnl ? ` (${b.pnl >= 0 ? '+' : ''}${b.pnl.toFixed(2)})` : '';
        txt += `${emoji} ${b.username} | ${b.issue} | ${b.side} | ${b.amount}${pnl}\n`;
    });
    
    return txt;
}

function formatGlobalAILogs() {
    if (publicData.globalAILogs.length === 0) return "📊 AI မှတ်တမ်းမရှိသေးပါ";
    
    const total = publicData.globalAILogs.length;
    const correct = publicData.globalAILogs.filter(l => l.status === "✅").length;
    const rate = ((correct / total) * 100).toFixed(1);
    
    let txt = `🤖 *GLOBAL AI LOGS*\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    txt += `📊 တိကျမှု: ${rate}% (${correct}/${total})\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    
    publicData.globalAILogs.slice(0, 20).forEach((log) => {
        txt += `${log.status} ${log.username} | ${log.issue} | ${log.prediction}→${log.result} | ${log.number || ''}\n`;
    });
    
    return txt;
}

function formatActiveSignals() {
    if (publicData.globalSignals.length === 0) return "📡 Signal မရှိသေးပါ";
    
    let txt = `📡 *LATEST SIGNALS*\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    
    publicData.globalSignals.slice(0, 10).forEach(s => {
        txt += `🔮 ${s.username} | ${s.issue} | ${s.prediction === "Big" ? "🔵BIG" : "🔴SMALL"}\n`;
        txt += `   ↳ AI: ${s.aiPred} | Mode: ${s.mode}\n`;
    });
    
    return txt;
}

async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;
    if (data.betHistory.find(b => b.issue === targetIssue.slice(-5) && b.status !== "⏳ Pending")) return false;
    if (data.bettingInProgress) return false;
    data.bettingInProgress = targetIssue;
    saveUserData(chatId, data);
    const tempBet = { issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", pnl: 0, isAuto, autoStep: isAuto ? stepIndex : -1, reason: betReason, timestamp: new Date().toISOString() };
    data.betHistory.unshift(tempBet);
    if (!isAuto) { data.manualBetLock = true; data.manualBetIssue = targetIssue.slice(-5); }
    saveUserData(chatId, data);
    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    const selectType = side === "Big" ? 13 : 14;
    const betPayload = { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: baseUnit, betCount: betCount, selectType: selectType, isAgree: true };
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
        if (res?.msg === "The current period is settled") await bot.sendMessage(chatId, `⚠️ ပွဲစဉ် ${targetIssue.slice(-5)} ပိတ်သွားပါပြီ။`);
        else if (res?.msg !== "Do not resubmit") await bot.sendMessage(chatId, `❌ ထိုးမအောင်မြင်ပါ: ${res?.msg || 'Unknown'}`);
        return false;
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
            const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
            const realNumber = lastRound.number;
            const nextIssue = (BigInt(currentIssue) + 1n).toString();
            
            if (currentIssue !== data.last_issue) {
                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                let betResult = null;
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    let pnlAmount = 0;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        pnlAmount = pendingBet.pnl;
                        data.totalProfit += pnlAmount;
                        if (pendingBet.isAuto) {
                            data.sessionWins++;
                            data.totalWins++;
                            data.consecutiveWins++;
                            data.consecutiveLosses = 0;
                            if (data.sessionWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit ပြည့်ပါပြီ! (${data.stopLimit} ပွဲနိုင်)`);
                                data.autoRunning = false; data.autoMode = null; data.currentBetStep = 0; data.consecutiveWins = 0; data.sessionWins = 0;
                            } else { data.currentBetStep = 0; }
                        } else { data.manualBetLock = false; data.manualBetIssue = null; }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        pnlAmount = pendingBet.pnl;
                        data.totalProfit += pnlAmount;
                        if (pendingBet.isAuto) {
                            data.consecutiveWins = 0;
                            data.consecutiveLosses++;
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) data.currentBetStep = nextStep;
                            else { 
                                await bot.sendMessage(chatId, `❌ Max step ရောက်။ Auto Bet ရပ်။`); 
                                data.autoRunning = false; data.autoMode = null; data.currentBetStep = 0; data.sessionWins = 0; 
                            }
                        } else { data.manualBetLock = false; data.manualBetIssue = null; }
                    }
                    betResult = { ...pendingBet, resultNumber: realNumber, resultSide: realSide };
                    saveUserData(chatId, data);
                    
                    // Extra Bot + User ဆီ ပို့မယ်
                    await sendToExtraBot(chatId, data, betResult);
                    
                    // Update active user
                    updateActiveUser(chatId, data.nickname || `95****${(data.username || '').slice(-3)}`);
                    
                    data = getUserData(chatId);
                }
                
                // AI Log update
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    data.aiLogs.unshift({ status: aiCorrect ? "✅" : "❌", issue: currentIssue.slice(-5), result: realSide, prediction: data.last_pred, number: realNumber });
                    if (data.aiLogs.length > 100) data.aiLogs = data.aiLogs.slice(0, 100);
                    
                    // Add to public AI logs
                    const nickname = data.nickname || `95****${(data.username || '').slice(-3)}`;
                    addToPublicAILogs({
                        status: aiCorrect ? "✅" : "❌",
                        issue: currentIssue.slice(-5),
                        result: realSide,
                        prediction: data.last_pred,
                        number: realNumber
                    }, nickname);
                    
                    if (!pendingBet || !pendingBet.isAuto) {
                        data.consecutiveLosses = aiCorrect ? 0 : data.consecutiveLosses + 1;
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }
                
                // AI Prediction
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveUserData(chatId, data);
                
                // Auto bet logic
                if (data.autoRunning && !data.manualBetLock) {
                    let betSide = null, betAmount = data.betPlan[data.currentBetStep], betReason = "";
                    if (data.autoMode === 'follow') { betSide = realSide; betReason = `🔄 Follow - ${realSide} လိုက်ထိုး`; }
                    else if (data.autoMode === 'ai_correction') { if (data.consecutiveLosses >= data.lossStartLimit) { betSide = data.last_pred; betReason = `🤖 AI Correction - ${data.consecutiveLosses} ပွဲဆက်မှား၍ ထိုး`; } }
                    else if (data.autoMode === 'emerdlist') { const pred = await getEmerdListPrediction(chatId, data.token); betSide = pred.prediction; betReason = `🧠 GetEmerdList - ${pred.reason}`; }
                    if (betSide) {
                        await bot.sendMessage(chatId, `⏰ ပွဲစဉ် ${nextIssue.slice(-5)} အတွက် ၅ စက္ကန့်စောင့်ပြီး ထိုးပါမည်...`);
                        const betWindowReady = await waitForBetWindow(chatId, nextIssue, 10000);
                        await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                    }
                }
                
                // ========== VIP SIGNAL (User ဆီ + Public) ==========
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', hour12: false });
                const nickname = data.nickname || `User ${chatId.slice(-3)}`;
                let modeText = "⚪️ Manual";
                if (data.autoRunning) {
                    if (data.autoMode === 'follow') modeText = "🟢 Follow";
                    else if (data.autoMode === 'ai_correction') modeText = "🟡 AI Correction";
                    else if (data.autoMode === 'emerdlist') modeText = "🧠 GetEmerdList";
                }
                
                let statusMsg = `💥 *${nickname} - VIP SIGNAL* 💥\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue}\n`;
                statusMsg += `🎲 Result: ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI Pred: ${data.last_pred}\n`;
                statusMsg += `📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                const winsDisplay = data.autoRunning ? data.sessionWins : 0;
                statusMsg += `🏆 Wins: ${winsDisplay}/${data.stopLimit}\n`;
                
                const lossStreakShort = formatLossStreakShort(data.aiLogs);
                statusMsg += `📉 ${lossStreakShort}\n`;
                
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🚀 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                statusMsg += `🦸 ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                
                if (data.consecutiveLosses > 0) {
                    statusMsg += `⚠️ လက်ရှိအမှားဆက်: ${data.consecutiveLosses} ပွဲ\n`;
                }
                
                // Add to public signals
                addToPublicSignals({
                    username: nickname,
                    issue: currentIssue.slice(-5),
                    prediction: data.last_pred,
                    aiPred: data.last_pred,
                    mode: modeText,
                    profit: data.totalProfit.toFixed(2)
                });
                
                // Send to user
                await bot.sendMessage(chatId, statusMsg, { 
                    parse_mode: "Markdown",
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]
                        ] 
                    } 
                });
                
                // ========== PUBLIC CHANNEL ဆီလည်း ပို့ ==========
                try {
                    let publicMsg = `🌍 *PUBLIC SIGNAL* 🌍\n`;
                    publicMsg += `━━━━━━━━━━━━━━━━\n`;
                    publicMsg += `👤 ${nickname}\n`;
                    publicMsg += `🗓 ${currentIssue}\n`;
                    publicMsg += `🎲 ${realSide} (${realNumber})\n`;
                    publicMsg += `🔮 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                    publicMsg += `🦸 ခန့်မှန်း: ${data.last_pred === "Big" ? "BIG" : "SMALL"}\n`;
                    publicMsg += `📊 Mode: ${modeText}\n`;
                    publicMsg += `━━━━━━━━━━━━━━━━\n`;
                    publicMsg += `📈 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                    publicMsg += `📉 ${lossStreakShort}`;
                    
                    await extraBot.sendMessage(PUBLIC_CHANNEL_ID, publicMsg, { parse_mode: "Markdown" });
                } catch(e) {}
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
            ["🧠 GetEmerdList ခန့်မှန်း", "📉 Check AI Loss Streak"], 
            ["🌍 Global Dashboard", "👤 Set Nickname"],
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
    
    // ========== GLOBAL DASHBOARD (/start လုပ်ရင် အားလုံးမြင်ရ) ==========
    if (text === '/start') {
        data.running=false; 
        data.token=null; 
        data.autoRunning=false; 
        data.manualBetLock=false; 
        data.sessionWins=0; 
        data.totalWins=0; 
        data.betHistory=[]; 
        data.aiLogs=[];
        data.totalProfit=0;
        delete data.settingMode;
        delete data.tempPhone;
        delete data.pendingSide;
        delete data.username;
        saveUserData(chatId,data);
        
        // ========== PUBLIC DASHBOARD ပြမယ် ==========
        let welcomeMsg = `🎯 *WinGo Sniper Pro* 🎯\n`;
        welcomeMsg += `━━━━━━━━━━━━━━━━\n`;
        welcomeMsg += `⏰ 30 Sec Game - AI Signal\n`;
        welcomeMsg += `⚙️ Settings အပြည့်အစုံ\n`;
        welcomeMsg += `📊 AI History 20 ပွဲ\n`;
        welcomeMsg += `📉 Loss Streak အမြဲပြမည်\n\n`;
        welcomeMsg += `🌍 *GLOBAL STATS* 🌍\n`;
        welcomeMsg += `👥 Active Users: ${Object.keys(publicData.activeUsers).length}\n`;
        welcomeMsg += `📈 Total Bets: ${publicData.globalBetHistory.length}\n`;
        welcomeMsg += `━━━━━━━━━━━━━━━━\n\n`;
        welcomeMsg += `ဖုန်းနံပါတ်ပေးပါ (သို့မဟုတ် အောက်က Global Dashboard ကြည့်ပါ):`;
        
        await bot.sendMessage(chatId, welcomeMsg, { parse_mode: "Markdown" });
        
        // Global Bet History ပြ
        const globalBets = formatGlobalBetHistory();
        await bot.sendMessage(chatId, globalBets, { parse_mode: "Markdown" });
        
        // Global AI Logs ပြ
        const globalAI = formatGlobalAILogs();
        await bot.sendMessage(chatId, globalAI, { parse_mode: "Markdown" });
        
        // Active Signals ပြ
        const activeSignals = formatActiveSignals();
        await bot.sendMessage(chatId, activeSignals, { parse_mode: "Markdown" });
        
        return bot.sendMessage(chatId, "🔐 ဆက်လက်အသုံးပြုရန် ဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }
    
    // ========== GLOBAL DASHBOARD BUTTON ==========
    if (text === "🌍 Global Dashboard") {
        await bot.sendMessage(chatId, "🌍 *GLOBAL DASHBOARD*", { parse_mode: "Markdown" });
        
        const globalBets = formatGlobalBetHistory();
        await bot.sendMessage(chatId, globalBets, { parse_mode: "Markdown" });
        
        const globalAI = formatGlobalAILogs();
        await bot.sendMessage(chatId, globalAI, { parse_mode: "Markdown" });
        
        const activeSignals = formatActiveSignals();
        await bot.sendMessage(chatId, activeSignals, { parse_mode: "Markdown" });
        
        return;
    }
    
    // ========== SET NICKNAME ==========
    if (text === "👤 Set Nickname") {
        data.settingMode = "nickname";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 သင်ပြချင်တဲ့ နာမည်ပြောင်ထည့်ပါ:");
    }
    
    if (data.settingMode === "nickname") {
        data.nickname = text;
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `✅ နာမည်ပြောင် "${text}" သတ်မှတ်ပြီးပါပြီ!`, mainMenu);
    }
    
    // Setting mode ဖြင့် စောင့်ဆိုင်းနေချိန်
    if (data.settingMode) {
        if (data.settingMode === "betplan") {
            const numbers = text.split(',').map(n=>parseInt(n.trim())).filter(n=>!isNaN(n)&&n>0);
            if (numbers.length>0) { 
                data.betPlan=numbers; 
                data.currentBetStep=0; 
                await bot.sendMessage(chatId,`✅ Bet Plan ပြောင်းပြီး: ${numbers.join(' → ')}`); 
            }
            else await bot.sendMessage(chatId,"❌ မှားယွင်းနေပါသည်။ ဥပမာ: 10,30,60,90,150");
        } else if (data.settingMode === "stoplimit") {
            const num=parseInt(text); 
            if(!isNaN(num)&&num>0){ 
                data.stopLimit=num; 
                data.sessionWins=0;
                await bot.sendMessage(chatId,`✅ Stop Limit: ${num} ပွဲနိုင်`); 
            }
            else await bot.sendMessage(chatId,"❌ ဂဏန်းသာ ထည့်ပါ။");
        } else if (data.settingMode === "lossstart") {
            const num=parseInt(text); 
            if(!isNaN(num)&&num>0&&num<=10){ 
                data.lossStartLimit=num; 
                await bot.sendMessage(chatId,`✅ Loss Start: AI ${num} ပွဲဆက်မှားရင် စထိုးပါမည်။`); 
            }
            else await bot.sendMessage(chatId,"❌ ၁ မှ ၁၀ အတွင်း ထည့်ပါ။");
        }
        delete data.settingMode; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,"⚙️ Settings Menu", settingsMenu);
    }
    
    // Manual bet pending
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        if (isNaN(amount)||amount<=0) { 
            await bot.sendMessage(chatId,"❌ ပမာဏမှားနေပါ။"); 
            data.pendingSide=null; 
            saveUserData(chatId,data); 
            return; 
        }
        const targetIssue = await getNextIssue(chatId, data.token);
        if (!targetIssue) { 
            await bot.sendMessage(chatId,"❌ ပွဲစဉ်ရယူ၍မရပါ။"); 
            data.pendingSide=null; 
            saveUserData(chatId,data); 
            return; 
        }
        await bot.sendMessage(chatId, `⏳ 3 စက္ကန့်စောင့်ပြီး ${data.pendingSide} (ပွဲစဉ် ${targetIssue.slice(-5)}) ထိုးပါမည်...`);
        await new Promise(resolve=>setTimeout(resolve,3000));
        await placeBetNow(chatId, data.pendingSide, amount, targetIssue, -1, false, `ကိုယ်တိုင်ထိုး (${targetIssue.slice(-5)})`);
        data.pendingSide = null; 
        saveUserData(chatId,data); 
        return;
    }
    
    // Auto Mode
    if (text === "🚀 Start Auto") { 
        if(!data.token) return bot.sendMessage(chatId,"❌ အကောင့်ဝင်ပါ။"); 
        return bot.sendMessage(chatId,"🤖 Auto Mode ရွေးပါ:", autoModeMenu); 
    }
    if (text === "🔄 Follow Pattern") { 
        data.autoRunning=true; 
        data.autoMode='follow'; 
        data.currentBetStep=0; 
        data.consecutiveWins=0; 
        data.consecutiveLosses=0; 
        data.manualBetLock=false; 
        data.sessionWins=0; 
        saveUserData(chatId,data); 
        await bot.sendMessage(chatId,`✅ Follow Mode Started!\n\nStop Limit: ${data.stopLimit} ပွဲနိုင်ရင် ရပ်မည်။\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu); 
    }
    if (text === "🤖 AI Correction") { 
        data.autoRunning=true; 
        data.autoMode='ai_correction'; 
        data.currentBetStep=0; 
        data.consecutiveWins=0; 
        data.consecutiveLosses=0; 
        data.manualBetLock=false; 
        data.sessionWins=0; 
        saveUserData(chatId,data); 
        await bot.sendMessage(chatId,`✅ AI Correction Started!\n\nStop Limit: ${data.stopLimit} ပွဲနိုင်\nLoss Start: ${data.lossStartLimit} ပွဲဆက်မှား\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu); 
    }
    if (text === "🧠 GetEmerdList Auto") { 
        data.autoRunning=true; 
        data.autoMode='emerdlist'; 
        data.currentBetStep=0; 
        data.consecutiveWins=0; 
        data.consecutiveLosses=0; 
        data.manualBetLock=false; 
        data.sessionWins=0; 
        saveUserData(chatId,data); 
        await bot.sendMessage(chatId,`✅ GetEmerdList Auto Started!\n\nStop Limit: ${data.stopLimit} ပွဲနိုင်\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu); 
    }
    if (text === "🛑 Stop Auto") { 
        data.autoRunning=false; 
        data.autoMode=null; 
        data.sessionWins=0; 
        data.currentBetStep=0;
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,"🛑 Auto Bet ရပ်ထားပါပြီ!", mainMenu); 
    }
    
    // Settings
    if (text === "⚙️ Settings") return bot.sendMessage(chatId,"⚙️ Settings Menu", settingsMenu);
    if (text === "🎲 Set Bet Plan") { 
        data.settingMode="betplan"; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,`📝 Bet Plan ထည့်ပါ (ကော်မာခြားပြီး)\n\nလက်ရှိ: ${data.betPlan.join(' → ')}\n\nဥပမာ: 10,30,60,90,150,250,400,650`); 
    }
    if (text === "🛑 Set Stop Limit") { 
        data.settingMode="stoplimit"; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,`🏆 Stop Limit ထည့်ပါ (ပွဲအရေအတွက်)\n\nလက်ရှိ: ${data.stopLimit} ပွဲ`); 
    }
    if (text === "⚠️ Set Loss Start") { 
        data.settingMode="lossstart"; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,`⚠️ Loss Start Limit ထည့်ပါ (၁-၁၀)\n\nလက်ရှိ: ${data.lossStartLimit} ပွဲဆက်မှား`); 
    }
    if (text === "🔙 Main Menu") { 
        delete data.settingMode; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,"Main Menu", mainMenu); 
    }
    
    // Status
    if (text === "📊 Status") {
        let mode = data.autoRunning ? data.autoMode : "Manual";
        const nickname = data.nickname || "Not set";
        const lossStreak = formatLossStreakShort(data.aiLogs);
        let status = `📊 *${nickname} - Status*\n`;
        status += `━━━━━━━━━━━━━━━━\n`;
        status += `🤖 Mode: ${mode}\n`;
        status += `📋 Bet Plan: ${data.betPlan.join(' → ')}\n`;
        status += `🏆 Stop Limit: ${data.stopLimit}\n`;
        status += `⚠️ Loss Start: ${data.lossStartLimit}\n`;
        status += `📈 Current Step: ${(data.currentBetStep||0)+1}/${data.betPlan.length}\n`;
        status += `✅ Session Wins: ${data.sessionWins}/${data.stopLimit}\n`;
        status += `🏆 Total Wins: ${data.totalWins}\n`;
        status += `💰 Total Profit: ${(data.totalProfit||0).toFixed(2)} MMK\n`;
        status += `📉 ${lossStreak}\n`;
        if (data.consecutiveLosses > 0) status += `⚠️ လက်ရှိအမှားဆက်: ${data.consecutiveLosses} ပွဲ\n`;
        return bot.sendMessage(chatId, status);
    }
    
    // Bet History
    if (text === "📜 Bet History") {
        let txt = `📜 *${data.nickname || 'My'} Bet History*\n`;
        txt += `💰 Total Profit: ${(data.totalProfit||0).toFixed(2)} MMK\n`;
        txt += `🏆 Total Wins: ${data.totalWins}\n`;
        txt += `━━━━━━━━━━━━━━━━\n`;
        if (data.betHistory.length===0) txt+= "မှတ်တမ်းမရှိသေးပါ";
        else {
            data.betHistory.slice(0,15).forEach(h=>{ 
                const pnl = h.status==="⏳ Pending" ? "" : ` (${h.pnl>=0?'+':''}${h.pnl.toFixed(2)})`; 
                txt+=`${h.status} | ${h.issue} | ${h.side} | ${h.amount}${pnl}\n`; 
                if(h.reason) txt+=`   ↳ ${h.reason}\n`; 
            });
        }
        return bot.sendMessage(chatId, txt);
    }
    
    // AI History
    if (text === "📈 AI History") {
        if (!data.aiLogs||data.aiLogs.length===0) return bot.sendMessage(chatId,"📊 AI မှတ်တမ်းမရှိသေးပါ");
        let wins = data.aiLogs.filter(l=>l.status==="✅").length;
        let txt = `📈 *${data.nickname || 'My'} AI History*\n`;
        txt += `━━━━━━━━━━━━━━━━\n`;
        txt += `📊 ${wins}/${data.aiLogs.length} (မှန်နှုန်း: ${((wins/data.aiLogs.length)*100).toFixed(1)}%)\n`;
        txt += `━━━━━━━━━━━━━━━━\n`;
        data.aiLogs.slice(0,50).forEach((log,i)=>{ 
            txt+=`${i+1}. ${log.status} ${log.issue} | ${log.prediction}→${log.result} | ${log.number||''}\n`; 
        });
        return bot.sendMessage(chatId, txt);
    }
    
    // Check AI Loss Streak
    if (text === "📉 Check AI Loss Streak") {
        if (!data.aiLogs||data.aiLogs.length===0) return bot.sendMessage(chatId,"📊 AI မှတ်တမ်းမရှိသေးပါ");
        const report = formatLossStreakReport(data.aiLogs);
        return bot.sendMessage(chatId, report, { parse_mode:"Markdown" });
    }
    
    // GetEmerdList ခန့်မှန်း
    if (text === "🧠 GetEmerdList ခန့်မှန်း") {
        await bot.sendMessage(chatId,"⏳ GetEmerdList API ခေါ်နေပါသည်...");
        const pred = await getEmerdListPrediction(chatId, data.token);
        const nextIssue = await getNextIssue(chatId, data.token);
        let msg = `🧠 **GetEmerdList ခန့်မှန်းချက်**\n`;
        msg += `━━━━━━━━━━━━━━━━\n`;
        msg += `🚀 နောက်ပွဲစဉ်: ${nextIssue?.slice(-5)||'N/A'}\n`;
        msg += `💡 ခန့်မှန်း: ${pred.prediction==="Big"?"🔵 BIG":"🔴 SMALL"}\n`;
        msg += `📝 အကြောင်း: ${pred.reason}`;
        await bot.sendMessage(chatId, msg, { 
            reply_markup:{ 
                inline_keyboard:[[{ text:`💰 ${pred.prediction} ထိုးမည်`, callback_data:`bestbet_${pred.prediction}` }]] 
            } 
        });
        return;
    }
    
    // Logout
    if (text === "🚪 Logout") { 
        data.running=false; 
        data.token=null; 
        data.autoRunning=false; 
        data.sessionWins=0; 
        data.currentBetStep=0;
        delete data.tempPhone;
        delete data.pendingSide;
        delete data.settingMode;
        delete data.username;
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,"👋 အကောင့်ထွက်ပြီးပါပြီ။ /start ဖြင့် ပြန်ဝင်ပါ။"); 
    }
    
    // Phone number input
    if (/^\d{9,11}$/.test(text) && !data.token) { 
        data.tempPhone=text; 
        saveUserData(chatId,data); 
        return bot.sendMessage(chatId,"🔐 Password ပေးပါ:"); 
    }
    
    // Login
    if (data.tempPhone && !data.token) {
        const username = "95"+data.tempPhone.replace(/^0/,'');
        await bot.sendMessage(chatId, "⏳ အကောင့်ဝင်နေပါသည်...");
        const res = await callApi("Login",{ phonetype:-1, logintype:"mobile", username, pwd:text });
        if (res?.msgCode===0) { 
            data.token=res.data.tokenHeader+" "+res.data.token; 
            data.running=true; 
            data.username = data.tempPhone;
            if (!data.nickname) data.nickname = `User ${chatId.slice(-3)}`;
            delete data.tempPhone; 
            saveUserData(chatId,data);
            updateActiveUser(chatId, data.nickname);
            monitoringLoop(chatId); 
            await bot.sendMessage(chatId,"✅ Login Success!\n\nAI Signal စတင်ပါမည်။\nသင့်ရဲ့ Signal တွေကို Public Dashboard မှာ မြင်ရပါမည်။", mainMenu); 
        }
        else { 
            await bot.sendMessage(chatId,"❌ Login Failed! နံပါတ်နှင့် Password ပြန်စစ်ပါ။"); 
            delete data.tempPhone; 
            saveUserData(chatId,data); 
        }
        return;
    }
});

// ========== CALLBACK HANDLER ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const action = query.data;
    const data = getUserData(chatId);
    
    if (action.startsWith('bestbet_')) { 
        data.pendingSide = action.split('_')[1]; 
        saveUserData(chatId,data); 
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,`💰 ${data.pendingSide==="Big"?"BIG 🔵":"SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`); 
        return; 
    }
    
    if (action.startsWith('bet_')) { 
        data.pendingSide = action.split('_')[1]; 
        saveUserData(chatId,data); 
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,`💰 ${data.pendingSide} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`); 
    }
});

// ========== HTTP SERVER ==========
http.createServer((req, res) => {
    if (req.url === `/bot${token}` && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => { 
            try { 
                bot.processUpdate(JSON.parse(body)); 
                res.writeHead(200); 
                res.end(JSON.stringify({ ok: true })); 
            } catch(e) { 
                res.writeHead(400); 
                res.end(); 
            } 
        });
    } else { 
        res.writeHead(200); 
        res.end('WinGo Pro Bot - Public Dashboard Active'); 
    }
}).listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

console.log("✅ Bot ready - PUBLIC DASHBOARD ACTIVE - All users can see all bets/signals!");
