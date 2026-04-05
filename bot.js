const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive
http.createServer((req, res) => { res.end('WinGo v28: System Optimized'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Precision Signature Generator ---
function generateSignature(payload) {
    const { signature, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = {
        ...data,
        language: 7,
        random: crypto.randomUUID().replace(/-/g, ''),
        timestamp: Math.floor(Date.now() / 1000)
    };
    payload.signature = generateSignature(payload);

    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🎰 Betting Logic (Final Calibration) ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် မရသေးပါ။");

    const betPayload = {
        typeId: data.typeId || 30,
        issuenumber: data.nextIssue,
        amount: 10, // ပုံထဲကအတိုင်း 10 ကျပ်တန် Base
        betCount: Math.floor(totalAmount / 10), // ဥပမာ ၁၀၀ ဖိုးဆိုရင် ၁၀ ဆ
        gameType: 2,
        selectType: side === "Big" ? 13 : 14,
        isAgree: true // ✅ Website Agreement Fix
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **${side === "Big" ? "အကြီး" : "အသေး"}** မှာ **${totalAmount}** MMK တကယ်ထိုးပြီးပါပြီ!`);
    } else {
        const errMsg = res ? (res.message || "Error") : "Server Error";
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${errMsg}\``);
    }
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: user_db[chatId].typeId }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            if (lastRound.issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = lastRound.issueNumber;
                user_db[chatId].nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                
                // AI Choice (ကြီးထွက်ရင် သေးထိုး၊ သေးထွက်ရင် ကြီးထိုး - Reverse Pattern)
                const aiPick = parseInt(lastRound.number) >= 5 ? "သေး (Small)" : "ကြီး (Big)";
                
                bot.sendMessage(chatId, `🧠 **AI ဆုံးဖြတ်ချက်**\n---\n🗳️ ခန့်မှန်းချက်: **${aiPick}**\n🕒 ပွဲစဉ်: ${user_db[chatId].nextIssue.slice(-5)}`, {
                    reply_markup: { inline_keyboard: [[{text: "🔵 Big ကိုထိုးမည်", callback_data: "bet_Big"}, {text: "🔴 Small ကိုထိုးမည်", callback_data: "bet_Small"}]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

// --- 📱 Interaction Events ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (msg.text === '/start') {
        user_db[chatId] = { running: false };
        return bot.sendMessage(chatId, "🤖 WinGo Master v28\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = (res.data.tokenHeader || "Bearer") + " " + res.data.token;
            bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။ လက်ကျန်: ${res.data.amount || res.data.money} MMK`, { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်"]], resize_keyboard: true } 
            });
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပါ။");
            user_db[chatId].tempPhone = null;
        }
        return;
    }

    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်" && user_db[chatId].token) {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI ကို စတင်လိုက်ပါပြီ။ ပွဲစဉ်မှတ်တမ်းများကို စောင့်ကြည့်နေပါသည်။");
    }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `🏦 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ (အနည်းဆုံး ၁၀ ကျပ်):`);
});
