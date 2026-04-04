const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း
http.createServer((req, res) => { res.end('WinGo Pattern AI v9.0 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ AiScript Signature Logic ---
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

// --- 🧠 AI Brains & Markov Chain Strategy (No removal) ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "B" : "S"));
    const currentPattern = results.slice(0, 3).reverse().join("-"); // နောက်ဆုံး ၃ ခု (ဥပမာ B-S-B)
    let votes = { B: 0, S: 0, reason: "" };

    // ၁။ Pattern Matching (BSB, SBS, BBS, SSB)
    if (currentPattern === "B-S-B") { votes.S += 4; votes.reason = "မာကိုချိန်းအရ B-S-B တွေ့ရှိ၍ S အားသာနေပါသည်။"; }
    else if (currentPattern === "S-B-S") { votes.B += 4; votes.reason = "မာကိုချိန်းအရ S-B-S တွေ့ရှိ၍ B အားသာနေပါသည်။"; }
    else if (currentPattern === "B-B-S") { votes.B += 3; votes.reason = "Double-Back စနစ်အရ B ဘက်သို့ ပြန်လှည့်ရန် အားသာပါသည်။"; }
    else if (currentPattern === "S-S-B") { votes.S += 3; votes.reason = "Double-Back စနစ်အရ S ဘက်သို့ ပြန်လှည့်ရန် အားသာပါသည်။"; }
    
    // ၂။ Trend/Dragon Check (ရှေ့ကောင်းလား/နောက်ကောင်းလား)
    else if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0]] += 3; votes.reason = "နဂါးတန်း (Dragon) ဖြစ်နေ၍ အလားအလာရှိသောဘက်ကို ဦးစားပေးပါသည်။";
    } else {
        votes[results[0] === "B" ? "S" : "B"] += 2; votes.reason = "ဆန့်ကျင်ဘက် (Mirror/Chaos) ထွက်ရန် အားသာနေပါသည်။";
    }

    const final = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern, reason: votes.reason };
}

// --- 🚀 AI Monitoring & Win/Loss Tracking ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // နိုင်/ရှုံး ၅၀ မှတ်တမ်းတင်ခြင်း (အရင်ဟာ မဖျက်ပါ)
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const isWin = data.last_pred === real;
                    data.winLossLogs.unshift({
                        issue: currIssue.slice(-3),
                        pred: data.last_pred,
                        result: real,
                        status: isWin ? "✅" : "❌"
                    });
                    if (data.winLossLogs.length > 50) data.winLossLogs.pop();
                }

                const ai = getAIVote(history);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                data.last_pred = ai.final;
                data.last_issue = currIssue;

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 **Pattern:** \`${ai.currentPattern}\` \n` +
                            `🗳️ **ခန့်မှန်းချက်:** **${ai.final}**\n` +
                            `📊 **ယုံကြည်မှု:** \`${ai.confidence}%\`\n` +
                            `💡 **အကြောင်းပြချက်:** _${ai.reason}_\n` +
                            `🕒 **ပွဲစဉ်:** ${nextIssue.slice(-5)}`;
                bot.sendMessage(chatId, msg);
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI Interface ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    const menu = { reply_markup: { keyboard: [["🚀 Start 30s", "🚀 Start 1min"], ["📊 Website Results", "📈 နိုင်/ရှုံး (၅၀) ပွဲ"], ["🛑 Stop AI"]], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Master AI**\nဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    if (msg.text === "📈 နိုင်/ရှုံး (၅၀) ပွဲ") {
        const logs = user_db[chatId].winLossLogs;
        if (logs.length === 0) return bot.sendMessage(chatId, "မှတ်တမ်းမရှိသေးပါ။ AI ကို အရင် Run ပါ။");
        const wins = logs.filter(l => l.status === "✅").length;
        let logText = `📈 **နောက်ဆုံး (၅၀) ပွဲ မှတ်တမ်း**\n🏆 နိုင်: ${wins} | ❌ ရှုံး: ${logs.length-wins}\n📊 Win Rate: \`${((wins/logs.length)*100).toFixed(1)}%\`\n\n`;
        logs.slice(0, 15).forEach(l => { logText += `${l.status} ပွဲ: ${l.issue} (AI:${l.pred[0]} | Real:${l.result[0]})\n`; });
        return bot.sendMessage(chatId, logText);
    }

    if (msg.text === "📊 Website Results") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 12, language: 7, typeId: user_db[chatId].typeId || 1 }, user_db[chatId].token);
        if (res?.data?.list) {
            let txt = "📊 **Website အတိုင်း ရလဒ်များ**\n\n";
            res.data.list.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "B" : "S"})\n`; });
            bot.sendMessage(chatId, txt);
        }
    }

    // Login & Controls
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }
    if (msg.text?.includes("Start")) {
        user_db[chatId].typeId = msg.text.includes("30s") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ Pattern များကို စောင့်ကြည့်နေပါသည်။", menu);
    }
    if (msg.text === "🛑 Stop AI") { user_db[chatId].running = false; bot.sendMessage(chatId, "AI ရပ်လိုက်ပါပြီ။"); }
});
