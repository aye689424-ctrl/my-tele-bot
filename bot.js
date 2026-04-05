const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// Server keep-alive
http.createServer((req, res) => { res.end('WinGo v57 Fully Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// --- User database ---
let user_db = {};

// --- Utility: Random Key & MD5 Sign ---
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
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g, '');
    return crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex').padStart(32,'0').toUpperCase();
}

async function callApi(endpoint, data, authToken=null) {
    const payload = {...data, language: 7, random: generateRandomKey(), timestamp: Math.floor(Date.now()/1000)};
    payload.signature = signMd5(payload);
    const headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": authToken || "",
        "User-Agent": "Mozilla/5.0"
    };
    try { const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 10000 }); return res.data; } 
    catch(e) { return null; }
}

// --- AI Brain Logic 10 ---
function getAIVote(history) {
    const results = history.slice(0,20).map(i => (parseInt(i.number)>=5?"Big":"Small"));
    const currentPattern = results.slice(0,3).reverse().join("-");
    let votes={B:0,S:0,brainDetails:[],warning:""};

    // Brain1-3: Pattern Mirror
    if(currentPattern==="Big-Small-Big"){ votes.S+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)"); }
    else if(currentPattern==="Small-Big-Small"){ votes.B+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Trend Analysis Mode"); }

    // Brain4-6: Dragon check
    let dragonCount=1;
    for(let i=0;i<results.length-1;i++){ if(results[i]===results[i+1]) dragonCount++; else break; }
    if(dragonCount>=4){
        const side = results[0]==="Big"?"B":"S";
        votes[side]+=5;
        votes.warning = `⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။`;
        votes.brainDetails.push(`🧠 B4-6: Dragon follow (${results[0]})`);
    } else { votes.brainDetails.push("🧠 B4-6: Stable Trend"); }

    // Brain7-10: Mirror logic
    const mirrorSide = results[0]==="Big"?"Small":"Big";
    votes[mirrorSide==="Big"?"B":"S"]+=2;
    votes.brainDetails.push(`🧠 B7-10: Mirror Logic (${mirrorSide})`);

    const finalSide = votes.B>votes.S?"Big":"Small";
    const confidence = Math.round((Math.max(votes.B,votes.S)/(votes.B+votes.S))*100);
    return {finalSide,confidence,currentPattern,brainSummary:votes.brainDetails.join("\n"),warning:votes.warning};
}

// --- Betting handler ---
async function handleBetting(chatId, side, totalAmount) {
    const data=user_db[chatId];
    if(!data.nextIssue) return bot.sendMessage(chatId,"❌ ပွဲစဉ်နံပါတ် မရှိသေးပါ။");

    let baseUnit = totalAmount<10000?10:Math.pow(10,Math.floor(Math.log10(totalAmount))-2);
    if(baseUnit<10) baseUnit=10;

    const betPayload = {
        typeId: 30,
        issuenumber: data.nextIssue,
        language: 7,
        gameType: 2,
        amount: Math.floor(baseUnit),
        betCount: Math.floor(totalAmount/baseUnit),
        selectType: side==="Big"?13:14,
        isAgree:true
    };

    const res = await callApi("GameBetting", betPayload, data.token);

    if(res && (res.msgCode===0 || res.msg==="Bet success")){
        const time = new Date().toLocaleTimeString();
        data.betHistory.unshift({issue:data.nextIssue,side,amount:totalAmount,status:"⏳ Pending",time,mult:data.currentMultiplier});
        bot.sendMessage(chatId, `✅ **${side==="Big"?"🔵 Big":"🔴 Small"}** အတွက် **${totalAmount} MMK** ထိုးပြီးပါပြီ။`);
    } else {
        bot.sendMessage(chatId, `❌ **ထိုးမရပါ။** ${res?res.message:"Network Error"}`);
    }
}

// --- Monitoring loop ---
async function monitoringLoop(chatId) {
    while(user_db[chatId]?.running){
        const res = await callApi("GetNoaverageEmerdList",{pageNo:1,pageSize:50,typeId:30},user_db[chatId].token);
        if(res && res.msgCode===0 && res.data?.list?.length>0){
            const history=res.data.list;
            const lastRound = history[0];
            if(lastRound.issueNumber!==user_db[chatId].last_issue){
                // Update history
                user_db[chatId].last_issue = lastRound.issueNumber;
                user_db[chatId].nextIssue = (BigInt(lastRound.issueNumber)+1n).toString();

                // Update AI prediction history
                if(user_db[chatId].last_pred){
                    const pred = user_db[chatId].last_pred;
                    const realSide = parseInt(lastRound.number)>=5?"Big":"Small";
                    const status = pred===realSide?"✅":"❌";
                    user_db[chatId].aiPredictionLogs.unshift({status,issue:lastRound.issueNumber.slice(-3),pred});
                }

                // Update bet history status
                user_db[chatId].betHistory.forEach(bet=>{
                    if(bet.issue===lastRound.issueNumber.slice(-5) && bet.status==="⏳ Pending"){
                        const isWin = bet.side === (parseInt(lastRound.number)>=5?"Big":"Small");
                        bet.status = isWin?"✅ WIN":"❌ LOSS";
                        if(!isWin) user_db[chatId].currentMultiplier*=3; else user_db[chatId].currentMultiplier=1;

                        bot.sendMessage(chatId, `✉️ **ရလဒ် အစီရင်ခံစာ**\n----------------\n📅 ပွဲစဉ်: ${bet.issue}\n🎲 ထွက်ဂဏန်း: ${lastRound.number} (${parseInt(lastRound.number)>=5?"🔵 Big":"🔴 Small"})\n📊 ရလဒ်: ${bet.status}\n🔄 Multiplier: ${user_db[chatId].currentMultiplier}X`);
                    }
                });

                // AI prediction for next round
                const ai = getAIVote(history);
                user_db[chatId].last_pred = ai.finalSide;

                // Send AI prediction message
                const predMsg = `📊 AI Prediction\n----------------\n${ai.brainSummary}\nPattern: ${ai.currentPattern}\nPrediction: ${ai.finalSide==="Big"?"🔵 Big":"🔴 Small"}\nConfidence: ${ai.confidence}%\nNext Issue: ${user_db[chatId].nextIssue.slice(-5)}\nMultiplier: ${user_db[chatId].currentMultiplier}X${ai.warning?`\n${ai.warning}`:""}`;
                bot.sendMessage(chatId,predMsg,{
                    reply_markup:{inline_keyboard:[[{text:"🔵 Big",callback_data:"bet_Big"},{text:"🔴 Small",callback_data:"bet_Small"}]]}
                });
            }
        }
        await new Promise(r=>setTimeout(r,4000));
    }
}

// --- Message handlers ---
bot.on('message',async msg=>{
    const chatId=msg.chat.id;
    if(!user_db[chatId]) user_db[chatId]={running:false,aiPredictionLogs:[],betHistory:[],currentMultiplier:1};

    if(msg.text==='/start'){
        user_db[chatId]={running:false,aiPredictionLogs:[],betHistory:[],currentMultiplier:1};
        return bot.sendMessage(chatId,"🤖 WinGo AI v57\nဖုန်းနံပါတ် ပေးပါ:");
    }

    if(/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token){
        user_db[chatId].tempPhone = msg.text;
        return bot.sendMessage(chatId,"🔐 Password ပေးပါ:");
    }

    if(user_db[chatId].tempPhone && !user_db[chatId].token){
        const res = await callApi("Login",{phonetype:-1,logintype:"mobile",username:"95"+user_db[chatId].tempPhone.replace(/^0/,''),pwd:msg.text});
        if(res && res.msgCode===0){
            user_db[chatId].token = res.data.tokenHeader+" "+res.data.token;
            user_db[chatId].running = true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId,"✅ Login အောင်မြင်ပါပြီ။ ၃၀ စက္ကန့် ပွဲစဉ်များ စောင့်ကြည့်နေပါသည်။");
        } else {
            bot.sendMessage(chatId,"❌ Login မှားယွင်းသည်။");
            user_db[chatId].tempPhone=null;
        }
    }

    if(user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)){
        await handleBetting(chatId,user_db[chatId].pendingSide,parseInt(msg.text));
        user_db[chatId].pendingSide = null;
    }
});

bot.on('callback_query',query=>{
    const chatId = query.message.chat.id;
    if(!user_db[chatId]) return;
    user_db[chatId].pendingSide = query.data.split('_')[1];
    bot.sendMessage(chatId,`💰 **${user_db[chatId].pendingSide}** အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
});
