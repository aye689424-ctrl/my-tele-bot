const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('Sakuna Logic Node v7.0 Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/"; // သင့်မူလ URL အဟောင်းကိုပဲ ပြန်သုံးထားပါတယ်
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

function signMd5(data) {
    let temp = { ...data };
    delete temp.signature; delete temp.timestamp;
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 20000 });
        return res.data;
    } catch (e) { return { msgCode: -1, msg: "Network Busy" }; }
}

async function monitoringLoop(chatId) {
    // သင်ပေးတဲ့ Code ထဲက Bet Plan အတိုင်း
    const bets = [100, 300, 700, 1600, 3200, 7600, 16000, 32000];

    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const currIssue = history[0].issueNumber;

            if (currIssue !== data.last_issue) {
                // အနိုင်အရှုံး စစ်ဆေးပြီး step တိုးခြင်း
                if (data.last_pred) {
                    const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                    if (data.last_pred === realRes) { data.step = 0; } 
                    else { data.step = (data.step + 1) % bets.length; }
                }

                const nextIssue = (BigInt(currIssue) + 1n).toString();
                const amount = bets[data.step];

                // 🔥 သင်ပေးတဲ့ Logic အတိုင်း: Even index = 13 (BIG), Odd index = 14 (SMALL)
                const selectType = (data.step % 2 === 0) ? 13 : 14;
                const betName = (selectType === 13) ? "BIG" : "SMALL";

                const betPayload = {
                    "typeId": data.typeId,
                    "issuenumber": nextIssue,
                    "amount": 100, // Fixed unit per Python script
                    "betCount": Math.floor(amount / 100), // Python code logic
                    "gameType": 2,
                    "selectType": selectType,
                    "language": 7
                };

                const betRes = await callApi("AddOrder", betPayload, data.token);
                data.last_pred = betName; 
                data.last_issue = currIssue;

                if (betRes?.msgCode === 0) {
                    bot.sendMessage(chatId, `✅ **Sakuna Bet OK**\n🎯 Issue: ${nextIssue.slice(-5)}\n🎲 Pick: **${betName}**\n💰 Amount: ${amount}`);
                } else {
                    bot.sendMessage(chatId, `❌ **Fail:** ${betRes?.msg || "Error"}`);
                }
            }
        }
        await new Promise(r => setTimeout(r, 4500));
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id; const text = msg.text;
    if (!user_db[chatId]) user_db[chatId] = { running: false, step: 0, typeId: 30 };
    const menu = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["💰 My Profile"], ["/start"]], resize_keyboard: true } };

    if (text === '/start') return bot.sendMessage(chatId, "🤖 **Sakuna Logic Bot v7.0**\nဖုန်းနံပါတ်ပို့ပြီး Login ဝင်ပါဗျ။", menu);

    if (text === "💰 My Profile") {
        const info = await callApi("GetUserInfo", {}, user_db[chatId].token);
        if (info?.msgCode === 0) return bot.sendMessage(chatId, `👤 ID: ${info.data.userId}\n💵 Bal: ${info.data.amount} ကျပ်`);
        return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
    }

    if (text === "🚀 Start Auto") {
        if (!user_db[chatId].token) return bot.sendMessage(chatId, "❌ Login အရင်ဝင်ပါ။");
        user_db[chatId].running = true; monitoringLoop(chatId);
        return bot.sendMessage(chatId, "🚀 **Sakuna Logic စတင်ပါပြီ!**");
    }

    if (text === "🛑 Stop Auto") { user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }

    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) { user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပို့ပါ:"); }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: text });
        if (res?.msgCode === 0) { user_db[chatId].token = res.data.tokenHeader + res.data.token; return bot.sendMessage(chatId, "✅ Login Success!", menu); }
        return bot.sendMessage(chatId, "❌ Password မှားနေပါတယ်။");
    }
});
