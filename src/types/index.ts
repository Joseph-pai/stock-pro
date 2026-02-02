export interface StockData {
    stock_id: string;
    stock_name: string;
    date: string;
    open: number;
    max: number;
    min: number;
    close: number;
    Trading_Volume: number; // shares
    Trading_money: number;
    spread: number;
    Trading_turnover: number;
}

export interface InstitutionalData {
    stock_id: string;
    stock_name: string;
    date: string;
    buy: number;
    sell: number;
    name: "Foreign_Investor" | "Investment_Trust" | "Dealer_Self" | "Dealer_Hedging";
}

export interface FinMindResponse<T> {
    msg: string;
    status: number;
    data: T[];
}

export interface AnalysisResult {
    stock_id: string;
    stock_name: string;
    close: number;
    change_percent: number; // (close - prevClose) / prevClose

    // Breakout Factors
    score: number;
    v_ratio: number;           // Volume / MA20_Volume
    is_ma_aligned: boolean;    // MA5/10/20 squeezed
    is_ma_breakout: boolean;   // Price > Max(MA)
    consecutive_buy: number;   // Investment Trust buy streak

    // Expert System
    poc: number;               // Point of Control Price
    verdict: string;           // Human readable analysis (e.g. "Bullish Breakout")

    // Flags
    tags: ('VOLUME_EXPLOSION' | 'MA_SQUEEZE' | 'INST_BUYING' | 'BREAKOUT' | 'LIMITED_SCAN')[];

    // Detailed History (Optional, for Charting)
    history?: StockData[];
}

export interface StockCandle {
    time: string; // 'yyyy-mm-dd'
    open: number;
    high: number;
    low: number;
    close: number;
    value?: number; // volume
    color?: string;
}
