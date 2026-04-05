const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v42: AI + Manual Bet Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Java Source Security ---
function generateRandomKey() {
    return crypto.randomUUID().replace(/-/g, '');
}

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
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI ဦးနှောက် မဟာဗျူဟာ (သင်ပေးထားသော logic) ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, reason: "" };

    if (currentPattern === "ကြီး-သေး-ကြီး") { votes.S += 4; votes.reason = "မာကိုချိန်းအရ ကြီး-သေး-ကြီး တွေ့ရှိ၍ သေး ထွက်ရန် အားသာပါသည်။"; }
    else if (currentPattern === "သေး-ကြီး-သေး") { votes.B += 4; votes.reason = "မာကိုချိန်းအရ သေး-ကြီး-သေး တွေ့ရှိ၍ ကြီး ထွက်ရန် အားသာပါသည်။"; }
    else if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0] === "ကြီး" ? "B" : "S"] += 3; votes.reason = "နဂါးတန်း (Dragon) ဖြစ်နေ၍ နောက်မှ လိုက်ရန် အားသာပါသည်။";
    } else {
        votes[results[0] === "ကြီး" ? "S" : "B"] += 2; votes.reason = "ဆန့်ကျင်ဘက် (Mirror) ထွက်ရန် အားသာနေပါသည်။";
    }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, reason: votes.reason };
}

// --- 🎰 Betting Handler ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    const betPayload = {
        typeId: data.typeId,
        issuenumber: data.nextIssue,
        gameType: 2,
        amount: 10,
        betCount: Math.floor(totalAmount / 10),
        selectType: side === "Big" ? 13 : 14,
        isAgree: true
    };
    const res = await callApi("GameBetting", betPayload, data.token);
    if (res && (res.msgCode === 0 || res.msg === "Bet success")) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${totalAmount}** MMK ထိုးပြီးပါပြီ။`);
    } else {
        bot.sendMessage(chatId, `❌ **Error:** ${res?.message || "Server Error"}`);
    }
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                const ai = getAIVote(history);
                data.last_issue = currIssue;
                data.nextIssue = (BigInt(currIssue) + 1n).toString();

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 **တွေ့ရှိသည့်ပုံစံ:** \`${ai.currentPattern}\` \n` +
                            `🗳️ **AI ခန့်မှန်းချက်:** **${ai.finalSide === "Big" ? "ကြီး (Big)" : "သေး (Small)"}**\n` +
                            `📊 **ယုံကြည်မှု:** \`${ai.confidence}%\`\n` +
                            `🕒 **ပွဲစဉ်:** ${data.nextIssue.slice(-5)}\n\n` +
                            `💡 **အကြံပြုချက်:** ${ai.reason}`;
                
                bot.sendMessage(chatId, msg, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔵 Big (ကြီး) ထိုးမည်", callback_data: "bet_Big" }],
                            [{ text: "🔴 Small (သေး) ထိုးမည်", callback_data: "bet_Small" }]
                        ]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Message Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === '/start') {
        user_db[chatId] = { running: false };
        return bot.sendMessage(chatId, "🤖 WinGo v42 (AI + Manual)\nဖုန်းနံပါတ် ပို့ပေးပါ:");
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            user_db[chatId].typeId = 30; // Default 30s
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ AI က ပွဲစဉ်များကို စောင့်ကြည့်နေပါပြီ။");
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
