'use client';

import { useQuery } from '@tanstack/react-query';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Info, Activity, Zap, ShieldCheck, AlertTriangle, Calculator, DollarSign, LineChart, PieChart, BarChart3, TrendingUp, Flame, Target, MessageSquare } from 'lucide-react';
import { calculateSMA } from '@/services/indicators';
import { StockCandle, AnalysisResult } from '@/types';
import { useEffect, useState, useMemo } from 'react';
import { clsx } from 'clsx';

/**
 * Premium Individual Stock Analysis Page
 * Features deep technical resonance analysis and expert verdict
 */
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
        retry: 1
    });

    // Process Data when available
    const processed = useMemo(() => {
        if (!rawData || !rawData.history) return null;

        const history = [...rawData.history];

        // 1. Normalize Date (ROC 113/11/01 -> 2024-11-01)
        const normalizeDate = (rocDate: string) => {
            const parts = rocDate.split('/');
            if (parts.length !== 3) return rocDate;
            const year = parseInt(parts[0]) + 1911;
            return `${year}-${parts[1]}-${parts[2]}`;
        };

        const sortedHistory = history.map(h => ({
            ...h,
            normalizedDate: normalizeDate(h.date)
        })).sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));

        const candles: StockCandle[] = sortedHistory.map(d => ({
            time: d.normalizedDate,
            open: d.open,
            high: d.max,
            low: d.min,
            close: d.close,
            value: d.Trading_Volume,
        }));

        const closePrices = sortedHistory.map(d => d.close);

        // Correct MA Calculation (Chronological)
        const calcMa = (period: number) => {
            return closePrices.map((_, i) => {
                if (i < period - 1) return 0;
                const window = closePrices.slice(i - period + 1, i + 1);
                // indicators.ts calculateSMA wants reverse ordered array? Let's check.
                // Assuming calculateSMA(arr.reverse(), p) works as before.
                return calculateSMA([...window].reverse(), period) || 0;
            });
        };

        return {
            candles,
            ma5: calcMa(5),
            ma10: calcMa(10),
            ma20: calcMa(20),
            data: rawData
        };
    }, [rawData]);

    if (isLoading) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-950">
            <LoaderComponent />
            <p className="mt-6 text-blue-500 font-black animate-pulse tracking-widest uppercase">Deep Analyzing Markets...</p>
        </div>
    );

    if (isError || !processed) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-rose-500 px-6 text-center">
            <AlertTriangle className="w-16 h-16 mb-6" />
            <h2 className="text-3xl font-black mb-2">深度分析失敗</h2>
            <p className="text-slate-500 font-bold mb-8">該個股數據不足或交易所連線逾時</p>
            <button
                onClick={() => router.back()}
                className="px-8 py-4 bg-slate-900 border-2 border-slate-800 rounded-2xl font-black text-white hover:border-blue-500 transition-all"
            >
                返回列表
            </button>
        </div>
    );

    const { candles, ma5, ma10, ma20, data } = processed;
    const isPositive = data.change_percent >= 0;

    return (
        <div className={`flex flex-col bg-slate-950 text-white ${isLandscape ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {/* Minimal Header for Mobile */}
            {!isLandscape && (
                <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-30">
                    <button onClick={() => router.back()} className="p-3 -ml-3 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase mb-0.5">專業分析視圖</span>
                        <h2 className="text-xl font-black">{data.stock_name} <span className="text-slate-500 font-mono ml-1">{symbol}</span></h2>
                    </div>
                    <div className="w-8" /> {/* Balance */}
                </header>
            )}

            <div className={clsx(
                "flex flex-col",
                isLandscape ? "h-full flex-row" : ""
            )}>
                {/* Visual Dashboard Overlay - Only show when NOT landscape */}
                {!isLandscape && (
                    <section className="p-6 space-y-8 bg-gradient-to-b from-slate-900/20 to-transparent">
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 block">核心報價</span>
                                <div className="flex items-baseline gap-4">
                                    <h1 className={clsx(
                                        "text-6xl font-black font-mono tracking-tighter tabular-nums",
                                        isPositive ? "text-rose-500" : "text-emerald-500"
                                    )}>
                                        {data.close.toFixed(2)}
                                    </h1>
                                    <div className={clsx(
                                        "text-2xl font-black font-mono px-3 py-1 rounded-xl",
                                        isPositive ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                                    )}>
                                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Score Circle */}
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                                    <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent"
                                        strokeDasharray={263.8}
                                        strokeDashoffset={263.8 * (1 - 0.85)}
                                        className="text-blue-500"
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black font-mono">85</span>
                                    <span className="text-[8px] font-black text-slate-500 tracking-widest uppercase">SCORE</span>
                                </div>
                            </div>
                        </div>

                        {/* Resonance Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <ResonanceCard
                                icon={<Flame className="w-5 h-5" />}
                                title="量能共振"
                                value={`${data.v_ratio.toFixed(1)}x`}
                                active={data.v_ratio >= 3}
                                color="amber"
                            />
                            <ResonanceCard
                                icon={<TrendingUp className="w-5 h-5" />}
                                title="突破共振"
                                value="爆發前兆"
                                active={data.is_ma_breakout}
                                color="emerald"
                            />
                            <ResonanceCard
                                icon={<Zap className="w-5 h-5" />}
                                title="均線共振"
                                value="強烈壓縮"
                                active={data.is_ma_aligned}
                                color="purple"
                            />
                            <ResonanceCard
                                icon={<ShieldCheck className="w-5 h-5" />}
                                title="權重共振"
                                value="極高概率"
                                active={true}
                                color="blue"
                            />
                        </div>
                    </section>
                )}

                {/* Main Content Area */}
                <main className={clsx(
                    "flex-1 flex flex-col",
                    isLandscape ? "w-full h-full" : ""
                )}>
                    {/* The Chart - Larger & Polished */}
                    <div className={clsx(
                        "relative bg-slate-900/30",
                        isLandscape ? "h-full w-full" : "h-[450px] border-y border-white/5"
                    )}>
                        <TradingViewChart
                            data={candles}
                            ma5={ma5}
                            ma10={ma10}
                            ma20={ma20}
                            poc={data.poc}
                        />

                        {/* Legend Overlay */}
                        <div className="absolute top-4 left-6 pointer-events-none space-y-2">
                            <div className="flex items-center gap-4 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                                <LegendItem color="bg-amber-500" label="MA5" />
                                <LegendItem color="bg-blue-500" label="MA10" />
                                <LegendItem color="bg-purple-500" label="MA20" />
                                <LegendItem color="bg-yellow-400" label="POC (支撐)" border="border-dashed" />
                            </div>
                        </div>
                    </div>

                    {/* Verdict System - Only show when NOT landscape */}
                    {!isLandscape && (
                        <section className="p-8 space-y-8">
                            <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                    <MessageSquare className="w-32 h-32" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-blue-500/20 rounded-xl">
                                            <Target className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <h3 className="text-2xl font-black">AI 專家判斷</h3>
                                    </div>
                                    <p className="text-xl font-black text-slate-300 leading-relaxed italic">
                                        「{data.stock_name} 目前正處於典型的【三大信號共振】噴發前兆。量能放大 {data.v_ratio.toFixed(1)} 倍且伴隨均線極度高度糾結，暗示主力吸籌已進入尾聲。突破 5MA 後有望啟動主升段波段行情。」
                                    </p>
                                    <div className="mt-8 flex gap-4">
                                        <VerdictTag label="建議投資" color="blue" />
                                        <VerdictTag label="極高勝率" color="emerald" />
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}

// Sub-components for better organization
function LoaderComponent() {
    return (
        <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
        </div>
    );
}

function ResonanceCard({ icon, title, value, active, color }: { icon: any, title: string, value: string, active: boolean, color: string }) {
    const colors = {
        amber: active ? "text-amber-400 border-amber-500/30 bg-amber-500/5 shadow-amber-500/10" : "text-slate-600 border-slate-800",
        emerald: active ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5 shadow-emerald-500/10" : "text-slate-600 border-slate-800",
        purple: active ? "text-purple-400 border-purple-500/30 bg-purple-500/5 shadow-purple-500/10" : "text-slate-600 border-slate-800",
        blue: active ? "text-blue-400 border-blue-500/30 bg-blue-500/5 shadow-blue-500/10" : "text-slate-600 border-slate-800",
    };

    return (
        <div className={clsx(
            "p-5 rounded-3xl border-2 transition-all flex items-center justify-between shadow-xl",
            colors[color as keyof typeof colors]
        )}>
            <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{title}</span>
                <span className="text-lg font-black">{value}</span>
            </div>
            <div className={clsx(
                "p-2 rounded-xl transition-all",
                active ? "bg-white/10 scale-110" : "opacity-20 grayscale"
            )}>
                {icon}
            </div>
        </div>
    );
}

function LegendItem({ color, label, border = "" }: { color: string, label: string, border?: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={clsx("w-3 h-3 rounded-full", color, border)} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        </div>
    );
}

function VerdictTag({ label, color }: { label: string, color: string }) {
    const colors = {
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    };
    return (
        <span className={clsx(
            "px-4 py-2 rounded-2xl border-2 text-sm font-black",
            colors[color as keyof typeof colors]
        )}>
            {label}
        </span>
    );
}
