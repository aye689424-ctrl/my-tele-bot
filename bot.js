const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require('crypto');
const http = require('http');

// Render Alive
http.createServer((req, res) => { res.end('WinGo v85: AI Debug Mode'); }).listen(process.env.PORT || 8080);

// Environment variables ကို သေချာခေါ်ယူခြင်း
const TG_TOKEN = process.env.TG_TOKEN; 
const OPENAI_KEY = process.env.OPENAI_KEY;
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

const bot = new TelegramBot(TG_TOKEN, { polling: true });
let user_db = {};

// --- 🛡️ API Security ---
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

// --- 🧠 AI Analysis ---
async function askOpenAI(history) {
    if (!OPENAI_KEY) return "⚠️ OpenAI Key မရှိပါ။";
    
    const prompt = `WinGo last 20 results: ${history.slice(0,20).map(i => `${parseInt(i.number) >= 5 ? 'B' : 'S'}`).join(',')}. Predict next BIG or SMALL. Burmese only.`;
    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150
        }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, timeout: 10000 });
        return res.data.choices[0].message.content;
    } catch (e) {
        return `❌ AI Error: ${e.response?.data?.error?.message || e.message}`;
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

                const aiResponse = await askOpenAI(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred_side = aiResponse.toUpperCase().includes("BIG") ? "Big" : "Small";

                bot.sendMessage(chatId, `🚀 **AI Prediction**\n${aiResponse}\nပွဲစဉ်: ${data.nextIssue.slice(-5)}`, {
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

    // AI Check Command (Key အလုပ်လုပ်မလုပ် စစ်ရန်)
    if (text === "/checkai") {
        const testRes = await askOpenAI([{number: "5", issueNumber: "123"}]);
        return bot.sendMessage(chatId, `🔍 **AI Status Check:**\n${testRes}`);
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI ခန့်မှန်းချက် မှတ်တမ်း**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | Result: ${l.result}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိသေးပါ။");
    }

    if (text === "/start") return bot.sendMessage(chatId, "🤖 **WinGo VIP v85**\nဖုန်းနံပါတ်ပေးပါ:");
    
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callBigWinApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", { reply_markup: { keyboard: [["📈 AI History"]], resize_keyboard: true } });
        } else {
            bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။ ဖုန်း/Password ပြန်စစ်ပါ။");
            user_db[chatId].tempPhone = null;
        }
    }
});

bot.on("callback_query", (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
