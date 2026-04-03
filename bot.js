const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
http.createServer((req, res) => { res.end('BigWin Pro Console v6.2 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- API Helpers ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp;
    const sorted = Object.keys(temp).sort().reduce((obj, key) => { obj[key] = temp[key]; return obj; }, {});
    const jsonStr = JSON.stringify(sorted).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = crypto.randomBytes(16).toString('hex'); // Random အစစ်သုံးခြင်းက ပိုစိတ်ချရပါတယ်
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0" 
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

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

// --- Main Auto-Bet Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data.list.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === realRes;
                    const betAmt = data.betPlan[data.step];
                    
                    if (win) { data.sessionProfit += (betAmt * 0.95); data.step = 0; }
                    else { data.sessionProfit -= betAmt; data.step = (data.step + 1) % data.betPlan.length; }
                    
                    // Logs ထဲသို့ မှတ်တမ်းထည့်ခြင်း (နောက်ဆုံး ၁၀ ပွဲပဲ သိမ်းမည်)
                    data.logs.unshift(`${currIssue.slice(-4)}: ${win ? "✅ Win" : "❌ Loss"} (${betAmt})`);
                    if (data.logs.length > 10) data.logs.pop();
                }

                if (data.sessionProfit >= data.targetProfit || data.sessionProfit <= -data.stopLoss) {
                    bot.sendMessage(chatId, `🏁 **Session Ended**\nProfit: ${data.sessionProfit.toFixed(0)} ကျပ်`);
                    data.running = false; break;
                }

                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const betAmt = data.betPlan[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": betAmt,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 13 : 14),
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision; data.last_issue = currIssue;

                if (betRes && betRes.msgCode === 0) {
                    bot.sendMessage(chatId, `🎲 **Bet:** ${decision} (${betAmt})\n📈 **Profit:** ${data.sessionProfit.toFixed(0)}\n🔄 **Period:** ${nextIssue.slice(-5)}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

// --- Telegram Interface ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, sessionProfit: 0, step: 0, logs: [], betPlan: [10, 30, 90, 270, 830], targetProfit: 1000, stopLoss: 5000, formula: "SMART", typeId: 30 };

    const menu = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["📊 History", "/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **BigWin Pro Console**\nLogin ဝင်ပြီး Auto-Bet စတင်နိုင်ပါပြီ။", menu);

    // --- 📊 History Logic (ပြင်ဆင်ထားသောအပိုင်း) ---
    if (text === "📊 History") {
        if (user_db[chatId].logs.length === 0) return bot.sendMessage(chatId, "📉 မှတ်တမ်းမရှိသေးပါ။ Bot စထိုးမှ မှတ်တမ်းတက်လာပါလိမ့်မယ်။");
        const historyText = user_db[chatId].logs.join("\n");
        return bot.sendMessage(chatId, `📊 **Last 10 Rounds:**\n\n${historyText}\n\n💰 **Current Profit:** ${user_db[chatId].sessionProfit.toFixed(0)} ကျပ်`);
    }

    if (text === "💰 My Profile") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `👤 ID: ${info.data.userId}\n💵 Bal: ${info.data.amount} ကျပ်`);
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပေးပါ။");
    }

    if (text === "⚙️ Setup") {
        const setKB = { reply_markup: { inline_keyboard: [
            [{ text: "🧬 Formula: " + user_db[chatId].formula, callback_data: "cycle" }],
            [{ text: "🕒 Mode: " + (user_db[chatId].typeId === 30 ? "30s" : "1min"), callback_data: "mode" }]
        ]}};
        return bot.sendMessage(chatId, "⚙️ **Settings Console**\n(Plan ပြင်ချင်လျှင်: `plan 10,30,90` ဟု ပို့ပေးပါ)", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "Login အရင်ဝင်ပါ။");
        user_db[chatId].running = true; user_db[chatId].sessionProfit = 0; user_db[chatId].logs = [];
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "✅ **Auto-Betting စတင်ပါပြီ!**");
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    if (text.startsWith("plan ")) {
        user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number);
        return bot.sendMessage(chatId, "✅ Plan Updated: " + user_db[chatId].betPlan.join(","));
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) { user_db[chatId].token = res.data.tokenHeader + res.data.token; return bot.sendMessage(chatId, "✅ Login Success!", menu); }
        return bot.sendMessage(chatId, "❌ Login Failed!");
    }
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
    } else if (q.data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
    }
    bot.answerCallbackQuery(q.id);
    bot.sendMessage(chatId, "🔄 Setting Updated!");
});
