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
     * URL: https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json
     */
    getTwseDailyQuotes: async (): Promise<StockData[]> => {
        try {
            const url = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json';
            const res = await axios.get<TwseResponse>(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (res.data.stat !== 'OK') {
                console.error('TWSE API Error:', res.data.stat);
                return [];
            }

            const date = ExchangeClient.convertRocDateToWestern(res.data.date); // 113/xx/xx -> 2024-xx-xx

            // TWSE Data Structure:
            // "0": "證券代號", "1": "證券名稱", "2": "成交股數", "3": "成交金額", "4": "開盤價",
            // "5": "最高價", "6": "最低價", "7": "收盤價", "8": "漲跌價差", "9": "成交筆數"

            // Helper to parse numbers with commas
            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' ? 0 : parseFloat(clean);
            };

            return res.data.data.map(row => ({
                stock_id: row[0],
                stock_name: row[1],
                date: date,
                Trading_Volume: parseNum(row[2]), // shares
                Trading_money: parseNum(row[3]),
                open: parseNum(row[4]),
                max: parseNum(row[5]),
                min: parseNum(row[6]),
                close: parseNum(row[7]),
                spread: parseNum(row[8]), // This is absolute change, direction needs check but usually just diff
                Trading_turnover: parseNum(row[9]),
            })).filter(s => s.close > 0); // Filter out invalid stocks

        } catch (error) {
            console.error('Failed to fetch TWSE data:', error);
            return [];
        }
    },

    /**
     * Get TPEX (OTC) Daily Quotes
     * URL: https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&d={rocDate}&se=EW&t=D
     */
    getTpexDailyQuotes: async (): Promise<StockData[]> => {
        try {
            const url = 'https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no14/stk_orderby_result.php?l=zh-tw&d=&se=EW&t=D';
            const res = await axios.get<TpexResponse>(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!res.data.aaData) {
                console.error('TPEX API Error: No aaData');
                return [];
            }

            const date = ExchangeClient.convertRocDateToWestern(res.data.stk_date);

            // TPEX Data Structure (aaData):
            // "0": "代號", "1": "名稱", "2": "收盤", "3": "漲跌", "4": "開盤", 
            // "5": "最高", "6": "最低", "7": "成交股數", "8": "成交金額", "9": "成交筆數" ...

            const parseNum = (val: string) => {
                const clean = val.replace(/,/g, '');
                return clean === '--' || clean === '---' || clean === '除權息' || clean === '除息' || clean === '除權' ? 0 : parseFloat(clean);
            };

            return res.data.aaData.map(row => ({
                stock_id: row[0],
                stock_name: row[1],
                date: date,
                close: parseNum(row[2]),
                spread: parseNum(row[3]), // TPEX might have symbols indicating up/down? usually it's just number
                open: parseNum(row[4]),
                max: parseNum(row[5]),
                min: parseNum(row[6]),
                Trading_Volume: parseNum(row[7]),
                Trading_money: parseNum(row[8]),
                Trading_turnover: parseNum(row[9]),
            })).filter(s => s.close > 0 && s.stock_id.length === 4); // Filter out warrants (6 chars) usually

        } catch (error) {
            console.error('Failed to fetch TPEX data:', error);
            return [];
        }
    },

    /**
     * Get All Market Quotes (TWSE + TPEX)
     */
    getAllMarketQuotes: async (): Promise<StockData[]> => {
        console.log('Fetching TWSE & TPEX data...');
        const [twse, tpex] = await Promise.all([
            ExchangeClient.getTwseDailyQuotes(),
            ExchangeClient.getTpexDailyQuotes()
        ]);

        console.log(`Fetched: TWSE ${twse.length}, TPEX ${tpex.length}`);
        return [...twse, ...tpex];
    }
};
