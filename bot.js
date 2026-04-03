const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Render Keep Alive Server ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('AI Bot is Running!');
  res.end();
});
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });

// --- Bot Configuration ---
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
  const headers = { 
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  };
  if (authToken) headers["Authorization"] = authToken;
  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 8000 });
    return response.data;
  } catch (error) { 
    console.log("API Error:", error.message);
    return null; 
  }
}

// --- AI Logic ---
function aiBrainConsensus(history) {
  const results = history.slice(0, 10).map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
  const lastVal = results[0];
  let patternType = "NORMAL";
  let finalDecision = "";
  let confidence = 0;

  const isStreak = results.slice(0, 3).every(v => v === lastVal);
  const isChoppy = results[0] !== results[1] && results[1] !== results[2] && results[2] !== results[3];

  if (isStreak) {
    patternType = "🔥 STREAK";
    finalDecision = lastVal; 
    confidence = 85;
  } else if (isChoppy) {
    patternType = "🔄 CHOPPY";
    finalDecision = lastVal === "Big" ? "Small" : "Big";
    confidence = 75;
  } else {
    const bigCount = results.filter(r => r === "Big").length;
    finalDecision = bigCount >= 5 ? "Small" : "Big";
    confidence = 60;
  }
  return { finalDecision, confidence, patternType };
}

async function monitoringLoop(chatId) {
  while (user_db[chatId] && user_db[chatId].running) {
    const data = user_db[chatId];
    // 30s အတွက် typeId: 10 ကို ပိုပြီး တည်ငြိမ်အောင် ခေါ်ယူခြင်း
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, language: 0, typeId: data.typeId }, data.token);
    
    if (res && res.msgCode === 0 && res.data && res.data.list.length > 0) {
      const history = res.data.list;
      const currIssue = history[0].issueNumber;

      if (currIssue !== data.last_issue) {
        if (data.last_pred) {
          const realRes = parseInt(history[0].number) >= 5 ? "Big" : "Small";
          const isWin = data.last_pred === realRes ? "✅ WIN" : "❌ LOSS";
          data.predictions.push(`🔹 [${data.gameMode}] ${currIssue.slice(-3)} | P: ${data.last_pred} | R: ${realRes} | ${isWin}`);
        }

        const { finalDecision, confidence, patternType } = aiBrainConsensus(history);
        data.last_pred = finalDecision;
        data.last_issue = currIssue;

        const nextIssue = (BigInt(currIssue) + 1n).toString();
        const msg = `🔔 **AI Update [Wingo ${data.gameMode}]**\n\n` +
                    `🎯 Issue: \`${nextIssue.slice(-3)}\`\n` +
                    `🧠 Decision: **${finalDecision}**\n` +
                    `📊 Pattern: \`${patternType}\` (\`${confidence}%\`)`;
        
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
    } else if (res && res.msgCode === 401) {
       // Token သက်တမ်းကုန်သွားရင် Login ပြန်တောင်းဖို့ message ပို့
       user_db[chatId].running = false;
       bot.sendMessage(chatId, "⚠️ Session သက်တမ်းကုန်သွားပါပြီ။ /start နှိပ်ပြီး Login ပြန်ဝင်ပေးပါဗျ။");
       break;
    }
    
    const waitTime = data.typeId === 10 ? 3000 : 10000;
    await new Promise(r => setTimeout(r, waitTime));
  }
}

// --- Bot Command Handlers ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const mainKeyboard = {
    reply_markup: {
      keyboard: [
        ["🚀 Run 30s", "🚀 Run 1Min"],
        ["📊 Results", "🧠 History"],
        ["🛑 Stop AI", "/start"]
      ],
      resize_keyboard: true
    }
  };

  if (text === '/start') {
    delete user_db[chatId];
    return bot.sendMessage(chatId, "🤖 **AI Multi-Mode Pro**\n\nLogin ဝင်ရန် ဖုန်းနံပါတ်ပေးပါ:", mainKeyboard);
  }

  if (text === "🚀 Run 30s") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ!");
    user_db[chatId].running = true;
    user_db[chatId].typeId = 10;
    user_db[chatId].gameMode = "30s";
    user_db[chatId].last_issue = ""; // Reset issue to start fresh
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "⚡ **Wingo 30s AI ကို စတင်နေပါပြီ...**\n(ခဏစောင့်ပေးပါ၊ အဖြေအသစ်တက်လာရင် ပို့ပေးပါမယ်)", mainKeyboard);
  }

  if (text === "🚀 Run 1Min") {
    if (!user_db[chatId]?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ!");
    user_db[chatId].running = true;
    user_db[chatId].typeId = 1;
    user_db[chatId].gameMode = "1Min";
    user_db[chatId].last_issue = "";
    monitoringLoop(chatId);
    return bot.sendMessage(chatId, "🕒 **Wingo 1Min AI စတင်ပါပြီ**", mainKeyboard);
  }

  if (text === "🛑 Stop AI") {
    if (user_db[chatId]) user_db[chatId].running = false;
    return bot.sendMessage(chatId, "🛑 AI ရပ်တန့်လိုက်ပါပြီ။", mainKeyboard);
  }

  if (text === "📊 Results") {
    const data = user_db[chatId];
    if (!data?.token) return bot.sendMessage(chatId, "အရင် Login ဝင်ပါ");
    const tid = data.typeId || 1;
    const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 10, language: 0, typeId: tid }, data.token);
    if (res && res.msgCode === 0) {
      let txt = `📊 **Results (${tid === 10 ? '30s' : '1Min'})**\n\n`;
      res.data.list.forEach(i => {
        let n = parseInt(i.number);
        txt += `▪️ ${i.issueNumber.slice(-3)} ➡️ ${n} (${n >= 5 ? 'B' : 'S'})\n`;
      });
      return bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    }
    return bot.sendMessage(chatId, "❌ ဒေတာဆွဲမရပါ (Login ပြန်ဝင်ကြည့်ပါ)");
  }

  if (text === "🧠 History") {
    const logs = user_db[chatId]?.predictions || [];
    return bot.sendMessage(chatId, "🧠 **AI History**\n\n" + (logs.slice(-15).join("\n") || "မှတ်တမ်းမရှိသေးပါ"));
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
      return bot.sendMessage(chatId, `✅ **Login အောင်မြင်ပါသည်**\nအောက်က Mode တစ်ခုကို ရွေးပါ`, mainKeyboard);
    }
    delete user_db[chatId];
    return bot.sendMessage(chatId, "❌ Password မှားနေပါတယ်။ /start ကို နှိပ်ပြီး ဖုန်းနံပါတ်ကစ ပြန်လုပ်ပေးပါဗျ။");
  }
});
