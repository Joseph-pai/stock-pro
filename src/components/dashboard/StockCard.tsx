import React from 'react';
import { AnalysisResult } from '@/types';
import { TrendingUp, Activity, Zap, ShieldCheck } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface StockCardProps {
    data: AnalysisResult;
    onClick?: () => void;
}

export const StockCard: React.FC<StockCardProps> = ({ data, onClick }) => {
    const isPositive = data.change_percent >= 0;
    const volTrend = data.dailyVolumeTrend || [];
    const maxVol = Math.max(...volTrend, 1);

    return (
        <div
            onClick={onClick}
            className="group relative overflow-hidden rounded-2xl bg-white/10 p-5 backdrop-blur-md border border-white/20 transition-all hover:bg-white/15 hover:scale-[1.02] cursor-pointer"
        >
            {/* Background Gradient Effect */}
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl group-hover:bg-blue-500/20 transition-all" />

            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                        {data.stock_name}
                    </h3>
                    <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-400 font-mono">{data.stock_id}</p>
                        {data.consecutive_buy > 0 && (
                            <span className="flex items-center text-[10px] font-bold bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30">
                                投信連買
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-right">
                    <div className={cn(
                        "text-xl font-black font-mono leading-none",
                        isPositive ? "text-rose-500" : "text-emerald-500"
                    )}>
                        {data.close.toFixed(2)}
                    </div>
                    <div className={cn(
                        "text-xs font-bold mt-1",
                        isPositive ? "text-rose-500/80" : "text-emerald-500/80"
                    )}>
                        {isPositive ? '+' : ''}{(data.change_percent * 100).toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
                {/* Score */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Score</span>
                    <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="text-lg font-black text-white italic">
                            {data.score.toFixed(1)}
                        </span>
                    </div>
                </div>

                {/* V-Ratio */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Vol Ratio</span>
                    <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-blue-400" />
                        <span className="text-sm font-bold text-white">x{data.v_ratio.toFixed(1)}</span>
                    </div>
                </div>

                {/* Inst Status */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Inst.</span>
                    <div className="flex items-center gap-1">
                        <ShieldCheck className={cn("w-3 h-3", data.consecutive_buy > 0 ? "text-rose-400" : "text-slate-600")} />
                        <span className={cn("text-xs font-bold", data.consecutive_buy > 0 ? "text-rose-300" : "text-slate-500")}>
                            {data.consecutive_buy > 0 ? 'Accumulating' : '-'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Volume Trend Chart (Mini Bar Chart) */}
            {volTrend.length > 0 && (
                <div className="mt-4">
                    <div className="flex justify-between items-end h-8 gap-[2px]">
                        {volTrend.map((v, i) => {
                            const height = Math.max(10, (v / maxVol) * 100);
                            const isIncrease = i > 0 && v > volTrend[i - 1];
                            return (
                                <div key={i} className="flex-1 flex flex-col justify-end h-full group/bar relative">
                                    <div
                                        style={{ height: `${height}%` }}
                                        className={cn(
                                            "w-full rounded-sm opacity-60 transition-all",
                                            isIncrease ? "bg-rose-500" : "bg-slate-500",
                                            i === volTrend.length - 1 && "opacity-100 bg-blue-400 ring-2 ring-blue-500/50"
                                        )}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-slate-600">10 Days Ago</span>
                        <span className="text-[9px] text-slate-600">Today</span>
                    </div>
                </div>
            )}

            {/* Tags */}
            <div className="mt-3 flex flex-wrap gap-2">
                {data.tags.map(tag => (
                    <span
                        key={tag}
                        className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter border",
                            tag === 'VOLUME_EXPLOSION' && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                            tag === 'BREAKOUT' && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                            tag === 'INST_BUYING' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                            tag === 'MA_SQUEEZE' && "bg-purple-500/10 text-purple-500 border-purple-500/20",
                        )}
                    >
                        {tag.replace('_', ' ')}
                    </span>
                ))}
            </div>
        </div>
    );
};
