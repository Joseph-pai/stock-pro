'use client';

import { StockCard } from '@/components/dashboard/StockCard';
import { AnalysisResult, StockData } from '@/types';
import { SECTORS, MarketType, MARKET_NAMES } from '@/lib/sectors';
import { Search, TrendingUp, Sparkles, Filter, Loader2, Flame, Settings, Target, BarChart3, Info } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/navigation';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

type ScanStage = 'idle' | 'fetching' | 'filtering' | 'analyzing' | 'complete';

interface ScanSettings {
  volumeRatio: number;
  maConstrict: number;
  breakoutPercent: number;
}

const DEFAULT_SETTINGS: ScanSettings = {
  volumeRatio: 2.0,
  maConstrict: 2.0,
  breakoutPercent: 3.0
};

export default function DashboardPage() {
  const router = useRouter();
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
  const [market, setMarket] = useState<MarketType>('TWSE');
  const [sector, setSector] = useState<string>('ALL');

  // Reset sector when market changes
  useEffect(() => {
    setSector(market === 'TWSE' ? 'ALL' : 'AL');
  }, [market]);

  const currentSectorName = useMemo(() => {
    return SECTORS[market].find(s => s.id === sector)?.name || '該類股';
  }, [market, sector]);

  const runScan = async () => {
    setStage('fetching');
    setHasScanned(false);
    setError(null);
    setResults([]);
    const t0 = Date.now();

    try {
      // Phase 1: Directed Fetch
      setProgress({ current: 0, total: 0, phase: `正在獲取 ${MARKET_NAMES[market]} - ${currentSectorName} 數據...` });

      const snapshotRes = await fetch(`/api/market/snapshot?market=${market}&sector=${sector}`);
      const snapshotJson = await snapshotRes.json();
      if (!snapshotJson.success) throw new Error(snapshotJson.error);

      const snapshot: StockData[] = snapshotJson.data;
      const t1 = Date.now();

      // Phase 2: Candidate Filtering
      if (snapshot.length === 0) {
        throw new Error("沒找到任何股票，請確認市場與類股選擇是否正確。");
      }

      setStage('filtering');
      setProgress({ current: 0, total: snapshot.length, phase: '正在篩選潛力候選股...' });

      const candidates = snapshot
        .filter(s => {
          const isRedK = s.close >= s.open;
          const isVolActive = s.Trading_Volume >= 1.0;
          // Broaden search for deep analysis
          return isRedK && isVolActive;
        })
        .sort((a, b) => b.Trading_Volume - a.Trading_Volume)
        .slice(0, 150); // Increased batch size for better coverage

      // Phase 3: Batched Resonance Analysis
      setStage('analyzing');
      const BATCH_SIZE = 15;
      const allResults: AnalysisResult[] = [];
      const t2_start = Date.now();

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        setProgress({
          current: i + batch.length,
          total: candidates.length,
          phase: `三大信號共振分析中 (${i + batch.length}/${candidates.length})`
        });

        const batchRes = await fetch('/api/scan/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stocks: batch.map(c => ({ id: c.stock_id, name: c.stock_name })),
            settings: settings
          })
        });

        const batchJson = await batchRes.json();
        if (batchJson.success && batchJson.data) {
          // Inject current sector name into results
          const augmented = batchJson.data.map((r: any) => ({
            ...r,
            sector_name: currentSectorName === '全部類股' ? '主板' : currentSectorName
          }));
          allResults.push(...augmented);
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
      setError(e.message);
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
      {/* Header */}
      <header className="mb-14 text-center">
        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-blue-500/10 border-2 border-blue-500/30 mb-8 shadow-lg shadow-blue-500/10">
          <Sparkles className="w-6 h-6 text-blue-400" />
          <span className="text-lg font-black text-blue-400 uppercase tracking-widest">
            {results.length > 0 ? `發現 ${results.length} 支全信號共振股` : '定向定點掃描系統 v2.1'}
          </span>
        </div>
        <h1 className="text-6xl md:text-7xl font-black bg-gradient-to-br from-white via-white to-blue-500 bg-clip-text text-transparent mb-8 tracking-tighter">
          爆發信號定位器
        </h1>
        <p className="text-slate-400 text-2xl font-black max-w-2xl mx-auto leading-relaxed">
          量能激增・均線糾結・技術突破<br />
          <span className="text-white/60 text-lg font-medium">三大信號完美重疊，定位噴出奇點。</span>
        </p>
      </header>

      {/* Target Control Center */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[3rem] p-10 mb-12 shadow-2xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-400" />
              <label className="text-xl font-black text-white">指定市場</label>
            </div>
            <div className="relative group">
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as MarketType)}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-6 text-2xl font-black text-white focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer shadow-xl"
              >
                <option value="TWSE">{MARKET_NAMES.TWSE}</option>
                <option value="TPEX">{MARKET_NAMES.TPEX}</option>
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xl">▼</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <label className="text-xl font-black text-white">產業類型</label>
            </div>
            <div className="relative group">
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-6 text-2xl font-black text-white focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer shadow-xl"
              >
                {SECTORS[market].map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xl">▼</div>
            </div>
          </div>
        </div>

        {/* Resonance Settings */}
        <div className="bg-black/20 rounded-[2.5rem] p-8 border border-white/5 space-y-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-slate-500" />
              <span className="text-xl font-black text-slate-300">信號閾值配置</span>
            </div>
            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="text-sm font-black text-blue-500 hover:text-blue-400 underline underline-offset-4"
            >
              恢復預設
            </button>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {/* 1. Volume */}
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-lg font-black text-slate-300">❶ 量能激增倍數 (V-Ratio)</span>
                  <span className="text-xs font-bold text-slate-500">▶ 數值越高條件越嚴苛</span>
                </div>
                <span className="text-4xl font-black text-amber-400 font-mono">{settings.volumeRatio}x</span>
              </div>
              <input
                type="range" min="1.0" max="6.0" step="0.5"
                value={settings.volumeRatio}
                onChange={(e) => setSettings({ ...settings, volumeRatio: parseFloat(e.target.value) })}
                className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* 2. Squeeze */}
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-lg font-black text-slate-300">❷ 均線糾結度 (MA Gap)</span>
                  <span className="text-xs font-bold text-slate-500">▶ % 越低代表壓縮越緊，條件越 [極度嚴苛]</span>
                </div>
                <span className="text-4xl font-black text-purple-400 font-mono">{settings.maConstrict}%</span>
              </div>
              <input
                type="range" min="0.5" max="5.0" step="0.5"
                value={settings.maConstrict}
                onChange={(e) => setSettings({ ...settings, maConstrict: parseFloat(e.target.value) })}
                className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* 3. Breakout */}
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-lg font-black text-slate-300">❸ 指標突破幅度 (今日漲幅)</span>
                  <span className="text-xs font-bold text-slate-500">▶ 數值越高條件越嚴苛</span>
                </div>
                <span className="text-4xl font-black text-emerald-400 font-mono">{settings.breakoutPercent}%</span>
              </div>
              <input
                type="range" min="1.0" max="8.0" step="0.5"
                value={settings.breakoutPercent}
                onChange={(e) => setSettings({ ...settings, breakoutPercent: parseFloat(e.target.value) })}
                className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={runScan}
        disabled={isWorking}
        className={clsx(
          "w-full flex flex-col items-center justify-center p-10 rounded-[3rem] border-4 transition-all active:scale-[0.98] mb-12 group shadow-2xl relative overflow-hidden",
          isWorking
            ? "bg-slate-900 border-slate-800 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-700 to-blue-500 border-blue-400 text-white shadow-blue-500/40 hover:scale-[1.02]"
        )}
      >
        {isWorking ? <Loader2 className="w-12 h-12 animate-spin mb-3" /> : <Flame className="w-12 h-12 mb-3 group-hover:scale-125 transition-transform" />}
        <span className="text-3xl font-black uppercase tracking-widest">啟動定點共振掃描</span>
        <span className="text-lg font-bold text-white/60 mt-3">
          已鎖定目標：{MARKET_NAMES[market]} - {currentSectorName}
        </span>
      </button>

      {/* Progress & Search (Integrated Panel) */}
      <div className="space-y-8 mb-12">
        {isWorking && (
          <div className="p-10 bg-slate-900 border-2 border-slate-800 rounded-[3rem] space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping" />
                <span className="text-2xl font-black text-blue-400">{progress.phase}</span>
              </div>
              <span className="text-xl font-mono font-black text-slate-500 tracking-tighter">
                {Math.round((progress.current / progress.total) * 100 || 0)}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-8 overflow-hidden border-2 border-white/5">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 transition-all duration-500 ease-out"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '15%' }}
              />
            </div>
          </div>
        )}

        <div className="relative group shadow-2xl">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-8 h-8 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="輸入股票代碼或名稱快速查找..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] py-8 pl-20 pr-10 text-3xl font-black focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 text-white"
          />
        </div>
      </div>

      {/* Results Container */}
      <div className="space-y-10">
        {error && (
          <div className="p-10 bg-rose-500/10 border-4 border-rose-500/20 rounded-[3rem] text-center">
            <p className="text-2xl font-black text-rose-400">{error}</p>
            <button onClick={runScan} className="mt-4 text-rose-500 underline font-black">點擊重試</button>
          </div>
        )}

        {!hasScanned && !isWorking && !error ? (
          <div className="py-40 text-center border-4 border-dashed border-slate-900 rounded-[4rem] bg-slate-900/10 opacity-60">
            <TrendingUp className="w-24 h-24 text-slate-800 mx-auto mb-8" />
            <p className="text-3xl font-black text-slate-400">等待定點掃描任務</p>
            <p className="text-slate-600 text-xl font-black mt-4">請選定目標後按下啟動鈕</p>
          </div>
        ) : filteredResults.length === 0 && hasScanned && !isWorking ? (
          <div className="py-40 text-center border-4 border-dashed border-rose-900/30 rounded-[4rem] bg-rose-500/5 px-10">
            <div className="text-9xl mb-10">🔍</div>
            <p className="text-rose-400 font-black text-5xl mb-6 leading-tight">未發現符合標的</p>
            <div className="max-w-md mx-auto space-y-6">
              <p className="text-slate-500 text-2xl font-black leading-relaxed">
                已深度分析 {timing?.totalStocks} 支股票，但在目前配置下未發現「完美共振」。
              </p>
              <div className="p-8 bg-blue-500/10 rounded-[2rem] border-2 border-blue-500/20 mt-8 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <Info className="w-6 h-6 text-blue-400" />
                  <p className="text-blue-400 text-xl font-black">為什麼找不到？</p>
                </div>
                <ul className="text-slate-400 text-lg font-bold space-y-4">
                  <li>1. **均線糾結度**：若設為 0.5%，代表均線必須極度重疊，這非常罕見。</li>
                  <li>2. **共振條件**：當前市場可能並無同時符合「爆量」且「糾結」的股票。</li>
                  <li className="text-blue-400 font-black mt-4">👉 建議：將「均線糾結度」調升至 3.0%~4.0% 試試看。</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {filteredResults.map((stock, index) => (
              <div key={stock.stock_id} onClick={() => router.push(`/chart/${stock.stock_id}`)}>
                <StockCard data={stock} index={index + 1} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pro Timing Footer */}
      {timing && !isWorking && (
        <footer className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-6">
          <div className="flex flex-wrap justify-center gap-8 text-sm font-black font-mono text-slate-600 uppercase tracking-tighter">
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">SNAPSHOT: {timing.snapshot}MS</span>
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">DEEP_AI: {timing.analyze}MS</span>
            <span className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">SAMPLES: {timing.totalStocks}</span>
          </div>
          <div className="flex items-center gap-4 py-4 px-8 bg-blue-500/5 rounded-full border border-blue-500/10">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <p className="text-slate-500 text-sm font-black tracking-widest uppercase">
              Antigravity Resonance Engine v8.2 | {new Date().toLocaleDateString()}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
