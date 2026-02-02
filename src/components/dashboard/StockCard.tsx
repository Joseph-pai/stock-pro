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
                    <p className="text-sm text-gray-400 font-mono">{data.stock_id}</p>
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

            <div className="mt-6 flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Breakout Score</span>
                    <div className="flex items-center gap-1">
                        <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span className="text-2xl font-black text-white italic">
                            {data.score.toFixed(1)}
                        </span>
                    </div>
                </div>

                <div className="h-8 w-[1px] bg-white/10" />

                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">V-Ratio</span>
                    <div className="flex items-center gap-1">
                        <Activity className="w-4 h-4 text-blue-400" />
                        <span className="text-lg font-bold text-white">x{data.v_ratio.toFixed(1)}</span>
                    </div>
                </div>
            </div>

            {data.verdict && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-slate-800/50 border border-white/5 text-xs text-center">
                    <span className="text-slate-400 font-mono tracking-tight mr-2">Verdict:</span>
                    <span className="text-slate-200 font-bold">{data.verdict}</span>
                </div>
            )}


            <div className="mt-4 flex flex-wrap gap-2">
                {data.tags.map(tag => (
                    <span
                        key={tag}
                        className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border",
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
