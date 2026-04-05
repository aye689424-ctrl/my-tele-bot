const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo Betting Engine: V24 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ New Signature Generator (Strict Sorting) ---
function generateSignature(payload) {
    try {
        const { signature, ...rest } = payload;
        const sortedKeys = Object.keys(rest).sort();
        
        // Website Server က လက်ခံနိုင်ခြေအရှိဆုံး ပုံစံ ၂ မျိုးကို စမ်းသပ်ထားသည်
        // ပထမနည်းလမ်း: JSON Stringify (Space မပါ)
        const jsonStr = JSON.stringify(rest, sortedKeys).replace(/\s+/g, '');
        return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
    } catch (e) { return ""; }
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
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) {
        return { msgCode: -1, message: "Network Error: " + e.message };
    }
}

// --- 🚀 Betting Function (Detailed Feedback) ---
async function placeBet(chatId, side, amount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် မရှိသေးပါ။ ခေတ္တစောင့်ပါ။");

    // WinGo clones အများစုတွင် base amount ကို 1 သို့မဟုတ် 10 သုံးသည်
    const betPayload = {
        typeId: data.typeId || 30,
        issuenumber: data.nextIssue,
        amount: 1, // Base Unit
        betCount: amount, // ပမာဏကို တိုက်ရိုက်ယူခြင်း (ဥပမာ ၁၀၀ ဆိုရင် ၁၀၀ ဆ)
        gameType: 2,
        selectType: side === "Big" ? 13 : 14
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **အောင်မြင်သည်!**\n🎰 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🏦 ရွေးချယ်မှု: ${side === "Big" ? "အကြီး" : "အသေး"}\n💰 ပမာဏ: ${amount} MMK`);
    } else {
        // Website ဘက်က ပြန်လာတဲ့ Message အမှန်ကို ပြခြင်း
        const reason = res ? res.message : "Server Connection Lost";
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${reason}\` \n*(မှတ်ချက်: ပွဲပိတ်ခါနီး ၅ စက္ကန့်အလိုတွင် ထိုး၍မရပါ)*`);
    }
}

// --- 🚀 Monitoring & AI (v23 အတိုင်း) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: user_db[chatId].typeId }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = history[0].issueNumber;
                user_db[chatId].nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                
                // AI Vote Logic...
                const aiResult = history[0].number >= 5 ? "ကြီး" : "သေး"; // ရိုးရှင်းသော logic
                bot.sendMessage(chatId, `🧠 **AI ခန့်မှန်းချက်**\n---\n🗳️ ရွေးချယ်ရန်: **${aiResult === "ကြီး" ? "သေး (Small)" : "ကြီး (Big)"}**\n🕒 ပွဲစဉ်: ${user_db[chatId].nextIssue.slice(-5)}`, {
                    reply_markup: { inline_keyboard: [[{text: "🔵 Big", callback_data: "bet_Big"}, {text: "🔴 Small", callback_data: "bet_Small"}]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

// --- 📱 User Events ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `🏦 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (user_db[chatId].pendingSide && /^\d+$/.test(msg.text)) {
        await placeBet(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
        return;
    }

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master AI\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = (res.data.tokenHeader || "Bearer") + " " + res.data.token;
            return bot.sendMessage(chatId, "✅ Login ရပါပြီ။", { reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်"]], resize_keyboard: true } });
        }
    }

    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်") {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
    }
});
