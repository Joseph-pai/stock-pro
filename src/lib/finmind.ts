import axios from 'axios';
import { CONFIG } from './config';
import { StockData, InstitutionalData, FinMindResponse } from '@/types';

const client = axios.create({
    baseURL: CONFIG.FINMIND.API_URL,
    timeout: 15000, // 15 seconds
});

/**
 * Enhanced FinMind Client
 * Uses plain objects for params to ensure Axios compatibility.
 */
export const FinMindClient = {
    getDailyStats: async (options: { stockId?: string; date?: string; startDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockPrice',
                token: CONFIG.FINMIND.TOKEN,
            };
            if (options.stockId) params.data_id = options.stockId;
            if (options.date) params.date = options.date;
            if (options.startDate) params.start_date = options.startDate;

            const res = await client.get<FinMindResponse<StockData>>('', { params });

            if (!res.data || res.data.status !== 200) {
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${res.data?.msg || 'No response'}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            if (error.response) {
                throw new Error(`API ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    },

    getInstitutional: async (options: { stockId?: string; date?: string; startDate?: string }) => {
        try {
            const params: any = {
                dataset: 'TaiwanStockHoldingSharesPer',
                token: CONFIG.FINMIND.TOKEN,
            };
            if (options.stockId) params.data_id = options.stockId;
            if (options.date) params.date = options.date;
            if (options.startDate) params.start_date = options.startDate;

            const res = await client.get<FinMindResponse<InstitutionalData>>('', { params });

            if (!res.data || res.data.status !== 200) {
                throw new Error(`FinMind Status ${res.data?.status || 'Unknown'}: ${res.data?.msg || 'No response'}`);
            }
            return res.data.data || [];
        } catch (error: any) {
            if (error.response) {
                throw new Error(`API ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    },

    getStockInfo: async () => {
        try {
            const params = {
                dataset: 'TaiwanStockInfo',
                token: CONFIG.FINMIND.TOKEN,
            };
            const res = await client.get<FinMindResponse<{ stock_id: string; stock_name: string }>>('', { params });
            return res.data.data || [];
        } catch (error: any) {
            console.error(`FinMind Network Error [Info]: ${error.message}`);
            return [];
        }
    }
};
