const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း (Always On)
http.createServer((req, res) => { res.end('WinGo Master v50.0: Dual-AI Online'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Java-Style Security System ---
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

// --- 🧠 Dual AI Analysis Strategy ---
function analyzeGame(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, reason: "" };

    // Pattern Analysis
    if (currentPattern === "Big-Small-Big") { votes.S += 6; votes.reason = "မာကိုချိန်း Mirror တစ်ကွက်ကောင်းတွေ့ရှိ။"; }
    else if (currentPattern === "Small-Big-Small") { votes.B += 6; votes.reason = "မာကိုချိန်း Mirror တစ်ကွက်ကောင်းတွေ့ရှိ။"; }
    else if (results[0] === results[1] && results[1] === results[2] && results[2] === results[3]) {
        votes[results[0] === "Big" ? "B" : "S"] += 8; votes.reason = "နဂါးတန်း (Strong Dragon) အပိုင်ကွက်။";
    } else {
        votes[results[0] === "Big" ? "S" : "B"] += 2; votes.reason = "ပုံမှန် အလှည့်အပြောင်း။";
    }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, reason: votes.reason };
}

// --- 🎰 Betting Logic & Poetic Report ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    const betPayload = { 
        typeId: data.typeId, 
        issuenumber: data.nextIssue, 
        gameType: 2, 
        amount: 10, 
        betCount: Math.floor(amount / 10), 
        selectType: side === "Big" ? 13 : 14, 
        isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const time = new Date().toLocaleTimeString('en-US', { hour12: true });
        
        // 📜 အောင်မြင်မှု အစီရင်ခံစာ စာတစ်စောင်
        const report = `✉️ **ထိုးပွဲ အောင်မြင်မှု အစီရင်ခံစာ**\n` +
                       `--------------------------\n` +
                       `📅 ပွဲစဉ်နံပါတ်: \`${data.nextIssue.slice(-5)}\`\n` +
                       `⏰ အချိန်: \`${time}\`\n` +
                       `🎰 ရွေးချယ်မှု: **${side === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**\n` +
                       `💰 ပမာဏ: \`${amount} MMK\`\n` +
                       `📊 အခြေအနေ: **⏳ စောင့်ဆိုင်းဆဲ (Pending)**\n\n` +
                       `📜 **အားပေးစကား ကဗျာ**\n` +
                       `_"နိုင်ခြေနှုန်းကို အရင်ကြည့်၊ ၇၀ အထက် ရှိမှချိ၊\n` +
                       `Pattern ပျက်လို့ ၃ ပွဲရှုံး၊ ခဏနားကာ အားကိုရုံး။"_\n\n` +
                       `✅ **ထိုးပွဲ စနစ်ထဲသို့ ရောက်ရှိသွားပါပြီ။**`;
        
        bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
        
        data.betHistory.unshift({ 
            issue: data.nextIssue.slice(-5), 
            side, amount, time, status: "⏳ စောင့်ဆိုင်းဆဲ" 
        });
    } else {
        bot.sendMessage(chatId, `❌ **ကျရှုံးသည်:** ${res?.message || "Server Error"}`);
    }
}

// --- 🚀 AI Monitoring System ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                
                // Win/Loss Update Logic
                const lastRealSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                data.betHistory.forEach(bet => {
                    if (bet.issue === history[0].issueNumber.slice(-5) && bet.status === "⏳ စောင့်ဆိုင်းဆဲ") {
                        bet.status = bet.side === lastRealSide ? "✅ နိုင် (WIN)" : "❌ ရှုံး (LOSS)";
                    }
                });

                const ai = analyzeGame(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                // AI 1: Confidence Report
                bot.sendMessage(chatId, `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🗳️ AI ခန့်မှန်း: **${ai.finalSide}**\n📈 ယုံကြည်မှု: \`${ai.confidence}%\``);

                // AI 2: One-Shot Signal (Confidence >= 80%)
                if (ai.confidence >= 80) {
                    setTimeout(() => {
                        bot.sendMessage(chatId, `🎯 **AI 2: တစ်ကွက်ကောင်း Signal!**\n💡 ${ai.reason}\n🗳️ အပိုင်: **${ai.finalSide === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**`, {
                            reply_markup: { inline_keyboard: [[{ text: "🔵 Big ထိုးမည်", callback_data: "bet_Big" }, { text: "🔴 Small ထိုးမည်", callback_data: "bet_Small" }]] }
                        });
                    }, 1200);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 User Interface Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [], betHistory: [] };

    const menu = { reply_markup: { 
        keyboard: [
            ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ကို ရပ်တန့်ရန်"], 
            ["📊 Website Result", "📜 ထိုးခဲ့သည့် History"], 
            ["🗑️ မှတ်တမ်းဖျက်မည်"]
        ], 
        resize_keyboard: true 
    } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Master v50.0**\nဖုန်းနံပါတ် ပို့ပေးပါ:", { reply_markup: { remove_keyboard: true } });

    if (msg.text === "📜 ထိုးခဲ့သည့် History") {
        let txt = "📜 **သင့် betting မှတ်တမ်း (၁၀ ပွဲ)**\n\n";
        user_db[chatId].betHistory.slice(0, 10).forEach(h => {
            txt += `🔹 ပွဲ: ${h.issue} | ${h.status}\n💰 ${h.amount} MMK (${h.side})\n⏰ ${h.time}\n\n`;
        });
        return bot.sendMessage(chatId, user_db[chatId].betHistory.length ? txt : "မှတ်တမ်းမရှိသေးပါ။");
    }

    if (msg.text === "📊 Website Result") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 12, typeId: user_db[chatId].typeId || 30 }, user_db[chatId].token);
        let txt = "📊 **ဝက်ဘ်ဆိုဒ်မှ နောက်ဆုံးရလဒ်များ**\n\n";
        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "ကြီး" : "သေး"})\n`; });
        return bot.sendMessage(chatId, txt);
    }

    if (msg.text === "🗑️ မှတ်တမ်းဖျက်မည်") {
        user_db[chatId].betHistory = [];
        return bot.sendMessage(chatId, "✅ မှတ်တမ်းအားလုံးကို ရှင်းလင်းလိုက်ပါပြီ။");
    }

    // Login logic
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ အသုံးပြုနိုင်ပါပြီ။", menu);
        } else {
            return bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။");
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ အပိုင်ကွက်များကို စောင့်ကြည့်ပေးပါမည်။", menu);
    }

    if (msg.text === "🛑 AI ကို ရပ်တန့်ရန်") {
        user_db[chatId].running = false;
        bot.sendMessage(chatId, "🛑 AI ကို ရပ်တန့်လိုက်ပါပြီ။");
    }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide === "Big" ? "ကြီး" : "သေး"}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
