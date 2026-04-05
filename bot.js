const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v32: Java Signature Fix'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Java Logic: _randomKey ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- 🛡️ Java Logic: _signMd5 (Strict 32-char Hex) ---
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    
    // Java: JSON String with NO spaces
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    
    // MD5 Hash
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    
    // Java's %032x logic: Ensure it is exactly 32 chars (padded with leading zeros)
    return hash.padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = {
        ...data,
        language: 0,
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now() / 1000)
    };
    payload.signature = signMd5(payload);

    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🎰 Betting Logic (isAgree included) ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် ရှာမတွေ့ပါ။");

    // Java code အတိုင်း amount သတ်မှတ်ချက်
    let baseUnit = totalAmount < 10000 ? 10 : 100;
    
    const betPayload = {
        typeId: 30,
        issuenumber: data.nextIssue,
        language: 0,
        gameType: 2,
        amount: baseUnit,
        betCount: Math.floor(totalAmount / baseUnit),
        selectType: side === "Big" ? 13 : 14,
        isAgree: true // ✅ Website agreement fix
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **${side}** တွင် **${totalAmount}** MMK အောင်မြင်စွာ ထိုးပြီးပါပြီ။`);
    } else {
        const detail = res ? (res.message || JSON.stringify(res)) : "Server Timeout";
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${detail}\``);
    }
}

// --- 🚀 Monitoring & Event Handlers ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: 30 }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            if (lastRound.issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = lastRound.issueNumber;
                user_db[chatId].nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                
                bot.sendMessage(chatId, `🔔 **၃၀ စက္ကန့် ပွဲစဉ်သစ်: ${user_db[chatId].nextIssue.slice(-5)}**`, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big", callback_data: "bet_Big" },
                        { text: "🔴 Small", callback_data: "bet_Small" }
                    ]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === '/start') {
        user_db[chatId] = { running: false, token: null };
        return bot.sendMessage(chatId, "🤖 WinGo v32\nဖုန်းနံပါတ် ပို့ပေးပါ:");
    }
    // (Login Logic remains the same as v31 but uses new callApi with padding fix)
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။ ၃၀ စက္ကန့်ပွဲစဉ်များကို စောင့်ကြည့်နေပါပြီ။`);
        } else {
            bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။");
            user_db[chatId].tempPhone = null;
        }
    }
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
