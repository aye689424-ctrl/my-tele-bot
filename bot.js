const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Render Keep Alive Server (PORT Fix) ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('AI Bot is Running!');
  res.end();
}).listen(process.env.PORT || 8080, "0.0.0.0", () => {
  console.log("Keep-alive server is listening...");
});

// --- Configuration ---
const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

// Polling Error ကို ကာကွယ်ရန်
const bot = new TelegramBot(token, { 
  polling: {
    autoStart: true,
    params: { timeout: 10 }
  } 
});

let user_db = {};

// --- Helper Functions ---
function signMd5(data) {
  try {
    let temp = { ...data };
    delete temp.signature;
    delete temp.timestamp;
    
    const sortedKeys = Object.keys(temp).sort();
    let sortedData = {};
    sortedKeys.forEach(key => { sortedData[key] = temp[key]; });
    
    const jsonStr = JSON.stringify(sortedData).replace(/ /g, '');
    return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
  } catch (e) {
    return "";
  }
}

async function callApi(endpoint, payload, authToken = null) {
  payload.timestamp = Math.floor(Date.now() / 1000);
  payload.random = "b05034ba4a2642009350ee863f29e2e9";
  payload.signature = signMd5(payload);

  const headers = { 
    "Content-Type": "application/json;charset=UTF-8",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"
  };
  if (authToken) headers["Authorization"] = authToken;

  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 });
    return response.data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error.message);
    return null;
  }
}

// --- AI Brains Strategy ---
function aiBrainConsensus(history) {
  if (!history || history.length < 5) return { finalDecision: "Small", confidence: 50 };
  
  const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = results[0];
  let votes = { Big: 0, Small: 0 };

  votes[lastVal === "Big" ? "Small" : "Big"] += 1;
  if (results[0] === results[1]) votes[results[0] === "Big" ? "Small" : "Big"] += 1;
  if (results.slice(0, 3).every(v => v === results[0])) votes[results[0] === "Big" ? "Small" : "Big"] += 2;
  
  const finalDecision = votes.Big > votes.Small ? "Big" : "Small";
  const confidence = Math.round((Math.max(votes.Big, votes.Small) / (votes.Big + votes.Small || 1)) * 100);
  return { finalDecision, confidence };
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId) {
  console.log(`Monitoring started for ${chatId}`);
  while (user_db[chatId] && user_db[chatId].running) {
    try {
      const data = user_db[chatId];
      const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 0, typeId: 1 }, data.token);

      if (res && res.msgCode === 0 && res.data && res.data.list) {
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
          const msg = `🔔 **AI Update - Issue: ${nextIssue}**\n🧠 AI Consensus: **${finalDecision}**\n📈 Confidence: \`${confidence}%\`\n💡 *စနစ်က ပုံစံများကို စစ်ဆေးပြီးပါပြီ*`;
          bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("Loop Error:", e.message);
    }
    await new Promise(resolve => setTimeout(resolve, 20000)); // 20s delay
  }
}

// --- Handlers ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  user_db[chatId] = { running: false, predictions: [], phone: null, token: null };
  bot.sendMessage(chatId, "🤖 **BigWin AI Pro Online**\n\nLogin ဝင်ရန် ဖုန်းနံပါတ်ပေးပါ (09xxx):");
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  if (/^\d{9,11}$/.test(text) && (!user_db[chatId] || !user_db[chatId].phone)) {
    user_db[chatId] = { phone: text, running: false, predictions: [] };
    bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
  } 
  else if (user_db[chatId] && user_db[chatId].phone && !user_db[chatId].token) {
    bot.sendMessage(chatId, "⏳ Login ဝင်နေပါသည်...");
    const payload = { phonetype: -1, language: 0, logintype: "mobile", username: "95" + user_db[chatId].phone.replace(/^0/, ''), pwd: text };
    const res = await callApi("Login", payload);

    if (res && res.msgCode === 0) {
      user_db[chatId].token = `${res.data.tokenHeader}${res.data.token}`;
      const opts = { reply_markup: { keyboard: [["🚀 Start AI", "🛑 Stop AI"], ["📊 Results History", "🧠 Prediction History"]], resize_keyboard: true } };
      bot.sendMessage(chatId, `✅ **Login အောင်မြင်ပါသည်**\nAI စနစ်ကို စတင်နိုင်ပါပြီ။`, opts);
    } else {
      bot.sendMessage(chatId, `❌ Login မှားယွင်းပါသည်: ${res ? res.message : "Server Error"}\n/start ကို ပြန်နှိပ်ပါ။`);
      delete user_db[chatId];
    }
  }

  if (text === "🚀 Start AI") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "ဦးစွာ Login ဝင်ပေးပါ။");
    if (user_db[chatId].running) return bot.sendMessage(chatId, "AI အလုပ်လုပ်နေပြီသားပါ။");
    user_db[chatId].running = true;
    monitoringLoop(chatId);
    bot.sendMessage(chatId, "🚀 **AI Monitoring စတင်ပါပြီ**");
  } 
  else if (text === "🛑 Stop AI") {
    if (user_db[chatId]) user_db[chatId].running = false;
    bot.sendMessage(chatId, "🛑 AI Monitoring ရပ်တန့်လိုက်ပါပြီ။");
  }
  else if (text === "🧠 Prediction History") {
    const logs = user_db[chatId]?.predictions || [];
    bot.sendMessage(chatId, logs.length > 0 ? logs.slice(-10).join("\n") : "မှတ်တမ်းမရှိသေးပါ။");
  }
});

// Error handling for bot polling
bot.on('polling_error', (error) => console.log("Polling Error:", error.code));

console.log("--- AI Bot is now Online ---");
