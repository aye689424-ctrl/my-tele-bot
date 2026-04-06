const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require('crypto');
const http = require('http');

// ====== 🔑 API KEYS (HARDCODED) ======
const TG_TOKEN = "8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0";
const GEMINI_KEY = "AIzaSyAN7Mv8Q_E9BFdTsCcr0ZSWf1N8HgB9B8I";
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

// Render ပေါ်မှာ အမြဲနိုးကြားနေစေရန်
http.createServer((req, res) => { res.end('WinGo v87: Gemini Hybrid Active'); }).listen(process.env.PORT || 8080);

const bot = new TelegramBot(TG_TOKEN, { polling: true });
let user_db = {};

// --- 🛡️ API Security ---
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callBigWinApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: Math.random().toString(36).substring(7), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 Gemini AI Chat & Analysis ---
async function askGemini(prompt, isAnalysis = false) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const finalPrompt = isAnalysis ? `WinGo Game Analysis: ${prompt}. Predict next (BIG/SMALL) in Burmese.` : prompt;
        
        const res = await axios.post(url, { contents: [{ parts: [{ text: finalPrompt }] }] });
        return res.data.candidates[0].content.parts[0].text;
    } catch (e) {
        return "❌ AI စနစ် ခေတ္တချို့ယွင်းနေပါသည်။";
    }
}

// --- ⌨️ Custom Keyboard Menu ---
const mainMenu = {
    reply_markup: {
        keyboard: [
            ["📊 Website Results", "📈 AI History"],
            ["🔵 Bet BIG", "🔴 Bet SMALL"],
            ["📜 Bet Record", "🚪 Logout"]
        ],
        resize_keyboard: true
    }
};

// --- 🚀 Monitoring Loop (Auto Prediction) ---
async function startMonitoring(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        if (res?.data?.list) {
            const last = res.data.list[0];
            if (last.issueNumber !== user_db[chatId].lastIssue) {
                const historyStr = res.data.list.slice(0, 15).map(i => `${parseInt(i.number) >= 5 ? 'B' : 'S'}`).join(',');
                
                // AI ခန့်မှန်းချက်တောင်းမယ်
                const aiRes = await askGemini(`Last results: ${historyStr}. Now period ${last.issueNumber} is ${parseInt(last.number) >= 5 ? 'Big' : 'Small'}. Predict next.`, true);
                
                user_db[chatId].lastIssue = last.issueNumber;
                const nextIssue = (BigInt(last.issueNumber) + 1n).toString();

                const report = `🔔 **New Result Out!**\n━━━━━━━━━━━━━━\n🗓 ပွဲစဉ်: ${last.issueNumber}\n🎲 ရလဒ်: ${parseInt(last.number) >= 5 ? 'BIG' : 'SMALL'} (${last.number})\n\n🔮 **AI ခန့်မှန်းချက် (ပွဲစဉ် ${nextIssue.slice(-5)})**\n${aiRes}\n\n👇 အောက်က Button တွေသုံးပြီး ထိုးနိုင်ပါတယ်။`;
                
                bot.sendMessage(chatId, report, mainMenu);
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Message Handler ---
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();

    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], token: null };

    // 1. Start Command
    if (text === "/start") {
        return bot.sendMessage(chatId, "👋 မင်္ဂလာပါ! ကျွန်တော်က WinGo VIP Gemini Bot ပါ။\n\nဖုန်းနံပါတ် ရိုက်ထည့်ပြီး Login ဝင်ပေးပါ။", { reply_markup: { remove_keyboard: true } });
    }

    // 2. Login Flow
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Password ရိုက်ထည့်ပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token && text.length > 3) {
        const res = await callBigWinApi("Login", { logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ အခုကစပြီး Gemini AI နဲ့ စကားပြောနိုင်ပါပြီ။ Website ရလဒ်တွေကိုလည်း Auto ပို့ပေးပါမယ်။", mainMenu);
            startMonitoring(chatId);
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ရိုက်ပါ။");
            user_db[chatId].tempPhone = null;
        }
        return;
    }

    // 3. Menu Buttons Logic
    if (text === "📊 Website Results") {
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, typeId: 30 }, user_db[chatId].token);
        let str = "📊 **နောက်ဆုံးရလဒ် ၁၅ ပွဲ**\n\n";
        res?.data?.list?.forEach(i => { str += `🔹 ${i.issueNumber.slice(-3)} ➔ ${parseInt(i.number)>=5?'BIG':'SMALL'}\n`; });
        return bot.sendMessage(chatId, str, mainMenu);
    }

    if (text === "🔵 Bet BIG" || text === "🔴 Bet SMALL") {
        user_db[chatId].pendingSide = text.includes("BIG") ? "Big" : "Small";
        return bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ (ဥပမာ- 1000) ကို ရိုက်ထည့်ပါ:`);
    }

    // 4. Betting Amount Input
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const side = user_db[chatId].pendingSide;
        const res = await callBigWinApi("GameBetting", { 
            typeId: 30, issuenumber: (BigInt(user_db[chatId].lastIssue) + 1n).toString(), 
            gameType: 2, amount: 10, betCount: Math.floor(amount / 10), 
            selectType: side === "Big" ? 13 : 14, isAgree: true 
        }, user_db[chatId].token);
        
        bot.sendMessage(chatId, res?.msgCode === 0 ? `✅ **${side}** မှာ **${amount}** MMK ထိုးပြီးပါပြီ။` : `❌ Error: ${res?.message}`);
        user_db[chatId].pendingSide = null;
        return;
    }

    // 5. Gemini General Chat (If not a menu command)
    const menuCommands = ["📊 Website Results", "📈 AI History", "🔵 Bet BIG", "🔴 Bet SMALL", "📜 Bet Record", "🚪 Logout"];
    if (user_db[chatId].token && !menuCommands.includes(text) && !user_db[chatId].pendingSide) {
        bot.sendChatAction(chatId, "typing");
        const aiReply = await askGemini(text);
        bot.sendMessage(chatId, aiReply, mainMenu);
    }
});
