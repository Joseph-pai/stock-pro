'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult } from '@/types';
import { Search, TrendingUp, Sparkles, Filter, Star, Loader2 } from 'lucide-react';
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

  const runDiscovery = async () => {
    setStage('discovery');
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'discovery' })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDiscoveryData(json.data);
      setFilteredData([]);
      setRecomData([]);
      setStage('idle');
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  const runFilter = async () => {
    if (discoveryData.length === 0) return;
    setStage('filtering');
    try {
      const ids = discoveryData.map(d => d.stock_id);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'filter', stockIds: ids })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFilteredData(json.data);
      setRecomData([]); // Clear recommended to show filtered view
      setStage('idle');
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  const runRecommend = async () => {
    if (filteredData.length === 0) return;
    setStage('recommending');
    try {
      // Analyze top 10 for speed
      const topCandidates = filteredData.slice(0, 10);
      const results = await Promise.all(
        topCandidates.map(async (s) => {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

  const isWorking = stage !== 'idle' && stage !== 'complete';

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
            {recomData.length > 0 ? 'Expert Insights Ready' : 'Discovery Mode'}
          </span>
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-white via-white to-blue-400 bg-clip-text text-transparent mb-2">
          台股爆發預警系統
        </h1>
        <p className="text-slate-400 text-sm">智慧三段式掃描：發現 → 深度篩選 → 專家診斷</p>
      </header>

      {/* Stage Controls */}
      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={runDiscovery}
            disabled={isWorking}
            className={clsx(
              "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 group",
              discoveryData.length > 0 ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-slate-900 border-slate-800 text-slate-500"
            )}
          >
            {stage === 'discovery' ? <Loader2 className="w-5 h-5 mb-1 animate-spin" /> : <Search className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-[10px] font-bold uppercase">1. 選出潛力股</span>
          </button>

          <button
            onClick={runFilter}
            disabled={isWorking || discoveryData.length === 0}
            className={clsx(
              "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 group",
              filteredData.length > 0 ? "bg-purple-600/20 border-purple-500 text-purple-400" : "bg-slate-900 border-slate-800 text-slate-500",
              discoveryData.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            {stage === 'filtering' ? <Loader2 className="w-5 h-5 mb-1 animate-spin" /> : <Filter className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-[10px] font-bold uppercase">2. 深度篩選 30</span>
          </button>

          <button
            onClick={runRecommend}
            disabled={isWorking || filteredData.length === 0}
            className={clsx(
              "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 group",
              stage === 'complete' ? "bg-amber-600/20 border-amber-500 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-500",
              filteredData.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            {stage === 'recommending' ? <Loader2 className="w-5 h-5 mb-1 animate-spin" /> : <Star className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-[10px] font-bold uppercase">3. 推薦關注</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="搜尋股票代號或名稱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-6 text-center">
          <p className="text-rose-400 text-sm font-bold">{error}</p>
          <button onClick={runDiscovery} className="text-[10px] uppercase font-black text-rose-300 mt-2 underline">Restart Scan</button>
        </div>
      )}

      {/* Results List */}
      <div className="space-y-4">
        {discoveryData.length === 0 && !isWorking ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-900 rounded-3xl">
            <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">尚未啟動掃描</p>
            <p className="text-slate-600 text-xs mt-1 px-10 leading-relaxed">請點擊上方步驟 1 獲取今日市場最新潛力標的。分段掃描能提供更精準的籌碼與技術分析。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSearched.map((stock, index) => (
              <Link key={stock.stock_id} href={`/chart/${stock.stock_id}`}>
                <StockCard data={stock} index={index + 1} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Legend / Status Footer */}
      <footer className="mt-12 p-6 bg-slate-900/40 rounded-3xl border border-white/5">
        <div className="grid grid-cols-2 gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500" />
            <span>紅字：漲幅 (Taiwan Style)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>+0.0%：持平/初始發現</span>
          </div>
        </div>
        <p className="mt-6 text-center text-[9px] text-slate-700 font-mono" suppressHydrationWarning>
          SCANNER v3.1 | {new Date().toLocaleTimeString()}
        </p>
      </footer>
    </div>
  );
}
