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

// --- 🛡️ Error-Free Signature Helper ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature;
    delete temp.timestamp;
    // အက္ခရာစဉ်အတိုင်း စီခြင်း
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    
    // JSON String ပြောင်းရာတွင် Space မပါအောင် Stringify လုပ်ခြင်း
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    // Random ကို ပွဲတိုင်း အသစ်ထုတ်ပေးခြင်းဖြင့် Error ကင်းစေသည်
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0" 
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { 
        console.error("API Error:", e.message);
        return null; 
    }
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

// --- 🚀 Auto-Betting Logic ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data.list.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // ၁။ ရလဒ်စစ်ဆေးခြင်း
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === realRes;
                    const betAmt = data.betPlan[data.step];
                    if (win) { data.sessionProfit += (betAmt * 0.97); data.step = 0; }
                    else { data.sessionProfit -= betAmt; data.step = (data.step + 1) % data.betPlan.length; }
                    data.logs.push(`${currIssue.slice(-3)}: ${win ? "✅" : "❌"} (${betAmt})`);
                }

                // ၂။ အသစ်လောင်းခြင်း (Payload အတိအကျ ပြင်ဆင်ထားသည်)
                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const betAmt = data.betPlan[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue, // Fixed to Small 'n'
                    "amount": betAmt,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 12 : 13),
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision; 
                data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `✅ **Bet Success**\n🎯 Issue: \`${nextIssue.slice(-5)}\`\n🎲 Pick: **${decision}**\n💰 Amt: ${betAmt}\n📈 Profit: ${data.sessionProfit.toFixed(0)}`);
                } else {
                    bot.sendMessage(chatId, `❌ **Bet Failed**\nMsg: ${betRes ? betRes.msg : "Connection Error"}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 User Interface ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, sessionProfit: 0, step: 0, logs: [], betPlan: [10, 30, 90, 270, 830], targetProfit: 1000, stopLoss: 2000, formula: "SMART", typeId: 30 };

    const menu = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["📊 History", "/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **BigWin Pro Console v6.2**\nError-Fixed Version အသုံးပြုနိုင်ပါပြီ", menu);

    if (text === "💰 My Profile") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `👤 **ID:** \`${info.data.userId}\`\n💵 **Balance:** \`${info.data.amount} ကျပ်\``, { parse_mode: 'Markdown' });
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပေးပါ။");
    }

    if (text === "⚙️ Setup") {
        const setKB = { reply_markup: { inline_keyboard: [
            [{ text: "🧬 Formula: " + user_db[chatId].formula, callback_data: "cycle" }],
            [{ text: "💵 Plan: " + user_db[chatId].betPlan.join(","), callback_data: "plan" }],
            [{ text: "🕒 Mode: " + (user_db[chatId].typeId === 30 ? "30s" : "1min"), callback_data: "mode" }]
        ]}};
        return bot.sendMessage(chatId, "⚙️ **Settings Console**", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "Login အရင်ဝင်ပါ။");
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "✅ **Auto-Betting စတင်ပါပြီ!**");
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    if (text.startsWith("plan ")) {
        user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number);
        return bot.sendMessage(chatId, "✅ Bet Plan ပြောင်းလဲပြီးပါပြီ");
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) { user_db[chatId].token = res.data.tokenHeader + res.data.token; return bot.sendMessage(chatId, "✅ Login Success!", menu); }
        return bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ /start နှိပ်ပြီး ပြန်ကြိုးစားပါ။");
    }
});

// Inline Callbacks
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
    } else if (q.data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
    }
    bot.answerCallbackQuery(q.id);
    bot.sendMessage(chatId, "🔄 Setting ပြောင်းလဲပြီးပါပြီ။");
});
