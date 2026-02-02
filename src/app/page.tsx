'use client';

import { useQuery } from '@tanstack/react-query';
import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult } from '@/types';
import { RefreshCw, Search, TrendingUp, Sparkles } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['scan'],
    queryFn: async () => {
      const res = await fetch('/api/scan');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as AnalysisResult[];
    },
  });

  const filteredData = data?.filter(s =>
    s.stock_id.includes(searchTerm) ||
    s.stock_name.includes(searchTerm)
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Market Intelligence</span>
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-white via-white to-blue-400 bg-clip-text text-transparent mb-2">
          台股爆發預警系統
        </h1>
        <p className="text-slate-400 text-sm">技術面、籌碼面、量能面三重共振過濾</p>
      </header>

      {/* Action Bar */}
      <div className="flex gap-3 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="搜尋股票代號或名稱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium placeholder:text-slate-600"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl px-4 flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading || isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 w-full bg-slate-900/50 animate-pulse rounded-2xl border border-slate-800" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center bg-rose-500/10 border border-rose-500/20 rounded-2xl">
            <p className="text-rose-400 font-bold mb-2">連線發生錯誤</p>
            <button onClick={() => refetch()} className="text-xs underline text-rose-300">重試一次</button>
          </div>
        ) : filteredData?.length === 0 ? (
          <div className="py-20 text-center">
            <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500">當前無爆發潛力標的</p>
          </div>
        ) : (
          filteredData?.map((stock) => (
            <Link key={stock.stock_id} href={`/chart/${stock.stock_id}`}>
              <StockCard data={stock} />
            </Link>
          ))
        )}
      </div>

      {/* Footer / Status */}
      <footer className="mt-12 text-center">
        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">
          Last Scan: {new Date().toLocaleTimeString()}
        </p>
      </footer>
    </div>
  );
}
