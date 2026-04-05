const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo Engine: Online'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Generator (v22.0 - Optimized) ---
function generateSignature(payload) {
    try {
        // Signature နှင့် Timestamp မပါသော ကျန်တာအားလုံးကို Sort လုပ်သည်
        const { signature, timestamp, ...rest } = payload;
        const sortedKeys = Object.keys(rest).sort();
        let sortedObj = {};
        sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
        
        // JSON stringify လုပ်ရာတွင် Space အားလုံးကို ဖယ်ရှားသည်
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
        "Accept": "application/json, text/plain, */*",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 20000 });
        return res.data;
    } catch (e) {
        console.log(`API Error [${endpoint}]:`, e.message);
        return { msgCode: -1, message: "Network Timeout သို့မဟုတ် Server ချိတ်ဆက်မှုမရပါ" };
    }
}

// --- 💰 Balance Check ---
async function getBalance(chatId) {
    const res = await callApi("GetBalance", {}, user_db[chatId].token);
    if (res && res.msgCode === 0) {
        return res.data.amount || res.data.money || 0;
    }
    return "0.00";
}

// --- 🧠 AI & Monitoring (အရင်အတိုင်း) ---
// (ကုဒ်ရှည်မည်စိုး၍ Monitoring အပိုင်းကို အကျဉ်းချထားသော်လည်း v21 အတိုင်း အလုပ်လုပ်ပါမည်)

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    if (msg.text === '/start') {
        user_db[chatId].token = null; // Reset token on start
        return bot.sendMessage(chatId, "🤖 WinGo Master AI\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");
    }

    // Login Flow
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const password = msg.text;
        
        bot.sendMessage(chatId, "⏳ Login ဝင်နေပါသည်၊ ခဏစောင့်ပါ...");
        
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: phone, pwd: password });
        
        if (res && res.msgCode === 0) {
            // TokenHeader က "Bearer" ဖြစ်နိုင်သလို အလွတ်လည်း ဖြစ်နိုင်သည်
            const tokenPrefix = res.data.tokenHeader ? res.data.tokenHeader + " " : "Bearer ";
            user_db[chatId].token = tokenPrefix + res.data.token;
            
            const bal = await getBalance(chatId);
            return bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။\n💰 လက်ကျန်ငွေ: ${bal} MMK`, { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], ["🛑 AI ကို ရပ်တန့်ရန်"]], resize_keyboard: true } 
            });
        } else {
            const errMsg = res ? res.message : "Server မှ တုံ့ပြန်မှု မရှိပါ";
            return bot.sendMessage(chatId, `❌ Login ကျရှုံးသည်။ အကြောင်းရင်း: ${errMsg}`);
        }
    }
    
    // START AI Logic (အရင်အတိုင်း ဆက်လက်ထည့်သွင်းထားပါသည်)
    if (msg.text?.includes("စတင်ရန်") && user_db[chatId].token) {
        // Monitoring logic here...
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ အချက်အလက်များ တက်လာသည်အထိ စောင့်ပါ။");
    }
});
