/**
 * Core Technical Analysis Functions
 * Optimized for growth/breakout stock discovery
 */

/**
 * Calculate Volume Ratio (量能倍數)
 * Optimized: Average of recent 3 days / Average of previous 45 days (baseline)
 */
export function calculateVRatio(volumes: number[]): number {
    if (volumes.length < 6) return 0;

    // 觀測：當日量
    const observationAvg = volumes[volumes.length - 1];

    // 基線：前 20 天均量（排除當日），更接近理論中「平日量」的概念
    // 如果數據不足 20 天，使用所有可用的歷史量（至少 5 天）
    const availableBaseline = volumes.slice(0, -1); // 排除當日
    const baselineVolumes = availableBaseline.slice(-20); // 最多取 20 天
    if (baselineVolumes.length < 5) return 0;
    const baselineAvg = baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length;

    return baselineAvg === 0 ? 0 : observationAvg / baselineAvg;
}

/**
 * Check Moving Average Constriction (均線糾結度)
 * Percentage gap between MA5 and MA20
 */
export function checkMaConstrict(ma5: number, ma20: number, threshold: number = 0.02) {
    if (!ma5 || !ma20) return { isSqueezing: false, constrictValue: 1 };

    // Calculate relative gap
    const gap = Math.abs(ma5 - ma20) / ma20;

    return {
        isSqueezing: gap <= threshold,
        constrictValue: gap
    };
}

/**
 * Check for Increasing Volume Trend (量能遞增)
 */
export function checkVolumeIncreasing(volumes: number[]): boolean {
    if (volumes.length < 3) return false;
    const last3 = volumes.slice(-3);
    return last3[2] > last3[1] && last3[1] > last3[0];
}

/**
 * 判斷跳空缺口（Gap Up）
 * 條件：今日最低 > 昨日最高
 */
export function checkGapUp(
    todayLow: number,
    prevHigh: number
): { isGapUp: boolean; gapPercent: number } {
    const gap = todayLow - prevHigh;
    const gapPercent = prevHigh > 0 ? gap / prevHigh : 0;
    return {
        isGapUp: gap > 0,
        gapPercent: Math.max(0, gapPercent)
    };
}

/**
 * 判斷融資融券軋空動能
 * 條件：近 5 日融資餘額穩定/溫和增加 && 股價同步上升 → 軋空信號
 */
export function checkMarginSqueezeSignal(
    marginData: { date: string; MarginPurchaseTodayBalance: number; ShortSaleTodayBalance: number }[],
    priceData: { date: string; close: number }[]
): { hasSignal: boolean; marginTrend: 'increasing' | 'stable' | 'decreasing'; score: number } {
    if (marginData.length < 5) return { hasSignal: false, marginTrend: 'stable', score: 0 };

    const recent5 = marginData.slice(-5);
    const marginChanges: number[] = [];
    for (let i = 1; i < recent5.length; i++) {
        marginChanges.push(recent5[i].MarginPurchaseTodayBalance - recent5[i - 1].MarginPurchaseTodayBalance);
    }

    const avgChange = marginChanges.reduce((a, b) => a + b, 0) / marginChanges.length;
    const allNonNeg = marginChanges.every(c => c >= 0);
    const marginTrend: 'increasing' | 'stable' | 'decreasing' = avgChange > 0 ? 'increasing' : (avgChange === 0 ? 'stable' : 'decreasing');

    // 股價同步判斷
    const recentPrices = priceData.slice(-5);
    const priceUp = recentPrices.length >= 2 &&
        recentPrices[recentPrices.length - 1].close > recentPrices[0].close;

    // 軋空信號：融資溫和增加 + 股價上升
    const hasSignal = allNonNeg && avgChange > 0 && priceUp;
    const score = hasSignal ? Math.min(1, avgChange / 500) : 0;

    return { hasSignal, marginTrend, score };
}

/**
 * Evaluate Stock Base Logic
 */
import { CONFIG } from '@/lib/config';

export function evaluateStock(history: any[], settings?: { volumeRatio: number, maConstrict: number, breakoutPercent: number }) {
    if (history.length < 20) return null;

    const vRef = settings?.volumeRatio || 3.5;
    const maRef = (settings?.maConstrict || 2.0) / 100;
    const breakRef = (settings?.breakoutPercent || 3.0) / 100;

    const closes = history.map(h => h.close);
    const volumes = history.map(h => h.Trading_Volume);

    // Calc MAs
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    // 1. Volume Ratio
    const vRatio = calculateVRatio(volumes);

    // 2. MA Constrict
    const maData = checkMaConstrict(ma5, ma20, maRef);

    // 3. Breakout
    const today = history[history.length - 1];
    const prevClose = history[history.length - 2].close;
    const changePercent = (today.close - prevClose) / prevClose;
    // const dailyChange = (today.close - today.open) / today.open; // Deprecated: Confusing for users

    const isAboveMa = today.close > Math.max(ma5, ma20);
    // FIXED: Use changePercent (standard daily change) for breakout, matching UI
    const isBreakout = isAboveMa && changePercent >= breakRef;

    // Compute scored components - use configurable thresholds
    const targetV = settings?.volumeRatio || CONFIG.SYSTEM.V_RATIO_THRESHOLD || 3.5;
    const volumeNorm = targetV > 0 ? Math.min(vRatio / targetV, 1) : Math.min(vRatio / 5, 1);
    // MA constrict normalization: if within threshold => full score, else decay gradually
    const squeezeTarget = maRef || CONFIG.SYSTEM.MA_ALIGNMENT_THRESHOLD || 0.02;
    let maNorm = 0;
    if (maData.constrictValue <= squeezeTarget) maNorm = 1;
    else {
        // decay over additional 10% gap (wider tolerance for partial scoring)
        maNorm = Math.max(0, 1 - ((maData.constrictValue - squeezeTarget) / 0.10));
    }
    // Institutional flow placeholder: unknown here, upstream should supply consecutive buy days.
    const instNorm = 0; // to be filled by scanner/analyzer when institutional data available

    const volumeScore = volumeNorm * 40; // weight 40
    const maScore = maNorm * 30; // weight 30
    const instScore = instNorm * 30; // weight 30 (placeholder)

    const totalPoints = volumeScore + maScore + instScore; // 0 - 100
    const score = Math.min(1, Math.max(0, totalPoints / 100)); // 0 - 1 (for thresholds used elsewhere)

    return {
        vRatio,
        maData,
        changePercent,
        dailyChange: changePercent, // Unify with changePercent
        isBreakout,
        isQualified: vRatio >= vRef && maData.isSqueezing && isBreakout,
        score,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat(volumeScore.toFixed(2)),
            maScore: parseFloat(maScore.toFixed(2)),
            chipScore: parseFloat(instScore.toFixed(2)),
            total: parseFloat(totalPoints.toFixed(2))
        }
    };
}
