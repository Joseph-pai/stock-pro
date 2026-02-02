import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays, isWeekend } from 'date-fns';

const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
        const k = String(item[key]);
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
    }, {} as Record<string, T[]>);
};

// Top 50 Stocks (Taiwan Index Blue Chips) for Limited Scan fallback
const TOP_50_STOCKS = [
    '2330', '2317', '2454', '2308', '2382', '2412', '2881', '2882', '2303', '3711',
    '2886', '2357', '2891', '3008', '1301', '1303', '1216', '2005', '2603', '2327',
    '2880', '2884', '2885', '2890', '2892', '2883', '2887', '5880', '2888', '2408',
    '2379', '2395', '3034', '3045', '2345', '2301', '4938', '2474', '2354', '1101',
    '1326', '6505', '2609', '2615', '2912', '9904', '3037', '2360', '8046', '3231'
];

export const ScannerService = {
    scanMarket: async (dates: string[]) => {
        // Stage 1: Get the latest trading day market snapshot (Official TWSE/TPEx)
        console.log('Fetching latest market snapshot from TWSE/TPEx...');
        let latestData: StockData[] = [];

        try {
            latestData = await ExchangeClient.getAllMarketQuotes();
        } catch (e: any) {
            console.error('Failed to fetch market data:', e.message);
        }

        if (latestData.length === 0) {
            throw new Error(`Market data not found. Please check internet connection or exchange availability.`);
        }

        // Stage 2: Identifying Candidates (Broad Filter)
        // Criteria: Volume > 2000 shares (liquidity) and positive change
        // Note: ExchangeClient returns volume in SHARES directly (or adjusted in client). 
        // TWSE 'Trading_Volume' from code is shares.
        console.log('Filtering candidates...');
        const candidates = latestData.filter(s => s.Trading_Volume > 2000 && s.close > s.open);

        // Take top 50 stocks by volume to avoid too many history requests
        // (Reduced from 100 to 50 to save FinMind quota)
        const topCandidates = candidates
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 50);

        console.log(`Identified ${topCandidates.length} potential breakout candidates.`);

        // Stage 3: Fetch history for top candidates using FinMind (for technical analysis)
        // We need history to calculate MA, Volume Ratio, and Institutional buying
        const startDate = dates[0];
        const results: AnalysisResult[] = [];

        // Fetch histories in chunks
        const chunkSize = 10;
        for (let i = 0; i < topCandidates.length; i += chunkSize) {
            const chunk = topCandidates.slice(i, i + chunkSize);
            console.log(`Processing history chunk ${Math.floor(i / chunkSize) + 1}...`);

            const historyPromises = chunk.map(c =>
                Promise.all([
                    FinMindClient.getDailyStats({ stockId: c.stock_id, startDate }),
                    FinMindClient.getInstitutional({ stockId: c.stock_id, startDate })
                ]).then(([prices, insts]) => ({ stockId: c.stock_id, prices, insts }))
            );

            const chunkResults = await Promise.all(historyPromises);

            for (const { stockId, prices, insts } of chunkResults) {
                if (prices.length < 20) continue; // Need enough days for MA20

                const result = evaluateStock(stockId, { prices, insts });
                if (result && (result.score > 0.4 || result.tags.length > 0)) {
                    results.push(result);
                }
            }

            // Short delay
            await new Promise(r => setTimeout(r, 200));
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    },

    /**
     * Fallback scan for "Register" level accounts
     * Individually queries top stocks to circumvent market-wide limit
     */
    performLimitedScan: async (dates: string[]): Promise<AnalysisResult[]> => {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1]; // Use precise snapshot
        const results: AnalysisResult[] = [];

        console.log(`Starting limited scan for ${TOP_50_STOCKS.length} blue-chip stocks...`);

        // Chunk processing to avoid excessive concurrent requests
        const chunkSize = 10;
        for (let i = 0; i < TOP_50_STOCKS.length; i += chunkSize) {
            const chunk = TOP_50_STOCKS.slice(i, i + chunkSize);

            const historyPromises = chunk.map(stockId =>
                Promise.all([
                    FinMindClient.getDailyStats({ stockId, startDate, endDate }),
                    FinMindClient.getInstitutional({ stockId, startDate, endDate })
                ]).then(([prices, insts]) => ({ stockId, prices, insts }))
                    .catch(e => {
                        console.error(`Limited Scan Fail [${stockId}]:`, e.message);
                        return null;
                    })
            );

            const chunkResults = await Promise.all(historyPromises);

            for (const item of chunkResults) {
                if (!item || item.prices.length < 20) continue;

                const result = evaluateStock(item.stockId, { prices: item.prices, insts: item.insts });
                if (result) {
                    // Mark as limited scan result
                    result.tags.push('LIMITED_SCAN');
                    results.push(result);
                }
            }

            // Register tier has 600 req/hr limits, don't spam
            await new Promise(r => setTimeout(r, 500));
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    }
};
