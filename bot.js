const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v31: 30s Manual Mode'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Java Logic: Random Key Generator ('xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx') ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- 🛡️ Java Logic: _signMd5 (No Spaces, Sorted, JSON to MD5) ---
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    
    // Java ကုဒ်ထဲကအတိုင်း Space အားလုံးကို ဖယ်ထုတ်ပစ်ခြင်း
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = {
        ...data,
        language: 0, // Java ကုဒ်ထဲတွင် 0 ဖြစ်သည်
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now() / 1000)
    };
    payload.signature = signMd5(payload);

    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🎰 ၃၀ စက္ကန့် ခလုတ်နှိပ်၍ ထိုးခြင်း (Manual Bet) ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် မသိရသေးပါ။");

    // Java ကုဒ်ထဲက Amount Calculation Logic အတိုင်း
    let baseAmount = totalAmount < 10000 ? 10 : 100; 
    let betCount = Math.floor(totalAmount / baseAmount);

    const betPayload = {
        typeId: 30, // ၃၀ စက္ကန့်
        issuenumber: data.nextIssue,
        gameType: 2,
        amount: baseAmount,
        betCount: betCount,
        selectType: side === "Big" ? 13 : 14
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **အောင်မြင်သည်!**\n🎰 ${side} မှာ ${totalAmount} MMK ထိုးပြီးပါပြီ။`);
    } else {
        bot.sendMessage(chatId, `❌ **ကျရှုံးသည်:** ${res?.message || "Server Error"}`);
    }
}

// --- 🚀 ပွဲစဉ်စောင့်ကြည့်ရေး (Monitoring) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: 30 }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            if (lastRound.issueNumber !== user_db[chatId].last_issue) {
                user_db[chatId].last_issue = lastRound.issueNumber;
                user_db[chatId].nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                
                bot.sendMessage(chatId, `🔔 **၃၀ စက္ကန့် ပွဲစဉ်အသစ်: ${user_db[chatId].nextIssue.slice(-5)}**\nထိုးလိုသည့်ဘက်ကို ရွေးနှိပ်ပါ-`, {
                    reply_markup: { 
                        inline_keyboard: [[
                            { text: "🔵 Big (အကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (အသေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 3000)); // ၃၀ စက္ကန့်ပွဲဖြစ်၍ ခပ်သွက်သွက်စစ်ပေးခြင်း
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === '/start') {
        user_db[chatId] = { running: false, token: null };
        return bot.sendMessage(chatId, "🤖 **WinGo Master v31**\nဖုန်းနံပါတ် ပို့ပေးပါ:");
    }

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
            bot.sendMessage(chatId, `✅ Login ရပါပြီ။ ၃၀ စက္ကန့်ပွဲစဉ်များကို စတင်စောင့်ကြည့်နေပါသည်။`);
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။");
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
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ (MMK) ကို ရိုက်ထည့်ပါ:`);
});
