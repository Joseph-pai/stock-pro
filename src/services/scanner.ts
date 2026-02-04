import { FinMindClient, } from '@/lib/finmind';
import { FinMindExtras } from '@/lib/finmind';
import { ExchangeClient, normalizeAnyDate } from '@/lib/exchange';
import { evaluateStock, calculateVRatio, checkMaConstrict, checkVolumeIncreasing } from './engine';
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
                        const changePercent = (today.close - today.open) / today.open;
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
    filterStocks: async (stockIds: string[]): Promise<{ results: AnalysisResult[], timing: any }> => {
        const t0 = Date.now();
        console.log(`[Scanner] Stage 2: Filtering - 深度篩選 ${stockIds.length} 支股票...`);

        const filtered: AnalysisResult[] = [];

        for (const stockId of stockIds) {
            try {
                const result = await ScannerService.analyzeStock(stockId);
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
     */
    analyzeStock: async (stockId: string, settings?: { volumeRatio: number, maConstrict: number, breakoutPercent: number }): Promise<AnalysisResult | null> => {
        try {
            console.log(`[Analyze] Fetching data for ${stockId}...`);

            // Load industry mapping
            const industryMapping = await ExchangeClient.getIndustryMapping();

            let prices: StockData[] = [];
            let insts: any[] = [];

            try {
                const endDate = format(new Date(), 'yyyy-MM-dd');
                const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');

                const [priceData, instData] = await Promise.all([
                    FinMindClient.getDailyStats({
                        stockId,
                        startDate,
                        endDate
                    }),
                    FinMindClient.getInstitutional({
                        stockId,
                        startDate: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
                        endDate
                    })
                ]);
                prices = priceData;
                insts = instData;
            } catch (finmindError) {
                console.warn(`[Analyze] FinMind failed for ${stockId}, using ExchangeClient...`);
                prices = await ExchangeClient.getStockHistory(stockId);

                // ENSURE LATEST PRICE: If history is from a fallback, check if we can get a newer price from snapshot
                try {
                    const isTPEX = await ExchangeClient.isTpexStock(stockId);
                    const snapshots = await ExchangeClient.getAllMarketQuotes(isTPEX ? 'TPEX' : 'TWSE');
                    const latest = snapshots.find(s => s.stock_id === stockId);
                    if (latest) {
                        const lastInHistory = prices[prices.length - 1];
                        if (!lastInHistory || latest.date > lastInHistory.date) {
                            prices.push(latest);
                            // Deduplicate and re-sort
                            prices = Array.from(new Map(prices.map(p => [p.date, p])).values())
                                .sort((a, b) => a.date.localeCompare(b.date));
                        }
                    }
                } catch (snapshotError) {
                    console.warn(`[Analyze] Quick snapshot fallback failed:`, snapshotError);
                }
            }

            if (prices.length < 3) {
                console.warn(`[Analyze] Insufficient data for ${stockId} (${prices.length} days found)`);
                return null;
            }

            const result = evaluateStock(prices, settings);
            if (!result) return null;

            const today = prices[prices.length - 1];

            // Analyze institutional flow (投信連買)
            let consecutiveBuy = 0;
            let instScore = 0;
            try {
                const instData = insts || [];
                // Filter for Investment_Trust entries and aggregate by date
                const invTrust = instData.filter((d: any) => d.name === 'Investment_Trust');
                // Build map of date -> net buy (buy - sell)
                const byDate: Record<string, number> = {};
                invTrust.forEach((row: any) => {
                    const dt = row.date;
                    const net = (row.buy || 0) - (row.sell || 0);
                    byDate[dt] = (byDate[dt] || 0) + net;
                });
                // Sort recent dates descending
                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    if ((byDate[d] || 0) > 0) consecutiveBuy++; else break;
                }

                // Normalize instScore: 5 days or more => full score
                instScore = Math.min(consecutiveBuy / 5, 1) * 30;
            } catch (e) {
                consecutiveBuy = 0;
                instScore = 0;
            }

            // Fundamental check: YoY / MoM judgment and revenue bonus points
            let revenueSupport = false;
            let revenueBonusPoints = 0; // up to 10 points
            try {
                const endDate = format(new Date(), 'yyyy-MM-dd');
                const startDate = format(subDays(new Date(), 400), 'yyyy-MM-dd');
                const rev = await FinMindExtras.getMonthlyRevenue({ stockId, startDate, endDate });
                if (Array.isArray(rev) && rev.length >= 2) {
                    // Helper to extract revenue value from various possible fields
                    const getRevenue = (r: any) => r.revenue || r.monthly_revenue || r.MonthlyRevenue || r['營業收入'] || r['Revenue'] || 0;

                    // FIXED: Normalize dates before sorting
                    const normalized = rev.map((r: any) => ({
                        ...r,
                        date: r.date.includes('/') ? normalizeAnyDate(r.date) : r.date
                    }));

                    // sort by normalized date ascending
                    const sorted = [...normalized].sort((a: any, b: any) => a.date.localeCompare(b.date));
                    const latest = sorted[sorted.length - 1];
                    const latestRev = Number(getRevenue(latest)) || 0;

                    // MoM: check last 2 increases (last vs prev, prev vs prevprev)
                    let momScore = 0;
                    if (sorted.length >= 3) {
                        const prev = sorted[sorted.length - 2];
                        const prevprev = sorted[sorted.length - 3];
                        const revPrev = Number(getRevenue(prev)) || 0;
                        const revPrevPrev = Number(getRevenue(prevprev)) || 0;
                        const mom1 = revPrev > 0 ? (latestRev - revPrev) / revPrev : 0;
                        const mom2 = revPrevPrev > 0 ? (revPrev - revPrevPrev) / revPrevPrev : 0;
                        // positive momentum counts; normalize over 20% growth
                        const pos1 = Math.max(0, mom1);
                        const pos2 = Math.max(0, mom2);
                        momScore = Math.min(1, ((pos1 > 0 ? Math.min(pos1 / 0.2, 1) : 0) + (pos2 > 0 ? Math.min(pos2 / 0.2, 1) : 0)) / 2);
                    }

                    // YoY: try to find same month previous year
                    let yoyScore = 0;
                    if (sorted.length >= 13) {
                        // latest date is now normalized (YYYY-MM-DD)
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

                    // Revenue bonus: combine MoM and YoY (max 10 points)
                    revenueBonusPoints = Math.round((momScore * 5 + yoyScore * 5) * 100) / 100;
                    revenueSupport = revenueBonusPoints > 0.5; // small threshold
                }
            } catch (e) {
                revenueSupport = false;
                revenueBonusPoints = 0;
            }

            // Recompute comprehensive score: use engine components but inject instScore
            const engineDetails = result.comprehensiveScoreDetails || { volumeScore: 0, maScore: 0, chipScore: 0, total: 0 };
            const volumeScore = engineDetails.volumeScore || 0;
            const maScore = engineDetails.maScore || 0;
            const chipScore = instScore; // override

            // FIXED: Normalize weights to 100 total (35-25-25-15 distribution)
            // Original: 40-30-30 = 100, then +10 revenue = 110 (incorrect)
            // New: 35-25-25-15 = 100 (maintains proportions while ensuring max 100)
            const normalizedVolumeScore = volumeScore * (35 / 40); // scale from 40 to 35
            const normalizedMaScore = maScore * (25 / 30);         // scale from 30 to 25
            const normalizedChipScore = Math.min(chipScore * (25 / 30), 25); // scale from 30 to 25
            const normalizedFundamentalBonus = Math.min(revenueBonusPoints * (15 / 10), 15); // scale from 10 to 15

            const totalPoints = normalizedVolumeScore + normalizedMaScore + normalizedChipScore + normalizedFundamentalBonus;
            const finalScore = Math.min(1, Math.max(0, totalPoints / 100));

            const tags: AnalysisResult['tags'] = ['DISCOVERY'];
            if (result.isBreakout) tags.push('BREAKOUT');
            if (result.maData.isSqueezing) tags.push('MA_SQUEEZE');
            if ((result.vRatio || 0) >= 3) tags.push('VOLUME_EXPLOSION');

            if (revenueSupport) tags.push('BASIC_SUPPORT');

            return {
                stock_id: stockId,
                stock_name: today.stock_name || stockId,
                sector_name: industryMapping[stockId.trim()] || '其他',
                close: today.close,
                change_percent: result.changePercent,
                score: finalScore,
                v_ratio: result.vRatio,
                is_ma_aligned: result.maData.isSqueezing,
                is_ma_breakout: result.isBreakout,
                consecutive_buy: consecutiveBuy,
                poc: today.close,
                verdict: finalScore >= 0.6 ? '高概率爆發候選' : '分析完成',
                tags,
                history: prices,
                maConstrictValue: result.maData.constrictValue,
                today_volume: today.Trading_Volume,
                dailyVolumeTrend: prices.map(p => p.Trading_Volume).slice(-10),
                volumeIncreasing: checkVolumeIncreasing(prices.map(p => p.Trading_Volume)),
                comprehensiveScoreDetails: {
                    volumeScore: parseFloat(normalizedVolumeScore.toFixed(2)),
                    maScore: parseFloat(normalizedMaScore.toFixed(2)),
                    chipScore: parseFloat(normalizedChipScore.toFixed(2)),
                    fundamentalBonus: parseFloat(normalizedFundamentalBonus.toFixed(2)),
                    total: parseFloat(totalPoints.toFixed(2))
                },
                is_recommended: finalScore >= 0.6,
                analysisHints: {
                    technicalSignals: `V-Ratio 升至 ${result.vRatio.toFixed(1)}x${result.maData.isSqueezing ? ' • 均線高度糾結' : ''} • 量能激增`,
                    chipSignals: `機構連買 ${consecutiveBuy} 日 • 籌碼集中度高`,
                    fundamentalSignals: revenueBonusPoints > 0 ? `營收環比+${revenueBonusPoints.toFixed(1)}分 • 基本面支撐` : '營收成長動能待觀察',
                    technical: result.isBreakout ? '帶量突破' : (result.maData.isSqueezing ? '均線糾結待突破' : '無明顯技術信號'),
                    chips: consecutiveBuy >= 3 ? `投信連買 ${consecutiveBuy} 天` : '無投信連買',
                    fundamental: revenueSupport ? '月營收連三月成長' : '營收未明顯支撐'
                }
            };
        } catch (error: any) {
            console.error(`Analysis failed for ${stockId}:`, error.message);
            throw error;
        }
    }
};
