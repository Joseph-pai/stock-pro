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
    const hasVolumeExplosion = data.v_ratio >= 3.0;
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
                        {/* Improved Header: ID, Name, Sector */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="text-3xl font-black text-blue-400 font-mono tracking-tighter tabular-nums">
                                {data.stock_id}
                            </span>
                            <h3 className="text-4xl font-black text-white group-hover:text-blue-200 transition-colors tracking-tight">
                                {data.stock_name}
                            </h3>
                            {data.sector_name && (
                                <span className={cn(
                                    "text-sm font-black px-3 py-1.5 rounded-lg border font-mono tracking-widest",
                                    // Highlight if it's a specific industry (not generic board name)
                                    !data.sector_name?.includes('板') 
                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                        : "bg-slate-800/80 text-slate-500 border-white/5"
                                )}>
                                    {data.sector_name}
                                </span>
                            )}
                        </div>

                        {/* Resonance Tags - Scaled up for readability */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {hasVolumeExplosion && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/30 font-mono">
                                    <Flame className="w-4 h-4" />
                                    量能激增 {data.v_ratio.toFixed(1)}x
                                </span>
                            )}
                            {hasMaSqueeze && (
                                <span className="flex items-center gap-1.5 text-xs font-black bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full border border-purple-500/30">
                                    📉 均線糾結 {(data.maConstrictValue! * 100).toFixed(1)}%
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

            {/* Indicator Grid - Enhanced for User Request */}
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Flame className={cn("w-5 h-5", data.v_ratio >= 1.5 ? "text-amber-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">量能%</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono italic", data.v_ratio >= 1.5 ? "text-white" : "text-slate-700")}>
                        {(data.v_ratio * 100).toFixed(0)}%
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className={cn("w-5 h-5", (data.maConstrictValue || 1) <= 0.05 ? "text-purple-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">均線糾結</span>
                    </div>
                    <span className={cn("text-3xl font-black font-mono", (data.maConstrictValue || 1) <= 0.05 ? "text-white" : "text-slate-700")}>
                        {data.maConstrictValue ? `${(data.maConstrictValue * 100).toFixed(1)}%` : '--'}
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className={cn("w-5 h-5", data.today_volume && data.today_volume > 0 ? "text-blue-400" : "text-slate-700")} />
                        <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-black">量能數值</span>
                    </div>
                    <span className={cn("text-2xl font-black font-mono", data.today_volume ? "text-white" : "text-slate-700")}>
                        {data.today_volume ? `${Math.round(data.today_volume).toLocaleString()} 張` : '--'}
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
