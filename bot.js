const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v58: Balance & Logout Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security System ---
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

// --- 🧠 10-Brains Logic (အရင်အတိုင်း) ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, brainDetails: [] };

    if (currentPattern === "Big-Small-Big") { votes.S += 4; votes.brainDetails.push("🧠 B1-3: Mirror (Small)"); }
    else if (currentPattern === "Small-Big-Small") { votes.B += 4; votes.brainDetails.push("🧠 B1-3: Mirror (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Pattern Analysis"); }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, brainSummary: votes.brainDetails.join("\n") };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";

                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    data.aiPredictionLogs.unshift({ status: isWin ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                }

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

                const reportMsg = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n------------------\n🔍 **Brain Analysis:**\n${ai.brainSummary}\n------------------\n🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး" : "သေး"}**\n📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🔄 အဆင့်: \`${data.currentMultiplier}X\``;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 🎰 Betting & UI Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["💰 လက်ကျန်ငွေကြည့်မည်", "📊 Website Result"],
        ["📜 Betting History", "📈 AI History"],
        ["🗑️ မှတ်တမ်းဖျက်မည်", "🚪 Logout ထွက်မည်"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v58\nဖုန်းနံပါတ် ပို့ပေးပါ:", menu);

    // 💰 လက်ကျန်ငွေကြည့်ခြင်း
    if (msg.text === "💰 လက်ကျန်ငွေကြည့်မည်") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ အရင် Login ဝင်ပေးပါ။");
        const res = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `💰 **လက်ကျန်ငွေ အစီရင်ခံစာ**\n------------------\n👤 အမည်: \`${res.data.nickName}\` \n💵 လက်ကျန်ငွေ: **${res.data.amount} MMK**\n💎 ရွှေ: \`${res.data.gold} Coins\``);
        } else {
            bot.sendMessage(chatId, "❌ ငွေစာရင်းကြည့်မရပါ။ Login ပြန်ဝင်ကြည့်ပါ။");
        }
    }

    // 🚪 Logout ထွက်ခြင်း
    if (msg.text === "🚪 Logout ထွက်မည်") {
        user_db[chatId].token = null;
        user_db[chatId].running = false;
        bot.sendMessage(chatId, "✅ Logout အောင်မြင်ပါသည်။ အကောင့်ထဲမှ ထွက်လိုက်ပါပြီ။", { reply_markup: { remove_keyboard: true } });
        return bot.sendMessage(chatId, "ပြန်သုံးလိုပါက /start နှိပ်ပါ။");
    }

    // Login logic
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

    // Monitoring controls
    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = 30; user_db[chatId].running = true;
        monitoringLoop(chatId); bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu);
    }
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }
    
    // Website Result & History logs (အရင်အတိုင်း)
    if (msg.text === "📊 Website Result") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: 30 }, user_db[chatId].token);
        let txt = "📊 **Website Results**\n";
        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number}\n`; });
        bot.sendMessage(chatId, txt);
    }

    // Amount input handler
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        const side = user_db[chatId].pendingSide;
        const amount = parseInt(msg.text);
        const betPayload = { typeId: user_db[chatId].typeId, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ ထိုးပြီးပါပြီ: ${amount} MMK`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side, amount, status: "⏳ Pending", mult: user_db[chatId].currentMultiplier });
        }
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
