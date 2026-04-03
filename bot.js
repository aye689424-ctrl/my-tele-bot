const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive & Status Page
http.createServer((req, res) => { res.end('BigWin Bot v6.7 is Running'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Stable Signature Helper ---
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 20000 });
        return res.data;
    } catch (e) { return { msgCode: -1, msg: "Network Busy" }; }
}

// --- 🧠 Formula Manager ---
function getDecision(history, formulaType) {
    const last10 = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = last10[0];
    if (formulaType === "FOLLOW") return last;
    if (formulaType === "OPPOSITE") return last === "Big" ? "Small" : "Big";
    if (formulaType === "RANDOM") return Math.random() > 0.5 ? "Big" : "Small";
    if (formulaType === "SMART") {
        const bigs = last10.filter(v => v === "Big").length;
        return bigs >= 5 ? "Small" : "Big";
    }
    return last;
}

// --- 🚀 Auto-Betting Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = (data.last_pred === realRes);
                    const betAmt = data.betPlan[data.step];
                    if (win) { data.sessionProfit += (betAmt * 0.95); data.step = 0; }
                    else { data.sessionProfit -= betAmt; data.step = (data.step + 1) % data.betPlan.length; }
                }

                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const currentBetAmt = data.betPlan[data.step];

                // 🔥 BIG = 13 , SMALL = 14 (အတည်ပြုပြီး)
                const selectTypeValue = (decision === "Big") ? 13 : 14;

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": currentBetAmt,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": selectTypeValue,
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision; data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `✅ **Success** | Issue: ${nextIssue.slice(-5)}\n🎯 Pick: **${decision}** | 💰 Bet: ${currentBetAmt}`);
                } else {
                    bot.sendMessage(chatId, `❌ **Fail:** ${betRes?.msg || "Timeout"}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

// --- 📱 Telegram Bot UI ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, sessionProfit: 0, step: 0, betPlan: [10, 30, 90, 270, 830], formula: "SMART", typeId: 30 };
    const menu = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **BigWin Bot v6.7**\n\n1. ဖုန်းနံပါတ် 09... ပို့ပြီး Login အရင်ဝင်ပါ။\n2. `Start Auto` နှိပ်ပါ။", menu);

    if (text === "💰 My Profile") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `👤 ID: ${info.data.userId}\n💵 Bal: ${info.data.amount} ကျပ်`);
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        user_db[chatId].running = true; monitoringLoop(chatId);
        return bot.sendMessage(chatId, "🚀 **Auto-Betting စတင်ပါပြီ!**");
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    if (text.startsWith("plan ")) {
        user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number);
        return bot.sendMessage(chatId, "✅ Plan OK");
    }

    // Login Handling
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပို့ပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) { user_db[chatId].token = res.data.tokenHeader + res.data.token; return bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါပြီ။", menu); }
        return bot.sendMessage(chatId, "❌ Password မှားနေပါတယ်။");
    }
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
    } else if (q.data === "mode") { user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30; }
    bot.answerCallbackQuery(q.id); bot.sendMessage(chatId, "🔄 Updated!");
});
