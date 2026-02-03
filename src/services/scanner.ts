import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';

export const ScannerService = {
    /**
     * Stage 1: Fast Discovery
     * Fetches top 50 potential stocks based on volume and simple price action.
     * Guaranteed fast (< 3s) for initial list display.
     */
    scanDiscovery: async (): Promise<AnalysisResult[]> => {
        console.log('Stage 1: High-Speed Discovery...');

        let latestData: StockData[] = [];
        try {
            latestData = await ExchangeClient.getAllMarketQuotes();
        } catch (e: any) {
            throw new Error(`Discovery failed: ${e.message}`);
        }

        if (!latestData || latestData.length < 50) {
            throw new Error(`Insufficient data (${latestData?.length}). Holiday?`);
        }

        // Fast Filter: Volume > 2000, Positive Day, Top 50
        const discoveries = latestData
            .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 50);

        return discoveries.map(s => ({
            stock_id: s.stock_id,
            stock_name: s.stock_name,
            close: s.close,
            change_percent: 0, // Simplified for Stage 1
            score: 0,
            v_ratio: 0,
            is_ma_aligned: false,
            is_ma_breakout: false,
            consecutive_buy: 0,
            poc: 0,
            verdict: 'Pending Depth Analysis',
            tags: [],
        }));
    },

    /**
     * Stage 2: Deep Filtering (Narrow 50 -> 30)
     * Fetches minimal history (5 days) to calculate technical scores.
     */
    analyzeCandidates: async (stockIds: string[]): Promise<AnalysisResult[]> => {
        console.log(`Stage 2: Analyzing ${stockIds.length} candidates...`);
        const idSet = new Set(stockIds);

        // 1. Get Today
        const todayMarket = await ExchangeClient.getAllMarketQuotes(undefined, idSet);

        // 2. Get Past 5 Trading Days (Lookback 10 to find 5)
        const pastDates: string[] = [];
        let d = new Date();
        for (let i = 1; i <= 10 && pastDates.length < 5; i++) {
            const target = subDays(d, i);
            if (!isWeekend(target)) pastDates.push(format(target, 'yyyyMMdd'));
        }

        const historyMap = new Map<string, StockData[]>();
        todayMarket.forEach(s => historyMap.set(s.stock_id, [s]));

        // Parallel Fetch History
        await Promise.all(pastDates.map(async (date) => {
            const daily = await ExchangeClient.getAllMarketQuotes(date, idSet);
            daily.forEach(s => {
                const list = historyMap.get(s.stock_id);
                if (list) list.push(s);
            });
        }));

        const results: AnalysisResult[] = [];
        stockIds.forEach(id => {
            const hist = historyMap.get(id) || [];
            if (hist.length >= 3) {
                const evaluated = evaluateStock(id, { prices: hist.sort((a, b) => a.date.localeCompare(b.date)), insts: [] });
                if (evaluated) results.push(evaluated);
            }
        });

        // Return Top 30 by score
        return results.sort((a, b) => b.score - a.score).slice(0, 30);
    },

    /**
     * Stage 3: Recommended Analysis (Expert Verdict & Kelly)
     * Performs complex calculation for a single selected stock or small batch.
     */
    getExpertAnalysis: async (stockId: string): Promise<AnalysisResult | null> => {
        console.log(`Stage 3: Expert Analysis for ${stockId}...`);

        // Use existing analyzeStock logic but ensure it's fully populated
        return await ScannerService.analyzeStock(stockId);
    },

    /**
     * Legacy Fallback / Single Detail Analysis
     */
    analyzeStock: async (stockId: string): Promise<AnalysisResult | null> => {
        const endDate = format(new Date(), 'yyyy-MM-dd');
        const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');

        let prices: StockData[] = [];
        let insts: any[] = [];

        try {
            try {
                const [p, i] = await Promise.all([
                    FinMindClient.getDailyStats({ stockId, startDate, endDate }),
                    FinMindClient.getInstitutional({ stockId, startDate, endDate })
                ]);
                prices = p;
                insts = i;
            } catch {
                console.warn(`[Fallback] Use Exchange API for ${stockId}`);
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
