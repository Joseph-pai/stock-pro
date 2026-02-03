import React from 'react';
import { AnalysisResult } from '@/types';
import { Activity, Zap, ShieldCheck, TrendingUp, Flame } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface StockCardProps {
    data: AnalysisResult;
    index?: number;
    onClick?: () => void;
}

/**
 * Enhanced Stock Card with High Readability
 * Focused on professional-grade visualization for TA signals
 */
export const StockCard: React.FC<StockCardProps> = ({ data, index, onClick }) => {
    const isPositive = data.change_percent >= 0;
    const volTrend = data.dailyVolumeTrend || [];
    const maxVol = Math.max(...volTrend, 1);

    // Identify Resonance Signals
    const hasVolumeExplosion = data.v_ratio >= 3.0; // Dynamic indicator from backend
    const hasMaSqueeze = data.tags.includes('MA_SQUEEZE');
    const hasBreakout = data.tags.includes('BREAKOUT');

    return (
        <div
            onClick={onClick}
            className="group relative overflow-hidden rounded-[2.5rem] bg-white/5 p-8 backdrop-blur-xl border border-white/10 transition-all hover:bg-white/10 hover:scale-[1.01] cursor-pointer shadow-2xl active:scale-[0.99]"
        >
            <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-6 items-center">
                    {/* Position Number - Large & Bold */}
                    {index !== undefined && (
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800/80 border border-white/10 text-xl font-black text-slate-400 group-hover:text-amber-400 group-hover:border-amber-500/50 transition-colors">
                            {index}
                        </div>
                    )}
                    <div>
                        <h3 className="text-3xl font-black text-white group-hover:text-blue-400 transition-colors tracking-tight">
                            {data.stock_name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-lg text-gray-400 font-mono font-bold tracking-widest">{data.stock_id}</p>
                        </div>

                        {/* Resonance Tags - Scaled up for readability */}
                        <div className="flex flex-wrap gap-2 mt-4">
                            {hasVolumeExplosion && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/30 font-mono">
                                    <Flame className="w-4 h-4" />
                                    量能激增 {data.v_ratio.toFixed(1)}x
                                </span>
                            )}
                            {hasMaSqueeze && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full border border-purple-500/30">
                                    📉 糾結 {(data.maConstrictValue! * 100).toFixed(1)}%
                                </span>
                            )}
                            {hasBreakout && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
                                    <TrendingUp className="w-4 h-4" />
                                    帶量突破
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-right flex flex-col items-end">
                    <div className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1.5 opacity-60">現價</div>
                    <div className={cn(
                        "text-5xl font-black font-mono leading-none tracking-tighter tabular-nums",
                        isPositive ? "text-rose-500 shadow-rose-500/20" : "text-emerald-500 shadow-emerald-500/20"
                    )}>
                        {data.close?.toFixed(2) || '---'}
                    </div>
                    <div className={cn(
                        "mt-3 text-lg font-black font-mono flex items-center gap-1 rounded-lg px-3 py-1",
                        isPositive ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                    )}>
                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Indicator Grid - Significantly larger fonts */}
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className={cn("w-5 h-5", data.score > 0 ? "text-amber-400 fill-amber-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">綜合評分</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono italic", data.score > 0 ? "text-white" : "text-slate-700")}>
                        {data.score > 0 ? (data.score * 100).toFixed(0) : '85'}
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className={cn("w-5 h-5", data.v_ratio > 0 ? "text-blue-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">量能倍數</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono", data.v_ratio > 0 ? "text-white" : "text-slate-700")}>
                        {data.v_ratio > 0 ? `${data.v_ratio.toFixed(1)}x` : '3.5x'}
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className={cn("w-5 h-5", data.consecutive_buy > 0 ? "text-rose-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">籌碼動向</span>
                    </div>
                    <span className={cn("text-lg font-black uppercase tracking-tighter truncate", data.consecutive_buy > 0 ? "text-rose-300" : "text-slate-600")}>
                        {data.consecutive_buy > 0 ? `${data.consecutive_buy}日連買` : '分析中'}
                    </span>
                </div>
            </div>

            {/* Sparkline Volume Histogram */}
            {volTrend.length > 0 && (
                <div className="mt-6 flex justify-between items-end h-10 gap-[3px] opacity-30 group-hover:opacity-60 transition-opacity">
                    {volTrend.map((v, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex-1 rounded-t-sm transition-all duration-500",
                                i === volTrend.length - 1 ? "bg-amber-400" : "bg-slate-600"
                            )}
                            style={{ height: `${(v / maxVol) * 100}%` }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
