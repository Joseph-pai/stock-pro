'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult, StockData } from '@/types';
import { Search, TrendingUp, Sparkles, Filter, Star, Loader2, Flame, Target, Settings } from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'fetching' | 'filtering' | 'analyzing' | 'complete';

interface ScanSettings {
  volumeRatio: number;      // 量能倍數
  maConstrict: number;      // 均線糾結度 (%)
  breakoutPercent: number;  // 突破幅度 (%)
}

const DEFAULT_SETTINGS: ScanSettings = {
  volumeRatio: 3.5,
  maConstrict: 2.0,
  breakoutPercent: 3.0
};

export default function DashboardPage() {
  const [stage, setStage] = useState<ScanStage>('idle');
  const [discoveryData, setDiscoveryData] = useState<AnalysisResult[]>([]);
  const [filteredData, setFilteredData] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  const runDiscovery = async () => {
    setStage('fetching');
    setError(null);
    setProgress({ current: 0, total: 0, phase: '獲取市場快照（上市+上櫃）...' });

    try {
      // Phase 1: 獲取市場快照
      const t0 = Date.now();
      const snapshotRes = await fetch('/api/market/snapshot');
      const snapshotJson = await snapshotRes.json();

      if (!snapshotJson.success) {
        throw new Error(snapshotJson.error);
      }

      const snapshot: StockData[] = snapshotJson.data;
      const t1 = Date.now();

      setProgress({
        current: snapshot.length,
        total: snapshot.length,
        phase: `已獲取 ${snapshot.length} 支股票快照（上市+上櫃）`
      });

      // Phase 2: 前端初步篩選
      setStage('filtering');
      setProgress({ current: 0, total: snapshot.length, phase: '前端篩選中...' });

      const candidates = snapshot
        .filter(s => s.Trading_Volume > 2000 && s.close > s.open)
        .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
        .slice(0, 100);

      const t2 = Date.now();

      setProgress({
        current: candidates.length,
        total: snapshot.length,
        phase: `已篩選出 ${candidates.length} 支候選股票`
      });

      // Phase 3: 後端深度分析（帶自定義參數）
      setStage('analyzing');
      setProgress({
        current: 0,
        total: candidates.length,
        phase: `深度分析中（量能${settings.volumeRatio}x + 均線${settings.maConstrict}% + 突破${settings.breakoutPercent}%）...`
      });

      const analyzeRes = await fetch('/api/scan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockIds: candidates.map(c => c.stock_id),
          settings: settings  // 傳遞用戶設定
        })
      });

      const analyzeJson = await analyzeRes.json();

      if (!analyzeJson.success) {
        throw new Error(analyzeJson.error);
      }

      const t3 = Date.now();

      setDiscoveryData(analyzeJson.data);
      setFilteredData([]);
      setTiming({
        snapshot: t1 - t0,
        filter: t2 - t1,
        analyze: t3 - t2,
        total: t3 - t0,
        candidatesCount: candidates.length,
        totalStocks: snapshot.length
      });

      if (analyzeJson.count === 0) {
        setProgress({
          current: 0,
          total: candidates.length,
          phase: `未找到符合條件的股票（已分析 ${candidates.length} 支候選）`
        });
      } else {
        setProgress({
          current: analyzeJson.count,
          total: candidates.length,
          phase: `完成！發現 ${analyzeJson.count} 支符合條件的股票`
        });
      }

      setStage('complete');

      setTimeout(() => setStage('idle'), 2000);

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
            {filteredData.length > 0 ? '深度篩選完成' : discoveryData.length > 0 ? `發現 ${discoveryData.length} 支潛力股` : '智慧掃描系統'}
          </span>
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-white via-white to-blue-400 bg-clip-text text-transparent mb-2">
          台股爆發預警系統
        </h1>
        <p className="text-slate-400 text-sm">專業三段式掃描：三大信號共振 → 籌碼確認 → 個股分析</p>
      </header>

      {/* Settings Panel */}
      <div className="mb-6">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-blue-500/50 transition-colors text-sm font-bold text-slate-400 hover:text-blue-400"
        >
          <Settings className="w-4 h-4" />
          <span>自定義篩選標準</span>
          <span className="text-xs text-slate-600">
            (量能{settings.volumeRatio}x・均線{settings.maConstrict}%・突破{settings.breakoutPercent}%)
          </span>
        </button>

        {showSettings && (
          <div className="mt-4 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4">
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-300">量能倍數</span>
                <span className="text-xs text-slate-500">當日成交量 ÷ 過去20日均量</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1.5"
                  max="5.0"
                  step="0.5"
                  value={settings.volumeRatio}
                  onChange={(e) => setSettings({ ...settings, volumeRatio: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-lg font-black text-amber-400 w-16 text-right">{settings.volumeRatio}x</span>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-300">均線糾結度</span>
                <span className="text-xs text-slate-500">|MA5 - MA20| ÷ MA20</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.5"
                  value={settings.maConstrict}
                  onChange={(e) => setSettings({ ...settings, maConstrict: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-lg font-black text-purple-400 w-16 text-right">{settings.maConstrict}%</span>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-300">突破幅度</span>
                <span className="text-xs text-slate-500">當日漲幅 (收盤-開盤) ÷ 開盤</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.5"
                  value={settings.breakoutPercent}
                  onChange={(e) => setSettings({ ...settings, breakoutPercent: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-lg font-black text-emerald-400 w-16 text-right">{settings.breakoutPercent}%</span>
              </div>
            </div>

            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="w-full py-2 text-xs font-bold text-slate-500 hover:text-blue-400 transition-colors"
            >
              重置為預設值（3.5x / 2% / 3%）
            </button>
          </div>
        )}
      </div>

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
            {isWorking ? <Loader2 className="w-6 h-6 mb-1 animate-spin" /> : <Flame className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />}
            <span className="text-xs font-bold uppercase">1. 三大信號共振</span>
            <span className="text-[9px] text-slate-600 mt-1">上市+上櫃全市場掃描</span>
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

        {/* Progress Indicator */}
        {isWorking && (
          <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{progress.phase}</span>
              {progress.total > 0 && (
                <span className="text-xs font-mono text-slate-500">
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '50%' }}
              />
            </div>
          </div>
        )}

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
          <div className="text-center text-[10px] text-slate-600 font-mono space-y-1">
            <div>快照: {timing.snapshot}ms | 前端篩選: {timing.filter}ms | 深度分析: {timing.analyze}ms</div>
            <div className="text-slate-500">總耗時: {timing.total}ms | 全市場: {timing.totalStocks} 支 | 候選: {timing.candidatesCount} 支</div>
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
        {discoveryData.length === 0 && !isWorking && stage !== 'complete' ? (
          <div className="py-20 text-center border-2 border-dashed border-slate-900 rounded-3xl">
            <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">尚未啟動掃描</p>
            <p className="text-slate-600 text-xs mt-1 px-10 leading-relaxed">
              點擊「1. 三大信號共振」開始掃描<span className="font-bold text-white">全市場（上市+上櫃）</span>
              <br />系統將以您設定的標準篩選爆發前兆股
              <br /><span className="text-amber-400">可調整篩選標準以獲得更多或更少的結果</span>
            </p>
          </div>
        ) : discoveryData.length === 0 && stage === 'complete' ? (
          <div className="py-20 text-center border-2 border-dashed border-rose-900/30 rounded-3xl bg-rose-500/5">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-rose-400 font-bold text-lg">沒有符合條件的股票</p>
            <p className="text-slate-500 text-sm mt-2 px-10 leading-relaxed">
              已掃描 {timing?.totalStocks || 0} 支股票（上市+上櫃），分析了 {timing?.candidatesCount || 0} 支候選
              <br />但未找到同時符合三大信號共振的股票
            </p>
            <div className="mt-6 space-y-2">
              <p className="text-xs text-slate-600">💡 建議：</p>
              <button
                onClick={() => setShowSettings(true)}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 underline"
              >
                調整篩選標準（降低量能倍數或均線糾結度）
              </button>
            </div>
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
            <p><span className="font-bold">掃描範圍</span>：全市場（上市 TWSE + 上櫃 TPEX），約 1800-2000 支股票</p>
            <p className="mt-1"><span className="font-bold">階段 1</span>：三大信號共振（可自定義標準）</p>
            <p className="mt-1"><span className="font-bold">階段 2</span>：投信連買 3 日 + 量能遞增 + 技術確認</p>
            <p className="mt-1"><span className="font-bold">點擊個股</span>：查看完整 K 線圖、三大信號詳解、凱利建議與風險提示</p>
            <p className="mt-2 text-[10px] text-slate-600">💡 找不到股票？試試調整篩選標準以放寬或收緊條件</p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-700 font-mono" suppressHydrationWarning>
          台股爆發預警系統 v6.0 | {new Date().toLocaleString('zh-TW')}
        </p>
      </footer>
    </div>
  );
}
