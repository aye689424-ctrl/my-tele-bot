const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive
http.createServer((req, res) => { res.end('WinGo Dual-AI v47 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Java Security Logic ---
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

// --- 🧠 Dual AI Analysis ---
function analyzeGame(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, reason: "" };

    if (currentPattern === "ကြီး-သေး-ကြီး") { votes.S += 5; votes.reason = "မာကိုချိန်း Mirror တစ်ကွက်ကောင်း။"; }
    else if (currentPattern === "သေး-ကြီး-သေး") { votes.B += 5; votes.reason = "မာကိုချိန်း Mirror တစ်ကွက်ကောင်း။"; }
    else if (results[0] === results[1] && results[1] === results[2] && results[2] === results[3]) {
        votes[results[0] === "ကြီး" ? "B" : "S"] += 6; votes.reason = "နဂါးတန်း (Strong Dragon) အပိုင်ကွက်။";
    } else {
        votes[results[0] === "ကြီး" ? "S" : "B"] += 2; votes.reason = "ဆန့်ကျင်ဘက် (Mirror) အားသာချက်။";
    }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, reason: votes.reason };
}

// --- 🚀 AI Monitoring System ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    data.winLossLogs.unshift({ status: data.last_pred === real ? "✅" : "❌", issue: history[0].issueNumber.slice(-3) });
                }

                const ai = analyzeGame(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                // --- 📊 AI 1: ယုံကြည်မှု အမြဲတမ်းစာရင်း ---
                const msg1 = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n` +
                             `--------------------------\n` +
                             `📈 တွေ့ရှိပုံစံ: \`${ai.currentPattern}\`\n` +
                             `🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**\n` +
                             `📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n` +
                             `🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}`;
                bot.sendMessage(chatId, msg1);

                // --- ⚡ AI 2: တစ်ကွက်ကောင်း Single Shot (Confidence 85% ကျော်မှ) ---
                if (ai.confidence >= 85) {
                    setTimeout(() => {
                        const msg2 = `🎯 **AI 2: တစ်ကွက်ကောင်း Single Shot!**\n` +
                                     `💡 ${ai.reason}\n\n` +
                                     `🗳️ အပိုင်ကွက်: **${ai.finalSide === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**\n` +
                                     `အမြန်ထိုးရန် ခလုတ်နှိပ်ပါ-`;
                        bot.sendMessage(chatId, msg2, {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: "🔵 Big (ကြီး) ထိုးမည်", callback_data: "bet_Big" },
                                    { text: "🔴 Small (သေး) ထိုးမည်", callback_data: "bet_Small" }
                                ]]
                            }
                        });
                    }, 1500);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Telegram UI & Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [], betHistory: [] };

    const menu = { reply_markup: { 
        keyboard: [
            ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ကို ရပ်တန့်ရန်"], 
            ["📊 Website Result", "📈 နိုင်/ရှုံး မှတ်တမ်း"], 
            ["📜 ထိုးခဲ့သည့် History", "🗑️ မှတ်တမ်းဖျက်မည်"]
        ], 
        resize_keyboard: true 
    } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Dual-AI v47**\nအသုံးပြုရန် ဖုန်းနံပါတ် ပို့ပေးပါ:");

    // မှတ်တမ်းနှင့် Result များ (v43 logic)
    if (msg.text === "📊 Website Result") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 12, typeId: user_db[chatId].typeId || 30 }, user_db[chatId].token);
        let txt = "📊 **နောက်ဆုံးထွက် ရလဒ်များ**\n\n";
        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "ကြီး" : "သေး"})\n`; });
        return bot.sendMessage(chatId, txt);
    }

    if (msg.text === "📈 နိုင်/ရှုံး မှတ်တမ်း") {
        const logs = user_db[chatId].winLossLogs;
        let txt = "📉 **AI ခန့်မှန်းချက် မှတ်တမ်း**\n\n";
        logs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲစဉ်: ${l.issue}\n`; });
        return bot.sendMessage(chatId, logs.length ? txt : "မှတ်တမ်းမရှိသေးပါ။");
    }

    if (msg.text === "📜 ထိုးခဲ့သည့် History") {
        const history = user_db[chatId].betHistory;
        let txt = "📜 **သင်ထိုးခဲ့သည့် History**\n\n";
        history.slice(0, 10).forEach(h => { txt += `⏰ ${h.time} | ${h.issue} | ${h.side} | ${h.amount} MMK\n`; });
        return bot.sendMessage(chatId, history.length ? txt : "ထိုးထားသည့် မှတ်တမ်းမရှိသေးပါ။");
    }

    if (msg.text === "🗑️ မှတ်တမ်းဖျက်မည်") {
        user_db[chatId].winLossLogs = [];
        user_db[chatId].betHistory = [];
        return bot.sendMessage(chatId, "✅ မှတ်တမ်းအားလုံးကို ရှင်းလင်းလိုက်ပါပြီ။");
    }

    // Login logic
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 စကားဝှက် (Password) ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ အသုံးပြုနိုင်ပါပြီ။", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 Dual AI စတင်ပါပြီ။", menu);
    }

    if (msg.text === "🛑 AI ကို ရပ်တန့်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်တန့်လိုက်ပါပြီ။"); }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    const betPayload = { typeId: data.typeId, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
    const res = await callApi("GameBetting", betPayload, data.token);
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side, amount, time: new Date().toLocaleTimeString() });
        bot.sendMessage(chatId, `✅ ${side} မှာ ${amount} MMK ထိုးပြီးပါပြီ။`);
    }
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
