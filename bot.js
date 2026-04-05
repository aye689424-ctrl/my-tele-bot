const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v33: 402 Code Bypass'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// Java Logic: _randomKey
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Java Logic: _signMd5 (Space-less, Sorted)
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// 🎰 Betting Logic (Revised for 402 & Amount Logic)
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် ရှာမတွေ့သေးပါ။");

    // Java code: amount logic အတိအကျ
    // ၁၀၀၀၀ အောက်ဆိုလျှင် ၁၀ ကျပ်တန်၊ အထက်ဆိုလျှင် ၁၀ ရဲ့ ထပ်ကိန်းများဖြင့် တွက်ချက်သည်
    let baseUnit = totalAmount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(totalAmount)) - 2);
    if (baseUnit < 10) baseUnit = 10; // အနည်းဆုံး ၁၀ ကျပ်

    const betPayload = {
        typeId: 30,
        issuenumber: data.nextIssue,
        language: 0,
        gameType: 2,
        amount: Math.floor(baseUnit),
        betCount: Math.floor(totalAmount / baseUnit),
        selectType: side === "Big" ? 13 : 14,
        isAgree: true
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    // msgCode က 0 ဖြစ်စေ၊ 402 ဖြစ်စေ (Bet Success လို့ပြလျှင်) အောင်မြင်သည်ဟု သတ်မှတ်မည်
    if (res && (res.msgCode === 0 || res.msg === "Bet success")) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${totalAmount}** MMK ထိုးပြီးပါပြီ။`);
    } else {
        const detail = res ? JSON.stringify(res) : "Network Error";
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${detail}\``);
    }
}

// 🚀 Monitoring Loop & Other Handlers (v32 အတိုင်း)
// ... (MonitoringLoop, bot.on('message'), bot.on('callback_query'))
// (အပေါ်က v32 ကုဒ်မှ အပိုင်းများကို ဤနေရာတွင် အစားထိုးသုံးနိုင်သည်)
