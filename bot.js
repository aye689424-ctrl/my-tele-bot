const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

http.createServer((req, res) => { res.end('BigWin Pro Console v6.6 Active'); }).listen(process.env.PORT || 8080);

const token = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// Generate device ID (like website)
function generateDeviceId() {
    return crypto.randomBytes(16).toString('hex');
}

function signMd5(data) {
    let temp = { ...data };
    delete temp.signature;
    delete temp.timestamp;
    delete temp.random;
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
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 20000 });
        console.log(`${endpoint}:`, res.data?.msgCode, res.data?.msg);
        return res.data;
    } catch (e) { 
        console.log(`API Error:`, e.code);
        return { msgCode: -1, msg: "Network Error" }; 
    }
}

// ✅ FIXED LOGIN FUNCTION (based on your payload)
async function doLogin(username, password) {
    const deviceId = generateDeviceId();
    
    const loginPayload = {
        "username": username,
        "pwd": password,
        "phonetype": 1,              // ✅ ခင်ဗျား payload အတိုင်း 1
        "logintype": "mobile",
        "packId": "",                // ✅ empty string
        "deviceId": deviceId,        // ✅ generate new device ID
        "language": 7
    };
    
    console.log("Login Payload:", JSON.stringify(loginPayload, null, 2));
    
    return await callApi("Login", loginPayload);
}

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

async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data && res.data.list.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                if (data.last_pred && data.last_issue) {
                    const lastResult = history.find(h => h.issueNumber === data.last_issue);
                    if (lastResult && lastResult.number && lastResult.number !== "null") {
                        const realRes = parseInt(lastResult.number) >= 5 ? "Big" : "Small";
                        const win = (data.last_pred === realRes);
                        const betAmt = data.betPlan[data.step];
                        
                        if (win) {
                            data.sessionProfit += (betAmt * 0.95);
                            data.step = 0;
                            bot.sendMessage(chatId, `✅ **WIN!** +${(betAmt * 0.95).toFixed(0)} | Total: ${data.sessionProfit.toFixed(0)}`);
                        } else {
                            data.sessionProfit -= betAmt;
                            data.step = (data.step + 1) % data.betPlan.length;
                            bot.sendMessage(chatId, `❌ **LOSS!** -${betAmt} | Total: ${data.sessionProfit.toFixed(0)}`);
                        }
                    }
                }

                const decision = getDecision(history, data.formula);
                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const currentBetAmt = data.betPlan[data.step];

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": currentBetAmt,
                    "betCount": 7,
                    "gameType": 2,
                    "selectType": (decision === "Big" ? 13 : 14),
                    "language": 7
                };

                const betRes = await callApi("GameBetting", betPayload, data.token);
                
                data.last_pred = decision; 
                data.last_issue = currIssue;

                if (betRes && betRes.msgCode === 0) {
                    bot.sendMessage(chatId, `✅ **Bet Success**\n🎯 Issue: ${nextIssue.slice(-5)}\n🎲 Pick: ${decision}\n💰 Amount: ${currentBetAmt}\n📈 Profit: ${data.sessionProfit.toFixed(0)}`);
                } else {
                    bot.sendMessage(chatId, `❌ **Bet Failed:** ${betRes ? betRes.msg : "Connection Error"}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

// ========== MAIN BOT ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, 
            sessionProfit: 0, 
            step: 0, 
            betPlan: [10, 30, 90, 270, 830], 
            formula: "SMART", 
            typeId: 30 
        };
    }

    const menu = { 
        reply_markup: { 
            keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile", "⚙️ Setup"], ["/start"]], 
            resize_keyboard: true 
        } 
    };

    if (text === '/start') {
        return bot.sendMessage(chatId, 
            "🤖 **BigWin Pro Console v6.6**\n\n" +
            "**Login ဝင်ရန်:**\n" +
            "1️⃣ ဖုန်းနံပါတ် (959xxxxxxx ပုံစံ)\n" +
            "2️⃣ စကားဝှက်\n\n" +
            "ဥပမာ: `959696740902`\n\n" +
            "**ဖုန်းနံပါတ်ပို့ပါ:**", 
            { reply_markup: { remove_keyboard: true } }
        );
    }

    if (text === "💰 My Profile") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            return bot.sendMessage(chatId, `👤 ID: ${info.data.userId}\n💵 Balance: ${info.data.amount} ကျပ်`);
        }
        return bot.sendMessage(chatId, "❌ Balance ရယူလို့မရပါ။");
    }

    if (text === "⚙️ Setup") {
        const setKB = { 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: "🧬 Formula: " + user_db[chatId].formula, callback_data: "cycle" }],
                    [{ text: "🕒 Mode: " + (user_db[chatId].typeId === 30 ? "30s" : "1min"), callback_data: "mode" }]
                ]
            }
        };
        return bot.sendMessage(chatId, "⚙️ **Settings**\n\nPlan ပြင်ရန်: `plan 10,30,90,270`", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot သည် အလုပ်လုပ်နေဆဲပါ။");
        
        user_db[chatId].running = true;
        user_db[chatId].sessionProfit = 0;
        user_db[chatId].step = 0;
        user_db[chatId].last_issue = "";
        user_db[chatId].last_pred = null;
        monitoringLoop(chatId);
        return bot.sendMessage(chatId, "🚀 **Auto-Betting စတင်ပါပြီ!**", menu);
    }

    if (text === "🛑 Stop Auto") {
        user_db[chatId].running = false;
        return bot.sendMessage(chatId, "🛑 Bot ရပ်နားပါပြီ။", menu);
    }

    if (text.startsWith("plan ")) {
        const plan = text.replace("plan ", "").split(",").map(Number);
        if (plan.length > 0 && plan.every(n => n > 0)) {
            user_db[chatId].betPlan = plan;
            user_db[chatId].step = 0;
            return bot.sendMessage(chatId, `✅ Bet Plan: ${plan.join(", ")} MMK`);
        }
    }

    // ========== LOGIN WITH CORRECT PAYLOAD ==========
    
    // Step 1: Get phone number
    if (!user_db[chatId].token && !user_db[chatId].awaitingPassword) {
        let cleanPhone = text.replace(/[^0-9]/g, '');
        
        // Must start with 95 and be 12 digits
        if (cleanPhone.length === 12 && cleanPhone.startsWith('95')) {
            user_db[chatId].tempPhone = cleanPhone;
            user_db[chatId].awaitingPassword = true;
            return bot.sendMessage(chatId, "🔐 **စကားဝှက်ပို့ပါ:**");
        } else {
            bot.sendMessage(chatId, "❌ ဖုန်းနံပါတ်ပုံစံမှားပါသည်။\n\nဥပမာ: `959696740902`");
            return;
        }
    }
    
    // Step 2: Get password and login
    if (user_db[chatId].awaitingPassword && !user_db[chatId].token) {
        const phone = user_db[chatId].tempPhone;
        const password = text;
        
        bot.sendMessage(chatId, "⏳ Login လုပ်နေပါသည်...");
        
        // Use the correct login function
        const loginRes = await doLogin(phone, password);
        
        console.log("Login Result:", JSON.stringify(loginRes));
        
        if (loginRes?.msgCode === 0 && loginRes?.data?.token) {
            user_db[chatId].token = loginRes.data.tokenHeader + loginRes.data.token;
            user_db[chatId].userId = loginRes.data.userId;
            delete user_db[chatId].tempPhone;
            delete user_db[chatId].awaitingPassword;
            
            bot.sendMessage(chatId, "✅ **Login အောင်မြင်ပါပြီ!**\n\n🚀 Start Auto နှိပ်ပါ။", menu);
            
            // Show balance
            const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
            if (info?.msgCode === 0) {
                bot.sendMessage(chatId, `💰 **Balance:** ${info.data.amount} MMK`);
            }
        } else {
            delete user_db[chatId].tempPhone;
            delete user_db[chatId].awaitingPassword;
            
            let errorMsg = "❌ **Login မှားယွင်းနေပါသည်။**\n\n";
            errorMsg += "**စစ်ဆေးရန်:**\n";
            errorMsg += `• ဖုန်းနံပါတ်: \`${phone}\`\n`;
            errorMsg += "• စကားဝှက်: မှန်ကန်သလား\n\n";
            errorMsg += "**Website မှာ ဝင်ကြည့်ပါ။**\n";
            errorMsg += "အဲဒီအကောင့်နဲ့ ဝင်လို့ရလား စစ်ပါ။\n\n";
            errorMsg += "/start ပြန်လုပ်ပါ။";
            
            bot.sendMessage(chatId, errorMsg);
        }
    }
});

// Callback handlers
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
        bot.answerCallbackQuery(q.id, { text: `Formula: ${user_db[chatId].formula}` });
    } else if (q.data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
        bot.answerCallbackQuery(q.id, { text: `Mode: ${user_db[chatId].typeId === 30 ? "30s" : "1min"}` });
    }
    bot.sendMessage(chatId, `🔄 Updated: Formula=${user_db[chatId].formula}, Mode=${user_db[chatId].typeId === 30 ? "30s" : "1min"}`);
});

console.log('🤖 BigWin Pro Console v6.6 Started!');
console.log('📱 Phone format: 95xxxxxxxxx (12 digits)');
console.log('🔐 Using phonetype: 1, deviceId: auto-generated');
