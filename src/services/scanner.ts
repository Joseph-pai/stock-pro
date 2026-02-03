import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';

export const ScannerService = {
    /**
     * Stage 1: Enhanced Market Scan
     * 1. Get Today's Market Snapshot.
     * 2. Select Top 100 by Volume.
     * 3. Fetch past 10 days market snapshots to build mini-history.
     * 4. Run AnalysisEngine to filter and score.
     * 5. Return Top 30.
     */
    scanMarket: async (): Promise<AnalysisResult[]> => {
        console.log('Starting Enhanced Market Scan...');

        // 1. Fetch Latest Market Data (Day 0)
        let latestData: StockData[] = [];
        let effectiveDate = new Date();
        let attempts = 0;
        let found = false;
        let lastError = '';

        // Try up to 15 days back to find the latest trading day (handles long holidays like Lunar New Year)
        while (!found && attempts < 15) {
            if (!isWeekend(effectiveDate)) {
                const dateStr = format(effectiveDate, 'yyyyMMdd');
                try {
                    console.log(`[Attempt ${attempts + 1}] Fetching market data for ${dateStr}...`);
                    latestData = await ExchangeClient.getAllMarketQuotes(dateStr);

                    if (latestData && latestData.length > 100) {
                        found = true;
                        console.log(`Successfully fetched data for ${dateStr} (${latestData.length} records)`);
                        break;
                    } else {
                        lastError = `No trading records found for ${dateStr}`;
                    }
                } catch (e: any) {
                    console.warn(`Fetch failed for ${dateStr}: ${e.message}`);
                    lastError = `${e.message} (Date: ${dateStr})`;
                }
            } else {
                console.log(`Skipping weekend: ${format(effectiveDate, 'yyyy-MM-dd')}`);
            }

            if (!found) {
                effectiveDate = subDays(effectiveDate, 1);
                attempts++;
                await new Promise(r => setTimeout(r, 600)); // Be respectful to APIs
            }
        }

        if (!found || latestData.length === 0) {
            throw new Error(`Market scan failed. Last error: ${lastError || 'Empty data'}. (Checked 15 days back)`);
        }

        // 2. Initial Filter: Top 100 by Volume (Liquidity & Hotness)
        // Also ensure Close > Open (Red Candle) and Price > 10 (avoid penny stocks if needed, optional)
        console.log('Filtering Top 100 Candidates...');
        const candidates = latestData
            .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 100);

        const candidateIds = new Set(candidates.map(c => c.stock_id));
        console.log(`Candidates identified: ${candidates.length}`);

        // 3. Build History (Last 10 Days)
        // We have Day 0. Need Day -1 to -9.
        const historyMap = new Map<string, StockData[]>();

        // Initialize with Day 0
        candidates.forEach(c => {
            historyMap.set(c.stock_id, [c]);
        });

        // Fetch past dates
        // Note: This involves serialized requests or parallel. Parallel limit 3-5 to be nice.
        const pastDates: string[] = [];
        let d = effectiveDate; // Start from the valid data date
        let daysFound = 0;
        let lookback = 1;

        while (daysFound < 9 && lookback < 20) { // Try up to 20 days back to find 9 trading days
            const targetDate = subDays(d, lookback);
            if (!isWeekend(targetDate)) {
                pastDates.push(format(targetDate, 'yyyyMMdd'));
                daysFound++;
            }
            lookback++;
        }

        console.log(`Fetching history for dates: ${pastDates.join(', ')}`);

        // Helper to fetch and merge
        const fetchAndMerge = async (dateStr: string) => {
            try {
                // We fetch ALL market for that day, but only keep what matches our candidates
                const dailyMarket = await ExchangeClient.getAllMarketQuotes(dateStr);

                dailyMarket.forEach(stock => {
                    if (candidateIds.has(stock.stock_id)) {
                        const list = historyMap.get(stock.stock_id);
                        if (list) list.push(stock);
                    }
                });
            } catch (e) {
                console.warn(`Failed to fetch history for ${dateStr}`);
            }
        };

        // Run in batches of 3 to avoid overwhelming
        for (let i = 0; i < pastDates.length; i += 3) {
            const batch = pastDates.slice(i, i + 3);
            await Promise.all(batch.map(date => fetchAndMerge(date)));
        }

        // 4. Scoring & Filtering
        let scoredCandidates: AnalysisResult[] = [];

        candidates.forEach(c => {
            // Sort history ascending (oldest first)
            const hist = historyMap.get(c.stock_id) || [];
            hist.sort((a, b) => a.date.localeCompare(b.date));

            // Run Engine
            // Note: We don't have Institutional data here (only Day 0 snapshot doesn't usually have it, 
            // or we'd need another API). For Stage 1, we might skip detailed chip analysis 
            // or assume neutral if missing.
            // *Wait*, ExchangeClient data doesn't include Inst data. 
            // We pass empty insts or try to inference from 'spread'? No.
            // We will proceed without Inst data for Stage 1. 
            // The Engine gracefully handles missing chips (neutral score).

            const result = evaluateStock(c.stock_id, { prices: hist, insts: [] });

            if (result && result.score >= 0.3) { // Min score filter
                scoredCandidates.push(result);
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
     * Performs full technical analysis for a single stock using FinMind (Detailed).
     */
    analyzeStock: async (stockId: string): Promise<AnalysisResult | null> => {
        console.log(`Analyzing stock ${stockId}...`);

        const endDate = format(new Date(), 'yyyy-MM-dd');
        const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');

        let prices: StockData[] = [];
        let insts: any[] = [];

        try {
            // Try FinMind first
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
