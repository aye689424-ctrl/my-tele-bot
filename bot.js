const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require('crypto');
const http = require('http');

// Render Alive
http.createServer((req, res) => { res.end('WinGo v86: Gemini Free AI Active'); }).listen(process.env.PORT || 8080);

// ====== 🛡️ CONFIG ======
const TG_TOKEN = process.env.TG_TOKEN; 
const GEMINI_KEY = process.env.GEMINI_KEY; // Render မှာ GEMINI_KEY လို့ နာမည်ပေးထားပါ
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

const bot = new TelegramBot(TG_TOKEN, { polling: true });
let user_db = {};

// --- 🛡️ API Security Logic ---
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
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 Gemini AI Prediction (FREE) ---
async function askGemini(history) {
    if (!GEMINI_KEY) return "⚠️ Gemini API Key မရှိသေးပါ။ Render မှာ ထည့်ပေးပါ။";

    const historyData = history.slice(0, 20).map(i => `${parseInt(i.number) >= 5 ? 'Big' : 'Small'}`).join(', ');
    const prompt = `You are a professional WinGo game analyst. Last 20 results: ${historyData}. 
    Predict the next outcome (BIG or SMALL). Explain pattern shortly in Burmese.
    Format your response as:
    📚တွက်ချက်မှု: [Analysis]
    🧠 Pattern: [Pattern Name]
    🦸AI ခန့်မှန်းချက်: [BIG or SMALL]
    📊 Confidence: [Percentage]%`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const res = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        return res.data.candidates[0].content.parts[0].text;
    } catch (e) {
        return "❌ Gemini AI ချိတ်ဆက်မှု Error တက်နေပါသည်။";
    }
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";

                if (data.last_pred_side) {
                    const isWin = data.last_pred_side.toUpperCase().includes(realSide.toUpperCase());
                    bot.sendMessage(chatId, `💥 **VIP RESULT**\nPeriod: ${history[0].issueNumber}\nResult: ${realSide}(${history[0].number})\nStatus: ${isWin ? "နိုင်ပြီ🏆" : "ရှုံးပြီ💔"}`);
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), result: realSide });
                }

                // AI Prediction with Gemini
                const aiResponse = await askGemini(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred_side = aiResponse.toUpperCase().includes("BIG") ? "Big" : "Small";

                bot.sendMessage(chatId, `🚀 **Gemini AI Prediction (Free)**\n━━━━━━━━━━━━━━━━\n${aiResponse}\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Message Handlers ---
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };

    if (text === "/start") return bot.sendMessage(chatId, "🤖 **WinGo VIP v86 (Gemini Edition)**\nဖုန်းနံပါတ်ပေးပါ:");

    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { 
        user_db[chatId].tempPhone = text; 
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:"); 
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callBigWinApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; 
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Gemini AI ချိတ်ဆက်ပြီးပါပြီ။ Signal စောင့်ကြည့်နေပါသည်-", {
                reply_markup: { keyboard: [["📈 AI History"]], resize_keyboard: true }
            });
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။");
            user_db[chatId].tempPhone = null;
        }
    }

    if (text === "📈 AI History") {
        let txt = "📈 **Gemini AI History**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | Result: ${l.result}\n`; });
        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိသေးပါ။");
    }

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
        bot.sendMessage(chatId, betRes?.msgCode === 0 ? `✅ **${amount}** MMK ထိုးပြီးပါပြီ။` : `❌ Error: ${betRes?.message}`);
        user_db[chatId].pendingSide = null;
    }
});

bot.on("callback_query", (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
