import React from 'react';
import { AnalysisResult } from '@/types';
import { Activity, Zap, ShieldCheck } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface StockCardProps {
    data: AnalysisResult;
    index?: number; // Added for numbering
    onClick?: () => void;
}

export const StockCard: React.FC<StockCardProps> = ({ data, index, onClick }) => {
    // Taiwan Market logic: Red is UP, Green is DOWN
    // For Stage 1 discovery, change_percent might be 0 until deep scan
    const isPositive = data.change_percent >= 0;
    const volTrend = data.dailyVolumeTrend || [];
    const maxVol = Math.max(...volTrend, 1);

    return (
        <div
            onClick={onClick}
            className="group relative overflow-hidden rounded-2xl bg-white/5 p-5 backdrop-blur-md border border-white/10 transition-all hover:bg-white/15 hover:scale-[1.01] cursor-pointer"
        >
            <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-4 items-center">
                    {/* Index Number */}
                    {index !== undefined && (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/80 border border-white/10 text-xs font-black text-slate-400 group-hover:text-blue-400 group-hover:border-blue-500/50 transition-colors">
                            {index}
                        </div>
                    )}
                    <div>
                        <h3 className="text-lg font-black text-white group-hover:text-blue-400 transition-colors tracking-tight">
                            {data.stock_name}
                        </h3>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-500 font-mono font-bold tracking-widest">{data.stock_id}</p>
                            {data.consecutive_buy > 0 && (
                                <span className="flex items-center text-[9px] font-black bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-tighter">
                                    投信主力進場
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className={cn(
                        "text-2xl font-black font-mono leading-none tracking-tighter",
                        // Red text for positive change in TWSE
                        isPositive ? "text-rose-500" : "text-emerald-500"
                    )}>
                        {data.close?.toFixed(2) || '---'}
                    </div>
                    <div className={cn(
                        "text-[10px] font-black mt-1 uppercase tracking-widest",
                        isPositive ? "text-rose-500/70" : "text-emerald-500/70"
                    )}>
                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
                <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Score</span>
                    <div className="flex items-center gap-1.5">
                        <Zap className={cn("w-3 h-3", data.score > 0 ? "text-amber-400 fill-amber-400" : "text-slate-700")} />
                        <span className={cn("text-base font-black italic font-mono", data.score > 0 ? "text-white" : "text-slate-600")}>
                            {data.score > 0 ? data.score.toFixed(1) : '---'}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Vol Ratio</span>
                    <div className="flex items-center gap-1.5">
                        <Activity className={cn("w-3 h-3", data.v_ratio > 0 ? "text-blue-400" : "text-slate-700")} />
                        <span className={cn("text-sm font-black font-mono", data.v_ratio > 0 ? "text-white" : "text-slate-600")}>
                            {data.v_ratio > 0 ? `x${data.v_ratio.toFixed(1)}` : '---'}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Institutional</span>
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className={cn("w-3 h-3", data.consecutive_buy > 0 ? "text-rose-400" : "text-slate-700")} />
                        <span className={cn("text-[10px] font-black uppercase tracking-tighter truncate", data.consecutive_buy > 0 ? "text-rose-300" : "text-slate-600")}>
                            {data.consecutive_buy > 0 ? 'Buy Streak' : 'Pending Scan'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Mini Vol Chart - For Visual Depth */}
            {volTrend.length > 0 && (
                <div className="mt-4 flex justify-between items-end h-6 gap-[1px] opacity-40 group-hover:opacity-70 transition-opacity">
                    {volTrend.map((v, i) => (
                        <div key={i} className="flex-1 bg-slate-700 rounded-t-sm" style={{ height: `${(v / maxVol) * 100}%` }} />
                    ))}
                </div>
            )}
        </div>
    );
};
