const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း
http.createServer((req, res) => { res.end('WinGo System v25: Online'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Generator (v25 - Strict Version) ---
function generateSignature(payload) {
    try {
        // signature နှင့် timestamp ကို ဖယ်ထုတ်ပြီး ကျန်တာကို Sort လုပ်သည်
        const { signature, timestamp, ...rest } = payload;
        const sortedKeys = Object.keys(rest).sort();
        let sortedObj = {};
        sortedKeys.forEach(key => {
            sortedObj[key] = rest[key];
        });
        
        // Website Server အများစု လက်ခံသော MD5 Stringify ပုံစံ
        const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
        return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
    } catch (e) {
        return "";
    }
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
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) {
        return { msgCode: -1, message: "ချိတ်ဆက်မှု အဆင်မပြေပါ (Network Error)" };
    }
}

// --- 💰 Balance Check ---
async function getBalance(chatId) {
    const res = await callApi("GetBalance", {}, user_db[chatId].token);
    if (res && res.msgCode === 0) {
        return res.data.amount || res.data.money || 0;
    }
    return 0;
}

// --- 🚀 Monitoring & AI ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: user_db[chatId].typeId }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = history[0].issueNumber;
                user_db[chatId].nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                
                const aiResult = parseInt(history[0].number) >= 5 ? "ကြီး (Big)" : "သေး (Small)";
                bot.sendMessage(chatId, `🧠 **AI ခန့်မှန်းချက်**\n---\n🗳️ ရွေးချယ်ရန်: **${aiResult === "ကြီး (Big)" ? "သေး (Small)" : "ကြီး (Big)"}**\n🕒 ပွဲစဉ်: ${user_db[chatId].nextIssue.slice(-5)}`, {
                    reply_markup: { inline_keyboard: [[{text: "🔵 Big", callback_data: "bet_Big"}, {text: "🔴 Small", callback_data: "bet_Small"}]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (msg.text === '/start') {
        user_db[chatId] = { running: false }; // Clear session
        return bot.sendMessage(chatId, "🤖 WinGo Master AI v25\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");
    }

    // Login Flow
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        bot.sendMessage(chatId, "⏳ Login ဝင်ရန် ကြိုးစားနေပါသည်...");
        
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: phone, pwd: msg.text });
        
        if (res && res.msgCode === 0) {
            user_db[chatId].token = (res.data.tokenHeader || "Bearer") + " " + res.data.token;
            const bal = await getBalance(chatId);
            bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။\n💰 လက်ကျန်ငွေ: ${bal} MMK`, { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်"]], resize_keyboard: true } 
            });
        } else {
            const reason = res ? res.message : "Website Server က အကြောင်းမပြန်ပါ";
            bot.sendMessage(chatId, `❌ Login ကျရှုံးသည်။\nအကြောင်းရင်း: \`${reason}\` \n(ဖုန်းနံပါတ် သို့မဟုတ် Password ပြန်ပို့ပါ)`);
            user_db[chatId].tempPhone = null; // Reset for retry
        }
        return;
    }

    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်" && user_db[chatId].token) {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ ပွဲစဉ်မှတ်တမ်းများကို စောင့်ကြည့်နေပါသည်...");
    }
});

// --- 🎰 Betting Logic ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `🏦 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        const amount = parseInt(msg.text);
        const side = user_db[chatId].pendingSide;
        
        const betPayload = {
            typeId: user_db[chatId].typeId || 30,
            issuenumber: user_db[chatId].nextIssue,
            amount: 1,
            betCount: amount,
            gameType: 2,
            selectType: side === "Big" ? 13 : 14
        };

        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res && res.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${side}** မှာ **${amount}** ဖိုး အောင်မြင်စွာ ထိုးပြီးပါပြီ!`);
        } else {
            bot.sendMessage(chatId, `❌ ထိုးမရပါ။ အကြောင်းရင်း: ${res?.message || "Error"}`);
        }
        user_db[chatId].pendingSide = null;
    }
});
