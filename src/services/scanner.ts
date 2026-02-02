import { FinMindClient } from '@/lib/finmind';
import { evaluateStock } from './engine';
import { StockData, InstitutionalData, AnalysisResult } from '@/types';

// Helper to group array by key
const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
        const k = String(item[key]);
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
    }, {} as Record<string, T[]>);
};

export const ScannerService = {
    /**
     * Scan the market for breakout stocks.
     * @param dates Array of date strings 'yyyy-mm-dd', latest last. Requires at least 20 days.
     */
    scanMarket: async (dates: string[]) => {
        console.log(`Starting scan for ${dates.length} days...`);

        // 1. Fetch Data in Parallel (Chunked to avoid rate limits if any, though FinMind is generous with token)
        // We need Prices for all dates
        const pricePromises = dates.map(date => FinMindClient.getDailyStats({ date }));
        // We need Inst for last 3 days only (for optimization)
        // Actually engine needs 3 days check.
        const instDates = dates.slice(-3);
        const instPromises = instDates.map(date => FinMindClient.getInstitutional({ date }));

        const [pricesResults, instResults] = await Promise.all([
            Promise.all(pricePromises.map(p => p.catch(e => { console.error('Price Fetch Fail', e.message); return []; }))),
            Promise.all(instPromises.map(p => p.catch(e => { console.error('Inst Fetch Fail', e.message); return []; })))
        ]);

        // Flatten and Filter out empty
        const allPrices = pricesResults.flat() as StockData[];
        const allInsts = instResults.flat() as InstitutionalData[];

        if (allPrices.length === 0) {
            throw new Error(`FinMind API returned no price data for the requested dates. Check Token and API status.`);
        }

        // 2. Group by Stock ID
        const pricesByStock = groupBy(allPrices, 'stock_id');
        const instsByStock = groupBy(allInsts, 'stock_id');

        // 3. Analyze each stock
        const results: AnalysisResult[] = [];

        for (const stockId in pricesByStock) {
            const stockPrices = pricesByStock[stockId].sort((a, b) => a.date.localeCompare(b.date));
            const stockInsts = instsByStock[stockId] || [];

            if (stockPrices.length === 0) continue;

            const latest = stockPrices[stockPrices.length - 1];
            if (latest.close < 5) continue;

            const result = evaluateStock(stockId, { prices: stockPrices, insts: stockInsts });

            if (result) {
                // Only keep interesting results? Or all?
                // Keep if Score > 0.5 or has Tags
                if (result.score > 0.5 || result.tags.length > 0) {
                    results.push(result);
                }
            }
        }

        // 4. Sort and Return Top 20
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 50); // Return top 50, UI shows 20?
    }
};
