import { StockData, InstitutionalData, AnalysisResult } from '@/types';
import { calculateSMA, checkMaAlignment, calculateVolumeRatio, calculatePOC } from './indicators';
import { CONFIG } from '@/lib/config';

interface StockHistory {
    prices: StockData[]; // sorted asc by date (last is today)
    insts: InstitutionalData[]; // sorted asc by date
}

/**
 * Kelly Criterion Calculation
 */
const calculateKelly = (score: number, close: number, ma5: number): AnalysisResult['kellyResult'] => {
    let winRate = 0.45;
    if (score >= 0.8) winRate = 0.75;
    else if (score >= 0.6) winRate = 0.60;
    else if (score >= 0.4) winRate = 0.50;

    const targetPrice = close * 1.10;
    const stopLoss = Math.min(ma5, close * 0.97);

    const potentialProfit = targetPrice - close;
    const potentialLoss = close - stopLoss;

    if (potentialLoss <= 0) return { action: 'Avoid', percentage: 0, winRate, riskRewardRatio: 0 };

    const b = potentialProfit / potentialLoss;
    const q = 1 - winRate;

    let f = (b * winRate - q) / b;
    f = f * 0.5;

    let action: 'Invest' | 'Wait' | 'Avoid' = 'Wait';
    if (f > 0.3) action = 'Invest';
    else if (f > 0) action = 'Invest';
    else action = 'Avoid';

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
    if (prices.length < 5) return null;

    const today = prices[prices.length - 1];

    // --- 1. Volume Analysis ---
    const histLen = prices.length;
    const volLookback = Math.min(20, histLen - 1);
    const pastPrices = prices.slice(histLen - 1 - volLookback, histLen - 1);
    const pastVolumes = pastPrices.map(p => p.Trading_Volume);
    const vRatio = pastVolumes.length > 0 ? calculateVolumeRatio(today.Trading_Volume, pastVolumes) : 1;
    const dailyVolumeTrend = prices.slice(Math.max(0, histLen - 10)).map(p => p.Trading_Volume);

    // --- 2. MA Analysis ---
    const closePrices = prices.map(p => p.close);
    const recent20 = closePrices.slice(Math.max(0, closePrices.length - 20));
    const ma5 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 5)), 5);
    const ma10 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 10)), 10);
    const ma20 = calculateSMA(recent20, 20);

    let isAligned = false;
    let isBreakout = false;

    if (ma5 && ma10 && ma20) {
        const maCheck = checkMaAlignment(today.close, ma5, ma10, ma20, CONFIG.SYSTEM.MA_ALIGNMENT_THRESHOLD);
        isAligned = maCheck.isAligned;
        isBreakout = maCheck.isBreakout;
    } else if (ma5 && today.close > ma5 * 1.03) {
        isBreakout = true;
    }

    // --- 3. Institutional Analysis ---
    const recentInsts = insts.filter(i => i.name === 'Investment_Trust').slice(-3);
    const consecutiveBuy = recentInsts.length >= 1 && recentInsts.every(i => (i.buy - i.sell) > 0);

    // --- 4. Scoring ---
    const maScoreVal = (isBreakout) ? 1.0 : 0;
    const instScoreVal = consecutiveBuy ? 1.0 : 0;
    const vScoreNorm = Math.min(vRatio, 5) / 5;
    const totalScore = (vScoreNorm * 0.4) + (maScoreVal * 0.3) + (instScoreVal * 0.3);

    // --- 5. Kelly & Risk ---
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

    // --- 7. Analysis Hints ---
    const techHint = isBreakout ? '股價站上均線集結點，形成技術面突破' : ((ma5 && today.close > ma5) ? '股價在 5 日線上強勢整理' : '股價暫時受到均線壓制');
    const chipHint = consecutiveBuy ? '投信連續買盤介入，籌碼穩定向大戶集中' : '三大法人進出尚無明顯方向';
    const fundHint = today.Trading_money > 100000000 ? '今日成交金額龐大，市場主流資金高度關注' : '成交熱度處於平均水平';

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
        },
        analysisHints: {
            technical: techHint,
            chips: chipHint,
            fundamental: fundHint
        }
    };
};
