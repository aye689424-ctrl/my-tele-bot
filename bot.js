const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v81: Hybrid Manual & Sniper AI'); }).listen(process.env.PORT || 8080);

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
    return { side: finalSide, dragon, brainInfo: `B1:${b1.charAt(0)}|B2:${b2.charAt(0)}|B3:${b3.charAt(0)}` };
}

// --- 🚀 Hybrid Monitoring Loop ---
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

                // 1. Result Check
                if (data.last_pred) {
                    const isAiWin = data.last_pred === realSide;
                    data.aiLogs.unshift({ status: isAiWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });

                    if (!isAiWin) { data.continuousLoss++; } 
                    else { data.continuousLoss = 0; }

                    // Bet Status Update
                    data.betHistory.forEach(bet => {
                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
                            const isWin = bet.side === realSide;
                            bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                            bet.pnl = isWin ? +(bet.amount * 0.96).toFixed(2) : -bet.amount;
                            data.totalProfit += bet.pnl;

                            // Sniper Active ဖြစ်နေရင် နိုင်/ရှုံး အလိုက် Step ပြင်မယ်
                            if (data.isBettingActive) {
                                if (isWin) {
                                    data.winInSession++;
                                    data.currentStep = 0;
                                    if (data.winInSession >= data.betStopLimit) {
                                        data.isBettingActive = false;
                                        statusInfo = "🎯 Goal Reached! စောင့်ကြည့်စနစ်သို့ ပြန်သွားပါပြီ။";
                                    }
                                } else {
                                    data.currentStep++;
                                    if (data.currentStep >= data.betPlan.length) {
                                        data.isBettingActive = false;
                                        statusInfo = "⚠️ Plan ကုန်သွားပါပြီ! Safety Stop.";
                                    }
                                }
                            }
                        }
                    });
                }

                // 2. New Prediction & AI Snipe Trigger
                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                data.last_pred = ai.side;

                if (!data.isBettingActive && data.continuousLoss >= data.runLossLimit) {
                    data.isBettingActive = true;
                    data.currentStep = 0;
                    data.winInSession = 0;
                    statusInfo = `🚨 AI ${data.runLossLimit}-Loss detected! Auto Bet Start.`;
                }

                // 3. UI Display
                let modeMsg = data.isBettingActive 
                    ? `🔥 **AUTO BETTING: ON**\n💰 Next: **${data.betPlan[data.currentStep]}** MMK (Step ${data.currentStep+1})`
                    : `🔭 **SNIPING MODE**\n📉 AI Loss: **${data.continuousLoss}** / ${data.runLossLimit}`;

                const reportMsg = `🚀 **HYBRID AI REPORT**\n━━━━━━━━━━━━━━━━\n📊 AI Logic: \`${ai.brainInfo}\`\n🦸 Next Choice: **${ai.side.toUpperCase()}**\n🕒 Period: \`${data.nextIssue.slice(-5)}\`\n\n${modeMsg}\n💰 Total Profit: **${data.totalProfit.toFixed(2)}** MMK\n📢 ${statusInfo}`;

                await bot.sendMessage(chatId, reportMsg, {
                    reply_markup: { inline_keyboard: [
                        [{ text: "🔵 Manual Big", callback_data: "manual_Big" }, { text: "🔴 Manual Small", callback_data: "manual_Small" }],
                        [{ text: "⚙️ SETUP", callback_data: "open_settings" }]
                    ]}
                });

                // 4. Execute Auto Bet
                if (data.isBettingActive) {
                    const amount = data.betPlan[data.currentStep];
                    await callApi("GameBetting", { typeId: 30, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount/10), selectType: ai.side === "Big" ? 13 : 14, isAgree: true }, data.token);
                    data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side: ai.side, amount, status: "⏳ Pending", pnl: 0 });
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
    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, betPlan: [10, 30, 90, 270, 810, 2430, 7290], currentStep: 0, continuousLoss: 0, runLossLimit: 7, betStopLimit: 1, isBettingActive: false, winInSession: 0 };

    const data = user_db[chatId];

    // Manual Amount Input
    if (data.manualPendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const res = await callApi("GameBetting", { typeId: 30, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount/10), selectType: data.manualPendingSide === "Big" ? 13 : 14, isAgree: true }, data.token);
        if (res?.msgCode === 0) {
            bot.sendMessage(chatId, `✅ Manual Bet Success: ${data.manualPendingSide} (${amount} MMK)`);
            data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side: data.manualPendingSide, amount, status: "⏳ Pending", pnl: 0 });
        } else { bot.sendMessage(chatId, `❌ Error: ${res?.message}`); }
        data.manualPendingSide = null; return;
    }

    // Settings Input
    if (data.settingField) {
        if (data.settingField === 'plan') data.betPlan = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        else if (data.settingField === 'runloss') data.runLossLimit = parseInt(text);
        else if (data.settingField === 'stoplimit') data.betStopLimit = parseInt(text);
        bot.sendMessage(chatId, "✅ Setting Updated!");
        data.settingField = null; return;
    }

    const menu = { reply_markup: { keyboard: [["📊 Website", "📜 Bet History"], ["📈 AI Logs", "⚙️ SETUP"]], resize_keyboard: true } };

    if (text === '/start') {
        data.running = false;
        return bot.sendMessage(chatId, "🤖 **Hybrid Sniper Bot v81.0**\nဖုန်းနံပါတ်ပေးပါ:", menu);
    }

    if (text === "⚙️ SETUP") {
        return bot.sendMessage(chatId, `⚙️ **Settings**\nLoss Limit: ${data.runLossLimit}\nStop Limit: ${data.betStopLimit}\nPlan: ${data.betPlan.join(',')}`, {
            reply_markup: { inline_keyboard: [
                [{ text: "Run Loss Limit ပြင်ရန်", callback_data: "set_runloss" }],
                [{ text: "Bet Stop Limit ပြင်ရန်", callback_data: "set_stoplimit" }],
                [{ text: "Martingale Plan ပြင်ရန်", callback_data: "set_plan" }]
            ]}
        });
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **BET HISTORY**\n`;
        data.betHistory.slice(0, 15).forEach(h => txt += `${h.status} | ${h.issue} | ${h.side} | ${h.amount}\n`);
        return bot.sendMessage(chatId, txt || "No records.");
    }

    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text; return bot.sendMessage(chatId, "🔐 Password:");
    }
    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Hybrid Mode Active!", menu);
        } else { bot.sendMessage(chatId, "❌ Login Failed!"); data.tempPhone = null; }
    }
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    const data = user_db[chatId];
    if (q.data.startsWith("manual_")) {
        data.manualPendingSide = q.data.split('_')[1];
        bot.sendMessage(chatId, `💰 **Manual Bet (${data.manualPendingSide})**\nထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ-`);
    }
    if (q.data === "set_plan") { data.settingField = 'plan'; bot.sendMessage(chatId, "ဆတိုး Plan ပေးပါ:"); }
    if (q.data === "set_runloss") { data.settingField = 'runloss'; bot.sendMessage(chatId, "AI ဘယ်နှစ်ပွဲရှုံးမှ စထိုးမလဲ:"); }
    if (q.data === "set_stoplimit") { data.settingField = 'stoplimit'; bot.sendMessage(chatId, "ဘယ်နှစ်ပွဲနိုင်ရင် နားမလဲ:"); }
});
