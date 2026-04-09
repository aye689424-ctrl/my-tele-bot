const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// HTTP Server for Render
http.createServer((req, res) => { res.end('WinGo Sniper Pro v3.0 - Persistent DB'); }).listen(process.env.PORT || 8080);

const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const bot = new TelegramBot(token, { polling: true });

// ========== SQLite DATABASE SETUP ==========
const dbPath = path.join(__dirname, 'user_data.db');
const db = new sqlite3.Database(dbPath);

// Create tables if not exist
db.serialize(() => {
    // Users table
    db.run(CREATE TABLE IF NOT EXISTS users (
        chat_id TEXT PRIMARY KEY,
        token TEXT,
        phone TEXT,
        running INTEGER DEFAULT 0,
        total_profit REAL DEFAULT 0,
        bet_plan TEXT DEFAULT '10,30,90,170,610,1800,3800,6000',
        stop_limit INTEGER DEFAULT 1,
        auto_mode TEXT DEFAULT 'trigger',
        auto_bet_active INTEGER DEFAULT 0,
        auto_bet_started INTEGER DEFAULT 0,
        current_bet_step INTEGER DEFAULT 0,
        consecutive_losses INTEGER DEFAULT 0,
        consecutive_wins INTEGER DEFAULT 0,
        last_issue TEXT,
        next_issue TEXT,
        last_pred TEXT,
        auto_side TEXT
    ));
    
    // Bet history table
    db.run(CREATE TABLE IF NOT EXISTS bet_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        issue TEXT,
        side TEXT,
        amount INTEGER,
        status TEXT,
        pnl REAL,
        is_auto INTEGER,
        auto_step INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ));
    
    // AI logs table
    db.run(CREATE TABLE IF NOT EXISTS ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        status TEXT,
        issue TEXT,
        result TEXT,
        prediction TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ));
});

// Helper function to get user data from DB
function getUserData(chatId, callback) {
    db.get(SELECT * FROM users WHERE chat_id = ?, [chatId], (err, row) => {
        if (err || !row) {
            // Create default user data
            const defaultData = {
                chat_id: chatId,
                token: null,
                phone: null,
                running: 0,
                total_profit: 0,
                bet_plan: '10,30,90,170,610,1800,3800,6000',
                stop_limit: 1,
                auto_mode: 'trigger',
                auto_bet_active: 0,
                auto_bet_started: 0,
                current_bet_step: 0,
                consecutive_losses: 0,
                consecutive_wins: 0,
                last_issue: null,
                next_issue: null,
                last_pred: null,
                auto_side: null
            };
            db.run(INSERT INTO users (chat_id, running, total_profit, bet_plan, stop_limit, auto_mode) VALUES (?, ?, ?, ?, ?, ?), 
                [chatId, 0, 0, defaultData.bet_plan, 1, 'trigger']);
            callback(defaultData);
        } else {
            callback(row);
        }
    });
}

// Helper function to save user data
function saveUserData(chatId, data) {
    db.run(UPDATE users SET 
        token = ?, phone = ?, running = ?, total_profit = ?, 
        bet_plan = ?, stop_limit = ?, auto_mode = ?, 
        auto_bet_active = ?, auto_bet_started = ?, 
        current_bet_step = ?, consecutive_losses = ?, consecutive_wins = ?,
        last_issue = ?, next_issue = ?, last_pred = ?, auto_side = ?
        WHERE chat_id = ?,
        [data.token, data.phone, data.running ? 1 : 0, data.totalProfit || 0,
