import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock, calculateVRatio, checkMaConstrict, checkInstFlow, checkVolumeIncreasing } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';
import { calculateSMA } from './indicators';

export const ScannerService = {
    /**
     * Stage 1: Discovery (量能激增 + 均線糾結 + 突破確認)
     * 
     * 篩選邏輯：
     * 1. 量能激增：V_ratio >= 3.5x
     * 2. 均線糾結：ABS(MA5 - MA20) / MA20 < 0.02
     * 3. 突破確認：收盤價突破糾結區且漲幅 > 3%
     * 
     * 返回：前 50 名潛力股
     */
    scanMarket: async (): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log('[Scanner] Stage 1: Discovery - 量能激增+均線糾結篩選...');

        // 1. 獲取市場快照
        const snapshot = await ExchangeClient.getAllMarketQuotes();
        const t1 = Date.now();

        if (snapshot.length === 0) {
            throw new Error('Market data not found. Please try again later.');
        }

        console.log(`[Scanner] Snapshot fetched: ${snapshot.length} stocks in ${t1 - t0}ms`);

        // 2. 獲取歷史數據用於計算均線與量能
        const candidates: AnalysisResult[] = [];

        // 獲取最近 5 個交易日的日期
        const tradingDays = [];
        let currentDate = new Date();
        while (tradingDays.length < 5) {
            if (!isWeekend(currentDate)) {
                tradingDays.push(format(currentDate, 'yyyyMMdd'));
            }
            currentDate = subDays(currentDate, 1);
        }

        // 批次獲取歷史數據（用於計算均線）
        const historicalData = await Promise.all(
            tradingDays.map(date => ExchangeClient.getAllMarketQuotes(date))
        );

        const t2 = Date.now();
        console.log(`[Scanner] Historical data fetched in ${t2 - t1}ms`);

        // 3. 合併數據並計算指標
        for (const stock of snapshot) {
            try {
                // 構建該股票的歷史價格序列
                const stockHistory = [
                    ...historicalData.map(dayData =>
                        dayData.find(s => s.stock_id === stock.stock_id)
                    ).filter(Boolean).reverse(),
                    stock
                ] as StockData[];

                if (stockHistory.length < 3) continue;

                // 計算量能倍數
                const volumes = stockHistory.map(s => s.Trading_Volume);
                const past20Volumes = volumes.slice(0, -1); // 排除今天
                const vRatio = calculateVRatio(stock.Trading_Volume, past20Volumes);

                // 計算均線
                const closes = stockHistory.map(s => s.close);
                const ma5 = calculateSMA(closes.slice(-5), 5);
                const ma20 = calculateSMA(closes, Math.min(20, closes.length));

                if (!ma5 || !ma20) continue;

                // 檢查均線糾結
                const maData = checkMaConstrict(ma5, ma20);

                // 檢查突破
                const changePercent = (stock.close - stock.open) / stock.open;
                const isBreakout = stock.close > Math.max(ma5, ma20) && changePercent > 0.03;

                // Stage 1 篩選條件
                if (vRatio >= 3.5 && maData.isSqueezing && isBreakout) {
                    candidates.push({
                        stock_id: stock.stock_id,
                        stock_name: stock.stock_name,
                        close: stock.close,
                        change_percent: stock.spread / (stock.close - stock.spread),
                        score: 0, // Stage 1 不計算完整評分
                        v_ratio: parseFloat(vRatio.toFixed(2)),
                        is_ma_aligned: maData.isSqueezing,
                        is_ma_breakout: isBreakout,
                        consecutive_buy: 0,
                        poc: stock.close,
                        verdict: '初步發現 - 量能激增+均線糾結',
                        tags: ['DISCOVERY', 'VOLUME_EXPLOSION', 'MA_SQUEEZE', 'BREAKOUT'],
                        dailyVolumeTrend: volumes.slice(-10),
                        maConstrictValue: maData.constrictValue,
                        volumeIncreasing: checkVolumeIncreasing(volumes)
                    });
                }
            } catch (error) {
                console.warn(`[Scanner] Error processing ${stock.stock_id}:`, error);
            }
        }

        // 按量能倍數排序，取前 50 名
        const top50 = candidates
            .sort((a, b) => b.v_ratio - a.v_ratio)
            .slice(0, 50);

        const t3 = Date.now();

        console.log(`[Scanner] Stage 1 完成：發現 ${top50.length} 支潛力股`);

        return {
            results: top50,
            timing: {
                snapshot: t1 - t0,
                historical: t2 - t1,
                analysis: t3 - t2,
                total: t3 - t0
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
