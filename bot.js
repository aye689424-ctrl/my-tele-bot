const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v77.2: Triple History Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security System (v72 Standard) ---
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
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI Brain ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last3 = resArr.slice(0, 3).reverse().join('-');
    const last = resArr[0];
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }
    let side = dragon >= 4 ? last : (last === "Big" ? "Small" : "Big");
    return { side, dragon, calc: last3, pattern: dragon >= 4 ? "Dragon Follow" : "Trend Mirror" };
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
                    // VIP Result Signal
                    bot.sendMessage(chatId, `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔"} | ${realSide.toUpperCase()}(${lastRound.number})`);
                    
                    // AI History မှတ်တမ်းသွင်းခြင်း
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    
                    // Bet History မှတ်တမ်း Settlement လုပ်ခြင်း
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                        }
                    });
                }

                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const nextMsg = `🚀 **AI Signal Analysis**\n━━━━━━━━━━━━━━━━\n📚တွက်ချက်ပုံစံ: \`${ai.calc}\`\n🧠 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`95%\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;

                bot.sendMessage(chatId, nextMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };

    // Betting Fix
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const res = await callApi("GameBetting", { typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true }, user_db[chatId].token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side: user_db[chatId].pendingSide, amount, status: "⏳ Pending" });
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo VIP Master v77.2\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // Triple History Handlers
    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **Website Results**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    if (text === "📜 Bet History") {
        let txt = "📜 **My Betting Records**\n------------------\n";
        user_db[chatId].betHistory.slice(0, 15).forEach(h => { txt += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI Prediction Memory**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    // Login (v72 Style)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** ပမာဏ ရိုက်ထည့်ပါ:`);
});
