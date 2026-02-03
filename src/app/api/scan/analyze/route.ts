import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { calculateVRatio, checkMaConstrict, checkVolumeIncreasing } from '@/services/engine';
import { calculateSMA } from '@/services/indicators';
import { AnalysisResult } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/scan/analyze
 * 接收候選股票列表，進行深度分析（獲取歷史數據 + 三大信號驗證）
 */
export async function POST(req: Request) {
    try {
        const { stockIds } = await req.json();

        if (!Array.isArray(stockIds) || stockIds.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Invalid stockIds parameter'
            }, { status: 400 });
        }

        console.log(`[Deep Analysis] Analyzing ${stockIds.length} candidates...`);

        const t0 = Date.now();
        const results: AnalysisResult[] = [];
        let processedCount = 0;
        let errorCount = 0;

        // 批次處理，每次 20 支
        const batchSize = 20;
        for (let i = 0; i < stockIds.length; i += batchSize) {
            const batch = stockIds.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(async (stockId: string) => {
                    try {
                        // 獲取完整歷史數據（30 天）
                        const history = await ExchangeClient.getStockHistory(stockId);

                        if (history.length < 20) {
                            return null;
                        }

                        // 計算 MA5 和 MA20
                        const closes = history.map(s => s.close);
                        const ma5 = calculateSMA(closes.slice(-5), 5);
                        const ma20 = calculateSMA(closes.slice(-20), 20);

                        if (!ma5 || !ma20) return null;

                        // 計算量能倍數
                        const volumes = history.map(s => s.Trading_Volume);
                        const todayVolume = volumes[volumes.length - 1];
                        const past20Volumes = volumes.slice(-21, -1);
                        const vRatio = calculateVRatio(todayVolume, past20Volumes);

                        // 檢查均線糾結
                        const maData = checkMaConstrict(ma5, ma20);

                        // 檢查突破
                        const today = history[history.length - 1];
                        const changePercent = (today.close - today.open) / today.open;
                        const isBreakout = today.close > Math.max(ma5, ma20) && changePercent > 0.03;

                        // 三大信號共振（嚴格標準）
                        if (vRatio >= 3.5 && maData.isSqueezing && isBreakout) {
                            console.log(`[Deep Analysis] ✓ ${stockId} - V:${vRatio.toFixed(1)}x, MA:${(maData.constrictValue * 100).toFixed(1)}%, Break:${(changePercent * 100).toFixed(1)}%`);

                            const result: AnalysisResult = {
                                stock_id: today.stock_id,
                                stock_name: today.stock_name,
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
                                volumeIncreasing: checkVolumeIncreasing(volumes)
                            };
                            return result;
                        }

                        return null;
                    } catch (error) {
                        console.warn(`[Deep Analysis] Error processing ${stockId}:`, error);
                        return null;
                    }
                })
            );

            // 收集結果
            batchResults.forEach(result => {
                processedCount++;
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                } else if (result.status === 'rejected') {
                    errorCount++;
                }
            });

            console.log(`[Deep Analysis] Progress: ${processedCount}/${stockIds.length} (Found: ${results.length})`);
        }

        const t1 = Date.now();

        // 按量能倍數排序
        const sorted = results.sort((a, b) => b.v_ratio - a.v_ratio);

        console.log(`[Deep Analysis] Complete: Found ${sorted.length} stocks in ${t1 - t0}ms`);

        return NextResponse.json({
            success: true,
            data: sorted,
            count: sorted.length,
            timing: {
                total: t1 - t0,
                processed: processedCount,
                errors: errorCount
            }
        });

    } catch (error: any) {
        console.error('[Deep Analysis] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
