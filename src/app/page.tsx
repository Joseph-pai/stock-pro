'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult } from '@/types';
import { Search, TrendingUp, Sparkles, Filter, Star, Loader2, Flame, Target } from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'discovery' | 'filtering' | 'analyzing' | 'complete';

export default function DashboardPage() {
  const [stage, setStage] = useState<ScanStage>('idle');
  const [discoveryData, setDiscoveryData] = useState<AnalysisResult[]>([]);
  const [filteredData, setFilteredData] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<any>(null);

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
      setTiming(json.timing);
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
      setTiming(json.timing);
      setStage('idle');
    } catch (e: any) {
      setError(e.message);
      setStage('idle');
    }
  };

  const currentDisplay = useMemo(() => {
    if (filteredData.length > 0) return filteredData;
    return discoveryData;
  }, [discoveryData, filteredData]);

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
            {filteredData.length > 0 ? '深度篩選完成' : discoveryData.length > 0 ? '潛力股已發現' : '智慧掃描系統'}
          </span>
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-white via-white to-blue-400 bg-clip-text text-transparent mb-2">
          台股爆發預警系統
        </h1>
        <p className="text-slate-400 text-sm">專業三段式掃描：量能激增 → 籌碼確認 → 個股分析</p>
      </header>

      {/* Stage Controls */}
      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={runDiscovery}
            disabled={isWorking}
            className={clsx(
              "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95 group",
              discoveryData.length > 0 ? "bg-amber-600/20 border-amber-500 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-500"
            )}
          >
            {stage === 'discovery' ? <Loader2 className="w-6 h-6 mb-1 animate-spin" /> : <Flame className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-xs font-bold uppercase">1. 三大信號共振</span>
            <span className="text-[9px] text-slate-600 mt-1">嚴格標準・寧缺毋濫</span>
          </button>

          <button
            onClick={runFilter}
            disabled={isWorking || discoveryData.length === 0}
            className={clsx(
              "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95 group",
              filteredData.length > 0 ? "bg-purple-600/20 border-purple-500 text-purple-400" : "bg-slate-900 border-slate-800 text-slate-500",
              discoveryData.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            {stage === 'filtering' ? <Loader2 className="w-6 h-6 mb-1 animate-spin" /> : <Filter className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-xs font-bold uppercase">2. 深度篩選</span>
            <span className="text-[9px] text-slate-600 mt-1">投信連買+技術確認</span>
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

        {/* Timing Info */}
        {timing && (
          <div className="text-center text-[10px] text-slate-600 font-mono">
            掃描耗時：{timing.total}ms
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-6 text-center">
          <p className="text-rose-400 text-sm font-bold">{error}</p>
          <button onClick={runDiscovery} className="text-[10px] uppercase font-black text-rose-300 mt-2 underline">重新掃描</button>
        </div>
      )}

      {/* Results List */}
      <div className="space-y-4">
        {discoveryData.length === 0 && !isWorking ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-900 rounded-3xl">
            <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">尚未啟動掃描</p>
            <p className="text-slate-600 text-xs mt-1 px-10 leading-relaxed">
              點擊「1. 選出潛力股」開始掃描。系統將篩選出量能激增 (3.5x) + 均線糾結 (&lt;2%) + 突破確認 (&gt;3%) 的股票。
            </p>
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

      {/* 說明圖例 */}
      <footer className="mt-12 p-6 bg-slate-900/40 rounded-3xl border border-white/5">
        <div className="space-y-3 text-sm text-slate-400">
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 rounded-full bg-rose-500 mt-1 shrink-0" />
            <div>
              <span className="font-bold text-rose-400">紅色數字</span>
              <span className="mx-2">→</span>
              <span>代表<span className="font-black text-white">上漲</span>（台股習慣，與美股相反）</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1 shrink-0" />
            <div>
              <span className="font-bold text-emerald-400">綠色數字</span>
              <span className="mx-2">→</span>
              <span>代表<span className="font-black text-white">下跌</span></span>
            </div>
          </div>
          <div className="pt-3 border-t border-white/5 text-xs text-slate-500">
            <p><span className="font-bold">階段 1 (選出潛力股)</span>：量能激增 3.5x + 均線糾結 &lt;2% + 突破 3%，選出前 50 名</p>
            <p className="mt-1"><span className="font-bold">階段 2 (深度篩選)</span>：投信連買 3 日 + 量能遞增 + 技術確認，篩選前 30 名</p>
            <p className="mt-1"><span className="font-bold">點擊個股</span>：查看完整 K 線圖、三大信號詳解、凱利建議與風險提示</p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-700 font-mono" suppressHydrationWarning>
          台股爆發預警系統 v4.0 | {new Date().toLocaleString('zh-TW')}
        </p>
      </footer>
    </div>
  );
}
