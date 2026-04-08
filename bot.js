const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

http.createServer((req, res) => { res.end('WinGo v90: 10 AI Brain System'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Security & API Helpers ---
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
    const payload = { ...data, language: 0, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 12000 });
        return res.data;
    } catch (e) { return null; }
}

// ========== 🧠 10 AI BRAIN SYSTEM ==========

function getHistoryArray(history) {
    return history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
}

// AI 1: Pattern Hunter (နောက်ဆုံး 3 ပွဲ pattern)
function aiPatternHunter(historyArr) {
    if (historyArr.length < 3) return null;
    const last3 = historyArr.slice(0, 3);
    // Pattern: A-B-A ဆိုရင် B ရဲ့ဆန့်ကျင်ဘက်
    if (last3[0] === last3[2]) {
        return last3[1] === "Big" ? "Small" : "Big";
    }
    // Pattern: A-A-B ဆိုရင် B အတိုင်း
    if (last3[0] === last3[1]) {
        return last3[2];
    }
    return null;
}

// AI 2: Dragon Follower (ဆက်တိုက်ကြီး/သေး)
function aiDragonFollower(historyArr) {
    let dragon = 1;
    for(let i = 0; i < historyArr.length - 1; i++) {
        if(historyArr[i] === historyArr[i+1]) dragon++;
        else break;
    }
    if(dragon >= 3) return historyArr[0]; // ဆက်ထိုး
    return null; // မသေချာရင် null
}

// AI 3: Probability Master (၁၀ ပွဲအချိုး)
function aiProbabilityMaster(historyArr) {
    const last10 = historyArr.slice(0, 10);
    const bigCount = last10.filter(x => x === "Big").length;
    if(bigCount >= 6) return "Small";
    if(bigCount <= 4) return "Big";
    return null;
}

// AI 4: Alternation Detector (တလှည့်စီကျလား)
function aiAlternationDetector(historyArr) {
    if(historyArr.length < 4) return null;
    let isAlternating = true;
    for(let i = 0; i < 3; i++) {
        if(historyArr[i] === historyArr[i+1]) {
            isAlternating = false;
            break;
        }
    }
    if(isAlternating) {
        // တလှည့်စီကျနေရင် နောက်တစ်လှည့် ဆန့်ကျင်ဘက်
        return historyArr[0] === "Big" ? "Small" : "Big";
    }
    return null;
}

// AI 5: Smart Reversal (၃ ပွဲဆက်တူရင် ပြောင်း)
function aiSmartReversal(historyArr) {
    if(historyArr.length < 3) return null;
    if(historyArr[0] === historyArr[1] && historyArr[1] === historyArr[2]) {
        return historyArr[0] === "Big" ? "Small" : "Big";
    }
    return null;
}

// AI 6: Momentum Tracker (နောက်ဆုံး ၅ ပွဲ momentum)
function aiMomentumTracker(historyArr) {
    const last5 = historyArr.slice(0, 5);
    const bigCount = last5.filter(x => x === "Big").length;
    if(bigCount >= 4) return "Big";
    if(bigCount <= 1) return "Small";
    return null;
}

// AI 7: Fibonacci Pattern
function aiFibonacciPattern(historyArr) {
    // Fibonacci အလိုက် 1,2,3,5,8 ပွဲအလိုက် pattern
    if(historyArr.length < 8) return null;
    const positions = [1, 2, 3, 5, 8];
    let bigVotes = 0, smallVotes = 0;
    for(let pos of positions) {
        if(historyArr[pos-1] === "Big") bigVotes++;
        else smallVotes++;
    }
    if(bigVotes > smallVotes) return "Big";
    if(smallVotes > bigVotes) return "Small";
    return null;
}

// AI 8: Gap Analyzer (Big/Small ကွာဟချက်)
function aiGapAnalyzer(historyArr) {
    const last20 = historyArr.slice(0, 20);
    const bigCount = last20.filter(x => x === "Big").length;
    const smallCount = 20 - bigCount;
    const gap = Math.abs(bigCount - smallCount);
    if(gap >= 6) {
        // ကွာဟမှုများနေရင် နည်းတဲ့ဘက်ကို ပြန်လာ
        return bigCount > smallCount ? "Small" : "Big";
    }
    return null;
}

// AI 9: Trend Extender (လက်ရှိ trend အတိုင်း)
function aiTrendExtender(historyArr) {
    if(historyArr.length < 3) return null;
    if(historyArr[0] === historyArr[1] && historyArr[1] === historyArr[2]) {
        return historyArr[0]; // trend ဆက်ထိုး
    }
    return null;
}

// AI 10: Contrarian (လူအများစုရဲ့ဆန့်ကျင်ဘက်)
function aiContrarian(historyArr) {
    const last10 = historyArr.slice(0, 10);
    const bigCount = last10.filter(x => x === "Big").length;
    // လူအများစုထိုးမယ့်ဘက်ကို ဆန့်ကျင်
    if(bigCount >= 7) return "Small";
    if(bigCount <= 3) return "Big";
    return null;
}

// 🗳️ Voting System with Weight
function votingSystem(historyArr) {
    const ais = [
        { name: "Pattern Hunter", func: aiPatternHunter, weight: 2 },
        { name: "Dragon Follower", func: aiDragonFollower, weight: 2 },
        { name: "Probability Master", func: aiProbabilityMaster, weight: 1 },
        { name: "Alternation Detector", func: aiAlternationDetector, weight: 1 },
        { name: "Smart Reversal", func: aiSmartReversal, weight: 2 },
        { name: "Momentum Tracker", func: aiMomentumTracker, weight: 1 },
        { name: "Fibonacci Pattern", func: aiFibonacciPattern, weight: 1 },
        { name: "Gap Analyzer", func: aiGapAnalyzer, weight: 1 },
        { name: "Trend Extender", func: aiTrendExtender, weight: 2 },
        { name: "Contrarian", func: aiContrarian, weight: 1 }
    ];
    
    let votes = { Big: 0, Small: 0 };
    let aiResults = [];
    
    for(let ai of ais) {
        const prediction = ai.func(historyArr);
        if(prediction) {
            votes[prediction] += ai.weight;
            aiResults.push(`${ai.name}: ${prediction} (w${ai.weight})`);
        } else {
            aiResults.push(`${ai.name}: Pass`);
        }
    }
    
    let finalSide = votes.Big > votes.Small ? "Big" : "Small";
    let totalVotes = votes.Big + votes.Small;
    let confidencePercent = totalVotes > 0 ? Math.round((votes[finalSide] / totalVotes) * 100) : 50;
    let confidenceLevel = confidencePercent >= 70 ? "HIGH 🔥" : (confidencePercent >= 55 ? "MEDIUM ⚡" : "LOW ⚠️");
    
    return {
        side: finalSide,
        votes: votes,
        confidence: confidenceLevel,
        confidencePercent: confidencePercent,
        aiResults: aiResults,
        totalActiveAIs: aiResults.filter(r => !r.includes("Pass")).length
    };
}

// --- Dragon detection for display
function getDragonCount(historyArr) {
    let dragon = 1;
    for(let i = 0; i < historyArr.length - 1; i++) {
        if(historyArr[i] === historyArr[i+1]) dragon++;
        else break;
    }
    return dragon;
}

// --- Auto Bet Function ---
async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = user_db[chatId];
    if (!data || !data.token) {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: No token.`);
        return false;
    }
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    if (!fresh?.data?.list) {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: Cannot get current game.`);
        return false;
    }
    
    const targetIssue = (BigInt(fresh.data.list[0].issueNumber) + 1n).toString();
    
    let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
    if (baseUnit < 10) baseUnit = 10;
    
    const betPayload = { 
        typeId: 30, 
        issuenumber: targetIssue, 
        gameType: 2, 
        amount: Math.floor(baseUnit), 
        betCount: Math.floor(amount / baseUnit), 
        selectType: side === "Big" ? 13 : 14, 
        isAgree: true 
    };
    
    const res = await callApi("GameBetting", betPayload, data.token);
    
    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        data.betHistory.unshift({ 
            issue: targetIssue.slice(-5), 
            side, 
            amount, 
            status: "⏳ Pending", 
            pnl: 0,
            isAuto: true,
            autoStep: stepIndex
        });
        bot.sendMessage(chatId, `✅ [AUTO] ${side} | ${amount} MMK | Step ${stepIndex+1}/${data.betPlan.length}`);
        return true;
    } else {
        bot.sendMessage(chatId, `❌ Auto Bet Failed: ${res?.message || res?.msg || "Unknown"}`);
        return false;
    }
}

// --- Execute Auto Bet Logic ---
async function executeAutoBet(chatId, isWin) {
    const data = user_db[chatId];
    if (!data.autoBetActive) return;
    
    if (isWin) {
        data.consecutiveWins++;
        data.consecutiveLosses = 0;
        
        bot.sendMessage(chatId, `✅ Auto Bet WIN! (${data.consecutiveWins}/${data.stopLimit} wins needed to stop)`);
        
        if (data.consecutiveWins >= data.stopLimit) {
            bot.sendMessage(chatId, `🛑 **Stop Limit Reached!** (${data.stopLimit} wins)\nAuto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.consecutiveWins = 0;
            data.currentBetStep = 0;
            return;
        }
        
        data.currentBetStep = 0;
        const nextAmount = data.betPlan[0];
        bot.sendMessage(chatId, `📈 WIN! Continuing with ${nextAmount} MMK`);
        const success = await placeAutoBet(chatId, data.autoSide, nextAmount, 0);
        if (!success) {
            data.autoBetActive = false;
            data.autoBetStarted = false;
        }
        return;
    }
    
    // LOSS
    data.consecutiveLosses++;
    data.consecutiveWins = 0;
    
    bot.sendMessage(chatId, `❌ Auto Bet LOSS! (Loss streak: ${data.consecutiveLosses})`);
    
    if (data.autoMode === "martingale") {
        const nextStep = data.currentBetStep + 1;
        
        if (nextStep < data.betPlan.length) {
            data.currentBetStep = nextStep;
            const nextAmount = data.betPlan[data.currentBetStep];
            bot.sendMessage(chatId, `📉 LOSS! Next: ${data.autoSide} | ${nextAmount} MMK (Step ${data.currentBetStep+1}/${data.betPlan.length})`);
            
            const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
            if (!success) {
                data.autoBetActive = false;
                data.autoBetStarted = false;
            }
        } else {
            bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
            data.autoBetActive = false;
            data.autoBetStarted = false;
            data.currentBetStep = 0;
        }
    }
    else if (data.autoMode === "trigger") {
        if (data.consecutiveLosses >= 7 && !data.autoBetActive && !data.autoBetStarted) {
            data.autoBetActive = true;
            data.autoBetStarted = true;
            data.currentBetStep = 0;
            const firstAmount = data.betPlan[0];
            bot.sendMessage(chatId, `⚠️ 7 Losses! Starting Auto Bet: ${data.autoSide} | ${firstAmount} MMK`);
            const success = await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
            if (!success) {
                data.autoBetActive = false;
                data.autoBetStarted = false;
            }
        }
        else if (data.autoBetActive) {
            const nextStep = data.currentBetStep + 1;
            if (nextStep < data.betPlan.length) {
                data.currentBetStep = nextStep;
                const nextAmount = data.betPlan[data.currentBetStep];
                bot.sendMessage(chatId, `📉 LOSS! Next: ${data.autoSide} | ${nextAmount} MMK`);
                const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                if (!success) {
                    data.autoBetActive = false;
                    data.autoBetStarted = false;
                }
            } else {
                bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                data.autoBetActive = false;
                data.autoBetStarted = false;
                data.currentBetStep = 0;
            }
        }
    }
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];
            const historyArr = getHistoryArray(history);

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let roundProfit = 0;

                // Check pending bets
                let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === lastRound.issueNumber.slice(-5));
                if (pendingBet) {
                    const isWin = pendingBet.side === realSide;
                    if (isWin) {
                        pendingBet.status = "✅ WIN";
                        pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                        roundProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            await executeAutoBet(chatId, true);
                        }
                    } else {
                        pendingBet.status = "❌ LOSS";
                        pendingBet.pnl = -pendingBet.amount;
                        roundProfit += pendingBet.pnl;
                        if (pendingBet.isAuto) {
                            await executeAutoBet(chatId, false);
                        }
                    }
                    data.totalProfit += roundProfit;
                }

                // 🧠 Run 10 AI Voting System
                const aiResult = votingSystem(historyArr);
                const dragonCount = getDragonCount(historyArr);
                data.autoSide = aiResult.side;
                data.last_pred = aiResult.side;

                // Update AI logs
                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    data.aiLogs.unshift({ 
                        status: isWin ? "✅" : "❌", 
                        issue: lastRound.issueNumber.slice(-3), 
                        result: realSide,
                        prediction: data.last_pred,
                        confidence: aiResult.confidencePercent
                    });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();
                }

                // Start Martingale Auto Bet
                const hasPendingAuto = data.betHistory.some(b => b.status === "⏳ Pending" && b.isAuto);
                if (data.autoMode === "martingale" && data.autoBetActive && !hasPendingAuto && !data.autoBetStarted) {
                    data.autoBetStarted = true;
                    data.currentBetStep = 0;
                    data.consecutiveLosses = 0;
                    data.consecutiveWins = 0;
                    const firstAmount = data.betPlan[0];
                    bot.sendMessage(chatId, `🤖 Starting Martingale: ${aiResult.side} | ${firstAmount} MMK`);
                    const success = await placeAutoBet(chatId, aiResult.side, firstAmount, 0);
                    if (!success) {
                        data.autoBetActive = false;
                        data.autoBetStarted = false;
                    }
                }

                // Send message with AI details
                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                
                // Build AI results summary
                let aiSummary = "";
                for(let i = 0; i < aiResult.aiResults.length; i++) {
                    aiSummary += `\n${i+1}. ${aiResult.aiResults[i]}`;
                }
                
                let msg = `🧠 **10-AI VOTING SYSTEM** 🧠\n━━━━━━━━━━━━━━━━━━━━━━\n🐉 Dragon: ${dragonCount} ပွဲဆက်\n🗳️ **Voting Result**\n🔵 BIG: ${aiResult.votes.Big} votes\n🔴 SMALL: ${aiResult.votes.Small} votes\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 **FINAL PREDICTION: ${aiResult.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}**\n📊 Confidence: ${aiResult.confidence} (${aiResult.confidencePercent}%)\n✅ Active AIs: ${aiResult.totalActiveAIs}/10\n━━━━━━━━━━━━━━━━━━━━━━\n🤖 **Individual AI Results**${aiSummary}\n━━━━━━━━━━━━━━━━━━━━━━\n⏰ Time: ${mmTime}\n🕒 ပွဲစဉ်: \`${data.nextIssue?.slice(-5) || "..."}\`\n━━━━━━━━━━━━━━━━━━━━━━\n🤖 **Auto Bet**\n📋 Plan: ${data.betPlan?.join(' → ') || "N/A"}\n🎯 Mode: ${data.autoMode === "martingale" ? "Martingale" : "Trigger"}\n⚡ Status: ${data.autoBetActive ? "ACTIVE ✅" : "STANDBY ⏳"}\n🏆 Stop Limit: ${data.stopLimit} win(s)\n📉 Loss Streak: ${data.consecutiveLosses || 0}`;
                
                await bot.sendMessage(chatId, msg, {
                    reply_markup: { 
                        inline_keyboard: [[
                            { text: "🔵 Big (ကြီး)", callback_data: "bet_Big" },
                            { text: "🔴 Small (သေး)", callback_data: "bet_Small" }
                        ]]
                    }
                });
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

// --- Menu ---
const mainMenu = { 
    reply_markup: { 
        keyboard: [["📊 Website (100)", "📜 Bet History"], ["📈 AI History", "⚙️ Settings"], ["🚪 Logout"]], 
        resize_keyboard: true 
    } 
};

const settingsMenu = {
    reply_markup: {
        keyboard: [
            ["🎲 Set Bet Plan", "🛑 Set Stop Limit"],
            ["⚠️ Set Loss Limit", "🔄 Select Mode"],
            ["✅ Start Auto Bet", "❌ Stop Auto Bet"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// --- Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [10, 30, 90, 170, 610, 1800, 3800, 6000],
            stopLimit: 1,
            lossLimit: 7,
            autoMode: "martingale",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            autoSide: null
        };
    }

    // Manual bet amount input
    if (user_db[chatId].pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        const data = user_db[chatId];
        const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
        const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;

        let baseUnit = amount < 10000 ? 10 : Math.pow(10, Math.floor(Math.log10(amount)) - 2);
        if (baseUnit < 10) baseUnit = 10;

        const betPayload = { typeId: 30, issuenumber: targetIssue, gameType: 2, amount: Math.floor(baseUnit), betCount: Math.floor(amount / baseUnit), selectType: data.pendingSide === "Big" ? 13 : 14, isAgree: true };
        const res = await callApi("GameBetting", betPayload, data.token);
        
        if (res?.msgCode === 0 || res?.msg === "Bet success") {
            bot.sendMessage(chatId, `✅ [MANUAL] ${data.pendingSide} | ${amount} MMK`);
            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false });
        } else { 
            bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); 
        }
        user_db[chatId].pendingSide = null; 
        return;
    }

    // Settings commands
    if (text === "⚙️ Settings") {
        const data = user_db[chatId];
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n💔 Loss Limit: \`${data.lossLimit}\` loss(es)\n🔄 Mode: \`${data.autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        user_db[chatId].settingMode = "betplan";
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated)\n\nဥပမာ: 10,30,90,170,610,1800,3800,6000");
    }
    
    if (text === "🛑 Set Stop Limit") {
        user_db[chatId].settingMode = "stoplimit";
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်)\n\n1 = 1 ပွဲအနိုင်ရရင် ရပ်\n2 = 2 ပွဲဆက်နိုင်မှ ရပ်");
    }
    
    if (text === "⚠️ Set Loss Limit") {
        user_db[chatId].settingMode = "losslimit";
        return bot.sendMessage(chatId, "💔 Loss Limit ထည့်ပါ (အရှုံးပွဲအရေအတွက်, e.g., 7):");
    }
    
    if (text === "🔄 Select Mode") {
        user_db[chatId].settingMode = "mode";
        return bot.sendMessage(chatId, "🔁 **Mode ရွေးပါ**\n\n1️⃣ **Martingale Mode** - ရှုံးတိုင်း ဆက်ထိုး\n2️⃣ **Trigger Mode** - ရှုံး 7 ပွဲပြည့်မှ စထိုး\n\nကျေးဇူးပြု၍ **1** သို့မဟုတ် **2** ရိုက်ထည့်ပါ။");
    }
    
    if (text === "✅ Start Auto Bet") {
        user_db[chatId].autoBetActive = true;
        user_db[chatId].autoBetStarted = false;
        user_db[chatId].currentBetStep = 0;
        user_db[chatId].consecutiveLosses = 0;
        user_db[chatId].consecutiveWins = 0;
        bot.sendMessage(chatId, `✅ Auto Bet Started!\n\nMode: ${user_db[chatId].autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}\nBet Plan: ${user_db[chatId].betPlan.join(' → ')}\nStop Limit: ${user_db[chatId].stopLimit} win(s)\n\n⏳ Next AI signal ကျမှ စထိုးပါမည်။`, mainMenu);
    }
    
    if (text === "❌ Stop Auto Bet") {
        user_db[chatId].autoBetActive = false;
        user_db[chatId].autoBetStarted = false;
        bot.sendMessage(chatId, "❌ Auto Bet Stopped.", mainMenu);
    }
    
    if (text === "🔙 Main Menu") {
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }
    
    // Handle settings input
    if (user_db[chatId].settingMode) {
        const mode = user_db[chatId].settingMode;
        if (mode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                user_db[chatId].betPlan = numbers;
                user_db[chatId].currentBetStep = 0;
                bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(' → ')}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: 10,30,90");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].stopLimit = num;
                bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s) needed to stop`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "losslimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].lossLimit = num;
                bot.sendMessage(chatId, `✅ Loss Limit updated: ${num} loss(es)`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid number.");
            }
        } else if (mode === "mode") {
            if (text === "1") {
                user_db[chatId].autoMode = "martingale";
                bot.sendMessage(chatId, "✅ **Mode: Martingale** - ရှုံးတိုင်း ဆက်ထိုးမယ်");
            } else if (text === "2") {
                user_db[chatId].autoMode = "trigger";
                bot.sendMessage(chatId, "✅ **Mode: Trigger** - ရှုံး 7 ပွဲပြည့်မှ စထိုးမယ်");
            } else {
                bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ **1** သို့မဟုတ် **2** ရိုက်ထည့်ပါ။");
                return;
            }
        }
        user_db[chatId].settingMode = null;
        return bot.sendMessage(chatId, "Settings updated!", settingsMenu);
    }

    // Original menu commands
    if (text === '/start') {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [10, 30, 90, 170, 610, 1800, 3800, 6000],
            stopLimit: 1,
            lossLimit: 7,
            autoMode: "martingale",
            autoBetActive: false,
            autoBetStarted: false,
            currentBetStep: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            autoSide: null
        };
        return bot.sendMessage(chatId, "🤖 **WinGo v90 - 10 AI System**\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **Bet History**\n💰 Total: **${user_db[chatId].totalProfit.toFixed(2)}** MMK\n------------------\n`;
        user_db[chatId].betHistory.slice(0, 20).forEach(h => { 
            const autoTag = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnlTxt = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${autoTag} | ${h.issue} | ${h.side} | ${h.amount} ${pnlTxt}\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI Prediction History (30 games)**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 30).forEach(l => { 
            txt += `${l.status} | ${l.issue} | Pred: ${l.prediction} | Result: ${l.result} | ${l.confidence}%\n`; 
        });
        return bot.sendMessage(chatId, txt || "No history.");
    }

    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **Last 20 Games**\n------------------\n";
        res?.data?.list?.forEach(i => { list += `🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?'Big':'Small'})\n`; });
        return bot.sendMessage(chatId, list);
    }

    // Login flow
    if (/^\d{9,11}$/.test(text) && !user_db[chatId].token) {
        user_db[chatId].tempPhone = text; 
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }
    
    if (user_db[chatId].tempPhone && !user_db[chatId].token) {
        const username = "95" + user_db[chatId].tempPhone.replace(/^0/, '');
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username: username, pwd: text });
        if (res?.msgCode === 0) {
            user_db[chatId].token = res.data.tokenHeader + " " + res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId, "✅ Login Success! Monitoring...", mainMenu);
        } else { 
            bot.sendMessage(chatId, "❌ Login Failed!"); 
            user_db[chatId].tempPhone = null; 
        }
    }
    
    if (text === "🚪 Logout") {
        user_db[chatId] = { running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null };
        return bot.sendMessage(chatId, "👋 Logged out. Send /start to login again.");
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId, `💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
