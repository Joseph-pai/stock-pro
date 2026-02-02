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
        try {
            const params = getParams('TaiwanStockPrice', options.stockId, options.date, options.startDate);
            const res = await client.get<FinMindResponse<StockData>>('', { params: params });
            if (!res.data || res.data.status !== 200) {
                console.warn(`FinMind API Warning [Price]: ${res.data?.msg || 'Unknown status'}`);
                return [];
            }
            return res.data.data;
        } catch (error: any) {
            console.error(`FinMind Network Error [Price]: ${error.message}`);
            return [];
        }
    },

    /**
     * Get institutional investors data.
     */
    getInstitutional: async (options: { stockId?: string; date?: string; startDate?: string }) => {
        try {
            const params = getParams('TaiwanStockHoldingSharesPer', options.stockId, options.date, options.startDate);
            const res = await client.get<FinMindResponse<InstitutionalData>>('', { params: params });
            if (!res.data || res.data.status !== 200) {
                console.warn(`FinMind API Warning [Inst]: ${res.data?.msg || 'Unknown status'}`);
                return [];
            }
            return res.data.data;
        } catch (error: any) {
            console.error(`FinMind Network Error [Inst]: ${error.message}`);
            return [];
        }
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
