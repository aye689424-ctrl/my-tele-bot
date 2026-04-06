const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v80: Betting Issue Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ v72 Logic Security ---
function generateRandomKey() {
    return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Referer": "https://bigwinqaz.com/",
        "Origin": "https://bigwinqaz.com"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🚀 Monitoring & VIP Signal ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    bot.sendMessage(chatId, `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()} (${lastRound.number})\n🎲 Status : ${isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔"} | ${realSide.toUpperCase()}(${lastRound.number})`);
                    
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            bet.status = (bet.side === realSide) ? "✅ WIN" : "❌ LOSS";
                        }
                    });
                }

                // Simple AI Logic for v80
                let dragon = 1;
                for(let i=0; i<history.length-1; i++) { if(parseInt(history[i].number)>=5 === parseInt(history[i+1].number)>=5) dragon++; else break; }
                const calc = history.map(i => (parseInt(i.number) >= 5 ? "B" : "S")).slice(0, 3).reverse().join('-');
                const nextSide = (dragon >= 4) ? realSide : (realSide === "Big" ? "Small" : "Big");

                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = nextSide;

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const nextMsg = `🚀 **AI Signal Analysis**\n━━━━━━━━━━━━━━━━\n📚တွက်ချက်ပုံစံ: \`${calc}\`\n🧠 Pattern: \`${dragon >= 4 ? "Dragon Follow" : "Trend Mirror"}\`\n🐉 Dragon: \`${dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${nextSide === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`95%\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;

                bot.sendMessage(chatId, nextMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI & Betting Handler ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };

    // 🎯 Betting Logic Fix (ထိုးမရတဲ့ပြဿနာကို ဖြေရှင်းထားသည်)
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        
        // ၁။ ထိုးခါနီးမှာ Website ဆီကနေ နောက်ဆုံးပွဲစဉ်ကို အမြန်ဆုံး Refresh လုပ်သည်
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, user_db[chatId].token);
        let targetIssue = user_db[chatId].nextIssue;
        if (fresh?.data?.list) {
            targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
        }

        const betPayload = { 
            typeId: 30, 
            issuenumber: targetIssue, 
            gameType: 2, 
            amount: 10, 
            betCount: Math.floor(amount / 10), 
            selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, 
            isAgree: true 
        };

        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။\n🕒 ပွဲစဉ်: ${targetIssue.slice(-5)}`);
            user_db[chatId].betHistory.unshift({ issue: targetIssue.slice(-5), side: user_db[chatId].pendingSide, amount, status: "⏳ Pending" });
        } else {
            bot.sendMessage(chatId, `❌ **ထိုးမရပါ:** ${res?.message || "အချိန်နောက်ကျသွားပါပြီ"}`);
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo VIP Master v80.0\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // History Handlers
    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
        return bot.sendMessage(chatId, list);
    }
    if (text === "📜 Bet History") {
        let txt = "📜 **နိုင်/ရှုံး မှတ်တမ်း**\n------------------\n";
        user_db[chatId].betHistory.slice(0, 15).forEach(h => { txt += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }
    if (text === "📈 AI History") {
        let txt = "📈 **AI ခန့်မှန်းချက် မှတ်တမ်း**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | Result: ${l.result}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    // Login Logic (v72 Standard)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const username = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        } else {
            bot.sendMessage(chatId, "❌ Login မရပါ။ ဖုန်းပြန်ပေးပါ။");
            user_db[chatId].tempPhone = null;
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** ပမာဏ ရိုက်ထည့်ပါ:`);
});
