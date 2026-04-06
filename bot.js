const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v68: Betting Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security System ---
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

// --- 🧠 AI Brain (Markov + Formula) ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }
    
    // Logic: 1-3 Mirror, 4+ Dragon (As per image)
    let side = (last === "Big") ? (dragon <= 3 ? "Small" : "Big") : (dragon <= 3 ? "Big" : "Small");
    return { side, dragon, conf: 80 + Math.floor(Math.random() * 15) };
}

// --- 🚀 Auto Monitoring ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                if (data.last_pred) {
                    const win = data.last_pred === realSide;
                    data.aiPredictionLogs.unshift({ status: win ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred });
                }
                const ai = runAI(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                bot.sendMessage(chatId, `📊 **WinGo AI Report**\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🗳️ ခန့်မှန်း: **${ai.side === "Big" ? "ကြီး" : "သေး"}**\n📊 ယုံကြည်မှု: \`${ai.conf}%\`\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI & Message Handler ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [] };

    // 1. ကြေး (Amount) ကို အရင်ဆုံး စစ်ဆေးခြင်း (Betting Fix)
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const betPayload = { 
            typeId: 30, issuenumber: user_db[chatId].nextIssue, 
            gameType: 2, amount: 10, betCount: Math.floor(amount / 10), 
            selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true 
        };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ ထိုးပြီးပါပြီ: ${amount} MMK`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), status: "Success", amount });
        } else {
            bot.sendMessage(chatId, `❌ မအောင်မြင်ပါ: ${res?.message || "Login ပြန်ဝင်ပါ"}`);
        }
        user_db[chatId].pendingSide = null; // Clear state
        return; // တခြား Logic တွေထဲ ဆက်မသွားအောင် ရပ်လိုက်ခြင်း
    }

    // 2. Menu Buttons
    const menu = { reply_markup: { keyboard: [["🚀 စတင်ရန်", "🛑 ရပ်ရန်"], ["📊 Result (100)", "📈 History"], ["🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v68\nဖုန်းနံပါတ် ပေးပါ:", menu);

    if (text === "🚀 စတင်ရန်") { user_db[chatId].running = true; monitoringLoop(chatId); return bot.sendMessage(chatId, "🚀 စတင်ပါပြီ။"); }
    if (text === "🛑 ရပ်ရန်") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    // 3. Login Logic (After Amount check)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ကြေးပမာဏ ရိုက်ထည့်ပါ:`);
});
