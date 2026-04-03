const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Keep Alive
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('AI Bot is Running!');
  res.end();
});
server.listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

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
  // ပုံထဲက random key အသစ်ကို အသုံးပြုထားပါတယ်
  payload.random = "b535e220303e4e6e8853dbe9327540d0"; 
  payload.signature = signMd5(payload);
  const headers = { 
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://www.777bigwingame.app",
    "Referer": "https://www.777bigwingame.app/",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  };
  if (authToken) headers["Authorization"] = authToken;
  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 8000 });
    return response.data;
  } catch (error) { return null; }
}

function aiBrainConsensus(history) {
  const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = results[0];
  const isStreak = results.slice(0, 3).every(v => v === lastVal);
  const isChoppy = results[0] !== results[1] && results[1] !== results[2];
  
  let decision = "";
  let pattern = "NORMAL";
  
  if (isStreak) { decision = lastVal; pattern = "🔥 STREAK"; }
  else if (isChoppy) { decision = (lastVal === "Big" ? "Small" : "Big"); pattern = "🔄 CHOPPY"; }
  else { decision = (results.filter(r => r === "Big").length >= 5 ? "Small" : "Big"); }
  
  return { decision, pattern };
}

async function monitoringLoop(chatId) {
  while (user_db[chatId] && user_db[chatId].running) {
    const data = user_db[chatId];
    // typeId ကို 30 (30s) သို့မဟုတ် 1 (1Min) အဖြစ် သတ်မှတ်ပေးပါသည်
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 7, typeId: data.typeId }, data.token);
    
    if (res && res.msgCode === 0 && res.data.list.length > 0) {
      const history = res.data.list;
      const currIssue = history[0].issueNumber;

      if (currIssue !== data.last_issue) {
        if (data.last_pred) {
          const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
          const isWin = data.last_pred === realRes ? "✅ WIN" : "❌ LOSS";
          data.predictions.push(`🔹 [${data.mode}] ${currIssue.slice(-3)} | P: ${data.last_pred} | R: ${realRes} | ${isWin}`);
        }
        const { decision, pattern } = aiBrainConsensus(history);
        data.last_pred = decision;
        data.last_issue = currIssue;
        const nextIssue = (BigInt(currIssue) + 1n).toString();
        bot.sendMessage(chatId, `🔔 **AI [${data.mode}]**\n🎯 Issue: \`${nextIssue.slice(-3)}\`\n🧠 Decision: **${decision}**\n📊 Pattern: \`${pattern}\``, { parse_mode: 'Markdown' });
      }
    }
    // 30s ဆိုရင် ၃ စက္ကန့်၊ 1Min ဆိုရင် ၈ စက္ကန့် စောင့်ပါသည်
    await new Promise(r => setTimeout(r, data.typeId === 30 ? 3000 : 8000));
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const kb = { reply_markup: { keyboard: [["🚀 Run 30s", "🚀 Run 1Min"], ["📊 Results", "🧠 History"], ["🛑 Stop AI", "/start"]], resize_keyboard: true } };

  if (text === '/start') {
    delete user_db[chatId];
    return bot.sendMessage(chatId, "🤖 **BigWin AI Final Fix**\n\nLogin ရန် ဖုန်းနံပါတ်ပေးပါ:", kb);
  }
  if (text === "🚀 Run 30s") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ");
    user_db[chatId].running = true; user_db[chatId].typeId = 30; user_db[chatId].mode = "30s";
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "⚡ 30s AI စတင်ပါပြီ", kb);
  }
  if (text === "🚀 Run 1Min") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ");
    user_db[chatId].running = true; user_db[chatId].typeId = 1; user_db[chatId].mode = "1Min";
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "🕒 1Min AI စတင်ပါပြီ", kb);
  }
  if (text === "🛑 Stop AI") { if (user_db[chatId]) user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 ရပ်လိုက်ပါပြီ", kb); }
  
  if (/^\d{9,11}$/.test(text) && !user_db[chatId]) {
    user_db[chatId] = { phone: text, running: false, predictions: [] };
    return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
  }
  if (user_db[chatId] && !user_db[chatId].token) {
    const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].phone.replace(/^0/, ''), pwd: text });
    if (res && res.msgCode === 0) {
      user_db[chatId].token = `${res.data.tokenHeader}${res.data.token}`;
      return bot.sendMessage(chatId, `✅ Login အောင်မြင်ပါသည်`, kb);
    }
    delete user_db[chatId];
    return bot.sendMessage(chatId, "❌ မှားယွင်းပါသည်။ /start ပြန်လုပ်ပါ။");
  }
});
