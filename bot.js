const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('AI Bot is Running!');
  res.end();
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

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
  payload.random = "b05034ba4a2642009350ee863f29e2e9";
  payload.signature = signMd5(payload);
  const headers = { "Content-Type": "application/json;charset=UTF-8" };
  if (authToken) headers["Authorization"] = authToken;
  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 });
    return response.data;
  } catch (error) { return null; }
}

function aiBrainConsensus(history) {
  const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = results[0];
  let votes = { Big: 0, Small: 0 };
  votes[lastVal === "Big" ? "Small" : "Big"] += 1;
  if (results.slice(0, 2).every(v => v === results[0])) votes[results[0] === "Big" ? "Small" : "Big"] += 1;
  const finalDecision = votes.Big > votes.Small ? "Big" : "Small";
  const confidence = Math.round((Math.max(votes.Big, votes.Small) / (votes.Big + votes.Small || 1)) * 100);
  return { finalDecision, confidence };
}

async function monitoringLoop(chatId) {
  while (user_db[chatId] && user_db[chatId].running) {
    const data = user_db[chatId];
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 0, typeId: 1 }, data.token);
    if (res && res.msgCode === 0) {
      const history = res.data.list;
      const currIssue = history[0].issueNumber;
      if (currIssue !== data.last_issue) {
        if (data.last_pred) {
          const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
          const isWin = data.last_pred === realRes ? "✅ WIN" : "❌ LOSS";
          data.predictions.push(`🔹 Issue: ${currIssue.slice(-3)} | P: ${data.last_pred} | R: ${realRes} | ${isWin}`);
        }
        const { finalDecision, confidence } = aiBrainConsensus(history);
        data.last_pred = finalDecision;
        data.last_issue = currIssue;
        const nextIssue = (BigInt(currIssue) + 1n).toString();
        bot.sendMessage(chatId, `🔔 **AI Update - Issue: ${nextIssue}**\n🧠 AI Consensus: **${finalDecision}**\n📈 Confidence: \`${confidence}%\`\n💡 *စနစ်က ပုံစံများကို စစ်ဆေးပြီးပါပြီ*`, { parse_mode: 'Markdown' });
      }
    }
    await new Promise(r => setTimeout(r, 15000));
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;
  if (text === '/start') {
    delete user_db[chatId];
    return bot.sendMessage(chatId, "🤖 **BigWin AI Pro**\n\nLogin ဝင်ရန် ဖုန်းနံပါတ်ပေးပါ (09xxx):");
  }
  if (text === "📊 Results History") {
    const data = user_db[chatId];
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 0, typeId: 1 }, data?.token);
    if (res && res.msgCode === 0) {
      let txt = "📊 **Game Results (Last 15)**\n\n";
      res.data.list.forEach(i => {
        let n = parseInt(i.number);
        txt += `▪️ ${i.issueNumber.slice(-3)} ➡️ ${n} (${n >= 5 ? 'Big' : 'Small'})\n`;
      });
      return bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    }
    return bot.sendMessage(chatId, "❌ အချက်အလက်ယူမရပါ။");
  }
  if (text === "🧠 Prediction History") {
    const logs = user_db[chatId]?.predictions || [];
    if (logs.length === 0) return bot.sendMessage(chatId, "မှတ်တမ်းမရှိသေးပါ။");
    return bot.sendMessage(chatId, "🧠 **AI Log (Last 15)**\n\n" + logs.slice(-15).join("\n"));
  }
  if (text === "🚀 Start AI") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ။");
    user_db[chatId].running = true;
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "🚀 **AI Monitoring စတင်ပါပြီ**");
  }
  if (text === "🛑 Stop AI") {
    if (user_db[chatId]) user_db[chatId].running = false;
    return bot.sendMessage(chatId, "🛑 AI Monitoring ရပ်တန့်လိုက်ပါပြီ။");
  }
  if (/^\d{9,11}$/.test(text) && !user_db[chatId]) {
    user_db[chatId] = { phone: text, running: false, predictions: [] };
    return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
  }
  if (user_db[chatId] && !user_db[chatId].token) {
    const payload = { phonetype: -1, language: 0, logintype: "mobile", username: "95" + user_db[chatId].phone.replace(/^0/, ''), pwd: text };
    const res = await callApi("Login", payload);
    if (res && res.msgCode === 0) {
      user_db[chatId].token = `${res.data.tokenHeader}${res.data.token}`;
      const opts = { reply_markup: { keyboard: [["🚀 Start AI", "🛑 Stop AI"], ["📊 Results History", "🧠 Prediction History"]], resize_keyboard: true } };
      return bot.sendMessage(chatId, `✅ **Login အောင်မြင်ပါသည်**`, opts);
    }
    delete user_db[chatId];
    return bot.sendMessage(chatId, "❌ Password မှားယွင်းပါသည်။ /start ပြန်လုပ်ပါ။");
  }
});
