import { FinMindClient } from '@/lib/finmind';
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

export const ScannerService = {
    scanMarket: async (dates: string[]) => {
        // Stage 1: Get the latest trading day data
        console.log('Fetching latest market snapshot...');
        let latestData: StockData[] = [];

        // Try the last 5 days to find the most recent trading day
        for (let i = 0; i < 5; i++) {
            const date = dates[dates.length - 1 - i];
            if (!date) continue;

            const data = await FinMindClient.getDailyStats({ date });
            if (data.length > 500) { // Significant number of stocks means it's a trading day
                latestData = data;
                console.log(`Using ${date} as the latest trading day. Found ${data.length} stocks.`);
                break;
            }
        }

        if (latestData.length === 0) {
            throw new Error('Could not find any recent trading data in the last 5 days. Verify API Token and market status.');
        }

        // Stage 2: Identifying Candidates (Broad Filter)
        // Criteria: Volume > 1000 samples (liquidity) and positive change
        console.log('Filtering candidates...');
        const candidates = latestData.filter(s => s.Trading_Volume > 2000 && s.close > s.open);

        // Take top 100 stocks by volume to avoid too many history requests
        const topCandidates = candidates
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 100);

        console.log(`Identified ${topCandidates.length} potential breakout candidates.`);

        // Stage 3: Fetch history for top candidates
        const startDate = dates[0];
        const results: AnalysisResult[] = [];

        // Fetch histories in chunks to stay under timeout/rate limits
        const chunkSize = 20;
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

            // Short delay to avoid hitting rate limits too hard? 
            // In serverless we want to finish fast, but 100ms is safe.
            await new Promise(r => setTimeout(r, 100));
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 50);
    }
};
