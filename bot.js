const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
http.createServer((req, res) => { res.end('WinGo Pattern AI Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature (Based on AiScript.bot) ---
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

// --- 🧠 10 Brains Markov Decision Logic ---
function getAIVote(history) {
    const results = history.slice(0, 15).map(i => (parseInt(i.number) >= 5 ? "B" : "S"));
    const currentPattern = results.slice(0, 3).reverse().join("-"); // ဥပမာ B-S-B
    let votes = { B: 0, S: 0, reason: "" };

    // Brain 1-4: Markov Chain Pattern Strength
    if (currentPattern === "B-S-B") { votes.S += 4; votes.reason = "Markov Transition (B-S-B ➔ S)"; }
    else if (currentPattern === "S-B-S") { votes.B += 4; votes.reason = "Markov Transition (S-B-S ➔ B)"; }
    else if (currentPattern === "B-B-S") { votes.B += 3; votes.reason = "Double-Back Strategy (B-B-S ➔ B)"; }
    else if (currentPattern === "S-S-B") { votes.S += 3; votes.reason = "Double-Back Strategy (S-S-B ➔ S)"; }

    // Brain 5-7: Trend Analysis (Dragon vs Mirror)
    if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0]] += 3; // Dragon (Follow)
        votes.reason += " | Dragon Trend Follow";
    } else {
        votes[results[0] === "B" ? "S" : "B"] += 2; // Mirror (Opposite)
        votes.reason += " | Mirror/Chaos Logic";
    }

    // Brain 8-10: Volume & Probability
    const bCount = results.filter(x => x === "B").length;
    if (bCount > 8) { votes.S += 2; } else { votes.B += 2; }

    const final = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    
    return { final, confidence, currentPattern, reason: votes.reason };
}

// --- 🚀 AI Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // အရင်ပွဲ ခန့်မှန်းချက် မှန်/မမှန် စစ်ဆေးခြင်း
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === real;
                    const logMsg = `${currIssue.slice(-3)}: ${real} (${win ? "✅ Win" : "❌ Loss"})`;
                    data.historyLogs.unshift(logMsg);
                    if (data.historyLogs.length > 10) data.historyLogs.pop();
                }

                // AI ဦးနှောက် ၁၀ ခု၏ ဆုံးဖြတ်ချက်ကို ယူခြင်း
                const ai = getAIVote(history);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                
                data.last_pred = ai.final;
                data.last_issue = currIssue;

                const msg = `🧠 **AI Consensus Report**\n` +
                            `--------------------------\n` +
                            `📈 **Pattern:** \`${ai.currentPattern}\` detected\n` +
                            `🗳️ **Decision:** **${ai.final}**\n` +
                            `📊 **Confidence:** \`${ai.confidence}%\`\n` +
                            `💡 **Logic:** _${ai.reason}_\n` +
                            `🕒 **Issue:** ${nextIssue.slice(-5)}`;
                
                bot.sendMessage(chatId, msg);
            }
        }
        await new Promise(r => setTimeout(r, data.typeId === 30 ? 3000 : 8000));
    }
}

// --- 📱 Interface Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, historyLogs: [] };

    if (msg.text === '/start') {
        return bot.sendMessage(chatId, "🤖 **WinGo Pattern AI**\nဖုန်းနံပါတ် (09...) ပေးပါ:");
    }

    if (msg.text === "🚀 Start 30s" || msg.text === "🚀 Start 1min") {
        user_db[chatId].typeId = msg.text.includes("30s") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, `🚀 AI Monitoring (${user_db[chatId].typeId === 30 ? '30s' : '1m'}) စတင်ပါပြီ...`);
    }

    if (msg.text === "📊 View History") {
        const historyText = user_db[chatId].historyLogs.length > 0 ? user_db[chatId].historyLogs.join("\n") : "မှတ်တမ်းမရှိသေးပါ။";
        return bot.sendMessage(chatId, `📊 **Last 10 Results:**\n${historyText}`);
    }

    if (msg.text === "🛑 Stop") {
        user_db[chatId].running = false;
        return bot.sendMessage(chatId, "🛑 AI ရပ်တန့်လိုက်ပါပြီ။");
    }

    // Login logic (Standard)
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            const menu = { reply_markup: { keyboard: [["🚀 Start 30s", "🚀 Start 1min"], ["📊 View History", "🛑 Stop"]], resize_keyboard: true } };
            return bot.sendMessage(chatId, "✅ Login Success! Mode ရွေးချယ်ပါ။", menu);
        }
    }
});
