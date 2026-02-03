import { StockData, InstitutionalData, AnalysisResult } from '@/types';
import { calculateSMA, checkMaAlignment, calculateVolumeRatio, calculatePOC } from './indicators';
import { CONFIG } from '@/lib/config';

interface StockHistory {
    prices: StockData[]; // sorted asc by date (last is today)
    insts: InstitutionalData[]; // sorted asc by date
}

/**
 * Kelly Criterion Calculation
 * f* = (bp - q) / b
 * b = odds (Target / StopLoss)
 * p = probability (Win Rate)
 * q = 1 - p
 */
const calculateKelly = (score: number, close: number, ma5: number): AnalysisResult['kellyResult'] => {
    // 1. Estimate Win Rate (p) based on Technical Score
    // Score 0.7+ -> 60% win rate, 0.9+ -> 75%
    let winRate = 0.45; // Default slightly bear/neutral
    if (score >= 0.8) winRate = 0.75;
    else if (score >= 0.6) winRate = 0.60;
    else if (score >= 0.4) winRate = 0.50;

    // 2. Estimate Risk/Reward (b)
    // Target: +10% (Momentum burst)
    // Stop: Lower of (5MA or -3%)
    const targetPrice = close * 1.10;
    const stopLoss = Math.min(ma5, close * 0.97);

    const potentialProfit = targetPrice - close;
    const potentialLoss = close - stopLoss;

    if (potentialLoss <= 0) return { action: 'Avoid', percentage: 0, winRate, riskRewardRatio: 0 };

    const b = potentialProfit / potentialLoss; // Odds
    const q = 1 - winRate;

    // Kelly Formula
    let f = (b * winRate - q) / b;

    // Half-Kelly for safety (crypto/stock volatility)
    f = f * 0.5;

    let action: 'Invest' | 'Wait' | 'Avoid' = 'Wait';
    if (f > 0.3) action = 'Invest';
    else if (f > 0) action = 'Invest'; // Small position
    else action = 'Avoid';

    // Cap at 20% max allocation per stock for safety
    const percentage = Math.max(0, Math.min(f * 100, 20));

    return {
        action,
        percentage: parseFloat(percentage.toFixed(1)),
        winRate,
        riskRewardRatio: parseFloat(b.toFixed(2))
    };
};

export const evaluateStock = (stockId: string, history: StockHistory): AnalysisResult | null => {
    const { prices, insts } = history;
    // Stage 1 scan might only have 10 days, Detailed view has 60+
    if (prices.length < 5) return null;

    const today = prices[prices.length - 1];

    // --- 1. Volume Analysis ---
    // Use available history up to 20 days
    const histLen = prices.length;
    const volLookback = Math.min(20, histLen - 1);
    const pastPrices = prices.slice(histLen - 1 - volLookback, histLen - 1);
    const pastVolumes = pastPrices.map(p => p.Trading_Volume);
    const vRatio = pastVolumes.length > 0 ? calculateVolumeRatio(today.Trading_Volume, pastVolumes) : 1;

    // Daily Volume Trend (Last 10 days)
    const dailyVolumeTrend = prices.slice(Math.max(0, histLen - 10)).map(p => p.Trading_Volume);

    // --- 2. MA Analysis ---
    const closePrices = prices.map(p => p.close);
    const recent20 = closePrices.slice(Math.max(0, closePrices.length - 20));

    // Calculate MAs safely even with short history
    const ma5 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 5)), 5);
    const ma10 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 10)), 10);
    const ma20 = calculateSMA(recent20, 20); // Might be null if < 20 days

    let isAligned = false;
    let isBreakout = false;

    if (ma5 && ma10 && ma20) {
        const maCheck = checkMaAlignment(today.close, ma5, ma10, ma20, CONFIG.SYSTEM.MA_ALIGNMENT_THRESHOLD);
        isAligned = maCheck.isAligned;
        isBreakout = maCheck.isBreakout;
    } else if (ma5 && today.close > ma5 * 1.03) {
        // Fallback for short history: simple breakout
        isBreakout = true;
    }

    // --- 3. Institutional Analysis ---
    const recentInsts = insts.filter(i => i.name === 'Investment_Trust').slice(-3);
    // Relaxed rule: Just need 3 days of data, not necessarily consecutively POSITIVE for all logic,
    // but for "Consecutive Buy" tag we need pos.
    const validInstData = recentInsts.length >= 1;
    const consecutiveBuy = validInstData && recentInsts.every(i => (i.buy - i.sell) > 0);

    // --- 4. Scoring ---
    const maScoreVal = (isBreakout) ? 1.0 : 0; // Simplified
    const instScoreVal = consecutiveBuy ? 1.0 : 0;

    // Normalize vRatio (cap at 5x for scoring)
    const vScoreNorm = Math.min(vRatio, 5) / 5;

    // Weights: Vol(40%), Tech(30%), Chips(30%)
    const totalScore = (vScoreNorm * 0.4) + (maScoreVal * 0.3) + (instScoreVal * 0.3);

    // --- 5. Kelly & Risk ---
    // Risk Warning
    let riskWarning = '';
    if (ma5 && today.close < ma5) riskWarning = '股價跌破 5 日線，短線轉弱';
    else if (vRatio > 10) riskWarning = '成交量過熱 (>10倍)，防主力出貨';

    const kelly = calculateKelly(totalScore, today.close, ma5 || today.close * 0.95);

    // --- 6. Verdict & Tags ---
    let verdict = 'Neutral';
    if (totalScore > 0.7) verdict = 'Strong Buy - 籌碼與技術面共振';
    else if (isBreakout) verdict = 'Bullish - 技術面突破';
    else if (consecutiveBuy) verdict = 'Accumulating - 投信佈局';

    const tags: AnalysisResult['tags'] = [];
    if (vRatio >= CONFIG.SYSTEM.V_RATIO_THRESHOLD) tags.push('VOLUME_EXPLOSION');
    if (isAligned && isBreakout) {
        tags.push('MA_SQUEEZE');
        tags.push('BREAKOUT');
    }
    if (consecutiveBuy) tags.push('INST_BUYING');

    return {
        stock_id: stockId,
        stock_name: today.stock_name,
        close: today.close,
        change_percent: (prices.length > 1) ? (today.close - prices[prices.length - 2].close) / prices[prices.length - 2].close : 0,
        score: parseFloat(totalScore.toFixed(2)),
        v_ratio: parseFloat(vRatio.toFixed(2)),
        is_ma_aligned: isAligned,
        is_ma_breakout: isBreakout,
        consecutive_buy: consecutiveBuy ? 3 : 0,
        poc: calculatePOC(prices, 20),
        verdict,
        tags,
        dailyVolumeTrend,
        kellyResult: kelly,
        riskWarning,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat((vScoreNorm * 40).toFixed(1)),
            maScore: parseFloat((maScoreVal * 30).toFixed(1)),
            chipScore: parseFloat((instScoreVal * 30).toFixed(1)),
            total: parseFloat((totalScore * 100).toFixed(1))
        }
    };
};
