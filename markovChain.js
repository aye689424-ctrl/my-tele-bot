// markovChain.js
function markovPredict(history, order = 3) {
    // history: array of "Big"/"Small" (latest first)
    if (history.length < order) return { prediction: null, confidence: 0 };

    const state = history.slice(0, order).reverse().join(",");
    const transitions = {};

    for (let i = order; i < history.length; i++) {
        const prev = history.slice(i - order, i).reverse().join(",");
        const next = history[i];
        if (!transitions[prev]) transitions[prev] = { Big: 0, Small: 0 };
        transitions[prev][next]++;
    }

    const counts = transitions[state] || { Big: 0, Small: 0 };
    const total = counts.Big + counts.Small;
    if (total === 0) return { prediction: null, confidence: 0 };

    const prediction = counts.Big >= counts.Small ? "Big" : "Small";
    const confidence = Math.max(counts.Big, counts.Small) / total;

    return { prediction, confidence };
}

module.exports = { markovPredict };
