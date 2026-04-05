const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo Betting AI Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature & API Core ---
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
    payload.random = crypto.randomUUID().replace(/-/g, '');
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.signature = signMd5(payload).toUpperCase();
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI Core Logic ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0 };

    if (currentPattern === "ကြီး-သေး-ကြီး") votes.S += 5;
    else if (currentPattern === "သေး-ကြီး-သေး") votes.B += 5;
    else votes[results[0] === "ကြီး" ? "S" : "B"] += 2;

    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern };
}

// --- 🚀 AI Monitoring & AI 2 (တစ်ကွက်ကောင်း) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // Win/Loss Tracking
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "ကြီး (Big)" : "သေး (Small)";
                    data.winLossLogs.unshift({ status: data.last_pred === real ? "✅" : "❌" });
                    if (data.winLossLogs.length > 50) data.winLossLogs.pop();
                }

                const ai = getAIVote(history);
                const wins = data.winLossLogs.filter(l => l.status === "✅").length;
                const winRate = data.winLossLogs.length > 0 ? Math.round((wins / data.winLossLogs.length) * 100) : 0;
                
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                data.last_pred = ai.final;
                data.last_issue = currIssue;
                data.nextIssue = nextIssue;

                // AI 1: ပုံမှန် အစီရင်ခံစာ
                const status = winRate >= 75 ? "🟢 အန္တရာယ်ကင်း" : (winRate >= 60 ? "🟡 သတိထားပါ" : "🔴 အန္တရာယ်ရှိ");
                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n--------------------------\n📈 တွေ့ရှိသည့်ပုံစံ: ${ai.currentPattern}\n🗳️ AI ခန့်မှန်းချက်: ${ai.final}\n📊 ယုံကြည်မှု: ${ai.confidence}%\n🛡️ အခြေအနေ: ${status} (${winRate}%)\n🕒 ပွဲစဉ်နံပါတ်: ${nextIssue.slice(-5)}\n\n📜 **သတိပေးကဗျာ**\n"နိုင်ခြေနှုန်းကို အရင်ကြည့်၊ ၇၀ အထက် ရှိမှချိ၊\nPattern ပျက်လို့ ၃ ပွဲရှုံး၊ ခဏနားကာ အားကိုရုံး။"`;
                
                bot.sendMessage(chatId, msg, { reply_markup: { inline_keyboard: [[{text: "🔵 Big ကိုနှိပ်၍ ကြေးတင်ရန်", callback_data: "bet_Big"}, {text: "🔴 Small ကိုနှိပ်၍ ကြေးတင်ရန်", callback_data: "bet_Small"}]] } });

                // AI 2: တစ်ကွက်ကောင်း (ကြိမ်းသေမှ ပို့မည်)
                if (winRate >= 85 && ai.confidence >= 90) {
                    bot.sendMessage(chatId, `🔥 **AI 2: ကြိမ်းသေ တစ်ကွက်ကောင်း!**\n\nဒီပွဲဟာ Win Rate ရော Confidence ရော အထူးမြင့်မားနေပါတယ်။\n🎯 ခန့်မှန်းချက်: **${ai.final}**\n💰 အကြံပြုချက်: ကြေးမြှင့်တင်နိုင်ပါသည်။`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Interaction & Betting ---
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const side = query.data.split('_')[1];
    user_db[chatId].pendingSide = side;
    bot.sendMessage(chatId, `🏦 **${side}** အတွက် ထိုးမည့်ပမာဏ (ဥပမာ- 1000) ကို ရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    // Betting Action
    if (user_db[chatId].pendingSide && /^\d+$/.test(msg.text)) {
        const amount = msg.text;
        const side = user_db[chatId].pendingSide;
        const res = await callApi("GameBetting", {
            typeId: user_db[chatId].typeId || 1,
            amount: amount,
            betType: side === "Big" ? 1 : 2, // Website API အလိုက် ပြောင်းလဲနိုင်သည်
            issueNumber: user_db[chatId].nextIssue
        }, user_db[chatId].token);

        if (res?.msgCode === 0) bot.sendMessage(chatId, `✅ **${side}** မှာ **${amount}** ဖိုး အောင်မြင်စွာ ထိုးပြီးပါပြီ!`);
        else bot.sendMessage(chatId, `❌ ထိုး၍မရပါ (Balance မလောက်ခြင်း သို့မဟုတ် အချိန်ပြည့်သွားခြင်း)`);
        
        user_db[chatId].pendingSide = null;
        return;
    }

    // Menu Handlers
    const menu = { reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], ["📊 ဝက်ဘ်ဆိုဒ် ရလဒ်များ", "📈 နိုင်/ရှုံး (၅၀) မှတ်တမ်း"], ["🗑️ မှတ်တမ်းအားလုံးဖျက်ရန်", "🛑 AI ကို ရပ်တန့်ရန်"]], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master AI အသုံးပြုရန် ဖုန်းနံပါတ် (09...) ပို့ပေးပါ:", menu);
    
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ ဂိမ်းစတင်ပါ!", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = msg.text.includes("၃၀") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu);
    }
});
