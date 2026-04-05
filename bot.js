const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း
http.createServer((req, res) => { res.end('AI Betting Bot is Live'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ API Core Logic ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp;
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toLowerCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.language = 7;
    payload.random = crypto.randomUUID().replace(/-/g, '');
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.signature = signMd5(payload).toUpperCase();

    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 💰 Balance Recovery (လက်ကျန်ငွေ မပေါ်ပေါ်အောင် ရှာသည့်စနစ်) ---
async function getBalance(chatId) {
    const endpoints = ["GetUserInfo", "GetBalance", "GetPlayerInfo"];
    for (let ep of endpoints) {
        const res = await callApi(ep, {}, user_db[chatId].token);
        if (res && res.msgCode === 0) {
            return parseFloat(res.data.amount || res.data.money || res.data.balance || 0);
        }
    }
    return 0;
}

// --- 🧠 AI Core ---
function getAIVote(history) {
    const results = history.slice(0, 15).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0 };
    if (currentPattern === "ကြီး-သေး-ကြီး") votes.S += 5;
    else if (currentPattern === "သေး-ကြီး-သေး") votes.B += 5;
    else votes[results[0] === "ကြီး" ? "S" : "B"] += 2;
    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern };
}

// --- 🚀 Auto Monitoring ---
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

                const msg = `🧠 **AI ဆုံးဖြတ်ချက်**\n---\n📈 ပုံစံ: \`${ai.currentPattern}\` \n🗳️ AI ခန့်မှန်း: **${ai.final}**\n📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}`;
                
                bot.sendMessage(chatId, msg, { 
                    reply_markup: { 
                        inline_keyboard: [[
                            {text: "🔵 အကြီး (Big)", callback_data: "bet_Big"}, 
                            {text: "🔴 အသေး (Small)", callback_data: "bet_Small"}
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 User Actions ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const side = query.data.split('_')[1];
    const balance = await getBalance(chatId);
    user_db[chatId].pendingSide = side;
    bot.sendMessage(chatId, `💰 လက်ကျန်: **${balance}** MMK\n🏦 **${side === "Big" ? "အကြီး" : "အသေး"}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    // Betting Action
    if (user_db[chatId].pendingSide && /^\d+$/.test(msg.text)) {
        const amount = parseInt(msg.text);
        const side = user_db[chatId].pendingSide;
        const balance = await getBalance(chatId);

        if (amount > balance) return bot.sendMessage(chatId, `❌ ငွေမလုံလောက်ပါ။ (လက်ရှိ: ${balance})`);

        const betPayload = {
            typeId: user_db[chatId].typeId || 30,
            issuenumber: user_db[chatId].nextIssue,
            amount: 10,
            betCount: Math.floor(amount / 10),
            gameType: 2,
            selectType: side === "Big" ? 13 : 14 // 13=ကြီး, 14=သေး
        };

        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res && res.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${side === "Big" ? "အကြီး" : "အသေး"}** တွင် **${amount}** ဖိုး ထိုးပြီးပါပြီ!`);
        } else {
            bot.sendMessage(chatId, `❌ ထိုးမရပါ။ အမှား: ${res?.message || "Timeout"}`);
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    // Start & Login
    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master AI\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = "Bearer " + res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", { reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], ["🛑 AI ကို ရပ်တန့်ရန်"]], resize_keyboard: true } });
        } else {
            return bot.sendMessage(chatId, "❌ Password မှားနေသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပါ။");
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = msg.text.includes("၃၀") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI အလုပ်လုပ်နေပါပြီ...");
    }
});
