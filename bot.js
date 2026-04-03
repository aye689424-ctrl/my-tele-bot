const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Keep Alive
http.createServer((req, res) => { 
    res.end('BigWin Pro Bot Active'); 
}).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// Custom HTTPS Agent to bypass SSL issues
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// Signature Function
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature;
    delete temp.timestamp;
    
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

// Improved API Call with Retry Logic
async function callApi(endpoint, payload, authToken = null, retry = 2) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    
    for (let i = 0; i <= retry; i++) {
        try {
            const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { 
                headers, 
                timeout: 30000,
                httpsAgent: agent
            });
            return res.data;
        } catch (e) { 
            if (i === retry) {
                console.error(`API ${endpoint} Error:`, e.code || e.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

// Get Decision Logic
function getDecision(history, formulaType) {
    const last10 = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = last10[0];
    
    if (formulaType === "FOLLOW") return last;
    if (formulaType === "OPPOSITE") return last === "Big" ? "Small" : "Big";
    if (formulaType === "RANDOM") return Math.random() > 0.5 ? "Big" : "Small";
    if (formulaType === "SMART") {
        const bigs = last10.filter(v => v === "Big").length;
        return bigs >= 5 ? "Small" : "Big";
    }
    return last;
}

// Auto-Betting Loop
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        
        // Get game history
        const res = await callApi("GetNoaverageEmerdList", { 
            pageNo: 1, 
            pageSize: 15, 
            language: 7, 
            typeId: data.typeId 
        }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // Check win/loss from previous bet
                if (data.last_pred && data.last_bet_amount) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === realRes;
                    
                    if (win) { 
                        data.sessionProfit += (data.last_bet_amount * 0.97);
                        data.step = 0;
                        data.consecutive_loss = 0;
                        bot.sendMessage(chatId, `✅ **WIN!**\n📊 Period: ${currIssue.slice(-3)}\n💰 +${(data.last_bet_amount * 0.97).toFixed(0)}\n📈 Total: ${data.sessionProfit.toFixed(0)}`);
                    } else { 
                        data.sessionProfit -= data.last_bet_amount;
                        data.step = (data.step + 1) % data.betPlan.length;
                        data.consecutive_loss = (data.consecutive_loss || 0) + 1;
                        bot.sendMessage(chatId, `❌ **LOSS!**\n📊 Period: ${currIssue.slice(-3)}\n💰 -${data.last_bet_amount}\n📈 Total: ${data.sessionProfit.toFixed(0)}`);
                    }
                }

                // Place new bet
                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const betAmt = data.betPlan[data.step];

                // Check stop loss / target profit
                if (data.sessionProfit <= -(data.stopLoss || 5000)) {
                    bot.sendMessage(chatId, `🛑 **STOP LOSS REACHED!**\nLoss: ${data.sessionProfit}\nAuto-bot stopped.`);
                    data.running = false;
                    break;
                }
                if (data.sessionProfit >= (data.targetProfit || 3000)) {
                    bot.sendMessage(chatId, `🎉 **TARGET PROFIT REACHED!**\nProfit: ${data.sessionProfit}\nAuto-bot stopped.`);
                    data.running = false;
                    break;
                }

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": betAmt,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 12 : 13),
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision;
                data.last_issue = currIssue;
                data.last_bet_amount = betAmt;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `🎯 **BET PLACED**\n📊 Issue: ${nextIssue.slice(-5)}\n🎲 Pick: ${decision}\n💰 Amount: ${betAmt}\n📊 Step: ${data.step + 1}/${data.betPlan.length}`);
                } else {
                    bot.sendMessage(chatId, `⚠️ **BET FAILED**\nError: ${betRes?.msg || betRes?.message || "Connection error"}\nRetrying next round...`);
                }
            }
        } else {
            // If no data, send heartbeat every 30 seconds
            if (!user_db[chatId]._heartbeat) {
                user_db[chatId]._heartbeat = Date.now();
            } else if (Date.now() - user_db[chatId]._heartbeat > 30000) {
                bot.sendMessage(chatId, `🔄 Bot is running...\n💰 Profit: ${(user_db[chatId].sessionProfit || 0).toFixed(0)}`);
                user_db[chatId]._heartbeat = Date.now();
            }
        }
        
        // Wait interval based on game mode
        const interval = data.typeId === 30 ? 3500 : 8000;
        await new Promise(r => setTimeout(r, interval));
    }
}

// Test connection command
bot.onText(/\/test/, async (msg) => {
    const chatId = msg.chat.id;
    const testMsg = await bot.sendMessage(chatId, "🔍 Testing API connection...");
    
    try {
        const testPayload = { pageNo: 1, pageSize: 1, language: 7, typeId: 30 };
        const res = await callApi("GetNoaverageEmerdList", testPayload);
        
        if (res && res.msgCode === 0) {
            await bot.editMessageText("✅ **API CONNECTION SUCCESS!**\n\nServer is reachable.\nYou can now start auto-betting.", {
                chat_id: chatId,
                message_id: testMsg.message_id,
                parse_mode: 'Markdown'
            });
        } else {
            await bot.editMessageText(`❌ **API CONNECTION FAILED**\n\nResponse: ${JSON.stringify(res)}\n\nPossible issues:\n1. API server is down\n2. Your IP is blocked\n3. VPN required`, {
                chat_id: chatId,
                message_id: testMsg.message_id
            });
        }
    } catch (error) {
        await bot.editMessageText(`❌ **CONNECTION ERROR**\n\nCode: ${error.code || 'UNKNOWN'}\nMessage: ${error.message}\n\nTry using VPN on your phone first, then restart bot.`, {
            chat_id: chatId,
            message_id: testMsg.message_id
        });
    }
});

// Reset command
bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    user_db[chatId] = { 
        running: false, 
        sessionProfit: 0, 
        step: 0, 
        logs: [], 
        betPlan: [10, 30, 90, 270, 830],
        formula: "SMART", 
        typeId: 30,
        stopLoss: 5000,
        targetProfit: 3000
    };
    bot.sendMessage(chatId, "✅ Bot has been reset! Type /start to begin.");
});

// Main message handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Initialize user data if not exists
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, 
            sessionProfit: 0, 
            step: 0, 
            logs: [], 
            betPlan: [10, 30, 90, 270, 830],
            formula: "SMART", 
            typeId: 30,
            stopLoss: 5000,
            targetProfit: 3000
        };
    }

    const menu = { 
        reply_markup: { 
            keyboard: [
                ["🚀 Start Auto", "🛑 Stop Auto"],
                ["💰 My Balance", "⚙️ Settings"],
                ["📈 Status", "/test"]
            ], 
            resize_keyboard: true 
        } 
    };

    // Start command
    if (text === '/start') {
        return bot.sendMessage(chatId, 
            "🤖 **BigWin Pro Bot v6.2**\n\n" +
            "Commands:\n" +
            "• /test - Check API connection\n" +
            "• /reset - Reset all settings\n\n" +
            "First, login by sending:\n" +
            "1️⃣ Your phone number (09xxxxxxxxx)\n" +
            "2️⃣ Your password\n\n" +
            "Then press '🚀 Start Auto'", 
            menu
        );
    }

    // Balance check
    if (text === "💰 My Balance") {
        if (!user_db[chatId].token) {
            return bot.sendMessage(chatId, "❌ Please login first.\nSend your phone number (09xxxxxxxxx)");
        }
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            return bot.sendMessage(chatId, `👤 **User ID:** ${info.data.userId}\n💵 **Balance:** ${info.data.amount} MMK\n📈 **Today Profit:** ${user_db[chatId].sessionProfit?.toFixed(0) || 0}`, { parse_mode: 'Markdown' });
        }
        return bot.sendMessage(chatId, "❌ Failed to get balance. Please login again.");
    }

    // Settings
    if (text === "⚙️ Settings") {
        const setKB = { 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: `🧬 Formula: ${user_db[chatId].formula}`, callback_data: "cycle" }],
                    [{ text: `💰 Bet Plan: ${user_db[chatId].betPlan.join(",")}`, callback_data: "edit_plan" }],
                    [{ text: `⏱️ Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}`, callback_data: "mode" }],
                    [{ text: `🛑 Stop Loss: ${user_db[chatId].stopLoss}`, callback_data: "stop_loss" }],
                    [{ text: `🎯 Target: ${user_db[chatId].targetProfit}`, callback_data: "target" }]
                ]
            }
        };
        return bot.sendMessage(chatId, "⚙️ **Settings Menu**\nClick buttons to change:", setKB);
    }

    // Status
    if (text === "📈 Status") {
        const data = user_db[chatId];
        return bot.sendMessage(chatId, 
            `📊 **BOT STATUS**\n\n` +
            `🏃 Running: ${data.running ? '✅ Yes' : '❌ No'}\n` +
            `💰 Profit: ${(data.sessionProfit || 0).toFixed(0)} MMK\n` +
            `🎲 Formula: ${data.formula}\n` +
            `⏱️ Mode: ${data.typeId === 30 ? '30s' : '1min'}\n` +
            `📈 Step: ${data.step + 1}/${data.betPlan.length}\n` +
            `🛑 Stop Loss: ${data.stopLoss}\n` +
            `🎯 Target: ${data.targetProfit}`
        );
    }

    // Start Auto
    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) {
            return bot.sendMessage(chatId, "❌ Please login first!\nSend your phone number (09xxxxxxxxx)");
        }
        if (user_db[chatId].running) {
            return bot.sendMessage(chatId, "⚠️ Bot is already running!");
        }
        user_db[chatId].running = true;
        user_db[chatId].sessionProfit = user_db[chatId].sessionProfit || 0;
        user_db[chatId].step = 0;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "✅ **AUTO-BETTING STARTED!**\nType '📈 Status' to monitor.", menu);
    }

    // Stop Auto
    if (text === "🛑 Stop Auto") {
        user_db[chatId].running = false;
        return bot.sendMessage(chatId, "🛑 **AUTO-BETTING STOPPED**\nFinal profit: " + (user_db[chatId].sessionProfit || 0).toFixed(0), menu);
    }

    // Edit bet plan
    if (text.match(/^plan\s+[\d,]+$/i)) {
        try {
            const plan = text.replace(/plan/i, '').trim().split(',').map(Number);
            if (plan.length >= 2 && plan.every(n => n > 0)) {
                user_db[chatId].betPlan = plan;
                user_db[chatId].step = 0;
                bot.sendMessage(chatId, `✅ Bet plan updated: ${plan.join(', ')} MMK`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid plan. Example: plan 10,30,90,270,830");
            }
        } catch(e) {
            bot.sendMessage(chatId, "❌ Invalid format. Example: plan 10,30,90,270,830");
        }
        return;
    }

    // Login - Phone number
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Send your password:");
    }
    
    // Login - Password
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const loginRes = await callApi("Login", { 
            phonetype: -1, 
            language: 7, 
            logintype: "mobile", 
            username: phone, 
            pwd: text 
        });
        
        if (loginRes?.msgCode === 0) {
            user_db[chatId].token = loginRes.data.tokenHeader + loginRes.data.token;
            delete user_db[chatId].tempPhone;
            bot.sendMessage(chatId, "✅ **LOGIN SUCCESSFUL!**\nPress '🚀 Start Auto' to begin.", menu);
            
            // Get balance after login
            const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
            if (info?.msgCode === 0) {
                bot.sendMessage(chatId, `💰 Your balance: ${info.data.amount} MMK`);
            }
        } else {
            delete user_db[chatId].tempPhone;
            bot.sendMessage(chatId, "❌ **LOGIN FAILED!**\nWrong phone or password.\nType /start to try again.");
        }
        return;
    }
});

// Callback query handler
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    
    if (data === "cycle") {
        const formulas = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        const idx = formulas.indexOf(user_db[chatId].formula);
        user_db[chatId].formula = formulas[(idx + 1) % formulas.length];
        await bot.answerCallbackQuery(q.id, { text: `Formula: ${user_db[chatId].formula}` });
    }
    else if (data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
        await bot.answerCallbackQuery(q.id, { text: `Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}` });
    }
    else if (data === "edit_plan") {
        await bot.answerCallbackQuery(q.id, { text: "Send: plan 10,30,90,270,830" });
        bot.sendMessage(chatId, "📝 Send your bet plan:\nExample: `plan 10,30,90,270,830`", { parse_mode: 'Markdown' });
        return;
    }
    else if (data === "stop_loss") {
        await bot.answerCallbackQuery(q.id, { text: "Send: loss 5000" });
        bot.sendMessage(chatId, "📝 Send stop loss amount:\nExample: `loss 5000` (stop if loss exceeds 5000)");
        return;
    }
    else if (data === "target") {
        await bot.answerCallbackQuery(q.id, { text: "Send: target 3000" });
        bot.sendMessage(chatId, "📝 Send target profit:\nExample: `target 3000` (stop when profit reaches 3000)");
        return;
    }
    
    // Refresh settings menu
    const setKB = { 
        reply_markup: { 
            inline_keyboard: [
                [{ text: `🧬 Formula: ${user_db[chatId].formula}`, callback_data: "cycle" }],
                [{ text: `💰 Bet Plan: ${user_db[chatId].betPlan.join(",")}`, callback_data: "edit_plan" }],
                [{ text: `⏱️ Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}`, callback_data: "mode" }],
                [{ text: `🛑 Stop Loss: ${user_db[chatId].stopLoss}`, callback_data: "stop_loss" }],
                [{ text: `🎯 Target: ${user_db[chatId].targetProfit}`, callback_data: "target" }]
            ]
        }
    };
    
    await bot.editMessageText("⚙️ **Settings Menu**\nClick buttons to change:", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: setKB.reply_markup,
        parse_mode: 'Markdown'
    }).catch(() => {});
});

// Handle stop loss and target text commands
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text && text.match(/^loss\s+\d+$/i)) {
        const loss = parseInt(text.match(/\d+/)[0]);
        if (user_db[chatId]) {
            user_db[chatId].stopLoss = loss;
            bot.sendMessage(chatId, `✅ Stop loss set to ${loss} MMK`);
        }
    }
    
    if (text && text.match(/^target\s+\d+$/i)) {
        const target = parseInt(text.match(/\d+/)[0]);
        if (user_db[chatId]) {
            user_db[chatId].targetProfit = target;
            bot.sendMessage(chatId, `✅ Target profit set to ${target} MMK`);
        }
    }
});

console.log('🤖 Bot is running...');
