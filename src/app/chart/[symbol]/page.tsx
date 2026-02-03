'use client';

import { useQuery } from '@tanstack/react-query';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Info, Activity, Zap, ShieldCheck, AlertTriangle, Calculator, DollarSign, LineChart, PieChart, BarChart3 } from 'lucide-react';
import { calculateSMA } from '@/services/indicators';
import { StockCandle, AnalysisResult } from '@/types';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

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

    const { data: rawData, isLoading, isError } = useQuery({
        queryKey: ['stock', symbol],
        queryFn: async () => {
            const res = await fetch(`/api/analyze/${symbol}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data as AnalysisResult;
        },
    });

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-500 animate-pulse font-mono">analyzing market data...</div>;
    if (isError || !rawData) return <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-rose-500 px-6 text-center">
        <AlertTriangle className="w-12 h-12 mb-4" />
        <p className="font-bold">無法獲取分析數據</p>
        <button onClick={() => router.back()} className="mt-4 text-xs underline">回上一頁</button>
    </div>;

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
    const hints = data.analysisHints || { technical: '-', chips: '-', fundamental: '-' };

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
                    <div className="flex items-center gap-2">
                        <div className={clsx(
                            "w-2 h-2 rounded-full",
                            scoreDetails.total > 70 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" : "bg-emerald-500"
                        )} />
                        <span className="text-[10px] font-bold text-slate-400">LIVE</span>
                    </div>
                </header>
            )}

            {/* Chart Container - Responsive */}
            <div className={`relative ${isLandscape ? 'w-full h-full' : 'h-[50vh] min-h-[400px] w-full border-b border-white/5'}`}>
                {!isLandscape && (
                    <div className="absolute top-3 left-3 z-10 flex gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur border border-white/10 text-[9px] text-amber-500 font-bold font-mono">MA5</span>
                        <span className="px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur border border-white/10 text-[9px] text-blue-500 font-bold font-mono">MA10</span>
                        <span className="px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur border border-white/10 text-[9px] text-purple-500 font-bold font-mono">POC</span>
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
                <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto w-full">

                    {/* 1. Risk Warning (If any) */}
                    {data.riskWarning && (
                        <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex gap-4 items-center">
                            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-6 h-6 text-orange-500" />
                            </div>
                            <div>
                                <h4 className="text-orange-400 font-black text-xs uppercase tracking-wider">Risk Warning</h4>
                                <p className="text-orange-200 text-sm font-medium mt-0.5">{data.riskWarning}</p>
                            </div>
                        </div>
                    )}

                    {/* 2. Comprehensive Score Dashboard */}
                    <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-white font-black text-xl flex items-center gap-2">
                                    <Activity className="w-6 h-6 text-blue-400" />
                                    專家綜合評分
                                </h3>
                                <p className="text-slate-500 text-xs mt-1">AI 專家系統多維度掃描結果</p>
                            </div>
                            <div className="text-center">
                                <div className="text-5xl font-black text-white leading-none italic">{scoreDetails.total}</div>
                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-tighter mt-1">Final Score</div>
                            </div>
                        </div>

                        {/* Progress Grid */}
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                                    <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> 量能爆發 (40%)</span>
                                    <span className="text-amber-500">{scoreDetails.volumeScore}</span>
                                </div>
                                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-[2px]">
                                    <div style={{ width: `${(scoreDetails.volumeScore / 40) * 100}%` }} className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                                    <span className="flex items-center gap-1.5"><LineChart className="w-4 h-4 text-blue-500" /> 技術趨勢 (30%)</span>
                                    <span className="text-blue-500">{scoreDetails.maScore}</span>
                                </div>
                                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-[2px]">
                                    <div style={{ width: `${(scoreDetails.maScore / 30) * 100}%` }} className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                                    <span className="flex items-center gap-1.5"><PieChart className="w-4 h-4 text-emerald-500" /> 法人籌碼 (30%)</span>
                                    <span className="text-emerald-500">{scoreDetails.chipScore}</span>
                                </div>
                                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-[2px]">
                                    <div style={{ width: `${(scoreDetails.chipScore / 30) * 100}%` }} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Expert Insight Cards (Technical, Chips, Fundamental) */}
                    <div className="grid grid-cols-1 gap-3">
                        <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex gap-4 items-start">
                            <LineChart className="w-5 h-5 text-blue-400 shrink-0 mt-1" />
                            <div>
                                <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">技術面解析</span>
                                <p className="text-sm text-slate-200 mt-1 font-medium">{hints.technical}</p>
                            </div>
                        </div>
                        <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex gap-4 items-start">
                            <ShieldCheck className="w-5 h-5 text-rose-400 shrink-0 mt-1" />
                            <div>
                                <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">籌碼面監控</span>
                                <p className="text-sm text-slate-200 mt-1 font-medium">{hints.chips}</p>
                            </div>
                        </div>
                        <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex gap-4 items-start">
                            <BarChart3 className="w-5 h-5 text-amber-400 shrink-0 mt-1" />
                            <div>
                                <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">基本與量能面</span>
                                <p className="text-sm text-slate-200 mt-1 font-medium">{hints.fundamental}</p>
                            </div>
                        </div>
                    </div>

                    {/* 4. Kelly Criterion Positioning */}
                    <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6 relative overflow-hidden">
                        <div className="absolute -right-12 -top-12 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />

                        <div className="flex items-center gap-2 mb-6 relative z-10">
                            <Calculator className="w-6 h-6 text-indigo-400" />
                            <h3 className="text-white font-black text-xl">Kelly Criterion Strategy</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4 relative z-10 mb-6">
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                                <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-1 block">預估勝率</span>
                                <div className="text-2xl font-black text-indigo-200">{(kelly.winRate * 100).toFixed(0)}%</div>
                            </div>
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                                <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-1 block">損益比</span>
                                <div className="text-2xl font-black text-indigo-200">1 : {kelly.riskRewardRatio}</div>
                            </div>
                        </div>

                        <div className="bg-black/40 rounded-2xl p-5 flex items-center justify-between relative z-10 border border-indigo-500/30">
                            <div>
                                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 block">專家操作建議</span>
                                <div className={clsx(
                                    "text-3xl font-black italic",
                                    kelly.action === 'Invest' ? 'text-rose-500' : 'text-slate-400'
                                )}>
                                    {kelly.action === 'Invest' ? 'PUSH ALL-IN' : 'HOLD / WAIT'}
                                </div>
                            </div>

                            <div className="text-right">
                                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 block">建議倉位比例</span>
                                <div className="text-4xl font-black text-white flex items-center justify-end gap-1 font-mono">
                                    {kelly.percentage}<span className="text-lg text-indigo-400">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Verdict */}
                    <div className="p-6 bg-slate-900/30 rounded-3xl border border-white/5 flex gap-4 backdrop-blur-sm">
                        <Info className="w-6 h-6 text-slate-500 shrink-0 mt-1" />
                        <div>
                            <span className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] block mb-2">AI Expert Verdict</span>
                            <p className="text-base text-slate-200 leading-relaxed font-medium">
                                {data.verdict}
                            </p>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
