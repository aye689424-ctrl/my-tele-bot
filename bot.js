const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v67: Fully Complete'); }).listen(process.env.PORT || 8080);

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

// --- 🧠 4-Way Brain System (Markov, Dragon, Formula, Memory) ---
function runAIIntelligence(history, logs) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];

    // 1. Dragon Detection
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }

    // 2. Markov Chain (Probabilistic Memory)
    let mChain = { Big: { B: 0, S: 0 }, Small: { B: 0, S: 0 } };
    for (let i = 0; i < resArr.length - 1; i++) {
        mChain[resArr[i+1]][resArr[i] === "Big" ? "B" : "S"]++;
    }
    const markovVote = mChain[last]["B"] > mChain[last]["S"] ? "Big" : "Small";

    // 3. Picat Formula (The Image Logic)
    let formulaVote = (last === "Big") ? (dragon <= 3 ? "Small" : "Big") : (dragon <= 3 ? "Big" : "Small");

    // 4. Learning from AI History (Loss Check)
    let lossCount = 0;
    for(let l of logs.slice(0,3)) { if(l.status === "❌") lossCount++; }

    // Weighted Decision
    let finalSide = (dragon >= 4) ? formulaVote : markovVote;
    let confidence = 75 + (formulaVote === markovVote ? 15 : 0) - (lossCount * 5);

    return { side: finalSide, conf: Math.min(confidence, 99), dragon, mode: dragon >= 4 ? "Dragon Mode" : "Markov Mode" };
}

// --- 🚀 Auto Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', second: '2-digit' });

                if (data.last_pred) {
                    const win = data.last_pred === realSide;
                    data.aiPredictionLogs.unshift({ status: win ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                    if (!win) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                    bot.sendMessage(chatId, `✉️ **နိုင်/ရှုံး ရလဒ်**\nပွဲ: ${history[0].issueNumber.slice(-3)} | ထွက်: ${history[0].number} (${realSide})\nရလဒ်: ${win ? "✅ WIN" : "❌ LOSS"}\nအဆင့်: ${data.currentMultiplier}X`);
                }

                const ai = runAIIntelligence(history, data.aiPredictionLogs);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                const report = `📊 **WinGo Intelligent AI (v67)**\n` +
                               `--------------------------\n` +
                               `🧠 **Brain Sync:** \`${ai.mode}\`\n` +
                               `🐉 **Dragon Memory:** \`${ai.dragon}\` ပွဲဆက်\n` +
                               `🗳️ AI ခန့်မှန်း: **${ai.side === "Big" ? "ကြီး" : "သေး"}**\n` +
                               `📊 Confidence: \`${ai.conf}%\`\n` +
                               `🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n` +
                               `🔄 အဆင့်: \`${data.currentMultiplier}X\`\n` +
                               `🇲🇲 Time: \`${mmTime}\``;

                bot.sendMessage(chatId, report, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["📊 Website Results (100)", "📈 AI History"],
        ["📜 Betting History", "🗑️ မှတ်တမ်းဖျက်မည်"],
        ["🚪 Logout ထွက်မည်"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v67\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // 📊 Website Results (Long List 100)
    if (msg.text === "📊 Website Results (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, user_db[chatId].token);
        if (res?.data?.list) {
            let txt = "📊 **နောက်ဆုံးထွက်စဉ် (အရှည်လိုက်)**\n----------------------\n";
            res.data.list.slice(0, 25).forEach(i => {
                txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`;
            });
            bot.sendMessage(chatId, txt + "*(ကျန်ရှိသော ၇၅ ပွဲကို AI Memory မှ တွက်ချက်ထားသည်)*");
        }
    }

    // AI & Betting Histories
    if (msg.text === "📈 AI History") {
        let txt = "📈 **AI Prediction History**\n";
        user_db[chatId].aiPredictionLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ${l.pred}\n`; });
        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }
    if (msg.text === "📜 Betting History") {
        let txt = "📜 **Your Betting History**\n";
        user_db[chatId].betHistory.slice(0, 10).forEach(h => { txt += `🔹 ${h.issue} | ${h.status} | ${h.amount} MMK\n`; });
        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (msg.text === "🚪 Logout ထွက်မည်") {
        user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1, token: null };
        return bot.sendMessage(chatId, "✅ Logout အောင်မြင်သည်။", { reply_markup: { remove_keyboard: true } });
    }

    // Login (v57 Style)
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
        bot.sendMessage(chatId, "🚀 Full System Started.", menu);
    }
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 AI Stopped."); }

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
