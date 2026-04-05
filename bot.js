const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v53: Professional Suite Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security Logic ---
function generateRandomKey() { return crypto.randomUUID().replace(/-/g, ''); }
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32, '0').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
        return res.data;
    } catch (e) { return null; }
}

// --- 🧠 10-Brains with Anti-Dragon Logic ---
function getAIVote(history) {
    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const currentPattern = results.slice(0, 3).reverse().join("-");
    let votes = { B: 0, S: 0, warning: "" };

    // Anti-Dragon Logic (နဂါးတန်းစစ်ဆေးခြင်း)
    let dragonCount = 1;
    for(let i=0; i < results.length - 1; i++) {
        if(results[i] === results[i+1]) dragonCount++;
        else break;
    }

    if (dragonCount >= 5) {
        votes.warning = `⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။ အန္တရာယ်ရှိနိုင်သဖြင့် သတိထားပါ။`;
        votes[results[0] === "Big" ? "B" : "S"] += 6; // နဂါးတန်းအတိုင်းလိုက်ရန် အကြံပြု
    } else if (currentPattern === "Big-Small-Big") { votes.S += 5; }
    else if (currentPattern === "Small-Big-Small") { votes.B += 5; }
    else { votes[results[0] === "Big" ? "S" : "B"] += 2; }

    const finalSide = votes.B > votes.S ? "Big" : "Small";
    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
    return { finalSide, confidence, currentPattern, warning: votes.warning };
}

// --- 🚀 Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);

        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            if (history[0].issueNumber !== data.last_issue) {
                
                // နိုင်/ရှုံး ရလဒ်စာတစ်စောင် သီးသန့်ပို့ခြင်း
                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const resultEmoji = isWin ? "🎉 နိုင် (WIN)" : "❌ ရှုံး (LOSS)";
                    
                    const resultMsg = `✉️ **နိုင်/ရှုံး ရလဒ် အစီရင်ခံစာ**\n` +
                                      `--------------------------\n` +
                                      `📅 ပွဲစဉ်: \`${history[0].issueNumber.slice(-5)}\` \n` +
                                      `🎲 ထွက်ဂဏန်း: \`${history[0].number} (${realSide === "Big" ? "ကြီး" : "သေး"})\`\n` +
                                      `📊 ရလဒ်: **${resultEmoji}**\n` +
                                      `💰 အခြေအနေ: ${isWin ? "အမြတ်ရရှိပါသည်" : "နောက်ပွဲတွင် အဆပွားထိုးပါ"}`;
                    bot.sendMessage(chatId, resultMsg);

                    // Martingale Logic: ရှုံးရင် အဆမြှင့်၊ နိုင်ရင် အရင်းပြန်စ
                    data.currentMultiplier = isWin ? 1 : data.currentMultiplier * 3;
                }

                const ai = getAIVote(history);
                data.last_issue = history[0].issueNumber;
                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
                data.last_pred = ai.finalSide;

                // AI 1 Report (Auto-Martingale ပါဝင်သည်)
                const nextBet = data.lastBetAmount ? data.lastBetAmount * data.currentMultiplier : 1000;
                const reportMsg = `📊 **AI 1: ယုံကြည်မှုစာရင်း**\n` +
                                  `--------------------------\n` +
                                  `📈 တွေ့ရှိပုံစံ: \`${ai.currentPattern}\`\n` +
                                  `🗳️ AI ခန့်မှန်း: **${ai.finalSide === "Big" ? "ကြီး" : "သေး"}**\n` +
                                  `📊 ယုံကြည်မှု: \`${ai.confidence}%\`\n` +
                                  `🕒 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n` +
                                  `${ai.warning ? "\n" + ai.warning : ""}\n\n` +
                                  `💡 **Martingale အကြံပြုချက်:**\n` +
                                  `ယခင်ရှုံးထားပါက \`${nextBet} MMK\` ထိုးရန် အကြံပြုပါသည်။`;

                bot.sendMessage(chatId, reportMsg, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: `🔵 Big (${nextBet})`, callback_data: `bet_Big_${nextBet}` },
                            { text: `🔴 Small (${nextBet})`, callback_data: `bet_Small_${nextBet}` }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- 🎰 Betting Handler ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    const betPayload = { typeId: data.typeId, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        data.lastBetAmount = amount; // Martingale အတွက် သိမ်းဆည်းခြင်း
        const successMsg = `✉️ **ထိုးပွဲ အောင်မြင်မှု အစီရင်ခံစာ**\n` +
                           `--------------------------\n` +
                           `📅 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n` +
                           `🎰 ရွေးချယ်မှု: **${side === "Big" ? "ကြီး" : "သေး"}**\n` +
                           `💰 ပမာဏ: \`${amount} MMK\`\n\n` +
                           `📜 **အားပေးစကား ကဗျာ**\n` +
                           `_"စိတ်ကိုအေးထား အပိုင်ဖမ်း၊ နိုင်ခြေရှိမှ ငွေကိုလှမ်း၊\n` +
                           `စည်းကမ်းရှိတဲ့ ကစားသမား၊ အောင်နိုင်ခြင်းက မင်းအတွက်ပဲဗျား။"_`;
        bot.sendMessage(chatId, successMsg);
    }
}

// --- 📱 User Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!user_db[chatId]) user_db[chatId] = { running: false, currentMultiplier: 1, lastBetAmount: 1000 };

    const menu = { reply_markup: { keyboard: [["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"], ["📊 Result", "🗑️ ဖျက်မည်"]], resize_keyboard: true } };

    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v53 (Professional)\nဖုန်းနံပါတ် ပေးပါ:", menu);
    
    // Login logic (v52 အတိုင်း) ...
    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = msg.text; bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu);
        }
    }

    if (msg.text?.includes("စတင်ရန်")) {
        user_db[chatId].typeId = 30; user_db[chatId].running = true;
        monitoringLoop(chatId); bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu);
    }
    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const [_, side, amount] = query.data.split('_');
    await handleBetting(chatId, side, parseInt(amount));
});
