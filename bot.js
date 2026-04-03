const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း
http.createServer((req, res) => { res.end('WinGo Real Engine v8.1 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Real Signature System ---
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
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 20000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🚀 Real Auto-Bet Logic ---
async function monitoringLoop(chatId) {
    // Bet Plan: 10, 30, 90, 270, 810 (Martingale)
    const bets = [10, 30, 90, 270, 810, 2430];

    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        // Result ယူခြင်း
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // ၁။ အနိုင်အရှုံးစစ်ဆေးခြင်း
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    if (data.last_pred === realRes) {
                        data.step = 0; // နိုင်ရင် အစကပြန်စ
                        bot.sendMessage(chatId, `✅ **WIN!** Period: ${currIssue.slice(-3)}`);
                    } else {
                        data.step = (data.step + 1) % bets.length; // ရှုံးရင် အဆင့်မြှင့်
                        bot.sendMessage(chatId, `❌ **LOSS** Period: ${currIssue.slice(-3)}`);
                    }
                }

                // ၂။ အသစ်လောင်းခြင်း (AI Decision)
                const lastResult = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                const decision = (lastResult === "Big") ? "Small" : "Big"; // Opposite Logic (Standard)
                
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const amount = bets[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": amount,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 13 : 14),
                    "language": 7
                };

                // Real Bet အမိန့်ပေးခြင်း
                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision;
                data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `🎯 **Real Bet Success**\n💎 Period: ${nextIssue.slice(-5)}\n🎰 Pick: **${decision}**\n💰 Amount: ${amount} MMK`);
                } else {
                    bot.sendMessage(chatId, `⚠️ **Bet Error:** ${betRes?.msg || "လိုင်းမကောင်းပါ"}`);
                }
            }
        }
        // 30s ပွဲဖြစ်ရင် 3 စက္ကန့်ခြားစစ်၊ 1m ဆိုရင် 8 စက္ကန့်ခြားစစ်
        await new Promise(r => setTimeout(r, data.typeId === 30 ? 3000 : 8000));
    }
}

// --- 📱 Telegram Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, step: 0, last_issue: "" };

    const menu = { reply_markup: { keyboard: [["🚀 Start 30s", "🚀 Start 1min"], ["🛑 Stop", "💰 Balance"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Real Auto Bot**\nဖုန်းနံပါတ်ပို့ပေးပါ (09...):", { reply_markup: { remove_keyboard: true } });

    if (text === "🚀 Start 30s" || text === "🚀 Start 1min") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "Login အရင်ဝင်ပါ။");
        user_db[chatId].typeId = text.includes("30s") ? 30 : 1;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, `🚀 **${text} စတင်ပါပြီ**`, menu);
    }

    if (text === "🛑 Stop") { user_db[chatId].running = false; return bot.sendMessage(chatId, "Stopped.", menu); }

    if (text === "💰 Balance") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `💰 လက်ကျန်ငွေ: ${info.data.amount} MMK`);
    }

    // Login Logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Password ပို့ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါပြီ။", menu);
        }
        bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ /start ပြန်လုပ်ပါ။");
    }
});
