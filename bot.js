const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v69: Full AI Integration'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic (လူကြီးမင်း၏ မူရင်း Code အတိုင်း) ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    return hash.padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI Smart Brain (Markov Chain + CK Formula) ---
function getAIIntelligence(history) {
    const results = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = results[0];
    
    // 1. Dragon Count (နဂါးတန်းစစ်ခြင်း)
    let dragonCount = 1;
    for(let i=0; i<results.length-1; i++) {
        if(results[i] === results[i+1]) dragonCount++; else break;
    }

    // 2. Markov Chain (ဖြစ်တန်စွမ်းတွက်ချက်ခြင်း)
    let chain = { Big: { B: 0, S: 0 }, Small: { B: 0, S: 0 } };
    for (let i = 0; i < results.length - 1; i++) {
        chain[results[i+1]][results[i] === "Big" ? "B" : "S"]++;
    }
    const markovNext = chain[last]["B"] > chain[last]["S"] ? "Big" : "Small";

    // 3. CK Formula Logic (ပုံထဲကအတိုင်း: 1-3 Mirror, 4+ Dragon)
    let formulaPred = (last === "Big") ? (dragonCount <= 3 ? "Small" : "Big") : (dragonCount <= 3 ? "Big" : "Small");

    // Final Decision
    const finalSide = (dragonCount >= 4) ? formulaPred : markovNext;
    const confidence = 80 + (formulaPred === markovNext ? 15 : 0);

    return { side: finalSide, dragonCount, confidence, pattern: dragonCount >= 4 ? "Dragon Train" : "Mirror/Markov" };
}

// --- 🎰 Betting Handler (လူကြီးမင်း၏ မူရင်း Code အတိုင်း) ---
async function handleBetting(chatId, side, totalAmount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် ရှာမတွေ့သေးပါ။");

    let baseUnit = totalAmount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(totalAmount)) - 2);
    if (baseUnit < 10) baseUnit = 10;

    const betPayload = {
        typeId: 30, issuenumber: data.nextIssue, language: 0, gameType: 2,
        amount: Math.floor(baseUnit), betCount: Math.floor(totalAmount / baseUnit),
        selectType: side === "Big" ? 13 : 14, isAgree: true
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    if (res && (res.msgCode === 0 || res.msg === "Bet success")) {
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${totalAmount}** MMK အောင်မြင်စွာ ထိုးပြီးပါပြီ။`);
        user_db[chatId].betHistory.unshift({ issue: data.nextIssue.slice(-5), side, amount: totalAmount, status: "Success" });
    } else {
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${res ? res.message : "Network Error"}\``);
    }
}

// --- 🚀 Monitoring Loop (AI Report ပါဝင်သော စနစ်) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== user_db[chatId].last_issue) {
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const ai = getAIIntelligence(history);
                
                user_db[chatId].last_issue = history[0].issueNumber;
                user_db[chatId].nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                user_db[chatId].last_pred = ai.side;

                const report = `📊 **WinGo Smart AI Analysis**\n` +
                               `--------------------------\n` +
                               `🧠 **Mode:** \`${ai.pattern}\`\n` +
                               `🐉 **Dragon:** \`${ai.dragonCount}\` ပွဲဆက်\n` +
                               `🗳️ AI ခန့်မှန်း: **${ai.side === "Big" ? "အကြီး (Big)" : "အသေး (Small)"}**\n` +
                               `📊 Confidence: \`${ai.confidence}%\`\n` +
                               `🕒 ပွဲစဉ်: \`${user_db[chatId].nextIssue.slice(-5)}\`\n` +
                               `🇲🇲 Time: \`${mmTime}\``;

                bot.sendMessage(chatId, report, {
                    reply_markup: { 
                        inline_keyboard: [[
                            { text: "🔵 Big (အကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (အသေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Message Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, betHistory: [], aiPredictionLogs: [] };

    // ၁။ ကြေးရိုက်ထည့်ခြင်းကို ဦးစားပေးစစ်ဆေးခြင်း
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(text));
        user_db[chatId].pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Result (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === '/start') {
        user_db[chatId] = { running: false, token: null, betHistory: [] };
        return bot.sendMessage(chatId, "🤖 **WinGo Master v69 (AI Edition)**\nဖုန်းနံပါတ် ပို့ပေးပါ:");
    }

    // Website Results (Long List)
    if (text === "📊 Result (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        if (res?.data?.list) {
            let listTxt = "📊 **Website Results (Last 20)**\n----------------------\n";
            res.data.list.forEach(i => { listTxt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
            bot.sendMessage(chatId, listTxt);
        }
        return;
    }

    // Login Logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res && res.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, `✅ Login အောင်မြင်သည်။ AI စနစ် စတင်ပါပြီ။`, menu);
        } else {
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။");
            user_db[chatId].tempPhone = null;
        }
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ (ဂဏန်းသီးသန့်) ရိုက်ထည့်ပါ:`);
});
