const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
http.createServer((req, res) => { res.end('WinGo Myanmar AI Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature စနစ် (AiScript.bot အတိုင်း) ---
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

// --- 🧠 ဦးနှောက် ၁၀ ခု၏ Markov Chain တွက်ချက်မှု ---
function getAIVote(history) {
    const results = history.slice(0, 15).map(i => (parseInt(i.number) >= 5 ? "B" : "S"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, reason: "" };

    // ၁။ Markov Pattern အားသာမှု စစ်ဆေးခြင်း
    if (currentPattern === "B-S-B") { votes.S += 4; votes.reason = "မာကိုချိန်း ပုံစံအရ B-S-B ပြီးလျှင် S အားသာနေပါသည်။"; }
    else if (currentPattern === "S-B-S") { votes.B += 4; votes.reason = "မာကိုချိန်း ပုံစံအရ S-B-S ပြီးလျှင် B အားသာနေပါသည်။"; }
    else if (currentPattern === "B-B-S") { votes.B += 3; votes.reason = "Double-Back ပုံစံအရ B သို့ ပြန်လှည့်နိုင်ခြေ ရှိပါသည်။"; }
    else if (currentPattern === "S-S-B") { votes.S += 3; votes.reason = "Double-Back ပုံစံအရ S သို့ ပြန်လှည့်နိုင်ခြေ ရှိပါသည်။"; }
    else if (results[0] === results[1] && results[1] === results[2]) {
        votes[results[0]] += 3; votes.reason = "နဂါးတန်း (Dragon) ဖြစ်နေ၍ နောက်မှ လိုက်ထိုးရန် အားသာပါသည်။";
    } else {
        votes[results[0] === "B" ? "S" : "B"] += 2; votes.reason = "Mirror (ဆန့်ကျင်ဘက်) ထွက်ရန် အားသာနေပါသည်။";
    }

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
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === real;
                    data.historyLogs.unshift(`${currIssue.slice(-3)}: ${real} (${win ? "✅ နိုင်" : "❌ ရှုံး"})`);
                }

                const ai = getAIVote(history);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                data.last_pred = ai.final;
                data.last_issue = currIssue;

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 **တွေ့ရှိသည့် Pattern:** \`${ai.currentPattern}\` \n` +
                            `🗳️ **ဦးနှောက် ၁၀ ခု၏ မဲပေးမှု:** **${ai.final === "Big" ? "အကြီး (Big)" : "အသေး (Small)"}**\n` +
                            `📊 **ယုံကြည်မှု:** \`${ai.confidence}%\`\n` +
                            `💡 **အကြောင်းပြချက်:** _${ai.reason}_\n` +
                            `🕒 **ပွဲစဉ်:** ${nextIssue.slice(-5)}`;
                
                bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Interface Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, historyLogs: [] };

    if (msg.text === '/start') {
        return bot.sendMessage(chatId, "🤖 **WinGo Myanmar AI Predictor**\nလော့ဂ်အင် (Login) ဝင်ရန် ဖုန်းနံပါတ် ပို့ပေးပါ (09...):");
    }

    if (msg.text === "🚀 Start 30s" || msg.text === "🚀 Start 1min") {
        user_db[chatId].typeId = msg.text.includes("30s") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, `🚀 AI Monitoring (${msg.text.split(" ")[1]}) စတင်ပါပြီ...`);
    }

    if (msg.text === "📊 Website Results") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, language: 7, typeId: user_db[chatId].typeId || 1 }, user_db[chatId].token);
        if (res && res.data?.list) {
            let txt = "📊 **နောက်ဆုံးထွက်ထားသော Result များ (Website ပြသမှုအတိုင်း)**\n\n";
            res.data.list.forEach(i => {
                const bs = parseInt(i.number) >= 5 ? "Big" : "Small";
                txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${bs})\n`;
            });
            bot.sendMessage(chatId, txt);
        }
    }

    if (msg.text === "🛑 Stop") {
        user_db[chatId].running = false;
        return bot.sendMessage(chatId, "🛑 AI ကို ရပ်တန့်လိုက်ပါပြီ။");
    }

    // Login logic
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 စကားဝှက် (Password) ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            const menu = { reply_markup: { keyboard: [["🚀 Start 30s", "🚀 Start 1min"], ["📊 Website Results", "🛑 Stop"]], resize_keyboard: true } };
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါသည်။ Mode ကို ရွေးချယ်ပါ။", menu);
        } else {
            return bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။");
        }
    }
});
