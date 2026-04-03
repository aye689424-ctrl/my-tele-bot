const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
http.createServer((req, res) => { res.end('WinGo Auto Engine Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Helper ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp;
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = "b05034ba4a2642009350ee863f29e2e9";
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI Strategy (10 Brains Consensus) ---
function aiDecision(history) {
    const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = results[0];
    let votes = { Big: 0, Small: 0 };

    // Logic: Patterns
    votes[last === "Big" ? "Small" : "Big"] += 1; // Opposite
    if (results.slice(0, 3).every(v => v === "Big")) votes.Small += 2; // Triple Break
    if (results.slice(0, 3).every(v => v === "Small")) votes.Big += 2; // Triple Break
    
    return votes.Big > votes.Small ? "Big" : "Small";
}

// --- 🚀 Auto Betting Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // ၁။ Win/Loss စစ်ဆေးခြင်း
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    if (data.last_pred === realRes) {
                        data.step = 0;
                        bot.sendMessage(chatId, `✅ **WIN!** Issue: ${currIssue.slice(-3)}`);
                    } else {
                        data.step = (data.step + 1) % data.betPlan.length;
                        bot.sendMessage(chatId, `❌ **LOSS** Issue: ${currIssue.slice(-3)}`);
                    }
                }

                // ၂။ အသစ်လောင်းခြင်း
                const decision = aiDecision(history);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const amount = data.betPlan[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": amount,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 13 : 14),
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision;
                data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `🎰 **Bet Sent!**\n💎 Period: ${nextIssue.slice(-5)}\n🎯 Pick: **${decision}**\n💰 Amount: ${amount} MMK`);
                }
            }
        }
        await new Promise(r => setTimeout(r, data.typeId === 30 ? 3000 : 8000));
    }
}

// --- 📱 Telegram UI ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, step: 0, betPlan: [10, 30, 90, 270, 810], typeId: 30 };
    const menu = { reply_markup: { keyboard: [["🚀 WinGo 30s", "🚀 WinGo 1min"], ["🛑 Stop Auto", "💰 Balance"], ["/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Auto Bot**\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:", { reply_markup: { remove_keyboard: true } });

    if (text === "🚀 WinGo 30s" || text === "🚀 WinGo 1min") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "Login အရင်ဝင်ပါ။");
        user_db[chatId].typeId = text.includes("30s") ? 30 : 1;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, `🚀 **${text} Auto-Bet စတင်ပါပြီ**`, menu);
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }
    
    if (text === "💰 Balance") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `💰 Balance: ${info.data.amount} MMK`);
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Password ပို့ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
        return bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။");
    }
});
