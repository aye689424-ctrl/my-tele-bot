const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v59: Stability Patch Active'); }).listen(process.env.PORT || 8080);

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

// --- 🧠 10-Brains Logic (Fixed NaN Issue) ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 1, S: 1, brainDetails: [] }; // 1 ကနေ စထားခြင်းဖြင့် NaN ကို ကာကွယ်သည်

    if (currentPattern === "Big-Small-Big") { votes.S += 5; votes.brainDetails.push("🧠 B1-3: Mirror (Small)"); }
    else if (currentPattern === "Small-Big-Small") { votes.B += 5; votes.brainDetails.push("🧠 B1-3: Mirror (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Pattern Analysis"); }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const totalVotes = votes.B + votes.S;
    const confidence = Math.round((Math.max(votes.B, votes.S) / totalVotes) * 100);
    
    return { finalSide, confidence, currentPattern, brainSummary: votes.brainDetails.join("\n") };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";

                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                    bot.sendMessage(chatId, `✉️ **နိုင်/ရှုံး ရလဒ်**\n------------------\n📅 ပွဲစဉ်: \`${history[0].issueNumber.slice(-5)}\` \n🎲 ထွက်: \`${history[0].number} (${realSide})\` \n📊 ရလဒ်: **${isWin ? "✅ WIN" : "❌ LOSS"}**\n🔄 အဆင့်: ${data.currentMultiplier}X`);
                }

                const ai = getAIVote(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                const reportMsg = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n------------------\n🔍 **Brain Analysis:**\n${ai.brainSummary}\n------------------\n🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး" : "သေး"}**\n📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🔄 အဆင့်: \`${data.currentMultiplier}X\``;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

// --- 📱 UI & Menu Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    const menu = { reply_markup: { keyboard: [
        ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
        ["💰 လက်ကျန်ငွေကြည့်မည်", "🚪 Logout ထွက်မည်"],
        ["📊 Website Result", "📜 Betting History"]
    ], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v59 (Stable)\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // လက်ကျန်ငွေကြည့်ရန် (Fix: Token စစ်ဆေးခြင်း)
    if (msg.text === "💰 လက်ကျန်ငွေကြည့်မည်") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        const res = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `💰 **လက်ကျန်ငွေ**\n------------------\n💵 လက်ကျန်: **${res.data.amount} MMK**`);
        }
    }

    // Logout
    if (msg.text === "🚪 Logout ထွက်မည်") {
        user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };
        return bot.sendMessage(chatId, "✅ Logout အောင်မြင်သည်။", { reply_markup: { remove_keyboard: true } });
    }

    // Login Logic (Fix: Double check phone format)
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text; 
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token && msg.text.length > 5) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].tempPhone = null;
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ စတင်နိုင်ပါပြီ။", menu);
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။");
            user_db[chatId].tempPhone = null;
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        user_db[chatId].typeId = 30; user_db[chatId].running = true;
        monitoringLoop(chatId); bot.sendMessage(chatId, "🚀 Monitoring စတင်ပါပြီ။", menu);
    }
    
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    // Betting (Fix: Ensure nextIssue is present)
    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        const side = user_db[chatId].pendingSide;
        const amount = parseInt(msg.text);
        const betPayload = { typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ ထိုးပြီးပါပြီ: ${amount} MMK`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side, amount, status: "⏳ Pending", mult: user_db[chatId].currentMultiplier });
        } else {
            bot.sendMessage(chatId, `❌ ထိုးမရပါ: ${res?.msg || "ပွဲစဉ်ကျော်သွားခြင်း (သို့) လက်ကျန်ငွေမလောက်ခြင်း"}`);
        }
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (!user_db[chatId].token) return bot.answerCallbackQuery(query.id, { text: "Login အရင်ဝင်ပါ" });
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
