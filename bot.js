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

// --- Deep Analysis AI Brain (History 100) ---
function deepAIBrain(history, predictionLogs) {
  // နောက်ဆုံး ၁၀ ပွဲကို အဓိကကြည့်ပြီး Pattern ရှာ
  const shortTerm = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = shortTerm[0];
  
  // အရှုံးမှတ်တမ်းကို စစ်ဆေး (နောက်ဆုံး ၅ ပွဲထဲက အရှုံးကိုကြည့်)
  const recentLogs = predictionLogs.slice(-5);
  const lossCount = recentLogs.filter(log => log.includes("❌ LOSS")).length;
  const lastTwoLoss = recentLogs.slice(-2).every(log => log.includes("❌ LOSS"));

  let decision = "";
  let analysis = "⚖️ Stable Market";
  let multiplier = "1X";

  // Logic 1: Dragon (တန်းစီထွက်ခြင်း)
  const isStreak = shortTerm.slice(0, 3).every(v => v === lastVal);
  // Logic 2: Ping-pong (တစ်လှည့်စီထွက်ခြင်း)
  const isChoppy = shortTerm[0] !== shortTerm[1] && shortTerm[1] !== shortTerm[2];

  if (lastTwoLoss) {
    // အရှုံး ၂ ကြိမ်ဆက်တိုက်ဖြစ်ရင် Strategy ကို အကြီးအကျယ် ပြောင်းလဲဝေဖန်
    analysis = "🛡️ Anti-Loss Recovery";
    multiplier = "3X (Martingale)";
    // အထွက်နည်းနေတဲ့ဘက်ကို ပြောင်းထိုး (Mean Reversion)
    const bigCount = shortTerm.filter(r => r === "Big").length;
    decision = bigCount >= 6 ? "Small" : "Big";
  } else if (isStreak) {
    analysis = "🔥 Dragon Pattern";
    decision = lastVal; // တန်းလိုက်မယ်
  } else if (isChoppy) {
    analysis = "🔄 Alternating Pattern";
    decision = (lastVal === "Big" ? "Small" : "Big"); // လွှဲထိုးမယ်
  } else {
    // ပုံမှန်အခြေအနေ
    const bigCount = shortTerm.filter(r => r === "Big").length;
    decision = bigCount >= 5 ? "Small" : "Big";
  }
  
  return { decision, analysis, multiplier, lossCount };
}

async function monitoringLoop(chatId) {
  while (user_db[chatId] && user_db[chatId].running) {
    const data = user_db[chatId];
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, language: 7, typeId: data.typeId }, data.token);
    
    if (res && res.msgCode === 0 && res.data.list.length > 0) {
      const history = res.data.list;
      const currIssue = history[0].issueNumber;

      if (currIssue !== data.last_issue) {
        if (data.last_pred) {
          const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
          const isWin = data.last_pred === realRes ? "✅ WIN" : "❌ LOSS";
          // History ၁၀၀ အထိ သိမ်းဆည်းရန်
          data.predictions.push(`🔹 [${data.mode}] ${currIssue.slice(-3)} | P: ${data.last_pred} | R: ${realRes} | ${isWin}`);
          if (data.predictions.length > 100) data.predictions.shift();
        }
        
        const { decision, analysis, multiplier, lossCount } = deepAIBrain(history, data.predictions);
        data.last_pred = decision;
        data.last_issue = currIssue;
        const nextIssue = (BigInt(currIssue) + 1n).toString();
        
        const msg = `🔔 **AI Update [${data.mode}]**\n\n` +
                    `🎯 Next: \`${nextIssue.slice(-3)}\` ➡️ **${decision}**\n` +
                    `🧐 Analysis: \`${analysis}\`\n` +
                    `💰 Advice: **${multiplier}**\n` +
                    `📉 Recent Losses: \`${lossCount}/5\``;
        
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
    }
    await new Promise(r => setTimeout(r, data.typeId === 30 ? 3000 : 8000));
  }
}

// --- Commands ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const kb = { reply_markup: { keyboard: [["🚀 Run 30s", "🚀 Run 1Min"], ["📊 Results", "🧠 History 100"], ["🛑 Stop AI", "/start"]], resize_keyboard: true } };

  if (text === '/start') {
    delete user_db[chatId];
    return bot.sendMessage(chatId, "🤖 **AI Intelligent Predictor**\nHistory 100 & Analysis Mode\n\nဖုန်းနံပါတ်ပေးပါ:", kb);
  }

  if (text === "🚀 Run 30s") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "Login ဝင်ပါ");
    user_db[chatId].running = true; user_db[chatId].typeId = 30; user_db[chatId].mode = "30s";
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "⚡ 30s Mode Started", kb);
  }

  if (text === "🚀 Run 1Min") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "Login ဝင်ပါ");
    user_db[chatId].running = true; user_db[chatId].typeId = 1; user_db[chatId].mode = "1Min";
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "🕒 1Min Mode Started", kb);
  }

  if (text === "📊 Results") {
    const data = user_db[chatId];
    if (!data?.token) return bot.sendMessage(chatId, "Login ဝင်ပါ");
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 12, language: 7, typeId: data.typeId || 30 }, data.token);
    if (res && res.msgCode === 0) {
      let txt = `📊 **Last Results (${data.mode || '30s'})**\n\n`;
      res.data.list.forEach(i => {
        let n = parseInt(i.number);
        txt += `▪️ ${i.issueNumber.slice(-3)}: ${n} (${n >= 5 ? 'B' : 'S'})\n`;
      });
      return bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    }
  }

  if (text === "🧠 History 100") {
    const logs = user_db[chatId]?.predictions || [];
    if (logs.length === 0) return bot.sendMessage(chatId, "မှတ်တမ်းမရှိသေးပါ");
    // ရှည်လျားသောစာသားဖြစ်နိုင်သဖြင့် နောက်ဆုံး အခု ၃၀ ကိုအရင်ပြမည်
    return bot.sendMessage(chatId, "🧠 **AI Prediction Logs (Last 100)**\n\n" + logs.slice(-30).join("\n") + "\n\n*(အကုန်ကြည့်ရန် အပေါ်သို့ ဆွဲတင်ပါ)*");
  }

  if (text === "🛑 Stop AI") { if (user_db[chatId]) user_db[chatId].running = false; return bot.sendMessage(chatId, "🛑 Stopped", kb); }

  if (/^\d{9,11}$/.test(text) && !user_db[chatId]) {
    user_db[chatId] = { phone: text, running: false, predictions: [] };
    return bot.sendMessage(chatId, "🔐 Password:");
  }

  if (user_db[chatId] && !user_db[chatId].token) {
    const res = await callApi("Login", { phonetype: -1, language: 7, logintype: "mobile", username: "95" + user_db[chatId].phone.replace(/^0/, ''), pwd: text });
    if (res && res.msgCode === 0) {
      user_db[chatId].token = `${res.data.tokenHeader}${res.data.token}`;
      return bot.sendMessage(chatId, `✅ Login Success`, kb);
    }
    delete user_db[chatId];
    return bot.sendMessage(chatId, "❌ မှားယွင်းပါသည်။ /start ပြန်လုပ်ပါ။");
  }
});
