'use client';

import { useQuery } from '@tanstack/react-query';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Maximize, TrendingUp, Info } from 'lucide-react';
import { calculateSMA } from '@/services/indicators';
import { StockCandle } from '@/types';
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

    const { data, isLoading } = useQuery({
        queryKey: ['stock', symbol],
        queryFn: async () => {
            const res = await fetch(`/api/analyze/${symbol}`);
            const json = await res.json();
            return json.data; // Now returns AnalysisResult with history
        },
    });

    // Process data for chart
    const history = data?.history || [];
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

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-500 animate-pulse">Loading...</div>;

    const poc = data?.poc || 0;

    return (
        <div className={`flex flex-col bg-slate-950 ${isLandscape ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
            {/* Header - Hidden in landscape if strictly requested, but let's keep it small */}
            {!isLandscape && (
                <header className="p-4 flex items-center justify-between border-b border-white/5 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
                    <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white">{symbol}</h2>
                        <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">技術分析</p>
                    </div>
                    <div className="w-10" /> {/* Spacer */}
                </header>
            )}

            {/* Chart Container */}
            <div className={`flex-1 relative ${isLandscape ? 'w-full h-full' : 'h-[60vh] p-2'}`}>
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                    <span className="px-2 py-1 rounded bg-slate-900/80 backdrop-blur border border-white/10 text-[10px] text-amber-500 font-bold">MA5</span>
                    <span className="px-2 py-1 rounded bg-slate-900/80 backdrop-blur border border-white/10 text-[10px] text-blue-500 font-bold">MA10</span>
                    <span className="px-2 py-1 rounded bg-slate-900/80 backdrop-blur border border-white/10 text-[10px] text-purple-500 font-bold">MA20</span>
                </div>

                {candles.length > 0 && (
                    <TradingViewChart
                        data={candles}
                        ma5={ma5}
                        ma10={ma10}
                        ma20={ma20}
                        poc={poc}
                    />
                )}
            </div>

            {/* Info Tiles - Hidden in landscape */}
            {!isLandscape && (
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                            <span className="text-xs text-slate-500">當前收盤</span>
                            <p className="text-2xl font-black text-rose-500 font-mono">{candles[candles.length - 1]?.close.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                            <span className="text-xs text-slate-500">成交量 (張)</span>
                            <p className="text-2xl font-black text-white font-mono">{(candles[candles.length - 1]?.value || 0).toFixed(0)}</p>
                        </div>
                    </div>

                    <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex gap-3">
                        <Info className="w-5 h-5 text-blue-400 shrink-0" />
                        <p className="text-xs text-blue-300 leading-relaxed italic">
                            {data?.verdict || '正在分析中...'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
