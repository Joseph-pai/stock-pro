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
    index?: number;
    onClick?: () => void;
}

export const StockCard: React.FC<StockCardProps> = ({ data, index, onClick }) => {
    const isPositive = data.change_percent >= 0;
    const volTrend = data.dailyVolumeTrend || [];
    const maxVol = Math.max(...volTrend, 1);

    return (
        <div
            onClick={onClick}
            className="group relative overflow-hidden rounded-3xl bg-white/5 p-6 backdrop-blur-md border border-white/10 transition-all hover:bg-white/15 hover:scale-[1.01] cursor-pointer"
        >
            <div className="flex items-start justify-between relative z-10">
                <div className="flex gap-4 items-center">
                    {/* 排名編號 */}
                    {index !== undefined && (
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-800/80 border border-white/10 text-base font-black text-slate-400 group-hover:text-blue-400 group-hover:border-blue-500/50 transition-colors">
                            {index}
                        </div>
                    )}
                    <div>
                        <h3 className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors tracking-tight">
                            {data.stock_name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-gray-500 font-mono font-bold tracking-widest">{data.stock_id}</p>
                            {data.consecutive_buy > 0 && (
                                <span className="flex items-center text-xs font-black bg-rose-500/10 text-rose-400 px-2 py-1 rounded-full border border-rose-500/20 uppercase tracking-tighter">
                                    投信主力進場
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-xs text-slate-500 font-bold mb-1">股價</div>
                    <div className={cn(
                        "text-4xl font-black font-mono leading-none tracking-tighter",
                        isPositive ? "text-rose-500" : "text-emerald-500"
                    )}>
                        {data.close?.toFixed(2) || '---'}
                    </div>
                    <div className="text-xs text-slate-500 font-bold mt-2 mb-1">漲跌幅</div>
                    <div className={cn(
                        "text-base font-black uppercase tracking-widest",
                        isPositive ? "text-rose-500/90" : "text-emerald-500/90"
                    )}>
                        {isPositive ? '▲' : '▼'} {(data.change_percent * 100).toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* 指標數據區 */}
            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/5 pt-5">
                <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wider text-gray-500 font-black mb-2">綜合評分</span>
                    <div className="flex items-center gap-2">
                        <Zap className={cn("w-4 h-4", data.score > 0 ? "text-amber-400 fill-amber-400" : "text-slate-700")} />
                        <span className={cn("text-xl font-black italic font-mono", data.score > 0 ? "text-white" : "text-slate-600")}>
                            {data.score > 0 ? data.score.toFixed(1) : '---'}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1">0-1 分制</span>
                </div>

                <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wider text-gray-500 font-black mb-2">量能倍數</span>
                    <div className="flex items-center gap-2">
                        <Activity className={cn("w-4 h-4", data.v_ratio > 0 ? "text-blue-400" : "text-slate-700")} />
                        <span className={cn("text-lg font-black font-mono", data.v_ratio > 0 ? "text-white" : "text-slate-600")}>
                            {data.v_ratio > 0 ? `${data.v_ratio.toFixed(1)}x` : '---'}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1">相對均量</span>
                </div>

                <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wider text-gray-500 font-black mb-2">法人籌碼</span>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className={cn("w-4 h-4", data.consecutive_buy > 0 ? "text-rose-400" : "text-slate-700")} />
                        <span className={cn("text-xs font-black uppercase tracking-tighter truncate", data.consecutive_buy > 0 ? "text-rose-300" : "text-slate-600")}>
                            {data.consecutive_buy > 0 ? '連續買超' : '待深度掃描'}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1">投信動向</span>
                </div>
            </div>

            {/* 成交量趨勢圖 */}
            {volTrend.length > 0 && (
                <div className="mt-5 flex justify-between items-end h-8 gap-[2px] opacity-40 group-hover:opacity-70 transition-opacity">
                    {volTrend.map((v, i) => (
                        <div key={i} className="flex-1 bg-slate-700 rounded-t-sm" style={{ height: `${(v / maxVol) * 100}%` }} />
                    ))}
                </div>
            )}
        </div>
    );
};
