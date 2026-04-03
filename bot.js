const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Keep Alive
http.createServer((req, res) => { 
    res.end('BigWin Pro Console v6.2 Active'); 
}).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// ✅ Fixed Signature
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

async function callApi(endpoint, payload, authToken = null) {
    payload.timestamp = Math.floor(Date.now() / 1000);
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36"
    };
    
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { 
            headers, 
            timeout: 15000 
        });
        return res.data;
    } catch (e) { 
        console.error("API Error:", e.message);
        return null; 
    }
}

// ✅ Fixed Decision Logic
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

// ✅ Fixed Monitoring Loop
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { 
            pageNo: 1, 
            pageSize: 15, 
            language: 7, 
            typeId: data.typeId 
        }, data.token);

        if (res && res.msgCode === 0 && res.data.list.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // Check Win/Loss
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    const win = data.last_pred === realRes;
                    const betAmt = data.betPlan[data.step];
                    
                    if (win) { 
                        data.sessionProfit += (betAmt * 0.97); 
                        data.step = 0; 
                        bot.sendMessage(chatId, `✅ **WIN!** | Period: ${currIssue.slice(-3)} | +${(betAmt * 0.97).toFixed(0)}`);
                    } else { 
                        data.sessionProfit -= betAmt; 
                        data.step = (data.step + 1) % data.betPlan.length;
                        bot.sendMessage(chatId, `❌ **LOSS** | Period: ${currIssue.slice(-3)} | -${betAmt}`);
                    }
                }

                // Place New Bet
                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const betAmt = data.betPlan[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": betAmt,
                    "betCount": 1,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 12 : 13), // ✅ Fixed selectType
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = decision; 
                data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `🎯 **BET PLACED**\n📊 Issue: ${nextIssue.slice(-5)}\n🎲 Pick: ${decision}\n💰 Amount: ${betAmt}\n📈 Profit: ${data.sessionProfit.toFixed(0)}`);
                } else {
                    bot.sendMessage(chatId, `⚠️ **BET FAILED**\nError: ${betRes?.msg || "Connection error"}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// ✅ Telegram Message Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Initialize user data
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, 
            sessionProfit: 0, 
            step: 0, 
            logs: [], 
            betPlan: [10, 30, 90, 270, 830], 
            formula: "SMART", 
            typeId: 30 
        };
    }

    const menu = { 
        reply_markup: { 
            keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["📊 History", "/start"]], 
            resize_keyboard: true 
        } 
    };

    if (text === '/start') {
        return bot.sendMessage(chatId, "🤖 **BigWin Pro Console v6.2**\n✅ Error-Free Version Ready", menu);
    }

    if (text === "💰 My Profile") {
        if (!user_db[chatId].token) {
            return bot.sendMessage(chatId, "❌ Please login first. Send your phone number (09xxxxxxxxx)");
        }
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            return bot.sendMessage(chatId, `👤 **User ID:** \`${info.data.userId}\`\n💵 **Balance:** \`${info.data.amount} MMK\``, { parse_mode: 'Markdown' });
        }
        return bot.sendMessage(chatId, "❌ Failed to get balance");
    }

    if (text === "⚙️ Setup") {
        const setKB = { 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: `🧬 Formula: ${user_db[chatId].formula}`, callback_data: "cycle" }],
                    [{ text: `💵 Plan: ${user_db[chatId].betPlan.join(",")}`, callback_data: "plan" }],
                    [{ text: `⏱️ Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}`, callback_data: "mode" }]
                ]
            }
        };
        return bot.sendMessage(chatId, "⚙️ **Settings Menu**", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) {
            return bot.sendMessage(chatId, "❌ Please login first. Send your phone number (09xxxxxxxxx)");
        }
        user_db[chatId].running = true;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "✅ **Auto-Betting Started!**", menu);
    }

    if (text === "🛑 Stop Auto") {
        user_db[chatId].running = false;
        return bot.sendMessage(chatId, "🛑 **Auto-Betting Stopped**", menu);
    }

    if (text === "📊 History") {
        const logs = user_db[chatId].logs.slice(-10).join("\n") || "No history yet";
        return bot.sendMessage(chatId, `📜 **Last 10 Results:**\n${logs}`);
    }

    // Change bet plan: "plan 10,30,90,270,830"
    if (text.startsWith("plan ")) {
        try {
            user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number);
            return bot.sendMessage(chatId, `✅ Bet Plan updated: ${user_db[chatId].betPlan.join(", ")}`);
        } catch(e) {
            return bot.sendMessage(chatId, "❌ Invalid format. Use: plan 10,30,90,270,830");
        }
    }

    // Login Logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Send your password:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { 
            phonetype: -1, 
            language: 7, 
            logintype: "mobile", 
            username: phone, 
            pwd: text 
        });
        
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            delete user_db[chatId].tempPhone;
            return bot.sendMessage(chatId, "✅ **Login Successful!**", menu);
        }
        delete user_db[chatId].tempPhone;
        return bot.sendMessage(chatId, "❌ **Login Failed!**\nType /start to try again");
    }
});

// ✅ Callback Query Handler
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    
    if (data === "cycle") {
        const formulas = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        const currentIndex = formulas.indexOf(user_db[chatId].formula);
        user_db[chatId].formula = formulas[(currentIndex + 1) % formulas.length];
        await bot.answerCallbackQuery(q.id, { text: `Formula changed to ${user_db[chatId].formula}` });
    } 
    else if (data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
        await bot.answerCallbackQuery(q.id, { text: `Mode changed to ${user_db[chatId].typeId === 30 ? "30s" : "1min"}` });
    }
    else if (data === "plan") {
        await bot.answerCallbackQuery(q.id, { text: "Send: plan 10,30,90,270,830" });
    }
    
    // Refresh settings menu
    const setKB = { 
        reply_markup: { 
            inline_keyboard: [
                [{ text: `🧬 Formula: ${user_db[chatId].formula}`, callback_data: "cycle" }],
                [{ text: `💵 Plan: ${user_db[chatId].betPlan.join(",")}`, callback_data: "plan" }],
                [{ text: `⏱️ Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}`, callback_data: "mode" }]
            ]
        }
    };
    await bot.editMessageText("⚙️ **Settings Menu**", {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: setKB.reply_markup,
        parse_mode: 'Markdown'
    }).catch(() => {});
});
