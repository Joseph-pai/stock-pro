
/**
 * Calculate Simple Moving Average (SMA)
 */
export const calculateSMA = (prices: number[], period: number): number | null => {
    if (prices.length < period) return null;
    const slice = prices.slice(0, period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
};

/**
 * Check if Moving Averages are aligned (squeezed) and price is breaking out.
 * Condition:
 * 1. (Max(MA) - Min(MA)) / Min(MA) < threshold (default 0.03) -> Alignment
 * 2. Close Price > Max(MA) -> Breakout
 */
export const checkMaAlignment = (
    close: number,
    ma5: number,
    ma10: number,
    ma20: number,
    threshold: number = 0.03
) => {
    const mas = [ma5, ma10, ma20];
    const maxMa = Math.max(...mas);
    const minMa = Math.min(...mas);

    const spread = (maxMa - minMa) / minMa;
    const isAligned = spread < threshold;
    const isBreakout = close > maxMa; // Price is above all MAs

    return { isAligned, isBreakout, spread };
};

/**
 * Calculate Volume Ratio
 * Volume / Average(Volume, period)
 */
export const calculateVolumeRatio = (currentVolume: number, historicalVolumes: number[]) => {
    if (historicalVolumes.length === 0) return 0;
    const avg = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;
    if (avg === 0) return 0;
    return currentVolume / avg;
};
