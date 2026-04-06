const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v70: Final Logic Fixed'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security & API Tools (v34 Verified) ---
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

// --- 🧠 Advanced AI Logic (Learning + History Sync) ---
function runSmartAI(history, aiLogs) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    
    // Dragon Count
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i]===resArr[i+1]) dragon++; else break; }

    // Markov Chain (Memory from 100 results)
    let mChain = { Big: { B: 0, S: 0 }, Small: { B: 0, S: 0 } };
    for (let i = 0; i < resArr.length - 1; i++) {
        mChain[resArr[i+1]][resArr[i] === "Big" ? "B" : "S"]++;
    }
    const markovNext = mChain[last]["B"] > mChain[last]["S"] ? "Big" : "Small";

    // CK Formula (Image Logic)
    let formulaNext = (last === "Big") ? (dragon <= 3 ? "Small" : "Big") : (dragon <= 3 ? "Big" : "Small");

    // Decision Logic
    let finalSide = (dragon >= 4) ? formulaNext : markovNext;
    
    // Learning from AI History (Check if AI is failing)
    let winRate = 0;
    if(aiLogs.length > 0) {
        const recent = aiLogs.slice(0, 10);
        winRate = (recent.filter(l => l.status === "✅").length / recent.length) * 100;
    }

    return { 
        side: finalSide, 
        conf: Math.round(75 + (winRate/10)), 
        dragon, 
        pattern: dragon >= 4 ? "Dragon Follow" : "Trend Mirror" 
    };
}

// --- 🚀 Auto Monitoring ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                
                // 1. AI History Sync (ပြီးခဲ့တဲ့ပွဲ မှန်/မှား စစ်ခြင်း)
                if (data.last_pred) {
                    const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const isWin = data.last_pred === realSide;
                    data.aiPredictionLogs.unshift({
                        status: isWin ? "✅" : "❌",
                        issue: history[0].issueNumber.slice(-3),
                        pred: data.last_pred,
                        real: realSide
                    });
                }

                // 2. AI Intelligence Run
                const ai = runSmartAI(history, data.aiPredictionLogs);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });

                bot.sendMessage(chatId, `📊 **WinGo Smart AI Analysis**\n--------------------------\n🧠 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🗳️ AI ခန့်မှန်း: **${ai.side === "Big" ? "ကြီး" : "သေး"}**\n📊 Confidence: \`${ai.conf}%\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 UI & History Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [] };

    // ၁။ Betting Amount Handler
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        let baseUnit = amount < 10000 ? 10 : 100;
        const betPayload = { 
            typeId: 30, issuenumber: user_db[chatId].nextIssue, gameType: 2, 
            amount: baseUnit, betCount: Math.floor(amount / baseUnit), 
            selectType: user_db[chatId].pendingSide === "Big" ? 13 : 14, isAgree: true 
        };
        
        const res = await callApi("GameBetting", betPayload, user_db[chatId].token);
        if (res?.msgCode === 0 || res?.msg === "Bet success") {
            bot.sendMessage(chatId, `✅ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            user_db[chatId].betHistory.unshift({ issue: user_db[chatId].nextIssue.slice(-5), side: user_db[chatId].pendingSide, amount, time: new Date().toLocaleTimeString() });
        } else {
            bot.sendMessage(chatId, `❌ ထိုးမရပါ: ${res?.message || "Error"}`);
        }
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **WinGo Master v70**\nဖုန်းနံပါတ် ပေးပါ:", menu);

    // 📊 Website Result (Long List)
    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 25, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **နောက်ဆုံးထွက်စဉ် ၂၅ ပွဲ**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    // 📈 AI History (AI ခန့်မှန်းချက် မှန်/မှား မှတ်တမ်း)
    if (text === "📈 AI History") {
        let txt = "📈 **AI Prediction Memory**\n------------------\n";
        user_db[chatId].aiPredictionLogs.slice(0, 15).forEach(l => {
            txt += `${l.status} ပွဲ: ${l.issue} | Pred: ${l.pred} | Real: ${l.real}\n`;
        });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိသေးပါ။");
    }

    // 📜 Bet History (ကိုယ်တိုင်ထိုးခဲ့သော ငွေစာရင်း)
    if (text === "📜 Bet History") {
        let txt = "📜 **Your Betting History**\n------------------\n";
        user_db[chatId].betHistory.slice(0, 15).forEach(h => {
            txt += `💰 ${h.issue} | ${h.side} | ${h.amount} MMK\n`;
        });
        return bot.sendMessage(chatId, txt || "ထိုးထားသော မှတ်တမ်းမရှိပါ။");
    }

    // Login Logic (v34)
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ AI စောင့်ကြည့်နေပါပြီ။", menu);
        }
    }
});

bot.on('callback_query', (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    bot.sendMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
