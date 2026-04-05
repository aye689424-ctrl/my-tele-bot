const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Server Keep Alive ---
http.createServer((req, res) => { res.end('WinGo AI Bot Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {}; // user sessions & history

// --- Security & Signature Logic ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16 | 0;
        let v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(k => sortedObj[k] = rest[k]);
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g,'');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32,'0').toUpperCase();
}

// --- Call API ---
async function callApi(endpoint, data, authToken=null) {
    const payload = {
        ...data,
        language: 7,
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now()/1000)
    };
    payload.signature = signMd5(payload);
    const headers = { "Content-Type": "application/json;charset=UTF-8", "Authorization": authToken||"" };
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout:10000 });
        return res.data;
    } catch(e) { return null; }
}

// --- AI 10-Brain Logic ---
function getAIVote(history) {
    const results = history.slice(0,20).map(i => parseInt(i.number)>=5?"Big":"Small");
    const currentPattern = results.slice(0,3).reverse().join('-');
    let votes = {B:0, S:0, brainDetails:[], warning:""};

    // Dragon Logic
    let dragonCount = 1;
    for(let i=0;i<results.length-1;i++){
        if(results[i]===results[i+1]) dragonCount++; else break;
    }

    // Brain1-3 Pattern Expert
    if(currentPattern==="Big-Small-Big"){votes.S+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)");}
    else if(currentPattern==="Small-Big-Small"){votes.B+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)");}
    else {votes.brainDetails.push("🧠 B1-3: Trend Analysis Mode");}

    // Brain4-6 Dragon Hunter
    if(dragonCount>=4){
        const side = results[0]==="Big"?"B":"S";
        votes[side]+=5;
        votes.warning=`⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။`;
        votes.brainDetails.push(`🧠 B4-6: Dragon follow (${results[0]})`);
    }else{votes.brainDetails.push("🧠 B4-6: Stable Trend");}

    // Brain7-10 Mirror Logic
    const mirrorSide = results[0]==="Big"?"Small":"Big";
    votes[mirrorSide==="Big"?"B":"S"]+=2;
    votes.brainDetails.push(`🧠 B7-10: Mirror Logic (${mirrorSide})`);

    const finalSide = votes.B>votes.S?"Big":"Small";
    const confidence = Math.round(Math.max(votes.B,votes.S)/(votes.B+votes.S)*100);
    return {finalSide, confidence, currentPattern, brainSummary:votes.brainDetails.join("\n"), warning:votes.warning};
}

// --- Betting Handler ---
async function handleBetting(chatId, side, amount) {
    const data = user_db[chatId];
    if(!data.nextIssue) return bot.sendMessage(chatId,"❌ Next issue not found.");
    const betPayload = {typeId:30, issuenumber:data.nextIssue, gameType:2, amount:10, betCount:Math.floor(amount/10), selectType:side==="Big"?13:14, isAgree:true};
    const res = await callApi("GameBetting", betPayload, data.token);
    if(res?.msgCode===0||res?.msg==="Bet success"){
        data.betHistory.unshift({issue:data.nextIssue, side, amount, time:new Date().toLocaleTimeString(), status:"⏳ Pending", mult:data.currentMultiplier});
        bot.sendMessage(chatId, `✅ **${side}** မှာ **${amount} MMK** ထိုးပြီးပါပြီ။`);
    }else{
        bot.sendMessage(chatId, `❌ Betting failed: ${res?.message||"Network error"}`);
    }
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId) {
    while(user_db[chatId]?.running){
        const data = user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList",{pageNo:1,pageSize:50,typeId:30},data.token);
        if(res && res.msgCode===0 && res.data?.list?.length>0){
            const historyList = res.data.list;
            if(historyList[0].issueNumber!==data.last_issue){
                const realSide = parseInt(historyList[0].number)>=5?"Big":"Small";

                // Update AI prediction history
                if(data.last_pred){
                    data.aiPredictionLogs.unshift({status:data.last_pred===realSide?"✅":"❌", issue:historyList[0].issueNumber.slice(-3), pred:data.last_pred});
                    if(data.aiPredictionLogs.length>15) data.aiPredictionLogs.pop();
                }

                // Update Bet History
                data.betHistory.forEach(b=>{
                    if(b.issue===historyList[0].issueNumber.slice(-5) && b.status==="⏳ Pending"){
                        const isWin = b.side===realSide;
                        b.status=isWin?"✅ WIN":"❌ LOSS";
                        data.currentMultiplier = isWin?1:data.currentMultiplier*3;
                        bot.sendMessage(chatId, `📊 Bet Result: ${b.side} | Issue ${b.issue} | Result: ${b.status} | Multiplier: ${data.currentMultiplier}X`);
                    }
                });

                const ai = getAIVote(historyList);
                data.last_issue=historyList[0].issueNumber;
                data.nextIssue=(BigInt(historyList[0].issueNumber)+1n).toString();
                data.last_pred=ai.finalSide;

                // Send AI prediction with color hint
                const reportMsg = `📊 AI Prediction\n----------------\n${ai.brainSummary}\nPattern: ${ai.currentPattern}\nPrediction: ${ai.finalSide}\nConfidence: ${ai.confidence}%\nNext Issue: ${data.nextIssue.slice(-5)}\nMultiplier: ${data.currentMultiplier}X\n${ai.warning}`;
                bot.sendMessage(chatId, reportMsg,{
                    reply_markup:{inline_keyboard:[[{text:"🔵 Big (ကြီး)", callback_data:"bet_Big"},{text:"🔴 Small (သေး)", callback_data:"bet_Small"}]]}
                });
            }
        }
        await new Promise(r=>setTimeout(r,4000));
    }
}

// --- Message Handlers ---
bot.on('message', async msg=>{
    const chatId = msg.chat.id;
    if(!user_db[chatId]) user_db[chatId]={running:false, aiPredictionLogs:[], betHistory:[], currentMultiplier:1};

    if(msg.text==='/start') return bot.sendMessage(chatId,"🤖 WinGo AI Bot\nဖုန်းနံပါတ် ပို့ပါ:");

    // Login
    if(/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token){
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId,"🔐 Password ပေးပါ:");
    }
    if(user_db[chatId].tempPhone && !user_db[chatId].token){
        const res = await callApi("Login",{phonetype:-1,logintype:"mobile",username:"95"+user_db[chatId].tempPhone.replace(/^0/,""),pwd:msg.text});
        if(res?.msgCode===0){
            user_db[chatId].token=res.data.tokenHeader+" "+res.data.token;
            user_db[chatId].running=true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId,"✅ Login successful, monitoring started.");
        }else{
            bot.sendMessage(chatId,"❌ Login failed");
            user_db[chatId].tempPhone=null;
        }
    }

    // Manual betting
    if(user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)){
        await handleBetting(chatId,user_db[chatId].pendingSide,parseInt(msg.text));
        user_db[chatId].pendingSide=null;
    }
});

bot.on('callback_query', query=>{
    const chatId=query.message.chat.id;
    user_db[chatId].pendingSide=query.data.split('_')[1];
    bot.sendMessage(chatId,`💰 ${user_db[chatId].pendingSide} အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
