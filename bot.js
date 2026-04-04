const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render အတွက် Port ဖွင့်ထားခြင်း
http.createServer((req, res) => { res.end('WinGo Master v11.0 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Signature စနစ် ---
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

// --- 🧠 AI ဦးနှောက် ၁၀ ခု၏ မဟာဗျူဟာ ---
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

    const final = votes.B > votes.S ? "ကြီး (Big)" : "သေး (Small)";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { final, confidence, currentPattern, reason: votes.reason };
}

// --- 🚀 AI စောင့်ကြည့်ရေး စနစ် ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                if (data.last_pred) {
                    const real = parseInt(history[0].number) >= 5 ? "ကြီး (Big)" : "သေး (Small)";
                    data.winLossLogs.unshift({ status: data.last_pred === real ? "✅" : "❌", issue: currIssue.slice(-3) });
                    if (data.winLossLogs.length > 50) data.winLossLogs.pop();
                }

                const ai = getAIVote(history);
                const wins = data.winLossLogs.filter(l => l.status === "✅").length;
                const winRate = data.winLossLogs.length > 0 ? ((wins / data.winLossLogs.length) * 100).toFixed(0) : 0;

                let zoneStatus = "🔴 အန္တရာယ်ရှိ (Danger)";
                if (winRate >= 75) zoneStatus = "🟢 အန္တရာယ်ကင်း (Safe Zone)";
                else if (winRate >= 60) zoneStatus = "🟡 သတိထားပါ (Caution)";

                const nextIssue = (BigInt(currIssue) + 1n).toString();
                data.last_pred = ai.final;
                data.last_issue = currIssue;

                const msg = `🧠 **AI ဆုံးဖြတ်ချက် အစီရင်ခံစာ**\n` +
                            `--------------------------\n` +
                            `📈 **တွေ့ရှိသည့်ပုံစံ:** \`${ai.currentPattern}\` \n` +
                            `🗳️ **AI ခန့်မှန်းချက်:** **${ai.final}**\n` +
                            `📊 **ယုံကြည်မှု:** \`${ai.confidence}%\`\n` +
                            `🛡️ **အခြေအနေ:** **${zoneStatus} (${winRate}%)**\n` +
                            `🕒 **ပွဲစဉ်နံပါတ်:** ${nextIssue.slice(-5)}\n\n` +
                            `📜 **သတိပေးကဗျာ**\n` +
                            `_"နိုင်ခြေနှုန်းကို အရင်ကြည့်၊ ၇၀ အထက် ရှိမှချိ၊\n` +
                            `Pattern ပျက်လို့ ၃ ပွဲရှုံး၊ ခဏနားကာ အားကိုရုံး။"_`;
                
                bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Telegram UI ကိုင်တွယ်သူများ ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, winLossLogs: [] };

    const menu = { reply_markup: { 
        keyboard: [
            ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🚀 ၁ မိနစ် စတင်ရန်"], 
            ["📊 ဝက်ဘ်ဆိုဒ် ရလဒ်များ", "📈 နိုင်/ရှုံး (၅၀) မှတ်တမ်း"], 
            ["🗑️ မှတ်တမ်းအားလုံးဖျက်ရန်", "🛑 AI ကို ရပ်တန့်ရန်"]
        ], 
        resize_keyboard: true 
    } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Master AI မှ ကြိုဆိုပါတယ်**\nအသုံးပြုရန် ဖုန်းနံပါတ် (09...) ပို့ပေးပါ:");

    if (msg.text === "🗑️ မှတ်တမ်းအားလုံးဖျက်ရန်") {
        user_db[chatId].winLossLogs = [];
        return bot.sendMessage(chatId, "✅ နိုင်/ရှုံး မှတ်တမ်းအားလုံးကို ရှင်းလင်းလိုက်ပါပြီ။");
    }

    if (msg.text === "📈 နိုင်/ရှုံး (၅၀) မှတ်တမ်း") {
        const logs = user_db[chatId].winLossLogs;
        if (logs.length === 0) return bot.sendMessage(chatId, "မှတ်တမ်းမရှိသေးပါ။ AI ကို အရင်စတင်ပေးပါ။");
        const wins = logs.filter(l => l.status === "✅").length;
        const winRate = ((wins / logs.length) * 100).toFixed(1);
        let logMsg = `🏆 နိုင်: ${wins} ပွဲ | ❌ ရှုံး: ${logs.length - wins} ပွဲ\n📊 နိုင်ခြေနှုန်း: ${winRate}%\n\n`;
        logs.slice(0, 15).forEach(l => { logMsg += `${l.status} ပွဲစဉ်: ${l.issue}\n`; });
        return bot.sendMessage(chatId, logMsg);
    }

    if (msg.text === "📊 ဝက်ဘ်ဆိုဒ် ရလဒ်များ") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 12, language: 7, typeId: user_db[chatId].typeId || 1 }, user_db[chatId].token);
        if (res?.data?.list) {
            let txt = "📊 **ဝက်ဘ်ဆိုဒ်မှ နောက်ဆုံးရလဒ်များ**\n\n";
            res.data.list.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "ကြီး" : "သေး"})\n`; });
            bot.sendMessage(chatId, txt);
        }
    }

    // လော့ဂ်အင် (Login) လုပ်ဆောင်ချက်
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 စကားဝှက် (Password) ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            return bot.sendMessage(chatId, "✅ လော့ဂ်အင် အောင်မြင်သည်။ အသုံးပြုလိုသည့် ဂိမ်းကို ရွေးချယ်ပါ။", menu);
        } else {
            return bot.sendMessage(chatId, "❌ စကားဝှက် မှားယွင်းနေပါသည်။ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။");
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = msg.text.includes("၃၀") ? 30 : 1;
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။ အစီရင်ခံစာများကို စောင့်ကြည့်ပေးပါ။", menu);
    }

    if (msg.text === "🛑 AI ကို ရပ်တန့်ရန်") { 
        user_db[chatId].running = false; 
        bot.sendMessage(chatId, "🛑 AI လုပ်ဆောင်ချက်များကို ရပ်တန့်လိုက်ပါပြီ။"); 
    }
});
