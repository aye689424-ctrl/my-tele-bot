const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra'); // extra ကို ပြောင်းသုံးမယ်
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin()); // Stealth mode ဖွင့်လိုက်ပြီ

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const bot = new TelegramBot(token, {polling: true});

// Selector များ (မပြောင်းလဲပါ)
const PHONE_SEL = '#app > div.login__container > div.login__container-form > div.tab-content.activecontent > div > div.phoneInput__container > div.phoneInput__container-input > input[type=text]';
const PASS_SEL  = '#app > div.login__container > div.login__container-form > div.tab-content.activecontent > div > div.passwordInput__container > div.passwordInput__container-input > input';
const LOGIN_SEL = '#app > div.login__container > div.login__container-form > div.tab-content.activecontent > div > div.signIn__container-button';

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const phone = match[1];
    const pass = match[2];
    bot.sendMessage(chatId, "🛡️ Stealth Mode ဖြင့် Website သို့ ချိတ်ဆက်နေပါသည်...");

    try {
        const browser = await puppeteer.launch({
            executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Website ကို သွားမယ်
        await page.goto('https://www.777bigwingame.app/#/login', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        await page.waitForSelector(PHONE_SEL, { timeout: 15000 });
        await page.type(PHONE_SEL, phone, { delay: 150 });
        await page.type(PASS_SEL, pass, { delay: 150 });
        await page.click(LOGIN_SEL);
        
        await new Promise(r => setTimeout(r, 10000));
        await page.screenshot({ path: 'res.png' });
        await bot.sendPhoto(chatId, 'res.png');
        await browser.close();

    } catch (e) {
        bot.sendMessage(chatId, "⚠️ Error: " + e.message);
    }
});
