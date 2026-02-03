/**
 * Core Technical Analysis Functions
 * Optimized for growth/breakout stock discovery
 */

/**
 * Calculate Volume Ratio (量能倍數)
 * Today's Volume / Average Volume of past 20 days
 */
export function calculateVRatio(todayVolume: number, past20Volumes: number[]): number {
    if (past20Volumes.length === 0) return 0;
    const avg = past20Volumes.reduce((a, b) => a + b, 0) / past20Volumes.length;
    return avg === 0 ? 0 : todayVolume / avg;
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
 * Evaluate Stock Base Logic
 */
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
    const vRatio = calculateVRatio(volumes[volumes.length - 1], volumes.slice(-21, -1));

    // 2. MA Constrict
    const maData = checkMaConstrict(ma5, ma20, maRef);

    // 3. Breakout
    const today = history[history.length - 1];
    const prevClose = history[history.length - 2].close;
    const changePercent = (today.close - prevClose) / prevClose;
    const dailyChange = (today.close - today.open) / today.open;

    const isAboveMa = today.close > Math.max(ma5, ma20);
    const isBreakout = isAboveMa && dailyChange >= breakRef;

    return {
        vRatio,
        maData,
        changePercent,
        dailyChange,
        isBreakout,
        isQualified: vRatio >= vRef && maData.isSqueezing && isBreakout
    };
}
