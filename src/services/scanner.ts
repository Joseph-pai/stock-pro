import { FinMindClient } from '@/lib/finmind';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays } from 'date-fns';

export const ScannerService = {
    /**
     * Stage 1: Fast Market Scan (Official Sources Only)
     * Returns top candidates based on technical criteria (Volume, Price Change).
     * Does NOT call FinMind to avoid rate limits.
     */
    scanMarket: async (): Promise<AnalysisResult[]> => {
        console.log('Fetching latest market snapshot from TWSE/TPEx...');
        let latestData: StockData[] = [];

        try {
            latestData = await ExchangeClient.getAllMarketQuotes();
        } catch (e: any) {
            console.error('Failed to fetch market data:', e.message);
            throw new Error(`Market data unavailable: ${e.message}`);
        }

        if (latestData.length === 0) {
            throw new Error(`Market data not found. Please check internet connection.`);
        }

        // Broad Filter: Volume > 2000 and Price > Open (Bullish Candle)
        console.log('Filtering candidates...');
        const candidates = latestData.filter(s => s.Trading_Volume > 2000 && s.close > s.open);

        // Sorting: Volume (Liquidity)
        // Take top 50 candidates for the dashboard list
        const topCandidates = candidates
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 50);

        console.log(`Identified ${topCandidates.length} candidates for dashboard.`);

        // Map to simplified AnalysisResult (without detailed scoring initially)
        return topCandidates.map(s => {
            // Calculate approximate change percentage
            // ExchangeClient logic: spread is price difference. 
            // If up, spread is positive. If down, negative.
            // We only filtered close > open, so spread should be positive or close > prev.
            const prev = s.close - s.spread;
            const changePercent = prev !== 0 ? (s.spread / prev) * 100 : 0;

            return {
                stock_id: s.stock_id,
                stock_name: s.stock_name,
                close: s.close,
                change_percent: changePercent,
                score: 0, // Pending analysis
                v_ratio: 0,
                is_ma_aligned: false,
                is_ma_breakout: false,
                consecutive_buy: 0,
                tags: [],
                poc: 0,
                verdict: 'Pending Analysis'
            };
        });
    },

    /**
     * Stage 2: Deep Analysis (On-Demand)
     * Performs full technical analysis for a single stock using FinMind.
     */
    analyzeStock: async (stockId: string): Promise<AnalysisResult | null> => {
        console.log(`Analyzing stock ${stockId}...`);

        // 1. Fetch History (Price + Inst)
        // Need ~30 days for MA20 and POC
        const endDate = format(new Date(), 'yyyy-MM-dd');
        // Fetch 45 days to be safe for holidays/weekends to get 20 trading days
        const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');

        try {
            const [prices, insts] = await Promise.all([
                FinMindClient.getDailyStats({ stockId, startDate, endDate }),
                FinMindClient.getInstitutional({ stockId, startDate, endDate })
            ]);

            if (prices.length < 20) {
                console.warn(`Insufficient data for ${stockId} (found ${prices.length} days)`);
                return null;
            }

            const result = evaluateStock(stockId, { prices, insts });

            if (!result) return null;

            // Attach history for the chart page
            return {
                ...result,
                history: prices
            };

        } catch (error: any) {
            console.error(`Analysis failed for ${stockId}:`, error.message);
            throw error;
        }
    }
};
