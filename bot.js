const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
http.createServer((req, res) => { res.end('BigWin Pro Console Live'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Utility Functions ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp;
    const sorted = Object.keys(temp).sort().reduce((obj, key) => { obj[key] = temp[key]; return obj; }, {});
    return crypto.createHash('md5').update(JSON.stringify(sorted).replace(/ /g, '')).digest('hex').toUpperCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = "6613a6468bce461aa952059f1e40cf2b"; //
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken,
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile" 
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- Formula Logic (၄ မျိုး) ---
function getDecision(history, formulaType) {
    const last10 = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = last10[0];

    if (formulaType === "FOLLOW") return last; // Dragon
    if (formulaType === "OPPOSITE") return last === "Big" ? "Small" : "Big"; // Mirror
    if (formulaType === "RANDOM") return Math.random() > 0.5 ? "Big" : "Small"; // Luck
    if (formulaType === "SMART") { // AI Analysis
        const bigCount = last10.filter(v => v === "Big").length;
        return bigCount >= 5 ? "Small" : "Big";
    }
    return last;
}

// --- Main Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // ၁။ ရလဒ်စစ်ဆေးခြင်း
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === realRes;
                    const betAmt = data.betPlan[data.step];
                    
                    if (win) {
                        data.sessionProfit += (betAmt * 0.97);
                        data.step = 0;
                    } else {
                        data.sessionProfit -= betAmt;
                        data.step = (data.step + 1) % data.betPlan.length;
                    }
                    data.logs.push(`${currIssue.slice(-3)}: ${win ? "✅" : "❌"} (${betAmt})`);
                }

                // ၂။ Target / Stop Loss စစ်ဆေးခြင်း
                if (data.sessionProfit >= data.targetProfit || data.sessionProfit <= -data.stopLoss) {
                    bot.sendMessage(chatId, `🏁 **Session ပြီးဆုံးပါပြီ**\nProfit/Loss: ${data.sessionProfit.toFixed(0)} ကျပ်`);
                    data.running = false; break;
                }

                // ၃။ အသစ်လောင်းခြင်း (Big=12, Small=13)
                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const betAmt = data.betPlan[data.step];
                
                const betPayload = {
                    typeId: data.typeId,
                    issuenumber: nextIssue,
                    amount: betAmt,
                    betCount: 1,
                    gameType: 2,
                    selectType: (decision === "Big" ? 12 : 13), //
                    language: 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision; data.last_issue = currIssue;

                bot.sendMessage(chatId, `🎯 **Issue:** \`${nextIssue.slice(-5)}\` ➡️ **${decision}**\n💰 **Bet:** ${betAmt} | 📈 **Profit:** ${data.sessionProfit.toFixed(0)}\n🧠 **Formula:** ${data.formula}`);
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- Bot Message Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, sessionProfit: 0, step: 0, logs: [], betPlan: [10, 30, 90, 270, 830], targetProfit: 1000, stopLoss: 2000, formula: "SMART", typeId: 30 };

    const menuKB = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["📊 History", "/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **BigWin Pro Console v6.0**\nအလိုအလျောက် Betting စနစ်မှ ကြိုဆိုပါတယ်", menuKB);

    if (text === "💰 My Profile") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            const u = info.data;
            return bot.sendMessage(chatId, `👤 **ID:** \`${u.userId}\`\n💵 **Balance:** \`${u.amount} ကျပ်\`\n📱 **Phone:** \`${u.mobile}\``, { parse_mode: 'Markdown' });
        }
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပေးပါ");
    }

    if (text === "⚙️ Setup") {
        const setKB = { reply_markup: { inline_keyboard: [
            [{ text: "🧬 Formula: " + user_db[chatId].formula, callback_data: "cycle_formula" }],
            [{ text: "💵 Plan: " + user_db[chatId].betPlan.join(","), callback_data: "set_plan" }],
            [{ text: "🎯 Target: " + user_db[chatId].targetProfit, callback_data: "set_target" }],
            [{ text: "🕒 Mode: " + (user_db[chatId].typeId === 30 ? "30s" : "1min"), callback_data: "set_mode" }]
        ]}};
        return bot.sendMessage(chatId, "⚙️ **Betting Settings**", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "အရင်ဆုံး ဖုန်းနံပါတ်နဲ့ Password ပေးပြီး Login ဝင်ပါဗျ");
        user_db[chatId].running = true; user_db[chatId].sessionProfit = 0;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "✅ **Auto-Betting စတင်ပါပြီ**", menuKB);
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ", menuKB); }

    if (text === "📊 History") return bot.sendMessage(chatId, `📊 **Last 20 Logs:**\n\n${user_db[chatId].logs.slice(-20).join("\n") || "မှတ်တမ်းမရှိသေးပါ"}`);

    // Settings Updates
    if (text.startsWith("plan ")) { user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number); return bot.sendMessage(chatId, "✅ Plan Updated"); }
    if (text.startsWith("target ")) { user_db[chatId].targetProfit = Number(text.replace("target ", "")); return bot.sendMessage(chatId, "✅ Target Updated"); }

    // Login Handling
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါပြီ", menuKB);
        }
        return bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါတယ်");
    }
});

// Inline Callback Handling
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle_formula") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
    } else if (q.data === "set_mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
    } else if (q.data === "set_plan") {
        return bot.sendMessage(chatId, "Plan ပြင်ရန် `plan 10,30,90...` ဟု ရိုက်ပို့ပါ");
    }
    bot.answerCallbackQuery(q.id);
    bot.sendMessage(chatId, `🔄 **Updated:** ${q.data.replace('set_','')} changed!`);
});
