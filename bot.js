const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v71: VIP Signal Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic (v34 Verified) ---
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

// --- 🧠 AI Smart Brain (Markov + CK Formula) ---
function runSmartAI(history, aiLogs) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }

    let mChain = { Big: { B: 0, S: 0 }, Small: { B: 0, S: 0 } };
    for (let i = 0; i < resArr.length - 1; i++) {
        mChain[resArr[i+1]][resArr[i] === "Big" ? "B" : "S"]++;
    }
    const markovNext = mChain[last]["B"] > mChain[last]["S"] ? "Big" : "Small";
    let formulaNext = (last === "Big") ? (dragon <= 3 ? "Small" : "Big") : (dragon <= 3 ? "Big" : "Small");
    
    let finalSide = (dragon >= 4) ? formulaNext : markovNext;
    return { side: finalSide, dragon, conf: 85 + (formulaNext === markovNext ? 10 : 0) };
}

// --- 🚀 Auto Monitoring & VIP Signal ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // 💥 VIP Win/Loss Signal (ပွဲပြီးလျှင် စာပို့ခြင်း)
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    const signalMsg = `💥 **BIGWIN VIP SIGNAL** 💥\n` +
                                    `━━━━━━━━━━━━━━━━\n` +
                                    `🗓 Period : ${lastRound.issueNumber}\n` +
                                    `🎰 Pick   : 🗳️ ${data.last_pred.toUpperCase()} (${lastRound.number})\n` +
                                    `💰 Bet    : ${data.currentMultiplier}x\n` +
                                    `━━━━━━━━━━━━━━━━\n` +
                                    `🎲 Status : ${statusEmoji} | ${realSide.toUpperCase()}(${lastRound.number})`;
                    
                    bot.sendMessage(chatId, signalMsg);

                    // History Update
                    data.aiPredictionLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), pred: data.last_pred, result: realSide });
                    
                    // Betting History Settlement (နိုင်ရှုံး အမှန်အမှား စစ်ခြင်း)
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            bet.status = (bet.side === realSide) ? "✅ Win" : "❌ Loss";
                        }
                    });

                    if (!isWin) data.currentMultiplier *= 3; else data.currentMultiplier = 1;
                }

                // AI Intelligence Next Round
                const ai = runSmartAI(history, data.aiPredictionLogs);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                const nextMsg = `🚀 **Next Signal Ready**\n` +
                                `ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n` +
                                `ခန့်မှန်း: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}**\n` +
                                `ယုံကြည်မှု: \`${ai.conf}%\``;

                bot.sendMessage(chatId, nextMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
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
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };

    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        let baseUnit = 10;
        const betPayload = { typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, amount: baseUnit, betCount: Math.floor(amount / baseUnit), selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side: user_db[chatId].pendingSide, amount, status: "⏳ Pending" });
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Result (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 WinGo VIP Master v71\nဖုန်းနံပါတ် ပေးပါ:", menu);

    if (text === "📜 Bet History") {
        let txt = "📜 **Betting Settlement History**\n------------------\n";
        user_db[chatId].betHistory.slice(0, 10).forEach(h => {
            txt += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`;
        });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI VIP Prediction Logs**\n------------------\n";
        user_db[chatId].aiPredictionLogs.slice(0, 10).forEach(l => {
            txt += `${l.status} ပွဲ: ${l.issue} | ခန့်မှန်း: ${l.pred} | ထွက်: ${l.result}\n`;
        });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📊 Result (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **Website Results**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    // Login (v34 Logic)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ VIP Signal စတင်ပါပြီ။", menu);
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
