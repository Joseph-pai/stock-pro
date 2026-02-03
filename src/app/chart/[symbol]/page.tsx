'use client';

import { useQuery } from '@tanstack/react-query';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Info, Activity, Zap, ShieldCheck, AlertTriangle, Calculator, DollarSign } from 'lucide-react';
import { calculateSMA } from '@/services/indicators';
import { StockCandle, AnalysisResult } from '@/types';
import { useEffect, useState } from 'react';

export default function ChartPage() {
    const { symbol } = useParams();
    const router = useRouter();
    const [isLandscape, setIsLandscape] = useState(false);

    useEffect(() => {
        const checkOrientation = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };
        window.addEventListener('resize', checkOrientation);
        checkOrientation();
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    const { data: rawData, isLoading } = useQuery({
        queryKey: ['stock', symbol],
        queryFn: async () => {
            const res = await fetch(`/api/analyze/${symbol}`);
            const json = await res.json();
            return json.data as AnalysisResult;
        },
    });

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-500 animate-pulse font-mono">analyzing market data...</div>;

    const data = rawData!;
    const history = data.history || [];

    // Process Chart Data
    const candles: StockCandle[] = history.map((d: any) => ({
        time: d.date,
        open: d.open,
        high: d.max,
        low: d.min,
        close: d.close,
        value: d.Trading_Volume / 1000,
    }));

    const closePrices = history.map((d: any) => d.close) || [];
    const ma5 = closePrices.map((_: any, i: number) => calculateSMA(closePrices.slice(0, i + 1).reverse(), 5) || 0).reverse();
    const ma10 = closePrices.map((_: any, i: number) => calculateSMA(closePrices.slice(0, i + 1).reverse(), 10) || 0).reverse();
    const ma20 = closePrices.map((_: any, i: number) => calculateSMA(closePrices.slice(0, i + 1).reverse(), 20) || 0).reverse();

    const scoreDetails = data.comprehensiveScoreDetails || { volumeScore: 0, maScore: 0, chipScore: 0, total: 0 };
    const kelly = data.kellyResult || { action: 'Wait', percentage: 0, winRate: 0.5, riskRewardRatio: 0 };

    return (
        <div className={`flex flex-col bg-slate-950 ${isLandscape ? 'h-screen overflow-hidden' : 'min-h-screen pb-10'}`}>
            {/* Header */}
            {!isLandscape && (
                <header className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
                    <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white tracking-tight">{data.stock_name} <span className="text-slate-500 font-mono text-sm ml-1">{symbol}</span></h2>
                    </div>
                    <div className="w-8" />
                </header>
            )}

            {/* Chart Container - Responsive */}
            <div className={`relative ${isLandscape ? 'w-full h-full' : 'h-[55vh] w-full border-b border-white/5'}`}>
                {!isLandscape && (
                    <div className="absolute top-3 left-3 z-10 flex gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur border border-white/10 text-[9px] text-amber-500 font-bold font-mono">MA5</span>
                        <span className="px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur border border-white/10 text-[9px] text-blue-500 font-bold font-mono">MA10</span>
                    </div>
                )}

                {candles.length > 0 && (
                    <TradingViewChart
                        data={candles}
                        ma5={ma5}
                        ma10={ma10}
                        ma20={ma20}
                        poc={data.poc || 0}
                    />
                )}
            </div>

            {/* Detailed Analysis Panel - Only Visible in Portrait */}
            {!isLandscape && (
                <div className="px-4 py-6 space-y-8">

                    {/* 1. Risk Warning (If any) */}
                    {data.riskWarning && (
                        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-3 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                            <div>
                                <h4 className="text-orange-400 font-bold text-sm">Risk Warning</h4>
                                <p className="text-orange-300 text-xs mt-1">{data.riskWarning}</p>
                            </div>
                        </div>
                    )}

                    {/* 2. Comprehensive Score Breakdown */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                綜合評分
                            </h3>
                            <div className="flex items-end gap-1">
                                <span className="text-3xl font-black text-white leading-none">{scoreDetails.total}</span>
                                <span className="text-sm text-slate-500 font-bold mb-1">/ 100</span>
                            </div>
                        </div>

                        {/* Progress Bars */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400 flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> Volume Strength (40%)</span>
                                    <span className="text-amber-500">{scoreDetails.volumeScore}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div style={{ width: `${(scoreDetails.volumeScore / 40) * 100}%` }} className="h-full bg-amber-500 rounded-full" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3 text-blue-500" /> Technical Trend (30%)</span>
                                    <span className="text-blue-500">{scoreDetails.maScore}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div style={{ width: `${(scoreDetails.maScore / 30) * 100}%` }} className="h-full bg-blue-500 rounded-full" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-500" /> Institutional Chips (30%)</span>
                                    <span className="text-emerald-500">{scoreDetails.chipScore}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div style={{ width: `${(scoreDetails.chipScore / 30) * 100}%` }} className="h-full bg-emerald-500 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* 3. Kelly Criterion Strategy */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />

                        <div className="flex items-center gap-2 mb-4 relative z-10">
                            <Calculator className="w-5 h-5 text-purple-400" />
                            <h3 className="text-white font-bold text-lg">Kelly Strategy</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4 relative z-10">
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Est. Win Rate</span>
                                <div className="text-xl font-bold text-slate-200 mt-1">{(kelly.winRate * 100).toFixed(0)}%</div>
                            </div>
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Risk / Reward</span>
                                <div className="text-xl font-bold text-slate-200 mt-1">1 : {kelly.riskRewardRatio}</div>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                            <div>
                                <span className="text-xs text-slate-500">Action</span>
                                <div className={`text-2xl font-black ${kelly.action === 'Invest' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {kelly.action === 'Invest' ? 'INVEST' : 'WAIT'}
                                </div>
                            </div>

                            <div className="text-right">
                                <span className="text-xs text-slate-500">Suggested Position</span>
                                <div className="text-2xl font-black text-white flex items-center justify-end gap-1">
                                    <DollarSign className="w-4 h-4 text-purple-400" />
                                    {kelly.percentage}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Verdict */}
                    <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 flex gap-3">
                        <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-300 leading-relaxed">
                            <span className="text-slate-500 font-mono text-xs mr-2 block mb-1">AI VERDICT</span>
                            {data.verdict}
                        </p>
                    </div>

                </div>
            )}
        </div>
    );
}
