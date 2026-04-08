const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v82: Ultimate Hybrid Sniper'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic ---
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
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 Multi-Brain AI Logic (The Core) ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];

    // Brain 1: Pattern Hunter
    let b1 = (resArr[0] === resArr[2]) ? (resArr[1] === "Big" ? "Small" : "Big") : (resArr[0] === "Big" ? "Small" : "Big");

    // Brain 2: Dragon Follower
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { if(resArr[i] === resArr[i+1]) dragon++; else break; }
    let b2 = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");

    // Brain 3: Probability Logic
    let bigs = resArr.slice(0, 10).filter(x => x === "Big").length;
    let b3 = bigs >= 6 ? "Small" : "Big";

    let votes = { Big: 0, Small: 0 };
    votes[b1]++; votes[b2]++; votes[b3]++;
    let finalSide = votes.Big > votes.Small ? "Big" : "Small";

    return { 
        side: finalSide, 
        dragon, 
        confidence: votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡",
        info: `B1:${b1[0]}|B2:${b2[0]}|B3:${b3[0]}`
    };
}

// --- 🚀 Sniper & Betting Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let statusInfo = "";

                if (data.last_pred) {
                    const isAiWin = data.last_pred === realSide;
                    data.aiLogs.unshift({ status: isAiWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });

                    if (!isAiWin) data.continuousLoss++; else data.continuousLoss = 0;

                    // Bet Processing (Manual + Auto)
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            const won = bet.side === realSide;
                            bet.status = won ? "✅ WIN" : "❌ LOSS";
                            bet.pnl = won ? +(bet.amount * 0.96).toFixed(2) : -bet.amount;
                            data.totalProfit += bet.pnl;

                            if (data.isBettingActive) {
                                if (won) {
                                    data.winCount++; data.currentStep = 0;
                                    if (data.winCount >= data.betStopLimit) {
                                        data.isBettingActive = false;
                                        statusInfo = "🎯 Target ပြည့်လို့ နားပါပြီ။";
                                    }
                                } else {
                                    data.currentStep++;
                                    if (data.currentStep >= data.betPlan.length) {
                                        data.isBettingActive = false; data.currentStep = 0;
                                        statusInfo = "⚠️ Plan ကုန်လို့ ဘေးကင်းအောင် ရပ်လိုက်ပါပြီ။";
                                    }
                                }
                            }
                        }
                    });
                }

                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                // Sniper Trigger
                if (!data.isBettingActive && data.continuousLoss >= data.runLossLimit) {
                    data.isBettingActive = true; data.currentStep = 0; data.winCount = 0;
                    statusInfo = `🚨 AI ${data.runLossLimit}-Loss streak! Auto Bet စတင်ပါပြီ။`;
                }

                let uiMode = data.isBettingActive 
                    ? `🔥 **STATUS: AUTO BETTING**\n💰 Step-${data.currentStep+1}: **${data.betPlan[data.currentStep]}** MMK`
                    : `🔭 **STATUS: SNIPER WAITING**\n📉 AI Loss Streak: **${data.continuousLoss}** / ${data.runLossLimit}`;

                const message = `🚀 **ULTIMATE VIP AI v82**\n━━━━━━━━━━━━━━\n🧠 Logic: \`${ai.info}\`\n🎯 AI Choice: **${ai.side.toUpperCase()}**\n📊 Confidence: ${ai.confidence}\n🕒 Period: \`${data.nextIssue.slice(-5)}\`\n\n${uiMode}\n💰 Profit: **${data.totalProfit.toFixed(2)}** MMK\n📢 ${statusInfo}`;

                await bot.sendMessage(chatId, message, {
                    reply_markup: { inline_keyboard: [
                        [{ text: "🔵 Manual Big", callback_data: "man_Big" }, { text: "🔴 Manual Small", callback_data: "man_Small" }],
                        [{ text: "⚙️ SETUP", callback_data: "setup" }]
                    ]}
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
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, betPlan: [10, 30, 90, 270, 810, 2430, 7290], currentStep: 0, continuousLoss: 0, runLossLimit: 7, betStopLimit: 1, isBettingActive: false, winCount: 0 };
    const data = user_db[chatId];

    if (data.inputMode === 'plan') {
        data.betPlan = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        bot.sendMessage(chatId, "✅ Plan Saved!"); data.inputMode = null; return;
    }
    if (data.inputMode === 'runloss') {
        data.runLossLimit = parseInt(text);
        bot.sendMessage(chatId, `✅ AI ${text} ပွဲရှုံးမှ စထိုးပါမည်။`); data.inputMode = null; return;
    }
    if (data.inputMode === 'manual_amt') {
        const amt = parseInt(text);
        const res = await callApi("GameBetting", { typeId: 30, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amt/10), selectType: data.manualSide === "Big" ? 13 : 14, isAgree: true }, data.token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ Manual Bet Success: ${data.manualSide} (${amt} MMK)`);
            data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side: data.manualSide, amount: amt, status: "⏳ Pending", pnl: 0 });
        } else { bot.sendMessage(chatId, "❌ Bet Error!"); }
        data.inputMode = null; return;
    }

    const mainButtons = { reply_markup: { keyboard: [["📊 Website", "📜 Bet History"], ["📈 AI Logs", "⚙️ SETUP"]], resize_keyboard: true } };

    if (text === '/start') {
        data.running = false;
        return bot.sendMessage(chatId, "🤖 **Ultimate Hybrid Sniper v82**\nဖုန်းနံပါတ်ပေးပါ:", mainButtons);
    }
    
    if (text === "⚙️ SETUP") {
        return bot.sendMessage(chatId, "⚙️ ပြင်ဆင်ရန် ရွေးချယ်ပါ-", {
            reply_markup: { inline_keyboard: [
                [{ text: "Run Loss Limit ပြင်ရန် (7?)", callback_data: "set_run" }],
                [{ text: "Martingale Plan ပြင်ရန်", callback_data: "set_plan" }]
            ]}
        });
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **HISTORY** (Total: ${data.totalProfit.toFixed(2)})\n`;
        data.betHistory.slice(0, 15).forEach(h => txt += `${h.status} | ${h.issue} | ${h.amount} MMK\n`);
        return bot.sendMessage(chatId, txt || "No records.");
    }

    if (text === "📈 AI Logs") {
        let txt = "📈 **AI History**\n";
        data.aiLogs.slice(0, 20).forEach(l => txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`);
        return bot.sendMessage(chatId, txt || "No records.");
    }

    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.phone = text; return bot.sendMessage(chatId, "🔐 Password:");
    }
    if (data.phone && !data.token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95"+data.phone.replace(/^0/,''), pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Sniper Active!", mainButtons);
        } else { bot.sendMessage(chatId, "❌ Login Error!"); data.phone = null; }
    }
});

bot.on('callback_query', (q) => {
    const data = user_db[q.message.chat.id];
    if (q.data.startsWith("man_")) {
        data.manualSide = q.data.split('_')[1];
        data.inputMode = 'manual_amt';
        bot.sendMessage(q.message.chat.id, `💰 Manual (${data.manualSide}) ထိုးမည့်ပမာဏ:`);
    }
    if (q.data === "setup") bot.sendMessage(q.message.chat.id, "SETUP Menu ကို Keyboard မှာ နှိပ်ပါဗျာ။");
    if (q.data === "set_run") { data.inputMode = 'runloss'; bot.sendMessage(q.message.chat.id, "AI ဘယ်နှစ်ပွဲရှုံးမှ စထိုးမလဲ (ဥပမာ: 7):"); }
    if (q.data === "set_plan") { data.inputMode = 'plan'; bot.sendMessage(q.message.chat.id, "ဆတိုး Plan ပေးပါ (10,30,90...):"); }
});
