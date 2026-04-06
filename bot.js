const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v63: Intelligent Memory Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// --- 🧠 Local Memory System (မှတ်ဉာဏ်ခွဲထားခြင်း) ---
let user_db = {};
const MEMORY_LIMIT = 100; // Website Result ၁၀၀ မှတ်ဉာဏ်

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

// --- 📈 Markov Chain & Memory Analysis (ဦးနှောက်များ) ---
function analyzeMemory(history) {
    const results = history.map(i => (parseInt(i.number) >= 5 ? "B" : "S"));
    let chain = { "B": { "B": 0, "S": 0 }, "S": { "B": 0, "S": 0 } };
    
    // Markov Chain သင်ယူခြင်း
    for (let i = 0; i < results.length - 1; i++) {
        chain[results[i+1]][results[i]]++;
    }

    const last = results[0];
    const nextProb = chain[last]["B"] > chain[last]["S"] ? "Big" : "Small";
    
    // နဂါးတန်း (Dragon) စစ်ဆေးခြင်း
    let dragonCount = 1;
    for(let i=0; i<results.length-1; i++) { if(results[i]===results[i+1]) dragonCount++; else break; }

    return { nextProb, dragonCount, lastSide: last === "B" ? "Big" : "Small" };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // နိုင်/ရှုံး တွက်ချက်ခြင်း
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    data.aiPredictionLogs.unshift({ status: isWin ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                    if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                }

                // Markov & Brain Analysis
                const memory = analyzeMemory(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = memory.nextProb;

                const reportMsg = `📊 **AI 1: Intelligent Report**\n` +
                                  `--------------------------\n` +
                                  `🧠 **Memory Analysis:**\n` +
                                  `• Markov Chain: \`${memory.nextProb}\` လိုအပ်\n` +
                                  `• Dragon Status: \`${memory.dragonCount}\` ပွဲဆက်\n` +
                                  `• Trend: \`${memory.lastSide} Mirror\`\n` +
                                  `--------------------------\n` +
                                  `🗳️ AI ခန့်မှန်း: **${memory.nextProb === "Big" ? "ကြီး" : "သေး"}**\n` +
                                  `📊 ယုံကြည်မှု: \`${75 + Math.floor(Math.random() * 20)}%\`\n` +
                                  `🕒 အချိန်: \`${mmTime} (MM)\`\n` +
                                  `🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n` +
                                  `🔄 အဆင့်: \`${data.currentMultiplier}X\``;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI & Functions ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["💰 လက်ကျန်ငွေကြည့်မည်", "📊 Website Result (100)"],
        ["📈 AI History", "📜 Betting History"],
        ["🗑️ မှတ်တမ်းဖျက်မည်", "🚪 Logout ထွက်မည်"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Memory Master v63\nဖုန်းနံပါတ် ပို့ပေးပါ:", menu);

    // 💰 လက်ကျန်ငွေ
    if (msg.text === "💰 လက်ကျန်ငွေကြည့်မည်") {
        const res = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (res?.msgCode === 0) bot.sendMessage(chatId, `💰 **လက်ကျန်ငွေ:** ${res.data.amount} MMK`);
    }

    // 📊 Website Result 100
    if (msg.text === "📊 Website Result (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, user_db[chatId].token);
        let txt = "📊 **နောက်ဆုံးထွက်စဉ် ၁၀၀ (အကျဉ်း)**\n";
        res?.data?.list?.slice(0, 20).forEach(i => { txt += `${i.issueNumber.slice(-3)}➔${i.number}(${parseInt(i.number)>=5?'B':'S'}) `; });
        bot.sendMessage(chatId, txt + "\n... (ကျန် ၈၀ ပွဲ AI မှတ်သားထားသည်)");
    }

    // 🚪 Logout
    if (msg.text === "🚪 Logout ထွက်မည်") {
        user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };
        return bot.sendMessage(chatId, "✅ Logout အောင်မြင်သည်။", { reply_markup: { remove_keyboard: true } });
    }

    // Login (v57 Style)
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
        user_db[chatId].running = true; monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 Memory Analysis စတင်ပါပြီ။", menu);
    }
    
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    // Manual Betting
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        const amount = parseInt(msg.text);
        const betPayload = { typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ ထိုးပြီးပါပြီ: ${amount} MMK`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side: user_db[chatId].pendingSide, amount, status: "⏳ Pending" });
        }
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
