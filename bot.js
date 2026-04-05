const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v27: Logic Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Generator (Consistent with v26) ---
function generateSignature(payload) {
    const { signature, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let signObj = {};
    sortedKeys.forEach(key => { signObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(signObj).replace(/\s+/g, '');
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
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🎰 Betting Logic (isAgree Added) ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    
    // ပုံထဲကအတိုင်း Parameter များ ပြင်ဆင်ခြင်း
    const betPayload = {
        typeId: data.typeId || 30,
        issuenumber: data.nextIssue,
        amount: 10, // Base Amount
        betCount: Math.floor(totalAmount / 10), // Multiply
        gameType: 2,
        selectType: side === "Big" ? 13 : 14,
        isAgree: true // ✅ ဒါက အရေးကြီးဆုံး အချက်ပါ
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${totalAmount}** အောင်မြင်စွာ ထိုးပြီးပါပြီ!`);
    } else {
        const errMsg = res ? (res.message || "Error") : "Server Timeout";
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
                
                // AI Logic
                const num = parseInt(lastRound.number);
                const aiPick = num >= 5 ? "သေး (Small)" : "ကြီး (Big)"; // Opposite betting logic or use AI 1
                
                bot.sendMessage(chatId, `🧠 **AI ခန့်မှန်းချက်**\n---\n🗳️ ရွေးချယ်ရန်: **${aiPick}**\n🕒 ပွဲစဉ်: ${user_db[chatId].nextIssue.slice(-5)}`, {
                    reply_markup: { inline_keyboard: [[{text: "🔵 Big", callback_data: "bet_Big"}, {text: "🔴 Small", callback_data: "bet_Small"}]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Telegram Events ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (msg.text === '/start') {
        user_db[chatId] = { running: false };
        return bot.sendMessage(chatId, "🤖 WinGo Master v27\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = (res.data.tokenHeader || "Bearer") + " " + res.data.token;
            bot.sendMessage(chatId, `✅ Login ရပါပြီ။ လက်ကျန်: ${res.data.amount || res.data.money} MMK`, { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်"]], resize_keyboard: true } 
            });
        }
        return;
    }

    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်") {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ...");
    }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `🏦 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ (ဥပမာ: 100):`);
});
