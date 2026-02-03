import axios from 'axios';
import { StockData } from '@/types';

export const ExchangeClient = {
    /**
     * ROC Date Conversion
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
     * Get TWSE Daily Quotes
     * Snapshot (dateStr null): Uses high-speed OpenAPI
     * History (dateStr set): Uses MI_INDEX (Filtered for performance)
     */
    getTwseDailyQuotes: async (dateStr?: string, filterIds?: Set<string>): Promise<StockData[]> => {
        try {
            if (!dateStr) {
                // High-speed Snapshot for TODAY
                const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
                const res = await axios.get(url, { timeout: 8000 });
                if (!Array.isArray(res.data)) return [];
                return res.data.map((item: any) => ({
                    stock_id: item.Code,
                    stock_name: item.Name,
                    date: new Date().toISOString().slice(0, 10),
                    Trading_Volume: parseFloat(item.TradeVolume || '0'),
                    Trading_turnover: parseFloat(item.Transaction || '0'),
                    Trading_money: parseFloat(item.TradeValue || '0'),
                    open: parseFloat(item.OpeningPrice || '0'),
                    max: parseFloat(item.HighestPrice || '0'),
                    min: parseFloat(item.LowestPrice || '0'),
                    close: parseFloat(item.ClosingPrice || '0'),
                    spread: parseFloat(item.Change || '0'),
                })).filter(s => s.close > 0);
            }

            // History fetch via MI_INDEX
            const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateStr}&type=ALLBUT0999&response=json`;
            const res = await axios.get(url, { timeout: 8000 });
            if (res.data.stat !== 'OK') return [];

            let quotesIn: string[][] = [];
            let fieldsIn: string[] = [];
            const keys = Object.keys(res.data);
            for (const key of keys) {
                if (key.startsWith('data') && Array.isArray(res.data[key])) {
                    const fields = res.data['fields' + key.slice(4)];
                    if (Array.isArray(fields) && fields.some(f => f.includes('代號'))) {
                        quotesIn = res.data[key];
                        fieldsIn = fields;
                        break;
                    }
                }
            }

            if (quotesIn.length === 0) return [];

            const finalDate = ExchangeClient.convertRocDateToWestern(res.data.date);
            const idxId = fieldsIn.findIndex(f => f.includes('證券代號'));
            const idxClose = fieldsIn.findIndex(f => f.includes('收盤價'));
            const idxVol = fieldsIn.findIndex(f => f.includes('成交股數'));
            const idxOpen = fieldsIn.findIndex(f => f.includes('開盤價'));

            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return quotesIn
                .filter(row => !filterIds || filterIds.has(row[idxId])) // FILTER FIRST to save memory
                .map(row => {
                    const close = parseNum(row[idxClose]);
                    if (close === 0) return null;
                    return {
                        stock_id: row[idxId],
                        stock_name: '',
                        date: finalDate,
                        Trading_Volume: parseNum(row[idxVol]),
                        Trading_turnover: 0,
                        Trading_money: 0,
                        open: parseNum(row[idxOpen]),
                        max: close, // Approximate for history
                        min: close,
                        close: close,
                        spread: 0,
                    };
                }).filter(Boolean) as StockData[];

        } catch (error: any) {
            console.warn(`TWSE Fetch Error: ${error.message}`);
            return [];
        }
    },

    /**
     * Get TPEX Daily Quotes
     */
    getTpexDailyQuotes: async (dateStr?: string, filterIds?: Set<string>): Promise<StockData[]> => {
        try {
            let url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            if (dateStr) {
                const y = parseInt(dateStr.slice(0, 4)) - 1911;
                const m = dateStr.slice(4, 6);
                const d = dateStr.slice(6, 8);
                url = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&d=${y}/${m}/${d}&se=EW&t=D`;
            }

            const res = await axios.get(url, { timeout: 8000 });
            const data = (dateStr ? res.data.aaData : res.data) || [];
            if (!Array.isArray(data)) return [];

            const parseNum = (val: any) => {
                if (!val) return 0;
                const clean = val.toString().replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            if (dateStr) {
                // Parse legacy TPEx format
                return data
                    .filter(row => !filterIds || filterIds.has(row[0]))
                    .map(row => ({
                        stock_id: row[0],
                        stock_name: row[1],
                        date: ExchangeClient.convertRocDateToWestern(dateStr),
                        close: parseNum(row[2]),
                        spread: parseNum(row[3]),
                        open: parseNum(row[4]),
                        max: parseNum(row[5]),
                        min: parseNum(row[6]),
                        Trading_Volume: parseNum(row[7]),
                        Trading_money: parseNum(row[8]),
                        Trading_turnover: parseNum(row[9]),
                    })).filter(s => s.close > 0);
            } else {
                // Parse OpenAPI TPEx format
                return data.map((item: any) => ({
                    stock_id: item.SecuritiesCompanyCode,
                    stock_name: item.CompanyName,
                    date: new Date().toISOString().slice(0, 10),
                    close: parseNum(item.Close),
                    spread: parseNum(item.Change),
                    open: parseNum(item.Open),
                    max: parseNum(item.High),
                    min: parseNum(item.Low),
                    Trading_Volume: parseNum(item.TradingShares),
                    Trading_money: parseNum(item.TransactionAmount),
                    Trading_turnover: parseNum(item.TransactionNumber),
                })).filter(s => s.close > 0);
            }
        } catch (error: any) {
            console.warn(`TPEx Fetch Error: ${error.message}`);
            return [];
        }
    },

    getAllMarketQuotes: async (dateStr?: string, filterIds?: Set<string>): Promise<StockData[]> => {
        const results = await Promise.allSettled([
            ExchangeClient.getTwseDailyQuotes(dateStr, filterIds),
            ExchangeClient.getTpexDailyQuotes(dateStr, filterIds)
        ]);
        const twse = results[0].status === 'fulfilled' ? results[0].value : [];
        const tpex = results[1].status === 'fulfilled' ? results[1].value : [];
        return [...twse, ...tpex];
    },

    /**
     * Stock History Fallback (Stage 2)
     * Full month history for single stock
     */
    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        const now = new Date();
        const fetchTwse = async () => {
            const ds = now.toISOString().slice(0, 10).replace(/-/g, '').slice(0, 6);
            const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ds}01&stockNo=${stockId}&response=json`;
            const res = await axios.get(url, { timeout: 6000 });
            if (res.data.stat !== 'OK') return [];
            return res.data.data.map((row: any) => ({
                date: ExchangeClient.convertRocDateToWestern(row[0]),
                stock_id: stockId,
                stock_name: '',
                Trading_Volume: parseInt(row[1]?.replace(/,/g, '') || '0'),
                Trading_money: parseInt(row[2]?.replace(/,/g, '') || '0'),
                open: parseFloat(row[3]?.replace(/,/g, '') || '0'),
                max: parseFloat(row[4]?.replace(/,/g, '') || '0'),
                min: parseFloat(row[5]?.replace(/,/g, '') || '0'),
                close: parseFloat(row[6]?.replace(/,/g, '') || '0'),
                spread: parseFloat(row[7]?.replace(/X/g, '') || '0'),
                Trading_turnover: parseInt(row[8]?.replace(/,/g, '') || '0')
            }));
        };
        try { return await fetchTwse(); } catch { return []; }
    }
};
