const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Server Keep-Alive
http.createServer((req, res) => { res.end('WinGo v57: Ultimate Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security & API Sign System ---
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
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = {
        ...data,
        language: 7,
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now() / 1000)
    };
    payload.signature = signMd5(payload);
    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || ""
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 AI 10-Brains Logic ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, brainDetails: [], warning: "" };

    // Anti-Dragon Logic
    let dragonCount = 1;
    for (let i = 0; i < results.length - 1; i++) {
        if (results[i] === results[i+1]) dragonCount++;
        else break;
    }

    // Brain 1-3: Pattern Expert
    if (currentPattern === "Big-Small-Big") { votes.S += 4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)"); }
    else if (currentPattern === "Small-Big-Small") { votes.B += 4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Trend Analysis Mode"); }

    // Brain 4-6: Dragon Hunter
    if (dragonCount >= 4) {
        const side = results[0] === "Big" ? "B" : "S";
        votes[side] += 5;
        votes.warning = `⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။ သတိထားပါ။`;
        votes.brainDetails.push(`🧠 B4-6: Dragon Trend (${results[0]})`);
    } else { votes.brainDetails.push("🧠 B4-6: Stable Trend"); }

    // Brain 7-10: Statistical Mirror
    const mirrorSide = results[0] === "Big" ? "Small" : "Big";
    votes[mirrorSide === "Big" ? "B" : "S"] += 2;
    votes.brainDetails.push(`🧠 B7-10: Mirror Logic (${mirrorSide})`);

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, brainSummary: votes.brainDetails.join("\n"), warning: votes.warning };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const res = await callApi("GetNoaverageEmerdList", { pageNo:1, pageSize:50, typeId:30 }, user_db[chatId].token);
        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            const currentIssue = lastRound.issueNumber;

            if (currentIssue !== user_db[chatId].last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // Update history
                if (!user_db[chatId].aiPredictionLogs) user_db[chatId].aiPredictionLogs = [];
                if (!user_db[chatId].betHistory) user_db[chatId].betHistory = [];
                const ai = getAIVote(res.data.list);

                // Save AI prediction
                if (user_db[chatId].last_pred) {
                    user_db[chatId].aiPredictionLogs.unshift({
                        issue: currentIssue.slice(-5),
                        pred: user_db[chatId].last_pred,
                        status: user_db[chatId].last_pred === realSide ? "✅" : "❌"
                    });
                }

                // Update betting history Win/Loss
                user_db[chatId].betHistory.forEach(bet => {
                    if (bet.issue === currentIssue.slice(-5) && bet.status === "⏳ Pending") {
                        const isWin = bet.side === realSide;
                        bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                        if (!isWin) user_db[chatId].currentMultiplier *= 3; else user_db[chatId].currentMultiplier = 1;
                        bot.sendMessage(chatId, `📜 **ပွဲစဉ်:** ${bet.issue} | ရလဒ်: ${bet.status} | 🎲 ထွက်ဂဏန်း: ${lastRound.number} (${realSide === "Big" ? "ကြီး" : "သေး"})\n🔄 အဆင့်: ${user_db[chatId].currentMultiplier}X`);
                    }
                });

                user_db[chatId].last_issue = currentIssue;
                user_db[chatId].nextIssue = currentIssue; // real-time use

                user_db[chatId].last_pred = ai.finalSide;

                // Send AI prediction
                const reportMsg = `📊 **AI Prediction**\n----------------\n${ai.brainSummary}\nPattern: ${ai.currentPattern}\nPrediction: ${ai.finalSide === "Big" ? "ကြီး" : "သေး"}\nConfidence: ${ai.confidence}%\nNext Issue: ${currentIssue.slice(-5)}\nMultiplier: ${user_db[chatId].currentMultiplier}X\n${ai.warning ? "\n" + ai.warning : ""}`;
                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                        { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                    ]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 30000));
    }
}

// --- 🎰 Betting Handler ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    if (!data.nextIssue) return bot.sendMessage(chatId, "❌ ပွဲစဉ်နံပါတ် မရသေးပါ။");

    const betPayload = {
        typeId: 30,
        issuenumber: data.nextIssue,
        gameType: 2,
        amount: 10,
        betCount: Math.floor(amount / 10),
        selectType: side === "Big" ? 13 : 14,
        isAgree: true
    };

    const res = await callApi("GameBetting", betPayload, data.token);
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const time = new Date().toLocaleTimeString();
        bot.sendMessage(chatId, `💰 **${side}** အတွက် ${amount} MMK ထိုးပြီးပါပြီ။`);
        data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side, amount, status: "⏳ Pending", time, mult: data.currentMultiplier });
    } else {
        bot.sendMessage(chatId, `❌ ထိုးမရပါ။\nအကြောင်းရင်း: \`${res ? res.message : "Network Error"}\``);
    }
}

// --- 📱 Telegram Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, currentMultiplier: 1 };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v57\nဖုန်းနံပါတ် ပေးပါ:");

    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", {
            phonetype: -1,
            logintype: "mobile",
            username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''),
            pwd: msg.text
        });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါသည်။ AI ခန့်မှန်းမှု စောင့်ကြည့်နေပါသည်။");
        } else {
            bot.sendMessage(chatId, "❌ Login မအောင်မြင်ပါ။");
            user_db[chatId].tempPhone = null;
        }
    }

    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) {
        await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
