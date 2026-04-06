const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require('crypto');
const http = require('http');

// ====== 🛡️ SECURITY CONFIG ======
// ကုဒ်ထဲမှာ Key တိုက်ရိုက်မရေးပါနဲ့။ 
// Render ရဲ့ Environment Variables ထဲမှာ TG_TOKEN နဲ့ OPENAI_KEY ကို ထည့်ပေးပါ။
const TG_TOKEN = process.env.TG_TOKEN; 
const OPENAI_KEY = process.env.OPENAI_KEY;
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const BASE_THROTTLE_MS = 1000;
const MAX_RETRIES = 5;

if (!TG_TOKEN || !OPENAI_KEY) {
    console.error("❌ ERROR: TG_TOKEN သို့မဟုတ် OPENAI_KEY ကို Environment Variables မှာ မတွေ့ပါ။");
}

http.createServer((req, res) => { res.end('WinGo v83: Secure AI Active'); }).listen(process.env.PORT || 8080);

const bot = new TelegramBot(TG_TOKEN, { polling: true });
let user_db = {};

// --- 🛡️ BigWin API Security Logic ---
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

async function callBigWinApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 OpenAI Prediction Logic ---
async function askOpenAI(history) {
    const prompt = `WinGo game analyst. Last 100 results:
    ${history.map(i => `${i.issueNumber.slice(-3)}:${parseInt(i.number) >= 5 ? 'Big' : 'Small'}`).join(', ')}
    Predict NEXT outcome. Reply ONLY in Burmese:
    📚တွက်ချက်မှု: [Analysis]
    🧠 Pattern: [Pattern]
    🦸AI ခန့်မှန်းချက်: [BIG or SMALL]
    📊 Confidence: [Percentage]%`;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: "Professional betting analyst." }, { role: "user", content: prompt }],
            temperature: 0.7
        }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" } });
        return res.data.choices[0].message.content;
    } catch (e) { return "AI စနစ် ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်။"; }
}

// --- 📤 Telegram Message Queue ---
const outQueue = [];
let processing = false;
async function processQueue() {
    if (processing) return;
    processing = true;
    while (outQueue.length > 0) {
        const { chatId, text, options } = outQueue.shift();
        try {
            await bot.sendMessage(chatId, text, options);
            await new Promise(r => setTimeout(r, BASE_THROTTLE_MS));
        } catch (err) { console.error("Queue Send Error"); }
    }
    processing = false;
}
function enqueueMessage(chatId, text, options = {}) {
    outQueue.push({ chatId, text, options });
    processQueue();
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                if (data.last_pred) {
                    const isWin = data.last_pred_side.toUpperCase() === realSide.toUpperCase();
                    enqueueMessage(chatId, `💥 **VIP RESULT**\nPeriod: ${history[0].issueNumber}\nResult: ${realSide}(${history[0].number})\nStatus: ${isWin ? "နိုင်ပြီ🏆" : "ရှုံးပြီ💔"}`);
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), result: realSide });
                }
                const aiResponse = await askOpenAI(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred_side = aiResponse.includes("BIG") ? "Big" : "Small";
                data.last_pred = true;
                enqueueMessage(chatId, `🚀 **AI Prediction**\n${aiResponse}\nပွဲစဉ်: ${data.nextIssue.slice(-5)}`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Handlers ---
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };

    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const data = user_db[chatId];
        const fresh = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;
        let baseUnit = amount < 10000 ? 10 : 100;
        const betRes = await callBigWinApi("GameBetting", { 
            typeId: 30, issuenumber: targetIssue, gameType: 2, amount: baseUnit, 
            betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true 
        }, data.token);
        enqueueMessage(chatId, betRes?.msgCode === 0 ? `✅ **${amount}** MMK ထိုးပြီးပါပြီ။` : `❌ Error: ${betRes?.message}`);
        data.pendingSide = null;
        return;
    }

    if (text === "/start") return enqueueMessage(chatId, "🤖 **Secure AI Bot**\nဖုန်းနံပါတ်ပေးပါ:");
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return enqueueMessage(chatId, "🔐 Password ပေးပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callBigWinApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            enqueueMessage(chatId, "✅ Login အောင်မြင်သည်။");
        }
    }
});

bot.on("callback_query", (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    enqueueMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
