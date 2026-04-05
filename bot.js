‎const TelegramBot = require('node-telegram-bot-api');
‎const axios = require('axios');
‎const crypto = require('crypto');
‎const http = require('http');
‎
‎// Server Keep-Alive
‎http.createServer((req, res) => { res.end('WinGo v57: Ultimate Full Suite Active'); }).listen(process.env.PORT || 8080);
‎
‎const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
‎const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
‎const bot = new TelegramBot(token, { polling: true });
‎
‎let user_db = {};
‎
‎// --- 🛡️ Security & API Sign System ---
‎function generateRandomKey() { return crypto.randomUUID().replace(/-/g, ''); }
‎function signMd5(payload) {
‎    const { signature, timestamp, ...rest } = payload;
‎    const sortedKeys = Object.keys(rest).sort();
‎    let sortedObj = {};
‎    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
‎    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
‎    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32, '0').toUpperCase();
‎}
‎
‎async function callApi(endpoint, data, authToken = null) {
‎    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
‎    payload.signature = signMd5(payload);
‎    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
‎    try { const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 }); return res.data; } 
‎    catch (e) { return null; }
‎}
‎
‎// --- 🧠 10-Brains AI Logic ---
‎function getAIVote(history) {
‎    const results = history.slice(0, 20).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
‎    const currentPattern = results.slice(0, 3).reverse().join("-");
‎    let votes = { B: 0, S: 0, brainDetails: [], warning: "" };
‎
‎    // Anti-Dragon Logic
‎    let dragonCount = 1;
‎    for(let i=0; i < results.length - 1; i++) { if(results[i] === results[i+1]) dragonCount++; else break; }
‎
‎    // Brain 1-3: Pattern Expert
‎    if (currentPattern === "Big-Small-Big") { votes.S += 4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)"); }
‎    else if (currentPattern === "Small-Big-Small") { votes.B += 4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)"); }
‎    else { votes.brainDetails.push("🧠 B1-3: Trend Analysis Mode"); }
‎
‎    // Brain 4-6: Dragon Hunter
‎    if (dragonCount >= 4) {
‎        const side = results[0] === "Big" ? "B" : "S";
‎        votes[side] += 5;
‎        votes.warning = `⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။ သတိထားပါ။`;
‎        votes.brainDetails.push(`🧠 B4-6: နဂါးတန်းနောက်လိုက်ရန် (${results[0]})`);
‎    } else { votes.brainDetails.push("🧠 B4-6: တည်ငြိမ်သော Trend"); }
‎
‎    // Brain 7-10: Statistical Mirror
‎    const mirrorSide = results[0] === "Big" ? "Small" : "Big";
‎    votes[mirrorSide === "Big" ? "B" : "S"] += 2;
‎    votes.brainDetails.push(`🧠 B7-10: Mirror Logic (${mirrorSide})`);
‎
‎    const finalSide = votes.B > votes.S ? "Big" : "Small";
‎    const confidence = Math.round((Math.max(votes.B, votes.S) / (votes.B + votes.S)) * 100);
‎    return { finalSide, confidence, currentPattern, brainSummary: votes.brainDetails.join("\n"), warning: votes.warning };
‎}
‎
‎// --- 🚀 Monitoring Loop ---
‎async function monitoringLoop(chatId) {
‎    while (user_db[chatId]?.running) {
‎        const data = user_db[chatId];
‎        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: data.typeId }, data.token);
‎
‎        if (res && res.msgCode === 0 && res.data?.list?.length > 0) {
‎            const history = res.data.list;
‎            if (history[0].issueNumber !== data.last_issue) {
‎                const realSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
‎
‎                // AI Prediction History
‎                if (data.last_pred) { data.aiPredictionLogs.unshift({ status: data.last_pred === realSide ? "✅" : "❌", issue: history[0].issueNumber.slice(-3), pred: data.last_pred }); }
‎
‎                // Betting History Update
‎                data.betHistory.forEach(bet => {
‎                    if (bet.issue === history[0].issueNumber.slice(-5) && bet.status === "⏳ Pending") {
‎                        const isWin = bet.side === realSide;
‎                        bet.status = isWin ? "✅ WIN" : "❌ LOSS";
‎                        data.currentMultiplier = isWin ? 1 : data.currentMultiplier * 3;
‎                        bot.sendMessage(chatId, `✉️ **နိုင်/ရှုံး ရလဒ်**\n📅 ပွဲစဉ်: ${bet.issue}\n🎲 ထွက်ဂဏန်း: ${history[0].number} (${realSide === "Big" ? "ကြီး" : "သေး"})\n📊 ရလဒ်: ${bet.status}\n🔄 အဆင့်: ${data.currentMultiplier}X`);
‎                    }
‎                });
‎
‎                const ai = getAIVote(history);
‎                data.last_issue = history[0].issueNumber;
‎                data.nextIssue = (BigInt(history[0].issueNumber) + 1n).toString();
‎                data.last_pred = ai.finalSide;
‎
‎                const reportMsg = `📊 **AI Prediction**\n----------------\n${ai.brainSummary}\nPattern: ${ai.currentPattern}\nPrediction: ${ai.finalSide}\nConfidence: ${ai.confidence}%\nNext Issue: ${data.nextIssue.slice(-5)}\nMultiplier: ${data.currentMultiplier}X`;
‎                bot.sendMessage(chatId, reportMsg, {
‎                    reply_markup: { inline_keyboard: [[
‎                        { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
‎                        { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
‎                    ]] }
‎                });
‎            }
‎        }
‎        await new Promise(r => setTimeout(r, 4000));
‎    }
‎}
‎
‎// --- 🎰 Betting Handler ---
‎async function handleBetting(chatId, side, amount) {
‎    const data = user_db[chatId];
‎    const betPayload = { typeId: data.typeId, issuenumber: data.nextIssue, gameType: 2, amount: 10, betCount: Math.floor(amount / 10), selectType: side === "Big" ? 13 : 14, isAgree: true };
‎    const res = await callApi("GameBetting", betPayload, data.token);
‎    if (res?.msgCode === 0 || res?.msg === "Bet success") {
‎        const timeMMT = new Date().toLocaleString("my-MM", { timeZone: "Asia/Yangon" });
‎        const successMsg = `✉️ **ထိုးပြီး အစီရင်ခံစာ**\n📅 ပွဲစဉ်: ${data.nextIssue.slice(-5)}\n🎰 ရွေး: ${side}\n💰 ပမာဏ: ${amount} MMK\n🔄 အဆင့်: ${data.currentMultiplier}X`;
‎        bot.sendMessage(chatId, successMsg);
‎        data.betHistory.unshift({ issue: data.nextIssue.slice(-5), side, amount, time, status: "⏳ Pending", mult: data.currentMultiplier });
‎    } else {
‎        bot.sendMessage(chatId, `❌ ထိုးမရပါ။\nအကြောင်းရင်း: ${res?.message || "Server Error"}`);
‎    }
‎}
‎
‎// --- 📱 Menu Buttons ---
‎const menu = { reply_markup: { keyboard: [
‎    ["🚀 ၃၀ စက္ကန့် စတင်ရန်", "🛑 AI ရပ်ရန်"],
‎    ["📊 Website Result", "📈 AI Prediction History"],
‎    ["📜 Betting History", "🗑️ မှတ်တမ်းဖျက်မည်"]
‎], resize_keyboard: true } };
‎
‎// --- 📩 Message Handlers ---
‎bot.on('message', async (msg) => {
‎    const chatId = msg.chat.id;
‎    if (!user_db[chatId]) user_db[chatId] = { running: false, aiPredictionLogs: [], betHistory: [], currentMultiplier: 1 };
‎
‎    if (msg.text === '/start') return bot.sendMessage(chatId, "🤖 WinGo Master v57\nဖုန်းနံပါတ် ပေးပါ:", menu);
‎
‎    // Login flow
‎    if (/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token) { user_db[chatId].tempPhone = msg.text; return bot.sendMessage(chatId, "🔐 Password ပေးပါ:"); }
‎    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
‎        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: "95" + user_db[chatId].tempPhone.replace(/^0/, ''), pwd: msg.text });
‎        if (res?.msgCode === 0) { user_db[chatId].token = res.data.tokenHeader + " " + res.data.token; bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", menu); }
‎        else { bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။"); user_db[chatId].tempPhone = null; }
‎    }
‎
‎    // Start / Stop AI loop
‎    if (msg.text === "🚀 ၃၀ စက္ကန့် စတင်ရန်") { user_db[chatId].typeId = 30; user_db[chatId].running = true; monitoringLoop(chatId); bot.sendMessage(chatId, "🚀 AI စတင်ပါပြီ။", menu); }
‎    if (msg.text === "🛑 AI ရပ်ရန်") { user_db[chatId].running = false; bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ။"); }
‎
‎    // History views
‎    if (msg.text === "📊 Website Result") {
‎        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, typeId: user_db[chatId].typeId || 30 }, user_db[chatId].token);
‎        let txt = "📊 နောက်ဆုံးရလဒ်များ\n";
‎        res?.data?.list?.forEach(i => { txt += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number) >= 5 ? "ကြီး" : "သေး"})\n`; });
‎        bot.sendMessage(chatId, txt);
‎    }
‎
‎    if (msg.text === "📈 AI Prediction History") {
‎        let txt = "📈 AI Prediction History\n\n";
‎        user_db[chatId].aiPredictionLogs.slice(0, 15).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ခန့်မှန်း: ${l.pred}\n`; });
‎        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိသေးပါ။");
‎    }
‎
‎    if (msg.text === "📜 Betting History") {
‎        let txt = "📜 Betting History\n\n";
‎        user_db[chatId].betHistory.slice(0, 10).forEach(h => { txt += `🔹 ပွဲ: ${h.issue} | ${h.status}\n💰 ${h.amount} MMK (${h.mult}X)\n⏰ ${timeMMT}\n\n`; });
‎        bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိသေးပါ။");
‎    }
‎
‎    if (msg.text === "🗑️ မှတ်တမ်းဖျက်မည်") { user_db[chatId].aiPredictionLogs = []; user_db[chatId].betHistory = []; bot.sendMessage(chatId, "✅ မှတ်တမ်းများ ဖျက်လိုက်ပါပြီ။"); }
‎
‎    // Pending bet amount input
‎    if (user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)) { await handleBetting(chatId, user_db[chatId].pendingSide, parseInt(msg.text)); user_db[chatId].pendingSide = null; }
‎});
‎
‎// --- 📌 Inline Button Handlers ---
‎bot.on('callback_query', (query) => {
‎    const chatId = query.message.chat.id;
‎    user_db[chatId].pendingSide = query.data.split('_')[1];
‎    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
‎});
‎
