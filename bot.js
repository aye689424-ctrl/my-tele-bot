const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Health Check Server
http.createServer((req, res) => { res.end('WinGo Sniper Pro - Full System Online'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

const DATA_FILE = path.join(__dirname, 'user_data.json');

// ========== LOCAL STORAGE ==========
function loadAllData() {
    try { return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {}; }
    catch (e) { return {}; }
}

function saveAllData(data) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
    catch (e) {}
}

let allUsers = loadAllData();

function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 90, 200, 500, 1200, 2500],
            stopLimit: 3, lossStartLimit: 1,
            totalProfit: 0, currentBetStep: 0, 
            consecutiveWins: 0, consecutiveLosses: 0,
            last_issue: null, last_pred: null,
            manualBetLock: false, betHistory: [], aiLogs: []
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

// ========== SECURITY & API ==========
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 7, random: "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, c => (Math.random()*16|0).toString(16)), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, {
            headers: { "Content-Type": "application/json", "Authorization": authToken || "" },
            timeout: 4000
        });
        return res.data;
    } catch (e) { return null; }
}

// ========== AI LOGIC (Stats + Trend) ==========
function runAdvancedAI(history, stats) {
    const lastSide = parseInt(history[0].number) >= 5 ? "Big" : "Small";
    let smallMissing = 0, bigMissing = 0;

    if (stats?.data) {
        const missing = stats.data.find(d => d.typeName === "Missing");
        if (missing) {
            for(let i=0; i<=4; i++) smallMissing += missing[`number_${i}`] || 0;
            for(let i=5; i<=9; i++) bigMissing += missing[`number_${i}`] || 0;
        }
    }
    // Missing များတဲ့ဘက်ကို ဦးစားပေးခန့်မှန်း
    const statsPred = bigMissing >= smallMissing ? "Big" : "Small";
    return { side: statsPred, lastSide: lastSide };
}

// ========== BETTING FUNCTION ==========
async function placeBet(chatId, side, amount, targetIssue, isAuto = true) {
    const data = getUserData(chatId);
    if (!data.token) return;

    const selectType = side === "Big" ? 13 : 14;
    const betPayload = { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: 10, betCount: Math.floor(amount/10), selectType: selectType, isAgree: true };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    if (res?.msgCode === 0) {
        data.betHistory.unshift({ issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", isAuto });
        if (!isAuto) data.manualBetLock = true;
        saveAllData(allUsers);
        bot.sendMessage(chatId, `✅ ${isAuto ? '[AUTO]' : '[MANUAL]'} ${targetIssue.slice(-5)} အတွက် ${side} ${amount} MMK ထိုးပြီး!`);
    } else if (res?.msg?.includes("settled")) {
        // ပွဲပိတ်သွားရင် နောက်ပွဲကို ထပ်ထိုးပေးခြင်း
        const nextIssue = (BigInt(targetIssue) + 1n).toString();
        return placeBet(chatId, side, amount, nextIssue, isAuto);
    }
}

// ========== MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (getUserData(chatId).running) {
        let data = getUserData(chatId);
        const [histRes, statsRes] = await Promise.all([
            callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, data.token),
            callApi("GetEmerdList", { typeId: 30 }, data.token)
        ]);

        if (histRes?.data?.list?.length > 0) {
            const lastRound = histRes.data.list[0];
            const currentIssue = lastRound.issueNumber;

            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                
                // 1. Check Previous Bets
                data.betHistory.forEach(bet => {
                    if (bet.status === "⏳ Pending" && bet.issue === currentIssue.slice(-5)) {
                        const isWin = bet.side === realSide;
                        bet.status = isWin ? "✅ WIN" : "❌ LOSS";
                        const pnl = isWin ? (bet.amount * 0.96) : -bet.amount;
                        data.totalProfit += pnl;
                        if (bet.isAuto) {
                            if (isWin) { 
                                data.consecutiveWins++; 
                                data.currentBetStep = 0; 
                            } else { 
                                data.consecutiveWins = 0; 
                                data.currentBetStep++; 
                            }
                        }
                        data.manualBetLock = false;
                    }
                });

                // 2. Stop Limit Check
                if (data.consecutiveWins >= data.stopLimit) {
                    data.autoRunning = false;
                    bot.sendMessage(chatId, `🛑 Stop Limit ပြည့်သွားသဖြင့် Auto ရပ်လိုက်ပါပြီ။`);
                }

                // 3. AI Prediction
                const ai = runAdvancedAI(histRes.data.list, statsRes);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                // 4. Auto Bet Trigger
                if (data.autoRunning && !data.manualBetLock) {
                    let shouldBet = false;
                    let betSide = ai.side;
                    if (data.autoMode === 'follow') betSide = ai.lastSide;
                    
                    if (data.autoMode === 'follow') shouldBet = true;
                    else if (data.autoMode === 'ai' && data.consecutiveLosses >= data.lossStartLimit) shouldBet = true;

                    if (shouldBet && data.currentBetStep < data.betPlan.length) {
                        await placeBet(chatId, betSide, data.betPlan[data.currentBetStep], nextIssue, true);
                    }
                }

                // 5. VIP Message
                let statusMsg = `💥 WIN-GO VIP SIGNAL 💥\n━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue.slice(-5)} | Result: ${realSide} (${lastRound.number})\n`;
                statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🚀 Next: ${nextIssue.slice(-5)}\n`;
                statusMsg += `🤖 AI Prediction: ${ai.side === 'Big' ? 'BIG 🔵' : 'SMALL 🔴'}\n`;

                bot.sendMessage(chatId, statusMsg, {
                    reply_markup: { inline_keyboard: [[
                        { text: "🔵 BIG (ကိုယ်တိုင်)", callback_data: `bet_Big_${nextIssue}` },
                        { text: "🔴 SMALL (ကိုယ်တိုင်)", callback_data: `bet_Small_${nextIssue}` }
                    ]]}
                });
                saveAllData(allUsers);
            }
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

// ========== TELEGRAM INTERFACE ==========
const mainMenu = { reply_markup: { keyboard: [["🚀 Start Auto", "🛑 Stop Auto"], ["📊 Status", "📜 History"], ["🚪 Logout"]], resize_keyboard: true } };

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎯 WinGo Sniper Pro စတင်ပါပြီ။ ဖုန်းနံပါတ်ပေးပါ:", mainMenu);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);

    if (text === "🚀 Start Auto") {
        data.autoRunning = true;
        data.autoMode = 'ai'; // Default AI Correction
        bot.sendMessage(chatId, "✅ Auto Betting စတင်ပါပြီ (AI Correction Mode)");
    } else if (text === "🛑 Stop Auto") {
        data.autoRunning = false;
        bot.sendMessage(chatId, "🛑 Auto Betting ရပ်တန့်လိုက်ပါပြီ။");
    } else if (text === "📊 Status") {
        bot.sendMessage(chatId, `📊 လက်ရှိအခြေအနေ\nProfit: ${data.totalProfit} MMK\nStep: ${data.currentBetStep + 1}\nAuto: ${data.autoRunning ? 'ON' : 'OFF'}`);
    } else if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    } else if (data.tempPhone && !data.token) {
        const res = await callApi("Login", { username: "95" + data.tempPhone.replace(/^0/,''), pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true;
            delete data.tempPhone;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။", mainMenu);
        } else bot.sendMessage(chatId, "❌ Login ကျရှုံးသည်။");
    }
    saveAllData(allUsers);
});

// ကိုယ်တိုင်ထိုးဖို့ ခလုတ်နှိပ်သည့်အခါ
bot.on('callback_query', async (query) => {
    const [_, side, issue] = query.data.split('_');
    const chatId = query.message.chat.id.toString();
    const data = getUserData(chatId);
    
    data.pendingManualBet = { side, issue };
    bot.sendMessage(chatId, `💰 ${side} အတွက် ထိုးမည့်ပမာဏကို နံပါတ်တစ်ခုတည်း ရိုက်ထည့်ပါ: (ဥပမာ - 500)`);
});

// ပမာဏရိုက်ထည့်တာကို စောင့်ဖမ်းခြင်း
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const data = getUserData(chatId);
    if (data.pendingManualBet && /^\d+$/.test(msg.text)) {
        const amount = parseInt(msg.text);
        await placeBet(chatId, data.pendingManualBet.side, amount, data.pendingManualBet.issue, false);
        delete data.pendingManualBet;
        saveAllData(allUsers);
    }
});
