import axios from 'axios';
import { StockData } from '@/types';

// TWSE Response Interface
interface TwseResponse {
    stat: string;
    date: string;
    title: string;
    fields: string[];
    data: string[][]; // [Code, Name, Volume, Value, Open, High, Low, Close, Change, Transaction]
    notes: string[];
}

// TPEX Response Interface
interface TpexResponse {
    stk_date: string;
    reportTitle: string;
    aaData: string[][]; // [Code, Name, Close, Change, Open, High, Low, Volume, Value, Transaction] (Order varies slightly)
    iTotalRecords?: number;
}

export const ExchangeClient = {
    /**
     * Convert ROC Date (e.g., 113/05/20) to Western Date (2024-05-20)
     * Handles "113/05/20" -> "2024-05-20"
     */
    convertRocDateToWestern: (rocDate: string): string => {
        if (!rocDate) return '';

        // Remove all non-numeric characters to see the raw sequence
        const digits = rocDate.replace(/[^\d]/g, '');

        // Handle slashes or dots: "113/05/20" or "113.05.20"
        const parts = rocDate.split(/[\/\.]/);
        if (parts.length === 3) {
            let year = parseInt(parts[0], 10);
            if (year < 1000) year += 1911; // ROC conversion
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            return `${year}-${m}-${d}`;
        }

        // Handle "20240520" (Western compact)
        if (digits.length === 8) {
            return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
        }

        // Handle "1130520" (ROC compact)
        if (digits.length === 7) {
            const y = parseInt(digits.slice(0, 3), 10) + 1911;
            const m = digits.slice(3, 5);
            const d = digits.slice(5, 7);
            return `${y}-${m}-${d}`;
        }

        // Handle "990520" (ROC compact 2-digit)
        if (digits.length === 6) {
            const y = parseInt(digits.slice(0, 2), 10) + 1911;
            const m = digits.slice(2, 4);
            const d = digits.slice(4, 6);
            return `${y}-${m}-${d}`;
        }

        return rocDate;
    },

    /**
     * Get TWSE (Exchange) Daily Quotes
     * URL: https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={date}&type=ALLBUT0999&response=json
     * (Switched to MI_INDEX to support specific dates)
     */
    getTwseDailyQuotes: async (dateStr?: string): Promise<StockData[]> => {
        try {
            // Default to empty (latest) if not provided, but MI_INDEX generally needs a date or defaults to today
            // dateStr format: yyyyMMdd
            const qDate = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${qDate}&type=ALLBUT0999&response=json`;

            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.twse.com.tw/zh/page/trading/exchange/MI_INDEX.html',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (res.data.stat !== 'OK') {
                console.warn(`TWSE API Stat: ${res.data.stat} for date ${qDate}`);
                return [];
            }

            // MI_INDEX response structure is complex. Stock data is in a table where fields contain "證券代號"
            // We iterate through all keys in the response to find the correct data/fields pair
            let quotesIn: string[][] = [];
            let fieldsIn: string[] = [];

            const keys = Object.keys(res.data);
            for (const key of keys) {
                if (key.startsWith('data') && Array.isArray(res.data[key])) {
                    const suffix = key.slice(4);
                    const fieldsKey = 'fields' + suffix;
                    const fields = res.data[fieldsKey];

                    // Robust check: trim and partial match to handle hidden chars or format changes
                    if (Array.isArray(fields) && fields.some(f => {
                        const cf = f.trim();
                        return cf === '證券代號' || cf === '股票代號' || cf.includes('代號');
                    })) {
                        quotesIn = res.data[key];
                        fieldsIn = fields;
                        break;
                    }
                }
            }

            if (quotesIn.length === 0) {
                const fieldsMap = keys.filter(k => k.startsWith('fields')).map(k => `${k}:[${(res.data[k] || []).slice(0, 3).join(',')}]`);
                console.warn(`TWSE: No stock table found for ${qDate}. Stat: ${res.data.stat}. Fields mapping: ${fieldsMap.join(' | ')}`);
                return [];
            }

            const finalDate = ExchangeClient.convertRocDateToWestern(res.data.date) ||
                `${qDate.slice(0, 4)}-${qDate.slice(4, 6)}-${qDate.slice(6, 8)}`;

            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            // Map fields to indices using fuzzy matching
            const findIdx = (targets: string[]) => fieldsIn.findIndex(f => targets.some(t => f.trim().includes(t)));

            const idxId = findIdx(['證券代號', '股票代號', '代號']);
            const idxName = findIdx(['證券名稱', '股票名稱', '名稱']);
            const idxVol = findIdx(['成交股數', '成交量']);
            const idxTo = findIdx(['成交筆數']);
            const idxMoney = findIdx(['成交金額']);
            const idxOpen = findIdx(['開盤價', '開盤']);
            const idxMax = findIdx(['最高價', '最高']);
            const idxMin = findIdx(['最低價', '最低']);
            const idxClose = findIdx(['收盤價', '收盤']);
            const idxSign = findIdx(['漲跌(+/-)', '漲跌']);
            const idxDiff = findIdx(['漲跌價差', '價差']);

            return quotesIn.map((row: string[]) => {
                if (idxId === -1 || idxClose === -1) return null;

                const close = parseNum(row[idxClose]);
                if (close === 0) return null;

                let diff = idxDiff !== -1 ? parseNum(row[idxDiff]) : 0;
                if (idxSign !== -1 && row[idxSign] && row[idxSign].includes('-')) diff = -diff;

                return {
                    stock_id: row[idxId],
                    stock_name: idxName !== -1 ? row[idxName] : '',
                    date: finalDate,
                    Trading_Volume: idxVol !== -1 ? parseNum(row[idxVol]) : 0,
                    Trading_turnover: idxTo !== -1 ? parseNum(row[idxTo]) : 0,
                    Trading_money: idxMoney !== -1 ? parseNum(row[idxMoney]) : 0,
                    open: idxOpen !== -1 ? parseNum(row[idxOpen]) : 0,
                    max: idxMax !== -1 ? parseNum(row[idxMax]) : 0,
                    min: idxMin !== -1 ? parseNum(row[idxMin]) : 0,
                    close: close,
                    spread: diff,
                };
            }).filter(Boolean) as StockData[];

        } catch (error: any) {
            console.error('Failed to fetch TWSE data:', error.message);
            throw error; // Bubble up
        }
    },

    /**
     * Get TPEX (OTC) Daily Quotes
     * URL: https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&d={rocDate}&se=EW&t=D
     */
    getTpexDailyQuotes: async (dateStr?: string): Promise<StockData[]> => {
        try {
            // dateStr: yyyyMMdd
            let qDate = '';
            if (dateStr) {
                const y = parseInt(dateStr.slice(0, 4)) - 1911;
                const m = dateStr.slice(4, 6);
                const d = dateStr.slice(6, 8);
                qDate = `${y}/${m}/${d}`;
            }

            const url = `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&d=${qDate}&se=EW&t=D`;
            const res = await axios.get<TpexResponse>(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!res.data.aaData) {
                // TPEX often returns empty aaData on holidays without error status
                return [];
            }

            const date = ExchangeClient.convertRocDateToWestern(res.data.stk_date);

            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' || clean === '除權息' || clean === '除息' || clean === '除權' ? 0 : parseFloat(clean);
            };

            return res.data.aaData.map(row => ({
                stock_id: row[0],
                stock_name: row[1],
                date: date,
                close: parseNum(row[2]),
                spread: parseNum(row[3]),
                open: parseNum(row[4]),
                max: parseNum(row[5]),
                min: parseNum(row[6]),
                Trading_Volume: parseNum(row[7]),
                Trading_money: parseNum(row[8]),
                Trading_turnover: parseNum(row[9]),
            })).filter(s => s.close > 0 && s.stock_id.length === 4);

        } catch (error: any) {
            console.error('Failed to fetch TPEX data:', error.message);
            throw error; // Bubble up
        }
    },

    /**
     * Get All Market Quotes (TWSE + TPEX)
     * dateStr: yyyyMMdd (optional)
     */
    getAllMarketQuotes: async (dateStr?: string): Promise<StockData[]> => {
        console.log(`Fetching TWSE & TPEX data for date: ${dateStr || 'Latest'}...`);

        // Use allSettled to prevent one failing source from killing the scan
        const results = await Promise.allSettled([
            ExchangeClient.getTwseDailyQuotes(dateStr),
            ExchangeClient.getTpexDailyQuotes(dateStr)
        ]);

        const twse = results[0].status === 'fulfilled' ? results[0].value : [];
        const tpex = results[1].status === 'fulfilled' ? results[1].value : [];

        if (results[0].status === 'rejected') console.error('TWSE Fetch Error:', results[0].reason?.message);
        if (results[1].status === 'rejected') console.error('TPEX Fetch Error:', results[1].reason?.message);

        console.log(`Fetched Summary: TWSE ${twse.length}, TPEX ${tpex.length}`);
        return [...twse, ...tpex];
    },

    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        // Fallback: Fetch last 60 days history from TWSE/TPEX
        const now = new Date();
        const months = [0, 1, 2].map(i => {
            const d = new Date();
            d.setMonth(now.getMonth() - i);
            return d;
        });

        const fetchTwseMonth = async (date: Date) => {
            const ds = date.toISOString().slice(0, 10).replace(/-/g, '');
            const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ds}&stockNo=${stockId}&response=json`;
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (res.data.stat !== 'OK') return [];
            return res.data.data.map((row: any) => ({
                date: ExchangeClient.convertRocDateToWestern(row[0]),
                stock_id: stockId,
                stock_name: '', // Info not in history
                Trading_Volume: parseInt(row[1].replace(/,/g, '')),
                Trading_money: parseInt(row[2].replace(/,/g, '')),
                open: parseFloat(row[3].replace(/,/g, '')),
                max: parseFloat(row[4].replace(/,/g, '')),
                min: parseFloat(row[5].replace(/,/g, '')),
                close: parseFloat(row[6].replace(/,/g, '')),
                spread: parseFloat(row[7].replace(/X/g, '')),
                Trading_turnover: parseInt(row[8].replace(/,/g, ''))
            }));
        };

        const fetchTpexMonth = async (date: Date) => {
            const rocYear = date.getFullYear() - 1911;
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/stk_43_result.php?l=zh-tw&d=${rocYear}/${month}&stkno=${stockId}`;
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.data.stkData) return [];
            return res.data.stkData.map((row: any) => ({
                date: ExchangeClient.convertRocDateToWestern(row[0]),
                stock_id: stockId,
                stock_name: '',
                Trading_Volume: parseInt(row[1].replace(/,/g, '')) * 1000,
                Trading_money: parseInt(row[2].replace(/,/g, '')) * 1000,
                open: parseFloat(row[3].replace(/,/g, '')),
                max: parseFloat(row[4].replace(/,/g, '')),
                min: parseFloat(row[5].replace(/,/g, '')),
                close: parseFloat(row[6].replace(/,/g, '')),
                spread: parseFloat(row[7].replace(/,/g, '')),
                Trading_turnover: parseInt(row[8].replace(/,/g, ''))
            }));
        };

        try {
            let results: StockData[] = [];
            for (const m of months) {
                const data = await fetchTwseMonth(m);
                results = [...data, ...results];
            }
            if (results.length > 0) return results.sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) { }

        try {
            let results: StockData[] = [];
            for (const m of months) {
                const data = await fetchTpexMonth(m);
                results = [...data, ...results];
            }
            if (results.length > 0) return results.sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) { }

        return [];
    }
};
