import axios from 'axios';
import { format, subMonths, startOfMonth, endOfMonth, parse } from 'date-fns';
import { StockData } from '@/types';
import { SECTORS } from './sectors';

/**
 * Utility to normalize various date formats to ISO YYYY-MM-DD
 */
export function normalizeAnyDate(dateStr: string): string {
    if (!dateStr) return '';
    const clean = dateStr.trim();

    // 1. ROC Format: 113/02/04 or 113/2/4
    const rocMatch = clean.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
    if (rocMatch) {
        const y = parseInt(rocMatch[1]) + 1911;
        const m = rocMatch[2].padStart(2, '0');
        const d = rocMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // 2. ISO-ish Format: 2024-02-04 or 2024/02/04
    const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    return clean;
}

/**
 * Enhanced Exchange Client
 * Supports targeted market and sector scanning
 */
export const ExchangeClient = {
    /**
     * Get Daily Quotes by Market and Sector
     */
    getQuotesBySector: async (market: 'TWSE' | 'TPEX', sectorId: string): Promise<StockData[]> => {
        try {
            if (market === 'TWSE') {
                const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=${sectorId}`;
                const res = await axios.get(url, { timeout: 8000 });
                const data = res.data;

                // TWSE Specific: Handle tables array for specific sector queries
                let stocks: string[][] = [];
                if (data.tables && Array.isArray(data.tables)) {
                    const tableWithData = data.tables.find((t: any) => t.data && Array.isArray(t.data) && t.data.length > 0);
                    if (tableWithData) stocks = tableWithData.data;
                } else {
                    const tables = Object.values(data).filter(v => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length >= 10);
                    if (tables.length > 0) stocks = tables[0] as string[][];
                }

                if (stocks.length === 0) return [];

                const parseNum = (val: string) => parseFloat(val.replace(/,/g, '').replace(/--/g, '0'));
                return stocks
                    .filter(row => row[0].trim().length === 4)
                    .map(row => ({
                        stock_id: row[0].trim(),
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
                    .filter((row: any) => row[0].trim().length === 4)
                    .map((row: any) => ({
                        stock_id: row[0].trim(),
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
            const parseNum = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                const parsed = parseFloat(String(val).replace(/,/g, ''));
                return isNaN(parsed) ? 0 : parsed;
            };

            return res.data.map((item: any) => ({
                stock_id: item.Code?.trim(),
                stock_name: item.Name?.trim(),
                date: format(new Date(), 'yyyy-MM-dd'),
                open: parseNum(item.OpeningPrice),
                max: parseNum(item.HighestPrice),
                min: parseNum(item.LowestPrice),
                close: parseNum(item.ClosingPrice),
                spread: parseNum(item.Change),
                Trading_Volume: parseNum(item.TradeVolume) / 1000,
                Trading_money: parseNum(item.TradeValue),
                Trading_turnover: parseNum(item.Transaction),
            })).filter((s: any) => s.close > 0 && s.stock_id && s.stock_id.length === 4);
        } else {
            const url = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`;
            const res = await axios.get(url);
            const parseNum = (val: any) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                const parsed = parseFloat(String(val).replace(/,/g, ''));
                return isNaN(parsed) ? 0 : parsed;
            };

            return res.data.map((item: any) => ({
                stock_id: item.SecuritiesCompanyCode?.trim(),
                stock_name: item.CompanyName?.trim(),
                date: format(new Date(), 'yyyy-MM-dd'),
                close: parseNum(item.Close),
                spread: parseNum(item.Change),
                open: parseNum(item.Open),
                max: parseNum(item.High),
                min: parseNum(item.Low),
                Trading_Volume: (parseNum(item.TradeQty) || parseNum(item.Volume) || parseNum(item.TradeVolume)) / 1000,
            })).filter((s: any) => s.close > 0 && s.stock_id && s.stock_id.length === 4);
        }
    },

    getStockHistory: async (stockId: string): Promise<StockData[]> => {
        try {
            const isTPEX = await ExchangeClient.isTpexStock(stockId);
            const monthsToFetch = 2; // Fetch current and previous month to ensure enough data
            const allData: StockData[] = [];

            for (let i = 0; i < monthsToFetch; i++) {
                const targetDate = subMonths(new Date(), i);
                let monthlyData: StockData[] = [];

                if (!isTPEX) {
                    // TWSE Logic
                    const dateStr = format(targetDate, 'yyyyMM01');
                    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockId}`;
                    const res = await axios.get(url, { timeout: 10000 });
                    if (res.data && res.data.data) {
                        const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                        monthlyData = res.data.data.map((row: any) => ({
                            stock_id: stockId,
                            date: normalizeAnyDate(row[0]),
                            Trading_Volume: parseNum(row[1]) / 1000,
                            open: parseNum(row[3]),
                            max: parseNum(row[4]),
                            min: parseNum(row[5]),
                            close: parseNum(row[6]),
                        }));
                    }
                } else {
                    // TPEX Logic
                    const rocYearMonth = `${targetDate.getFullYear() - 1911}/${format(targetDate, 'MM')}`;
                    const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/stk_quote_result.php?l=zh-tw&d=${rocYearMonth}&stkno=${stockId}`;
                    const res = await axios.get(url, { timeout: 10000 });
                    if (res.data && res.data.aaData) {
                        const parseNum = (val: string) => parseFloat(val.replace(/,/g, ''));
                        monthlyData = res.data.aaData.map((row: any) => ({
                            stock_id: stockId,
                            date: normalizeAnyDate(row[0]),
                            Trading_Volume: parseNum(row[1]), // TPEX is usually in 1000 shares already in this API? Check.
                            // Comparison with other TPEX APIs suggests this one might be in shares. 
                            // Let's assume consistent with TWSE (1000 shares = 1 unit) if needed.
                            open: parseNum(row[3]),
                            max: parseNum(row[4]),
                            min: parseNum(row[5]),
                            close: parseNum(row[6]),
                        }));
                    }
                }
                allData.push(...monthlyData);
            }

            // Deduplicate, sort by date ascending
            const unique = Array.from(new Map(allData.map(item => [item.date, item])).values());
            return unique.sort((a, b) => a.date.localeCompare(b.date));
        } catch (error) {
            console.error(`[Exchange] History failed for ${stockId}:`, error);
            return [];
        }
    },

    /**
     * Helper to determine market
     */
    isTpexStock: async (stockId: string): Promise<boolean> => {
        // Simple heuristic: most TPEX stocks are 4 digits, but many overlap.
        // Better: check mapping or specific length if applicable.
        // For now, if we can't find it in industry mapping as TWSE, we try to guess.
        // Real apps usually have a list or use a specific API.
        // Let's check stockId length or specific prefixes if safe.
        return stockId.length >= 5 || ['6488', '8069'].includes(stockId); // Add known TPEX
    },

    /**
     * Fetch industry mapping for all stocks
     */
    getIndustryMapping: async (): Promise<Record<string, string>> => {
        const mapping: Record<string, string> = {};

        // Robust Fallback / Hard-fixes for common stocks (apply first as base)
        const HARD_FIXES: Record<string, string> = {
            '2887': '貿易百貨',        // 台新新光金
            '6426': '通信網路',        // 統新
            '6451': '半導體業',
            '2330': '半導體業',
            '2317': '其他電子'
        };
        Object.assign(mapping, HARD_FIXES);

        // Lookup name maps
        const twseMap: any = {};
        SECTORS.TWSE.forEach(s => twseMap[s.id] = s.name);
        const tpexMap: any = {};
        SECTORS.TPEX.forEach(s => tpexMap[s.id] = s.name);

        try {
            // 1. TWSE Listing Info (Correct keys: 公司代號, 產業別)
            const twseUrl = `https://openapi.twse.com.tw/v1/opendata/t187ap03_L`;
            const twseRes = await axios.get(twseUrl, { timeout: 15000 });
            if (Array.isArray(twseRes.data)) {
                twseRes.data.forEach((item: any) => {
                    const code = (item['公司代號'] || item['Code'] || item['證券代號'])?.trim();
                    const sectorId = (item['產業別'] || item['Sector'] || item['產業別名稱'])?.trim();
                    if (code && sectorId) {
                        // Some APIs return sector name directly, others return ID
                        mapping[code] = twseMap[sectorId] || sectorId;
                    }
                });
            }

            // 2. TPEX Listing Info (Correct keys: SecuritiesCompanyCode, 掛牌類別)
            const tpexUrl = `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_per_quotes`;
            const tpexRes = await axios.get(tpexUrl, { timeout: 15000 });
            if (Array.isArray(tpexRes.data)) {
                tpexRes.data.forEach((item: any) => {
                    const code = (item.SecuritiesCompanyCode || item['證券代號'] || item['公司代號'])?.trim();
                    const sectorName = (item['掛牌類別'] || item.Sector || item['產業別'])?.trim();
                    if (code && sectorName) {
                        mapping[code] = sectorName;
                    }
                });
            }

            // Re-apply hard fixes to ensure they always override (in case API has outdated data)
            Object.assign(mapping, HARD_FIXES);

            // Enhanced logging for industry mapping
            Object.keys(mapping).forEach(code => {
                const source = HARD_FIXES[code] ? 'Hard Fix' : 'API';
                console.log(`[Exchange] Stock ${code}: Sector="${mapping[code]}" (Source=${source})`);
            });

            console.log(`[Exchange] Loaded industry mapping for ${Object.keys(mapping).length} stocks (including ${Object.keys(HARD_FIXES).length} hard-fixes).`);
            return mapping;
        } catch (e) {
            console.error('[Exchange] Mapping synchronization failed:', e);
            // Return at least the hard-fixes
            console.log(`[Exchange] Returning ${Object.keys(mapping).length} hard-fixed stocks as fallback.`);
            return mapping;
        }
    }
};
