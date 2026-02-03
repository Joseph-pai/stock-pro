export const MarketTypeCodes = {
    ALL: 'ALL',
    TWSE: 'TWSE',
    TPEX: 'TPEX'
} as const;

export type MarketType = keyof typeof MarketTypeCodes;

export const TAIWAN_SECTORS = {
    '00': '全部類股',
    '01': '水泥工業',
    '02': '食品工業',
    '03': '塑膠工業',
    '04': '紡織纖維',
    '05': '電機機械',
    '06': '電器電纜',
    '07': '化學工業',
    '08': '玻璃陶瓷',
    '09': '造紙工業',
    '10': '鋼鐵工業',
    '11': '橡膠工業',
    '12': '汽車工業',
    '13': '電子工業',
    '14': '建材營造',
    '15': '航運業',
    '16': '觀光餐旅',
    '17': '金融保險',
    '18': '貿易百貨',
    '19': '綜合',
    '20': '其他',
    '21': '化學',
    '22': '生技醫療',
    '23': '油電燃氣',
    '24': '半導體',
    '25': '電腦週邊',
    '26': '光電業',
    '27': '通信網路',
    '28': '電子零組件',
    '29': '電子通路',
    '30': '資訊服務',
    '31': '其他電子',
};

export function getMarketName(market: MarketType): string {
    if (market === 'TWSE') return '上市';
    if (market === 'TPEX') return '上櫃';
    return '全市場';
}

export function getSectorName(code: string): string {
    return TAIWAN_SECTORS[code as keyof typeof TAIWAN_SECTORS] || '全部類股';
}
