import { FinMindClient, } from '@/lib/finmind';
import { FinMindExtras } from '@/lib/finmind';
import { ExchangeClient, normalizeAnyDate } from '@/lib/exchange';
import { evaluateStock, calculateVRatio, checkMaConstrict, checkVolumeIncreasing, checkGapUp, checkMarginSqueezeSignal } from './engine';
import { AnalysisResult, StockData } from '@/types';
import { format, subDays } from 'date-fns';
import { calculateSMA } from './indicators';

/**
 * Normalize date format: handles both ROC (民國 RRRY/MM/DD) and ISO (YYYY-MM-DD) formats
 * @param dateStr - Date string in ROC or ISO format
 * @returns ISO formatted date string (YYYY-MM-DD)
 */
function normalizeDate(dateStr: string): string {
    if (!dateStr) return dateStr;

    // Try ISO format first (YYYY-MM-DD)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
    }

    // Try ROC format (RRRY/MM/DD or RRR/MM/DD)
    const rocMatch = dateStr.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
    if (rocMatch) {
        const rocYear = parseInt(rocMatch[1]);
        const month = rocMatch[2];
        const day = rocMatch[3];
        const gregorianYear = rocYear + 1911;
        return `${gregorianYear}-${month}-${day}`;
    }

    // Return as-is if format unrecognized
    console.warn(`[normalizeDate] Unrecognized date format: ${dateStr}`);
    return dateStr;
}

export const ScannerService = {
    /**
     * Stage 1: Discovery (兩階段篩選 - 避免超時)
     * 
     * Phase 1: 快速預篩（使用快照數據）
     * - 成交量 > 2000 股
     * - 紅 K 線（收盤 > 開盤）
     * - 按成交量排序，取前 200 名
     * 
     * Phase 2: 嚴格篩選（獲取完整歷史）
     * - 量能激增 3.5x
     * - 均線糾結 <2%
     * - 突破 3%
     * 
     * 寧缺毋濫：返回所有符合條件的股票（可能 0-15 支）
     */
    scanMarket: async (settings?: { volumeRatio: number, maConstrict: number, breakoutPercent: number }): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log('[Scanner] Stage 1: Discovery - 兩階段篩選（快速預篩 + 嚴格驗證）...');

        // Load industry mapping
        const industryMapping = await ExchangeClient.getIndustryMapping();

        // Phase 1: 快速預篩（使用快照數據）
        const snapshot = await ExchangeClient.getAllMarketQuotes('TWSE'); // Add default market to fix build
        const t1 = Date.now();

        if (snapshot.length === 0) {
            throw new Error('Market data not found. Please try again later.');
        }

        console.log(`[Scanner] Phase 1: Snapshot fetched - ${snapshot.length} stocks in ${t1 - t0}ms`);

        // 預篩選：成交量 > 2000 且紅 K 線
        const preFiltered = snapshot
            .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
            .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
            .slice(0, 200); // 只取前 200 名，避免超時

        const t2 = Date.now();
        console.log(`[Scanner] Phase 1: Pre-filtered to ${preFiltered.length} candidates in ${t2 - t1}ms`);

        // Phase 2: 對候選股票進行嚴格篩選（獲取完整歷史）
        const candidates: AnalysisResult[] = [];
        let processedCount = 0;
        let errorCount = 0;

        // 批次處理，每次 20 支（降低批次大小以避免超時）
        const batchSize = 20;
        for (let i = 0; i < preFiltered.length; i += batchSize) {
            const batch = preFiltered.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(async (stock) => {
                    try {
                        // 獲取完整歷史數據（30 天）
                        const history = await ExchangeClient.getStockHistory(stock.stock_id);

                        if (history.length < 20) {
                            return null;
                        }

                        // 計算 MA5 和 MA20
                        const closes = history.map(s => s.close);
                        const ma5 = calculateSMA(closes.slice(-5), 5);
                        const ma20 = calculateSMA(closes.slice(-20), 20);

                        if (!ma5 || !ma20) return null;

                        // 計算量能倍數 (優化演算法：3日平均 vs 45日基線)
                        const volumes = history.map(s => s.Trading_Volume);
                        const vRatio = calculateVRatio(volumes);

                        const volThreshold = settings?.volumeRatio || 3.5;
                        const squeezeThreshold = (settings?.maConstrict || 2.0) / 100;
                        const breakoutThreshold = (settings?.breakoutPercent || 3.0) / 100;

                        const maData = checkMaConstrict(ma5, ma20, squeezeThreshold);
                        const today = history[history.length - 1];
                        const prevClose = history[history.length - 2].close;
                        // FIXED: Use standard daily change (vs prev close) instead of Day High/Low or Open/Close
                        const changePercent = (today.close - prevClose) / prevClose;
                        // const dailyChange = (today.close - today.open) / today.open; // Deprecated

                        const isBreakout = today.close > Math.max(ma5, ma20) && changePercent >= breakoutThreshold;

                        // 三大信號共振（參考傳入設定或預設值）
                        if (vRatio >= volThreshold && maData.isSqueezing && isBreakout) {
                            console.log(`[Scanner] ✓ Found: ${stock.stock_id} ${stock.stock_name} - V:${vRatio.toFixed(1)}x, MA:${(maData.constrictValue * 100).toFixed(1)}%, Break:${(changePercent * 100).toFixed(1)}%`);

                            const result: AnalysisResult = {
                                stock_id: stock.stock_id,
                                stock_name: stock.stock_name,
                                sector_name: industryMapping[stock.stock_id.trim()] || '其他',
                                close: today.close,
                                change_percent: (today.close - history[history.length - 2].close) / history[history.length - 2].close,
                                score: 0,
                                v_ratio: parseFloat(vRatio.toFixed(2)),
                                is_ma_aligned: maData.isSqueezing,
                                is_ma_breakout: isBreakout,
                                consecutive_buy: 0,
                                poc: today.close,
                                verdict: '三大信號共振 - 爆發前兆',
                                tags: ['DISCOVERY', 'VOLUME_EXPLOSION', 'MA_SQUEEZE', 'BREAKOUT'],
                                dailyVolumeTrend: volumes.slice(-10),
                                maConstrictValue: maData.constrictValue,
                                today_volume: today.Trading_Volume,
                                volumeIncreasing: checkVolumeIncreasing(volumes)
                            };
                            return result;
                        }

                        return null;
                    } catch (error) {
                        console.warn(`[Scanner] Error processing ${stock.stock_id}:`, error);
                        return null;
                    }
                })
            );

            // 收集結果
            batchResults.forEach(result => {
                processedCount++;
                if (result.status === 'fulfilled' && result.value) {
                    candidates.push(result.value);
                } else if (result.status === 'rejected') {
                    errorCount++;
                }
            });

            console.log(`[Scanner] Phase 2: Progress ${processedCount}/${preFiltered.length} (Found: ${candidates.length})`);
        }

        const t3 = Date.now();

        console.log(`[Scanner] Stage 1 完成：發現 ${candidates.length} 支符合三大信號共振的股票`);
        console.log(`[Scanner] 總耗時: ${t3 - t0}ms (預篩: ${t2 - t1}ms, 深度: ${t3 - t2}ms)`);

        // 按量能倍數排序
        const sorted = candidates.sort((a, b) => b.v_ratio - a.v_ratio);

        return {
            results: sorted,
            timing: {
                snapshot: t1 - t0,
                preFilter: t2 - t1,
                deepAnalysis: t3 - t2,
                total: t3 - t0,
                processed: processedCount,
                errors: errorCount,
                preFilteredCount: preFiltered.length
            }
        };
    },

    /**
     * Stage 2: Filtering (投信連買 + 法人同步 + 量能遞增)
     */
    filterStocks: async (stockIds: string[], settings?: { volumeRatio: number, maConstrict: number, breakoutPercent: number }): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log(`[Scanner] Stage 2: Filtering - 深度篩選 ${stockIds.length} 支股票...`);

        const filtered: AnalysisResult[] = [];

        for (const stockId of stockIds) {
            try {
                const result = await ScannerService.analyzeStock(stockId, settings);
                if (!result) continue;

                // Stage 2 篩選條件
                const hasInstBuying = result.consecutive_buy >= 3;
                const hasVolumeIncreasing = result.volumeIncreasing === true;
                const isAboveMA = result.is_ma_breakout;

                // 綜合評分 > 0.4 或滿足任意兩個條件
                const passCount = [hasInstBuying, hasVolumeIncreasing, isAboveMA].filter(Boolean).length;

                if (result.score > 0.4 || passCount >= 2) {
                    filtered.push(result);
                }
            } catch (error) {
                console.warn(`[Scanner] Error filtering ${stockId}:`, error);
            }
        }

        // 按綜合評分排序，取前 30 名
        const top30 = filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, 30);

        const t1 = Date.now();
        console.log(`[Scanner] Stage 2 完成：篩選出 ${top30.length} 支強勢股`);

        return {
            results: top30,
            timing: { total: t1 - t0 }
        };
    },

    /**
     * Stage 3: Individual Analysis (個股完整分析)
     * Optimized with Redis Raw Data Caching
     */
    analyzeStock: async (stockId: string, settings?: { volumeRatio: number, maConstrict: number, breakoutPercent: number }, stockName?: string): Promise<AnalysisResult | null> => {
        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const redis = (await import('@/lib/redis')).redis;

            // 1. Fetch Price History (Cache: 4h)
            let prices: StockData[] = [];
            const priceCacheKey = `tsbs:raw:hist:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(priceCacheKey);
                if (cached) prices = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (price):', e); }

            if (prices.length === 0) {
                try {
                    const endDate = todayStr;
                    const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
                    prices = await FinMindClient.getDailyStats({ stockId, startDate, endDate });
                } catch (e) {
                    console.warn(`[Analyze] FinMind price failed for ${stockId}, fallback to Exchange...`);
                    prices = await ExchangeClient.getStockHistory(stockId);
                }
                if (prices.length > 0) {
                    try { await redis.set(priceCacheKey, JSON.stringify(prices), 'EX', 14400); } catch (e) { }
                }
            }

            // 2. Fetch Institutional Flow (Cache: 4h)
            let insts: any[] = [];
            const instCacheKey = `tsbs:raw:inst:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(instCacheKey);
                if (cached) insts = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (inst):', e); }

            if (insts.length === 0) {
                try {
                    insts = await FinMindClient.getInstitutional({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate: todayStr
                    });
                    if (insts.length > 0) {
                        try { await redis.set(instCacheKey, JSON.stringify(insts), 'EX', 14400); } catch (e) { }
                    }
                } catch (e) { console.warn(`[Analyze] Inst fetch failed for ${stockId}`); }
            }

            // 3. Fetch Monthly Revenue (Cache: 12h)
            let rev: any[] = [];
            const revCacheKey = `tsbs:raw:rev:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(revCacheKey);
                if (cached) rev = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (rev):', e); }

            if (rev.length === 0) {
                try {
                    const revStart = format(subDays(new Date(), 400), 'yyyy-MM-dd');
                    rev = await FinMindExtras.getMonthlyRevenue({ stockId, startDate: revStart, endDate: todayStr });
                    if (rev.length > 0) {
                        try { await redis.set(revCacheKey, JSON.stringify(rev), 'EX', 43200); } catch (e) { }
                    }
                } catch (e) { console.warn(`[Analyze] Revenue fetch failed for ${stockId}`); }
            }

            // 2.5 Fetch Margin Trading Data (Cache: 4h)
            let marginData: any[] = [];
            const marginCacheKey = `tsbs:raw:margin:${stockId}:${todayStr}`;
            try {
                const cached = await redis.get(marginCacheKey);
                if (cached) marginData = JSON.parse(cached);
            } catch (e) { console.warn('Redis read error (margin):', e); }

            if (marginData.length === 0) {
                try {
                    marginData = await FinMindExtras.getMarginTrading({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate: todayStr
                    });
                    if (marginData.length > 0) {
                        try { await redis.set(marginCacheKey, JSON.stringify(marginData), 'EX', 14400); } catch (e) { }
                    }
                } catch (e) { console.warn(`[Analyze] Margin fetch failed for ${stockId}`); }
            }

            if (prices.length < 3) {
                console.warn(`[Analyze] Insufficient data for ${stockId} (${prices.length} days found)`);
                return null;
            }

            // Load industry mapping (cached in exchange client usually, but here we can just use the memory map)
            const industryMapping = await ExchangeClient.getIndustryMapping();

            const result = evaluateStock(prices, settings);
            if (!result) return null;

            const today = prices[prices.length - 1];

            // Analyze institutional flow (投信連買)
            let consecutiveBuy = 0;
            let instScore = 0;
            try {
                const invTrust = insts.filter((d: any) => d.name === 'Investment_Trust');
                const byDate: Record<string, number> = {};
                invTrust.forEach((row: any) => {
                    const dt = row.date;
                    const net = (row.buy || 0) - (row.sell || 0);
                    byDate[dt] = (byDate[dt] || 0) + net;
                });
                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    if ((byDate[d] || 0) > 0) consecutiveBuy++; else break;
                }
                instScore = Math.min(consecutiveBuy / 5, 1) * 30;
            } catch (e) {
                consecutiveBuy = 0;
                instScore = 0;
            }

            // Fundamental check
            let revenueSupport = false;
            let revenueBonusPoints = 0;
            try {
                if (Array.isArray(rev) && rev.length >= 2) {
                    const getRevenue = (r: any) => r.revenue || r.monthly_revenue || r.MonthlyRevenue || r['營業收入'] || r['Revenue'] || 0;
                    const normalized = rev.map((r: any) => ({
                        ...r,
                        date: r.date.includes('/') ? normalizeAnyDate(r.date) : r.date
                    }));
                    const sorted = [...normalized].sort((a: any, b: any) => a.date.localeCompare(b.date));
                    const latest = sorted[sorted.length - 1];
                    const latestRev = Number(getRevenue(latest)) || 0;

                    let momScore = 0;
                    if (sorted.length >= 3) {
                        const prev = sorted[sorted.length - 2];
                        const prevprev = sorted[sorted.length - 3];
                        const revPrev = Number(getRevenue(prev)) || 0;
                        const revPrevPrev = Number(getRevenue(prevprev)) || 0;
                        const mom1 = revPrev > 0 ? (latestRev - revPrev) / revPrev : 0;
                        const mom2 = revPrevPrev > 0 ? (revPrev - revPrevPrev) / revPrevPrev : 0;
                        const pos1 = Math.max(0, mom1);
                        const pos2 = Math.max(0, mom2);
                        momScore = Math.min(1, ((pos1 > 0 ? Math.min(pos1 / 0.2, 1) : 0) + (pos2 > 0 ? Math.min(pos2 / 0.2, 1) : 0)) / 2);
                    }

                    let yoyScore = 0;
                    if (sorted.length >= 13) {
                        const dt = new Date(latest.date);
                        const prevYear = new Date(dt.getFullYear() - 1, dt.getMonth(), dt.getDate());
                        const yearKey = `${prevYear.getFullYear()}-${String(prevYear.getMonth() + 1).padStart(2, '0')}`;
                        const match = sorted.find((r: any) => r.date.startsWith(yearKey));
                        if (match) {
                            const revYear = Number(getRevenue(match)) || 0;
                            const yoy = revYear > 0 ? (latestRev - revYear) / revYear : 0;
                            yoyScore = Math.max(0, Math.min(1, yoy / 0.2));
                        }
                    }

                    // 新高判斷：最新營收是否為近 6 個月最高
                    let isRevenueNewHigh = false;
                    if (sorted.length >= 6) {
                        const recent6 = sorted.slice(-6).map((r: any) => Number(getRevenue(r)) || 0);
                        isRevenueNewHigh = latestRev >= Math.max(...recent6) && latestRev > 0;
                        if (isRevenueNewHigh) revenueBonusPoints += 3; // 額外加分
                    }

                    revenueBonusPoints = Math.round((momScore * 5 + yoyScore * 5 + (isRevenueNewHigh ? 3 : 0)) * 100) / 100;
                    revenueSupport = revenueBonusPoints > 0.5;
                }
            } catch (e) { }

            // Analyze margin squeeze signal
            const marginSignal = checkMarginSqueezeSignal(marginData, prices);
            const marginScore = marginSignal.score * 11; // weight 11

            // Analyze gap-up
            const prevDay = prices[prices.length - 2];
            const gapResult = checkGapUp(today.min, prevDay.max);

            // Detect revenue new high from revenue analysis
            let isRevenueNewHigh = false;
            try {
                if (Array.isArray(rev) && rev.length >= 6) {
                    const getRevenue = (r: any) => r.revenue || r.monthly_revenue || r.MonthlyRevenue || r['營業收入'] || r['Revenue'] || 0;
                    const sorted = [...rev].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
                    const latestRev = Number(getRevenue(sorted[sorted.length - 1])) || 0;
                    const recent6 = sorted.slice(-6).map((r: any) => Number(getRevenue(r)) || 0);
                    isRevenueNewHigh = latestRev >= Math.max(...recent6) && latestRev > 0;
                }
            } catch (e) { }

            // Recompute comprehensive score (5 dimensions: Vol 30, MA 22, Chip 22, Margin 11, Fundamental 15)
            const engineDetails = result.comprehensiveScoreDetails || { volumeScore: 0, maScore: 0, chipScore: 0, total: 0 };
            const normalizedVolumeScore = (engineDetails.volumeScore || 0) * (30 / 40);
            const normalizedMaScore = (engineDetails.maScore || 0) * (22 / 30);
            const normalizedChipScore = Math.min(instScore * (22 / 30), 22);
            const normalizedMarginScore = Math.min(marginScore, 11);
            const normalizedFundamentalBonus = Math.min(revenueBonusPoints * (15 / 13), 15);
            const totalPoints = normalizedVolumeScore + normalizedMaScore + normalizedChipScore + normalizedMarginScore + normalizedFundamentalBonus;
            const finalScore = Math.min(1, Math.max(0, totalPoints / 100));

            const volThreshold = settings?.volumeRatio || 3.5;
            const squeezeThreshold = (settings?.maConstrict || 2.0) / 100;
            const breakoutThreshold = (settings?.breakoutPercent || 3.0) / 100;

            const tags: AnalysisResult['tags'] = ['DISCOVERY'];
            if (result.isBreakout) tags.push('BREAKOUT');
            if (result.maData.isSqueezing) tags.push('MA_SQUEEZE');
            if (result.vRatio >= volThreshold) tags.push('VOLUME_EXPLOSION');
            if (revenueSupport) tags.push('BASIC_SUPPORT');
            if (marginSignal.hasSignal) tags.push('MARGIN_SQUEEZE');
            if (gapResult.isGapUp) tags.push('GAP_UP');
            if (isRevenueNewHigh) tags.push('REVENUE_NEW_HIGH');

            return {
                stock_id: stockId,
                stock_name: stockName || today.stock_name || stockId,
                sector_name: industryMapping[stockId.trim()] || '其他',
                close: today.close,
                change_percent: result.changePercent,
                score: finalScore,
                v_ratio: result.vRatio,
                is_ma_aligned: result.maData.isSqueezing,
                is_ma_breakout: result.isBreakout,
                consecutive_buy: consecutiveBuy,
                poc: today.close,
                verdict: finalScore >= 0.6 ? '高概率爆發候選' : ((result.vRatio >= volThreshold && result.maData.constrictValue <= squeezeThreshold && result.changePercent >= breakoutThreshold) ? '三大信號共振 - 爆發前兆' : '分析完成'),
                tags,
                history: prices,
                maConstrictValue: result.maData.constrictValue,
                today_volume: today.Trading_Volume,
                dailyVolumeTrend: prices.map(p => p.Trading_Volume).slice(-10),
                volumeIncreasing: checkVolumeIncreasing(prices.map(p => p.Trading_Volume)),
                marginSqueezeSignal: marginSignal.hasSignal,
                marginTrend: marginSignal.marginTrend,
                isGapUp: gapResult.isGapUp,
                isRevenueNewHigh,
                comprehensiveScoreDetails: {
                    volumeScore: parseFloat(normalizedVolumeScore.toFixed(2)),
                    maScore: parseFloat(normalizedMaScore.toFixed(2)),
                    chipScore: parseFloat(normalizedChipScore.toFixed(2)),
                    marginScore: parseFloat(normalizedMarginScore.toFixed(2)),
                    fundamentalBonus: parseFloat(normalizedFundamentalBonus.toFixed(2)),
                    total: parseFloat(totalPoints.toFixed(2))
                },
                is_recommended: finalScore >= 0.6 || (result.vRatio >= volThreshold && result.maData.constrictValue <= squeezeThreshold && result.changePercent >= breakoutThreshold),
                analysisHints: {
                    technicalSignals: `V-Ratio 升至 ${result.vRatio.toFixed(1)}x${result.maData.isSqueezing ? ' • 均線高度糾結' : ''}${gapResult.isGapUp ? ` • 跳空缺口 ${(gapResult.gapPercent * 100).toFixed(1)}%` : ''} • 量能激增`,
                    chipSignals: `機構連買 ${consecutiveBuy} 日 • 籌碼集中度高`,
                    fundamentalSignals: revenueBonusPoints > 0 ? `營收環比+${revenueBonusPoints.toFixed(1)}分${isRevenueNewHigh ? ' • 創近6月新高' : ''} • 基本面支撐` : '營收成長動能待觀察',
                    marginSignals: marginSignal.hasSignal ? `融資溫和增加 • 軋空動能醞釀中` : '無融資軋空信號',
                    technical: gapResult.isGapUp ? `跳空缺口 ${(gapResult.gapPercent * 100).toFixed(1)}%` : (result.isBreakout ? '帶量突破' : (result.maData.isSqueezing ? '均線糾結待突破' : '無明顯技術信號')),
                    chips: consecutiveBuy >= 3 ? `投信連買 ${consecutiveBuy} 天` : '無投信連買',
                    fundamental: revenueSupport ? (isRevenueNewHigh ? '月營收連三月成長 • 創近6月新高' : '月營收連三月成長') : '營收未明顯支撐'
                }
            };
        } catch (error: any) {
            console.error(`Analysis failed for ${stockId}:`, error.message);
            throw error;
        }
    }
};
