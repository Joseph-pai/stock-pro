import axios from 'axios';
import { CONFIG } from './config';
import { StockData, InstitutionalData, FinMindResponse } from '@/types';

const client = axios.create({
    baseURL: CONFIG.FINMIND.API_URL,
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

// Helper to format params
const getParams = (dataset: string, stockId?: string, date?: string, startDate?: string) => {
    const params: Record<string, string> = {
        dataset,
        token: CONFIG.FINMIND.TOKEN,
    };
    if (stockId) params.stock_id = stockId;
    if (date) params.date = date;
    if (startDate) params.start_date = startDate;
    return new URLSearchParams(params);
};

export const FinMindClient = {
    /**
     * Get daily price data.
     * If stockId is provided, fetches history (requires startDate).
     * If only date is provided, fetches ALL stocks for that single day.
     */
    getDailyStats: async (options: { stockId?: string; date?: string; startDate?: string }) => {
        const params = getParams('TaiwanStockPrice', options.stockId, options.date, options.startDate);
        const res = await client.get<FinMindResponse<StockData>>('', { params });
        if (res.status !== 200 || res.data.status !== 200) {
            console.error('FinMind API Error:', res.data.msg);
            return [];
        }
        return res.data.data;
    },

    /**
     * Get institutional investors data.
     */
    getInstitutional: async (options: { stockId?: string; date?: string; startDate?: string }) => {
        const params = getParams('TaiwanStockHoldingSharesPer', options.stockId, options.date, options.startDate);
        const res = await client.get<FinMindResponse<InstitutionalData>>('', { params });
        if (res.status !== 200 || res.data.status !== 200) {
            return [];
        }
        return res.data.data;
    },

    /**
     * Get Stock Info (Stock Name mapping)
     */
    getStockInfo: async () => {
        const params = new URLSearchParams({
            dataset: 'TaiwanStockInfo',
            token: CONFIG.FINMIND.TOKEN,
        });
        const res = await client.get<FinMindResponse<{ stock_id: string; stock_name: string }>>('', { params });
        return res.data.data;
    }
};
