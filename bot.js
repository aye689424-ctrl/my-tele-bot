const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v61: Full Suite Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ v57 Security System ---
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

// --- 🧠 10-Brains Logic (v57 Style) ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 1, S: 1, brains: [] };

    if (currentPattern === "Big-Small-Big") { votes.S += 5; votes.brains.push("🧠 B1-3: Mirror (Small)"); }
    else if (currentPattern === "Small-Big-Small") { votes.B += 5; votes.brains.push("🧠 B1-3: Mirror (Big)"); }
    else { votes.brains.push("🧠 B1-3: Trend Mode"); }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, summary: votes.brains.join("\n") };
}

// --- 🚀 Monitoring Loop (v57 Logic) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";

                // Update Prediction History
                if (data.last_pred) {
                    data.aiPredictionLogs.unshift({ status: data.last_pred === realSide ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                }

                // Check Bet Wins/Loss & Multiplier
                data.betHistory.forEach(bet => {
                    if (bet.issue === history[0].issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                        const isWin = bet.side === realSide;
                        bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                        if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                        bot.sendMessage(chatId, `✉️ **နိုင်/ရှုံး ရလဒ်**\n------------------\n📅 ပွဲစဉ်: \`${bet.issue}\` \n📊 ရလဒ်: **${bet.status}**\n🔄 အဆင့်: ${data.currentMultiplier}X`);
                    }
                });

                const ai = getAIVote(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                const reportMsg = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n------------------\n🔍 **Brain Analysis:**\n${ai.summary}\n------------------\n🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး" : "သေး"}**\n📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🔄 လက်ရှိအဆင့်: \`${data.currentMultiplier}X\``;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI & Menu Handlers (v57 Style + New Features) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["💰 လက်ကျန်ငွေကြည့်မည်", "📊 Website Result"],
        ["📈 AI History", "📜 Betting History"],
        ["🗑️ မှတ်တမ်းဖျက်မည်", "🚪 Logout ထွက်မည်"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v61 (Full)\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // 💰 လက်ကျန်ငွေ (New)
    if (msg.text === "💰 လက်ကျန်ငွေကြည့်မည်") {
        const res = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (res?.msgCode === 0) return bot.sendMessage(chatId, `💰 **လက်ကျန်ငွေ:** \`${res.data.amount} MMK\``);
    }

    // 🚪 Logout (New)
    if (msg.text === "🚪 Logout ထွက်မည်") {
        user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };
        return bot.sendMessage(chatId, "✅ Logout အောင်မြင်သည်။", { reply_markup: { remove_keyboard: true } });
    }

    // 📊 Website Result
    if (msg.text === "📊 Website Result") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: 30 }, user_db[chatId].token);
        let txt = "📊 **ဂိမ်းရလဒ် ၁၀ ခု**\n";
        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number}\n`; });
        return bot.sendMessage(chatId, txt);
    }

    // 📈 AI History
    if (msg.text === "📈 AI History") {
        let txt = "📈 **AI ခန့်မှန်းမှတ်တမ်း**\n";
        user_db[chatId].aiPredictionLogs.slice(0, 10).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ${l.pred}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    // 📜 Betting History
    if (msg.text === "📜 Betting History") {
        let txt = "📜 **ထိုးခဲ့သည့်မှတ်တမ်း**\n";
        user_db[chatId].betHistory.slice(0, 10).forEach(h => { txt += `🔹 ပွဲ: ${h.issue} | ${h.status}\n💰 ${h.amount} (${h.mult}X)\n\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    // Login Logic
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].running = true; monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 စတင်ပါပြီ။", menu);
    }
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    // Manual Betting (v57 Style)
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        const side = user_db[chatId].pendingSide;
        const amount = parseInt(msg.text);
        const betPayload = { typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ ထိုးပြီးပါပြီ: ${amount} MMK`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side, amount, status: "⏳ Pending", mult: user_db[chatId].currentMultiplier });
        }
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
