import axios from 'axios';
import { format, subDays } from 'date-fns';
import { StockData } from '@/types';

/**
 * Taiwan Stock Exchange (TWSE) & TPEX Client
 * Optimized for high-performance market scanning
 */
export const ExchangeClient = {
    /**
     * Get TWSE Daily Quotes (OHLCV)
     * Using STOCK_DAY_ALL which contains complete data (Open, Max, Min, Close, Volume)
     */
    getTwseDailyQuotes: async (): Promise<StockData[]> => {
        try {
            // Use the more complete API that includes OHLCV
            const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
            const res = await axios.get(url, { timeout: 8000 });
            const data = res.data || [];

            if (!Array.isArray(data)) return [];

            const parseNum = (val: any) => {
                if (!val) return 0;
                const clean = val.toString().replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return data
                .filter(item => item.Code && item.Code.length === 4) // Common stocks only
                .map(item => ({
                    stock_id: item.Code,
                    stock_name: item.Name,
                    date: format(new Date(), 'yyyy-MM-dd'),
                    open: parseNum(item.OpeningPrice),
                    max: parseNum(item.HighestPrice),
                    min: parseNum(item.LowestPrice),
                    close: parseNum(item.ClosingPrice),
                    spread: parseNum(item.Change),
                    Trading_Volume: parseNum(item.TradeVolume),
                    Trading_money: parseNum(item.TradeValue),
                    Trading_turnover: parseNum(item.Transaction),
                }))
                .filter(s => s.close > 0 && s.Trading_Volume > 0);
        } catch (error) {
            console.error('[Exchange] TWSE Quote error:', error);
            return [];
        }
    },

    /**
     * Get TPEX Daily Quotes (OTC)
     */
    getTpexDailyQuotes: async (): Promise<StockData[]> => {
        try {
            const url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            const res = await axios.get(url, { timeout: 8000 });
            const data = res.data || [];

            if (!Array.isArray(data)) return [];

            const parseNum = (val: any) => {
                if (!val) return 0;
                const clean = val.toString().replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return data
                .filter(item => item.SecuritiesCompanyCode && item.SecuritiesCompanyCode.length === 4)
                .map((item: any) => ({
                    stock_id: item.SecuritiesCompanyCode,
                    stock_name: item.CompanyName,
                    date: format(new Date(), 'yyyy-MM-dd'),
                    close: parseNum(item.Close),
                    spread: parseNum(item.Change),
                    open: parseNum(item.Open),
                    max: parseNum(item.High),
                    min: parseNum(item.Low),
                    Trading_Volume: parseNum(item.Volume),
                    Trading_money: 0,
                    Trading_turnover: 0,
                }))
                .filter(s => s.close > 0 && s.Trading_Volume > 0);
        } catch (error) {
            console.error('[Exchange] TPEX Quote error:', error);
            return [];
        }
    },

    /**
     * Get Market Snapshot with Optional Market Filter
     */
    getAllMarketQuotes: async (marketFilter?: string): Promise<StockData[]> => {
        const results = await Promise.allSettled([
            marketFilter === 'TPEX' ? Promise.resolve([]) : ExchangeClient.getTwseDailyQuotes(),
            marketFilter === 'TWSE' ? Promise.resolve([]) : ExchangeClient.getTpexDailyQuotes()
        ]);

        const twse = results[0].status === 'fulfilled' ? results[0].value : [];
        const tpex = results[1].status === 'fulfilled' ? results[1].value : [];

        return [...twse, ...tpex];
    },

    /**
     * Get Robust History with 60-day window to ensure enough trading days after holidays
     */
    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        try {
            const now = new Date();
            // Fetch 60 days to be safe (handles long holidays like CNY)
            const startDate = format(subDays(now, 60), 'yyyyMMdd');
            const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${startDate}&stockNo=${stockId}`;

            const res = await axios.get(url, { timeout: 10000 });
            if (!res.data || !res.data.data) return [];

            const data = res.data.data;
            const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));

            return data.map((row: any) => ({
                stock_id: stockId,
                date: row[0],
                Trading_Volume: parseNum(row[1]),
                open: parseNum(row[3]),
                max: parseNum(row[4]),
                min: parseNum(row[5]),
                close: parseNum(row[6]),
            })).filter((s: any) => s.close > 0);
        } catch {
            return [];
        }
    }
};
