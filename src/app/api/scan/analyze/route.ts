import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock, checkVolumeIncreasing } from '@/services/engine';
import { AnalysisResult } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    try {
        const { stocks, settings } = await req.json(); // stocks: { id, name }[]

        if (!Array.isArray(stocks) || stocks.length === 0) {
            return NextResponse.json({ success: false, error: 'Empty stock list' }, { status: 400 });
        }

        console.log(`[Deep Analysis] Batch of ${stocks.length} stocks. Settings:`, settings);

        const results: AnalysisResult[] = [];

        // Process this batch
        const batchResults = await Promise.allSettled(
            stocks.map(async (stock: { id: string, name: string }) => {
                const history = await ExchangeClient.getStockHistory(stock.id);
                const evalData = evaluateStock(history, settings);

                if (evalData && evalData.isQualified) {
                    const today = history[history.length - 1];
                    const volumes = history.map(h => h.Trading_Volume);

                    return {
                        stock_id: stock.id,
                        stock_name: stock.name || stock.id,

                        close: today.close,
                        change_percent: evalData.changePercent,
                        score: 0,
                        v_ratio: parseFloat(evalData.vRatio.toFixed(2)),
                        is_ma_aligned: evalData.maData.isSqueezing,
                        is_ma_breakout: evalData.isBreakout,
                        consecutive_buy: 0,
                        poc: today.close,
                        verdict: '三大信號共振 - 爆發前兆',
                        tags: ['DISCOVERY', 'VOLUME_EXPLOSION', 'MA_SQUEEZE', 'BREAKOUT'],
                        dailyVolumeTrend: volumes.slice(-10),
                        maConstrictValue: evalData.maData.constrictValue,
                        volumeIncreasing: checkVolumeIncreasing(volumes)
                    } as AnalysisResult;
                }
                return null;
            })
        );

        batchResults.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                results.push(r.value);
            }
        });

        return NextResponse.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error: any) {
        console.error('[Analyze API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
