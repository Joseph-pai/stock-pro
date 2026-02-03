'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult } from '@/types';
import { RefreshCw, Search, TrendingUp, Sparkles, Filter, CheckCircle2, Star } from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'discovery' | 'filtering' | 'recommending' | 'complete';

export default function DashboardPage() {
  const [stage, setStage] = useState<ScanStage>('idle');
  const [discoveryData, setDiscoveryData] = useState<AnalysisResult[]>([]);
  const [filteredData, setFilteredData] = useState<AnalysisResult[]>([]);
  const [recomData, setRecomData] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 1. Stage 1: Discovery (50 potential)
  const runDiscovery = async () => {
    setStage('discovery');
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ stage: 'discovery' })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDiscoveryData(json.data);
      setFilteredData([]);
      setRecomData([]);
      setStage('idle'); // Back to idle but with data
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  // 2. Stage 2: Deep Filtering (Narrow to 30)
  const runFilter = async () => {
    if (discoveryData.length === 0) return;
    setStage('filtering');
    try {
      const ids = discoveryData.map(d => d.stock_id);
      const res = await fetch('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ stage: 'filter', stockIds: ids })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFilteredData(json.data);
      setStage('idle');
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  // 3. Stage 3: Recommended (Expert Analysis)
  const runRecommend = async () => {
    if (filteredData.length === 0) return;
    setStage('recommending');
    try {
      // We'll analyze top 10 recommended for speed in this batch
      const top10 = filteredData.slice(0, 10);
      const results = await Promise.all(
        top10.map(async (s) => {
          const res = await fetch('/api/scan', {
            method: 'POST',
            body: JSON.stringify({ stage: 'expert', stockId: s.stock_id })
          });
          const json = await res.json();
          return json.success ? { ...json.data, is_recommended: true } : null;
        })
      );
      const validResults = results.filter(Boolean) as AnalysisResult[];
      setRecomData(validResults.sort((a, b) => (b.comprehensiveScoreDetails?.total || 0) - (a.comprehensiveScoreDetails?.total || 0)));
      setStage('complete');
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  const currentDisplay = useMemo(() => {
    if (recomData.length > 0) return recomData;
    if (filteredData.length > 0) return filteredData;
    return discoveryData;
  }, [discoveryData, filteredData, recomData]);

  const filteredAndSearched = currentDisplay.filter(s =>
    s.stock_id.includes(searchTerm) || s.stock_name.includes(searchTerm)
  );

  const isIdle = stage === 'idle';
  const isWorking = stage !== 'idle' && stage !== 'complete';

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
            {stage === 'complete' ? 'Expert Analysis Ready' : 'Market Intelligence 2026'}
          </span>
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-white via-white to-blue-400 bg-clip-text text-transparent mb-2">
          台股爆發預警系統
        </h1>
        <p className="text-slate-400 text-sm">分段式深度掃描：發現 → 篩選 → 專家推薦</p>
      </header>

      {/* Step Selector / Action Bar */}
      <div className="space-y-4 mb-8">
        <div className="flex gap-2">
          <button
            onClick={runDiscovery}
            disabled={isWorking}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95",
              discoveryData.length > 0 ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-slate-900 border-slate-800 text-slate-500"
            )}
          >
            <Search className={clsx("w-5 h-5 mb-1", stage === 'discovery' && 'animate-pulse')} />
            <span className="text-[10px] font-bold uppercase">1. 選出潛力股</span>
          </button>

          <button
            onClick={runFilter}
            disabled={isWorking || discoveryData.length === 0}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95",
              filteredData.length > 0 ? "bg-purple-600/20 border-purple-500 text-purple-400" : "bg-slate-900 border-slate-800 text-slate-500",
              discoveryData.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            <Filter className={clsx("w-5 h-5 mb-1", stage === 'filtering' && 'animate-spin')} />
            <span className="text-[10px] font-bold uppercase">2. 深度篩選 30</span>
          </button>

          <button
            onClick={runRecommend}
            disabled={isWorking || filteredData.length === 0}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95",
              stage === 'complete' ? "bg-amber-600/20 border-amber-500 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-500",
              filteredData.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            <Star className={clsx("w-5 h-5 mb-1", stage === 'recommending' && 'animate-bounce')} />
            <span className="text-[10px] font-bold uppercase">3. 推薦關注</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="搜尋股票代號或名稱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Status Messages */}
      {stage !== 'idle' && stage !== 'complete' && (
        <div className="flex items-center justify-center gap-3 p-4 mb-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
          <span className="text-sm font-medium text-blue-400 animate-pulse">
            {stage === 'discovery' && '正在獲取全市場今日快照...'}
            {stage === 'filtering' && '正在分析前 50 名股票成交量與技術面...'}
            {stage === 'recommending' && '正在進行專家診斷與凱利公式計算...'}
          </span>
        </div>
      )}

      {error && (
        <div className="p-6 text-center bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-6">
          <p className="text-rose-400 font-bold mb-1">發生錯誤</p>
          <p className="text-xs text-rose-300/70 mb-3">{error}</p>
          <button onClick={runDiscovery} className="text-xs font-bold bg-rose-500/20 text-rose-300 px-4 py-2 rounded-lg border border-rose-500/30">
            重新啟動掃描
          </button>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {discoveryData.length === 0 && !isWorking && !error ? (
          <div className="py-20 text-center">
            <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">請點擊上方「1. 選出潛力股」開始</p>
            <p className="text-slate-600 text-xs mt-1">分段執行可避免網路逾時並獲得更精準的結果</p>
          </div>
        ) : (
          filteredAndSearched.map((stock) => (
            <Link key={stock.stock_id} href={`/chart/${stock.stock_id}`}>
              <StockCard data={stock} />
            </Link>
          ))
        )}
      </div>

      {/* Footer / Status */}
      <footer className="mt-12 text-center">
        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest" suppressHydrationWarning>
          {discoveryData.length > 0 ? `Discovery Count: ${discoveryData.length}` : 'System Ready'} | {new Date().toLocaleTimeString()}
        </p>
      </footer>
    </div>
  );
}
