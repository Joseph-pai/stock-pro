import axios from 'axios';
import { StockData } from '@/types';

export const ExchangeClient = {
    /**
     * ROC Date Conversion (OpenAPI often returns Western, but we keep this for legacy check)
     */
    convertRocDateToWestern: (rocDate: string): string => {
        if (!rocDate) return '';
        const digits = rocDate.replace(/[^\d]/g, '');
        const parts = rocDate.split(/[\/\.]/);
        if (parts.length === 3) {
            let year = parseInt(parts[0], 10);
            if (year < 1000) year += 1911;
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            return `${year}-${m}-${d}`;
        }
        if (digits.length === 8) {
            return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
        }
        if (digits.length === 7) {
            const y = parseInt(digits.slice(0, 3), 10) + 1911;
            const m = digits.slice(3, 5);
            const d = digits.slice(5, 7);
            return `${y}-${m}-${d}`;
        }
        return rocDate;
    },

    /**
     * Get TWSE Daily Quotes via OpenAPI v1
     */
    getTwseDailyQuotes: async (dateStr?: string): Promise<StockData[]> => {
        try {
            // Using Official OpenAPI v1 for high performance
            const url = dateStr
                ? `https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX?date=${dateStr}&type=ALLBUT0999`
                : `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;

            const res = await axios.get(url, { timeout: 8000 });

            if (!Array.isArray(res.data)) return [];

            const parseNum = (val: any) => {
                if (val === undefined || val === null || val === '') return 0;
                const clean = val.toString().replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return res.data.map((item: any) => {
                const close = parseNum(item.ClosingPrice || item.Close);
                if (close === 0) return null;

                return {
                    stock_id: item.Code,
                    stock_name: item.Name,
                    date: ExchangeClient.convertRocDateToWestern(item.Date) || new Date().toISOString().slice(0, 10),
                    Trading_Volume: parseNum(item.TradeVolume),
                    Trading_turnover: parseNum(item.Transaction),
                    Trading_money: parseNum(item.TradeValue),
                    open: parseNum(item.OpeningPrice || item.Open),
                    max: parseNum(item.HighestPrice || item.High),
                    min: parseNum(item.LowestPrice || item.Low),
                    close: close,
                    spread: parseNum(item.Change),
                };
            }).filter(Boolean) as StockData[];

        } catch (error: any) {
            console.warn(`TWSE OpenAPI Error: ${error.message} (${dateStr || 'Latest'})`);
            return []; // Fail silent to allow TPEx data
        }
    },

    /**
     * Get TPEX Daily Quotes via OpenAPI v1
     */
    getTpexDailyQuotes: async (dateStr?: string): Promise<StockData[]> => {
        try {
            // dateStr yyyyMMdd -> roc yyy/mm/dd
            let url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            // Note: TPEx OpenAPI sometimes doesn't support date queries as easily as TWSE, 
            // the mainboard_daily_close_quotes is usually the LATEST.

            const res = await axios.get(url, { timeout: 8000 });
            if (!Array.isArray(res.data)) return [];

            const parseNum = (val: any) => {
                if (val === undefined || val === null || val === '') return 0;
                const clean = val.toString().replace(/,/g, '');
                return clean === '--' || clean === '---' || clean === '除權息' ? 0 : parseFloat(clean);
            };

            return res.data.map((item: any) => ({
                stock_id: item.SecuritiesCompanyCode,
                stock_name: item.CompanyName,
                date: ExchangeClient.convertRocDateToWestern(item.Date),
                close: parseNum(item.Close),
                spread: parseNum(item.Change),
                open: parseNum(item.Open),
                max: parseNum(item.High),
                min: parseNum(item.Low),
                Trading_Volume: parseNum(item.TradingShares),
                Trading_money: parseNum(item.TransactionAmount),
                Trading_turnover: parseNum(item.TransactionNumber),
            })).filter(s => s.close > 0 && s.stock_id.length === 4);

        } catch (error: any) {
            console.warn(`TPEX OpenAPI Error: ${error.message}`);
            return [];
        }
    },

    /**
     * Aggregator
     */
    getAllMarketQuotes: async (dateStr?: string): Promise<StockData[]> => {
        const results = await Promise.allSettled([
            ExchangeClient.getTwseDailyQuotes(dateStr),
            ExchangeClient.getTpexDailyQuotes(dateStr)
        ]);

        const twse = results[0].status === 'fulfilled' ? results[0].value : [];
        const tpex = results[1].status === 'fulfilled' ? results[1].value : [];

        return [...twse, ...tpex];
    },

    /**
     * Stock History Fallback
     */
    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        // Legay history fetch logic remains as backup for Stage 2
        // Implementation details from legacy system...
        return [];
    }
};
