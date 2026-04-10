const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Render/Heroku support
http.createServer((req, res) => { res.end('WinGo Sniper Pro - Final Engine Running'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

const DATA_FILE = path.join(__dirname, 'user_data.json');

// ========== DATA STORAGE ==========
function loadAllData() {
    try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
    return {};
}
function saveAllData(data) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}
let allUsers = loadAllData();

function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false, totalProfit: 0,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3, lossStartLimit: 1, currentBetStep: 0,
            consecutiveLosses: 0, consecutiveWins: 0, last_issue: null, last_pred: null,
            betHistory: [], aiLogs: [], manualBetLock: false, pendingSide: null
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

// ========== SECURITY & API ==========
function generateRandomKey() { return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => (Math.random()*16|0).toString(16)); }

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { 
            headers: { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" },
            timeout: 10000 
        });
        return res.data;
    } catch (e) { return null; }
}

// ========== AI 1-2-3 RULE ==========
function runAI(history) {
    const resArr = history.map(i => parseInt(i.number) >= 5 ? "Big" : "Small");
    let streak = 1;
    let currentSide = resArr[0];
    for(let i = 1; i < resArr.length; i++) {
        if(resArr[i] === currentSide) streak++; else break;
    }
    // 1-2-3 Rule Logic
    let prediction = (streak >= 3) ? (currentSide === "Big" ? "Small" : "Big") : currentSide;
    return { side: prediction, dragon: streak, calc: `${resArr[2]?.charAt(0)}-${resArr[1]?.charAt(0)}-${resArr[0]?.charAt(0)}` };
}

// ========== REAL BET EXECUTION (Auto/Manual) ==========
async function executeBet(chatId, side, amount, isAuto = false) {
    const data = getUserData(chatId);
    if (!data.token) return false;

    // အခုပွဲစဉ်ကို API ကနေ အရင်ယူပါမယ်
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) return false;
    
    // လက်ရှိပွဲစဉ် + 1 = ထိုးရမယ့်ပွဲစဉ်
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
    // Amount calculation (Wingo standard)
    let baseUnit = amount < 1000 ? 10 : (amount < 10000 ? 10 : 100);
    const betCount = Math.floor(amount / baseUnit);
    
    const res = await callApi("GameBetting", { 
        typeId: 30, issuenumber: targetIssue, gameType: 2, 
        amount: baseUnit, betCount: betCount, 
        selectType: side === "Big" ? 13 : 14, isAgree: true 
    }, data.token);
    
    if (res?.msgCode === 0) {
        data.betHistory.unshift({ issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", isAuto });
        if (!isAuto) data.manualBetLock = true;
        saveAllData(allUsers);
        
        await bot.sendMessage(chatId, `📌 [${isAuto?'🤖':'👤'}] ${targetIssue.slice(-5)} | ${side} | ${amount} MMK ထိုးပြီး ✅`);
        return true;
    } else {
        await bot.sendMessage(chatId, `❌ Bet တင်မရပါ: ${res?.msg || "လိုင်းမကောင်းပါ"}`);
        return false;
    }
}

// ========== MONITORING ENGINE ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;
        
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 15, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const lastRound = res.data.list[0];
            const currentIssue = lastRound.issueNumber;
            
            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";

                // ၁။ အရင်ပွဲ result စစ်မယ်
                let pendingIdx = data.betHistory.findIndex(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                if (pendingIdx !== -1) {
                    let bet = data.betHistory[pendingIdx];
                    const isWin = bet.side === realSide;
                    bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                    bet.pnl = isWin ? +(bet.amount * 0.97) : -bet.amount;
                    data.totalProfit += bet.pnl;
                    
                    if (isWin) { data.consecutiveWins++; data.currentBetStep = 0; } 
                    else { data.consecutiveWins = 0; if(bet.isAuto) data.currentBetStep++; }
                    if (!bet.isAuto) data.manualBetLock = false;

                    await bot.sendMessage(chatId, `${isWin?'🎉 အနိုင်':'💔 အရှုံး'} (${realSide} - ${lastRound.number})`);
                }

                // ၂။ AI အသစ်တွက်ချက်ခြင်း
                const ai = runAI(res.data.list);
                
                // ၃။ Auto Stop စစ်ဆေးခြင်း
                if (data.consecutiveWins >= data.stopLimit && data.stopLimit > 0) {
                    data.running = false;
                    await bot.sendMessage(chatId, "🛑 Stop Limit ပြည့်၍ Auto Bet ခဏရပ်လိုက်ပါပြီ။");
                }

                // ၄။ AI History သိမ်းခြင်း
                if (data.last_pred) {
                    data.aiLogs.unshift({ status: (data.last_pred === realSide ? "✅" : "❌"), issue: currentIssue.slice(-3), result: realSide });
                    if (data.aiLogs.length > 20) data.aiLogs.pop();
                    if (data.last_pred !== realSide) data.consecutiveLosses++; else data.consecutiveLosses = 0;
                }

                // ၅။ Auto Betting Logic
                if (data.running && !data.manualBetLock) {
                    if (data.consecutiveLosses >= data.lossStartLimit || data.currentBetStep > 0) {
                        const amt = data.betPlan[data.currentBetStep];
                        if (amt) await executeBet(chatId, ai.side, amt, true);
                    }
                }

                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveAllData(allUsers);

                // VIP Dashboard update
                let dashboard = `💥 VIP SIGNAL 💥\n🗓 ပွဲစဉ်: ${(BigInt(currentIssue)+1n).toString().slice(-5)}\n🎰 AI Pick: ${ai.side}\n🐉 Dragon: ${ai.dragon}\n\n📈 မှတ်တမ်း:\n`;
                data.aiLogs.slice(0, 10).forEach(l => { dashboard += `${l.status} ပွဲ ${l.issue} | ${l.result}\n`; });
                dashboard += `\n💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n📊 Step: ${data.currentBetStep + 1}`;

                await bot.sendMessage(chatId, dashboard, {
                    reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                });
            }
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

// ========== TELEGRAM HANDLERS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);

    if (text === '/start') {
        data.token = null; data.running = false; saveAllData(allUsers);
        return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro\nဖုန်းနံပါတ်ပေးပါ:");
    }

    // Manual Bet Amount Input
    if (data.pendingSide && /^\d+$/.test(text)) {
        await executeBet(chatId, data.pendingSide, parseInt(text), false);
        data.pendingSide = null;
        saveAllData(allUsers);
        return;
    }

    // Settings & Other Buttons (Add your existing settings handlers here)

    // Login logic
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text; saveAllData(allUsers);
        return bot.sendMessage(chatId, "🔐 Password:");
    }
    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true; delete data.tempPhone;
            saveAllData(allUsers);
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ Bot စတင်နေပါပြီ။");
        } else {
            bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။");
        }
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = getUserData(chatId);
    data.pendingSide = query.data.split('_')[1];
    saveAllData(allUsers);
    bot.sendMessage(chatId, `💰 ${data.pendingSide} အတွက် ပမာဏရိုက်ထည့်ပါ:`);
});

console.log("✅ Engine Ready to Bet");
