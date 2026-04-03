const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const dns = require('dns');
const fs = require('fs');

dns.setDefaultResultOrder('ipv4first');

http.createServer((req, res) => { res.end('WinGo Real Engine v8.5 Active'); }).listen(process.env.PORT || 8080);

const token = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

const botOptions = { polling: { interval: 300, autoStart: true, params: { timeout: 10 } } };
const bot = new TelegramBot(token, botOptions);

let user_db = {};

if (fs.existsSync('user_data.json')) {
    user_db = JSON.parse(fs.readFileSync('user_data.json'));
}

function saveData() {
    fs.writeFileSync('user_data.json', JSON.stringify(user_db, null, 2));
}

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000,
    lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { family: 4 }, (err, address) => {
            callback(null, address, 4);
        });
    }
});

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
        console.log(`${endpoint}:`, res.data?.msgCode, res.data?.msg);
        return res.data;
    } catch (e) { 
        console.error(`API Error:`, e.code); 
        return null; 
    }
}

function calculateBetAmount(data) {
    const strategy = data.strategy || "MARTINGALE";
    const step = data.step || 0;
    const martingaleBets = [10, 30, 90, 270, 810, 2430, 7290];
    
    switch(strategy) {
        case "MARTINGALE": return martingaleBets[step] || martingaleBets[martingaleBets.length-1];
        default: return 10;
    }
}

function getMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                ["🚀 Start 30s", "🚀 Start 1min"],
                ["📊 Stats", "💰 Balance"],
                ["⚙️ Settings", "📜 History"],
                ["🛑 Stop", "❓ Help"]
            ],
            resize_keyboard: true
        }
    };
}

function getSettingsMenu(chatId) {
    const data = user_db[chatId] || {};
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🎲 Strategy: ${data.strategy || "MARTINGALE"}`, callback_data: "change_strategy" }],
                [{ text: `🔄 Mode: ${data.strategyType || "OPPOSITE"}`, callback_data: "change_mode" }],
                [{ text: `🛑 Stop Loss: ${data.stopLoss || 5000}`, callback_data: "set_stoploss" }],
                [{ text: `🎯 Target: ${data.targetProfit || 3000}`, callback_data: "set_target" }]
            ]
        }
    };
}

async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        
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
                            await bot.sendMessage(chatId, `✅ **WIN!** ${data.last_amount} MMK`);
                        } else {
                            data.step = (data.step || 0) + 1;
                            await bot.sendMessage(chatId, `❌ **LOSS!** ${data.last_amount} MMK`);
                        }
                        
                        if (!data.stats) data.stats = { profit: 0 };
                        data.stats.profit += win ? data.last_amount * 0.97 : -data.last_amount;
                        saveData();
                    }
                }

                // Place new bet
                if (currNumber && currNumber !== "null") {
                    const lastResult = parseInt(currNumber) >= 5 ? "Big" : "Small";
                    const mode = data.strategyType || "OPPOSITE";
                    let decision = mode === "OPPOSITE" ? (lastResult === "Big" ? "Small" : "Big") : lastResult;
                    
                    const nextIssue = (BigInt(currIssue) + 1n).toString();
                    const amount = calculateBetAmount(data);
                    
                    if ((data.stats?.profit || 0) <= -(data.stopLoss || 5000)) {
                        await bot.sendMessage(chatId, `🛑 Stop loss reached!`);
                        data.running = false;
                        break;
                    }
                    if ((data.stats?.profit || 0) >= (data.targetProfit || 3000)) {
                        await bot.sendMessage(chatId, `🎉 Target reached!`);
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
        await new Promise(r => setTimeout(r, 3500));
    }
}

// ========== COMMANDS ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        "🤖 **WinGo Pro Bot v8.5**\n\n" +
        "**Login ဝင်ရန်:**\n" +
        "1️⃣ ဖုန်းနံပါတ် (09xxxxxxxxx)\n" +
        "2️⃣ စကားဝှက်\n\n" +
        "ဖုန်းနံပါတ်ပို့ပါ:", 
        { reply_markup: { remove_keyboard: true } }
    );
});

// ========== BUTTON HANDLERS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text.startsWith('/')) return;
    if (!user_db[chatId]) user_db[chatId] = {};
    
    // 🚀 Start 30s
    if (text === "🚀 Start 30s") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first! Send /start");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot already running!");
        
        user_db[chatId].typeId = 30;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        user_db[chatId].last_issue = "";
        user_db[chatId].last_pred = null;
        
        bot.sendMessage(chatId, "🚀 **30s Bot Started!**", getMainMenu());
        monitoringLoop(chatId);
    }
    
    // 🚀 Start 1min
    else if (text === "🚀 Start 1min") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first!");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot already running!");
        
        user_db[chatId].typeId = 1;
        user_db[chatId].running = true;
        user_db[chatId].step = 0;
        
        bot.sendMessage(chatId, "🚀 **1min Bot Started!**", getMainMenu());
        monitoringLoop(chatId);
    }
    
    // 📊 Stats
    else if (text === "📊 Stats") {
        const profit = user_db[chatId]?.stats?.profit || 0;
        bot.sendMessage(chatId, `📊 **Profit:** ${profit.toFixed(0)} MMK`);
    }
    
    // 💰 Balance
    else if (text === "💰 Balance") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login first!");
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            bot.sendMessage(chatId, `💰 **Balance:** ${info.data.amount} MMK`);
        }
    }
    
    // ⚙️ Settings
    else if (text === "⚙️ Settings") {
        bot.sendMessage(chatId, "⚙️ **Settings**", getSettingsMenu(chatId));
    }
    
    // 📜 History
    else if (text === "📜 History") {
        bot.sendMessage(chatId, "📜 History feature - Coming soon");
    }
    
    // 🛑 Stop
    else if (text === "🛑 Stop") {
        if (user_db[chatId]) {
            user_db[chatId].running = false;
            bot.sendMessage(chatId, "🛑 **Bot Stopped**", getMainMenu());
        }
    }
    
    // ❓ Help
    else if (text === "❓ Help") {
        bot.sendMessage(chatId,
            "🤖 **Help**\n\n" +
            "1. /start\n" +
            "2. Send phone number (09xxxxxxxxx)\n" +
            "3. Send password\n" +
            "4. Press 🚀 Start 30s"
        );
    }
    
    // ========== FIXED LOGIN ==========
    else if (!user_db[chatId].token && !user_db[chatId].awaitingPassword) {
        // Check if it's a phone number
        const cleanPhone = text.replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 9 && cleanPhone.length <= 11) {
            user_db[chatId].tempPhone = text;
            user_db[chatId].awaitingPassword = true;
            return bot.sendMessage(chatId, "🔐 Send your password:");
        }
    }
    else if (user_db[chatId].awaitingPassword && !user_db[chatId].token) {
        const rawPhone = user_db[chatId].tempPhone;
        let formattedPhone = rawPhone;
        
        // Format phone number
        if (rawPhone.startsWith('09')) {
            formattedPhone = '95' + rawPhone.substring(1);
        } else if (rawPhone.startsWith('0')) {
            formattedPhone = '95' + rawPhone.substring(1);
        } else if (!rawPhone.startsWith('95') && !rawPhone.startsWith('09')) {
            formattedPhone = '95' + rawPhone;
        }
        
        console.log(`Login: ${rawPhone} -> ${formattedPhone}`);
        
        const loginRes = await callApi("Login", { 
            phonetype: -1, language: 7, logintype: "mobile", 
            username: formattedPhone, pwd: text 
        });
        
        if (loginRes?.msgCode === 0) {
            user_db[chatId].token = loginRes.data.tokenHeader + loginRes.data.token;
            delete user_db[chatId].tempPhone;
            delete user_db[chatId].awaitingPassword;
            saveData();
            
            bot.sendMessage(chatId, "✅ **LOGIN SUCCESS!**", getMainMenu());
            
            const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
            if (info?.msgCode === 0) {
                bot.sendMessage(chatId, `💰 Balance: ${info.data.amount} MMK`);
            }
        } else {
            delete user_db[chatId].tempPhone;
            delete user_db[chatId].awaitingPassword;
            bot.sendMessage(chatId, 
                "❌ **LOGIN FAILED!**\n\n" +
                "စစ်ဆေးရန်:\n" +
                "• ဖုန်းနံပါတ်မှန်ကန်သလား\n" +
                "• စကားဝှက်မှန်ကန်သလား\n" +
                "• Website မှာ ဝင်ကြည့်ပါ\n\n" +
                "/start ပြန်လုပ်ပါ။"
            );
        }
    }
});

// ========== INLINE BUTTONS ==========
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    
    if (data === "change_strategy") {
        const strategies = ["MARTINGALE", "FIBONACCI", "FLAT"];
        const current = user_db[chatId]?.strategy || "MARTINGALE";
        const next = strategies[(strategies.indexOf(current) + 1) % strategies.length];
        user_db[chatId].strategy = next;
        await bot.answerCallbackQuery(q.id, { text: `Strategy: ${next}` });
    }
    else if (data === "change_mode") {
        const modes = ["OPPOSITE", "FOLLOW", "RANDOM"];
        const current = user_db[chatId]?.strategyType || "OPPOSITE";
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        user_db[chatId].strategyType = next;
        await bot.answerCallbackQuery(q.id, { text: `Mode: ${next}` });
    }
    else if (data === "set_stoploss") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /loss 5000" });
        bot.sendMessage(chatId, "📝 Type: `/loss 5000`");
    }
    else if (data === "set_target") {
        await bot.answerCallbackQuery(q.id, { text: "Send: /target 3000" });
        bot.sendMessage(chatId, "📝 Type: `/target 3000`");
    }
    
    saveData();
    await bot.editMessageText("⚙️ **Settings**", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: getSettingsMenu(chatId).reply_markup
    }).catch(() => {});
});

// Number commands
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

console.log('🤖 Bot Started!');
