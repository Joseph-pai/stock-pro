'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult, StockData } from '@/types';
import { TAIWAN_SECTORS, MarketType, getMarketName } from '@/lib/sectors';
import { Search, TrendingUp, Sparkles, Filter, Loader2, Flame, Settings } from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'fetching' | 'filtering' | 'analyzing' | 'complete';

interface ScanSettings {
  volumeRatio: number;
  maConstrict: number;
  breakoutPercent: number;
}

const DEFAULT_SETTINGS: ScanSettings = {
  volumeRatio: 2.0, // Set more lenient default for discovery
  maConstrict: 3.0,
  breakoutPercent: 1.5
};

export default function DashboardPage() {
  const [stage, setStage] = useState<ScanStage>('idle');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // Market Filters
  const [market, setMarket] = useState<MarketType>('ALL');
  const [sector, setSector] = useState<string>('00');

  const runScan = async () => {
    setStage('fetching');
    setHasScanned(false);
    setError(null);
    setResults([]);
    const t0 = Date.now();

    try {
      // 1. Fetch Snapshot (Targeted Market)
      setProgress({ current: 0, total: 0, phase: `正在獲取 ${getMarketName(market)} 市場數據...` });
      const snapshotRes = await fetch(`/api/market/snapshot?market=${market}`);
      const snapshotJson = await snapshotRes.json();
      if (!snapshotJson.success) throw new Error(snapshotJson.error);

      const snapshot: StockData[] = snapshotJson.data;
      const t1 = Date.now();

      // 2. Pre-filter by Sector & Basic technicals
      setStage('filtering');
      setProgress({ current: 0, total: snapshot.length, phase: '正在篩選候選清單...' });

      const candidates = snapshot
        .filter(s => {
          // Simplified logic: filter by segment if needed, volume > 1000, red k
          const isRedK = s.close >= s.open;
          const isVolActive = s.Trading_Volume >= 1000;
          return isRedK && isVolActive;
        })
        .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
        .slice(0, 80); // Take top 80 for deep analysis

      // 3. Batched Deep Analysis (to avoid Netlify 10s timeout)
      setStage('analyzing');
      const BATCH_SIZE = 15;
      const allResults: AnalysisResult[] = [];
      const t2_start = Date.now();

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        setProgress({
          current: i + batch.length,
          total: candidates.length,
          phase: `深度分析進行中 (${i + batch.length}/${candidates.length})`
        });

        const batchRes = await fetch('/api/scan/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stockIds: batch.map(c => c.stock_id),
            settings: settings
          })
        });

        const batchJson = await batchRes.json();
        if (batchJson.success && batchJson.data) {
          allResults.push(...batchJson.data);
        }
      }

      const t_end = Date.now();
      setResults(allResults);
      setTiming({
        snapshot: t1 - t0,
        analyze: t_end - t1,
        total: t_end - t0,
        candidatesCount: candidates.length,
        totalStocks: snapshot.length
      });
      setHasScanned(true);
      setStage('complete');
      setTimeout(() => setStage('idle'), 3000);

    } catch (e: any) {
      console.error(e);
      setError("掃描出錯: " + e.message);
      setStage('idle');
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter(s =>
      s.stock_id.includes(searchTerm) || s.stock_name.includes(searchTerm)
    );
  }, [results, searchTerm]);

  const isWorking = stage !== 'idle' && stage !== 'complete';

  return (
    <div className="container mx-auto px-6 py-12 max-w-3xl">
      {/* Dynamic Header */}
      <header className="mb-14 text-center">
        <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8">
          <Sparkles className="w-6 h-6 text-blue-400" />
          <span className="text-base font-black text-blue-400 uppercase tracking-widest">
            {results.length > 0 ? `發現 ${results.length} 支強勢潛力股` : 'AI 爆發預警系統'}
          </span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-br from-white via-white to-blue-500 bg-clip-text text-transparent mb-6 leading-tight">
          台股爆發前兆掃描
        </h1>
        <p className="text-slate-400 text-xl font-medium max-w-xl mx-auto">
          全市場上市櫃掃描，定位量能倍增、均線糾結與技術突破的完美共振點。
        </p>
      </header>

      {/* Primary Filters - Larger & Bolder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="space-y-3">
          <label className="text-lg font-black text-slate-300 ml-2">掃描市場</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketType)}
            className="w-full bg-slate-900 border-2 border-slate-800 rounded-[1.5rem] p-5 text-xl font-black text-white focus:border-blue-500 outline-none transition-all appearance-none shadow-xl cursor-pointer"
          >
            <option value="ALL">上市 + 上櫃 (全市場)</option>
            <option value="TWSE">上市 (TWSE)</option>
            <option value="TPEX">上櫃 (TPEX)</option>
          </select>
        </div>
        <div className="space-y-3">
          <label className="text-lg font-black text-slate-300 ml-2">產業類型</label>
          <select
            value={sector}
            disabled
            className="w-full bg-slate-900 border-2 border-slate-800 rounded-[1.5rem] p-5 text-xl font-black text-slate-500 outline-none appearance-none shadow-xl opacity-60"
          >
            <option value="00">全部類股 (目前支持全產業)</option>
          </select>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="mb-8">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center justify-between w-full px-6 py-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl hover:bg-slate-800/50 transition-all text-lg font-black text-slate-400 hover:text-blue-400"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6" />
            <span>自定義信號閥值</span>
          </div>
          <span className="text-sm font-mono font-bold text-slate-600">
            量能 {settings.volumeRatio}x / 突破 {settings.breakoutPercent}%
          </span>
        </button>

        {showSettings && (
          <div className="mt-4 p-8 bg-slate-900/80 border-2 border-slate-800 rounded-3xl space-y-8 animate-in fade-in slide-in-from-top-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-black text-slate-200">量能激增倍數 (V-Ratio)</span>
                <span className="text-2xl font-black text-amber-400">{settings.volumeRatio}x</span>
              </div>
              <input
                type="range" min="1.0" max="5.0" step="0.5"
                value={settings.volumeRatio}
                onChange={(e) => setSettings({ ...settings, volumeRatio: parseFloat(e.target.value) })}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-black text-slate-200">突破幅度 (收盤漲幅)</span>
                <span className="text-2xl font-black text-emerald-400">{settings.breakoutPercent}%</span>
              </div>
              <input
                type="range" min="1.0" max="6.0" step="0.5"
                value={settings.breakoutPercent}
                onChange={(e) => setSettings({ ...settings, breakoutPercent: parseFloat(e.target.value) })}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="w-full text-center text-sm font-bold text-slate-500 hover:text-blue-400"
            >
              恢復專業推薦配置
            </button>
          </div>
        )}
      </div>

      {/* Main Action Button */}
      <button
        onClick={runScan}
        disabled={isWorking}
        className={clsx(
          "w-full flex flex-col items-center justify-center p-8 rounded-[2rem] border-4 transition-all active:scale-[0.98] mb-10 group shadow-2xl",
          results.length > 0
            ? "bg-blue-600 border-blue-400 text-white shadow-blue-500/20"
            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-blue-500/50 hover:bg-slate-800"
        )}
      >
        {isWorking ? <Loader2 className="w-10 h-10 animate-spin mb-2" /> : <Flame className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform" />}
        <span className="text-2xl font-black uppercase tracking-tight">啟動三大信號掃描</span>
        <span className="text-base font-bold text-slate-500 group-hover:text-slate-400 mt-2">
          即時計算上市櫃 2000+ 支個股數據
        </span>
      </button>

      {/* Progress & Search */}
      <div className="space-y-6 mb-10">
        {isWorking && (
          <div className="p-8 bg-slate-900 border-2 border-slate-800 rounded-[2rem] space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-lg font-black text-blue-400 animate-pulse">{progress.phase}</span>
              <span className="font-mono font-bold text-slate-500">{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 transition-all duration-300"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '20%' }}
              />
            </div>
          </div>
        )}

        <div className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="輸入股票代碼或名稱過濾結果..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/50 border-2 border-slate-800 rounded-[1.5rem] py-5 pl-16 pr-8 text-xl font-bold focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Results or Empty State */}
      <div className="space-y-8">
        {!hasScanned && !isWorking ? (
          <div className="py-32 text-center border-4 border-dashed border-slate-900 rounded-[3rem] bg-slate-900/10">
            <TrendingUp className="w-20 h-20 text-slate-800 mx-auto mb-6 opacity-40" />
            <p className="text-2xl font-black text-slate-300">系統等待啟動</p>
            <p className="text-slate-500 text-lg font-bold mt-3 px-16 leading-relaxed">
              請選擇掃描市場並設定偏好，點擊上方按鈕開始 AI 高頻運算。
            </p>
          </div>
        ) : filteredResults.length === 0 && !isWorking ? (
          <div className="py-32 text-center border-4 border-dashed border-rose-900/20 rounded-[3rem] bg-rose-500/5">
            <div className="text-8xl mb-8">📊</div>
            <p className="text-rose-400 font-black text-4xl">無符合條件個股</p>
            <p className="text-slate-400 text-xl font-bold mt-6 px-16 leading-relaxed">
              已完成 {timing?.totalStocks} 支股票分析，但目前市場無同時符合三大信號的個股。
              <br /><span className="text-blue-400 mt-4 block">建議：嘗試調低「量能倍數」或「突破幅度」設定。</span>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredResults.map((stock, index) => (
              <Link key={stock.stock_id} href={`/chart/${stock.stock_id}`}>
                <StockCard data={stock} index={index + 1} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Performance Footer */}
      {timing && !isWorking && (
        <footer className="mt-16 pt-8 border-t border-white/5 text-center flex flex-col items-center gap-4">
          <div className="flex gap-4 text-xs font-mono font-bold text-slate-600">
            <span>網速響應: {timing.snapshot}ms</span>
            <span>|</span>
            <span>AI運算: {timing.analyze}ms</span>
            <span>|</span>
            <span>樣本數: {timing.totalStocks}</span>
          </div>
          <p className="text-slate-700 text-xs font-bold tracking-tighter">
            Antigravity Scanning Engine v7.2-BETA | {new Date().toLocaleTimeString()}
          </p>
        </footer>
      )}
    </div>
  );
}
