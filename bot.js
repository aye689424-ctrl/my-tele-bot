const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Server Keep Alive
http.createServer((req, res) => { res.end('WinGo Balance-Fixed Engine Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature Generator ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; 
    delete temp.timestamp;
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
        "Accept": "application/json, text/plain, */*",
        "Authorization": authToken || "",
        "Origin": "https://www.777bigwingame.app",
        "Referer": "https://www.777bigwingame.app/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 💰 Balance Check (Fixed with Payload) ---
async function getBalance(chatId) {
    // ပေးထားတဲ့ Payload အတိုင်း Parameter များထည့်သွင်းခေါ်ဆိုခြင်း
    const res = await callApi("GetBalance", {}, user_db[chatId].token);
    if (res && res.msgCode === 0) {
        return parseFloat(res.data.amount);
    }
    return 0;
}

// --- 🧠 AI Analysis ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "ကြီး" : "သေး"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0 };

    if (currentPattern === "ကြီး-သေး-ကြီး") votes.S += 5;
    else if (currentPattern === "သေး-ကြီး-သေး") votes.B += 5;
    else if (results[0] === results[1] && results[1] === results[2]) votes[results[0] === "ကြီး" ? "B" : "S"] += 3;
    else votes[results[0] === "ကြီး" ? "S" : "B"] += 2;

    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern };
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
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "ကြီး (Big)" : "သေး (Small)";
                    data.winLossLogs.unshift({ status: data.last_pred === real ? "✅" : "❌", issue: currIssue.slice(-3) });
                }

                const ai = getAIVote(history);
                const wins = data.winLossLogs.filter(l => l.status === "✅").length;
                const winRate = data.winLossLogs.length > 0 ? Math.round((wins / data.winLossLogs.length) * 100) : 0;
                
                data.last_pred = ai.final;
                data.last_issue = currIssue;
                data.nextIssue = (BigInt(currIssue) + 1n).toString();

                let status = winRate >= 75 ? "🟢 အန္တရာယ်ကင်း" : (winRate >= 60 ? "🟡 သတိထားပါ" : "🔴 အန္တရာယ်ရှိ");

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 တွေ့ရှိသည့်ပုံစံ: \`${ai.currentPattern}\` \n` +
                            `🗳️ AI ခန့်မှန်းချက်: **${ai.final}**\n` +
                            `📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n` +
                            `🛡️ အခြေအနေ: ${status} (${winRate}%)\n` +
                            `🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n\n` +
                            `📜 **သတိပေးကဗျာ**\n` +
                            `_"နိုင်ခြေနှုန်းကို အရင်ကြည့်၊ ၇၀ အထက် ရှိမှချိ၊\n` +
                            `Pattern ပျက်လို့ ၃ ပွဲရှုံး၊ ခဏနားကာ အားကိုရုံး။"_`;
                
                bot.sendMessage(chatId, msg, { 
                    reply_markup: { 
                        inline_keyboard: [[{text: "🔵 Big ကိုနှိပ်၍ ကြေးတင်ရန်", callback_data: "bet_Big"}, {text: "🔴 Small ကိုနှိပ်၍ ကြေးတင်ရန်", callback_data: "bet_Small"}]]
                    },
                    parse_mode: "Markdown"
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Interaction & Betting ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const side = query.data.split('_')[1];
    const balance = await getBalance(chatId);
    user_db[chatId].pendingSide = side;
    bot.sendMessage(chatId, `💰 လက်ကျန်ငွေ: **${balance}** MMK\n🏦 **${side === "Big" ? "အကြီး" : "အသေး"}** အတွက် ထိုးမည့်ပမာဏ (10 မှစ၍) ကို ရိုက်ထည့်ပါ:`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    if (user_db[chatId].pendingSide && /^\d+$/.test(msg.text)) {
        const totalAmount = parseInt(msg.text);
        const side = user_db[chatId].pendingSide;
        const balance = await getBalance(chatId);

        if (totalAmount < 10) return bot.sendMessage(chatId, "❌ အနည်းဆုံး 10 MMK မှ စတင်ထိုးရပါမည်။");
        if (totalAmount > balance) {
            bot.sendMessage(chatId, `❌ လက်ကျန်ငွေ မလုံလောက်ပါ။ (လက်ရှိ: ${balance})`);
            user_db[chatId].pendingSide = null;
            return;
        }

        const betPayload = {
            typeId: user_db[chatId].typeId || 30,
            issuenumber: user_db[chatId].nextIssue,
            amount: 10, 
            betCount: Math.floor(totalAmount / 10),
            gameType: 2,
            selectType: side === "Big" ? 13 : 14
        };

        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res && res.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${side === "Big" ? "အကြီး" : "အသေး"}** မှာ **${totalAmount}** ဖိုး အောင်မြင်စွာ ထိုးပြီးပါပြီ!`);
        } else {
            bot.sendMessage(chatId, `❌ ထိုး၍မရပါ။ အမှား: ${res?.message || "Error"}`);
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], ["📈 နိုင်/ရှုံး (၅၀) မှတ်တမ်း", "🗑️ မှတ်တမ်းအားလုံးဖျက်ရန်"], ["🛑 AI ကို ရပ်တန့်ရန်"]], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master AI\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    if (msg.text === "🗑️ မှတ်တမ်းအားလုံးဖျက်ရန်") {
        user_db[chatId].winLossLogs = [];
        return bot.sendMessage(chatId, "✅ မှတ်တမ်းများ ဖျက်ပြီးပါပြီ။");
    }

    if (msg.text === "📈 နိုင်/ရှုံး (၅၀) မှတ်တမ်း") {
        const logs = user_db[chatId].winLossLogs;
        if (logs.length === 0) return bot.sendMessage(chatId, "မှတ်တမ်းမရှိသေးပါ။");
        const wins = logs.filter(l => l.status === "✅").length;
        bot.sendMessage(chatId, `🏆 နိုင်: ${wins} | ❌ ရှုံး: ${logs.length - wins}\n📊 Win Rate: ${((wins/logs.length)*100).toFixed(1)}%`);
        return;
    }

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            // Token format Bearer [TokenHeader][Token]
            user_db[chatId].token = "Bearer " + res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = msg.text.includes("၃၀") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu);
    }

    if (msg.text === "🛑 AI ကို ရပ်တန့်ရန်") {
        user_db[chatId].running = false;
        bot.sendMessage(chatId, "🛑 ရပ်တန့်လိုက်ပါပြီ။");
    }
});
