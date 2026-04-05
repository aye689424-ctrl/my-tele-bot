const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

// --- Server Keep-Alive ---
http.createServer((req, res) => { res.end('WinGo v100 AI Bot Active'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

let user_db = {};

// --- Security ---
function generateRandomKey() {
    let template = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
    return template.replace(/[xy]/g, c => {
        let r = Math.random()*16|0;
        let v = c==='x'?r:(r&0x3|0x8);
        return v.toString(16);
    });
}

function signMd5(payload) {
    const { signature, timestamp, ...rest } = payload;
    const sortedKeys = Object.keys(rest).sort();
    let sortedObj = {};
    sortedKeys.forEach(key => { sortedObj[key] = rest[key]; });
    const jsonStr = JSON.stringify(sortedObj).replace(/\s+/g,'');
    return crypto.createHash('md5').update(jsonStr,'utf8').digest('hex').padStart(32,'0').toUpperCase();
}

// --- API Call ---
async function callApi(endpoint, data, authToken=null) {
    const payload = {
        ...data,
        language: 7,
        random: generateRandomKey(),
        timestamp: Math.floor(Date.now()/1000)
    };
    payload.signature = signMd5(payload);
    try {
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, {
            headers: {
                "Content-Type":"application/json;charset=UTF-8",
                "Authorization": authToken || ""
            },
            timeout:15000
        });
        return res.data;
    } catch(e) { return null; }
}

// --- AI 10 Brains Logic ---
function getAIVote(history){
    const results = history.slice(0,20).map(i=>parseInt(i.number)>=5?"Big":"Small");
    const currentPattern = results.slice(0,3).reverse().join("-");
    let votes = {B:0,S:0,brainDetails:[],warning:""};

    // Brain 1-3: Mirror Pattern
    if(currentPattern==="Big-Small-Big"){ votes.S+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Small)"); }
    else if(currentPattern==="Small-Big-Small"){ votes.B+=4; votes.brainDetails.push("🧠 B1-3: Mirror Pattern (Big)"); }
    else { votes.brainDetails.push("🧠 B1-3: Trend Analysis Mode"); }

    // Brain 4-6: Dragon count
    let dragonCount=1;
    for(let i=0;i<results.length-1;i++){
        if(results[i]===results[i+1]) dragonCount++; else break;
    }
    if(dragonCount>=4){
        const side = results[0]==="Big"?"B":"S";
        votes[side]+=5;
        votes.warning=`⚠️ နဂါးတန်း (${dragonCount} ပွဲဆက်) ဖြစ်နေပါသည်။`;
        votes.brainDetails.push(`🧠 B4-6: Dragon follow (${results[0]})`);
    }else{votes.brainDetails.push("🧠 B4-6: Stable Trend");}

    // Brain 7-10: Mirror logic
    const mirrorSide = results[0]==="Big"?"Small":"Big";
    votes[mirrorSide==="Big"?"B":"S"]+=2;
    votes.brainDetails.push(`🧠 B7-10: Mirror Logic (${mirrorSide})`);

    const finalSide = votes.B>votes.S?"Big":"Small";
    const confidence = Math.round((Math.max(votes.B,votes.S)/(votes.B+votes.S))*100);
    return {finalSide,confidence,currentPattern,brainSummary:votes.brainDetails.join("\n"),warning:votes.warning};
}

// --- Betting ---
async function handleBetting(chatId, side, amount){
    const data = user_db[chatId];
    if(!data.nextIssue) return bot.sendMessage(chatId,"❌ ပွဲစဉ်နံပါတ် မရှိပါ။");

    let baseUnit = amount<10000?10:Math.pow(10,Math.floor(Math.log10(amount))-2);
    if(baseUnit<10) baseUnit=10;

    const betPayload = {
        typeId:30,
        issuenumber:data.nextIssue,
        gameType:2,
        amount:Math.floor(baseUnit),
        betCount:Math.floor(amount/baseUnit),
        selectType:side==="Big"?13:14,
        isAgree:true
    };

    const res = await callApi("GameBetting",betPayload,data.token);
    if(res && (res.msgCode===0||res.msg==="Bet success")){
        const time=new Date().toLocaleTimeString();
        bot.sendMessage(chatId,`✅ **${side==="Big"?"ကြီး":"သေး"}** အတွက် **${amount} MMK** ထိုးပြီးပါပြီ။`);
        data.betHistory.unshift({issue:data.nextIssue,side,amount,time,status:"⏳ Pending"});
    }else{
        bot.sendMessage(chatId,`❌ **ထိုးမရပါ။**\nအကြောင်းရင်း: \`${res?res.message:"Network Error"}\``);
    }
}

// --- Monitoring Loop ---
async function monitoringLoop(chatId){
    while(user_db[chatId]?.running){
        const data=user_db[chatId];
        const res = await callApi("GetNoaverageEmerdList",{pageNo:1,pageSize:10,typeId:30},data.token);
        if(res && res.msgCode===0 && res.data?.list?.length>0){
            const lastRound=res.data.list[0];
            if(lastRound.issueNumber!==data.last_issue){
                const realSide=parseInt(lastRound.number)>=5?"Big":"Small";
                // Update AI prediction history
                if(data.last_pred){
                    data.aiPredictionLogs.unshift({status:data.last_pred===realSide?"✅":"❌",issue:lastRound.issueNumber.slice(-3),pred:data.last_pred});
                }
                // Update betting history
                data.betHistory.forEach(b=>{
                    if(b.issue===lastRound.issueNumber.slice(-5) && b.status==="⏳ Pending"){
                        const isWin=b.side===realSide;
                        b.status=isWin?"✅ WIN":"❌ LOSS";
                        if(!isWin) data.currentMultiplier=(data.currentMultiplier||1)*3; else data.currentMultiplier=1;
                        bot.sendMessage(chatId,
                            `✉️ **နိုင်/ရှုံး အစီရင်ခံစာ**\n--------------------------\n📅 ပွဲ: ${b.issue}\n🎲 ထွက်ဂဏန်း: ${lastRound.number} (${realSide==="Big"?"ကြီး":"သေး"})\n📊 ရလဒ်: ${b.status}\n🔄 အဆင့်: ${data.currentMultiplier}X`);
                    }
                });
                // AI prediction
                const ai=getAIVote(res.data.list);
                data.last_issue=lastRound.issueNumber;
                data.nextIssue=(BigInt(lastRound.issueNumber)+1n).toString();
                data.last_pred=ai.finalSide;

                const reportMsg=`📊 **AI Prediction**\n--------------------------\n🔍 Brain Analysis:\n${ai.brainSummary}\n--------------------------\n📈 Pattern: ${ai.currentPattern}\n🗳️ Prediction: **${ai.finalSide==="Big"?"ကြီး":"သေး"}**\n📊 Confidence: ${ai.confidence}%\n🕒 Next Issue: ${data.nextIssue.slice(-5)}\n🔄 Multiplier: ${data.currentMultiplier||1}X\n${ai.warning?`\n${ai.warning}`:""}\n\n👇 ထိုးလိုသည့်ဘက် ရွေးပါ:`;

                bot.sendMessage(chatId,reportMsg,{
                    reply_markup:{inline_keyboard:[
                        [{text:"🔵 Big (ကြီး)",callback_data:"bet_Big"},{text:"🔴 Small (သေး)",callback_data:"bet_Small"}]
                    ]}
                });
            }
        }
        await new Promise(r=>setTimeout(r,3000));
    }
}

// --- Telegram Handlers ---
bot.on('message',async msg=>{
    const chatId=msg.chat.id;
    if(!user_db[chatId]) user_db[chatId]={running:false,aiPredictionLogs:[],betHistory:[],currentMultiplier:1};

    if(msg.text==='/start'){
        user_db[chatId]={running:false,aiPredictionLogs:[],betHistory:[],currentMultiplier:1};
        return bot.sendMessage(chatId,"🤖 **WinGo AI Bot**\nဖုန်းနံပါတ် ပေးပါ:");
    }
    // Login
    if(/^\d{9,11}$/.test(msg.text) && !user_db[chatId].token){
        user_db[chatId].tempPhone=msg.text;
        return bot.sendMessage(chatId,"🔐 Password ပေးပါ:");
    }
    if(user_db[chatId].tempPhone && !user_db[chatId].token){
        const res=await callApi("Login",{phonetype:-1,logintype:"mobile",username:"95"+user_db[chatId].tempPhone.replace(/^0/,""),pwd:msg.text});
        if(res && res.msgCode===0){
            user_db[chatId].token=res.data.tokenHeader+" "+res.data.token;
            user_db[chatId].running=true;
            monitoringLoop(chatId);
            bot.sendMessage(chatId,"✅ Login အောင်မြင်သည်။ 30s AI Loop စတင်ပါပြီ။");
        }else{
            bot.sendMessage(chatId,"❌ Login မှားယွင်းသည်။");
            user_db[chatId].tempPhone=null;
        }
    }
    // Handle bet amount input
    if(user_db[chatId]?.pendingSide && /^\d+$/.test(msg.text)){
        await handleBetting(chatId,user_db[chatId].pendingSide,parseInt(msg.text));
        user_db[chatId].pendingSide=null;
    }
});

// Callback for selecting side
bot.on('callback_query',query=>{
    const chatId=query.message.chat.id;
    user_db[chatId].pendingSide=query.data.split('_')[1];
    bot.sendMessage(chatId,`💰 **${user_db[chatId].pendingSide==="Big"?"ကြီး":"သေး"}** အတွက် ငွေပမာဏ ရိုက်ထည့်ပါ:`);
});
