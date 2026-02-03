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
        const parts = rocDate.split('/');
        if (parts.length !== 3) return rocDate;

        const year = parseInt(parts[0], 10) + 1911;
        return `${year}-${parts[1]}-${parts[2]}`;
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

            // MI_INDEX response structure is complex. 'data9' usually contains the stock quotes.
            // But sometimes it's data5, data8 etc depending on the index inclusions. 
            // We look for the array that has fields starting with ["證券代號", "證券名稱"...]
            const typeKey = Object.keys(res.data).find(k =>
                Array.isArray(res.data[k]) &&
                res.data.fields9 &&
                k === 'data9' // data9 is usually "ALLBUT0999" stocks
            );

            const quotesIn = res.data[typeKey || 'data9'] || []; // Fallback

            // Re-parse date from response if possible, or use requested
            const finalDate = ExchangeClient.convertRocDateToWestern(res.data.date) ||
                `${qDate.slice(0, 4)}-${qDate.slice(4, 6)}-${qDate.slice(6, 8)}`;

            // TWSE MI_INDEX Structure (usually):
            // 0: 代號, 1: 名稱, 2: 成交股數, 3: 成交筆數, 4: 成交金額, 5: 開盤, 6: 最高, 7: 最低, 8: 收盤...
            // Note: Index might differ from STOCK_DAY_ALL!
            // Let's rely on standard MI_INDEX indices for "ALLBUT0999"

            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return quotesIn.map((row: string[]) => ({
                stock_id: row[0],
                stock_name: row[1],
                date: finalDate,
                Trading_Volume: parseNum(row[2]), // shares
                Trading_turnover: parseNum(row[3]), // transaction count
                Trading_money: parseNum(row[4]),
                open: parseNum(row[5]),
                max: parseNum(row[6]),
                min: parseNum(row[7]),
                close: parseNum(row[8]),
                spread: row[9].includes('-') ? -parseNum(row[10]) : parseNum(row[10]), // +/- sign is separate in row[9] usually
            })).filter((s: StockData) => s.close > 0);

        } catch (error) {
            console.error('Failed to fetch TWSE data:', error);
            return [];
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

        } catch (error) {
            console.error('Failed to fetch TPEX data:', error);
            return [];
        }
    },

    /**
     * Get All Market Quotes (TWSE + TPEX)
     * dateStr: yyyyMMdd (optional)
     */
    getAllMarketQuotes: async (dateStr?: string): Promise<StockData[]> => {
        console.log(`Fetching TWSE & TPEX data for date: ${dateStr || 'Latest'}...`);
        const [twse, tpex] = await Promise.all([
            ExchangeClient.getTwseDailyQuotes(dateStr),
            ExchangeClient.getTpexDailyQuotes(dateStr)
        ]);

        console.log(`Fetched: TWSE ${twse.length}, TPEX ${tpex.length}`);
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
