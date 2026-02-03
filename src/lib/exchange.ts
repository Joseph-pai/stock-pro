import axios from 'axios';
import { format, subDays } from 'date-fns';
import { StockData } from '@/types';

/**
 * Enhanced Exchange Client
 * Supports targeted market and sector scanning
 */
export const ExchangeClient = {
    /**
     * Get Daily Quotes by Market and Sector
     * Used to narrow down the initial list instead of a full snapshot
     */
    getQuotesBySector: async (market: 'TWSE' | 'TPEX', sectorId: string): Promise<StockData[]> => {
        try {
            if (market === 'TWSE') {
                const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=${sectorId}`;
                const res = await axios.get(url, { timeout: 8000 });
                const data = res.data;
                const tables = Object.values(data).filter(v => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length >= 10);
                if (tables.length === 0) return [];
                const stocks = tables[0] as string[][];
                const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                return stocks
                    .filter(row => row[0].length === 4)
                    .map(row => ({
                        stock_id: row[0],
                        stock_name: row[1].trim(),
                        date: format(new Date(), 'yyyy-MM-dd'),
                        open: parseNum(row[5]),
                        max: parseNum(row[6]),
                        min: parseNum(row[7]),
                        close: parseNum(row[8]),
                        spread: parseNum(row[10]),
                        Trading_Volume: parseNum(row[2]) / 1000,
                        Trading_money: parseNum(row[4]),
                        Trading_turnover: parseNum(row[3]),
                    }))
                    .filter(s => s.close > 0);
            } else {
                const url = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&se=${sectorId}`;
                const res = await axios.get(url, { timeout: 8000 });
                const data = res.data.aaData || [];
                const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                return data
                    .filter((row: any) => row[0].length === 4)
                    .map((row: any) => ({
                        stock_id: row[0],
                        stock_name: row[1].trim(),
                        date: format(new Date(), 'yyyy-MM-dd'),
                        close: parseNum(row[2]),
                        spread: parseNum(row[3]),
                        open: parseNum(row[4]),
                        max: parseNum(row[5]),
                        min: parseNum(row[6]),
                        Trading_Volume: parseNum(row[7]) / 1000,
                        Trading_money: parseNum(row[8]),
                        Trading_turnover: parseNum(row[9]),
                    }))
                    .filter((s: any) => s.close > 0);
            }
        } catch (error) {
            console.error(`[Exchange] Error fetching ${market} ${sectorId}:`, error);
            return [];
        }
    },

    getAllMarketQuotes: async (market: 'TWSE' | 'TPEX'): Promise<StockData[]> => {
        if (market === 'TWSE') {
            const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
            const res = await axios.get(url);
            return res.data.map((item: any) => ({
                stock_id: item.Code,
                stock_name: item.Name,
                date: format(new Date(), 'yyyy-MM-dd'),
                open: parseFloat(item.OpeningPrice),
                max: parseFloat(item.HighestPrice),
                min: parseFloat(item.LowestPrice),
                close: parseFloat(item.ClosingPrice),
                spread: parseFloat(item.Change),
                Trading_Volume: parseFloat(item.TradeVolume) / 1000,
                Trading_money: parseFloat(item.TradeValue),
                Trading_turnover: parseFloat(item.Transaction),
            })).filter((s: any) => s.close > 0 && s.stock_id.length === 4);
        } else {
            const url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            const res = await axios.get(url);
            return res.data.map((item: any) => ({
                stock_id: item.SecuritiesCompanyCode,
                stock_name: item.CompanyName,
                date: format(new Date(), 'yyyy-MM-dd'),
                close: parseFloat(item.Close),
                spread: parseFloat(item.Change),
                open: parseFloat(item.Open),
                max: parseFloat(item.High),
                min: parseFloat(item.Low),
                Trading_Volume: parseFloat(item.Volume) / 1000,
            })).filter((s: any) => s.close > 0 && s.stock_id.length === 4);
        }
    },

    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        try {
            const now = new Date();
            const startDate = format(subDays(now, 70), 'yyyyMMdd');
            const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${startDate}&stockNo=${stockId}`;
            const res = await axios.get(url, { timeout: 10000 });
            if (!res.data || !res.data.data) return [];
            const data = res.data.data;
            const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
            return data.map((row: any) => ({
                stock_id: stockId,
                date: row[0],
                Trading_Volume: parseNum(row[1]) / 1000,
                open: parseNum(row[3]),
                max: parseNum(row[4]),
                min: parseNum(row[5]),
                close: parseNum(row[6]),
            })).filter((s: any) => s.close > 0);
        } catch {
            return [];
        }
    },

    getIndustryMapping: async (): Promise<Record<string, string>> => {
        const mapping: Record<string, string> = {};
        try {
            const twseUrl = `https://openapi.twse.com.tw/v1/opendata/t187ap03_L`;
            const twseRes = await axios.get(twseUrl, { timeout: 10000 });
            twseRes.data.forEach((item: any) => {
                mapping[item.Code] = item.產業別;
            });
            const tpexUrl = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_per_quotes`;
            const tpexRes = await axios.get(tpexUrl, { timeout: 10000 });
            tpexRes.data.forEach((item: any) => {
                mapping[item.SecuritiesCompanyCode] = item.掛牌類別;
            });
            return mapping;
        } catch (e) {
            console.error('[Exchange] Mapping error:', e);
            return mapping;
        }
    }
};
