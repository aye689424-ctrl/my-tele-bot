const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require('crypto');
const http = require('http');

// ====== CONFIG ======
const TG_TOKEN = "8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0";
const OPENAI_KEY = "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";
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const BASE_THROTTLE_MS = 1000;
const MAX_RETRIES = 5;

// Server for alive
http.createServer((req, res) => { res.end('WinGo v82: AI OpenAI Active'); }).listen(process.env.PORT || 8080);

const bot = new TelegramBot(TG_TOKEN, { polling: true });
let user_db = {};

// --- 🛡️ BigWin API Security Logic ---
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

async function callBigWinApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
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

// --- 🧠 OpenAI Prediction Logic ---
async function askOpenAI(history) {
    const prompt = `You are a WinGo (Big/Small) game analyst. Here are the last 100 results (Big=5-9, Small=0-4):
    ${history.map(i => `${i.issueNumber.slice(-3)}:${parseInt(i.number) >= 5 ? 'Big' : 'Small'}`).join(', ')}
    
    Analyze patterns like Dragon, Mirror (1-1), 2-2, and trends. 
    Predict the NEXT outcome. 
    Reply ONLY in this format (Burmese):
    📚တွက်ချက်မှု: [Short Pattern Analysis]
    🧠 Pattern: [Pattern Name]
    🦸AI ခန့်မှန်းချက်: [BIG or SMALL]
    📊 Confidence: [Percentage]%`;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: "You are a professional betting analyst." }, { role: "user", content: prompt }],
            temperature: 0.7
        }, { headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" } });
        return res.data.choices[0].message.content;
    } catch (e) { return "AI တွက်ချက်မှု အမှားအယွင်းရှိနေပါသည်။"; }
}

// --- 📤 Telegram Message Queue System ---
const outQueue = [];
let processing = false;
let currentThrottle = BASE_THROTTLE_MS;

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function enqueueMessage(chatId, text, options = {}) {
    outQueue.push({ chatId, text, options, tries: 0 });
    processQueue().catch(err => console.error("Queue Error:", err));
}

async function processQueue() {
    if (processing) return;
    processing = true;
    while (outQueue.length > 0) {
        const item = outQueue.shift();
        try {
            await sendWithRetry(item);
            await sleep(currentThrottle);
            currentThrottle = Math.max(BASE_THROTTLE_MS, currentThrottle * 0.95);
        } catch (err) { await sleep(BASE_THROTTLE_MS); }
    }
    processing = false;
}

async function sendWithRetry(item) {
    const { chatId, text, options } = item;
    let tries = item.tries || 0;
    while (tries <= MAX_RETRIES) {
        try {
            await bot.sendMessage(chatId, text, options);
            return;
        } catch (err) {
            tries++;
            const retryAfter = err?.response?.body?.parameters?.retry_after;
            if (retryAfter) {
                const waitMs = Number(retryAfter) * 1000 + 500;
                currentThrottle = Math.max(currentThrottle, waitMs);
                await sleep(waitMs);
            } else { await sleep(1000 * tries); }
            if (tries > MAX_RETRIES) throw err;
        }
    }
}

// --- 🚀 Monitoring Loop (OpenAI Integrated) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 100, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // VIP Result Report
                if (data.last_pred) {
                    const isWin = data.last_pred.toUpperCase().includes(realSide.toUpperCase());
                    const report = `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred_side} (${lastRound.number})\n🎲 Status : ${isWin ? "နိုင်ပြီ🏆" : "ရှုံးပြီ💔"}`;
                    enqueueMessage(chatId, report);
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                }

                // Call OpenAI for next prediction
                const aiResponse = await askOpenAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred_side = aiResponse.includes("BIG") ? "Big" : "Small";

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const signalMsg = `🚀 **OpenAI VIP Analysis**\n━━━━━━━━━━━━━━━━\n${aiResponse}\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\` (${mmTime})`;

                enqueueMessage(chatId, signalMsg, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await sleep(4000);
    }
}

// --- 📱 Interaction Handlers ---
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };

    // Betting Flow (v81/v34 style)
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const data = user_db[chatId];
        
        // Anti-402: Refresh issue number right before betting
        const fresh = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;

        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
        const betRes = await callBigWinApi("GameBetting", { 
            typeId: 30, issuenumber: targetIssue, gameType: 2, amount: Math.floor(baseUnit), 
            betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true 
        }, data.token);

        if (betRes?.msgCode === 0) {
            enqueueMessage(chatId, `✅ **${data.pendingSide}** မှာ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending" });
        } else {
            enqueueMessage(chatId, `❌ ထိုးမရပါ: ${betRes?.message || "Error"}`);
        }
        data.pendingSide = null;
        return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };

    if (text === "/start") {
        user_db[chatId] = { running: false, aiLogs: [], betHistory: [], token: null };
        return enqueueMessage(chatId, "🤖 **WinGo Master v82 (OpenAI Edition)**\nဖုန်းနံပါတ် ပေးပါ:", menu);
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; return enqueueMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callBigWinApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true; monitoringLoop(chatId);
            enqueueMessage(chatId, "✅ OpenAI စနစ် ချိတ်ဆက်ပြီးပါပြီ။", menu);
        } else {
            enqueueMessage(chatId, "❌ Login မရပါ။ ဖုန်းပြန်ပေးပါ။");
            user_db[chatId].tempPhone = null;
        }
    }

    // History Buttons
    if (text === "📊 Website (100)") {
        const res = await callBigWinApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
        enqueueMessage(chatId, list);
    }
    if (text === "📜 Bet History") {
        let txt = "📜 **နိုင်/ရှုံး မှတ်တမ်း**\n------------------\n";
        user_db[chatId].betHistory.slice(0, 15).forEach(h => { txt += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`; });
        enqueueMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }
    if (text === "📈 AI History") {
        let txt = "📈 **OpenAI ခန့်မှန်းချက် မှတ်တမ်း**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
        enqueueMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }
});

bot.on("callback_query", (query) => {
    user_db[query.message.chat.id].pendingSide = query.data.split('_')[1];
    enqueueMessage(query.message.chat.id, `💰 **${user_db[query.message.chat.id].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
