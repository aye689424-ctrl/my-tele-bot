const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const bot = new TelegramBot(token, {polling: true});

// API URL (Login Endpoint)
const LOGIN_API = 'https://api.bigwinqaz.com/api/webapi/UserLogin';

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const phone = match[1];
    const password = match[2];

    bot.sendMessage(chatId, "🚀 API မှတစ်ဆင့် Login ဝင်ရောက်နေပါသည်...");

    try {
        const response = await axios.post(LOGIN_API, {
            mobile: phone,
            password: password,
            // ဒီနေရာမှာ Website ရဲ့ လိုအပ်ချက်အရ တခြား parameter တွေ (ဥပမာ code) လိုနိုင်ပါတယ်
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
            }
        });

        if (response.data.code === 0 || response.data.msg === "success") {
            const userData = response.data.data;
            bot.sendMessage(chatId, `✅ Login အောင်မြင်ပါသည်!\n\n👤 အမည်: ${userData.nickname}\n💰 လက်ကျန်ငွေ: ${userData.money}\n🔑 Token: ${userData.token.substring(0, 10)}...`);
            console.log("Login Success Token:", userData.token);
        } else {
            bot.sendMessage(chatId, `❌ Login မအောင်မြင်ပါ- ${response.data.msg}`);
        }

    } catch (e) {
        bot.sendMessage(chatId, "⚠️ API Error: " + (e.response ? e.response.data.msg : e.message));
    }
});
