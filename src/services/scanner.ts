import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';

export const ScannerService = {
    /**
     * Stage 1: Enhanced Market Scan
     * Uses Parallel OpenAPI strategy to stay within Netlify 10s limit.
     */
    scanMarket: async (): Promise<AnalysisResult[]> => {
        console.log('Starting Parallel Optimized Market Scan...');

        // 1. Fetch Latest Market Snapshot (Instant with OpenAPI)
        let latestData: StockData[] = [];
        try {
            latestData = await ExchangeClient.getAllMarketQuotes();
        } catch (e: any) {
            console.error(`Initial snapshot failed: ${e.message}`);
            throw new Error(`Market data unavailable. Please try again later.`);
        }

        if (!latestData || latestData.length < 50) {
            throw new Error(`Market snapshot too small (${latestData?.length}). It might be a holiday.`);
        }

        // 2. Initial Filter: Top 100 by Volume
        const candidates = latestData
            .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 100);

        if (candidates.length === 0) return [];

        const candidateIds = new Set(candidates.map(c => c.stock_id));
        const historyMap = new Map<string, StockData[]>();
        candidates.forEach(c => historyMap.set(c.stock_id, [c]));

        // 3. Build Parallel History (Last 10 calendar days)
        const dayZero = candidates[0].date;
        const pastDates: string[] = [];
        let d = new Date(dayZero);

        // Calculate valid trading days back (approx 7-8 days)
        for (let i = 1; i <= 12; i++) {
            const target = subDays(d, i);
            if (!isWeekend(target)) {
                pastDates.push(format(target, 'yyyyMMdd'));
            }
        }

        console.log(`Parallel Fetching history for: ${pastDates.join(', ')}`);

        // Limited Parallelism Helper
        const fetchDaily = async (dateStr: string) => {
            try {
                const daily = await ExchangeClient.getAllMarketQuotes(dateStr);
                daily.forEach(stock => {
                    if (candidateIds.has(stock.stock_id)) {
                        const list = historyMap.get(stock.stock_id);
                        if (list) list.push(stock);
                    }
                });
            } catch (e) {
                console.warn(`Skip history for ${dateStr} due to error`);
            }
        };

        // Fetch in 2 chunks to stay within rate limits and time
        const chunks = [pastDates.slice(0, 4), pastDates.slice(4, 8)];
        for (const chunk of chunks) {
            await Promise.all(chunk.map(date => fetchDaily(date)));
            // No delay between chunks if using OpenAPI as it handles load better
        }

        // 4. Scoring & Filtering
        let scoredCandidates: AnalysisResult[] = [];
        candidates.forEach(c => {
            const hist = historyMap.get(c.stock_id) || [];
            hist.sort((a, b) => a.date.localeCompare(b.date));

            // Proceed if we have at least partial history (at least 3 days for indicators)
            if (hist.length >= 3) {
                const result = evaluateStock(c.stock_id, { prices: hist, insts: [] });
                if (result && result.score >= 0.25) {
                    scoredCandidates.push(result);
                }
            }
        });

        // 5. Final Top 30 Ranking
        scoredCandidates.sort((a, b) => b.score - a.score);
        const top30 = scoredCandidates.slice(0, 30);

        console.log(`Final Selection: ${top30.length} stocks.`);
        return top30;
    },

    /**
     * Stage 2: Deep Analysis (On-Demand)
     */
    analyzeStock: async (stockId: string): Promise<AnalysisResult | null> => {
        console.log(`Analyzing stock ${stockId}...`);

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
                if (finMindError.message === 'FINMIND_TIER_RESTRICTION' || (finMindError as any).tier === 'register') {
                    console.warn(`[Fallback] FinMind Restricted for ${stockId}, using Exchange API.`);
                    prices = await ExchangeClient.getStockHistory(stockId);
                } else {
                    throw finMindError;
                }
            }

            if (prices.length < 5) {
                console.warn(`Insufficient data for ${stockId}`);
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
