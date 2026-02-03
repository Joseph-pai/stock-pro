import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { evaluateStock, checkVolumeIncreasing } from '@/services/engine';
import { FinMindClient, } from '@/lib/finmind';
import { FinMindExtras } from '@/lib/finmind';
import { AnalysisResult } from '@/types';
import { format, subDays } from 'date-fns';

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
                if (history.length < 3) return null; // Minimum data required

                const evalData = evaluateStock(history, settings);
                const today = history[history.length - 1];
                const volumes = history.map(h => h.Trading_Volume);

                // Try to augment with institutional data from FinMind
                let consecutiveBuy = 0;
                let instScore = 0;
                let revenueSupport = false;
                try {
                    const endDate = format(new Date(), 'yyyy-MM-dd');
                    const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
                    const instData = await FinMindClient.getInstitutional({ stockId: stock.id, startDate, endDate });
                    const invTrust = instData.filter((d: any) => d.name === 'Investment_Trust');
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

                    // monthly revenue check -> compute MoM / YoY scores
                    let revenueBonusPoints = 0;
                    try {
                        const revStart = format(subDays(new Date(), 400), 'yyyy-MM-dd');
                        const rev = await FinMindExtras.getMonthlyRevenue({ stockId: stock.id, startDate: revStart, endDate: endDate });
                        if (Array.isArray(rev) && rev.length >= 2) {
                            const getRevenue = (r: any) => r.revenue || r.monthly_revenue || r.MonthlyRevenue || r['營業收入'] || r['Revenue'] || 0;
                            const sorted = [...rev].sort((a: any, b: any) => a.date.localeCompare(b.date));
                            const latest = sorted[sorted.length - 1];
                            const latestRev = Number(getRevenue(latest)) || 0;

                            // MoM score
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
                                momScore = Math.min(1, ( (pos1 > 0 ? Math.min(pos1/0.2,1) : 0) + (pos2 > 0 ? Math.min(pos2/0.2,1) : 0) ) / 2);
                            }

                            // YoY score
                            let yoyScore = 0;
                            if (sorted.length >= 13) {
                                const dt = new Date(latest.date);
                                const prevYear = new Date(dt.getFullYear() - 1, dt.getMonth(), dt.getDate());
                                const yearKey = `${prevYear.getFullYear()}-${String(prevYear.getMonth()+1).padStart(2,'0')}`;
                                const match = sorted.find((r: any) => r.date.startsWith(yearKey));
                                if (match) {
                                    const revYear = Number(getRevenue(match)) || 0;
                                    const yoy = revYear > 0 ? (latestRev - revYear) / revYear : 0;
                                    yoyScore = Math.max(0, Math.min(1, yoy / 0.2));
                                }
                            }

                            revenueBonusPoints = Math.round((momScore * 5 + yoyScore * 5) * 100) / 100;
                            revenueSupport = revenueBonusPoints > 0.5;
                        }
                    } catch (e) {
                        // ignore
                    }
                } catch (e) {
                    // fallback: keep defaults
                }

                const engineDetails = evalData?.comprehensiveScoreDetails || { volumeScore: 0, maScore: 0, chipScore: 0, total: 0 };
                const volumeScore = engineDetails.volumeScore || 0;
                const maScore = engineDetails.maScore || 0;
                const chipScore = instScore;
                const totalPoints = volumeScore + maScore + chipScore + (typeof revenueBonusPoints === 'number' ? revenueBonusPoints : 0);
                const finalScore = Math.min(1, Math.max(0, totalPoints / 100));

                const tags = ['DISCOVERY'];
                if (evalData?.isBreakout) tags.push('BREAKOUT');
                if (evalData?.maData?.isSqueezing) tags.push('MA_SQUEEZE');
                if ((evalData?.vRatio || 0) >= 3) tags.push('VOLUME_EXPLOSION');
                if (revenueSupport) tags.push('BASIC_SUPPORT');

                const result: AnalysisResult = {
                    stock_id: stock.id,
                    stock_name: stock.name || stock.id,
                    close: today.close,
                    change_percent: history.length > 1 ? (today.close - history[history.length - 2].close) / history[history.length - 2].close : 0,
                    score: finalScore,
                    v_ratio: evalData ? parseFloat(evalData.vRatio.toFixed(2)) : 0,
                    is_ma_aligned: evalData ? evalData.maData.isSqueezing : false,
                    is_ma_breakout: evalData ? evalData.isBreakout : false,
                    consecutive_buy: consecutiveBuy,
                    poc: today.close,
                    verdict: finalScore >= 0.6 ? '高概率爆發候選' : (evalData?.isQualified ? '三大信號共振 - 爆發前兆' : '分析完成'),
                    tags,
                    dailyVolumeTrend: volumes.slice(-10),
                    maConstrictValue: evalData?.maData.constrictValue || 0,
                    today_volume: today.Trading_Volume,
                    volumeIncreasing: checkVolumeIncreasing(volumes),
                    is_recommended: finalScore >= 0.6,
                    comprehensiveScoreDetails: {
                        volumeScore: parseFloat(volumeScore.toFixed(2)),
                        maScore: parseFloat(maScore.toFixed(2)),
                        chipScore: parseFloat(chipScore.toFixed(2)),
                        fundamentalBonus: parseFloat((revenueBonusPoints || 0).toFixed(2)),
                        total: parseFloat(totalPoints.toFixed(2))
                    }
                };

                return result;
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
