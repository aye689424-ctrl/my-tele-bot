const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo Sniper v82: BigWin UI'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ API Helper ---
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, c => (Math.random()*16|0).toString(16)), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 Multi-Brain AI Logic ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];
    
    let b1 = (resArr[0] === resArr[2]) ? (resArr[1] === "Big" ? "Small" : "Big") : (resArr[0] === "Big" ? "Small" : "Big");
    
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i] === resArr[i+1]) dragon++; else break; }
    let b2 = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");
    
    let bigs = resArr.slice(0, 10).filter(x => x === "Big").length;
    let b3 = bigs >= 6 ? "Small" : "Big";

    let votes = { Big: 0, Small: 0 };
    votes[b1]++; votes[b2]++; votes[b3]++;
    let finalSide = votes.Big > votes.Small ? "Big" : "Small";

    return { 
        side: finalSide, 
        dragon: dragon, 
        pattern: dragon >= 3 ? "Dragon Mode 🐉" : "Brain Voting 🧠",
        confidence: votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡",
        info: `B1:${b1[0]}|B2:${b2[0]}|B3:${b3[0]}`
    };
}

// --- 🚀 Monitoring Loop (BigWin UI Style) ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let autoMsg = "";
                let roundProfit = 0;

                // ၁။ အရင်ပွဲစဉ်အတွက် Result Report
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    
                    if (!isWin) data.continuousLoss++; else data.continuousLoss = 0;

                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            const isWon = bet.side === realSide;
                            bet.status = isWon ? "✅ WIN" : "❌ LOSS";
                            bet.pnl = isWon ? +(bet.amount * 0.96).toFixed(2) : -bet.amount;
                            roundProfit += bet.pnl;

                            if (data.isBettingActive) {
                                if (isWon) { data.isBettingActive = false; data.currentStep = 0; }
                                else { data.currentStep++; if (data.currentStep >= data.betPlan.length) data.isBettingActive = false; }
                            }
                        }
                    });
                    data.totalProfit += roundProfit;

                    autoMsg = `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${realSide.toUpperCase()}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${roundProfit >= 0 ? "+" : ""}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    autoMsg += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => { autoMsg += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
                    autoMsg += `\n`;
                }

                // ၂။ ပွဲသစ်အတွက် Prediction
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                if (!data.isBettingActive && data.continuousLoss >= data.runLossLimit) {
                    data.isBettingActive = true; data.currentStep = 0;
                }

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const nextMsg = `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${ai.info}\`\n🛡 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`${ai.confidence}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;

                await bot.sendMessage(chatId, (autoMsg + nextMsg), {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big (ကြီး)", callback_data: "bet_Big" }, { text: "🔴 Small (သေး)", callback_data: "bet_Small" }]] }
                });

                if (data.isBettingActive) {
                    const amt = data.betPlan[data.currentStep];
                    await callApi("GameBetting", { typeId: 30, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amt/10), selectType: ai.side === "Big" ? 13 : 14, isAgree: true }, data.token);
                    data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side: ai.side, amount: amt, status: "⏳ Pending", pnl: 0 });
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Interaction Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, betPlan: [10, 30, 90, 270, 810, 2430, 7290], currentStep: 0, continuousLoss: 0, runLossLimit: 7, isBettingActive: false };
    const data = user_db[chatId];

    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
        let baseUnit = amount < 10000 ? 10 : 100;
        const res = await callApi("GameBetting", { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: baseUnit, betCount: Math.floor(amount/baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true }, data.token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ **${data.pendingSide}** မှာ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0 });
        } else { bot.sendMessage(chatId, `❌ Error: ${res?.message}`); }
        data.pendingSide = null; return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website", "📜 Bet History"], ["📈 AI History", "⚙️ SETUP"]], resize_keyboard: true } };

    if (text === '/start') {
        data.running = false;
        return bot.sendMessage(chatId, "🤖 **BigWin Sniper v82**\nဖုန်းနံပါတ်ပေးပါ:", menu);
    }

    if (text === "📊 Website") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token);
        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'Big':'Small'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **HISTORY** (Total: ${data.totalProfit.toFixed(2)})\n`;
        data.betHistory.slice(0, 15).forEach(h => txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount}\n`);
        return bot.sendMessage(chatId, txt || "No records.");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI History**\n";
        data.aiLogs.slice(0, 50).forEach(l => txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`);
        return bot.sendMessage(chatId, txt || "No records.");
    }

    // Login logic
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.phone = text; return bot.sendMessage(chatId, "🔐 Password:");
    }
    if (data.phone && !data.token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95"+data.phone.replace(/^0/,''), pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Sniper Active! ၇ ပွဲရှုံးတာနဲ့ စထိုးပေးပါမယ်။", menu);
        } else { bot.sendMessage(chatId, "❌ Login Failed!"); data.phone = null; }
    }
});

bot.on('callback_query', (q) => {
    const data = user_db[q.message.chat.id];
    if (q.data.startsWith("bet_")) {
        data.pendingSide = q.data.split('_')[1];
        bot.sendMessage(q.message.chat.id, `💰 **${data.pendingSide}** အတွက် ပမာဏရိုက်ထည့်ပါ:`);
    }
});
