const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v77: VIP Signal Pro Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security & API Helper ---
async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: crypto.randomUUID().replace(/-/g, ''), timestamp: Math.floor(Date.now() / 1000) };
    const { signature, ...rest } = payload;
    const sortedStr = JSON.stringify(Object.keys(rest).sort().reduce((obj, key) => { obj[key] = rest[key]; return obj; }, {})).replace(/\s+/g, '');
    payload.signature = crypto.createHash('md5').update(sortedStr).digest('hex').toUpperCase();

    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI Brain (v77 Logic Update) ---
function runAIIntelligence(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last3 = resArr.slice(0, 3).reverse().join('-'); // တွက်ချက်ပုံစံပြရန်
    const last = resArr[0];
    
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }

    // Logic: Dragon >= 4 ဆိုရင် Follow၊ မဟုတ်ရင် Mirror
    let pattern = dragon >= 4 ? "Dragon Follow" : "Trend Mirror";
    let side = dragon >= 4 ? last : (last === "Big" ? "Small" : "Big");
    let confidence = 85 + (dragon >= 5 ? 10 : 0);

    return { side, dragon, pattern, calc: last3, conf: confidence };
}

// --- 🚀 Auto Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // 💥 VIP Result Report
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    bot.sendMessage(chatId, `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔"} | ${realSide.toUpperCase()}(${lastRound.number})`);
                    if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                }

                // AI Prediction Next Round (လူကြီးမင်း လိုချင်တဲ့ ပုံစံသစ်)
                const ai = runAIIntelligence(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });

                const nextMsg = `🚀 **AI Signal Analysis**\n━━━━━━━━━━━━━━━━\n📚တွက်ချက်ပုံစံ: \`${ai.calc}\`\n🧠 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`${ai.conf}%\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;

                bot.sendMessage(chatId, nextMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, currentMultiplier: 1 };

    // Betting Fix
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, user_db[chatId].token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : user_db[chatId].nextIssue;

        const res = await callApi("GameBetting", { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true }, user_db[chatId].token);
        if (res?.msgCode === 0) bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။`);
        else bot.sendMessage(chatId, `❌ **Error:** ${res?.message || "ထိုးမရပါ"}`);
        user_db[chatId].pendingSide = null;
        return;
    }

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo VIP Master v77\nဖုန်းနံပါတ် ပေးပါ (ဥပမာ- 09xxx):");

    // Login Fix (v77 Login System)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        // ဖုန်းနံပါတ်ကို Website လက်ခံတဲ့ format (959...) သို့ ပြောင်းလဲခြင်း
        const formattedPhone = "95" + user_db[chatId].tempPhone.replace(/^0/, '').replace(/^95/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: formattedPhone, pwd: text });
        
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ VIP Signal စတင်ပါပြီ။");
        } else {
            bot.sendMessage(chatId, `❌ **Login မရပါ**\nအကြောင်းရင်း: ${res?.message || "အကောင့်စစ်ဆေးပါ"}`);
            user_db[chatId].tempPhone = null;
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** ပမာဏ ရိုက်ထည့်ပါ:`);
});
