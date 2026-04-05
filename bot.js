const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Monitoring
http.createServer((req, res) => { res.end('WinGo Master v29.0: Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature စနစ် (သင်ပေးထားသော Logic အတိုင်း) ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; 
    delete temp.timestamp;
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    // Space အားလုံးဖယ်ပြီး MD5 ပြောင်းခြင်း
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toLowerCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.random = crypto.randomUUID().replace(/-/g, '');
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.language = 7;
    payload.signature = signMd5(payload).toUpperCase();

    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI ဦးနှောက် Logic ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0 };

    if (currentPattern === "ကြီး-သေး-ကြီး") votes.S += 4;
    else if (currentPattern === "သေး-ကြီး-သေး") votes.B += 4;
    else if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0] === "ကြီး" ? "B" : "S"] += 3;
    } else {
        votes[results[0] === "ကြီး" ? "S" : "B"] += 2;
    }

    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern };
}

// --- 🚀 AI စောင့်ကြည့်ရေး စနစ် ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                const ai = getAIVote(history);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                data.last_issue = currIssue;
                data.nextIssue = nextIssue;

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n--------------------------\n📈 ပုံစံ: \`${ai.currentPattern}\` \n🗳️ ခန့်မှန်းချက်: **${ai.final}**\n📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n🕒 ပွဲစဉ်: ${nextIssue.slice(-5)}`;
                
                bot.sendMessage(chatId, msg, { 
                    reply_markup: { inline_keyboard: [[{text: "🔵 Big ထိုးမည်", callback_data: "bet_Big"}, {text: "🔴 Small ထိုးမည်", callback_data: "bet_Small"}]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 🎰 Betting Logic (Final Fix) ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    const betPayload = {
        typeId: data.typeId || 30,
        issuenumber: data.nextIssue,
        amount: 10, 
        betCount: Math.floor(amount / 10),
        gameType: 2,
        selectType: side === "Big" ? 13 : 14,
        isAgree: true // ✅ ပုံထဲက Checkbox အမှန်ခြစ်
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    if (res && res.msgCode === 0) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${amount}** အောင်မြင်စွာ ထိုးပြီးပါပြီ!`);
    } else {
        bot.sendMessage(chatId, `❌ ထိုးမရပါ။ အကြောင်းရင်း: ${res?.message || "Error"}`);
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master AI\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    // Login Flow
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res && res.msgCode === 0) {
            // ✅ Fix: Space ထည့်လိုက်ပါပြီ (Bearer + Space + Token)
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            return bot.sendMessage(chatId, "✅ လော့ဂ်အင် အောင်မြင်သည်။", { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်"]], resize_keyboard: true } 
            });
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။");
            user_db[chatId].tempPhone = null;
        }
        return;
    }

    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်") {
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
    }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `🏦 **${user_db[chatId].pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});
