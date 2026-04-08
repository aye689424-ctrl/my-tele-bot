const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v81: Sniper Pro Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Helpers ---
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

// --- 🧠 AI Multi-Brain Signal Logic ---
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
    return { side: finalSide, dragon, confidence: votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡", info: `B1:${b1[0]}|B2:${b2[0]}|B3:${b3[0]}` };
}

// --- 🎯 Betting Logic ---
async function placeAutoBet(chatId, side, amount) {
    const data = user_db[chatId];
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
    let baseUnit = amount < 10000 ? 10 : 100;
    const res = await callApi("GameBetting", { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: baseUnit, betCount: Math.floor(amount/baseUnit), selectType: side === "Big" ? 13 : 14, isAgree: true }, data.token);
    
    if (res?.msgCode === 0) {
        data.betHistory.unshift({ issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", isAuto: true });
        return true;
    }
    return false;
}

// --- 🚀 Monitoring Loop ---
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

                // ၁။ အရင်ပွဲစဉ် Result စစ်ဆေးခြင်း
                if (data.last_pred) {
                    const isAiWin = data.last_pred === realSide;
                    data.aiLogs.unshift({ status: isAiWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    
                    if (!isAiWin) data.consecutiveLosses++; else data.consecutiveLosses = 0;

                    // Bet History Update
                    data.betHistory.forEach(async (bet) => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            const won = bet.side === realSide;
                            bet.status = won ? "✅ WIN" : "❌ LOSS";
                            bet.pnl = won ? +(bet.amount * 0.96).toFixed(2) : -bet.amount;
                            roundProfit += bet.pnl;

                            if (data.autoBetActive) {
                                if (won) {
                                    data.autoBetActive = false; data.currentBetStep = 0;
                                    bot.sendMessage(chatId, "🎯 Auto Bet WIN! ပွဲရပ်ပြီး နောက်ထပ် ၇ ပွဲရှုံးဖို့ စောင့်ပါမယ်။");
                                } else {
                                    data.currentBetStep++;
                                    if (data.currentBetStep >= data.betPlan.length) data.autoBetActive = false;
                                }
                            }
                        }
                    });
                    data.totalProfit += roundProfit;
                    autoMsg = `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${data.last_pred === realSide ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔"} | ${realSide.toUpperCase()}\n💰 ပွဲစဉ်အမြတ် : **${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                }

                // ၂။ ပွဲသစ် Prediction
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                // ၇ ပွဲရှုံးရင် Auto Bet စဖွင့်မယ်
                if (!data.autoBetActive && data.consecutiveLosses >= 7) {
                    data.autoBetActive = true; data.currentBetStep = 0;
                    bot.sendMessage(chatId, "🚨 AI ၇ ပွဲဆက်တိုက်ရှုံးသဖြင့် Sniper စတင်ပါပြီ။");
                }

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                const nextMsg = `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${ai.info}\`\n🦸AI ခန့်မှန်း🕵️: **${ai.side.toUpperCase()}**\n📊 Confidence: \`${ai.confidence}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n🤖 Status: ${data.autoBetActive ? "ACTIVE ✅" : "WAITING ⏳"}\n📉 Loss Streak: ${data.consecutiveLosses}/7`;

                await bot.sendMessage(chatId, (autoMsg + nextMsg), {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });

                // ၃။ Auto Bet ထိုးခြင်း
                if (data.autoBetActive) {
                    const amt = data.betPlan[data.currentBetStep];
                    await placeAutoBet(chatId, ai.side, amt);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 📱 Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, betPlan: [10, 30, 90, 270, 810, 2430, 7290], currentBetStep: 0, consecutiveLosses: 0, autoBetActive: false };
    const data = user_db[chatId];

    if (text === '/start') {
        data.running = false;
        return bot.sendMessage(chatId, "🤖 **BigWin Sniper Bot**\nဖုန်းနံပါတ်ပေးပါ:");
    }

    // Login & Other logic... (အရင် Code အတိုင်း ထည့်သွင်းနိုင်ပါတယ်)
    if (/^\d{9,11}$/.test(text) && !data.token) { data.phone = text; return bot.sendMessage(chatId, "🔐 Password:"); }
    if (data.phone && !data.token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95"+data.phone.replace(/^0/,''), pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Sniper Active!");
        } else { bot.sendMessage(chatId, "❌ Login Failed!"); data.phone = null; }
    }
});
