const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Render Alive Fix
http.createServer((req, res) => { res.end('WinGo v81: Multi-Brain + Auto Bet System'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- 🛡️ Security & API Helpers ---
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

// --- 🧠 Multi-Brain AI Signal Logic ---
function runAI(history) {
    const resArr = history.map(i => (parseInt(i.number) >= 5 ? "Big" : "Small"));
    const last = resArr[0];

    let b1_side = (resArr[0] === resArr[2]) ? (resArr[1] === "Big" ? "Small" : "Big") : (resArr[0] === "Big" ? "Small" : "Big");
    let dragon = 1;
    for(let i=0; i<resArr.length-1; i++) { 
        if(resArr[i] === resArr[i+1]) dragon++; 
        else break; 
    }
    let b2_side = (dragon >= 3) ? last : (last === "Big" ? "Small" : "Big");
    let bigs = resArr.slice(0, 10).filter(x => x === "Big").length;
    let b3_side = bigs >= 6 ? "Small" : "Big";

    let votes = { Big: 0, Small: 0 };
    votes[b1_side]++;
    votes[b2_side]++;
    votes[b3_side]++;

    let finalSide = votes.Big > votes.Small ? "Big" : "Small";
    let confidence = votes[finalSide] === 3 ? "HIGH 🔥" : "NORMAL ⚡";
    let patternTxt = (dragon >= 3) ? "Dragon Mode 🐉" : "Brain Voting 🧠";

    return { 
        side: finalSide, 
        dragon: dragon, 
        calc: `${resArr[2].charAt(0)}-${resArr[1].charAt(0)}-${resArr[0].charAt(0)}`, 
        pattern: patternTxt,
        confidence: confidence,
        brainInfo: `B1:${b1_side.charAt(0)}|B2:${b2_side.charAt(0)}|B3:${b3_side.charAt(0)}`
    };
}

// ========== 🆕 AUTO BET SYSTEM (ADDED) ==========
const DEFAULT_BET_PLAN = [10, 30, 90, 170, 610, 1800, 3800, 6000];
const DEFAULT_STOP_LIMIT = 1;
const DEFAULT_LOSS_LIMIT = 7;

async function placeAutoBet(chatId, side, amount, stepIndex) {
    const data = user_db[chatId];
    if (!data || !data.token) return false;
    
    const fresh = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, data.token);
    const targetIssue = fresh?.data?.list ? (BigInt(fresh.data.list[0].issueNumber) + 1n).toString() : data.nextIssue;
    
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
        return true;
    }
    return false;
}

async function executeAutoBet(chatId, isWin) {
    const data = user_db[chatId];
    if (!data.autoBetActive) return;
    
    if (isWin) {
        // WIN: Reset everything
        data.autoBetActive = false;
        data.consecutiveLosses = 0;
        data.consecutiveWins++;
        data.currentBetStep = 0;
        
        if (data.consecutiveWins >= data.stopLimit) {
            bot.sendMessage(chatId, `🛑 Auto Bet Stopped: ${data.stopLimit} win(s) reached.`);
            data.autoBetActive = false;
            data.consecutiveWins = 0;
        } else {
            bot.sendMessage(chatId, `✅ Auto Bet WIN! Reset. Losses: 0`);
        }
    } else {
        // LOSS
        data.consecutiveLosses++;
        data.consecutiveWins = 0;
        
        // Check loss limit
        if (data.consecutiveLosses >= data.lossLimit && data.autoMode === "trigger") {
            bot.sendMessage(chatId, `🛑 Auto Bet Stopped: ${data.lossLimit} consecutive losses reached.`);
            data.autoBetActive = false;
            data.consecutiveLosses = 0;
            data.currentBetStep = 0;
            return;
        }
        
        if (data.autoMode === "martingale") {
            // Mode A: Bet every time after loss
            if (data.currentBetStep + 1 < data.betPlan.length) {
                data.currentBetStep++;
                const nextAmount = data.betPlan[data.currentBetStep];
                const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                if (success) {
                    bot.sendMessage(chatId, `🤖 Auto Bet #${data.currentBetStep+1} | ${data.autoSide} | Amount: ${nextAmount} MMK`);
                } else {
                    data.autoBetActive = false;
                }
            } else {
                bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                data.autoBetActive = false;
                data.currentBetStep = 0;
            }
        } 
        else if (data.autoMode === "trigger") {
            // Mode B: Only start after 7 losses, then continue
            if (data.consecutiveLosses >= 7 && !data.autoBetActive) {
                // Start auto bet
                data.autoBetActive = true;
                data.currentBetStep = 0;
                const firstAmount = data.betPlan[0];
                const success = await placeAutoBet(chatId, data.autoSide, firstAmount, 0);
                if (success) {
                    bot.sendMessage(chatId, `⚠️ 7 Losses! Starting Auto Bet: ${data.autoSide} | ${firstAmount} MMK`);
                }
            }
            else if (data.autoBetActive) {
                // Continue auto bet steps
                if (data.currentBetStep + 1 < data.betPlan.length) {
                    data.currentBetStep++;
                    const nextAmount = data.betPlan[data.currentBetStep];
                    const success = await placeAutoBet(chatId, data.autoSide, nextAmount, data.currentBetStep);
                    if (success) {
                        bot.sendMessage(chatId, `🤖 Auto Bet #${data.currentBetStep+1} | ${data.autoSide} | Amount: ${nextAmount} MMK`);
                    } else {
                        data.autoBetActive = false;
                    }
                } else {
                    bot.sendMessage(chatId, `❌ Max bet step reached! Auto Bet Stopped.`);
                    data.autoBetActive = false;
                    data.currentBetStep = 0;
                }
            }
        }
    }
}

// ========== MODIFIED MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (user_db[chatId]?.running) {
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, data.token);
        
        if (res?.msgCode === 0 && res.data?.list?.length > 0) {
            const history = res.data.list;
            const lastRound = history[0];

            if (lastRound.issueNumber !== data.last_issue) {
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                let autoMsg = "";
                let roundProfit = 0;

                // Check pending bets (both manual and auto)
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
                        } else if (!pendingBet.isAuto && data.last_pred) {
                            // Update consecutive loss for manual bet tracking
                            const isPredWin = data.last_pred === realSide;
                            if (!isPredWin) {
                                data.consecutiveLosses++;
                                data.consecutiveWins = 0;
                            } else {
                                data.consecutiveLosses = 0;
                                data.consecutiveWins++;
                            }
                        }
                    }
                    data.totalProfit += roundProfit;
                }

                if (data.last_pred) {
                    const isWin = data.last_pred === realSide;
                    const statusEmoji = isWin ? "အနိုင်ရရှိသည်🏆" : "ရှုံးနိမ့်သည်💔";
                    
                    data.aiLogs.unshift({ status: isWin ? "✅" : "❌", issue: lastRound.issueNumber.slice(-3), result: realSide });
                    if (data.aiLogs.length > 50) data.aiLogs.pop();

                    const pnlSign = roundProfit >= 0 ? "+" : "";
                    autoMsg = `💥 **BIGWIN VIP SIGNAL** 💥\n━━━━━━━━━━━━━━━━\n🗓 Period : ${lastRound.issueNumber}\n🎰 Pick   : ${data.last_pred.toUpperCase()}\n🎲 Status : ${statusEmoji} | ${realSide.toUpperCase()}(${lastRound.number})\n💰 ပွဲစဉ်အမြတ် : **${pnlSign}${roundProfit.toFixed(2)}** MMK\n💵 စုစုပေါင်း : **${data.totalProfit.toFixed(2)}** MMK\n\n`;
                    
                    autoMsg += `📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၂၀ ပွဲ)**\n------------------\n`;
                    data.aiLogs.slice(0, 20).forEach(l => { autoMsg += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
                    autoMsg += `\n`;
                }

                const ai = runAI(history);
                data.last_issue = lastRound.issueNumber;
                data.nextIssue = (BigInt(lastRound.issueNumber) + 1n).toString();
                
                // Store for auto bet
                data.autoSide = ai.side;
                data.last_pred = ai.side;

                // Auto bet trigger check (only if no pending auto bet)
                const hasPendingAuto = data.betHistory.some(b => b.status === "⏳ Pending" && b.isAuto);
                if (data.autoMode === "martingale" && !hasPendingAuto && data.autoBetActive === undefined) {
                    // Start martingale on first signal
                    data.autoBetActive = true;
                    data.currentBetStep = 0;
                    data.consecutiveLosses = 0;
                    const success = await placeAutoBet(chatId, ai.side, data.betPlan[0], 0);
                    if (success) {
                        bot.sendMessage(chatId, `🤖 Auto Bet Started (Martingale): ${ai.side} | ${data.betPlan[0]} MMK`);
                    }
                }

                const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });
                let modeText = data.autoMode === "martingale" ? "Martingale (Loss→Bet)" : "Trigger (7 Loss→Bet)";
                let autoStatus = data.autoBetActive ? "ACTIVE ✅" : "STANDBY ⏳";
                
                const nextMsg = `🚀 **AI Multi-Brain Analysis**\n━━━━━━━━━━━━━━━━\n🧠 Logic: \`${ai.brainInfo}\`\n🛡 Pattern: \`${ai.pattern}\`\n🐉 Dragon: \`${ai.dragon}\` ပွဲဆက်\n🦸AI ခန့်မှန်း🕵️: **${ai.side === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}🧑‍💻**\n📊 Confidence: \`${ai.confidence}\` (${mmTime})\n🕒 ပွဲစဉ်: \`${data.nextIssue.slice(-5)}\`\n🤖 Mode: ${modeText} | Status: ${autoStatus}\n📉 Loss Streak: ${data.consecutiveLosses || 0}`;

                await bot.sendMessage(chatId, (autoMsg + nextMsg), {
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

// ========== MENU & SETTINGS ==========
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

// --- 📱 Handlers ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!user_db[chatId]) {
        user_db[chatId] = { 
            running: false, aiLogs: [], betHistory: [], totalProfit: 0, token: null,
            betPlan: [...DEFAULT_BET_PLAN],
            stopLimit: DEFAULT_STOP_LIMIT,
            lossLimit: DEFAULT_LOSS_LIMIT,
            autoMode: "martingale",
            autoBetActive: false,
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
            bot.sendMessage(chatId, `✅ **${data.pendingSide}** မှာ **${amount}** MMK ထိုးပြီးပါပြီ။`);
            data.betHistory.unshift({ issue: targetIssue.slice(-5), side: data.pendingSide, amount, status: "⏳ Pending", pnl: 0, isAuto: false });
        } else { bot.sendMessage(chatId, `❌ Error: \`${res ? res.message : "Error"}\``); }
        user_db[chatId].pendingSide = null; return;
    }

    // Settings commands
    if (text === "⚙️ Settings") {
        const data = user_db[chatId];
        const msg = `⚙️ **Auto Bet Settings**\n━━━━━━━━━━━━━━━━\n📋 Bet Plan: \`${data.betPlan.join(', ')}\`\n🏆 Stop Limit: \`${data.stopLimit}\` win(s)\n💔 Loss Limit: \`${data.lossLimit}\` loss(es)\n🔄 Mode: \`${data.autoMode === "martingale" ? "Martingale (Loss→Bet)" : "Trigger (7 Loss→Bet)"}\`\n🤖 Status: ${data.autoBetActive ? "RUNNING ✅" : "STOPPED ❌"}\n📉 Current Loss Streak: ${data.consecutiveLosses}`;
        return bot.sendMessage(chatId, msg, settingsMenu);
    }
    
    if (text === "🎲 Set Bet Plan") {
        user_db[chatId].settingMode = "betplan";
        return bot.sendMessage(chatId, "📝 Bet Plan ထည့်ပါ (comma separated, e.g., 10,30,90,170,610,1800,3800,6000):");
    }
    
    if (text === "🛑 Set Stop Limit") {
        user_db[chatId].settingMode = "stoplimit";
        return bot.sendMessage(chatId, "🏆 Stop Limit ထည့်ပါ (အနိုင်ပွဲအရေအတွက်, e.g., 1 or 2):");
    }
    
    if (text === "⚠️ Set Loss Limit") {
        user_db[chatId].settingMode = "losslimit";
        return bot.sendMessage(chatId, "💔 Loss Limit ထည့်ပါ (အရှုံးပွဲအရေအတွက်, e.g., 7):");
    }
    
    if (text === "🔄 Select Mode") {
        user_db[chatId].settingMode = "mode";
        return bot.sendMessage(chatId, "Mode ရွေးပါ:\n1 - Martingale (ရှုံးတိုင်းဆက်ထိုး)\n2 - Trigger Mode (ရှုံး7ပွဲမှစထိုး)");
    }
    
    if (text === "✅ Start Auto Bet") {
        user_db[chatId].autoBetActive = true;
        user_db[chatId].currentBetStep = 0;
        user_db[chatId].consecutiveLosses = 0;
        user_db[chatId].consecutiveWins = 0;
        bot.sendMessage(chatId, `✅ Auto Bet Started! Mode: ${user_db[chatId].autoMode === "martingale" ? "Martingale" : "Trigger (7 Loss)"}`, mainMenu);
    }
    
    if (text === "❌ Stop Auto Bet") {
        user_db[chatId].autoBetActive = false;
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
                bot.sendMessage(chatId, `✅ Bet Plan updated: ${numbers.join(', ')}`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid format. Use: 10,30,90,170");
            }
        } else if (mode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                user_db[chatId].stopLimit = num;
                bot.sendMessage(chatId, `✅ Stop Limit updated: ${num} win(s)`);
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
                bot.sendMessage(chatId, "✅ Mode changed to: Martingale (ရှုံးတိုင်းဆက်ထိုး)");
            } else if (text === "2") {
                user_db[chatId].autoMode = "trigger";
                bot.sendMessage(chatId, "✅ Mode changed to: Trigger Mode (ရှုံး7ပွဲမှစထိုး)");
            } else {
                bot.sendMessage(chatId, "❌ Invalid. Type 1 or 2");
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
            betPlan: [...DEFAULT_BET_PLAN], stopLimit: DEFAULT_STOP_LIMIT, lossLimit: DEFAULT_LOSS_LIMIT,
            autoMode: "martingale", autoBetActive: false, currentBetStep: 0,
            consecutiveLosses: 0, consecutiveWins: 0, autoSide: null
        };
        return bot.sendMessage(chatId, "🤖 **WinGo VIP Master v81.0**\nဖုန်းနံပါတ် ပေးပါ:", mainMenu);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 **နိုင်/ရှုံး အသေးစိတ်မှတ်တမ်း**\n💰 စုစုပေါင်းအမြတ်: **${user_db[chatId].totalProfit.toFixed(2)}** MMK\n------------------\n`;
        user_db[chatId].betHistory.slice(0, 20).forEach(h => { 
            const autoTag = h.isAuto ? "[AUTO]" : "[MANUAL]";
            const pnlTxt = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? "+" : ""}${h.pnl})`;
            txt += `${h.status} ${autoTag} | ပွဲ: ${h.issue} | ${h.side} | ${h.amount} ${pnlTxt}\n`; 
        });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📈 AI History") {
        let txt = "📈 **AI ခန့်မှန်းချက် မှတ်တမ်း (၅၀ ပွဲ)**\n------------------\n";
        user_db[chatId].aiLogs.slice(0, 30).forEach(l => { txt += `${l.status} ပွဲ: ${l.issue} | ရလဒ်: ${l.result}\n`; });
        return bot.sendMessage(chatId, txt || "မှတ်တမ်းမရှိပါ။");
    }

    if (text === "📊 Website (100)") {
        const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 20, typeId: 30 }, user_db[chatId].token);
        let list = "📊 **ဂိမ်းရလဒ် ၂၀ ပွဲ**\n------------------\n";
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
            bot.sendMessage(chatId, "✅ Login အောင်မြင်သည်။ VIP Signal စောင့်ကြည့်နေပါသည်-", mainMenu);
        } else { 
            bot.sendMessage(chatId, "❌ Login မှားယွင်းသည်။"); 
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
