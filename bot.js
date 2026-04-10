const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// ===== SERVER (Render Keep Alive) =====
http.createServer((req, res) => {
  res.end('WinGo PRO AI Bot Running');
}).listen(process.env.PORT || 8080);

// ===== CONFIG =====
const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";

const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// ===== MEMORY =====
let users = {};

// ===== HELPERS =====
function rand() {
  return Math.random().toString(16).slice(2);
}

function sign(payload) {
  const { signature, ...rest } = payload;
  const sorted = Object.keys(rest).sort().reduce((a, k) => (a[k] = rest[k], a), {});
  return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').toUpperCase();
}

async function callApi(endpoint, data, auth = "") {
  const payload = {
    ...data,
    language: 7,
    random: rand(),
    timestamp: Math.floor(Date.now() / 1000)
  };
  payload.signature = sign(payload);

  try {
    const res = await axios.post(BASE_URL + endpoint, payload, {
      headers: { Authorization: auth },
      timeout: 5000
    });
    return res.data;
  } catch {
    return null;
  }
}

// ===== PRO AI =====
function proAI(history, emerd) {
  const sides = history.map(x => parseInt(x.number) >= 5 ? "Big" : "Small");

  let trend = sides[0];
  let trendScore = (sides[0] === sides[1]) ? 20 : 0;

  let streak = 1;
  for (let i = 1; i < sides.length; i++) {
    if (sides[i] === sides[0]) streak++;
    else break;
  }

  let streakSide = sides[0];
  let streakScore = 0;

  if (streak >= 3) {
    streakSide = sides[0] === "Big" ? "Small" : "Big";
    streakScore = 30;
  }

  let emerdSide = "Big";
  let emerdScore = 0;

  if (emerd) {
    const freq = emerd.find(x => x.type == 1);
    const miss = emerd.find(x => x.type == 2);

    let best = { score: -999 };

    for (let i = 0; i <= 9; i++) {
      const f = freq[`number_${i}`] || 0;
      const m = miss[`number_${i}`] || 0;
      const score = (m * 2) - f;

      if (score > best.score) best = { n: i, score };
    }

    emerdSide = best.n >= 5 ? "Big" : "Small";
    emerdScore = 40;
  }

  let vote = { Big: 0, Small: 0 };
  vote[trend] += trendScore;
  vote[streakSide] += streakScore;
  vote[emerdSide] += emerdScore;

  const final = vote.Big > vote.Small ? "Big" : "Small";
  const conf = Math.max(vote.Big, vote.Small);

  return { side: final, confidence: conf };
}

// ===== BET =====
async function placeBet(user, side, issue) {
  const amount = user.betPlan[user.step];

  const payload = {
    typeId: 30,
    issuenumber: issue,
    gameType: 2,
    amount: amount,
    betCount: 1,
    selectType: side === "Big" ? 13 : 14,
    isAgree: true
  };

  const res = await callApi("GameBetting", payload, user.token);

  if (res?.msgCode === 0) {
    bot.sendMessage(user.chatId, `✅ Bet ${side} | ${amount}`);
  } else {
    bot.sendMessage(user.chatId, `❌ Bet Fail`);
  }
}

// ===== LOOP =====
async function loop(user) {
  while (user.running) {

    const res = await callApi("GetNoaverageEmerdList", { pageNo:1, pageSize:20, typeId:30 }, user.token);
    const emerdRes = await callApi("GetEmerdList", { pageNo:1, pageSize:10, typeId:30 }, user.token);

    if (!res?.data?.list) continue;

    const history = res.data.list;
    const issue = history[0].issueNumber;

    if (issue !== user.lastIssue) {

      user.lastIssue = issue;

      const ai = proAI(history, emerdRes?.data);

      let msg = `💥 PRO SIGNAL\n━━━━━━━━\n`;
      msg += `🎯 Side: ${ai.side}\n`;
      msg += `🔥 Confidence: ${ai.confidence}\n`;
      msg += `🆔 Issue: ${issue}\n`;

      await bot.sendMessage(user.chatId, msg, {
        reply_markup: {
          inline_keyboard: [[
            { text: "🔵 Big", callback_data: "bet_Big" },
            { text: "🔴 Small", callback_data: "bet_Small" }
          ]]
        }
      });

      if (user.auto && ai.confidence >= 40) {
        const next = (BigInt(issue) + 1n).toString();
        await placeBet(user, ai.side, next);
      }
    }

    await new Promise(r => setTimeout(r, 1500));
  }
}

// ===== MENU =====
const menu = {
  reply_markup: {
    keyboard: [
      ["🚀 Start Auto", "🛑 Stop"],
      ["📊 Predict"]
    ],
    resize_keyboard: true
  }
};

// ===== BOT =====
bot.on('message', async (msg) => {
  const id = msg.chat.id;

  if (!users[id]) {
    users[id] = {
      chatId: id,
      token: null,
      phone: null,
      running: false,
      auto: false,
      step: 0,
      betPlan: [10,30,60,120]
    };
  }

  const u = users[id];
  const text = msg.text;

  if (text === "/start") {
    return bot.sendMessage(id, "📱 Phone:", menu);
  }

  if (/^\d+$/.test(text) && !u.token) {
    u.phone = text;
    return bot.sendMessage(id, "🔐 Password:");
  }

  if (u.phone && !u.token) {
    const res = await callApi("Login", {
      username: "95" + u.phone,
      pwd: text
    });

    if (res?.msgCode === 0) {
      u.token = res.data.tokenHeader + " " + res.data.token;
      u.running = true;
      loop(u);
      return bot.sendMessage(id, "✅ Login Success", menu);
    } else {
      return bot.sendMessage(id, "❌ Login Fail");
    }
  }

  if (text === "🚀 Start Auto") {
    u.auto = true;
    return bot.sendMessage(id, "🤖 Auto Started");
  }

  if (text === "🛑 Stop") {
    u.auto = false;
    return bot.sendMessage(id, "🛑 Stopped");
  }

  if (text === "📊 Predict") {
    const res = await callApi("GetEmerdList", { pageNo:1, pageSize:10, typeId:30 }, u.token);
    const noavg = await callApi("GetNoaverageEmerdList", { pageNo:1, pageSize:10, typeId:30 }, u.token);

    const ai = proAI(noavg.data.list, res.data);

    return bot.sendMessage(id, `🎯 ${ai.side}\n🔥 ${ai.confidence}`);
  }
});

// ===== BUTTON =====
bot.on('callback_query', async (q) => {
  const id = q.message.chat.id;
  const u = users[id];

  if (q.data.startsWith("bet_")) {
    const side = q.data.split("_")[1];

    const res = await callApi("GetNoaverageEmerdList", { pageNo:1, pageSize:1, typeId:30 }, u.token);
    const next = (BigInt(res.data.list[0].issueNumber) + 1n).toString();

    await placeBet(u, side, next);
  }
});

console.log("✅ PRO BOT RUNNING");
