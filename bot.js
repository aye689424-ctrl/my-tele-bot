const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo AI Engine: Ready'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Generator (v23 - Working Version) ---
function generateSignature(payload) {
    try {
        const { signature, timestamp, ...rest } = payload;
        const sortedKeys = Object.keys(rest).sort();
        let sortedObj = {};
        sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
        const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
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
        "User-Agent": "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

async function getBalance(chatId) {
    const res = await callApi("GetBalance", {}, user_db[chatId].token);
    if (res && res.msgCode === 0) return res.data.amount || res.data.money || 0;
    return 0;
}

// --- 🧠 AI Logic (Updated for Better Accuracy) ---
function getAIVote(history) {
    // နောက်ဆုံးထွက်ထားသော ဂဏန်း ၁၅ လုံးကို ကြီး/သေး ခွဲခြားခြင်း
    const results = history.slice(0, 15).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    
    let votes = { B: 0, S: 0 };
    
    // Pattern 1: Dragon (ဆက်တိုက်ထွက်ခြင်း)
    if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0] === "ကြီး" ? "B" : "S"] += 4;
    }
    
    // Pattern 2: Alternating (တစ်လှည့်စီထွက်ခြင်း)
    if (results[0] !== results[1] && results[1] !== results[2]) {
        votes[results[0] === "ကြီး" ? "S" : "B"] += 3;
    }

    // Pattern 3: Recent Strength
    results.slice(0, 5).forEach(r => votes[r === "ကြီး" ? "B" : "S"] += 1);

    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.min(Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100), 98);
    
    return { final, confidence, pattern: results.slice(0, 3).reverse().join("-") };
}

// --- 🚀 Enhanced Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        // ပွဲစဉ်မှတ်တမ်း တောင်းယူခြင်း
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            // ပွဲစဉ်အသစ် တက်လာမှသာ အချက်ပေးမည်
            if (currIssue !== data.last_issue) {
                const ai = getAIVote(history);
                data.last_issue = currIssue;
                data.nextIssue = (BigInt(currIssue) + 1n).toString();

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 တွေ့ရှိသည့်ပုံစံ: \`${ai.pattern}\` \n` +
                            `🗳️ AI ခန့်မှန်းချက်: **${ai.final}**\n` +
                            `📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n` +
                            `🕒 ပွဲစဉ်နံပါတ်: ${data.nextIssue.slice(-5)}\n\n` +
                            `💡 အကြံပြုချက်: နိုင်ခြေနှုန်း ၇၀% ကျော်မှသာ ထိုးပါ။`;
                
                bot.sendMessage(chatId, msg, { 
                    reply_markup: { 
                        inline_keyboard: [[
                            {text: "🔵 Big (Select 13)", callback_data: "bet_Big"}, 
                            {text: "🔴 Small (Select 14)", callback_data: "bet_Small"}
                        ]]
                    },
                    parse_mode: "Markdown"
                });
            }
        }
        // ၅ စက္ကန့်တစ်ခါ စစ်ဆေးမည်
        await new Promise(r => setTimeout(r, 5000));
    }
}

// --- 📱 Interaction & Betting ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const side = query.data.split('_')[1];
    const balance = await getBalance(chatId);
    user_db[chatId].pendingSide = side;
    bot.sendMessage(chatId, `💰 လက်ကျန်ငွေ: **${balance}** MMK\n🏦 **${side}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    // Betting Process
    if (user_db[chatId].pendingSide && /^\d+$/.test(msg.text)) {
        const amount = parseInt(msg.text);
        const side = user_db[chatId].pendingSide;
        const betPayload = {
            typeId: user_db[chatId].typeId || 30,
            issuenumber: user_db[chatId].nextIssue,
            amount: 10,
            betCount: Math.floor(amount / 10),
            gameType: 2,
            selectType: side === "Big" ? 13 : 14
        };

        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res && res.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${side}** တွင် **${amount}** ဖိုး ထိုးပြီးပါပြီ!`);
        } else {
            bot.sendMessage(chatId, `❌ ထိုးမရပါ။ အမှား: ${res?.message || "Error"}`);
        }
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
            const bal = await getBalance(chatId);
            return bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။\n💰 လက်ကျန်ငွေ: ${bal} MMK`, { 
                reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], ["🛑 AI ကို ရပ်တန့်ရန်"]], resize_keyboard: true } 
            });
        } else {
            return bot.sendMessage(chatId, `❌ Login မရပါ။ Password ပြန်စစ်ပါ။`);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = msg.text.includes("၃၀") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ ပွဲစဉ်မှတ်တမ်းများကို စောင့်ကြည့်နေပါသည်...");
    }

    if (msg.text === "🛑 AI ကို ရပ်တန့်ရန်") {
        user_db[chatId].running = false;
        bot.sendMessage(chatId, "🛑 AI ကို ရပ်တန့်လိုက်ပါပြီ။");
    }
});
