import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';

export const ScannerService = {
    /**
     * Stage 1: Ultra-Optimized Market Scan
     * Targeted to finish within Netlify's 10s limit.
     */
    scanMarket: async (): Promise<{ results: AnalysisResult[], timing: any }> => {
        const start = Date.now();
        console.log('Starting Ultra-Optimized Parallel Scan...');

        // 1. Fetch Latest Market Snapshot (OpenAPI)
        const snapStart = Date.now();
        let latestData: StockData[] = [];
        try {
            latestData = await ExchangeClient.getAllMarketQuotes();
        } catch (e: any) {
            console.error(`Snapshot failed: ${e.message}`);
            throw new Error(`Market data offline. Please try later.`);
        }
        const snapEnd = Date.now();

        if (!latestData || latestData.length < 50) {
            throw new Error(`Market snapshot empty (${latestData?.length}). Holiday?`);
        }

        // 2. Initial Filter: Top 60 by Volume (Reduced from 100 for speed)
        const candidates = latestData
            .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 60);

        if (candidates.length === 0) return { results: [], timing: { total: Date.now() - start } };

        const candidateIds = new Set(candidates.map(c => c.stock_id));
        const historyMap = new Map<string, StockData[]>();
        candidates.forEach(c => historyMap.set(c.stock_id, [c]));

        // 3. Build Parallel History (Max 5 trading days lookback)
        const histStart = Date.now();
        const dayZero = candidates[0].date;
        const pastDates: string[] = [];
        let d = new Date(dayZero);

        // Find exactly 5 past trading days
        let found = 0;
        for (let i = 1; i <= 10 && found < 5; i++) {
            const target = subDays(d, i);
            if (!isWeekend(target)) {
                pastDates.push(format(target, 'yyyyMMdd'));
                found++;
            }
        }

        console.log(`Parallel Fetching history for 5 days: ${pastDates.join(', ')}`);

        // Fetch all history days IN PARALLEL with candidate filter
        const fetchDaily = async (dateStr: string) => {
            try {
                // Pass candidateIds to only parse what we need from 2000+ stocks
                const daily = await ExchangeClient.getAllMarketQuotes(dateStr, candidateIds);
                daily.forEach(stock => {
                    if (candidateIds.has(stock.stock_id)) {
                        const list = historyMap.get(stock.stock_id);
                        if (list) list.push(stock);
                    }
                });
            } catch (e) {
                console.warn(`Parallel skip ${dateStr}`);
            }
        };

        // All 5 days at once to maximize speed
        await Promise.all(pastDates.map(date => fetchDaily(date)));
        const histEnd = Date.now();

        // 4. Scoring & Filtering
        const evalStart = Date.now();
        let scoredCandidates: AnalysisResult[] = [];
        candidates.forEach(c => {
            const hist = historyMap.get(c.stock_id) || [];
            hist.sort((a, b) => a.date.localeCompare(b.date));

            // Run Engine (Needs at least 3 days for MA/Volume trends)
            if (hist.length >= 3) {
                const result = evaluateStock(c.stock_id, { prices: hist, insts: [] });
                if (result && result.score > 0.2) {
                    scoredCandidates.push(result);
                }
            }
        });

        // 5. Final Top 30 Ranking
        scoredCandidates.sort((a, b) => b.score - a.score);
        const top30 = scoredCandidates.slice(0, 30);
        const evalEnd = Date.now();

        console.log(`Final Selection: ${top30.length} stocks. Total Time: ${Date.now() - start}ms`);

        return {
            results: top30,
            timing: {
                total: Date.now() - start,
                snapshot: snapEnd - snapStart,
                history: histEnd - histStart,
                evaluation: evalEnd - evalStart,
                stockCount: latestData.length,
                candidateCount: candidates.length
            }
        };
    },

    /**
     * Stage 2: Deep Analysis (On-Demand)
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
            } catch (finMindError: any) {
                console.warn(`[Fallback] FinMind Tier Limit for ${stockId}`);
                prices = await ExchangeClient.getStockHistory(stockId);
            }

            if (prices.length < 5) return null;

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
