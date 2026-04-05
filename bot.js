const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Server Keep-Alive
http.createServer((req, res) => { res.end('WinGo v52: Direct Buttons Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic ---
function generateRandomKey() { return crypto.randomUUID().replace(/-/g, ''); }
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 ဦးနှောက် ၁၀ ခု AI Strategy ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, reason: "" };

    if (currentPattern === "Big-Small-Big") { votes.S += 5; votes.reason = "မာကိုချိန်း Mirror ပုံစံကြောင့် သေး (Small) အားသာသည်။"; }
    else if (currentPattern === "Small-Big-Small") { votes.B += 5; votes.reason = "မာကိုချိန်း Mirror ပုံစံကြောင့် ကြီး (Big) အားသာသည်။"; }
    else if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0] === "Big" ? "B" : "S"] += 4; votes.reason = "နဂါးတန်း (Dragon) လိုက်ရန် အားသာသည်။";
    } else {
        votes[results[0] === "Big" ? "S" : "B"] += 2; votes.reason = "ပုံမှန် အလှည့်အပြောင်း။";
    }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, reason: votes.reason };
}

// --- 🚀 Monitoring Loop (Report with Buttons) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                
                // Win/Loss Tracking Update
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                if (data.last_pred) {
                    data.aiPredictionLogs.unshift({ status: data.last_pred === realSide ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                }
                data.betHistory.forEach(bet => {
                    if (bet.issue === history[0].issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                        bet.status = bet.side === realSide ? "✅ WIN" : "❌ LOSS";
                    }
                });

                const ai = getAIVote(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                // --- 📊 AI 1: Report with Inline Buttons ---
                const reportMsg = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n` +
                                  `--------------------------\n` +
                                  `📈 တွေ့ရှိပုံစံ: \`${ai.currentPattern}\`\n` +
                                  `🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**\n` +
                                  `📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n` +
                                  `🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n\n` +
                                  `👇 **အမြန်ထိုးရန် ခလုတ်နှိပ်ပါ:**`;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🔵 Big (ကြီး) ထိုးမည်", callback_data: "bet_Big" },
                            { text: "🔴 Small (သေး) ထိုးမည်", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 🎰 Betting Handler ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    const betPayload = { typeId: data.typeId, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const time = new Date().toLocaleTimeString();
        const successMsg = `✉️ **ထိုးပွဲ အောင်မြင်မှု အစီရင်ခံစာ**\n` +
                           `--------------------------\n` +
                           `📅 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n` +
                           `⏰ အချိန်: \`${time}\`\n` +
                           `🎰 ရွေးချယ်မှု: **${side === "Big" ? "ကြီး" : "သေး"}**\n` +
                           `💰 ပမာဏ: \`${amount} MMK\`\n\n` +
                           `📜 **သတိပေးကဗျာ**\n` +
                           `_"နိုင်ခြေနှုန်းကို အရင်ကြည့်၊ ၇၀ အထက် ရှိမှချိ၊\n` +
                           `Pattern ပျက်လို့ ၃ ပွဲရှုံး၊ ခဏနားကာ အားကိုရုံး။"_`;
        
        bot.sendMessage(chatId, successMsg, { parse_mode: "Markdown" });
        data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side, amount, time, status: "⏳ Pending" });
    }
}

// --- 📱 Menu & Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [] };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["📊 Website Result", "📈 AI ခန့်မှန်းချက်မှတ်တမ်း"],
        ["📜 Betting History", "🗑️ မှတ်တမ်းဖျက်မည်"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v52\nဖုန်းနံပါတ် ပို့ပေးပါ:", menu);

    if (msg.text === "📊 Website Result") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: user_db[chatId].typeId || 30 }, user_db[chatId].token);
        let txt = "📊 **နောက်ဆုံးရလဒ်များ**\n";
        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "ကြီး" : "သေး"})\n`; });
        bot.sendMessage(chatId, txt);
    }

    if (msg.text === "📈 AI ခန့်မှန်းချက်မှတ်တမ်း") {
        let txt = "📈 **AI Prediction History**\n\n";
        user_db[chatId].aiPredictionLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ခန့်မှန်း: ${l.pred}\n`; });
        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (msg.text === "📜 Betting History") {
        let txt = "📜 **ငွေစာရင်း ထိုးခဲ့သည့်မှတ်တမ်း**\n\n";
        user_db[chatId].betHistory.slice(0, 10).forEach(h => { txt += `🔹 ${h.issue} | ${h.status} | ${h.amount} MMK\n`; });
        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (msg.text === "🗑️ မှတ်တမ်းဖျက်မည်") {
        user_db[chatId].aiPredictionLogs = []; user_db[chatId].betHistory = [];
        bot.sendMessage(chatId, "✅ မှတ်တမ်းများ ဖျက်လိုက်ပါပြီ။");
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text; bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = 30; user_db[chatId].running = true;
        monitoringLoop(chatId); bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu);
    }
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
