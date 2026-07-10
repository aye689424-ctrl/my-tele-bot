const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { markovPredict } = require('./markovChain');

// ========== CONFIG ==========
const token = '8678622589:AAFLYmXlETlYmmICqGE7Fb9E-t-CYBvmPb0';
const BASE_URL = "https://api.bigwinqaz.com/api/webapi/";
const PORT = process.env.PORT || 8080;
const APP_URL = process.env.APP_URL || 'https://my-tele-bot-1-ptlu.onrender.com';

const bot = new TelegramBot(token);

bot.setWebHook(`${APP_URL}/bot${token}`).then(() => {
    console.log(`✅ Main Bot Webhook set`);
}).catch(e => console.error('Main Bot Webhook error:', e.message));

// ========== LOCAL STORAGE ==========
const DATA_FILE = path.join(__dirname, 'user_data.json');
const PUBLIC_DATA_FILE = path.join(__dirname, 'public_data.json');
const MEMORY_FILE = path.join(__dirname, 'smart_memory.json');
const ENSEMBLE_FILE = path.join(__dirname, 'ensemble_weights.json');

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

function loadPublicData() {
    try {
        if (fs.existsSync(PUBLIC_DATA_FILE)) {
            return JSON.parse(fs.readFileSync(PUBLIC_DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return { globalBetHistory: [], globalAILogs: [], globalSignals: [], activeUsers: {} };
}

function savePublicData(data) {
    try {
        fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function loadSmartMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveSmartMemory(data) {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function loadEnsembleWeights() {
    try {
        if (fs.existsSync(ENSEMBLE_FILE)) {
            const data = JSON.parse(fs.readFileSync(ENSEMBLE_FILE, 'utf8'));
            const defaultWeights = {
                timeframe: 1.2,
                voting: 1.5,
                pattern: 1.3,
                monteCarlo: 1.1,
                anomaly: 1.4,
                markov: 1.3,
                ai_brain: 1.4,
                hybrid: 1.2
            };
            Object.keys(defaultWeights).forEach(key => {
                if (data[key] === undefined || data[key] === null) {
                    data[key] = defaultWeights[key];
                }
            });
            return data;
        }
    } catch (e) {
        console.error('Load ensemble weights error:', e.message);
    }
    return {
        timeframe: 1.2,
        voting: 1.5,
        pattern: 1.3,
        monteCarlo: 1.1,
        anomaly: 1.4,
        markov: 1.3,
        ai_brain: 1.4,
        hybrid: 1.2
    };
}

function saveEnsembleWeights(data) {
    try {
        fs.writeFileSync(ENSEMBLE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Save ensemble weights error:', e.message);
    }
}

let allUsers = loadAllData();
let publicData = loadPublicData();
let smartMemory = loadSmartMemory();
let ensembleWeights = loadEnsembleWeights();

// ========== USER DATA ==========
function getUserData(chatId) {
    if (!allUsers[chatId]) {
        allUsers[chatId] = {
            token: null, phone: null, running: false,
            autoRunning: false, autoMode: null,
            betPlan: [10, 30, 60, 90, 150, 250, 400, 650],
            stopLimit: 3,
            lossStartLimit: 1,
            totalProfit: 0,
            totalWins: 0,
            sessionWins: 0,
            currentBetStep: 0,
            consecutiveWins: 0,
            consecutiveLosses: 0,
            last_issue: null,
            last_pred: null,
            manualBetLock: false,
            manualBetIssue: null,
            betHistory: [],
            aiLogs: [],
            bettingInProgress: null,
            settingMode: null,
            emerdListData: { hotNumbers: [], coldNumbers: [], lastAnalysis: null, lastReason: "" },
            tempPhone: null,
            pendingSide: null,
            username: null,
            nickname: null,
            currentBalance: 0,
            vipSignalsEnabled: true,
            ensembleMode: true,
            brainStats: {
                totalPredictions: 0,
                correctPredictions: 0,
                modePerformance: {
                    follow: { wins: 0, losses: 0 },
                    reverse: { wins: 0, losses: 0 },
                    ai_correction: { wins: 0, losses: 0 },
                    emerdlist: { wins: 0, losses: 0 },
                    hybrid: { wins: 0, losses: 0 },
                    cautious: { wins: 0, losses: 0 },
                    ensemble: { wins: 0, losses: 0 }
                },
                currentBestMode: null,
                lastModeSwitch: null,
                consecutiveModeFailures: 0
            }
        };
        saveAllData(allUsers);
    }
    if (!allUsers[chatId].brainStats) {
        allUsers[chatId].brainStats = {
            totalPredictions: 0,
            correctPredictions: 0,
            modePerformance: {
                follow: { wins: 0, losses: 0 },
                reverse: { wins: 0, losses: 0 },
                ai_correction: { wins: 0, losses: 0 },
                emerdlist: { wins: 0, losses: 0 },
                hybrid: { wins: 0, losses: 0 },
                cautious: { wins: 0, losses: 0 },
                ensemble: { wins: 0, losses: 0 }
            },
            currentBestMode: null,
            lastModeSwitch: null,
            consecutiveModeFailures: 0
        };
    }
    if (!allUsers[chatId].brainStats.modePerformance.cautious) {
        allUsers[chatId].brainStats.modePerformance.cautious = { wins: 0, losses: 0 };
    }
    if (!allUsers[chatId].brainStats.modePerformance.ensemble) {
        allUsers[chatId].brainStats.modePerformance.ensemble = { wins: 0, losses: 0 };
    }
    if (allUsers[chatId].vipSignalsEnabled === undefined) {
        allUsers[chatId].vipSignalsEnabled = true;
    }
    if (allUsers[chatId].ensembleMode === undefined) {
        allUsers[chatId].ensembleMode = true;
    }
    saveAllData(allUsers);
    return allUsers[chatId];
}

function saveUserData(chatId, data) {
    allUsers[chatId] = data;
    saveAllData(allUsers);
}

// ========== KELLY CRITERION (FIXED) ==========
function kellyCriterionBetSize(confidence, balance, baseBet) {
    const b = 0.96;
    const p = confidence / 100;
    const q = 1 - p;
    
    let kellyFraction = (b * p - q) / b;
    kellyFraction = Math.max(0, kellyFraction * 0.4);
    
    const maxBet = balance * 0.05;
    const kellyBet = balance * kellyFraction;
    
    const finalBet = Math.min(Math.max(kellyBet, baseBet), maxBet);
    return Math.max(Math.round(finalBet), 10);
}

// ========== ENSEMBLE AI ENGINE ==========
class EnsemblePredictor {
    constructor() {
        this.weights = loadEnsembleWeights();
        this.learningRate = 0.05;
        this.minWeight = 0.5;
        this.maxWeight = 2.5;
    }

    multiTimeframeAnalysis(history) {
        if (!history || history.length < 5) return null;
        
        const analyzeTimeframe = (data) => {
            const sides = data.map(i => getSideFromNumber(i.number));
            const bigCount = sides.filter(s => s === "Big").length;
            const smallCount = sides.filter(s => s === "Small").length;
            let prediction = bigCount > smallCount ? "Small" : "Big";
            let confidence = Math.abs(bigCount - smallCount) / data.length * 100;
            
            let streak = 1;
            for (let i = 1; i < sides.length; i++) {
                if (sides[i] === sides[0]) streak++;
                else break;
            }
            if (streak >= 3) {
                prediction = sides[0] === "Big" ? "Small" : "Big";
                confidence = Math.min(confidence + 15, 90);
            }
            
            return { side: prediction, confidence };
        };

        const tf5 = analyzeTimeframe(history.slice(0, 5));
        const tf10 = history.length >= 10 ? analyzeTimeframe(history.slice(0, 10)) : tf5;
        const tf20 = history.length >= 20 ? analyzeTimeframe(history.slice(0, 20)) : tf10;
        
        if (!tf5 || !tf10 || !tf20) return null;
        
        const allSides = [tf5.side, tf10.side, tf20.side];
        const agreeCount = allSides.filter(s => s === tf5.side).length;
        
        let confidence = 50;
        if (agreeCount === 3) confidence = 85 + (tf5.confidence * 0.1);
        else if (agreeCount === 2) confidence = 70 + (tf5.confidence * 0.05);
        else confidence = 55;
        
        return {
            side: tf5.side,
            confidence: Math.min(confidence, 90),
            method: "Multi-Timeframe",
            details: `5:${tf5.side}(${tf5.confidence.toFixed(0)}%) 10:${tf10.side} 20:${tf20.side} | Agree:${agreeCount}/3`
        };
    }

    weightedVoting(data, history, realSide) {
        const votes = {};
        
        votes.follow = { side: realSide, weight: this.weights.voting, accuracy: this.getLocalAccuracy(data, 'follow') };
        votes.reverse = { side: realSide === "Big" ? "Small" : "Big", weight: this.weights.voting * 0.9, accuracy: this.getLocalAccuracy(data, 'reverse') };
        votes.ai_correction = { side: data.last_pred || "Big", weight: this.weights.voting * 1.1, accuracy: this.getLocalAccuracy(data, 'ai_correction') };
        votes.emerdlist = { side: data.last_pred || "Big", weight: this.weights.voting * 0.8, accuracy: this.getLocalAccuracy(data, 'emerdlist') };
        votes.hybrid = { side: data.last_pred || "Big", weight: this.weights.voting * 1.2, accuracy: this.getLocalAccuracy(data, 'hybrid') };
        votes.ai_brain = { side: data.last_pred || "Big", weight: this.weights.voting * 1.3, accuracy: this.getLocalAccuracy(data, 'ai_brain') };
        
        const histForMarkov = history.slice(0, 30).map(i => getSideFromNumber(i.number));
        const markov = markovPredict(histForMarkov, 3);
        votes.cautious = { side: markov.prediction || "Big", weight: this.weights.voting * 1.4, accuracy: this.getLocalAccuracy(data, 'cautious') };
        
        let bigScore = 0, smallScore = 0;
        Object.entries(votes).forEach(([name, v]) => {
            const adjWeight = v.weight * (v.accuracy || 0.5);
            if (v.side === "Big") bigScore += adjWeight;
            else smallScore += adjWeight;
        });
        
        const totalVotes = bigScore + smallScore;
        const confidence = Math.min(Math.abs(bigScore - smallScore) / totalVotes * 100, 90);
        
        return {
            side: bigScore > smallScore ? "Big" : "Small",
            confidence,
            method: "Weighted Voting",
            details: `Big:${bigScore.toFixed(1)} vs Small:${smallScore.toFixed(1)} (7 modes)`
        };
    }

    patternMatching(memoryHistory, currentSequence) {
        if (!memoryHistory || memoryHistory.length < 10) return null;
        
        const last5 = currentSequence.slice(-5).map(h => h.realSide);
        let matches = [];
        
        for (let i = 5; i < memoryHistory.length; i++) {
            const prev5 = memoryHistory.slice(i-5, i).map(h => h.realSide);
            let similarity = 0;
            for (let j = 0; j < 5; j++) {
                if (prev5[j] === last5[j]) similarity++;
            }
            similarity /= 5;
            
            if (similarity >= 0.8) {
                matches.push({ 
                    index: i, 
                    similarity, 
                    nextResult: memoryHistory[i]?.realSide 
                });
            }
        }
        
        if (matches.length >= 3) {
            const nextResults = matches.map(m => m.nextResult).filter(r => r);
            const bigCount = nextResults.filter(r => r === "Big").length;
            const total = nextResults.length || 1;
            const confidence = (Math.max(bigCount, total - bigCount) / total) * 100;
            
            return {
                side: bigCount > total / 2 ? "Big" : "Small",
                confidence: Math.min(confidence + 10, 88),
                method: "Pattern Matching",
                details: `${matches.length} similar patterns found`
            };
        }
        return null;
    }

    monteCarloSimulation(history, simulations = 500) {
        if (!history || history.length < 10) return null;
        
        const sides = history.slice(0, 20).map(i => getSideFromNumber(i.number));
        const transitions = {};
        
        for (let i = 0; i < sides.length - 1; i++) {
            const curr = sides[i];
            const next = sides[i + 1];
            if (!transitions[curr]) transitions[curr] = { Big: 0, Small: 0, total: 0 };
            transitions[curr][next]++;
            transitions[curr].total++;
        }
        
        Object.keys(transitions).forEach(state => {
            transitions[state].BigProb = transitions[state].Big / transitions[state].total;
            transitions[state].SmallProb = transitions[state].Small / transitions[state].total;
        });
        
        const results = { Big: 0, Small: 0 };
        let currentState = sides[sides.length - 1];
        
        for (let i = 0; i < simulations; i++) {
            let state = currentState;
            for (let step = 0; step < 3; step++) {
                const probs = transitions[state] || { BigProb: 0.5, SmallProb: 0.5 };
                state = Math.random() < probs.BigProb ? "Big" : "Small";
            }
            results[state]++;
        }
        
        const total = results.Big + results.Small;
        const confidence = Math.abs(results.Big - results.Small) / total * 100;
        
        return {
            side: results.Big > results.Small ? "Big" : "Small",
            confidence: Math.min(confidence + 5, 85),
            method: "Monte Carlo",
            details: `${simulations} sims | Big:${((results.Big/total)*100).toFixed(1)}% Small:${((results.Small/total)*100).toFixed(1)}%`
        };
    }

    anomalyDetection(history) {
        if (!history || history.length < 20) return null;
        
        const recent20 = history.slice(0, 20).map(i => getSideFromNumber(i.number));
        const bigCount = recent20.filter(r => r === "Big").length;
        const bigRatio = bigCount / 20;
        
        if (bigRatio > 0.70) {
            return {
                side: "Small",
                confidence: Math.min(bigRatio * 100 + 10, 85),
                method: "Anomaly Detection",
                details: `Big ${bigCount}/20 (${(bigRatio*100).toFixed(0)}%) - Overheated → Reverse`
            };
        } else if (bigRatio < 0.30) {
            return {
                side: "Big",
                confidence: Math.min((1 - bigRatio) * 100 + 10, 85),
                method: "Anomaly Detection",
                details: `Small ${20-bigCount}/20 (${((1-bigRatio)*100).toFixed(0)}%) - Overheated → Reverse`
            };
        }
        
        let streak = 1;
        for (let i = 1; i < recent20.length; i++) {
            if (recent20[i] === recent20[0]) streak++;
            else break;
        }
        
        if (streak >= 5) {
            return {
                side: recent20[0] === "Big" ? "Small" : "Big",
                confidence: Math.min(70 + streak * 3, 88),
                method: "Anomaly Detection",
                details: `${recent20[0]} ${streak} streak detected → Reverse soon`
            };
        }
        
        return null;
    }

    getLocalAccuracy(data, mode) {
        if (!data.brainStats?.modePerformance[mode]) return 0.5;
        const perf = data.brainStats.modePerformance[mode];
        const total = perf.wins + perf.losses;
        return total > 0 ? perf.wins / total : 0.5;
    }

    updateWeights(method, isCorrect) {
        const methodKeyMap = {
            'Multi-Timeframe': 'timeframe',
            'Weighted Voting': 'voting',
            'Pattern Matching': 'pattern',
            'Monte Carlo': 'monteCarlo',
            'Anomaly Detection': 'anomaly',
            'Markov Chain': 'markov',
            'AI Brain': 'ai_brain',
            'Hybrid': 'hybrid'
        };
        
        const key = methodKeyMap[method] || method;
        
        if (this.weights[key] !== undefined) {
            if (isCorrect) {
                this.weights[key] = Math.min(this.maxWeight, this.weights[key] + this.learningRate);
            } else {
                this.weights[key] = Math.max(this.minWeight, this.weights[key] - this.learningRate * 0.5);
            }
            saveEnsembleWeights(this.weights);
        }
    }

    getHybridPrediction(data, realSide) {
        const aiHistory = data.aiLogs || [];
        const recentAI = aiHistory.slice(0, 20);
        const recentLosses = recentAI.filter(log => log.status === "❌").length;
        const correctCount = recentAI.filter(log => log.status === "✅").length;
        const aiAccuracy = recentAI.length > 0 ? correctCount / recentAI.length : 0;
        
        if (aiAccuracy >= 0.70 && recentLosses === 0) return data.last_pred || "Big";
        if (recentLosses >= 2 && recentLosses <= 4) return realSide;
        if (recentLosses >= 5) return data.last_pred || "Big";
        return data.last_pred || "Big";
    }

    async predict(data, history, realSide, realNumber) {
        const predictions = [];
        
        const tf = this.multiTimeframeAnalysis(history);
        if (tf) predictions.push({ ...tf, weight: this.weights.timeframe || 1.2 });
        
        const vote = this.weightedVoting(data, history, realSide);
        predictions.push({ ...vote, weight: this.weights.voting || 1.5 });
        
        const chatId = Object.keys(allUsers).find(k => allUsers[k] === data);
        const memHistory = chatId && smartMemory[chatId] ? smartMemory[chatId].history : null;
        if (memHistory && memHistory.length >= 10) {
            const pattern = this.patternMatching(memHistory, history.slice(0, 20));
            if (pattern) predictions.push({ ...pattern, weight: this.weights.pattern || 1.3 });
        }
        
        const mc = this.monteCarloSimulation(history);
        if (mc) predictions.push({ ...mc, weight: this.weights.monteCarlo || 1.1 });
        
        const anomaly = this.anomalyDetection(history);
        if (anomaly) predictions.push({ ...anomaly, weight: this.weights.anomaly || 1.4 });
        
        const histForMarkov = history.slice(0, 30).map(i => getSideFromNumber(i.number));
        const markov = markovPredict(histForMarkov, 3);
        if (markov.prediction && markov.confidence >= 0.5) {
            predictions.push({
                side: markov.prediction,
                confidence: markov.confidence * 100,
                method: "Markov Chain",
                weight: this.weights.markov || 1.3,
                details: `Order 3, confidence: ${(markov.confidence*100).toFixed(0)}%`
            });
        }
        
        const brainDecision = aiBrainDecide(data, history, realSide, realNumber);
        predictions.push({
            side: brainDecision.side,
            confidence: 70,
            method: "AI Brain",
            weight: this.weights.ai_brain || 1.4,
            details: brainDecision.reason
        });
        
        const hybridSide = this.getHybridPrediction(data, realSide);
        predictions.push({
            side: hybridSide,
            confidence: 65,
            method: "Hybrid",
            weight: this.weights.hybrid || 1.2,
            details: "AI + Website combined"
        });
        
        let bigScore = 0, smallScore = 0, totalWeight = 0;
        predictions.forEach(p => {
            const w = p.weight * (p.confidence / 100);
            if (p.side === "Big") bigScore += w;
            else smallScore += w;
            totalWeight += w;
        });
        
        let finalConfidence = 50;
        if (totalWeight > 0) {
            finalConfidence = Math.min(Math.abs(bigScore - smallScore) / totalWeight * 100, 92);
        }
        if (finalConfidence < 1) finalConfidence = 50;
        
        const finalSide = bigScore > smallScore ? "Big" : "Small";
        const agreeCount = predictions.filter(p => p.side === finalSide).length;
        
        return {
            side: finalSide,
            confidence: finalConfidence,
            method: "Ensemble Ultra",
            predictions: predictions.map(p => ({
                method: p.method,
                side: p.side,
                confidence: p.confidence.toFixed(0) + '%',
                weight: p.weight.toFixed(2),
                details: p.details || ''
            })),
            stats: {
                totalMethods: predictions.length,
                agreeCount: agreeCount,
                agreementRate: ((agreeCount / predictions.length) * 100).toFixed(0) + '%',
                bigScore: bigScore.toFixed(3),
                smallScore: smallScore.toFixed(3)
            }
        };
    }
}

const ensemblePredictor = new EnsemblePredictor();

// ========== SMART MEMORY ANALYZER ==========
function updateSmartMemory(chatId, userData, realSide, realNumber, aiSide) {
    if (!smartMemory[chatId]) {
        smartMemory[chatId] = {
            history: [],
            patterns: {},
            lastAnalysis: null
        };
    }

    const mem = smartMemory[chatId];
    const aiCorrect = aiSide === realSide;
    
    const entry = {
        time: new Date().toISOString(),
        issue: userData.last_issue ? userData.last_issue.slice(-5) : '',
        realSide: realSide,
        realNumber: realNumber,
        aiSide: aiSide,
        aiCorrect: aiCorrect,
        aiLossStreak: userData.consecutiveLosses || 0,
        websiteStreak: 0,
        betResult: null
    };

    if (mem.history.length >= 5) {
        const last5 = mem.history.slice(-5).map(h => h.realSide);
        let streak = 1;
        for (let i = last5.length - 1; i > 0; i--) {
            if (last5[i] === last5[i-1]) streak++;
            else break;
        }
        entry.websiteStreak = streak;
    }

    mem.history.push(entry);
    if (mem.history.length > 200) mem.history = mem.history.slice(-200);

    const pattern = analyzePatterns(chatId, mem, entry);
    saveSmartMemory(smartMemory);
    return { entry, pattern };
}

function analyzePatterns(chatId, mem, currentEntry) {
    const history = mem.history;
    if (!history || history.length < 10) return null;

    if (history.length >= 5) {
        const last5 = history.slice(-5);
        const lossCount = last5.filter(h => !h.aiCorrect).length;
        
        if (lossCount >= 4) {
            const pattern = {
                type: 'ai_recovery',
                name: 'AI Recovery Signal',
                confidence: lossCount >= 5 ? 90 : 75,
                description: `AI ${lossCount} ပွဲဆက်မှားပြီးပါပြီ။ နောက်ပွဲမှာ ပြန်မှန်ဖို့ ${lossCount >= 5 ? '90%' : '75%'} သေချာပါတယ်။`,
                action: 'ai_follow',
                priority: 'HIGH'
            };
            
            if (!mem.patterns[pattern.type] || Date.now() - mem.patterns[pattern.type].lastTriggered > 300000) {
                mem.patterns[pattern.type] = { ...pattern, lastTriggered: Date.now(), triggeredCount: (mem.patterns[pattern.type]?.triggeredCount || 0) + 1 };
                return pattern;
            }
        }
        
        const correctCount = last5.filter(h => h.aiCorrect).length;
        if (correctCount >= 4) {
            const pattern = {
                type: 'ai_hot_streak',
                name: 'AI Hot Streak',
                confidence: correctCount >= 5 ? 85 : 70,
                description: `AI ${correctCount} ပွဲဆက်မှန်နေပါတယ်။ ဆက်မှန်ဖို့ ${correctCount >= 5 ? '85%' : '70%'} ရှိပါတယ်။`,
                action: 'ai_follow',
                priority: correctCount >= 5 ? 'HIGH' : 'MEDIUM'
            };
            
            if (!mem.patterns[pattern.type] || Date.now() - mem.patterns[pattern.type].lastTriggered > 300000) {
                mem.patterns[pattern.type] = { ...pattern, lastTriggered: Date.now(), triggeredCount: (mem.patterns[pattern.type]?.triggeredCount || 0) + 1 };
                return pattern;
            }
        }
    }

    if (currentEntry.websiteStreak >= 3) {
        const reverseSide = currentEntry.realSide === "Big" ? "Small" : "Big";
        const pattern = {
            type: 'website_reverse',
            name: 'Website Reverse Signal',
            confidence: currentEntry.websiteStreak >= 5 ? 85 : (currentEntry.websiteStreak >= 4 ? 75 : 65),
            description: `Website ${currentEntry.realSide} ${currentEntry.websiteStreak} ဆက်တိုက်ကျနေပါတယ်။ မကြာခင် ${reverseSide} ပြောင်းဖို့ ${currentEntry.websiteStreak >= 5 ? '85%' : '70%'} ရှိပါတယ်။`,
            action: 'website_reverse',
            side: reverseSide,
            priority: currentEntry.websiteStreak >= 5 ? 'HIGH' : 'MEDIUM'
        };
        
        if (!mem.patterns[pattern.type] || Date.now() - mem.patterns[pattern.type].lastTriggered > 300000) {
            mem.patterns[pattern.type] = { ...pattern, lastTriggered: Date.now(), triggeredCount: (mem.patterns[pattern.type]?.triggeredCount || 0) + 1 };
            return pattern;
        }
    }

    if (history.length >= 3) {
        const last3 = history.slice(-3);
        const last3Correct = last3.filter(h => h.aiCorrect).length >= 3;
        
        if (last3Correct && currentEntry.aiCorrect) {
            const pattern = {
                type: 'double_confirm',
                name: 'Double Confirm Signal',
                confidence: 90,
                description: 'AI နဲ့ Website Pattern နှစ်ခုလုံး တူညီစွာ မှန်ကန်နေပါတယ်။ နောက်ပွဲထိဆက်မှန်ဖို့ အလွန်သေချာပါတယ်။',
                action: 'ai_follow',
                priority: 'VERY_HIGH'
            };
            
            if (!mem.patterns[pattern.type] || Date.now() - mem.patterns[pattern.type].lastTriggered > 600000) {
                mem.patterns[pattern.type] = { ...pattern, lastTriggered: Date.now(), triggeredCount: (mem.patterns[pattern.type]?.triggeredCount || 0) + 1 };
                return pattern;
            }
        }
    }

    return null;
}

function getVipSignalMessage(chatId, userData, pattern, aiPrediction, nextIssue) {
    const nickname = userData.nickname || `User ${chatId.slice(-3)}`;
    const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', hour12: false });
    
    let priorityEmoji = '💡';
    switch (pattern.priority) {
        case 'VERY_HIGH': priorityEmoji = '🔥🔥🔥'; break;
        case 'HIGH': priorityEmoji = '🔥🔥'; break;
        case 'MEDIUM': priorityEmoji = '🔥'; break;
    }
    
    let betSide = pattern.side || aiPrediction;
    let sideEmoji = betSide === "Big" ? "🔵" : "🔴";
    let sideText = betSide === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)";
    
    let msg = `🎯 *တကွက်ကောင်း VIP SIGNAL* ${priorityEmoji}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👑 *${nickname}*\n`;
    msg += `🕐 *အချိန်:* ${mmTime}\n`;
    msg += `🎲 *နောက်ပွဲစဉ်:* ${nextIssue?.slice(-5) || 'N/A'}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 *${pattern.name}*\n`;
    msg += `📈 *ယုံကြည်မှု:* ${pattern.confidence}%\n`;
    msg += `💡 *အကြောင်းအရင်း:* ${pattern.description}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 *ထိုးရမည့်ဘက်:* ${sideEmoji} ${sideText}\n`;
    msg += `🤖 *AI ခန့်မှန်း:* ${aiPrediction === "Big" ? "ကြီး" : "သေး"}\n`;
    msg += `🏦 *လက်ကျန်ငွေ:* ${(userData.currentBalance || 0).toFixed(2)} MMK\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ *Manual Bet ဖြင့်သာ ထိုးပါ*\n`;
    msg += `💰 ထိုးကြေးပမာဏကို ကိုယ်တိုင်ဆုံးဖြတ်ပါ`;

    return msg;
}

// ========== BALANCE CHECKER ==========
async function checkBalance(chatId) {
    const data = getUserData(chatId);
    if (!data || !data.token) return null;
    try {
        const res = await callApi("GetUserInfo", {}, data.token);
        if (res?.msgCode === 0 && res.data) {
            const balance = res.data.amount
                || res.data.balance
                || res.data.coin
                || res.data.money
                || res.data.wallet
                || res.data.userBalance
                || res.data.accountBalance
                || res.data.availableBalance
                || res.data.totalBalance
                || res.data.credit
                || res.data.points
                || res.data.cash
                || 0;
            data.currentBalance = parseFloat(balance) || 0;
            saveUserData(chatId, data);
            return data.currentBalance;
        }
    } catch (e) {
        console.error('Balance check error:', e.message);
    }
    return data.currentBalance || 0;
}

// ========== PUBLIC DATA HELPERS ==========
function addToPublicHistory(betDetail, username) {
    publicData.globalBetHistory.unshift({
        ...betDetail,
        username: username || "Anonymous",
        time: new Date().toISOString()
    });
    if (publicData.globalBetHistory.length > 200) {
        publicData.globalBetHistory = publicData.globalBetHistory.slice(0, 200);
    }
    savePublicData(publicData);
}

function addToPublicAILogs(aiLog, username) {
    publicData.globalAILogs.unshift({
        ...aiLog,
        username: username || "Anonymous",
        time: new Date().toISOString()
    });
    if (publicData.globalAILogs.length > 200) {
        publicData.globalAILogs = publicData.globalAILogs.slice(0, 200);
    }
    savePublicData(publicData);
}

function addToPublicSignals(signalData) {
    publicData.globalSignals.unshift({
        ...signalData,
        time: new Date().toISOString()
    });
    if (publicData.globalSignals.length > 50) {
        publicData.globalSignals = publicData.globalSignals.slice(0, 50);
    }
    savePublicData(publicData);
}

function updateActiveUser(chatId, username) {
    publicData.activeUsers[chatId] = {
        username: username || "Unknown",
        lastActive: new Date().toISOString()
    };
    savePublicData(publicData);
}

// ========== BET RESULT SENDER ==========
async function sendBetResultToUser(chatId, userData, betDetail) {
    try {
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' });
        const userDisplay = userData.username ? `95****${userData.username.slice(-3)}` : `User: ***`;
        const nickname = userData.nickname || userDisplay;

        addToPublicHistory({
            issue: betDetail.issue,
            side: betDetail.side,
            amount: betDetail.amount,
            status: betDetail.status,
            pnl: betDetail.pnl,
            resultNumber: betDetail.resultNumber,
            resultSide: betDetail.resultSide
        }, nickname);

        const resultText = betDetail.status === "✅ WIN" ? "✅ အောင်မြင်ပါသည်" : "❌ ရှုံးနိမ့်ပါသည်";
        const pnlText = betDetail.pnl >= 0 ? `+${betDetail.pnl.toFixed(2)}` : `${betDetail.pnl.toFixed(2)}`;

        let msg = `📊 *WinGo Pro - အသေးစိတ်အစီရင်ခံစာ*\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🕐 *အချိန်:* ${now}\n`;
        msg += `👤 *အသုံးပြုသူ:* ${nickname}\n`;
        msg += `🎲 *ပွဲစဉ်:* ${betDetail.issue}\n`;
        msg += `🎯 *ထိုးသည့်ဘက်:* ${betDetail.side === "Big" ? "🔵 ကြီး (BIG)" : "🔴 သေး (SMALL)"}\n`;
        msg += `💵 *ထိုးငွေ:* ${betDetail.amount} MMK\n`;
        msg += `📊 *ထွက်ဂဏန်း:* ${betDetail.resultNumber} → ${betDetail.resultSide === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
        msg += `📈 *ရလဒ်:* ${resultText}\n`;
        msg += `💰 *အမြတ်/အရှုံး:* ${pnlText} MMK\n`;
        msg += `🏦 *လက်ကျန်ငွေ:* ${(userData.currentBalance || 0).toFixed(2)} MMK\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💰 *စုစုပေါင်းအမြတ်:* ${(userData.totalProfit || 0).toFixed(2)} MMK\n`;
        msg += `🏆 *စုစုပေါင်းနိုင်ပွဲ:* ${userData.totalWins || 0}\n`;
        if (userData.autoRunning) {
            let modeName = userData.autoMode || '';
            if (modeName === 'follow') modeName = '🔄 Follow';
            else if (modeName === 'reverse') modeName = '🔃 Reverse';
            else if (modeName === 'ai_correction') modeName = '🤖 AI Correction';
            else if (modeName === 'emerdlist') modeName = '🧠 GetEmerdList';
            else if (modeName === 'hybrid') modeName = '🧬 Smart Hybrid';
            else if (modeName === 'ai_brain') modeName = '🧠 AI Brain';
            else if (modeName === 'cautious') modeName = '🧠 Cautious Brain';
            else if (modeName === 'ensemble') modeName = '🧠 Ensemble Ultra';
            msg += `🤖 *Auto Mode:* ${modeName}\n`;
            msg += `📋 *ထိုးအဆင့်:* ${(userData.currentBetStep || 0) + 1}/${userData.betPlan.length}\n`;
        }

        try {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
        } catch (e) {
            await bot.sendMessage(chatId, msg.replace(/\*/g, ''));
        }
    } catch (e) {
        console.error('Bet result send error:', e.message);
    }
}

// ========== API HELPERS ==========
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
        const res = await axios.post(`${BASE_URL}${endpoint}`, payload, { headers, timeout: 8000 });
        return res.data;
    } catch (e) {
        return null;
    }
}

function getSideFromNumber(num) {
    return parseInt(num) >= 5 ? "Big" : "Small";
}

function runAI(history) {
    const resArr = history.map(i => getSideFromNumber(i.number));
    let streak = 1;
    let currentSide = resArr[0];
    for (let i = 1; i < resArr.length; i++) {
        if (resArr[i] === currentSide) streak++;
        else break;
    }
    let prediction = currentSide;
    if (streak >= 3) prediction = currentSide === "Big" ? "Small" : "Big";
    return { side: prediction || "Big", dragon: streak };
}

function getAIWorstLossStreak(aiLogs) {
    if (!aiLogs || aiLogs.length === 0) return { maxStreak: 0, worstStreak: null, allStreaks: [] };
    let maxStreak = 0, currentStreak = 0, streakStartIndex = -1, maxStreakStartIndex = -1, maxStreakEndIndex = -1, allStreaks = [];
    for (let i = 0; i < aiLogs.length; i++) {
        if (aiLogs[i].status === "❌") {
            if (currentStreak === 0) streakStartIndex = i;
            currentStreak++;
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
                maxStreakStartIndex = streakStartIndex;
                maxStreakEndIndex = i;
            }
        } else {
            if (currentStreak > 0) {
                allStreaks.push({ streak: currentStreak, startIssue: aiLogs[streakStartIndex]?.issue, endIssue: aiLogs[i - 1]?.issue });
                currentStreak = 0;
            }
        }
    }
    if (currentStreak > 0) allStreaks.push({ streak: currentStreak, startIssue: aiLogs[streakStartIndex]?.issue, endIssue: aiLogs[aiLogs.length - 1]?.issue });
    let worstStreak = null;
    if (maxStreakStartIndex !== -1 && maxStreakEndIndex !== -1) {
        worstStreak = {
            streak: maxStreak,
            startIssue: aiLogs[maxStreakStartIndex]?.issue,
            endIssue: aiLogs[maxStreakEndIndex]?.issue,
            lossDetails: aiLogs.slice(maxStreakStartIndex, maxStreakEndIndex + 1)
        };
    }
    return { maxStreak, worstStreak, allStreaks };
}

function formatLossStreakReport(aiLogs) {
    const analysis = getAIWorstLossStreak(aiLogs);
    if (analysis.maxStreak === 0) return "✅ AI မှတ်တမ်းတွင် အမှားမရှိသေးပါ။";
    let report = `📉 **AI အမှားအများဆုံး ပွဲဆက် မှတ်တမ်း**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔥 **အဆိုးဆုံး အမှားအဆက်:** ${analysis.maxStreak} ပွဲဆက်\n\n`;
    if (analysis.worstStreak) {
        report += `📌 **စတင်သည့်ပွဲ:** ${analysis.worstStreak.startIssue}\n📌 **ပြီးဆုံးသည့်ပွဲ:** ${analysis.worstStreak.endIssue}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 **အသေးစိတ် မှတ်တမ်း:**\n\n`;
        analysis.worstStreak.lossDetails.forEach((loss, idx) => {
            report += `${idx + 1}. ပွဲစဉ် ${loss.issue} | ခန့်: ${loss.prediction} | ထွက်: ${loss.result} (${loss.number})\n`;
        });
    }
    return report;
}

function formatLossStreakShort(aiLogs) {
    const analysis = getAIWorstLossStreak(aiLogs);
    if (analysis.maxStreak === 0) return "✅ အမှားမရှိ";
    return `🔥 အမှားအဆက်: ${analysis.maxStreak} ပွဲ (${analysis.worstStreak?.startIssue || 'N/A'} → ${analysis.worstStreak?.endIssue || 'N/A'})`;
}

async function getNextIssue(chatId, token) {
    try {
        const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 1, typeId: 30 }, token);
        if (historyRes?.data?.list?.length > 0) {
            return (BigInt(historyRes.data.list[0].issueNumber) + 1n).toString();
        }
    } catch (e) { }
    return null;
}

async function waitForBetWindow(chatId, expectedIssue) {
    const data = getUserData(chatId);
    const startTime = Date.now();
    let issueStarted = false;
    while (Date.now() - startTime < 4000) {
        const res = await callApi("GetGameIssue", { typeId: 30 }, data.token);
        if (res?.msgCode === 0 && res.data?.issueNumber === expectedIssue) {
            issueStarted = true;
            break;
        }
        await new Promise(r => setTimeout(r, 300));
    }
    if (!issueStarted) return false;
    await new Promise(r => setTimeout(r, 5000));
    const checkRes = await callApi("GetGameIssue", { typeId: 30 }, data.token);
    return checkRes?.msgCode === 0 && checkRes.data?.issueNumber === expectedIssue;
}

async function syncBetHistoryFromAPI(chatId) {
    const data = getUserData(chatId);
    if (!data || !data.token) return;
    const res = await callApi("GetMyEmerdList", { typeId: 30, pageNo: 1, pageSize: 30 }, data.token);
    if (res?.msgCode === 0 && res.data?.list) {
        res.data.list.forEach(apiBet => {
            const issueShort = apiBet.issueNumber.slice(-5);
            const existingBet = data.betHistory.find(b => b.issue === issueShort);
            if (!existingBet) {
                const status = apiBet.state === "0" ? "⏳ Pending" : apiBet.state === "1" ? "✅ WIN" : "❌ LOSS";
                const pnl = apiBet.state === "1" ? apiBet.profitAmount : (apiBet.state === "2" ? -Math.abs(apiBet.amount) : 0);
                data.betHistory.push({
                    issue: issueShort,
                    side: apiBet.selectType === "big" ? "Big" : "Small",
                    amount: apiBet.amount,
                    status,
                    pnl,
                    isAuto: true,
                    timestamp: apiBet.addTime
                });
            } else {
                if (apiBet.state === "1") {
                    existingBet.status = "✅ WIN";
                    existingBet.pnl = apiBet.profitAmount;
                } else if (apiBet.state === "2") {
                    existingBet.status = "❌ LOSS";
                    existingBet.pnl = -Math.abs(apiBet.amount);
                }
            }
        });
        data.totalProfit = data.betHistory.filter(b => b.status !== "⏳ Pending").reduce((sum, b) => sum + (b.pnl || 0), 0);
        data.totalWins = data.betHistory.filter(b => b.status === "✅ WIN" && b.isAuto).length;
        saveUserData(chatId, data);
    }
}

async function getEmerdListPrediction(chatId, token) {
    try {
        const statsRes = await callApi("GetEmerdList", { typeId: 30, gameType: 2 }, token);
        const historyRes = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 50, typeId: 30 }, token);
        if (statsRes?.msgCode === 0 && historyRes?.msgCode === 0) {
            const freqData = statsRes.data.find(d => d.type === 1);
            const missingData = statsRes.data.find(d => d.type === 2);
            let hotNumbers = [], coldNumbers = [];
            if (freqData) {
                let freqList = [];
                for (let i = 0; i <= 9; i++) freqList.push({ num: i, val: freqData[`number_${i}`] });
                freqList.sort((a, b) => b.val - a.val);
                hotNumbers = freqList.slice(0, 3).map(i => i.num);
            }
            if (missingData) {
                let missList = [];
                for (let i = 0; i <= 9; i++) missList.push({ num: i, val: missingData[`number_${i}`] });
                missList.sort((a, b) => b.val - a.val);
                coldNumbers = missList.slice(0, 3).map(i => i.num);
            }
            const history = historyRes.data.list;
            const lastRound = history[0];
            const lastNumber = parseInt(lastRound.number);
            const lastResult = getSideFromNumber(lastNumber);
            const resultsLast10 = history.slice(0, 10).map(i => getSideFromNumber(i.number));
            let bigCount = resultsLast10.filter(r => r === 'Big').length;
            let smallCount = resultsLast10.filter(r => r === 'Small').length;
            const isLastNumberHot = hotNumbers.includes(lastNumber);
            const isLastNumberCold = coldNumbers.includes(lastNumber);
            let finalPrediction = lastResult, reason = "";
            if (isLastNumberCold) {
                finalPrediction = lastResult === "Big" ? "Small" : "Big";
                reason = `❄️ Cold Number (${lastNumber}) ဖြစ်နေ၍ ပြောင်းပြန်ထိုး`;
            } else if (isLastNumberHot) {
                finalPrediction = lastResult;
                reason = `🔥 Hot Number (${lastNumber}) ဆက်ကျနေ၍ ဆက်လိုက်ထိုး`;
            } else {
                if (bigCount >= 7) {
                    finalPrediction = "Small";
                    reason = `📊 BIG ${bigCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`;
                } else if (smallCount >= 7) {
                    finalPrediction = "Big";
                    reason = `📊 SMALL ${smallCount}/10 ဖြင့် ပြင်းထန်၍ ပြောင်းပြန်`;
                } else {
                    reason = `📈 ပုံမှန် Trend အတိုင်း လိုက်ထိုး`;
                }
            }
            return { prediction: finalPrediction, reason };
        }
    } catch (e) { }
    return { prediction: "Big", reason: "ပုံသေ BIG ထိုးမည်" };
}

function formatAIHistoryForVIP(aiLogs, limit = 50) {
    if (!aiLogs || aiLogs.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const recentLogs = aiLogs.slice(0, limit);
    let winCount = recentLogs.filter(l => l.status === "✅").length;
    let winRate = ((winCount / recentLogs.length) * 100).toFixed(1);
    let txt = `📈 AI မှတ်တမ်း (${recentLogs.length} ပွဲ) | မှန်နှုန်း: ${winRate}%\n`;
    txt += `━━━━━━━━━━━━━━━━\n`;
    recentLogs.forEach((log) => {
        let shortIssue = log.issue.slice(-3);
        let resultEmoji = log.result === "Big" ? "🏞️ကြီး" : "🌄သေး";
        let predEmoji = log.prediction === "Big" ? "🏞️ကြီး" : "🌄သေး";
        txt += `${log.status} ${shortIssue} | ${predEmoji}→${resultEmoji} | ${log.number || ''}\n`;
    });
    return txt;
}

function formatGlobalBetHistory() {
    if (publicData.globalBetHistory.length === 0) return "📊 မှတ်တမ်းမရှိသေးပါ";
    const totalProfit = publicData.globalBetHistory.filter(b => b.pnl).reduce((sum, b) => sum + b.pnl, 0);
    const finished = publicData.globalBetHistory.filter(b => b.status !== "⏳ Pending");
    const wins = finished.filter(b => b.status === "✅ WIN").length;
    const winRate = finished.length > 0 ? ((wins / finished.length) * 100).toFixed(1) : 0;
    let txt = `🌍 *GLOBAL BET HISTORY*\n━━━━━━━━━━━━━━━━\n👥 Users: ${Object.keys(publicData.activeUsers).length}\n💰 Total Profit: ${totalProfit.toFixed(2)} MMK\n📈 Win Rate: ${winRate}% (${wins}/${finished.length})\n━━━━━━━━━━━━━━━━\n`;
    publicData.globalBetHistory.slice(0, 20).forEach(b => {
        const emoji = b.status === "✅ WIN" ? "✅" : b.status === "❌ LOSS" ? "❌" : "⏳";
        const pnl = b.pnl ? ` (${b.pnl >= 0 ? '+' : ''}${b.pnl.toFixed(2)})` : '';
        txt += `${emoji} ${b.username} | ${b.issue} | ${b.side} | ${b.amount}${pnl}\n`;
    });
    return txt;
}

function formatGlobalAILogs() {
    if (publicData.globalAILogs.length === 0) return "📊 AI မှတ်တမ်းမရှိသေးပါ";
    const total = publicData.globalAILogs.length;
    const correct = publicData.globalAILogs.filter(l => l.status === "✅").length;
    const rate = ((correct / total) * 100).toFixed(1);
    let txt = `🤖 *GLOBAL AI LOGS*\n━━━━━━━━━━━━━━━━\n📊 တိကျမှု: ${rate}% (${correct}/${total})\n━━━━━━━━━━━━━━━━\n`;
    publicData.globalAILogs.slice(0, 20).forEach((log) => {
        txt += `${log.status} ${log.username} | ${log.issue} | ${log.prediction}→${log.result} | ${log.number || ''}\n`;
    });
    return txt;
}

function formatActiveSignals() {
    if (publicData.globalSignals.length === 0) return "📡 Signal မရှိသေးပါ";
    let txt = `📡 *LATEST SIGNALS*\n━━━━━━━━━━━━━━━━\n`;
    publicData.globalSignals.slice(0, 10).forEach(s => {
        txt += `🔮 ${s.username} | ${s.issue} | ${s.prediction === "Big" ? "🔵BIG" : "🔴SMALL"}\n`;
        txt += `   ↳ AI: ${s.aiPred} | Mode: ${s.mode}\n`;
    });
    return txt;
}

// ========== AI BRAIN ==========
function aiBrainDecide(data, history, realSide, realNumber) {
    const aiLogs = data.aiLogs || [];
    const recent20 = aiLogs.slice(0, 20);
    const recent10 = aiLogs.slice(0, 10);

    const totalRecent = recent20.length || 1;
    const correctRecent20 = recent20.filter(l => l.status === "✅").length;
    const accuracy20 = correctRecent20 / totalRecent;

    const correctRecent10 = recent10.filter(l => l.status === "✅").length;
    const accuracy10 = recent10.length > 0 ? correctRecent10 / recent10.length : accuracy20;

    let currentLossStreak = 0;
    for (let i = 0; i < recent20.length; i++) {
        if (recent20[i].status === "❌") currentLossStreak++;
        else break;
    }

    const last5Results = history.slice(0, 5).map(i => getSideFromNumber(i.number));
    let bigCount = last5Results.filter(r => r === 'Big').length;
    let smallCount = last5Results.filter(r => r === 'Small').length;

    let websiteStreak = 1;
    let websiteStreakSide = last5Results[0];
    for (let i = 1; i < last5Results.length; i++) {
        if (last5Results[i] === websiteStreakSide) websiteStreak++;
        else break;
    }

    const aiPrediction = data.last_pred || "Big";

    let finalSide = aiPrediction;
    let decisionReason = "";

    if (accuracy20 >= 0.70 && currentLossStreak === 0) {
        finalSide = aiPrediction;
        decisionReason = `🧠 AI 20ပွဲမှန်နှုန်း ${(accuracy20 * 100).toFixed(0)}% ဖြင့် အလွန်ကောင်း → AI အတိုင်းထိုး`;
    } else if (currentLossStreak >= 5 && websiteStreak >= 3) {
        finalSide = websiteStreakSide;
        decisionReason = `🧠 AI ${currentLossStreak}ပွဲဆက်မှား + Website ${websiteStreakSide} ${websiteStreak}ဆက် → Website Follow`;
    } else if (currentLossStreak >= 3 && currentLossStreak <= 4 && websiteStreak >= 2) {
        finalSide = websiteStreakSide === "Big" ? "Small" : "Big";
        decisionReason = `🧠 AI ${currentLossStreak}ပွဲမှား + Website ${websiteStreakSide}ဆက် → Reverse`;
    } else if (currentLossStreak >= 7) {
        finalSide = aiPrediction;
        decisionReason = `🧠 AI ${currentLossStreak}ပွဲဆက်မှား → AI ပြန်မှန်ချိန်နီးပြီ`;
    } else if (websiteStreak >= 4) {
        finalSide = websiteStreakSide === "Big" ? "Small" : "Big";
        decisionReason = `🧠 Website ${websiteStreakSide} ${websiteStreak}ဆက် → ပြောင်းပြန်ထိုးချိန်`;
    } else if (accuracy10 < 0.5 && websiteStreak >= 2) {
        finalSide = websiteStreakSide;
        decisionReason = `🧠 AI မှန်နှုန်းကျ (${(accuracy10 * 100).toFixed(0)}%) + Website ကောင်း → Website Follow`;
    } else {
        decisionReason = `🧠 AI မှန်နှုန်း ${(accuracy20 * 100).toFixed(0)}% | ${currentLossStreak}ပွဲမှား → AI အတိုင်း`;
    }

    return {
        side: finalSide,
        reason: decisionReason,
        stats: {
            aiAccuracy20: (accuracy20 * 100).toFixed(0) + '%',
            aiLossStreak: currentLossStreak,
            websiteStreak: websiteStreakSide + ' ' + websiteStreak + 'ဆက်',
            websiteBigSmall: `BIG:${bigCount} SMALL:${smallCount}`
        }
    };
}

// ========== PLACE BET ==========
async function placeBetNow(chatId, side, amount, targetIssue, stepIndex, isAuto = true, betReason = "") {
    const data = getUserData(chatId);
    if (!data || !data.token) return false;
    if (data.betHistory.find(b => b.issue === targetIssue.slice(-5) && b.status !== "⏳ Pending")) return false;
    if (data.bettingInProgress) return false;

    data.bettingInProgress = targetIssue;
    saveUserData(chatId, data);

    const tempBet = {
        issue: targetIssue.slice(-5),
        side,
        amount,
        status: "⏳ Pending",
        pnl: 0,
        isAuto,
        autoStep: isAuto ? stepIndex : -1,
        reason: betReason,
        timestamp: new Date().toISOString(),
        mode: data.autoMode
    };
    data.betHistory.unshift(tempBet);
    if (!isAuto) {
        data.manualBetLock = true;
        data.manualBetIssue = targetIssue.slice(-5);
    }
    saveUserData(chatId, data);

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

    const res = await callApi("GameBetting", betPayload, data.token);
    data.bettingInProgress = null;

    if (res?.msgCode === 0 || res?.msg === "Bet success") {
        if (res.data) {
            data.currentBalance = res.data.amount || res.data.balance || res.data.coin || data.currentBalance;
        }
        const typeText = isAuto ? `[AUTO ${data.autoMode || ''}]` : "[MANUAL]";
        const sideText = side === "Big" ? "BIG 🔵" : "SMALL 🔴";
        let successMsg = `✅ ${typeText} ပွဲစဉ်: ${targetIssue.slice(-5)} | ${sideText} | ${amount} MMK ထိုးပြီး!`;
        successMsg += `\n🏦 လက်ကျန်ငွေ: ${(data.currentBalance || 0).toFixed(2)} MMK`;
        if (betReason) successMsg += `\n\n📝 ${betReason}`;
        await bot.sendMessage(chatId, successMsg);
        saveUserData(chatId, data);
        return true;
    } else {
        data.betHistory = data.betHistory.filter(b => b.issue !== targetIssue.slice(-5) || b.status !== "⏳ Pending");
        if (!isAuto) {
            data.manualBetLock = false;
            data.manualBetIssue = null;
        }
        saveUserData(chatId, data);
        if (res?.msg === "The current period is settled") {
            await bot.sendMessage(chatId, `⚠️ ပွဲစဉ် ${targetIssue.slice(-5)} ပိတ်သွားပါပြီ။`);
        } else if (res?.msg !== "Do not resubmit") {
            await bot.sendMessage(chatId, `❌ ထိုးမအောင်မြင်ပါ: ${res?.msg || 'Unknown'}`);
        }
        return false;
    }
}

// ========== MONITORING LOOP ==========
async function monitoringLoop(chatId) {
    while (true) {
        let data = getUserData(chatId);
        if (!data.running) break;

        try {
            await syncBetHistoryFromAPI(chatId);
            data = getUserData(chatId);
            const res = await callApi("GetNoaverageEmerdList", { pageNo: 1, pageSize: 5, typeId: 30 }, data.token);
            if (res?.msgCode === 0 && res.data?.list?.length > 0) {
                const history = res.data.list;
                const lastRound = history[0];
                const currentIssue = lastRound.issueNumber;
                const realSide = parseInt(lastRound.number) >= 5 ? "Big" : "Small";
                const realNumber = lastRound.number;
                const nextIssue = (BigInt(currentIssue) + 1n).toString();

                if (currentIssue !== data.last_issue) {
                    await checkBalance(chatId);
                    data = getUserData(chatId);

                    const memoryResult = updateSmartMemory(chatId, data, realSide, realNumber, data.last_pred || "Big");
                    
                    if (memoryResult.pattern && data.vipSignalsEnabled) {
                        const nextIss = await getNextIssue(chatId, data.token);
                        const vipMsg = getVipSignalMessage(chatId, data, memoryResult.pattern, data.last_pred || "Big", nextIss);
                        
                        const vipKeyboard = {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: `💰 ${memoryResult.pattern.side || data.last_pred || "Big"} ထိုးမည်`, callback_data: `vipbet_${memoryResult.pattern.side || data.last_pred || "Big"}_${memoryResult.pattern.confidence}` }
                                    ],
                                    [
                                        { text: "❌ ကျော်မည်", callback_data: "vip_skip" }
                                    ]
                                ]
                            }
                        };
                        
                        await bot.sendMessage(chatId, vipMsg, { parse_mode: "Markdown", ...vipKeyboard });
                        smartMemory.totalSignals = (smartMemory.totalSignals || 0) + 1;
                        smartMemory.lastSignalTime = new Date().toISOString();
                        saveSmartMemory(smartMemory);
                    }

                    let pendingBet = data.betHistory.find(b => b.status === "⏳ Pending" && b.issue === currentIssue.slice(-5));
                    let betResult = null;
                    if (pendingBet) {
                        const isWin = pendingBet.side === realSide;
                        if (isWin) {
                            pendingBet.status = "✅ WIN";
                            pendingBet.pnl = +(pendingBet.amount * 0.96).toFixed(2);
                            data.totalProfit += pendingBet.pnl;
                            if (pendingBet.isAuto) {
                                data.sessionWins++;
                                data.totalWins++;
                                data.consecutiveWins++;
                                data.consecutiveLosses = 0;
                                if (data.sessionWins >= data.stopLimit) {
                                    await bot.sendMessage(chatId, `🛑 Stop Limit ပြည့်ပါပြီ! (${data.stopLimit} ပွဲနိုင်)`);
                                    data.autoRunning = false;
                                    data.autoMode = null;
                                    data.currentBetStep = 0;
                                    data.consecutiveWins = 0;
                                    data.sessionWins = 0;
                                } else {
                                    data.currentBetStep = 0;
                                }
                            } else {
                                data.manualBetLock = false;
                                data.manualBetIssue = null;
                            }
                            if (pendingBet.mode) updateBrainStats(data, pendingBet.mode, true);
                            if (pendingBet.mode === 'ensemble' && pendingBet.ensembleMethod) {
                                ensemblePredictor.updateWeights(pendingBet.ensembleMethod, true);
                            }
                        } else {
                            pendingBet.status = "❌ LOSS";
                            pendingBet.pnl = -pendingBet.amount;
                            data.totalProfit += pendingBet.pnl;
                            if (pendingBet.isAuto) {
                                data.consecutiveWins = 0;
                                data.consecutiveLosses++;
                                const nextStep = data.currentBetStep + 1;
                                if (nextStep < data.betPlan.length) data.currentBetStep = nextStep;
                                else {
                                    await bot.sendMessage(chatId, `❌ Max step ရောက်။ Auto Bet ရပ်။`);
                                    data.autoRunning = false;
                                    data.autoMode = null;
                                    data.currentBetStep = 0;
                                    data.sessionWins = 0;
                                }
                            } else {
                                data.manualBetLock = false;
                                data.manualBetIssue = null;
                            }
                            if (pendingBet.mode) updateBrainStats(data, pendingBet.mode, false);
                            if (pendingBet.mode === 'ensemble' && pendingBet.ensembleMethod) {
                                ensemblePredictor.updateWeights(pendingBet.ensembleMethod, false);
                            }
                        }
                        betResult = { ...pendingBet, resultNumber: realNumber, resultSide: realSide };
                        saveUserData(chatId, data);
                        await sendBetResultToUser(chatId, data, betResult);
                        updateActiveUser(chatId, data.nickname || `95****${(data.username || '').slice(-3)}`);
                        data = getUserData(chatId);
                    }

                    if (data.last_pred) {
                        const aiCorrect = (data.last_pred === realSide);
                        data.aiLogs.unshift({
                            status: aiCorrect ? "✅" : "❌",
                            issue: currentIssue.slice(-5),
                            result: realSide,
                            prediction: data.last_pred,
                            number: realNumber
                        });
                        if (data.aiLogs.length > 100) data.aiLogs = data.aiLogs.slice(0, 100);
                        const nickname = data.nickname || `95****${(data.username || '').slice(-3)}`;
                        addToPublicAILogs({
                            status: aiCorrect ? "✅" : "❌",
                            issue: currentIssue.slice(-5),
                            result: realSide,
                            prediction: data.last_pred,
                            number: realNumber
                        }, nickname);
                        if (!pendingBet || !pendingBet.isAuto) {
                            data.consecutiveLosses = aiCorrect ? 0 : data.consecutiveLosses + 1;
                        }
                        saveUserData(chatId, data);
                        data = getUserData(chatId);
                    }

                    const ai = runAI(history);
                    data.last_issue = currentIssue;
                    data.last_pred = ai.side;
                    saveUserData(chatId, data);

                    if (data.autoRunning && !data.manualBetLock) {
                        let betSide = null;
                        let betAmount = data.betPlan[data.currentBetStep];
                        let betReason = "";
                        let ensembleMethod = null;

                        if (data.autoMode === 'follow') {
                            betSide = realSide;
                            betReason = `🔄 Follow - ${realSide} လိုက်ထိုး`;
                        } else if (data.autoMode === 'reverse') {
                            betSide = realSide === "Big" ? "Small" : "Big";
                            betReason = `🔃 Reverse - ${realSide} ထွက်၍ ပြောင်းပြန်ထိုး`;
                        } else if (data.autoMode === 'ai_correction') {
                            if (data.consecutiveLosses >= data.lossStartLimit) {
                                betSide = data.last_pred;
                                betReason = `🤖 AI Correction - ${data.consecutiveLosses} ပွဲဆက်မှား၍ ထိုး`;
                            }
                        } else if (data.autoMode === 'emerdlist') {
                            const pred = await getEmerdListPrediction(chatId, data.token);
                            betSide = pred.prediction;
                            betReason = `🧠 GetEmerdList - ${pred.reason}`;
                        } else if (data.autoMode === 'hybrid') {
                            const aiHistory = data.aiLogs || [];
                            const recentAI = aiHistory.slice(0, 20);
                            const recentLosses = recentAI.filter(log => log.status === "❌").length;
                            const correctCount = recentAI.filter(log => log.status === "✅").length;
                            const aiAccuracy = recentAI.length > 0 ? correctCount / recentAI.length : 0;
                            if (aiAccuracy >= 0.70 && recentLosses === 0) {
                                betSide = data.last_pred;
                                betReason = `🧬 Hybrid: AI 20ပွဲမှန်နှုန်း ${(aiAccuracy * 100).toFixed(0)}% → AI လိုက်ထိုး`;
                            } else if (recentLosses >= 2 && recentLosses <= 4) {
                                betSide = realSide;
                                betReason = `🧬 Hybrid: AI ${recentLosses}ပွဲဆက်မှား → Website Follow`;
                            } else if (recentLosses >= 5) {
                                betSide = data.last_pred;
                                betReason = `🧬 Hybrid: AI ${recentLosses}ပွဲဆက်မှား → AI ပြန်မှန်ချိန်`;
                            } else {
                                betSide = data.last_pred;
                                betReason = `🧬 Hybrid: AI ${(aiAccuracy * 100).toFixed(0)}% မှန် → AI အတိုင်းထိုး`;
                            }
                        } else if (data.autoMode === 'ai_brain') {
                            const brainDecision = aiBrainDecide(data, history, realSide, realNumber);
                            betSide = brainDecision.side;
                            betReason = brainDecision.reason;
                            betReason += `\n📊 AIမှန်:${brainDecision.stats.aiAccuracy20} | AIမှားဆက်:${brainDecision.stats.aiLossStreak} | Web:${brainDecision.stats.websiteStreak}`;
                        } else if (data.autoMode === 'cautious') {
                            const histForMarkov = history.slice(0, 30).map(i => getSideFromNumber(i.number));
                            const markov = markovPredict(histForMarkov, 3);

                            if (!markov.prediction || markov.confidence < 0.65) {
                                await bot.sendMessage(chatId, `⏭️ Cautious: Markov confidence ${markov.confidence?.toFixed(2) || 'N/A'} < 0.65, ကျော်ပါမည်`);
                            } else {
                                const worstLossInfo = getAIWorstLossStreak(data.aiLogs);
                                const maxLossStreak = worstLossInfo.maxStreak;
                                const recentLosses = data.aiLogs.slice(0, 5).filter(l => l.status === "❌").length;

                                if (recentLosses >= maxLossStreak && maxLossStreak > 2) {
                                    betSide = markov.prediction;
                                    betReason = `🧠 Cautious: Markov (${markov.prediction}, conf:${(markov.confidence * 100).toFixed(0)}%) + AI Loss streak max (${maxLossStreak}) reached`;
                                } else if (data.last_pred === markov.prediction) {
                                    betSide = markov.prediction;
                                    betReason = `🧠 Cautious: AI & Markov agree (${markov.prediction}, conf:${(markov.confidence * 100).toFixed(0)}%)`;
                                } else {
                                    await bot.sendMessage(chatId, `⚠️ Cautious: AI (${data.last_pred}) vs Markov (${markov.prediction}) ကွဲနေ၍ ကျော်ပါမည်`);
                                }
                            }
                        } else if (data.autoMode === 'ensemble') {
                            const ensembleResult = await ensemblePredictor.predict(data, history, realSide, realNumber);
                            betSide = ensembleResult.side;
                            
                            betAmount = kellyCriterionBetSize(ensembleResult.confidence, data.currentBalance || betAmount * 10, betAmount);
                            ensembleMethod = ensembleResult.predictions[0]?.method || 'ensemble';
                            
                            betReason = `🧠 *ENSEMBLE ULTRA*\n`;
                            betReason += `━━━━━━━━━━━━━━━━\n`;
                            betReason += `🎯 ဆုံးဖြတ်ချက်: ${ensembleResult.side === "Big" ? "🔵 BIG" : "🔴 SMALL"}\n`;
                            betReason += `📈 ယုံကြည်မှု: ${ensembleResult.confidence.toFixed(1)}%\n`;
                            betReason += `🤝 သဘောတူမှု: ${ensembleResult.stats.agreeCount}/${ensembleResult.stats.totalMethods} (${ensembleResult.stats.agreementRate})\n`;
                            betReason += `💰 Kelly Bet: ${betAmount} MMK\n`;
                            betReason += `━━━━━━━━━━━━━━━━\n📊 *နည်းလမ်းများ:*\n`;
                            ensembleResult.predictions.forEach(p => {
                                const agreeEmoji = p.side === ensembleResult.side ? "✅" : "❌";
                                betReason += `${agreeEmoji} ${p.method}: ${p.side} (${p.confidence}) [w:${p.weight}]\n`;
                            });
                            
                            await bot.sendMessage(chatId, betReason, { parse_mode: "Markdown" });
                            betReason = `Ensemble Ultra: ${ensembleResult.side} (${ensembleResult.confidence.toFixed(0)}%)`;
                        }

                        if (betSide) {
                            await checkBalance(chatId);
                            data = getUserData(chatId);
                            
                            if (data.autoMode !== 'ensemble') {
                                await bot.sendMessage(chatId, `⏰ ပွဲစဉ် ${nextIssue.slice(-5)} အတွက် ထိုးပါမည်...\n🏦 လက်ကျန်ငွေ: ${(data.currentBalance || 0).toFixed(2)} MMK\n\n📝 ${betReason}`);
                            }
                            
                            const betWindowReady = await waitForBetWindow(chatId, nextIssue);
                            const success = await placeBetNow(chatId, betSide, betAmount, nextIssue, data.currentBetStep, true, betReason);
                            
                            if (success && ensembleMethod) {
                                const lastBet = data.betHistory[0];
                                if (lastBet) {
                                    lastBet.ensembleMethod = ensembleMethod;
                                    saveUserData(chatId, data);
                                }
                            }
                        }
                    }

                    const mmTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit', hour12: false });
                    const nickname = data.nickname || `User ${chatId.slice(-3)}`;
                    let modeText = "⚪️ Manual";
                    if (data.autoRunning) {
                        if (data.autoMode === 'follow') modeText = "🟢 Follow";
                        else if (data.autoMode === 'reverse') modeText = "🔃 Reverse";
                        else if (data.autoMode === 'ai_correction') modeText = "🟡 AI Correction";
                        else if (data.autoMode === 'emerdlist') modeText = "🧠 GetEmerdList";
                        else if (data.autoMode === 'hybrid') modeText = "🧬 Smart Hybrid";
                        else if (data.autoMode === 'ai_brain') modeText = "🧠 AI Brain";
                        else if (data.autoMode === 'cautious') modeText = "🧠 Cautious Brain";
                        else if (data.autoMode === 'ensemble') modeText = "🧠 Ensemble Ultra";
                    }

                    let statusMsg = `💥 *${nickname} - VIP SIGNAL* 💥\n`;
                    statusMsg += `━━━━━━━━━━━━━━━━\n`;
                    statusMsg += `🗓 Period: ${currentIssue}\n`;
                    statusMsg += `🎲 Result: ${realSide} (${realNumber})\n`;
                    statusMsg += `🤖 AI Pred: ${data.last_pred}\n`;
                    statusMsg += `📊 Mode: ${modeText}\n`;
                    statusMsg += `💰 Profit: ${data.totalProfit.toFixed(2)} MMK\n`;
                    statusMsg += `🏦 Balance: ${(data.currentBalance || 0).toFixed(2)} MMK\n`;
                    const winsDisplay = data.autoRunning ? data.sessionWins : 0;
                    statusMsg += `🏆 Wins: ${winsDisplay}/${data.stopLimit}\n`;
                    const lossStreakShort = formatLossStreakShort(data.aiLogs);
                    statusMsg += `📉 ${lossStreakShort}\n`;

                    if ((data.autoMode === 'ai_brain' || data.autoMode === 'ensemble') && data.brainStats) {
                        statusMsg += `🧠 Best Mode: ${data.brainStats.currentBestMode || 'N/A'}\n`;
                    }
                    if (data.autoMode === 'ensemble') {
                        statusMsg += `📊 Ensemble Weights: V=${ensemblePredictor.weights.voting?.toFixed(2)||'1.5'} T=${ensemblePredictor.weights.timeframe?.toFixed(2)||'1.2'}\n`;
                    }
                    statusMsg += `━━━━━━━━━━━━━━━━\n`;
                    statusMsg += `🚀 Next: ${nextIssue.slice(-5)} (${mmTime})\n`;
                    statusMsg += `🦸 ခန့်မှန်း: ${data.last_pred === "Big" ? "ကြီး (BIG)" : "သေး (SMALL)"}\n`;
                    if (data.consecutiveLosses > 0) {
                        statusMsg += `⚠️ လက်ရှိအမှားဆက်: ${data.consecutiveLosses} ပွဲ`;
                        if (data.consecutiveLosses >= 7) statusMsg += ` (7 ပွဲဆက်မှား - သတိထားပါ)`;
                        statusMsg += `\n`;
                    }
                    statusMsg += `━━━━━━━━━━━━━━━━\n`;
                    statusMsg += `${formatAIHistoryForVIP(data.aiLogs, 50)}`;

                    addToPublicSignals({
                        username: nickname,
                        issue: currentIssue.slice(-5),
                        prediction: data.last_pred,
                        aiPred: data.last_pred,
                        mode: modeText,
                        profit: data.totalProfit.toFixed(2)
                    });

                    await bot.sendMessage(chatId, statusMsg, {
                        parse_mode: "Markdown",
                        reply_markup: { inline_keyboard: [[{ text: "🔵 Big", callback_data: "bet_Big" }, { text: "🔴 Small", callback_data: "bet_Small" }]] }
                    });
                }
            }
        } catch (error) {
            console.error(`Monitoring loop error for chat ${chatId}:`, error);
        }

        await new Promise(r => setTimeout(r, 800));
    }
}

// ========== MENUS ==========
const mainMenu = {
    reply_markup: {
        keyboard: [
            ["🚀 Start Auto", "🛑 Stop Auto"],
            ["⚙️ Settings", "📊 Status"],
            ["💰 Check Balance", "📜 Bet History"],
            ["📈 AI History", "🧠 GetEmerdList ခန့်မှန်း"],
            ["📉 Check AI Loss Streak", "🌍 Global Dashboard"],
            ["👤 Set Nickname", "🧠 Brain Stats"],
            ["🎯 VIP Signal On/Off", "📊 Memory Stats"],
            ["🧬 Ensemble Weights", "🚪 Logout"]
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
            ["🔄 Follow Pattern"],
            ["🔃 Reverse Pattern"],
            ["🤖 AI Correction"],
            ["🧠 GetEmerdList Auto"],
            ["🧬 Smart Hybrid"],
            ["🧠 AI Brain (Master)"],
            ["🧠 Cautious Brain (Markov)"],
            ["🧠 Ensemble Ultra (8-in-1)"],
            ["🔙 Main Menu"]
        ],
        resize_keyboard: true
    }
};

// ========== MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    let data = getUserData(chatId);

    if (text === '/start') {
        data.running = false;
        data.token = null;
        data.autoRunning = false;
        data.manualBetLock = false;
        data.sessionWins = 0;
        data.totalWins = 0;
        data.betHistory = [];
        data.aiLogs = [];
        data.totalProfit = 0;
        data.currentBalance = 0;
        data.vipSignalsEnabled = true;
        data.ensembleMode = true;
        data.brainStats = {
            totalPredictions: 0,
            correctPredictions: 0,
            modePerformance: {
                follow: { wins: 0, losses: 0 },
                reverse: { wins: 0, losses: 0 },
                ai_correction: { wins: 0, losses: 0 },
                emerdlist: { wins: 0, losses: 0 },
                hybrid: { wins: 0, losses: 0 },
                cautious: { wins: 0, losses: 0 },
                ensemble: { wins: 0, losses: 0 }
            },
            currentBestMode: null,
            lastModeSwitch: null,
            consecutiveModeFailures: 0
        };
        delete data.settingMode;
        delete data.tempPhone;
        delete data.pendingSide;
        delete data.username;
        saveUserData(chatId, data);

        let welcomeMsg = `🎯 *WinGo Sniper Pro v4.0* 🎯\n`;
        welcomeMsg += `━━━━━━━━━━━━━━━━\n`;
        welcomeMsg += `⏰ 30 Sec Game - Ensemble AI\n`;
        welcomeMsg += `🧠 *Mode 8 မျိုး:*\n`;
        welcomeMsg += `  🔄 Follow\n  🔃 Reverse\n  🤖 AI Correction\n  🧠 GetEmerdList\n  🧬 Smart Hybrid\n  🧠 AI Brain\n  🧠 Cautious Brain (Markov)\n`;
        welcomeMsg += `  🧠 *Ensemble Ultra (8-in-1)* ← အသစ်!\n`;
        welcomeMsg += `━━━━━━━━━━━━━━━━\n`;
        welcomeMsg += `🎯 *VIP Signal System* - Pattern Detection\n`;
        welcomeMsg += `📊 *Kelly Criterion* - Smart Bet Sizing (Min: Bet Plan)\n`;
        welcomeMsg += `🧬 *Ensemble AI* - 8 Methods Combined\n`;
        welcomeMsg += `━━━━━━━━━━━━━━━━\n\n`;
        welcomeMsg += `ဖုန်းနံပါတ်ပေးပါ (သို့) Global Dashboard ကြည့်ပါ:`;

        await bot.sendMessage(chatId, welcomeMsg, { parse_mode: "Markdown" });
        return bot.sendMessage(chatId, "🔐 ဆက်လက်အသုံးပြုရန် ဖုန်းနံပါတ်ပေးပါ:", mainMenu);
    }

    if (text === "🧬 Ensemble Weights") {
        try {
            const weights = ensemblePredictor.weights || loadEnsembleWeights();
            
            let msg = `🧬 *Ensemble AI Weights*\n━━━━━━━━━━━━━━━━\n📊 နည်းလမ်းတစ်ခုချင်းစီရဲ့ အလေးချိန်:\n\n`;
            
            const methods = [
                { key: 'timeframe', name: 'Multi-Timeframe' },
                { key: 'voting', name: 'Weighted Voting' },
                { key: 'pattern', name: 'Pattern Matching' },
                { key: 'monteCarlo', name: 'Monte Carlo' },
                { key: 'anomaly', name: 'Anomaly Detection' },
                { key: 'markov', name: 'Markov Chain' },
                { key: 'ai_brain', name: 'AI Brain' },
                { key: 'hybrid', name: 'Smart Hybrid' }
            ];
            
            methods.forEach(m => {
                const weight = weights[m.key] || 1.0;
                const bar = '█'.repeat(Math.max(1, Math.round(weight * 5)));
                msg += `• ${m.name}: ${weight.toFixed(2)} ${bar}\n`;
            });
            
            msg += `\n💡 Weights တွေက မှန်/မှားပေါ်မူတည်ပြီး အလိုအလျောက်ပြောင်းပါတယ်။`;
            
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
        } catch (e) {
            console.error('Ensemble Weights error:', e);
            await bot.sendMessage(chatId, "❌ ခေတ္တကြည့်၍မရပါ။ နောက်မှ ပြန်စမ်းပါ။");
        }
        return;
    }

    if (text === "🎯 VIP Signal On/Off") {
        data.vipSignalsEnabled = !data.vipSignalsEnabled;
        saveUserData(chatId, data);
        const status = data.vipSignalsEnabled ? "🟢 ON" : "🔴 OFF";
        return bot.sendMessage(chatId, `🎯 VIP Signal System: ${status}\n\n${data.vipSignalsEnabled ? 'တကွက်ကောင်း အချက်ပြများ လက်ခံရရှိပါမည်' : 'တကွက်ကောင်း အချက်ပြများ ပိတ်ထားပါသည်'}`, mainMenu);
    }

    if (text === "📊 Memory Stats") {
        if (!smartMemory[chatId] || !smartMemory[chatId].history || smartMemory[chatId].history.length === 0) {
            return bot.sendMessage(chatId, "📊 Memory မှတ်တမ်း မရှိသေးပါ။ အနည်းဆုံး ၁၀ ပွဲစောင့်ပါ။");
        }
        
        const mem = smartMemory[chatId];
        const totalGames = mem.history.length;
        const aiCorrect = mem.history.filter(h => h.aiCorrect).length;
        const aiAccuracy = ((aiCorrect / totalGames) * 100).toFixed(1);
        
        let msg = `🧠 *Smart Memory Statistics*\n━━━━━━━━━━━━━━━━\n`;
        msg += `📊 စုစုပေါင်းပွဲ: ${totalGames}\n✅ AI မှန်: ${aiCorrect} (${aiAccuracy}%)\n`;
        msg += `🎯 VIP Signals Sent: ${smartMemory.totalSignals || 0}\n`;
        msg += `🕐 Last Signal: ${smartMemory.lastSignalTime ? new Date(smartMemory.lastSignalTime).toLocaleString('en-US', { timeZone: 'Asia/Yangon' }) : 'N/A'}\n`;
        msg += `━━━━━━━━━━━━━━━━\n`;
        
        if (Object.keys(mem.patterns).length > 0) {
            msg += `📋 *Detected Patterns:*\n`;
            Object.values(mem.patterns).forEach(p => {
                msg += `• ${p.name}: ${p.triggeredCount || 0} times (Confidence: ${p.confidence}%)\n`;
            });
        }
        
        const last5 = mem.history.slice(-5).reverse();
        msg += `━━━━━━━━━━━━━━━━\n📝 *Last 5 Memory:*\n`;
        last5.forEach((h) => {
            const aiEmoji = h.aiCorrect ? '✅' : '❌';
            msg += `${aiEmoji} ${h.issue} | AI:${h.aiSide} | Real:${h.realSide}(${h.realNumber}) | Web Streak:${h.websiteStreak}\n`;
        });
        
        return bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }

    if (text === "💰 Check Balance") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ။");
        await bot.sendMessage(chatId, "⏳ လက်ကျန်ငွေ စစ်ဆေးနေပါသည်...");
        const balance = await checkBalance(chatId);
        if (balance !== null && balance > 0) {
            await bot.sendMessage(chatId, `💰 *လက်ကျန်ငွေ*\n━━━━━━━━━━━━━━━━\n🏦 ${balance.toFixed(2)} MMK`, { parse_mode: "Markdown" });
        } else if (balance === 0) {
            await bot.sendMessage(chatId, `💰 *လက်ကျန်ငွေ*\n━━━━━━━━━━━━━━━━\n🏦 0.00 MMK\n\n⚠️ လက်ကျန်ငွေ 0 ဖြစ်နေပါသည်။`, { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ လက်ကျန်ငွေ စစ်ဆေး၍မရပါ။");
        }
        return;
    }

    if (text === "🧠 Brain Stats") {
        if (!data.brainStats) {
            return bot.sendMessage(chatId, "📊 Brain Statistics မရှိသေးပါ။ Auto Mode တစ်ခုခု အရင်ဖွင့်ပါ။");
        }
        const bs = data.brainStats;
        let msg = `🧠 *AI Brain Statistics*\n━━━━━━━━━━━━━━━━\n`;
        msg += `📊 Total Predictions: ${bs.totalPredictions}\n✅ Correct: ${bs.correctPredictions}\n`;
        msg += `📈 Overall: ${bs.totalPredictions > 0 ? ((bs.correctPredictions / bs.totalPredictions) * 100).toFixed(1) : 0}%\n`;
        msg += `🏆 Best Mode: ${bs.currentBestMode || 'N/A'}\n⚠️ Mode Failures: ${bs.consecutiveModeFailures}\n`;
        msg += `━━━━━━━━━━━━━━━━\n📋 *Mode Performance:*\n`;
        Object.keys(bs.modePerformance).forEach(m => {
            const p = bs.modePerformance[m];
            const total = p.wins + p.losses;
            const rate = total > 0 ? ((p.wins / total) * 100).toFixed(0) : 'N/A';
            msg += `${getModeEmoji(m)} ${m}: ${p.wins}W/${p.losses}L (${rate}%)\n`;
        });
        return bot.sendMessage(chatId, msg);
    }

    if (text === "🌍 Global Dashboard") {
        await bot.sendMessage(chatId, "🌍 *GLOBAL DASHBOARD*", { parse_mode: "Markdown" });
        const globalBets = formatGlobalBetHistory();
        await bot.sendMessage(chatId, globalBets, { parse_mode: "Markdown" });
        const globalAI = formatGlobalAILogs();
        await bot.sendMessage(chatId, globalAI, { parse_mode: "Markdown" });
        const activeSignals = formatActiveSignals();
        await bot.sendMessage(chatId, activeSignals, { parse_mode: "Markdown" });
        return;
    }

    if (text === "👤 Set Nickname") {
        data.settingMode = "nickname";
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "📝 သင်ပြချင်တဲ့ နာမည်ပြောင်ထည့်ပါ:");
    }

    if (data.settingMode === "nickname") {
        data.nickname = text;
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, `✅ နာမည်ပြောင် "${text}" သတ်မှတ်ပြီးပါပြီ!`, mainMenu);
    }

    if (data.settingMode) {
        if (data.settingMode === "betplan") {
            const numbers = text.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
            if (numbers.length > 0) {
                data.betPlan = numbers;
                data.currentBetStep = 0;
                await bot.sendMessage(chatId, `✅ Bet Plan ပြောင်းပြီး: ${numbers.join(' → ')}`);
            } else await bot.sendMessage(chatId, "❌ မှားယွင်းနေပါသည်။ ဥပမာ: 10,30,60,90,150");
        } else if (data.settingMode === "stoplimit") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
                data.stopLimit = num;
                data.sessionWins = 0;
                await bot.sendMessage(chatId, `✅ Stop Limit: ${num} ပွဲနိုင်`);
            } else await bot.sendMessage(chatId, "❌ ဂဏန်းသာ ထည့်ပါ။");
        } else if (data.settingMode === "lossstart") {
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num <= 10) {
                data.lossStartLimit = num;
                await bot.sendMessage(chatId, `✅ Loss Start: AI ${num} ပွဲဆက်မှားရင် စထိုးပါမည်။`);
            } else await bot.sendMessage(chatId, "❌ ၁ မှ ၁၀ အတွင်း ထည့်ပါ။");
        }
        delete data.settingMode;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    }

    if (data.pendingSide && /^\d+$/.test(text)) {
        const amount = parseInt(text);
        if (isNaN(amount) || amount <= 0) {
            await bot.sendMessage(chatId, "❌ ပမာဏမှားနေပါ။");
            data.pendingSide = null;
            saveUserData(chatId, data);
            return;
        }
        const targetIssue = await getNextIssue(chatId, data.token);
        if (!targetIssue) {
            await bot.sendMessage(chatId, "❌ ပွဲစဉ်ရယူ၍မရပါ။");
            data.pendingSide = null;
            saveUserData(chatId, data);
            return;
        }
        await bot.sendMessage(chatId, `⏳ 3 စက္ကန့်စောင့်ပြီး ${data.pendingSide} (ပွဲစဉ် ${targetIssue.slice(-5)}) ထိုးပါမည်...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await placeBetNow(chatId, data.pendingSide, amount, targetIssue, -1, false, `ကိုယ်တိုင်ထိုး (${targetIssue.slice(-5)})`);
        data.pendingSide = null;
        saveUserData(chatId, data);
        return;
    }

    if (text === "🚀 Start Auto") {
        if (!data.token) return bot.sendMessage(chatId, "❌ အကောင့်ဝင်ပါ။");
        return bot.sendMessage(chatId, "🤖 Auto Mode ရွေးပါ:", autoModeMenu);
    }

    if (text === "🔄 Follow Pattern") {
        data.autoRunning = true; data.autoMode = 'follow'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Follow Mode Started!\n\nနောက်ဆုံးပွဲအတိုင်း လိုက်ထိုးမည်။\nStop Limit: ${data.stopLimit} ပွဲနိုင်ရင် ရပ်မည်။\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu);
    }
    if (text === "🔃 Reverse Pattern") {
        data.autoRunning = true; data.autoMode = 'reverse'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Reverse Mode Started!\n\nကြီးထွက်ရင် သေးထိုး / သေးထွက်ရင် ကြီးထိုး\nStop Limit: ${data.stopLimit} ပွဲနိုင်ရင် ရပ်မည်။\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu);
    }
    if (text === "🤖 AI Correction") {
        data.autoRunning = true; data.autoMode = 'ai_correction'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ AI Correction Started!\n\nStop Limit: ${data.stopLimit} ပွဲနိုင်\nLoss Start: ${data.lossStartLimit} ပွဲဆက်မှား\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu);
    }
    if (text === "🧠 GetEmerdList Auto") {
        data.autoRunning = true; data.autoMode = 'emerdlist'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ GetEmerdList Auto Started!\n\nStop Limit: ${data.stopLimit} ပွဲနိုင်\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu);
    }
    if (text === "🧬 Smart Hybrid") {
        data.autoRunning = true; data.autoMode = 'hybrid'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ Smart Hybrid Mode Started!\n\n🧬 Logic (AI 20 ပွဲကြည့်):\n• AI 70%+ မှန် → AI လိုက်\n• AI 2-4 ပွဲမှား → Website Follow\n• AI 5+ ပွဲမှား → AI ပြန်မှန်ချိန်\n\nStop Limit: ${data.stopLimit}\nBet Plan: ${data.betPlan.join(' → ')}`, mainMenu);
    }
    if (text === "🧠 AI Brain (Master)") {
        data.autoRunning = true; data.autoMode = 'ai_brain'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ *AI Brain (Master Mode) Started!*\n\n🧠 *ဦးနှောက်ဖြင့် ဆုံးဖြတ်မည့် Mode*\n\nStop Limit: ${data.stopLimit}\nBet Plan: ${data.betPlan.join(' → ')}`, { parse_mode: "Markdown", ...mainMenu });
    }
    if (text === "🧠 Cautious Brain (Markov)") {
        data.autoRunning = true; data.autoMode = 'cautious'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        await bot.sendMessage(chatId, `✅ *Cautious Brain (Markov) Mode Started!*\n\n🧠 Markov Chain (order 3) ဖြင့် Website Pattern ဖမ်းမည်\n🤖 AI ခန့်မှန်းချက်နဲ့ နှိုင်းယှဉ်မည်\n⚠️ Confidence ≥ 65% + AI/Markov သဘောတူမှထိုးမည်\n📉 AI အမှားဆက် အမြင့်ဆုံးရောက်ရင် Markov အတိုင်းဆက်ထိုးမည်\n💰 Bet Plan: ${data.betPlan.join(' → ')}`, { parse_mode: "Markdown", ...mainMenu });
    }
    if (text === "🧠 Ensemble Ultra (8-in-1)") {
        data.autoRunning = true; data.autoMode = 'ensemble'; data.currentBetStep = 0; data.consecutiveWins = 0; data.consecutiveLosses = 0; data.manualBetLock = false; data.sessionWins = 0;
        saveUserData(chatId, data);
        
        let ensembleMsg = `✅ *ENSEMBLE ULTRA MODE ACTIVATED!*\n`;
        ensembleMsg += `━━━━━━━━━━━━━━━━\n🧠 *နည်းလမ်း ၈ ခုပေါင်းစပ်ထားသော AI*\n\n`;
        ensembleMsg += `📊 *ပါဝင်သော နည်းလမ်းများ:*\n`;
        ensembleMsg += `  1. Multi-Timeframe Analysis\n  2. Weighted Voting (7 modes)\n  3. Pattern Matching\n`;
        ensembleMsg += `  4. Monte Carlo Simulation\n  5. Anomaly Detection\n  6. Markov Chain\n`;
        ensembleMsg += `  7. AI Brain\n  8. Smart Hybrid\n\n`;
        ensembleMsg += `💰 *Kelly Criterion* - ယုံကြည်မှုအလိုက် ထိုးကြေးပြောင်း\n`;
        ensembleMsg += `📌 *Min Bet = Bet Plan အတိုင်း* (10 ကျပ်အောက်မထိုး)\n`;
        ensembleMsg += `🔄 *Auto Weight Update* - မှန်/မှားပေါ်မူတည်၍ အလေးချိန်ပြောင်း\n`;
        ensembleMsg += `━━━━━━━━━━━━━━━━\nStop Limit: ${data.stopLimit}\nBet Plan: ${data.betPlan.join(' → ')}`;
        
        await bot.sendMessage(chatId, ensembleMsg, { parse_mode: "Markdown", ...mainMenu });
    }

    if (text === "🛑 Stop Auto") {
        data.autoRunning = false; data.autoMode = null; data.sessionWins = 0; data.currentBetStep = 0;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🛑 Auto Bet ရပ်ထားပါပြီ!", mainMenu);
    }

    if (text === "⚙️ Settings") return bot.sendMessage(chatId, "⚙️ Settings Menu", settingsMenu);
    if (text === "🎲 Set Bet Plan") {
        data.settingMode = "betplan"; saveUserData(chatId, data);
        return bot.sendMessage(chatId, `📝 Bet Plan ထည့်ပါ\n\nလက်ရှိ: ${data.betPlan.join(' → ')}\n\nဥပမာ: 10,30,60,90,150,250,400,650`);
    }
    if (text === "🛑 Set Stop Limit") {
        data.settingMode = "stoplimit"; saveUserData(chatId, data);
        return bot.sendMessage(chatId, `🏆 Stop Limit ထည့်ပါ\n\nလက်ရှိ: ${data.stopLimit} ပွဲ`);
    }
    if (text === "⚠️ Set Loss Start") {
        data.settingMode = "lossstart"; saveUserData(chatId, data);
        return bot.sendMessage(chatId, `⚠️ Loss Start Limit ထည့်ပါ (၁-၁၀)\n\nလက်ရှိ: ${data.lossStartLimit} ပွဲဆက်မှား`);
    }
    if (text === "🔙 Main Menu") {
        delete data.settingMode; saveUserData(chatId, data);
        return bot.sendMessage(chatId, "Main Menu", mainMenu);
    }

    if (text === "📊 Status") {
        let mode = data.autoRunning ? data.autoMode : "Manual";
        let modeEmoji = getModeEmoji(mode);
        const nickname = data.nickname || "Not set";
        const lossStreak = formatLossStreakShort(data.aiLogs);
        let status = `📊 *${nickname} - Status*\n━━━━━━━━━━━━━━━━\n${modeEmoji} Mode: ${mode}\n📋 Bet Plan: ${data.betPlan.join(' → ')}\n🏆 Stop Limit: ${data.stopLimit}\n⚠️ Loss Start: ${data.lossStartLimit}\n📈 Current Step: ${(data.currentBetStep || 0) + 1}/${data.betPlan.length}\n✅ Session Wins: ${data.sessionWins}/${data.stopLimit}\n🏆 Total Wins: ${data.totalWins}\n💰 Total Profit: ${(data.totalProfit || 0).toFixed(2)} MMK\n🏦 Balance: ${(data.currentBalance || 0).toFixed(2)} MMK\n📉 ${lossStreak}\n`;
        if (data.consecutiveLosses > 0) status += `⚠️ လက်ရှိအမှားဆက်: ${data.consecutiveLosses} ပွဲ\n`;
        if (data.brainStats?.currentBestMode) status += `🧠 Best Mode: ${data.brainStats.currentBestMode}\n`;
        status += `🎯 VIP Signals: ${data.vipSignalsEnabled ? '🟢 ON' : '🔴 OFF'}\n`;
        if (data.autoMode === 'ensemble') {
            status += `📊 Ensemble Weights: V=${ensemblePredictor.weights.voting?.toFixed(2)||'1.5'} P=${ensemblePredictor.weights.pattern?.toFixed(2)||'1.3'}\n`;
        }
        return bot.sendMessage(chatId, status);
    }

    if (text === "📜 Bet History") {
        let txt = `📜 *${data.nickname || 'My'} Bet History*\n💰 Total Profit: ${(data.totalProfit || 0).toFixed(2)} MMK\n🏆 Total Wins: ${data.totalWins}\n━━━━━━━━━━━━━━━━\n`;
        if (data.betHistory.length === 0) txt += "မှတ်တမ်းမရှိသေးပါ";
        else {
            data.betHistory.slice(0, 15).forEach(h => {
                const pnl = h.status === "⏳ Pending" ? "" : ` (${h.pnl >= 0 ? '+' : ''}${h.pnl.toFixed(2)})`;
                const modeTag = h.mode ? ` [${h.mode}]` : '';
                txt += `${h.status} | ${h.issue} | ${h.side}${modeTag} | ${h.amount}${pnl}\n`;
                if (h.reason) txt += `   ↳ ${h.reason}\n`;
            });
        }
        return bot.sendMessage(chatId, txt);
    }

    if (text === "📈 AI History") {
        if (!data.aiLogs || data.aiLogs.length === 0) return bot.sendMessage(chatId, "📊 AI မှတ်တမ်းမရှိသေးပါ");
        const recent50 = data.aiLogs.slice(0, 50);
        let wins = recent50.filter(l => l.status === "✅").length;
        let txt = `📈 *${data.nickname || 'My'} AI History (50 ပွဲ)*\n━━━━━━━━━━━━━━━━\n📊 ${wins}/${recent50.length} (မှန်နှုန်း: ${((wins / recent50.length) * 100).toFixed(1)}%)\n━━━━━━━━━━━━━━━━\n`;
        recent50.forEach((log, i) => {
            txt += `${i + 1}. ${log.status} ${log.issue} | ${log.prediction}→${log.result} | ${log.number || ''}\n`;
        });
        return bot.sendMessage(chatId, txt);
    }

    if (text === "📉 Check AI Loss Streak") {
        if (!data.aiLogs || data.aiLogs.length === 0) return bot.sendMessage(chatId, "📊 AI မှတ်တမ်းမရှိသေးပါ");
        const report = formatLossStreakReport(data.aiLogs);
        return bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
    }

    if (text === "🧠 GetEmerdList ခန့်မှန်း") {
        await bot.sendMessage(chatId, "⏳ GetEmerdList API ခေါ်နေပါသည်...");
        const pred = await getEmerdListPrediction(chatId, data.token);
        const nextIssue = await getNextIssue(chatId, data.token);
        let msg = `🧠 **GetEmerdList ခန့်မှန်းချက်**\n━━━━━━━━━━━━━━━━\n🚀 နောက်ပွဲစဉ်: ${nextIssue?.slice(-5) || 'N/A'}\n💡 ခန့်မှန်း: ${pred.prediction === "Big" ? "🔵 BIG" : "🔴 SMALL"}\n📝 အကြောင်း: ${pred.reason}`;
        await bot.sendMessage(chatId, msg, { reply_markup: { inline_keyboard: [[{ text: `💰 ${pred.prediction} ထိုးမည်`, callback_data: `bestbet_${pred.prediction}` }]] } });
        return;
    }

    if (text === "🚪 Logout") {
        data.running = false; data.token = null; data.autoRunning = false; data.sessionWins = 0; data.currentBetStep = 0; data.currentBalance = 0;
        delete data.tempPhone; delete data.pendingSide; delete data.settingMode; delete data.username;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "👋 အကောင့်ထွက်ပြီးပါပြီ။ /start ဖြင့် ပြန်ဝင်ပါ။");
    }

    if (/^\d{9,11}$/.test(text) && !data.token) {
        data.tempPhone = text;
        saveUserData(chatId, data);
        return bot.sendMessage(chatId, "🔐 Password ပေးပါ:");
    }

    if (data.tempPhone && !data.token) {
        const username = "95" + data.tempPhone.replace(/^0/, '');
        await bot.sendMessage(chatId, "⏳ အကောင့်ဝင်နေပါသည်...");
        const res = await callApi("Login", { phonetype: -1, logintype: "mobile", username, pwd: text });
        if (res?.msgCode === 0) {
            data.token = res.data.tokenHeader + " " + res.data.token;
            data.running = true;
            data.username = data.tempPhone;
            if (!data.nickname) data.nickname = `User ${chatId.slice(-3)}`;
            delete data.tempPhone;
            saveUserData(chatId, data);
            updateActiveUser(chatId, data.nickname);
            await checkBalance(chatId);
            data = getUserData(chatId);
            monitoringLoop(chatId);
            await bot.sendMessage(chatId, `✅ Login Success!\n\n🏦 လက်ကျန်ငွေ: ${(data.currentBalance || 0).toFixed(2)} MMK\n\nSignal များ User သို့သာ ပို့ပါမည်။\n🎯 VIP Signal System: ${data.vipSignalsEnabled ? '🟢 ON' : '🔴 OFF'}\n🧬 Ensemble Ultra: Available in Auto Mode`, mainMenu);
        } else {
            await bot.sendMessage(chatId, "❌ Login Failed! နံပါတ်နှင့် Password ပြန်စစ်ပါ။");
            delete data.tempPhone;
            saveUserData(chatId, data);
        }
        return;
    }
});

// ========== CALLBACK HANDLER ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const action = query.data;
    const data = getUserData(chatId);

    if (action.startsWith('vipbet_')) {
        const parts = action.split('_');
        const side = parts[1];
        const confidence = parts[2] || '70';
        data.pendingSide = side;
        saveUserData(chatId, data);
        await bot.answerCallbackQuery(query.id, { text: `🎯 VIP Signal: ${side} (${confidence}% confidence)` });
        await bot.sendMessage(chatId, `🎯 *VIP Signal အတိုင်းထိုးမည်*\n💰 ${side === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:\n\n⚠️ ကိုယ်တိုင်ဆုံးဖြတ်ပြီးမှ ထိုးပါ`, { parse_mode: "Markdown" });
        return;
    }
    
    if (action === 'vip_skip') {
        await bot.answerCallbackQuery(query.id, { text: 'VIP Signal ကျော်သွားပါမည်' });
        return;
    }
    
    if (action.startsWith('bestbet_')) {
        data.pendingSide = action.split('_')[1];
        saveUserData(chatId, data);
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, `💰 ${data.pendingSide === "Big" ? "BIG 🔵" : "SMALL 🔴"} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
        return;
    }
    if (action.startsWith('bet_')) {
        data.pendingSide = action.split('_')[1];
        saveUserData(chatId, data);
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, `💰 ${data.pendingSide} အတွက် ထိုးမည့်ပမာဏ ရိုက်ထည့်ပါ:`);
    }
});

// ========== HELP COMMAND ==========
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id.toString();
    let helpText = `📖 *WinGo Pro Bot v4.0 - Ensemble Ultra*\n━━━━━━━━━━━━━━━━\n\n🤖 *Auto Modes (8 Modes)*\n`;
    helpText += `• 🔄 Follow - နောက်ဆုံးပွဲအတိုင်း\n• 🔃 Reverse - ပြောင်းပြန်ထိုး\n• 🤖 AI Correction - AI မှားချိန်မှထိုး\n• 🧠 GetEmerdList - Hot/Cold+Trend\n• 🧬 Smart Hybrid - AI+Website ပေါင်း\n• 🧠 AI Brain - Master Decision\n• 🧠 Cautious Brain - Markov Chain + AI\n• 🧠 *Ensemble Ultra* - 8 Methods Combined!\n`;
    helpText += `\n🧬 *Ensemble Ultra Features:*\n• Multi-Timeframe Analysis\n• Weighted Voting (7 modes)\n• Pattern Matching Engine\n• Monte Carlo Simulation\n• Anomaly Detection\n• Markov Chain Prediction\n• AI Brain + Hybrid\n• Kelly Criterion (Min: Bet Plan)\n• Auto Weight Adjustment\n`;
    await bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
});

// ========== UTILS ==========
function getModeEmoji(mode) {
    switch (mode) {
        case 'follow': return "🔄";
        case 'reverse': return "🔃";
        case 'ai_correction': return "🤖";
        case 'emerdlist': return "🧠";
        case 'hybrid': return "🧬";
        case 'ai_brain': return "🧠";
        case 'cautious': return "🧠";
        case 'ensemble': return "🧠";
        default: return "⚪️";
    }
}

function updateBrainStats(data, mode, isWin) {
    if (!data.brainStats) return;
    data.brainStats.totalPredictions++;
    if (isWin) data.brainStats.correctPredictions++;
    if (data.brainStats.modePerformance[mode]) {
        if (isWin) {
            data.brainStats.modePerformance[mode].wins++;
            data.brainStats.consecutiveModeFailures = 0;
        } else {
            data.brainStats.modePerformance[mode].losses++;
            data.brainStats.consecutiveModeFailures++;
        }
    }
    let bestMode = null;
    let bestWinRate = -1;
    Object.keys(data.brainStats.modePerformance).forEach(m => {
        const perf = data.brainStats.modePerformance[m];
        const total = perf.wins + perf.losses;
        if (total > 0) {
            const winRate = perf.wins / total;
            if (winRate > bestWinRate) {
                bestWinRate = winRate;
                bestMode = m;
            }
        }
    });
    data.brainStats.currentBestMode = bestMode;
}

// ========== HTTP SERVER ==========
http.createServer((req, res) => {
    if (req.url === `/bot${token}` && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                bot.processUpdate(JSON.parse(body));
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400);
                res.end();
            }
        });
    } else {
        res.writeHead(200);
        res.end('WinGo Pro Bot v4.0 - Ensemble Ultra AI (Fixed)');
    }
}).listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🧬 Ensemble Ultra AI: ACTIVE`);
    console.log(`🎯 VIP Signal System: READY`);
    console.log(`📊 Kelly Criterion: ENABLED (Min: Bet Plan, Min: 10 MMK)`);
    console.log(`🔧 Ensemble Weights Bug: FIXED`);
});

console.log("✅ WinGo Pro Bot v4.0 - All Bugs Fixed");
