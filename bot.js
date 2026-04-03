const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const dns = require('dns');
const fs = require('fs');

// Force IPv4
dns.setDefaultResultOrder('ipv4first');

// Keep Alive
http.createServer((req, res) => { res.end('WinGo Real Engine v8.5 Active'); }).listen(process.env.PORT || 8080);

const token = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

const botOptions = { polling: { interval: 300, autoStart: true, params: { timeout: 10 } } };
const bot = new TelegramBot(token, botOptions);

let user_db = {};

// Load saved data
if (fs.existsSync('user_data.json')) {
    user_db = JSON.parse(fs.readFileSync('user_data.json'));
}

function saveData() {
    fs.writeFileSync('user_data.json', JSON.stringify(user_db, null, 2));
}

// Custom Agent
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000,
    lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { family: 4 }, (err, address) => {
            if (err) console.error('DNS error:', err.message);
            callback(null, address, 4);
        });
    }
});

// --- Signature System ---
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp; delete temp.random;
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 30000, httpsAgent: agent });
        return res.data;
    } catch (e) { console.error(`API Error:`, e.code); return null; }
}

// --- Bet Amount Calculator ---
function calculateBetAmount(data) {
    const strategy = data.strategy || "MARTINGALE";
    const step = data.step || 0;
    const martingaleBets = [10, 30, 90, 270, 810, 2430, 7290];
    const fibBets = [10, 10, 20, 30, 50, 80, 130, 210, 340, 550];
    
    switch(strategy) {
        case "MARTINGALE": return martingaleBets[step] || martingaleBets[martingaleBets.length-1];
        case "FIBONACCI": return fibBets[step] || fibBets[fibBets.length-1];
        case "DALEMBERT": return 10 + (data.consecutiveLoss || 0) * 5;
        default: return 10;
    }
}

// --- Main Menu Keyboard ---
function getMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                ["🚀 Start 30s", "🚀 Start 1min"],
                ["📊 Stats", "💰 Balance"],
                ["⚙️ Settings", "📜 History"],
                ["📅 Daily Report", "🛑 Stop"],
                ["❓ Help"]
            ],
            resize_keyboard: true
        }
    };
}

// --- Settings Inline Menu ---
function getSettingsMenu(chatId) {
    const data = user_db[chatId] || {};
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🎲 Strategy: ${data.strategy || "MARTINGALE"}`, callback_data: "change_strategy" }],
                [{ text: `🔄 Mode: ${data.strategyType || "OPPOSITE"}`, callback_data: "change_mode" }],
                [{ text: `🔔 Notify: ${data.notify?.win ? "ON" : "OFF"}`, callback_data: "toggle_notify" }],
                [{ text: `⏰ Schedule: ${data.schedule ? `${data.schedule.start}-${data.schedule.end}h` : "OFF"}`, callback_data: "set_schedule" }],
                [{ text: `🛑 Stop Loss: ${data.stopLoss || 5000}`, callback_data: "set_stoploss" }],
                [{ text: `🎯 Target: ${data.targetProfit || 3000}`, callback_data: "set_target" }],
                [{ text: `💸 Max Bet: ${data.maxBet || 50000}`, callback_data: "set_maxbet" }],
                [{ text: `📊 Export Data`, callback_data: "export_data" }]
            ]
        }
    };
}

// --- Auto-Bet Logic ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        
        // Check schedule
        if (data.schedule) {
            const hour = new Date().getHours();
            if (hour < data.schedule.start || hour >= data.schedule.end) {
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }
        }
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;
            const currNumber = history[0].number;

            if (currIssue !== data.last_issue) {
                // Check previous bet
                if (data.last_pred && data.last_issue) {
                    const lastResult = history.find(h => h.issueNumber === data.last_issue);
                    if (lastResult && lastResult.number && lastResult.number !== "null") {
                        const realRes = parseInt(lastResult.number) >= 5 ? "Big" : "Small";
                        const win = data.last_pred === realRes;
                        
                        if (win) {
                            data.step = 0;
                            data.consecutiveLoss = 0;
                            await bot.sendMessage(chatId, `✅ **WIN!** ${data.last_amount} MMK`);
                        } else {
                            data.step = (data.step || 0) + 1;
                            data.consecutiveLoss = (data.consecutiveLoss || 0) + 1;
                            await bot.sendMessage(chatId, `❌ **LOSS!** ${data.last_amount} MMK`);
                        }
                        
                        // Update profit
                        if (!data.stats) data.stats = { profit: 0 };
                        data.stats.profit += win ? data.last_amount * 0.97 : -data.last_amount;
                        saveData();
                    }
                }

                // Place new bet
                if (currNumber && currNumber !== "null") {
                    const lastResult = parseInt(currNumber) >= 5 ? "Big" : "Small";
                    const mode = data.strategyType || "OPPOSITE";
                    let decision;
                    if (mode === "FOLLOW") decision = lastResult;
                    else if (mode === "OPPOSITE") decision = lastResult === "Big" ? "Small" : "Big";
                    else decision = Math.random() > 0.5 ? "Big" : "Small";
                    
                    const nextIssue = (BigInt(currIssue) + 1n).toString();
                    const amount = calculateBetAmount(data);
                    
                    // Check limits
                    if ((data.stats?.profit || 0) <= -(data.stopLoss || 5000)) {
                        await bot.sendMessage(chatId, `🛑 Stop loss reached! Profit: ${data.stats.profit} MMK`);
                        data.running = false;
                        break;
                    }
                    if ((data.stats?.profit || 0) >= (data.targetProfit || 3000)) {
                        await bot.sendMessage(chatId, `🎉 Target reached! Profit: ${data.stats.profit} MMK`);
                        data.running = false;
                        break;
                    }

                    const betPayload = {
                        "typeId": data.typeId,
                        "issuenumber": nextIssue,
                        "amount": amount,
                        "betCount": 7,
                        "gameType": 2,
                        "selectType": (decision === "Big" ? 13 : 14),
                        "language": 7
                    };

                    const betRes = await callApi("GameBetting", betPayload, data.token);
                    data.last_pred = decision;
                    data.last_issue = currIssue;
                    data.last_amount = amount;

                    if (betRes?.msgCode === 0) {
                        await bot.sendMessage(chatId, `🎯 **Bet Placed**\n📊 ${nextIssue.slice(-5)}\n🎲 ${decision}\n💰 ${amount} MMK`);
                    } else {
                        await bot.sendMessage(chatId, `⚠️ **Bet Failed:** ${betRes?.msg || "Error"}`);
                    }
                }
            }
        }
        await new Promise(r => setTimeout(r, data.typeId === 30 ? 3500 : 8000));
    }
}

// --- 📱 Telegram Handlers (Buttons Only - No Commands) ---

// Handle /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        "🤖 **WinGo Pro Bot v8.5**\n\n" +
        "ဖုန်းနံပါတ်ပို့ပေးပါ (09...):", 
        { reply_markup: { remove_keyboard: true } }
    );
});

// Handle button clicks (text-based)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text.startsWith('/')) return;
    if (!user_db[chatId]) user_db[chatId] = {};
    
    // ========== BUTTON HANDLERS ==========
    
    // 🚀 Start 30s Button
    if (text === "🚀 Start 30s") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first!");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot already running!");
        
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        user_db[chatId].last_issue = "";
        user_db[chatId].last_pred = null;
        
        bot.sendMessage(chatId, 
            `🚀 **30s Bot Started!**\n🎲 Strategy: ${user_db[chatId].strategy || "MARTINGALE"}\n🎯 Mode: ${user_db[chatId].strategyType || "OPPOSITE"}`,
            getMainMenu()
        );
        monitoringLoop(chatId);
    }
    
    // 🚀 Start 1min Button
    else if (text === "🚀 Start 1min") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first!");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot already running!");
        
        user_db[chatId].typeId = 1;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        
        bot.sendMessage(chatId, "🚀 **1min Bot Started!**", getMainMenu());
        monitoringLoop(chatId);
    }
    
    // 📊 Stats Button
    else if (text === "📊 Stats") {
        const stats = user_db[chatId]?.stats || { profit: 0, totalBets: 0 };
        const winRate = stats.totalBets > 0 ? ((stats.wins || 0) / stats.totalBets * 100).toFixed(1) : 0;
        
        bot.sendMessage(chatId,
            `📊 **YOUR STATISTICS**\n\n` +
            `🎲 Total Bets: ${stats.totalBets || 0}\n` +
            `💰 Profit: ${(stats.profit || 0).toFixed(0)} MMK\n` +
            `🔥 Streak: ${user_db[chatId]?.consecutiveLoss || 0} loss(es)`
        );
    }
    
    // 💰 Balance Button
    else if (text === "💰 Balance") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first!");
        
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            bot.sendMessage(chatId, `💰 **Balance:** ${info.data.amount} MMK`);
        } else {
            bot.sendMessage(chatId, "❌ Failed to get balance");
        }
    }
    
    // ⚙️ Settings Button
    else if (text === "⚙️ Settings") {
        bot.sendMessage(chatId, "⚙️ **Settings Menu**\nClick buttons below to change:", getSettingsMenu(chatId));
    }
    
    // 📜 History Button
    else if (text === "📜 History") {
        const history = user_db[chatId]?.stats?.history || [];
        if (history.length === 0) {
            return bot.sendMessage(chatId, "📜 No bet history yet.");
        }
        let historyText = "📜 **Last 10 Bets**\n\n";
        for (let i = 0; i < Math.min(10, history.length); i++) {
            const h = history[i];
            const emoji = h.win ? '✅' : '❌';
            historyText += `${emoji} ${h.amount} MMK | Profit: ${h.profit?.toFixed(0) || 0}\n`;
        }
        bot.sendMessage(chatId, historyText);
    }
    
    // 📅 Daily Report Button
    else if (text === "📅 Daily Report") {
        const stats = user_db[chatId]?.stats || { profit: 0 };
        bot.sendMessage(chatId,
            `📅 **DAILY REPORT**\n\n` +
            `📅 Date: ${new Date().toLocaleDateString()}\n` +
            `💰 Profit: ${(stats.profit || 0).toFixed(0)} MMK`
        );
    }
    
    // 🛑 Stop Button
    else if (text === "🛑 Stop") {
        if (user_db[chatId]) {
            user_db[chatId].running = false;
            bot.sendMessage(chatId, `🛑 **Bot Stopped**\nProfit: ${(user_db[chatId].stats?.profit || 0).toFixed(0)} MMK`, getMainMenu());
        }
    }
    
    // ❓ Help Button
    else if (text === "❓ Help") {
        bot.sendMessage(chatId,
            `🤖 **WinGo Pro Bot - HELP**\n\n` +
            `📌 **Buttons Guide**\n` +
            `• 🚀 Start 30s - Start 30s betting\n` +
            `• 🚀 Start 1min - Start 1min betting\n` +
            `• 📊 Stats - View your profit\n` +
            `• 💰 Balance - Check wallet\n` +
            `• ⚙️ Settings - Change strategy\n` +
            `• 📜 History - Last bets\n` +
            `• 📅 Daily Report - Today's summary\n` +
            `• 🛑 Stop - Stop bot\n\n` +
            `📌 **Login First:**\n` +
            `1️⃣ Send phone number (09xxxxxxxxx)\n` +
            `2️⃣ Send password`
        );
    }
    
    // ========== LOGIN HANDLER ==========
    else if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Send your password:");
    }
    else if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { 
            phonetype: -1, language: 7, logintype: "mobile", 
            username: phone, pwd: text 
        });
        
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            delete user_db[chatId].tempPhone;
            saveData();
            bot.sendMessage(chatId, "✅ **Login Success!**", getMainMenu());
            
            const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
            if (info?.msgCode === 0) {
                bot.sendMessage(chatId, `💰 Balance: ${info.data.amount} MMK`);
            }
        } else {
            delete user_db[chatId].tempPhone;
            bot.sendMessage(chatId, "❌ **Login Failed!**\n/start to try again");
        }
    }
});

// ========== INLINE BUTTON HANDLERS (Settings) ==========
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    
    if (data === "change_strategy") {
        const strategies = ["MARTINGALE", "FIBONACCI", "DALEMBERT", "FLAT"];
        const current = user_db[chatId]?.strategy || "MARTINGALE";
        const next = strategies[(strategies.indexOf(current) + 1) % strategies.length];
        if (!user_db[chatId]) user_db[chatId] = {};
        user_db[chatId].strategy = next;
        await bot.answerCallbackQuery(q.id, { text: `✅ Strategy: ${next}` });
    }
    else if (data === "change_mode") {
        const modes = ["OPPOSITE", "FOLLOW", "RANDOM"];
        const current = user_db[chatId]?.strategyType || "OPPOSITE";
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        user_db[chatId].strategyType = next;
        await bot.answerCallbackQuery(q.id, { text: `✅ Mode: ${next}` });
    }
    else if (data === "toggle_notify") {
        if (!user_db[chatId]) user_db[chatId] = {};
        if (!user_db[chatId].notify) user_db[chatId].notify = { win: true, loss: true };
        user_db[chatId].notify.win = !user_db[chatId].notify.win;
        await bot.answerCallbackQuery(q.id, { text: `Notify WIN: ${user_db[chatId].notify.win ? "ON" : "OFF"}` });
    }
    else if (data === "set_schedule") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /schedule 8 22" });
        bot.sendMessage(chatId, "📝 Type: `/schedule 8 22` (8am to 10pm)");
    }
    else if (data === "set_stoploss") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /loss 5000" });
        bot.sendMessage(chatId, "📝 Type: `/loss 5000`");
    }
    else if (data === "set_target") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /target 3000" });
        bot.sendMessage(chatId, "📝 Type: `/target 3000`");
    }
    else if (data === "set_maxbet") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /maxbet 50000" });
        bot.sendMessage(chatId, "📝 Type: `/maxbet 50000`");
    }
    else if (data === "export_data") {
        const stats = user_db[chatId]?.stats;
        if (!stats) return bot.answerCallbackQuery(q.id, { text: "No data to export" });
        const csv = "Time,Win,Amount,Profit\n" + (stats.history || []).map(h => 
            `${new Date(h.time).toISOString()},${h.win},${h.amount},${h.profit}`
        ).join("\n");
        await bot.sendDocument(chatId, Buffer.from(csv), { filename: `bet_history_${chatId}.csv` });
        await bot.answerCallbackQuery(q.id, { text: "✅ Exported!" });
    }
    
    saveData();
    // Refresh settings menu
    await bot.editMessageText("⚙️ **Settings Menu**\nClick buttons below to change:", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: getSettingsMenu(chatId).reply_markup,
        parse_mode: 'Markdown'
    }).catch(() => {});
});

// Schedule command (optional - still need / for numbers)
bot.onText(/\/schedule (\d+) (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    if (start >= 0 && start <= 23 && end >= 0 && end <= 23 && start < end) {
        if (!user_db[chatId]) user_db[chatId] = {};
        user_db[chatId].schedule = { start, end };
        bot.sendMessage(chatId, `✅ Schedule: ${start}:00 to ${end}:00`);
        saveData();
    }
});

bot.onText(/\/loss (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    user_db[chatId].stopLoss = parseInt(match[1]);
    bot.sendMessage(chatId, `✅ Stop loss: ${match[1]} MMK`);
    saveData();
});

bot.onText(/\/target (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    user_db[chatId].targetProfit = parseInt(match[1]);
    bot.sendMessage(chatId, `✅ Target: ${match[1]} MMK`);
    saveData();
});

bot.onText(/\/maxbet (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    user_db[chatId].maxBet = parseInt(match[1]);
    bot.sendMessage(chatId, `✅ Max bet: ${match[1]} MMK`);
    saveData();
});

console.log('🤖 WinGo Pro Bot v8.5 Started with BUTTONS!');
