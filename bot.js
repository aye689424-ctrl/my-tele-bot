const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

http.createServer((req, res) => { res.end('BigWin Pro Console v7.0 Active'); }).listen(process.env.PORT || 8080);

const token = '8676836403:AAF-3RPr09Um45gDtI74YfnA05lsMnMnIQ8';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

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
        return res.data;
    } catch (e) { 
        return { msgCode: -1, msg: "Network Error" }; 
    }
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
                        } else {
                            data.sessionProfit -= betAmt;
                            data.step = (data.step + 1) % data.betPlan.length;
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
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

// ========== ခင်ဗျား အရင် Code အတိုင်း LOGIN (အတိအကျ) ==========
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
            "🤖 **BigWin Pro Console**\n\n" +
            "- အရင်ဆုံး ဖုန်းနံပါတ် 09... ရိုက်ပို့ပြီး Login ဝင်ပါ။\n" +
            "- ပြီးရင် `Start Auto` ကို နှိပ်ပါဗျ။", 
            menu
        );
    }

    if (text === "💰 My Profile") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) {
            return bot.sendMessage(chatId, `👤 ID: ${info.data.userId}\n💵 Balance: ${info.data.amount} ကျပ်`);
        }
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပေးပါ။");
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
        return bot.sendMessage(chatId, "⚙️ **Settings Console**\n\nPlan ပြင်ရန်: `plan 10,30,90,270` ဟု ရိုက်ပို့ပါ။", setKB);
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        if (user_db[chatId].running) return bot.sendMessage(chatId, "⚠️ Bot သည် အလုပ်လုပ်နေဆဲဖြစ်ပါသည်။");
        
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
        return bot.sendMessage(chatId, "🛑 Bot ကို ရပ်တန့်လိုက်ပါပြီ။", menu);
    }

    if (text.startsWith("plan ")) {
        user_db[chatId].betPlan = text.replace("plan ", "").split(",").map(Number);
        return bot.sendMessage(chatId, "✅ Bet Plan ကို အသစ်ပြင်ဆင်လိုက်ပါပြီ။");
    }

    // ========== ခင်ဗျား အရင် Code အတိုင်း LOGIN LOGIC (အတိအကျ) ==========
    // Login logic
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text;
        return bot.sendMessage(chatId, "🔐 Password ရိုက်ပို့ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { 
            phonetype: -1, 
            language: 7, 
            logintype: "mobile", 
            username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), 
            pwd: text 
        });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + res.data.token;
            delete user_db[chatId].tempPhone;
            return bot.sendMessage(chatId, "✅ Login အောင်မြင်ပါပြီ။ `Start Auto` နှိပ်နိုင်ပါပြီ။", menu);
        }
        delete user_db[chatId].tempPhone;
        return bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ /start ပြန်လုပ်ပါ။");
    }
});

// Callback handlers
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cycle") {
        const f = ["SMART", "FOLLOW", "OPPOSITE", "RANDOM"];
        user_db[chatId].formula = f[(f.indexOf(user_db[chatId].formula) + 1) % f.length];
    } else if (q.data === "mode") {
        user_db[chatId].typeId = user_db[chatId].typeId === 30 ? 1 : 30;
    }
    bot.answerCallbackQuery(q.id);
    bot.sendMessage(chatId, "🔄 Setting ကို Update လုပ်လိုက်ပါပြီ။");
});

console.log('🤖 BigWin Pro Console v7.0 Started!');
console.log('✅ Using your original login method');
