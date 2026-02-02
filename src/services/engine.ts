import { StockData, InstitutionalData, AnalysisResult } from '@/types';
import { calculateSMA, checkMaAlignment, calculateVolumeRatio } from './indicators';
import { CONFIG } from '@/lib/config';

interface StockHistory {
    prices: StockData[]; // sorted asc by date (last is today)
    insts: InstitutionalData[]; // sorted asc by date
}

export const evaluateStock = (stockId: string, history: StockHistory): AnalysisResult | null => {
    const { prices, insts } = history;
    if (prices.length < 20) return null; // Need at least 20 days for MA20

    const today = prices[prices.length - 1];
    const prevPrices = prices.slice(0, prices.length - 1); // Historical for Volume Avg

    // 1. Volume Ratio
    // We use past 20 days (excluding today) for average volume to detect SURGE compared to recent hist.
    // Or include today? Usually "Volume Ratio" is Today / Avg(Past 20).
    const past20 = prices.slice(Math.max(0, prices.length - 21), prices.length - 1);
    const pastVolumes = past20.map(p => p.Trading_Volume);
    const vRatio = calculateVolumeRatio(today.Trading_Volume, pastVolumes);

    // 2. MA Alignment
    const closePrices = prices.map(p => p.close);
    // We need MAs for "Today".
    // MA5 = Avg of today + past 4
    // ...
    // Wait, calculateSMA inputs array.
    // Let's get last 20 prices including today.
    const recent20 = closePrices.slice(Math.max(0, closePrices.length - 20)); // Last 20 items

    const ma5 = calculateSMA(recent20.slice(-5), 5); // Last 5
    const ma10 = calculateSMA(recent20.slice(-10), 10);
    const ma20 = calculateSMA(recent20, 20);

    let isAligned = false;
    let isBreakout = false;

    if (ma5 && ma10 && ma20) {
        const maCheck = checkMaAlignment(today.close, ma5, ma10, ma20, CONFIG.SYSTEM.MA_ALIGNMENT_THRESHOLD);
        isAligned = maCheck.isAligned;
        isBreakout = maCheck.isBreakout;
    }

    // 3. Institutional Trend (Investment Trust)
    // Check if Investment Trust bought > 0 for last 3 days
    // We need to filter Inst data for this stock and check dates.
    // Assuming 'insts' contains only this stock's data.
    const recentInsts = insts.filter(i => i.name === 'Investment_Trust').slice(-3);
    const consecutiveBuy = recentInsts.length === 3 && recentInsts.every(i => i.buy - i.sell > 0);

    // Score Calculation
    // Formula: Score = (V_ratio * 0.4) + (MA_alignment * 0.3) + (Inst_trend * 0.3)
    // Converting Booleans to 1.0
    const maScore = (isAligned && isBreakout) ? 1.0 : 0;
    const instScore = consecutiveBuy ? 1.0 : 0;

    const totalScore = (vRatio * 0.4) + (maScore * 0.3) + (instScore * 0.3);

    // Generate Tags
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
        change_percent: (today.close - prices[prices.length - 2].close) / prices[prices.length - 2].close,
        score: totalScore,
        v_ratio: vRatio,
        is_ma_aligned: isAligned,
        is_ma_breakout: isBreakout,
        consecutive_buy: consecutiveBuy ? 3 : 0,
        tags
    };
};
