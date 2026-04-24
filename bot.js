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

// ========== EXTRA BOT CONFIG (အမြတ်အရှုံးပို့ရန်) ==========
const EXTRA_BOT_TOKEN = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const EXTRA_BOT_CHAT_ID = '6545674873';
const extraBot = new TelegramBot(EXTRA_BOT_TOKEN, { polling: false });

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

// ========== SEND DETAILED PROFIT/LOSS TO EXTRA BOT ==========
async function sendProfitLossToExtraBot(chatId, userData, eventType, details = {}) {
    try {
        if (!EXTRA_BOT_TOKEN || !EXTRA_BOT_CHAT_ID) {
            console.log("⚠️ EXTRA_BOT_CHAT_ID မထည့်ရသေးပါ");
            return;
        }
        
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });
        let message = `📊 *WinGo Sniper Pro - အသေးစိတ်အစီရင်ခံစာ*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `🆔 *User:* ${chatId}\n`;
        message += `📅 *အချိန်:* ${now}\n`;
        message += `📌 *အမျိုးအစား:* ${eventType}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        
        // စုစုပေါင်းစာရင်းဇယား
        message += `💰 *စုစုပေါင်းအမြတ်:* ${userData.totalProfit?.toFixed(2) || 0} MMK\n`;
        message += `🏆 *စုစုပေါင်းနိုင်ပွဲ:* ${userData.totalWinsAllTime || 0}\n`;
        message += `📉 *Max Loss Streak:* ${userData.maxLossStreak || 0} ပွဲဆက်\n`;
        message += `🤖 *Auto Mode:* ${userData.autoRunning ? (userData.autoMode || 'ON') : 'OFF'}\n`;
        
        // အသေးစိတ်ထိုးပွဲအချက်အလက်
        if (details.betResult && details.betResult.issue) {
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `🎲 *ထိုးပွဲအသေးစိတ်*\n`;
            message += `   🎯 ပွဲစဉ်အမှတ်: ${details.betResult.issue}\n`;
            message += `   🎲 ထိုးခဲ့သည့်ဂဏန်း: ${details.betResult.side === "Big" ? "ကြီး (BIG 5-9)" : "သေး (SMALL 0-4)"}\n`;
            message += `   💵 ထိုးငွေ: ${details.betResult.amount} MMK\n`;
            message += `   📊 ပွဲထွက်ဂဏန်း: ${details.betResult.resultNumber || 'N/A'}\n`;
            message += `   📊 ပွဲထွက်ဘက်: ${details.betResult.result || 'N/A'}\n`;
            message += `   💰 အမြတ်/အရှုံး: ${details.betResult.pnl >= 0 ? '+' : ''}${details.betResult.pnl || 0} MMK\n`;
            if (details.betResult.reason) {
                message += `   📝 ထိုးရသည့်အကြောင်း: ${details.betResult.reason}\n`;
            }
        }
        
        // Session အကျဉ်းချုပ်
        if (details.sessionSummary) {
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `📈 *Session အကျဉ်းချုပ်*\n`;
            message += `   🏆 ဒီအကြိမ်နိုင်ပွဲ: ${userData.currentSessionWins || 0}\n`;
            message += `   🛑 Stop Limit: ${userData.stopLimit || 3}\n`;
            message += `   📊 လက်ရှိအဆင့်: ${(userData.currentBetStep || 0) + 1}/${userData.betPlan?.length || 8}\n`;
            message += `   📋 Bet Plan: ${userData.betPlan?.join(' → ') || 'N/A'}\n`;
        }
        
        // AI စွမ်းဆောင်ရည်
        if (details.aiStats) {
            const total = userData.aiLogs?.length || 0;
            const wins = userData.aiLogs?.filter(l => l.status === "✅").length || 0;
            const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `🤖 *AI စွမ်းဆောင်ရည်*\n`;
            message += `   📊 ခန့်မှန်းချက်: ${total} ပွဲ\n`;
            message += `   ✅ မှန်ချက်: ${wins} ပွဲ (${winRate}%)\n`;
        }
        
        // နောက်ဆုံးထိုးပွဲများ (နောက်ဆုံး ၃ ပွဲ)
        if (details.recentBets && userData.betHistory?.length > 0) {
            const recent = userData.betHistory.slice(0, 3);
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `📜 *နောက်ဆုံးထိုးပွဲများ*\n`;
            recent.forEach((bet, idx) => {
                const time = bet.timestamp ? new Date(bet.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Yangon' }) : 'N/A';
                message += `   ${idx+1}. ${bet.issue} | ${bet.side} | ${bet.amount} MMK | ${bet.status} | ${time}\n`;
            });
        }
        
        await extraBot.sendMessage(EXTRA_BOT_CHAT_ID, message, { parse_mode: "Markdown" });
        console.log(`✅ Detailed report sent to extra bot for user ${chatId}`);
        
    } catch (e) {
        console.error("Extra bot send error:", e.message);
    }
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

// ========== SMART PREDICTION AI ==========
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
        
        const isLastNumberHot = hotNumbers.includes(lastNumber);
        const isLastNumberCold = coldNumbers.includes(lastNumber);
        
        const resultsLast10 = history.slice(0, 10).map(i => getSideFromNumber(i.number));
        const resultsLast20 = history.slice(0, 20).map(i => getSideFromNumber(i.number));
        const resultsLast30 = history.slice(0, 30).map(i => getSideFromNumber(i.number));
        
        let bigCount10 = resultsLast10.filter(r => r === 'Big').length;
        let smallCount10 = resultsLast10.filter(r => r === 'Small').length;
        let bigCount20 = resultsLast20.filter(r => r === 'Big').length;
        let bigCount30 = resultsLast30.filter(r => r === 'Big').length;
        
        let currentStreak = 1;
        for(let i = 1; i < history.length; i++) {
            if(getSideFromNumber(history[i].number) === lastResult) currentStreak++;
            else break;
        }
        
        let colors = history.slice(0, 10).map(i => i.color);
        let redCount = colors.filter(c => c === 'red').length;
        let greenCount = colors.filter(c => c === 'green').length;
        
        let premiums = history.slice(0, 10).map(i => parseInt(i.premium) || 0);
        let avgPremium = premiums.reduce((a,b) => a + b, 0) / premiums.length;
        let lastPremium = parseInt(lastRound.premium) || 0;
        let premiumTrend = lastPremium > avgPremium ? "high" : "low";
        
        let sameNumberStreak = 1;
        for(let i = 1; i < history.length; i++) {
            if(parseInt(history[i].number) === lastNumber) sameNumberStreak++;
            else break;
        }
        
        let bigScore = 50;
        let smallScore = 50;
        let reasons = [];
        
        if (isLastNumberHot) {
            bigScore += (lastResult === "Big" ? 15 : 0);
            smallScore += (lastResult === "Small" ? 15 : 0);
            reasons.push(`🔥 Hot Number ${lastNumber}`);
        }
        if (isLastNumberCold) {
            bigScore += (lastResult === "Big" ? -10 : 10);
            smallScore += (lastResult === "Small" ? -10 : 10);
            reasons.push(`❄️ Cold Number ${lastNumber}`);
        }
        
        if (bigCount10 >= 7) {
            bigScore -= 15;
            smallScore += 15;
            reasons.push(`📊 Big ${bigCount10}/10`);
        } else if (smallCount10 >= 7) {
            bigScore += 15;
            smallScore -= 15;
            reasons.push(`📊 Small ${smallCount10}/10`);
        }
        
        if (currentStreak >= 5) {
            const opposite = lastResult === "Big" ? "Small" : "Big";
            bigScore += (opposite === "Big" ? 20 : 0);
            smallScore += (opposite === "Small" ? 20 : 0);
            reasons.push(`⚡ ${currentStreak} ပွဲဆက်`);
        } else if (currentStreak >= 3) {
            const opposite = lastResult === "Big" ? "Small" : "Big";
            bigScore += (opposite === "Big" ? 10 : 0);
            smallScore += (opposite === "Small" ? 10 : 0);
            reasons.push(`📌 ${currentStreak} ပွဲဆက်`);
        }
        
        if (redCount >= 7) {
            bigScore += 5;
            smallScore -= 5;
            reasons.push(`🔴 Red ${redCount}/10`);
        }
        
        let prediction = bigScore > smallScore ? "Big" : "Small";
        let confidence = Math.min(95, Math.max(55, 50 + Math.abs(bigScore - smallScore)));
        
        return {
            prediction: prediction,
            reason: reasons.slice(0, 3).join(" | "),
            confidence: confidence
        };
        
    } catch (e) {
        console.error("SmartPrediction Error:", e);
        return { prediction: "Big", reason: "ပုံသေ BIG", confidence: 50 };
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
    data.currentLossStreak = currentStreak;
    return maxStreak;
}

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

async function waitForBetWindow(chatId, expectedIssue, maxWaitMs = 10000) {
    const data = getUserData(chatId);
    const startTime = Date.now();
    
    let issueStarted = false;
    while (Date.now() - startTime < 4000) {
        const res = await callApi("GetGameIssue", { typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.issueNumber === expectedIssue) {
            issueStarted = true;
            break;
        }
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
        const apiBets = res.data.list;
        apiBets.forEach(apiBet => {
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

function formatAIHistoryForVIP(aiLogs, limit = 20) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const recentLogs = aiLogs.slice(0, limit);
    let winCount = recentLogs.filter(l => l.status === "✅").length;
    let winRate = ((winCount / recentLogs.length) * 100).toFixed(1);
    let txt = `📈 AI မှတ်တမ်း (${recentLogs.length} ပွဲ) | ${winRate}%\n━━━━━━━━━━━━━━━━\n`;
    recentLogs.forEach((log) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🏞️ကြီး🌎" : "🌄သေး🌝";
        let predEmoji = log.prediction === "Big" ? "🏞️ကြီး🌍" : "🌄သေး🌎";
        txt += `${log.status} ${shortIssue} | ${predEmoji}→${resultEmoji} | ${log.number || ''}\n`;
    });
    return txt;
}

async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;

    const alreadyBet = data.betHistory.find(b => b.issue === targetIssue.slice(-5) && b.status !== "⏳ Pending");
    if (alreadyBet) { console.log(`⚠️ Already bet`); return false; }
    
    if (data.bettingInProgress) { console.log(`⚠️ Bet in progress`); return false; }
    data.bettingInProgress = targetIssue;
    saveUserData(chatId, data);

    const tempBet = {
        issue: targetIssue.slice(-5),
        side,
        amount,
        status: "⏳ Pending",
        pnl: 0,
        isAuto,
        autoStep: isAuto ? stepIndex : -1,
        reason: betReason,
        timestamp: new Date().toISOString()
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

function resetAutoSession(data) {
    data.currentSessionWins = 0;
    data.currentBetStep = 0;
    data.consecutiveLosses = 0;
    data.consecutiveWins = 0;
}

// ========== 30 Sec Game - Fast Monitoring ==========
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
                console.log(`🆕 New issue: ${currentIssue}`);
                
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                const realNumber = lastRound.number;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    let betResultDetails = null;
                    
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        data.totalProfit += pendingBet.pnl;
                        data.totalWinsAllTime++;
                        
                        betResultDetails = {
                            issue: pendingBet.issue,
                            side: pendingBet.side,
                            amount: pendingBet.amount,
                            result: "WIN ✅",
                            resultNumber: realNumber,
                            pnl: pendingBet.pnl,
                            reason: pendingBet.reason
                        };
                        
                        if (pendingBet.isAuto) {
                            data.currentSessionWins++;
                            data.consecutiveWins++;
                            data.consecutiveLosses = 0;
                            
                            if (data.currentSessionWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit ပြည့်ပါပြီ!\n📊 ဒီ Auto Run မှာ ${data.currentSessionWins}/${data.stopLimit} ပွဲနိုင်\n🔄 Auto Bet ရပ်ပါမည်။`);
                                
                                await sendProfitLossToExtraBot(chatId, data, "SESSION_END", {
                                    sessionSummary: true,
                                    betResult: betResultDetails,
                                    recentBets: true,
                                    aiStats: true
                                });
                                
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
                        
                        betResultDetails = {
                            issue: pendingBet.issue,
                            side: pendingBet.side,
                            amount: pendingBet.amount,
                            result: "LOSS ❌",
                            resultNumber: realNumber,
                            pnl: pendingBet.pnl,
                            reason: pendingBet.reason
                        };
                        
                        if (pendingBet.isAuto) {
                            data.consecutiveWins = 0;
                            
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) {
                                data.currentBetStep = nextStep;
                            } else {
                                await bot.sendMessage(chatId, `❌ Max step ရောက်။ Auto Bet ရပ်။`);
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
                    
                    await sendProfitLossToExtraBot(chatId, data, "BET_RESULT", {
                        betResult: betResultDetails,
                        recentBets: true,
                        aiStats: true
                    });
                }

                // AI Log ထည့်ခြင်း
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    
                    if (data.autoMode === 'ai_correction') {
                        if (!aiCorrect) {
                            data.consecutiveLosses++;
                        } else {
                            data.consecutiveLosses = 0;
                        }
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

                // Auto Bet Trigger
                if (data.autoRunning && !data.manualBetLock) {
                    let betSide = null;
                    let betAmount = data.betPlan[data.currentBetStep];
                    let betReason = "";
                    
                    if (data.autoMode === 'follow') {
                        betSide = realSide;
                        betReason = `🔄 Follow - ${realSide} လိုက်ထိုး`;
                    } 
                    else if (data.autoMode === 'ai_correction') {
                        if (data.consecutiveLosses >= data.lossStartLimit) {
                            betSide = data.last_pred;
                            betReason = `🤖 AI Correction - ${data.consecutiveLosses} ပွဲဆက်မှား၍ ထိုး`;
                        }
                    } 
                    else if (data.autoMode === 'emerdlist') {
                        const smartPred = await getSmartPrediction(chatId, data.token);
                        betSide = smartPred.prediction;
                        betReason = `🧠 Smart AI - ${smartPred.reason} (${smartPred.confidence}%)`;
                    }
                    
                    if (betSide) {
                        await bot.sendMessage(chatId, `⏰ ပွဲစဉ် ${nextIssue.slice(-5)} အတွက် ၅ စက္ကန့်စောင့်ပြီး ထိုးပါမည်...`);
                        const betWindowReady = await waitForBetWindow(chatId, nextIssue, 10000);
                        
                        if (betWindowReady) {
                            await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                        } else {
                            await bot.sendMessage(chatId, `⚠️ အချိန်မမီ၍ ချက်ချင်းထိုးပါမည်...`);
                            await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                        }
                    }
                }

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', hour12: false });
                let modeText = "⚪️ Manual";
                if (data.autoRunning) {
                    if (data.autoMode === 'follow') modeText = "🟢 Follow";
                    else if (data.autoMode === 'ai_correction') modeText = "🟡 AI Correction";
                    else if (data.autoMode === 'emerdlist') modeText = "🧠 Smart AI";
                }
                
                let statusMsg = `💥 BIGWIN VIP SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue}\n🎲 Result: ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI Pred: ${data.last_pred}\n📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `🏆 Session Wins: ${data.currentSessionWins}/${data.stopLimit}\n`;
                statusMsg += `📉 Max Loss Streak: ${data.maxLossStreak} ပွဲဆက်\n`;
                if (data.autoMode === 'ai_correction') {
                    statusMsg += `⚠️ Current Losses: ${data.consecutiveLosses}/${data.lossStartLimit}\n`;
                }
                statusMsg += `━━━━━━━━━━━━━━━━\n🚀 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                statusMsg += `🦸 ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n${formatAIHistoryForVIP(data.aiLogs, 20)}`;

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
            ["⚠️ Set Loss Start (AI Corr)", "🔙 Main Menu"]
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
                await bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ ဥပမာ: 10,30,60,90,150");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                await bot.sendMessage(chatId, `✅ Stop Limit: ${num} ပွဲနိုင်ရင် ရပ်ပါမည်။`);
            } else {
                await bot.sendMessage(chatId, "❌ ဂဏန်းသာ ထည့်ပါ။");
            }
        } else if (mode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start Limit: AI ${num} ပွဲဆက်မှားရင် စထိုးပါမည်။`);
            } else {
                await bot.sendMessage(chatId, "❌ ၁ မှ ၁၀ အတွင်း ထည့်ပါ။");
            }
        }
        
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    }

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
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro 🎯\n\n⏰ 30 Sec Game - 5s Wait\n\nAuto Mode အလုပ်လုပ်ပုံ:\n• 🔄 Follow: ပွဲထွက်တိုင်း Result အတိုင်း လိုက်ထိုး\n• 🤖 AI Correction: Loss Limit ပြည့်မှ စထိုး\n• 🧠 Smart AI: Hot/Cold/Trend/Streak/Color/Premium ပေါင်းစပ်ခန့်မှန်း\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }

    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ။");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးပါ:", autoModeMenu);
    }

    if (text === "🔄 Follow Pattern") {
        data.autoRunning = true;
        data.autoMode = 'follow';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Follow Mode Started!\n🛑 Stop Limit: ${data.stopLimit} ပွဲနိုင်ရင် ရပ်မည်။`, mainMenu);
    }

    if (text === "🤖 AI Correction") {
        data.autoRunning = true;
        data.autoMode = 'ai_correction';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ AI Correction Started!\n🛑 Stop Limit: ${data.stopLimit}\n⚠️ Loss Start Limit: ${data.lossStartLimit} ပွဲဆက်မှားမှ စထိုး`, mainMenu);
    }

    if (text === "🧠 Smart AI Auto") {
        data.autoRunning = true;
        data.autoMode = 'emerdlist';
        resetAutoSession(data);
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Smart AI Auto Started!\n🛑 Stop Limit: ${data.stopLimit} ပွဲနိုင်`, mainMenu);
    }

    if (text === "🛑 Stop Auto") {
        data.autoRunning = false;
        data.autoMode = null;
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Auto Bet Stopped!", mainMenu);
    }

    if (text === "⚙️ Settings") {
        return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    }

    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,60,90,150,250,400,650\n\nလက်ရှိ: " + data.betPlan.join(' → '));
    }

    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `🏆 Stop Limit ထည့်ပါ\nလက်ရှိ: ${data.stopLimit} ပွဲ`);
    }

    if (text === "⚠️ Set Loss Start (AI Corr)") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `⚠️ Loss Start Limit ထည့်ပါ (AI Correction Mode အတွက်)\nလက်ရှိ: ${data.lossStartLimit} ပွဲ`);
    }

    if (text === "🔙 Main Menu") {
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }

    if (text === "📊 Status") {
        let mode = data.autoRunning ? data.autoMode : "Manual";
        let status = `📊 Current Status\n━━━━━━━━━━━━━━━━\n`;
        status += `🤖 Mode: ${mode}\n`;
        status += `📋 Bet Plan: ${data.betPlan.join(' → ')}\n`;
        status += `🏆 Stop Limit: ${data.stopLimit} ပွဲ\n`;
        status += `⚠️ Loss Start Limit: ${data.lossStartLimit} ပွဲ\n`;
        status += `📈 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}\n`;
        status += `🏆 Session Wins: ${data.currentSessionWins}/${data.stopLimit}\n`;
        status += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
        status += `📉 Max Loss Streak: ${data.maxLossStreak} ပွဲဆက်`;
        return bot.sendMessage(chatId, status);
    }

    if (text === "📜 Bet History") {
        const d = getUserData(chatId);
        let txt = `📜 Bet History\n💰 Total Profit: ${d.totalProfit.toFixed(2)} MMK\n🏆 Total Wins: ${d.totalWinsAllTime}\n------------------\n`;
        
        if (d.betHistory.length === 0) {
            txt += "မှတ်တမ်းမရှိသေးပါ";
        } else {
            d.betHistory.slice(0, 15).forEach(h => {
                const time = h.timestamp ? new Date(h.timestamp).toLocaleTimeString('en-US', { timeZone: 'Asia/Yangon' }) : '';
                const pnl = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? '+' : ''}${h.pnl})`;
                txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount}${pnl} | ${time}\n`;
                if (h.reason) txt += `   ↳ ${h.reason}\n`;
            });
        }
        return bot.sendMessage(chatId, txt);
    }

    if (text === "📈 AI History") {
        const d = getUserData(chatId);
        if (!d.aiLogs || d.aiLogs.length === 0) {
            return bot.sendMessage(chatId, "📊 AI မှတ်တမ်းမရှိသေးပါ");
        }
        
        let txt = `📈 AI History\n━━━━━━━━━━━━━━━━\n`;
        let wins = d.aiLogs.filter(l => l.status === "✅").length;
        txt += `📊 စုစုပေါင်း: ${d.aiLogs.length} ပွဲ | ✅ ${wins} | ❌ ${d.aiLogs.length - wins} | ${((wins/d.aiLogs.length)*100).toFixed(1)}%\n`;
        txt += `📉 အမြင့်ဆုံးရှုံးပွဲအဆက်: ${d.maxLossStreak} ပွဲ\n`;
        txt += `━━━━━━━━━━━━━━━━\n`;
        
        d.aiLogs.slice(0, 30).forEach((log, i) => {
            txt += `${i+1}. ${log.status} ${log.issue} | ${log.prediction}→${log.result} | ${log.number || ''}\n`;
        });
        return bot.sendMessage(chatId, txt);
    }

    if (text === "🧠 Smart Prediction") {
        if (!data.token) {
            return bot.sendMessage(chatId, "❌ ကျေးဇူးပြု၍ အကောင့်ဝင်ပါ။");
        }
        
        await bot.sendMessage(chatId, "⏳ Smart AI ခွဲခြမ်းစိတ်ဖြာနေပါသည်...");
        
        const prediction = await getSmartPrediction(chatId, data.token);
        const nextIssue = await getNextIssue(chatId, data.token);
        
        let msg = `🧠 *Smart AI ခန့်မှန်းချက်*\n━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🚀 နောက်ပွဲစဉ်: ${nextIssue?.slice(-5) || 'N/A'}\n`;
        msg += `💡 ခန့်မှန်း: ${prediction.prediction === "Big" ? "🔵 BIG ကြီး" : "🔴 SMALL သေး"}\n`;
        msg += `📊 အားကိုးရမှု: ${prediction.confidence}%\n`;
        msg += `📝 ခွဲခြမ်းစိတ်ဖြာချက်: ${prediction.reason}\n`;
        
        await bot.sendMessage(chatId, msg, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[
                { text: `💰 ${prediction.prediction} ထိုးမည်`, callback_data: `bestbet_${prediction.prediction}` }
            ]] }
        });
        return;
    }

    if (text === "📉 Max Loss Streak") {
        const d = getUserData(chatId);
        if (!d.aiLogs || d.aiLogs.length === 0) {
            return bot.sendMessage(chatId, "📊 AI မှတ်တမ်းမရှိသေးပါ။");
        }
        return bot.sendMessage(chatId, `📉 အမြင့်ဆုံး ရှုံးပွဲအဆက်: ${d.maxLossStreak} ပွဲဆက်`);
    }

    if (text === "🚪 Logout") {
        data.running = false; data.token = null; data.autoRunning = false;
        resetAutoSession(data);
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. /start နဲ့ ပြန်ဝင်ပါ။");
    }

    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text; saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.phone = data.tempPhone; data.running = true; delete data.tempPhone;
            resetAutoSession(data);
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ Login Success!\n\nSettings အပြည့်အစုံ သုံးနိုင်ပါပြီ။", mainMenu);
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
    
    if (action.startsWith('bestbet_')) {
        const side = action.split('_')[1];
        data.pendingSide = side;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 ${side === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ပမာဏ ရိုက်ထည့်ပါ:`);
        return;
    }
    
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
    } else { res.writeHead(200); res.end('WinGo Sniper Pro - Smart AI'); }
}).listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

console.log("✅ Bot initialized - Smart AI Prediction");
console.log("✅ Extra Bot ready - Will send detailed profit/loss updates");
