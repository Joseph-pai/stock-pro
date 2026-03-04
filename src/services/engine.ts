/**
 * Core Technical Analysis Functions
 * Optimized for growth/breakout stock discovery
 */

/**
 * Calculate Volume Ratio (量能倍數)
 * Optimized: Current Volume / Average of previous 45 days (baseline)
 */
export function calculateVRatio(volumes: number[]): number {
    if (volumes.length < 6) return 0;

    // 觀測：當日量
    const observationAvg = volumes[volumes.length - 1];

    // 基線：前 45 天均量（排除當日），更符合中長期量能對比頻率
    const availableBaseline = volumes.slice(0, -1); // 排除當日
    const baselineVolumes = availableBaseline.slice(-45); // 取 45 天
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

    // 2.5 Bullish Check (MA5 > MA20)
    const isBullish = ma5 > ma20;

    // 3. Breakout
    const today = history[history.length - 1];
    const prevClose = history[history.length - 2].close;
    const changePercent = (today.close - prevClose) / prevClose;

    const isAboveMa = today.close > Math.max(ma5, ma20);
    const isBreakout = isAboveMa && changePercent >= breakRef;

    // Compute scored components
    const targetV = vRef;
    const volumeNorm = targetV > 0 ? Math.min(vRatio / targetV, 1) : Math.min(vRatio / 5, 1);

    // MA 平滑衰減模型：閾值內滿分，超出後以指數衰減保護精確度
    const squeezeTarget = maRef;
    let maNorm = 0;
    if (maData.constrictValue <= squeezeTarget) {
        maNorm = 1;
    } else {
        // 使用更平滑的衰減曲線：e^(-((x - target) / 0.05)^2)
        const diff = maData.constrictValue - squeezeTarget;
        maNorm = Math.max(0, Math.exp(-Math.pow(diff / 0.05, 2)));
    }

    // 套用排列權重 (優化選股精度)
    if (isBullish) {
        maNorm = Math.min(1, maNorm * (CONFIG.SYSTEM.BULLISH_REWARD || 1.2));
    } else {
        maNorm = maNorm * (CONFIG.SYSTEM.BEARISH_PENALTY || 0.5);
    }

    const instNorm = 0; // to be filled by scanner

    const volumeScore = volumeNorm * 40;
    const maScore = maNorm * 30;
    const instScore = instNorm * 30;

    const totalPoints = volumeScore + maScore + instScore;
    const score = Math.min(1, Math.max(0, totalPoints / 100));

    return {
        vRatio,
        maData,
        is_bullish: isBullish,
        changePercent,
        dailyChange: changePercent,
        isBreakout,
        isQualified: vRatio >= vRef && maData.isSqueezing && isBreakout && isBullish,
        score,
        comprehensiveScoreDetails: {
            volumeScore: parseFloat(volumeScore.toFixed(2)),
            maScore: parseFloat(maScore.toFixed(2)),
            chipScore: parseFloat(instScore.toFixed(2)),
            total: parseFloat(totalPoints.toFixed(2)),
            note: 'partial_engine_score' as const
        }
    };
}
