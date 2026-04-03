const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Keep Alive
http.createServer((req, res) => { 
    res.end('BigWin 30s Bot Active'); 
}).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7F9bE-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// Signature Function (based on actual payload)
function signMd5(data) {
    let temp = { ...data };
    delete temp.signature;
    delete temp.timestamp;
    delete temp.random;
    
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    console.log("String to sign:", jsonStr);
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

// API Call Function
async function callApi(endpoint, payload, authToken = null) {
    // Generate random and timestamp
    payload.random = crypto.randomBytes(16).toString('hex');
    payload.timestamp = Math.floor(Date.now() / 1000);
    
    // Calculate signature AFTER adding random and timestamp
    payload.signature = signMd5(payload);
    
    const headers = { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { 
            headers, 
            timeout: 30000,
            httpsAgent: agent
        });
        console.log(`${endpoint} Response:`, res.data);
        return res.data;
    } catch (e) { 
        console.error(`API Error [${endpoint}]:`, e.code || e.message);
        return null; 
    }
}

// Get Game History
async function getGameHistory(token) {
    const payload = {
        pageNo: 1,
        pageSize: 15,
        language: 7,
        typeId: 30
    };
    return await callApi("GetNoaverageEmerdList", payload, token);
}

// Place Bet - FIXED selectType
async function placeBet(amount, issueNumber, isBig, token) {
    const payload = {
        typeId: 30,
        issuenumber: issueNumber,
        amount: amount,
        betCount: 7,  // Fixed betCount as per your example
        gameType: 2,
        selectType: isBig ? 13 : 14,  // 13 = Big, 14 = Small
        language: 7
    };
    console.log("Bet Payload:", JSON.stringify(payload, null, 2));
    return await callApi("GameBetting", payload, token);
}

// Get User Balance
async function getUserBalance(token) {
    return await callApi("GetUserInfo", {}, token);
}

// Decision Logic
function getDecision(history, formulaType) {
    const last5 = history.slice(0, 5).map(i => {
        const num = parseInt(i.number);
        return num >= 5 ? "Big" : "Small";
    });
    const last = last5[0];
    
    switch(formulaType) {
        case "FOLLOW": return last;
        case "OPPOSITE": return last === "Big" ? "Small" : "Big";
        case "RANDOM": return Math.random() > 0.5 ? "Big" : "Small";
        case "SMART":
            const bigs = last5.filter(v => v === "Big").length;
            if (bigs >= 3) return "Small";
            if (bigs <= 1) return "Big";
            return Math.random() > 0.5 ? "Big" : "Small";
        default: return last;
    }
}

// Main Auto-Betting Loop
async function monitoring30s(chatId) {
    const data = user_db[chatId];
    
    while (data.running) {
        try {
            const res = await getGameHistory(data.token);
            
            if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
                const history = res.data.list;
                const currentIssue = history[0].issueNumber;
                const currentNumber = history[0].number;
                
                // Show current result
                if (currentNumber && currentNumber !== "null" && currentNumber !== data.lastShownNumber) {
                    const resultText = parseInt(currentNumber) >= 5 ? "🔴 BIG" : "🔵 SMALL";
                    bot.sendMessage(chatId, 
                        `🎲 **RESULT** ${currentIssue.slice(-6)}\n` +
                        `🔢 ${currentNumber} → ${resultText}`
                    );
                    data.lastShownNumber = currentNumber;
                }
                
                // Check previous bet result
                if (data.lastBetIssue && data.lastBetIssue !== currentIssue) {
                    const lastResult = history.find(h => h.issueNumber === data.lastBetIssue);
                    if (lastResult && lastResult.number && lastResult.number !== "null") {
                        const realRes = parseInt(lastResult.number) >= 5 ? "Big" : "Small";
                        const win = data.lastBetPick === realRes;
                        
                        if (win) {
                            const winAmount = data.lastBetAmount * 0.97;
                            data.sessionProfit += winAmount;
                            data.step = 0;
                            data.consecutiveLoss = 0;
                            bot.sendMessage(chatId, 
                                `✅ **WIN!** +${winAmount.toFixed(0)}\n` +
                                `📈 Total: ${data.sessionProfit.toFixed(0)} MMK`
                            );
                        } else {
                            data.sessionProfit -= data.lastBetAmount;
                            data.step = (data.step + 1) % data.betPlan.length;
                            data.consecutiveLoss = (data.consecutiveLoss || 0) + 1;
                            bot.sendMessage(chatId, 
                                `❌ **LOSS!** -${data.lastBetAmount}\n` +
                                `📈 Total: ${data.sessionProfit.toFixed(0)} MMK\n` +
                                `📊 Next Bet: ${data.betPlan[data.step]} MMK`
                            );
                        }
                        
                        // Check stop loss / target
                        if (data.sessionProfit <= -(data.stopLoss || 5000)) {
                            bot.sendMessage(chatId, `🛑 **STOP LOSS!** ${data.sessionProfit} MMK`);
                            data.running = false;
                            break;
                        }
                        if (data.sessionProfit >= (data.targetProfit || 3000)) {
                            bot.sendMessage(chatId, `🎉 **TARGET!** ${data.sessionProfit} MMK`);
                            data.running = false;
                            break;
                        }
                    }
                }
                
                // Place new bet
                const nextIssue = (BigInt(currentIssue) + 1n).toString();
                const decision = getDecision(history, data.formula);
                const betAmount = data.betPlan[data.step];
                const isBig = decision === "Big";
                
                bot.sendMessage(chatId, `⏳ Betting ${decision} - ${betAmount} MMK on ${nextIssue.slice(-6)}`);
                
                const betRes = await placeBet(betAmount, nextIssue, isBig, data.token);
                
                if (betRes?.msgCode === 0) {
                    data.lastBetIssue = currentIssue;
                    data.lastBetPick = decision;
                    data.lastBetAmount = betAmount;
                    bot.sendMessage(chatId, `✅ **BET PLACED!** ${decision} ${betAmount} MMK`);
                } else {
                    bot.sendMessage(chatId, `⚠️ **BET FAILED!** ${betRes?.msg || "Error"}`);
                }
            }
        } catch (error) {
            console.error("Loop error:", error.message);
        }
        
        await new Promise(r => setTimeout(r, 3500));
    }
}

// Commands
bot.onText(/\/start30s/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!user_db[chatId]?.token) {
        return bot.sendMessage(chatId, "❌ Login first!\nSend 09xxxxxxxxx");
    }
    if (user_db[chatId]?.running) {
        return bot.sendMessage(chatId, "⚠️ Bot already running!");
    }
    
    user_db[chatId] = {
        ...user_db[chatId],
        running: true,
        sessionProfit: user_db[chatId].sessionProfit || 0,
        step: 0,
        betPlan: user_db[chatId].betPlan || [10, 30, 90, 270, 810],
        formula: user_db[chatId].formula || "SMART",
        stopLoss: user_db[chatId].stopLoss || 5000,
        targetProfit: user_db[chatId].targetProfit || 3000
    };
    
    bot.sendMessage(chatId, `🎲 **30s BOT STARTED!**\n💰 Plan: ${user_db[chatId].betPlan.join(', ')}\n🎯 Formula: ${user_db[chatId].formula}`);
    monitoring30s(chatId);
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    if (user_db[chatId]) {
        user_db[chatId].running = false;
        bot.sendMessage(chatId, `🛑 **STOPPED** Profit: ${(user_db[chatId].sessionProfit || 0).toFixed(0)} MMK`);
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const d = user_db[chatId] || {};
    bot.sendMessage(chatId, 
        `📊 **STATUS**\n` +
        `🏃 Running: ${d.running ? 'YES' : 'NO'}\n` +
        `💰 Profit: ${(d.sessionProfit || 0).toFixed(0)} MMK\n` +
        `🎲 Formula: ${d.formula || 'SMART'}\n` +
        `📈 Step: ${(d.step || 0) + 1}/${(d.betPlan || [10]).length}`
    );
});

bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "❌ Login first!");
    
    const info = await getUserBalance(user_db[chatId].token);
    if (info?.msgCode === 0) {
        bot.sendMessage(chatId, `💰 Balance: ${info.data.amount} MMK`);
    }
});

bot.onText(/\/plan (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const plan = match[1].split(',').map(Number);
    if (plan.length >= 2 && plan.every(n => n > 0)) {
        if (!user_db[chatId]) user_db[chatId] = {};
        user_db[chatId].betPlan = plan;
        user_db[chatId].step = 0;
        bot.sendMessage(chatId, `✅ Plan: ${plan.join(', ')} MMK`);
    }
});

bot.onText(/\/formula (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const formula = match[1].toUpperCase();
    if (["SMART", "FOLLOW", "OPPOSITE", "RANDOM"].includes(formula)) {
        if (!user_db[chatId]) user_db[chatId] = {};
        user_db[chatId].formula = formula;
        bot.sendMessage(chatId, `✅ Formula: ${formula}`);
    }
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        `🤖 **COMMANDS**\n\n` +
        `🔐 Login: 09xxx then password\n` +
        `/start30s - Start bot\n` +
        `/stop - Stop bot\n` +
        `/status - Check status\n` +
        `/balance - Check balance\n` +
        `/plan 10,30,90,270,810\n` +
        `/formula SMART\n` +
        `/help - This menu`
    );
});

// Login Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!user_db[chatId]) user_db[chatId] = {};
    if (text.startsWith('/')) return;
    
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Send password:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const phone = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const loginRes = await callApi("Login", { 
            phonetype: -1, language: 7, logintype: "mobile", 
            username: phone, pwd: text 
        });
        
        if (loginRes?.msgCode === 0) {
            user_db[chatId].token = loginRes.data.tokenHeader + loginRes.data.token;
            delete user_db[chatId].tempPhone;
            bot.sendMessage(chatId, "✅ **LOGIN SUCCESS!**\nType /help");
        } else {
            delete user_db[chatId].tempPhone;
            bot.sendMessage(chatId, "❌ **LOGIN FAILED!**");
        }
    }
});

console.log('🤖 Bot Running...');
