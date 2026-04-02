const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Render Keep Alive Server ---
http.createServer((req, res) => {
  res.write('AI Bot is Running!');
  res.end();
}).listen(process.env.PORT || 8080);

// --- Configuration ---
const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Helper Functions ---
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
  } catch (error) {
    return null;
  }
}

// --- AI Brains Strategy ---
function aiBrainConsensus(history) {
  const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = results[0];
  let votes = { Big: 0, Small: 0 };

  // Logic 1: Opposite
  votes[lastVal === "Big" ? "Small" : "Big"] += 1;
  // Logic 2: Double Pattern
  if (JSON.stringify(results.slice(0, 2)) === JSON.stringify(["Big", "Big"])) votes.Small += 1;
  else if (JSON.stringify(results.slice(0, 2)) === JSON.stringify(["Small", "Small"])) votes.Big += 1;
  // Logic 3: Triple
  if (results.slice(0, 3).every(v => v === "Big")) votes.Small += 1;
  else if (results.slice(0, 3).every(v => v === "Small")) votes.Big += 1;
  // Logic 4: Dragon
  if (results.slice(0, 4).every(v => v === "Big")) votes.Big += 2;
  else if (results.slice(0, 4).every(v => v === "Small")) votes.Small += 2;

  const finalDecision = votes.Big > votes.Small ? "Big" : "Small";
  const confidence = Math.round((Math.max(votes.Big, votes.Small) / (votes.Big + votes.Small)) * 100);
  return { finalDecision, confidence };
}

// --- Monitoring Loop ---
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

        const nextIssue = BigInt(currIssue) + 1n;
        const msg = `🔔 **AI Update - Issue: ${nextIssue}**\n🧠 AI Consensus: **${finalDecision}**\n📈 Confidence: \`${confidence}%\` (ဦးနှောက် ၁၀ ခု၏ ဆုံးဖြတ်ချက်)\n💡 *Markov Chain စနစ်ဖြင့် စစ်ဆေးပြီးပါပြီ*`;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}

// --- Handlers ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  delete user_db[chatId];
  bot.sendMessage(chatId, "🤖 **BigWin AI Pro (Node.js)**\n\nLogin ဝင်ရန် ဖုန်းနံပါတ်ပေးပါ (09xxx):");
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (/^\d{9,}$/.test(text) && !user_db[chatId]) {
    user_db[chatId] = { phone: text, running: false, predictions: [] };
    bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
  } else if (user_db[chatId] && !user_db[chatId].token && !text.startsWith('/')) {
    const payload = { phonetype: -1, language: 0, logintype: "mobile", username: "95" + user_db[chatId].phone.replace(/^0/, ''), pwd: text };
    const res = await callApi("Login", payload);

    if (res && res.msgCode === 0) {
      user_db[chatId].token = `${res.data.tokenHeader}${res.data.token}`;
      user_db[chatId].id = res.data.userId || "N/A";
      const opts = { reply_markup: { keyboard: [["🚀 Start AI", "🛑 Stop AI"], ["📊 Results History", "🧠 Prediction History"], ["💰 Account Info"]], resize_keyboard: true } };
      bot.sendMessage(chatId, `✅ **Login အောင်မြင်ပါသည်**\n🆔 ID: ${user_db[chatId].id}`, opts);
    } else {
      delete user_db[chatId];
      bot.sendMessage(chatId, "❌ Login မှားယွင်းနေပါသည်။ /start ပြန်လုပ်ပါ။");
    }
  }

  if (text === "🚀 Start AI" && user_db[chatId]?.token && !user_db[chatId].running) {
    user_db[chatId].running = true;
    monitoringLoop(chatId);
    bot.sendMessage(chatId, "🚀 **AI Monitoring စတင်ပါပြီ**");
  } else if (text === "🛑 Stop AI" && user_db[chatId]) {
    user_db[chatId].running = false;
    bot.sendMessage(chatId, "🛑 AI Monitoring ရပ်တန့်လိုက်ပါပြီ။");
  }
});

console.log("--- AI Bot (Node.js) is Online ---");
