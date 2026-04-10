const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => { res.end('WinGo Sniper Pro - Hot/Cold Analysis'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// ========== LOCAL STORAGE ==========
const DATA_FILE = path.join(__dirname, 'user_data.json');

function loadAllData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveAllData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

let allUsers = loadAllData();

function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3, lossStartLimit: 1,
            totalProfit: 0,
            currentBetStep: 0, consecutiveWins: 0, consecutiveLosses: 0,
            last_issue: null, last_pred: null,
            manualBetLock: false, manualBetIssue: null,
            betHistory: [],
            aiLogs: []
        };
        saveAllData(allUsers);
    }
    return allUsers[chatId];
}

function saveUserData(chatId, data) {
    allUsers[chatId] = data;
    saveAllData(allUsers);
}

// ========== SECURITY HELPERS ==========
function generateRandomKey() {
    return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').toUpperCase();
}

async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 5000 });
        return res.data;
    } catch (e) {
        return null;
    }
}

// ========== AI LOGIC ==========
function getSideFromNumber(num) {
    return parseInt(num) >= 5 ? "Big" : "Small";
}

// ========== 🆕 AI API ခေါ်ပြီး Hot/Cold ခွဲခြမ်းစိတ်ဖြာခြင်း ==========
async function analyzeBestBet(chatId) {
    const data = getUserData(chatId);
    const loadingMsg = await bot.sendMessage(chatId, "⏳ API မှ Hot/Cold Data များ ခွဲခြမ်းစိတ်ဖြာနေပါသည်...");

    try {
        // 1. Statistics API ခေါ်မယ် (Hot/Cold Data အတွက်)
        // ဒီ API Endpoint က ဂဏန်းတွေရဲ့ Frequency, Missing စာရင်းတွေပေးတယ်။
        const statsRes = await callApi("GetGameStatistics", { 
            typeId: 30,
            gameType: 2 
        }, data.token || "");
        
        // 2. နောက်ဆုံးရလဒ် ရယူရန် History API ခေါ်မယ်
        const historyRes = await callApi("GetNoaverageEmerdList", { 
            pageNo: 1, 
            pageSize: 50, 
            typeId: 30 
        }, data.token || "");

        if (statsRes?.msgCode === 0 && historyRes?.msgCode === 0) {
            
            // --- Hot/Cold Data Processing ---
            const freqData = statsRes.data.find(d => d.type === 1); // Frequency
            const missingData = statsRes.data.find(d => d.type === 2); // Missing
            
            let hotNumbers = [];
            let coldNumbers = [];
            
            if (freqData) {
                // Frequency အများဆုံး ၃ လုံး (Hot)
                const freqList = [];
                for(let i=0; i<=9; i++) freqList.push({ num: i, val: freqData[`number_${i}`] });
                freqList.sort((a,b) => b.val - a.val);
                hotNumbers = freqList.slice(0, 3).map(i => i.num);
            }

            if (missingData) {
                // Missing အများဆုံး (မကျတာကြာဆုံး) ၃ လုံး (Cold)
                const missList = [];
                for(let i=0; i<=9; i++) missList.push({ num: i, val: missingData[`number_${i}`] });
                missList.sort((a,b) => b.val - a.val);
                coldNumbers = missList.slice(0, 3).map(i => i.num);
            }

            // --- History Data Processing ---
            const history = historyRes.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;
            const lastNumber = parseInt(lastRound.number);
            const lastResult = getSideFromNumber(lastNumber);
            
            // --- AI Decision Making (Hot/Cold + Streak) ---
            const resultsLast10 = history.slice(0, 10).map(i => getSideFromNumber(i.number));
            let bigCount = resultsLast10.filter(r => r === 'Big').length;
            let smallCount = resultsLast10.filter(r => r === 'Small').length;
            
            // လက်ရှိကျတဲ့ဂဏန်းက Hot လား Cold လား စစ်တယ်
            const isLastNumberHot = hotNumbers.includes(lastNumber);
            const isLastNumberCold = coldNumbers.includes(lastNumber);
            
            let finalPrediction = lastResult; // Default: နောက်ဆုံးရလဒ်အတိုင်း လိုက်မယ်
            let reason = "";
            
            // 🔥 Hot/Cold Strategy စတင်
            if (isLastNumberCold) {
                // မကျတာကြာတဲ့ဂဏန်း ခုမှကျလာရင် Trend ပြောင်းနိုင်တယ်
                finalPrediction = lastResult === "Big" ? "Small" : "Big";
                reason = `❄️ Cold Number (${lastNumber}) ခုမှကျလာ၍ Trend ပြောင်းနိုင်ခြေ များပါသည်။`;
            } 
            else if (isLastNumberHot) {
                // Hot ဖြစ်နေတဲ့ဂဏန်း ဆက်ကျရင် Trend ဆက်ဖို့ များတယ်
                finalPrediction = lastResult;
                reason = `🔥 Hot Number (${lastNumber}) ဆက်ကျနေ၍ Trend ဆက်လက်အားကောင်းနိုင်ပါသည်။`;
            }
            else {
                // Normal Logic
                if (bigCount >= 7) {
                    finalPrediction = "Small";
                    reason = `📊 BIG ${bigCount}/10 ဖြင့် ပြင်းထန်နေ၍ ပြောင်းပြန် ခန့်မှန်းပါသည်။`;
                } else if (smallCount >= 7) {
                    finalPrediction = "Big";
                    reason = `📊 SMALL ${smallCount}/10 ဖြင့် ပြင်းထန်နေ၍ ပြောင်းပြန် ခန့်မှန်းပါသည်။`;
                } else {
                    reason = `📈 ပုံမှန် Trend အတိုင်း လိုက်ခန့်မှန်းပါသည်။`;
                }
            }

            const nextIssue = (BigInt(currentIssue) + 1n).toString();
            const nextIssueShort = nextIssue.slice(-5);
            const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });

            // သုံးသပ်ချက် Message ဖန်တီးခြင်း
            let analysisMsg = `🧠 **API AI Hot/Cold ခန့်မှန်းချက်** 🧠\n`;
            analysisMsg += `━━━━━━━━━━━━━━━━\n`;
            analysisMsg += `📊 **လက်ရှိ ပွဲစဉ်:** ${currentIssue}\n`;
            analysisMsg += `🎲 **နောက်ဆုံးရလဒ်:** ${lastResult} (${lastNumber})\n`;
            analysisMsg += `━━━━━━━━━━━━━━━━\n`;
            analysisMsg += `📈 **Hot/Cold ခွဲခြမ်းစိတ်ဖြာချက်:**\n`;
            analysisMsg += `• 🔥 Hot Numbers: ${hotNumbers.join(', ')}\n`;
            analysisMsg += `• ❄️ Cold Numbers: ${coldNumbers.join(', ')}\n`;
            analysisMsg += `• ${reason}\n`;
            analysisMsg += `━━━━━━━━━━━━━━━━\n`;
            analysisMsg += `🚀 **နောက်ပွဲစဉ်:** ${nextIssueShort} (${mmTime})\n`;
            analysisMsg += `💡 **အကြံပြုထိုးသွင်းရန်:** ${finalPrediction === "Big" ? "🔵 BIG (ကြီး)" : "🔴 SMALL (သေး)"}\n`;

            await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `💰 ${finalPrediction === "Big" ? "BIG (ကြီး)" : "SMALL (သေး)"} ထိုးမည်`, callback_data: `bestbet_${finalPrediction}` }
                        ],
                        [
                            { text: "🔄 Hot/Cold ပြန်စစ်မည်", callback_data: "refresh_analysis" }
                        ]
                    ]
                }
            };
            
            await bot.sendMessage(chatId, analysisMsg, { parse_mode: 'Markdown', ...inlineKeyboard });

        } else {
            await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            await bot.sendMessage(chatId, "❌ API မှ ဒေတာရယူ၍ မရပါ။ အင်တာနက် သို့မဟုတ် API ပြဿနာဖြစ်နိုင်သည်။");
        }
    } catch (error) {
        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
        await bot.sendMessage(chatId, "❌ ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ။");
    }
}

// ========== AI History Formatting ==========
function formatAIHistoryForVIP(aiLogs, limit = 10) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const recentLogs = aiLogs.slice(0, limit);
    let winCount = recentLogs.filter(l => l.status === "✅").length;
    let winRate = ((winCount / recentLogs.length) * 100).toFixed(1);
    let txt = `📈 AI ခန့်မှန်းချက် မှတ်တမ်း (${recentLogs.length} ပွဲ) | Win Rate: ${winRate}%\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    recentLogs.forEach((log) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🔵" : "🔴";
        let predEmoji = log.prediction === "Big" ? "🔵" : "🔴";
        txt += `${log.status} ${shortIssue} | ${predEmoji}→${resultEmoji} | ${log.number || ''}\n`;
    });
    return txt;
}

function formatFullAIHistory(aiLogs) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    let totalWins = aiLogs.filter(l => l.status === "✅").length;
    let winRate = ((totalWins / aiLogs.length) * 100).toFixed(1);
    let txt = `📈 AI ခန့်မှန်းချက် အပြည့်အစုံ\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    txt += `📊 စုစုပေါင်း: ${aiLogs.length} ပွဲ | ✅ ${totalWins} | ❌ ${aiLogs.length - totalWins} | ${winRate}%\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    aiLogs.slice(0, 30).forEach((log, i) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🔵 BIG" : "🔴 SMALL";
        let predEmoji = log.prediction === "Big" ? "🔵 BIG" : "🔴 SMALL";
        txt += `${i+1}. ${log.status} ပွဲ ${shortIssue} | ခန့်: ${predEmoji} | ရလဒ်: ${resultEmoji} (${log.number || ''})\n`;
    });
    return txt;
}

// ========== အမြန်ထိုးခြင်း Function ==========
async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true) {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;

    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    const betCount = Math.floor(amount / baseUnit);
    const selectType = side === "Big" ? 13 : 14;
    const betPayload = {
        typeId: 30,
        issuenumber: targetIssue,
        gameType: 2,
        amount: baseUnit,
        betCount: betCount,
        selectType: selectType,
        isAgree: true
    };

    await bot.sendMessage(chatId, `🔍 [DEBUG] ထိုးမည့် Issue: ${targetIssue} | ${side} | ${amount} MMK`);
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        const newBet = {
            issue: targetIssue.slice(-5), side, amount, status: "⏳ Pending", pnl: 0,
            isAuto: isAuto, autoStep: isAuto ? stepIndex : -1,
            timestamp: new Date().toISOString()
        };
        data.betHistory.unshift(newBet);
        if (!isAuto) {
            data.manualBetLock = true;
            data.manualBetIssue = targetIssue.slice(-5);
        }
        saveUserData(chatId, data);
        
        const typeText = isAuto ? "[AUTO]" : "[MANUAL]";
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        await bot.sendMessage(chatId, `✅ ${typeText} ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးပြီး!`);
        return true;
    } else {
        await bot.sendMessage(chatId, `❌ Bet Failed: ${res?.msg || 'Unknown Error'} (Issue: ${targetIssue.slice(-5)})`);
        return false;
    }
}

// ========== MONITORING LOOP (Auto Bet) ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;

        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const currentIssue = lastRound.issueNumber;

            if (currentIssue !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                const realNumber = lastRound.number;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                // 1. Pending Bet Result Check
                let pendingBet = null;
                for (let bet of data.betHistory) {
                    if (bet.status === "⏳ Pending" && bet.issue === currentIssue.slice(-5)) {
                        pendingBet = bet;
                        break;
                    }
                }

                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        data.totalProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            data.consecutiveWins++;
                            if (data.consecutiveWins >= data.stopLimit) {
                                await bot.sendMessage(chatId, `🛑 Stop Limit Reached! (${data.stopLimit} wins) Auto Bet Stopped.`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                data.currentBetStep = 0;
                                data.consecutiveWins = 0;
                            } else {
                                data.currentBetStep = 0;
                            }
                        } else {
                            data.manualBetLock = false;
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        data.totalProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            data.consecutiveWins = 0;
                            const nextStep = data.currentBetStep + 1;
                            if (nextStep < data.betPlan.length) {
                                data.currentBetStep = nextStep;
                            } else {
                                await bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                                data.autoRunning = false;
                                data.autoMode = null;
                                data.currentBetStep = 0;
                            }
                        } else {
                            data.manualBetLock = false;
                        }
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // 2. AI Prediction Tracking
                if (data.last_pred) {
                    const aiCorrect = (data.last_pred === realSide);
                    const logEntry = {
                        status: aiCorrect ? "✅" : "❌",
                        issue: currentIssue.slice(-5),
                        result: realSide,
                        prediction: data.last_pred,
                        number: realNumber
                    };
                    data.aiLogs.unshift(logEntry);
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                    if (!aiCorrect) {
                        data.consecutiveLosses++;
                    } else {
                        data.consecutiveLosses = 0;
                    }
                    saveUserData(chatId, data);
                    data = getUserData(chatId);
                }

                // 3. New AI Signal
                const ai = runAI(history);
                data.last_issue = currentIssue;
                data.last_pred = ai.side;
                saveUserData(chatId, data);

                // 4. Auto Bet Trigger
                if (data.autoRunning && !data.manualBetLock) {
                    let shouldBet = false;
                    let betSide = null;
                    let betAmount = 0;

                    if (data.autoMode === 'follow') {
                        betSide = realSide;
                        betAmount = data.betPlan[data.currentBetStep];
                        shouldBet = true;
                        await bot.sendMessage(chatId, `🔄 [Follow Mode] နောက်ဆုံးရလဒ် ${betSide} ကို လိုက်ထိုးပါမည်။`);
                    } else if (data.autoMode === 'ai_correction') {
                        if (data.consecutiveLosses >= data.lossStartLimit) {
                            betSide = data.last_pred;
                            betAmount = data.betPlan[data.currentBetStep];
                            shouldBet = true;
                            await bot.sendMessage(chatId, `🤖 [AI Correction] AI ${data.consecutiveLosses} ပွဲဆက်မှား၍ Auto Bet စတင်ပါပြီ။`);
                        } else {
                            await bot.sendMessage(chatId, `⏳ [AI Correction] AI အမှား ${data.consecutiveLosses}/${data.lossStartLimit}။ စောင့်ဆိုင်းနေပါသည်...`);
                        }
                    }

                    if (shouldBet && betSide) {
                        await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true);
                    }
                }

                // 5. Send VIP Signal
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let modeText = "⚪️ Manual Only";
                if (data.autoRunning) {
                    modeText = data.autoMode === 'follow' ? "🟢 Follow Mode" : "🟡 AI Correction";
                }
                const aiHistoryText = formatAIHistoryForVIP(data.aiLogs, 10);
                
                let statusMsg = `💥 BIGWIN VIP SIGNAL 💥\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🗓 Period: ${currentIssue}\n`;
                statusMsg += `🎲 Result: ${realSide} (${realNumber})\n`;
                statusMsg += `🤖 AI Pred: ${data.last_pred}\n`;
                statusMsg += `📊 Mode: ${modeText}\n`;
                statusMsg += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += `🚀 Next Issue: ${nextIssue.slice(-5)} (${mmTime})\n`;
                statusMsg += `🦸 AI ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                statusMsg += `━━━━━━━━━━━━━━━━\n`;
                statusMsg += aiHistoryText;

                await bot.sendMessage(chatId, statusMsg, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}

// ========== MENUS & HANDLERS ==========
const mainMenu = {
    reply_markup: {
        keyboard: [
            ["🚀 Start Auto", "🛑 Stop Auto"],
            ["⚙️ Settings", "📊 Status"],
            ["📜 Bet History", "📈 AI History"],
            ["🧠 AI Hot/Cold ခန့်မှန်း", "🚪 Logout"] // 🆕 ခလုတ်အသစ်
        ],
        resize_keyboard: true
    }
};

const settingsMenu = {
    reply_markup: {
        keyboard: [
            ["🎲 Set Bet Plan", "🛑 Set Stop Limit"],
            ["⚠️ Set Loss Start", "🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

const autoModeMenu = {
    reply_markup: {
        keyboard: [
            ["🔄 Follow Pattern (နောက်လိုက်ထိုး)"],
            ["🤖 AI Correction (AIမှားမှထိုး)"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);

    // Manual Bet Amount Input
    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const nextIssue = res?.data?.list ? (BigInt(res.data.list[0].issueNumber) + 1n).toString() : null;
        
        if (!nextIssue) {
            await bot.sendMessage(chatId, "❌ ပွဲစဉ်ရယူ၍မရပါ။");
            data.pendingSide = null;
            saveUserData(chatId, data);
            return;
        }
        await placeBetNow(chatId, data.pendingSide, amount, nextIssue, -1, false);
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }

    if (text === '/start') {
        data.running = false;
        data.token = null;
        data.phone = null;
        data.totalProfit = 0;
        data.betHistory = [];
        data.aiLogs = [];
        data.autoRunning = false;
        data.autoMode = null;
        data.manualBetLock = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🎯 WinGo Sniper Pro - Hot/Cold Analysis 🎯\n\nအင်္ဂါရပ်အသစ်:\n🧠 Hot/Cold Numbers ခွဲခြမ်းစိတ်ဖြာနိုင်ပါပြီ။\n\nဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }

    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ Login first!");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးချယ်ပါ:", autoModeMenu);
    }

    if (text === "🔄 Follow Pattern (နောက်လိုက်ထိုး)") {
        data.autoRunning = true;
        data.autoMode = 'follow';
        data.currentBetStep = 0;
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ Follow Pattern Mode Started!\n\nပွဲအသစ်စတာနဲ့ နောက်ဆုံးရလဒ်ကို ချက်ချင်းလိုက်ထိုးပါမည်။\nStop Limit: " + data.stopLimit + " နိုင်ရင်ရပ်မည်။", mainMenu);
    }

    if (text === "🤖 AI Correction (AIမှားမှထိုး)") {
        data.autoRunning = true;
        data.autoMode = 'ai_correction';
        data.currentBetStep = 0;
        data.consecutiveWins = 0;
        data.consecutiveLosses = 0;
        data.manualBetLock = false;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, "✅ AI Correction Mode Started!\n\nAI ခန့်မှန်းချက် " + data.lossStartLimit + " ပွဲဆက်မှားမှ စတင်ထိုးပါမည်။\nStop Limit: " + data.stopLimit + " နိုင်ရင်ရပ်မည်။", mainMenu);
    }

    if (text === "🛑 Stop Auto") {
        data.autoRunning = false;
        data.autoMode = null;
        data.currentBetStep = 0;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Auto Bet Stopped!", mainMenu);
    }

    // 🆕 AI Hot/Cold ခေါ် ခန့်မှန်းချက်အသစ်
    if (text === "🧠 AI Hot/Cold ခန့်မှန်း") {
        await analyzeBestBet(chatId);
        return;
    }

    if (text === "📊 Status") {
        let modeText = "⚪️ Manual Only";
        if (data.autoRunning) {
            modeText = data.autoMode === 'follow' ? "🟢 Follow Mode" : "🟡 AI Correction";
        }
        let lockText = data.manualBetLock ? "🔒 Locked" : "🔓 Ready";
        let status = `📊 Current Status\n━━━━━━━━━━━━━━━━\n`;
        status += `🤖 Mode: ${modeText}\n`;
        status += `🔐 Auto Status: ${lockText}\n`;
        status += `📋 Bet Plan: ${data.betPlan.join(' → ')}\n`;
        status += `🏆 Stop Limit: ${data.stopLimit} win(s)\n`;
        status += `⚠️ Loss Start: ${data.lossStartLimit} AI loss(es)\n`;
        status += `📈 Current Step: ${data.currentBetStep+1}/${data.betPlan.length}\n`;
        status += `✅ Win Count: ${data.consecutiveWins}/${data.stopLimit}\n`;
        status += `❌ AI Losses: ${data.consecutiveLosses}/${data.lossStartLimit}\n`;
        status += `💰 Total Profit: ${data.totalProfit.toFixed(2)} MMK`;
        return bot.sendMessage(chatId, status);
    }

    if (text === "⚙️ Settings") {
        return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    }

    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,60,90,150,250,400,650");
    }

    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\nဥပမာ: 3");
    }

    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚠️ Loss Start Limit ထည့်ပါ (AI ဘယ်နှစ်ပွဲမှားရင် စထိုးမလဲ)\n\nဥပမာ: 1");
    }

    if (text === "🔙 Main Menu") {
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 Bet History\n💰 Total: ${data.totalProfit.toFixed(2)} MMK\n------------------\n`;
        data.betHistory.slice(0, 20).forEach(h => {
            const type = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnl = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${type} | ${h.issue} | ${h.side} | ${h.amount} ${pnl}\n`;
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }

    if (text === "📈 AI History") {
        const txt = formatFullAIHistory(data.aiLogs);
        return bot.sendMessage(chatId, txt);
    }

    if (text === "🚪 Logout") {
        data.running = false;
        data.token = null;
        data.autoRunning = false;
        data.manualBetLock = false;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }

    // Handle Settings Input
    if (data.settingMode) {
        const mode = data.settingMode;
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
                await bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid format.");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                await bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s)`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start updated: ${num} AI loss(es)`);
            } else {
                await bot.sendMessage(chatId, "❌ Invalid number (1-10).");
            }
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }

    // Login
    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.phone = data.tempPhone;
            data.running = true;
            delete data.tempPhone;
            saveUserData(chatId, data);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, "✅ Login Success!\n\nStart Auto နှိပ်ပြီး Mode ရွေးချယ်ပါ။\n🧠 Hot/Cold ခွဲခြမ်းစိတ်ဖြာရန် 'AI Hot/Cold ခန့်မှန်း' ကိုနှိပ်ပါ။", mainMenu);
        } else {
            await bot.sendMessage(chatId, "❌ Login Failed!");
            delete data.tempPhone;
            saveUserData(chatId, data);
        }
        return;
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const action = query.data;
    const data = getUserData(chatId);
    
    // 🆕 AI Analysis မှ ထိုးမည့် ခလုတ်
    if (action.startsWith('bestbet_')) {
        const side = action.split('_')[1];
        data.pendingSide = side;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 ${side === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
        return;
    }
    
    // 🔄 ပြန်လည်စစ်ဆေးရန် ခလုတ်
    if (action === 'refresh_analysis') {
        await analyzeBestBet(chatId);
        return;
    }
    
    // ပုံမှန် Manual Bet ခလုတ်
    if (action.startsWith('bet_')) {
        data.pendingSide = action.split('_')[1];
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `💰 ${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
        return;
    }
});

console.log("✅ Bot running - Hot/Cold Analysis Feature Enabled");
