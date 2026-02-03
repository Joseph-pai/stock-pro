import { StockData, InstitutionalData, AnalysisResult } from '@/types';
import { calculateSMA, calculatePOC } from './indicators';
import { CONFIG } from '@/lib/config';

interface StockHistory {
    prices: StockData[];
    insts: InstitutionalData[];
}

/**
 * 量能激增檢測 (V_ratio)
 * 條件：當日成交量 > 過去 20 日平均成交量 3.5 倍
 */
export const calculateVRatio = (todayVolume: number, past20Volumes: number[]): number => {
    if (past20Volumes.length === 0) return 1;
    const avgVolume = past20Volumes.reduce((sum, v) => sum + v, 0) / past20Volumes.length;
    return avgVolume > 0 ? todayVolume / avgVolume : 1;
};

/**
 * 均線糾結檢測 (MA_constrict)
 * 條件：ABS(MA5 - MA20) / MA20 < 0.02 (2%)
 * 返回：{ isSqueezing: boolean, constrictValue: number }
 */
export const checkMaConstrict = (ma5: number, ma20: number): { isSqueezing: boolean; constrictValue: number } => {
    if (!ma5 || !ma20 || ma20 === 0) return { isSqueezing: false, constrictValue: 1 };
    const constrictValue = Math.abs(ma5 - ma20) / ma20;
    return {
        isSqueezing: constrictValue < 0.02,
        constrictValue: parseFloat(constrictValue.toFixed(4))
    };
};

/**
 * 投信連續買超檢測 (Inst_flow)
 * 條件：投信連續 3 日淨買超
 */
export const checkInstFlow = (institutionalData: InstitutionalData[]): {
    consecutiveBuy: boolean;
    buyDays: number;
    totalNetBuy: number;
} => {
    const investmentTrust = institutionalData.filter(i => i.name === 'Investment_Trust');
    if (investmentTrust.length < 3) return { consecutiveBuy: false, buyDays: 0, totalNetBuy: 0 };

    const recent3 = investmentTrust.slice(-3);
    const allBuying = recent3.every(day => (day.buy - day.sell) > 0);
    const totalNetBuy = recent3.reduce((sum, day) => sum + (day.buy - day.sell), 0);

    return {
        consecutiveBuy: allBuying,
        buyDays: allBuying ? 3 : 0,
        totalNetBuy
    };
};

/**
 * 成交量連續遞增檢測
 * 條件：成交量連續 3 天遞增
 */
export const checkVolumeIncreasing = (volumes: number[]): boolean => {
    if (volumes.length < 3) return false;
    const last3 = volumes.slice(-3);
    return last3[0] < last3[1] && last3[1] < last3[2];
};

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

/**
 * 專業評分引擎 (基於 PDF 公式)
 * Score = (V_ratio × 40%) + (MA_constrict × 30%) + (Inst_flow × 30%)
 */
export const evaluateStock = (stockId: string, history: StockHistory): AnalysisResult | null => {
    const { prices, insts } = history;
    if (prices.length < 3) return null;

    const today = prices[prices.length - 1];

    // --- 1. 量能分析 (V_ratio) ---
    const histLen = prices.length;
    const volLookback = Math.min(20, histLen - 1);
    const pastPrices = prices.slice(histLen - 1 - volLookback, histLen - 1);
    const pastVolumes = pastPrices.map(p => p.Trading_Volume);
    const vRatio = calculateVRatio(today.Trading_Volume, pastVolumes);
    const dailyVolumeTrend = prices.slice(Math.max(0, histLen - 10)).map(p => p.Trading_Volume);
    const isVolumeIncreasing = checkVolumeIncreasing(dailyVolumeTrend);

    // --- 2. 均線分析 (MA_constrict) ---
    const closePrices = prices.map(p => p.close);
    const recent20 = closePrices.slice(Math.max(0, closePrices.length - 20));
    const ma5 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 5)), 5);
    const ma10 = calculateSMA(recent20.slice(Math.max(0, recent20.length - 10)), 10);
    const ma20 = calculateSMA(recent20, 20);

    let maConstrictData = { isSqueezing: false, constrictValue: 1 };
    let isBreakout = false;

    if (ma5 && ma20) {
        maConstrictData = checkMaConstrict(ma5, ma20);
        // 突破確認：收盤價突破糾結區且漲幅 > 3%
        const changePercent = (today.close - today.open) / today.open;
        isBreakout = today.close > Math.max(ma5, ma20) && changePercent > 0.03;
    }

    // --- 3. 籌碼分析 (Inst_flow) ---
    const instFlowData = checkInstFlow(insts);

    // --- 4. 綜合評分 (PDF 公式) ---
    // V_ratio 評分：3.5倍為滿分
    const vScore = Math.min(vRatio / 3.5, 1.0);

    // MA 評分：糾結度越小越好，突破加分
    const maScore = maConstrictData.isSqueezing ? (isBreakout ? 1.0 : 0.5) : 0;

    // 籌碼評分：投信連買為滿分
    const instScore = instFlowData.consecutiveBuy ? 1.0 : 0;

    const totalScore = (vScore * 0.4) + (maScore * 0.3) + (instScore * 0.3);

    // --- 5. Kelly & Risk ---
    let riskWarning = '';
    if (ma5 && today.close < ma5) riskWarning = '股價跌破 5 日線，短線轉弱';
    else if (vRatio > 10) riskWarning = '成交量過熱 (>10倍)，防主力出貨';

    const kelly = calculateKelly(totalScore, today.close, ma5 || today.close * 0.95);

    // --- 6. Verdict & Tags ---
    let verdict = '觀望';
    if (totalScore > 0.7) verdict = '強力買進 - 三大信號共振';
    else if (isBreakout && instFlowData.consecutiveBuy) verdict = '積極佈局 - 技術+籌碼雙確認';
    else if (isBreakout) verdict = '技術突破 - 量能激增';
    else if (instFlowData.consecutiveBuy) verdict = '籌碼集中 - 投信佈局';

    const tags: AnalysisResult['tags'] = [];
    if (vRatio >= 3.5) tags.push('VOLUME_EXPLOSION');
    if (maConstrictData.isSqueezing) tags.push('MA_SQUEEZE');
    if (isBreakout) tags.push('BREAKOUT');
    if (instFlowData.consecutiveBuy) tags.push('INST_BUYING');
    if (isVolumeIncreasing) tags.push('VOLUME_INCREASING');

    // --- 7. Analysis Hints ---
    const techHint = isBreakout
        ? `股價突破均線糾結區（糾結度 ${(maConstrictData.constrictValue * 100).toFixed(1)}%），形成技術面突破`
        : maConstrictData.isSqueezing
            ? `均線高度糾結（${(maConstrictData.constrictValue * 100).toFixed(1)}%），等待突破訊號`
            : (ma5 && today.close > ma5) ? '股價在 5 日線上強勢整理' : '股價暫時受到均線壓制';

    const chipHint = instFlowData.consecutiveBuy
        ? `投信連續 ${instFlowData.buyDays} 日買超（累計 ${instFlowData.totalNetBuy} 張），籌碼穩定向大戶集中`
        : '三大法人進出尚無明顯方向';

    const fundHint = vRatio >= 3.5
        ? `成交量爆發 ${vRatio.toFixed(1)} 倍，大戶正在「進場吃貨」`
        : today.Trading_money > 100000000
            ? '今日成交金額龐大，市場主流資金高度關注'
            : '成交熱度處於平均水平';

    return {
        stock_id: stockId,
        stock_name: today.stock_name,
        close: today.close,
        change_percent: (prices.length > 1) ? (today.close - prices[prices.length - 2].close) / prices[prices.length - 2].close : 0,
        score: parseFloat(totalScore.toFixed(2)),
        v_ratio: parseFloat(vRatio.toFixed(2)),
        is_ma_aligned: maConstrictData.isSqueezing,
        is_ma_breakout: isBreakout,
        consecutive_buy: instFlowData.buyDays,
        poc: calculatePOC(prices, 20),
        verdict,
        tags,
        dailyVolumeTrend,
        kellyResult: kelly,
        riskWarning,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat((vScore * 40).toFixed(1)),
            maScore: parseFloat((maScore * 30).toFixed(1)),
            chipScore: parseFloat((instScore * 30).toFixed(1)),
            total: parseFloat((totalScore * 100).toFixed(1))
        },
        analysisHints: {
            technical: techHint,
            chips: chipHint,
            fundamental: fundHint
        },
        // 新增專業數據
        maConstrictValue: maConstrictData.constrictValue,
        volumeIncreasing: isVolumeIncreasing
    };
};
