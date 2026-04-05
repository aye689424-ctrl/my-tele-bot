const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v34: Fully Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    return hash.padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = {
        ...data,
        language: 0,
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now() / 1000)
    };
    payload.signature = signMd5(payload);

    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🎰 Betting Handler ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် ရှာမတွေ့သေးပါ။");

    let baseUnit = totalAmount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(totalAmount)) - 2);
    if (baseUnit < 10) baseUnit = 10;

    const betPayload = {
        typeId: 30,
        issuenumber: data.nextIssue,
        language: 0,
        gameType: 2,
        amount: Math.floor(baseUnit),
        betCount: Math.floor(totalAmount / baseUnit),
        selectType: side === "Big" ? 13 : 14,
        isAgree: true
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (!data.history) data.history = [];
    data.history.push({ issue: data.nextIssue, side, amount: totalAmount, timestamp: Date.now() });

    if (res && (res.msgCode === 0 || res.msg === "Bet success")) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${totalAmount}** MMK ထိုးပြီးပါပြီ။`);
    } else {
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${res ? res.message : "Network Error"}\``);
    }
}

// --- 🧠 AI Prediction ---
function aiPredict(chatId) {
    const data = user_db[chatId];
    if (!data || !data.history) return { prediction: "Big", confidence: 50 };

    const lastRounds = data.history.slice(-3).map(h => h.side);
    let countNext = { Big: 0, Small: 0 };

    for (let i = 0; i < data.history.length - 3; i++) {
        const pattern = data.history.slice(i, i + 3).map(h => h.side).join('-');
        const next = data.history[i + 3] ? data.history[i + 3].side : null;
        if (pattern === lastRounds.join('-') && next) countNext[next]++;
    }

    let prediction = "Big";
    let confidence = 50;
    const total = countNext.Big + countNext.Small;
    if (total > 0) {
        if (countNext.Big >= countNext.Small) { prediction = "Big"; confidence = Math.round((countNext.Big/total)*100); }
        else { prediction = "Small"; confidence = Math.round((countNext.Small/total)*100); }
    }

    if (!data.aiHistory) data.aiHistory = [];
    const nextIssue = data.nextIssue || "Pending";
    data.aiHistory.push({ issue: nextIssue, prediction, confidence });

    return { prediction, confidence };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: 30 }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            if (lastRound.issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = lastRound.issueNumber;
                user_db[chatId].nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();

                const { prediction, confidence } = aiPredict(chatId);

                bot.sendMessage(chatId, `🔔 **၃၀ စက္ကန့် ပွဲစဉ်သစ်: ${user_db[chatId].nextIssue.slice(-5)}**\nPrediction: ${prediction === "Big" ? "🔵 Big" : "🔴 Small"}\nConfidence: ${confidence}%\nဘယ်ဘက်ထိုးမလဲ ရွေးပေးပါ-`, {
                    reply_markup: { 
                        inline_keyboard: [[
                            { text: "🔵 Big (အကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (အသေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 3500));
    }
}

// --- 📱 Telegram Handlers ---
const menu = { reply_markup: { keyboard: [
    ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
    ["📊 Website Result", "📈 AI Prediction History"],
    ["📜 Betting History", "🗑️ မှတ်တမ်းဖျက်မည်"]
], resize_keyboard: true } };

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (msg.text === '/start') {
        user_db[chatId] = { running: false, token: null };
        return bot.sendMessage(chatId, "🤖 **WinGo Master v34**\nဖုန်းနံပါတ် ပို့ပေးပါ:", menu);
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, `✅ Login ရပါပြီ။ ၃၀ စက္ကန့်ပွဲစဉ်များကို စောင့်ကြည့်နေပါသည်။`);
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။");
            user_db[chatId].tempPhone = null;
        }
    }

    if (msg.text === "📈 AI Prediction History") {
        let historyText = "📈 AI Prediction History\n\n";
        (user_db[chatId].aiHistory || []).slice(-10).reverse().forEach(h => {
            historyText += `${h.issue} | Prediction: ${h.prediction === "Big" ? "🔵 Big" : "🔴 Small"} | Confidence: ${h.confidence}%\n`;
        });
        bot.sendMessage(chatId, historyText || "❌ History မရှိသေးပါ။");
    }

    if (msg.text === "📜 Betting History") {
        let betText = "📜 Betting History\n\n";
        (user_db[chatId].history || []).slice(-10).reverse().forEach(h => {
            const timeMMT = new Date(h.timestamp).toLocaleTimeString("en-US", { hour12: false, timeZone: "Asia/Yangon" });
            betText += `🔹 ပွဲ: ${h.issue} | ${h.side} | 💰 ${h.amount} MMK | ⏰ ${timeMMT}\n`;
        });
        bot.sendMessage(chatId, betText || "❌ Betting history မရှိသေးပါ။");
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
