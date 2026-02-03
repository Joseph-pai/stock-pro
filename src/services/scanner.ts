import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock, calculateVRatio, checkMaConstrict, checkInstFlow, checkVolumeIncreasing } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays } from 'date-fns';
import { calculateSMA } from './indicators';

export const ScannerService = {
    /**
     * Stage 1: Discovery (三大信號共振 - 嚴格標準)
     * 
     * 篩選邏輯：
     * 1. 量能激增：V_ratio >= 3.5x
     * 2. 均線糾結：ABS(MA5 - MA20) / MA20 < 0.02
     * 3. 突破確認：收盤價突破糾結區且漲幅 > 3%
     * 
     * 寧缺毋濫：返回所有符合條件的股票（可能 0-15 支）
     */
    scanMarket: async (): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log('[Scanner] Stage 1: Discovery - 三大信號共振篩選（嚴格標準）...');

        // 1. 獲取今日市場快照
        const snapshot = await ExchangeClient.getAllMarketQuotes();
        const t1 = Date.now();

        if (snapshot.length === 0) {
            throw new Error('Market data not found. Please try again later.');
        }

        console.log(`[Scanner] Snapshot fetched: ${snapshot.length} stocks in ${t1 - t0}ms`);

        // 2. 對每支股票進行深度分析（獲取完整歷史數據）
        const candidates: AnalysisResult[] = [];
        let processedCount = 0;
        let errorCount = 0;

        // 批次處理，每次處理 50 支股票以避免過載
        const batchSize = 50;
        for (let i = 0; i < snapshot.length; i += batchSize) {
            const batch = snapshot.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(async (stock) => {
                    try {
                        // 獲取該股票的完整歷史數據（30 天）
                        const history = await ExchangeClient.getStockHistory(stock.stock_id);

                        if (history.length < 20) {
                            return null; // 數據不足，跳過
                        }

                        // 計算真正的 MA5 和 MA20
                        const closes = history.map(s => s.close);
                        const ma5 = calculateSMA(closes.slice(-5), 5);
                        const ma20 = calculateSMA(closes.slice(-20), 20);

                        if (!ma5 || !ma20) return null;

                        // 計算量能倍數（用完整 20 天數據）
                        const volumes = history.map(s => s.Trading_Volume);
                        const todayVolume = volumes[volumes.length - 1];
                        const past20Volumes = volumes.slice(-21, -1); // 排除今天
                        const vRatio = calculateVRatio(todayVolume, past20Volumes);

                        // 檢查均線糾結
                        const maData = checkMaConstrict(ma5, ma20);

                        // 檢查突破
                        const today = history[history.length - 1];
                        const changePercent = (today.close - today.open) / today.open;
                        const isBreakout = today.close > Math.max(ma5, ma20) && changePercent > 0.03;

                        // 三大信號共振（嚴格標準）
                        if (vRatio >= 3.5 && maData.isSqueezing && isBreakout) {
                            console.log(`[Scanner] ✓ Found: ${stock.stock_id} ${stock.stock_name} - V:${vRatio.toFixed(1)}x, MA:${(maData.constrictValue * 100).toFixed(1)}%, Break:${(changePercent * 100).toFixed(1)}%`);

                            const result: AnalysisResult = {
                                stock_id: stock.stock_id,
                                stock_name: stock.stock_name,
                                close: today.close,
                                change_percent: (today.close - history[history.length - 2].close) / history[history.length - 2].close,
                                score: 0,
                                v_ratio: parseFloat(vRatio.toFixed(2)),
                                is_ma_aligned: maData.isSqueezing,
                                is_ma_breakout: isBreakout,
                                consecutive_buy: 0,
                                poc: today.close,
                                verdict: '三大信號共振 - 爆發前兆',
                                tags: ['DISCOVERY', 'VOLUME_EXPLOSION', 'MA_SQUEEZE', 'BREAKOUT'],
                                dailyVolumeTrend: volumes.slice(-10),
                                maConstrictValue: maData.constrictValue,
                                volumeIncreasing: checkVolumeIncreasing(volumes)
                            };
                            return result;
                        }

                        return null;
                    } catch (error) {
                        return null;
                    }
                })
            );

            // 收集成功的結果
            batchResults.forEach(result => {
                processedCount++;
                if (result.status === 'fulfilled' && result.value) {
                    candidates.push(result.value);
                } else if (result.status === 'rejected') {
                    errorCount++;
                }
            });

            console.log(`[Scanner] Progress: ${processedCount}/${snapshot.length} (Found: ${candidates.length})`);
        }

        const t2 = Date.now();

        console.log(`[Scanner] Stage 1 完成：發現 ${candidates.length} 支符合三大信號共振的股票`);
        console.log(`[Scanner] 處理: ${processedCount} 支, 錯誤: ${errorCount} 支`);

        // 按量能倍數排序
        const sorted = candidates.sort((a, b) => b.v_ratio - a.v_ratio);

        return {
            results: sorted,
            timing: {
                snapshot: t1 - t0,
                analysis: t2 - t1,
                total: t2 - t0,
                processed: processedCount,
                errors: errorCount
            }
        };
    },

    /**
     * Stage 2: Filtering (投信連買 + 法人同步 + 量能遞增)
     * 
     * 深度篩選邏輯：
     * 1. 投信連續 3 日買超
     * 2. 成交量連續 3 天遞增
     * 3. 股價站上 MA5 且不破 MA20
     * 
     * 返回：前 30 名強勢股
     */
    filterStocks: async (stockIds: string[]): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log(`[Scanner] Stage 2: Filtering - 深度篩選 ${stockIds.length} 支股票...`);

        const filtered: AnalysisResult[] = [];

        for (const stockId of stockIds) {
            try {
                const result = await ScannerService.analyzeStock(stockId);
                if (!result) continue;

                // Stage 2 篩選條件
                const hasInstBuying = result.consecutive_buy >= 3;
                const hasVolumeIncreasing = result.volumeIncreasing === true;
                const isAboveMA = result.is_ma_breakout;

                // 綜合評分 > 0.4 或滿足任意兩個條件
                const passCount = [hasInstBuying, hasVolumeIncreasing, isAboveMA].filter(Boolean).length;

                if (result.score > 0.4 || passCount >= 2) {
                    filtered.push(result);
                }
            } catch (error) {
                console.warn(`[Scanner] Error filtering ${stockId}:`, error);
            }
        }

        // 按綜合評分排序，取前 30 名
        const top30 = filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, 30);

        const t1 = Date.now();
        console.log(`[Scanner] Stage 2 完成：篩選出 ${top30.length} 支強勢股`);

        return {
            results: top30,
            timing: { total: t1 - t0 }
        };
    },

    /**
     * Stage 3: Individual Analysis (個股完整分析)
     * 返回單一股票的完整分析數據
     */
    analyzeStock: async (stockId: string): Promise<AnalysisResult | null> => {
        try {
            console.log(`[Analyze] Fetching data for ${stockId}...`);

            // 1. 嘗試從 FinMind 獲取數據
            let prices: StockData[] = [];
            let insts: any[] = [];

            try {
                const endDate = format(new Date(), 'yyyy-MM-dd');
                const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');

                const [priceData, instData] = await Promise.all([
                    FinMindClient.getDailyStats({
                        stockId,
                        startDate,
                        endDate
                    }),
                    FinMindClient.getInstitutional({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate
                    })
                ]);
                prices = priceData;
                insts = instData;
            } catch (finmindError) {
                console.warn(`[Analyze] FinMind failed for ${stockId}, using ExchangeClient...`);
                prices = await ExchangeClient.getStockHistory(stockId);
            }

            if (prices.length < 3) {
                console.warn(`[Analyze] Insufficient data for ${stockId} (${prices.length} days found)`);
                return null;
            }

            const result = evaluateStock(stockId, { prices, insts });
            if (!result) return null;

            return {
                ...result,
                history: prices,
                tags: insts.length === 0 ? [...result.tags, 'LIMITED_SCAN'] : result.tags
            };
        } catch (error: any) {
            console.error(`Analysis failed for ${stockId}:`, error.message);
            throw error;
        }
    }
};
