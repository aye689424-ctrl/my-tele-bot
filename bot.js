const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Server Keep Alive ---
http.createServer((req, res) => { res.end('WinGo v57: Ultimate Full Suite Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Security & Sign ---
function generateRandomKey() {
    return crypto.randomUUID().replace(/-/g, '');
}
function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32, '0').toUpperCase();
}
async function callApi(endpoint, data, authToken = null) {
    const payload = { ...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now() / 1000) };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken || "" };
    try { const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 15000 }); return res.data; }
    catch (e) { return null; }
}

// --- AI Logic 10 Brain ---
function getAIVote(history) {
    const results = history.slice(0,20).map(i => parseInt(i.number) >= 5 ? "Big":"Small");
    const currentPattern = results.slice(0,3).reverse().join("-");
    let votes = { B:0, S:0, brainDetails:[], warning:"" };

    let dragonCount = 1;
    for(let i=0;i<results.length-1;i++){ if(results[i]===results[i+1]) dragonCount++; else break; }

    if(currentPattern==="Big-Small-Big"){ votes.S+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)"); }
    else if(currentPattern==="Small-Big-Small"){ votes.B+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Trend Analysis"); }

    if(dragonCount>=4){ const side = results[0]==="Big"?"B":"S"; votes[side]+=5; votes.warning=`⚠️ Dragon ${dragonCount} consecutive!`; votes.brainDetails.push(`🧠 B4-6: Dragon follow (${results[0]})`);}
    else votes.brainDetails.push("🧠 B4-6: Stable trend");

    const mirrorSide = results[0]==="Big"?"Small":"Big";
    votes[mirrorSide==="Big"?"B":"S"]+=2; votes.brainDetails.push(`🧠 B7-10: Mirror logic (${mirrorSide})`);

    const finalSide = votes.B>votes.S?"Big":"Small";
    const confidence = Math.round((Math.max(votes.B,votes.S)/(votes.B+votes.S))*100);
    return { finalSide, confidence, currentPattern, brainSummary:votes.brainDetails.join("\n"), warning:votes.warning };
}

// --- Betting Handler ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    if(!data.nextIssue) return bot.sendMessage(chatId,"❌ Next Issue not found.");

    const baseUnit = amount<10000?10:Math.pow(10,Math.floor(Math.log10(amount))-2);
    const betPayload = { typeId:30, issuenumber:data.nextIssue, gameType:2, amount:Math.floor(baseUnit), betCount:Math.floor(amount/baseUnit), selectType:side==="Big"?13:14, isAgree:true };
    const res = await callApi("GameBetting",betPayload,data.token);

    if(res?.msgCode===0||res?.msg==="Bet success"){
        const time = new Date().toLocaleTimeString();
        bot.sendMessage(chatId,`✅ Bet placed: ${side} | ${amount} MMK | Multiplier: ${data.multiplier||1}X`);
        data.betHistory.unshift({ issue:data.nextIssue.slice(-5), side, amount, time, status:"⏳ Pending", mult:data.multiplier||1 });
        data.lastBet = { side, issue:data.nextIssue, amount };
    } else { bot.sendMessage(chatId,`❌ Bet failed: ${res?.message||"Server Error"}`); }
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId){
    while(user_db[chatId]?.running){
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList",{ pageNo:1, pageSize:50, typeId:30 },data.token);
        if(res && res.msgCode===0 && res.data?.list?.length>0){
            const history=res.data.list;
            const last=history[0];

            if(last.issueNumber!==data.last_issue){
                data.last_issue=last.issueNumber;
                data.nextIssue=(BigInt(last.issueNumber)+1n).toString();

                // Check last bet result
                if(data.lastBet && data.lastBet.issue===last.issueNumber){
                    const realSide=parseInt(last.number)>=5?"Big":"Small";
                    const win=data.lastBet.side===realSide;
                    data.multiplier=win?1:(data.multiplier||1)*2;
                    data.consecutiveLoss=win?0:(data.consecutiveLoss||0)+1;
                    data.lastBet.status=win?"✅ WIN":"❌ LOSS";

                    bot.sendMessage(chatId,
                        `📊 RESULT\nIssue: ${last.issueNumber.slice(-5)}\nNumber: ${last.number} (${realSide})\n${data.lastBet.status}\nNext Multiplier: ${data.multiplier}X`
                    );
                    if(!win && data.consecutiveLoss>=3) bot.sendMessage(chatId,"⚠️ သတိပေး: Loss 3 ခါ ဆက်တိုက် ဖြစ်နေပါသည်။ Next bet ကိုဂရုစိုက်ပါ။");
                }

                // AI vote
                const ai=getAIVote(history);
                data.last_pred=ai.finalSide;

                const reportMsg=`📊 AI Prediction\nIssue: ${data.nextIssue.slice(-5)}\nAI: ${ai.finalSide} (${ai.confidence}%)\nPattern: ${ai.currentPattern}\nBrains:\n${ai.brainSummary}${ai.warning?`\n${ai.warning}`:""}\nMultiplier: ${data.multiplier||1}X`;
                bot.sendMessage(chatId,reportMsg,{
                    reply_markup:{inline_keyboard:[[ { text:"🔵 Big", callback_data:"bet_Big" },{ text:"🔴 Small", callback_data:"bet_Small" }]]}
                });
            }
        }
        await new Promise(r=>setTimeout(r,4000));
    }
}

// --- Telegram Message Handlers ---
bot.on('message', async msg=>{
    const chatId=msg.chat.id;
    if(!user_db[chatId]) user_db[chatId]={ running:false, aiPredictionLogs:[], betHistory:[], multiplier:1, consecutiveLoss:0 };

    const menu={ reply_markup:{ keyboard:[
        ["🚀 Start AI","🛑 Stop AI"],
        ["📊 Website Result","📈 AI History"],
        ["📜 Betting History","🗑️ Clear History"],
        ["🔓 Logout"]
    ], resize_keyboard:true }};

    if(msg.text==='/start') return bot.sendMessage(chatId,"🤖 WinGo v57\nPhone number:",menu);

    // Login
    if(/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token){
        user_db[chatId].tempPhone=msg.text;
        return bot.sendMessage(chatId,"🔐 Password:");
    }
    if(user_db[chatId].tempPhone && !user_db[chatId].token){
        const res=await callApi("Login",{ phonetype:-1, logintype:"mobile", username:"95"+user_db[chatId].tempPhone.replace(/^0/,""), pwd:msg.text });
        if(res?.msgCode===0){
            user_db[chatId].token=res.data.tokenHeader+" "+res.data.token;
            user_db[chatId].running=true;
            monitoringLoop(chatId);
            return bot.sendMessage(chatId,"✅ Login success, monitoring AI started.",menu);
        } else { bot.sendMessage(chatId,"❌ Login failed."); user_db[chatId].tempPhone=null; }
    }

    // Logout
    if(msg.text==="🔓 Logout"){ user_db[chatId].token=null; user_db[chatId].running=false; return bot.sendMessage(chatId,"✅ Logged out.",menu); }

    // AI Start/Stop
    if(msg.text==="🚀 Start AI"){ user_db[chatId].running=true; monitoringLoop(chatId); return bot.sendMessage(chatId,"🚀 AI monitoring started.",menu);}
    if(msg.text==="🛑 Stop AI"){ user_db[chatId].running=false; return bot.sendMessage(chatId,"🛑 AI monitoring stopped.",menu); }

    // Histories
    if(msg.text==="📊 Website Result"){
        const res=await callApi("GetNoaverageEmerdList",{ pageNo:1,pageSize:10,typeId:30 },user_db[chatId].token);
        let txt="📊 Latest Results\n";
        res?.data?.list?.forEach(i=>{ txt+=`🔹 ${i.issueNumber.slice(-3)} ➔ ${i.number} (${parseInt(i.number)>=5?"Big":"Small"})\n`; });
        return bot.sendMessage(chatId,txt);
    }
    if(msg.text==="📈 AI History"){
        let txt="📈 AI Prediction History\n";
        user_db[chatId].aiPredictionLogs.slice(0,15).forEach(l=>{ txt+=`${l.status||""} Issue: ${l.issue||""} | Pred: ${l.pred||""}\n`; });
        return bot.sendMessage(chatId,txt||"No history yet.");
    }
    if(msg.text==="📜 Betting History"){
        let txt="📜 Betting History\n";
        user_db[chatId].betHistory.slice(0,10).forEach(h=>{ txt+=`🔹 Issue: ${h.issue} | ${h.status}\n💰 ${h.amount} MMK (${h.mult}X)\n⏰ ${h.time}\n\n`; });
        return bot.sendMessage(chatId,txt||"No betting yet.");
    }
    if(msg.text==="🗑️ Clear History"){ user_db[chatId].aiPredictionLogs=[]; user_db[chatId].betHistory=[]; return bot.sendMessage(chatId,"✅ Cleared all history."); }

    // Bet input
    if(user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)){
        await handleBetting(chatId,user_db[chatId].pendingSide,parseInt(msg.text));
        user_db[chatId].pendingSide=null;
    }
});

// --- Callback Query for Inline Buttons ---
bot.on('callback_query', query=>{
    const chatId=query.message.chat.id;
    user_db[chatId].pendingSide=query.data.split('_')[1];
    bot.sendMessage(chatId,`💰 Enter amount for ${user_db[chatId].pendingSide}:`);
});
