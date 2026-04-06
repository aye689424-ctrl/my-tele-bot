const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v76: Always Online Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {}; // ⚠️ Render မှာဆိုရင် Restart ချရင် Memory ပျက်တတ်ပါတယ်။

// --- 🛡️ API Helper (Bypass Security) ---
async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: crypto.randomUUID().replace(/-/g, ''), timestamp: Math.floor(Date.now() / 1000) };
    const { signature, ...rest } = payload;
    const sortedStr = JSON.stringify(Object.keys(rest).sort().reduce((obj, key) => { obj[key] = rest[key]; return obj; }, {})).replace(/\s+/g, '');
    payload.signature = crypto.createHash('md5').update(sortedStr).digest('hex').toUpperCase();

    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🔄 Auto Login Function (အလိုအလျောက် ပြန်ဝင်ပေးရန်) ---
async function performAutoLogin(chatId) {
    const data = user_db[chatId];
    if (!data.phone || !data.pwd) return false;
    
    const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + data.phone.replace(/^0/, ''), pwd: data.pwd });
    if (res?.msgCode === 0) {
        user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
        console.log(`[Auto-Login] Success for ${chatId}`);
        return true;
    }
    return false;
}

// --- 🚀 Smart Monitoring Loop (v76 Stable) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        let res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        // ❌ Token ကုန်သွားရင် အလိုအလျောက် ပြန်ဝင်ခိုင်းခြင်း
        if (res?.msgCode === 500 || !res) {
            console.log(`[Session] Expired. Attempting Auto-Login...`);
            const success = await performAutoLogin(chatId);
            if (!success) {
                bot.sendMessage(chatId, "⚠️ Login သက်တမ်းကုန်သွားလို့ ဖုန်းနံပါတ်/Password ပြန်ပေးပါ။");
                data.running = false; break;
            }
            continue; // Login ရပြီဆိုရင် နောက်တစ်ခေါက် ပြန်ပတ်မယ်
        }

        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // VIP Result Report
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    bot.sendMessage(chatId, `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🎲 Status : ${isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔"} | ${realSide.toUpperCase()}(${lastRound.number})`);
                    if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                }

                // Simple Formula Logic (Always Follow Dragon)
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = (realSide); // ဥပမာ - နဂါးတန်းလိုက်ရန်

                bot.sendMessage(chatId, `🚀 **AI Signal Analysis**\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n🗳️ ခန့်မှန်း: **${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, betHistory: [], currentMultiplier: 1 };

    // Betting Fix
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, user_db[chatId].token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : user_db[chatId].nextIssue;

        const res = await callApi("GameBetting", { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true }, user_db[chatId].token);
        
        if (res?.msgCode === 0) bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။`);
        else bot.sendMessage(chatId, `❌ **Error:** ${res?.message || "ထိုးမရပါ"}`);
        
        user_db[chatId].pendingSide = null;
        return;
    }

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo VIP v76\nဖုန်းနံပါတ် ပေးပါ:");

    // Login & Remember Credentials
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].phone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].phone && !user_db[chatId].token) {
        user_db[chatId].pwd = text;
        const success = await performAutoLogin(chatId);
        if (success) {
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ အမြဲတမ်း Online ရှိနေပါမည်။");
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းနေသည်။ ပြန်စပါ။");
            user_db[chatId].phone = null; user_db[chatId].pwd = null;
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** ပမာဏ ရိုက်ထည့်ပါ:`);
});
