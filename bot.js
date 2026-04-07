‎const TelegramBot = require('node-telegram-bot-api');
‎const axios = require('axios');
‎const crypto = require('crypto');
‎const http = require('http');
‎
‎// Render Alive Fix
‎http.createServer((req, res) => { res.end('WinGo v81: Final Manual Flow'); }).listen(process.env.PORT || 8080);
‎
‎const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
‎const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
‎const bot = new TelegramBot(token, { polling: true });
‎
‎let user_db = {};
‎
‎// --- 🛡️ Security Logic ---
‎function generateRandomKey() {
‎    return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
‎        let r = Math.random() * 16 | 0;
‎        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
‎    });
‎}
‎
‎function signMd5(payload) {
‎    const { signature, timestamp, ...rest } = payload;
‎    const sortedKeys = Object.keys(rest).sort();
‎    let sortedObj = {};
‎    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
‎    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
‎    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
‎}
‎
‎async function callApi(endpoint, data, authToken = null) {
‎    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
‎    payload.signature = signMd5(payload);
‎    const headers = { 
‎        "Content-Type": "application/json;charset=UTF-8", 
‎        "Authorization": authToken || "",
‎        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
‎        "Referer": "https://bigwinqaz.com/",
‎        "Origin": "https://bigwinqaz.com"
‎    };
‎    try {
‎        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
‎        return res.data;
‎    } catch (e) { return null; }
‎}
‎
‎// --- 🧠 AI Intelligence ---
‎function runAI(history) {
‎    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
‎    const last3 = resArr.slice(0, 3).reverse().join('-');
‎    const last = resArr[0];
‎    
‎    let dragon = 1;
‎    for(let i=0; i<resArr.length-1; i++) { 
‎        if(resArr[i] === resArr[i+1]) dragon++; 
‎        else break; 
‎    }
‎
‎    let side = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");
‎    let pattern = (dragon >= 3) ? "Dragon Follow 🐉" : "Trend Mirror 🔄";
‎    
‎    return { side, dragon, calc: last3, pattern };
‎}
‎
‎// --- 🚀 Monitoring & Signal Generator ---
‎async function monitoringLoop(chatId) {
‎    while (user_db[chatId]?.running) {
‎        const data = user_db[chatId];
‎        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
‎        
‎        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
‎            const history = res.data.list;
‎            const lastRound = history[0];
‎
‎            if (lastRound.issueNumber !== data.last_issue) {
‎                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
‎
‎                // 1️⃣ အရင်ပွဲရဲ့ Result ကို အရင်ပို့ပေးမည်
‎                if (data.last_pred) {
‎                    const isWin = data.last_pred === realSide;
‎                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
‎                    
‎                    // Bet History Update
‎                    data.betHistory.forEach(bet => {
‎                        if (bet.issue === lastRound.issueNumber.slice(-5) && bet.status === "⏳ Pending") {
‎                            bet.status = isWin ? "✅ WIN" : "❌ LOSS";
‎                        }
‎                    });
‎
‎                    // AI Logs Update (၅၀ ပွဲမှတ်တမ်းအတွက်)
‎                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
‎                    if (data.aiLogs.length > 50) data.aiLogs.pop();
‎
‎                    // Result Message ပို့ခြင်း
‎                    let resultMsg = `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${realSide.toUpperCase()}(${lastRound.number})\n\n`;
‎                    
‎                    // နိုင်/ရှုံး မှတ်တမ်းအကျဉ်း (နောက်ဆုံး 50 ပွဲ)
‎                    resultMsg += `📜 **နောက်ဆုံးရလဒ်များ**\n------------------\n`;
‎                    data.betHistory.slice(0, 50).forEach(h => {
‎                        resultMsg += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`;
‎                    });
‎
‎                    await bot.sendMessage(chatId, resultMsg);
‎                }
‎
‎                // 2️⃣ ပွဲစဉ်အသစ်အတွက် AI Signal တွက်ပြီး ဆက်ပြမည်
‎                const ai = runAI(history);
‎                data.last_issue = lastRound.issueNumber;
‎                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
‎                data.last_pred = ai.side;
‎
‎                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
‎                const nextMsg = `🚀 **AI Signal Analysis**\n━━━━━━━━━━━━━━━━\n📚တွက်ချက်ပုံစံ: \`${ai.calc}\`\n🧠 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`95%\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\``;
‎
‎                await bot.sendMessage(chatId, nextMsg, {
‎                    reply_markup: { 
‎                        inline_keyboard: [[
‎                            { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
‎                            { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
‎                        ]]
‎                    }
‎                });
‎            }
‎        }
‎        await new Promise(r => setTimeout(r, 4000));
‎    }
‎}
‎
‎// --- 📱 UI & Message Handlers ---
‎bot.on('message', async (msg) => {
‎    const chatId = msg.chat.id;
‎    const text = msg.text;
‎    if (!user_db[chatId]) user_db[chatId] = { running: false, aiLogs: [], betHistory: [] };
‎
‎    // Betting Amount Logic
‎    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
‎        const amount = parseInt(text);
‎        const data = user_db[chatId];
‎        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
‎        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;
‎
‎        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
‎        if (baseUnit < 10) baseUnit = 10;
‎
‎        const betPayload = {
‎            typeId: 30, issuenumber: targetIssue, gameType: 2,
‎            amount: Math.floor(baseUnit),
‎            betCount: Math.floor(amount / baseUnit),
‎            selectType: data.pendingSide === "Big" ? 13 : 14,
‎            isAgree: true
‎        };
‎
‎        const res = await callApi("GameBetting", betPayload, data.token);
‎        if (res && (res.msgCode === 0 || res.msg === "Bet success")) {
‎            bot.sendMessage(chatId, `✅ **${data.pendingSide}** မှာ **${amount}** MMK ထိုးပြီးပါပြီ။\n🕒 ပွဲစဉ်: ${targetIssue.slice(-5)}`);
‎            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending" });
‎        } else {
‎            bot.sendMessage(chatId, `❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${res ? res.message : "Error"}\``);
‎        }
‎        data.pendingSide = null; return;
‎    }
‎
‎    const menu = { reply_markup: { keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "🚪 Logout"]], resize_keyboard: true } };
‎
‎    if (text === '/start') {
‎        user_db[chatId] = { running: false, aiLogs: [], betHistory: [], token: null };
‎        return bot.sendMessage(chatId, "🤖 **WinGo VIP Master v81.0**\nဖုန်းနံပါတ် ပေးပါ:", menu);
‎    }
‎
‎    if (text === "📈 AI History") {
‎        let txt = "📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၅၀ ပွဲ)**\n------------------\n";
‎        user_db[chatId].aiLogs.forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
‎        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
‎    }
‎
‎    if (text === "📊 Website (100)") {
‎        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
‎        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
‎        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'B':'S'})\n`; });
‎        return bot.sendMessage(chatId, list);
‎    }
‎
‎    if (text === "📜 Bet History") {
‎        let txt = "📜 **နိုင်/ရှုံး မှတ်တမ်း**\n------------------\n";
‎        user_db[chatId].betHistory.slice(0, 20).forEach(h => { txt += `${h.status} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} MMK\n`; });
‎        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
‎    }
‎
‎    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
‎        user_db[chatId].tempPhone = text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
‎    }
‎    
‎    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
‎        const username = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
‎        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
‎        if (res?.msgCode === 0) {
‎            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
‎            user_db[chatId].running = true;
‎            monitoringLoop(chatId);
‎            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ VIP Signal စောင့်ကြည့်နေပါသည်-", menu);
‎        } else {
‎            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။");
‎            user_db[chatId].tempPhone = null;
‎        }
‎    }
‎});
‎
‎bot.on('callback_query', (query) => {
‎    const chatId = query.message.chat.id;
‎    user_db[chatId].pendingSide = query.data.split('_')[1];
‎    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
‎});
‎
