'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart3,
  RefreshCw, ChevronDown, ChevronRight, Moon,
} from 'lucide-react';
import { StockScannerTable } from './StockScannerTable';
import { StockTradePlanCard } from './StockTradePlanCard';
import { SwingWatchlistPanel } from './SwingWatchlistPanel';
import type { ScanCandidate } from '@/app/api/stocks/scan/route';
import type { IntradayRegimeResult, IntradayRegime } from '@/lib/models/intraday-regime-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ETF_LIST = [
  'SPX',
  'SPY','QQQ','IWM','DIA','TLT','GLD','SLV','XLF','XLK','XLE',
  'XLI','XLP','XLY','XLV','XLU','XLB','XLC','SMH','SOXX','ARKK',
  'TQQQ','SQQQ','UPRO','SPXU','SDS','UVXY','SVXY','KRE','EEM','FXI',
];

const STOCK_LIST = [
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AMD','NFLX','AVGO',
  'JPM','BAC','WMT','COST','UNH','LLY','XOM','CVX','CAT','PLTR',
  'COIN','CRM','ADBE','ORCL','MU','QCOM','NOW','PANW','UBER','SHOP',
];

const REGIME_CONFIG: Record<IntradayRegime, {
  bg: string; border: string; text: string; label: string;
  icon: React.ReactNode;
}> = {
  TREND_UP:           { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'TREND UP',           icon: <TrendingUp size={18} className="text-emerald-400" /> },
  TREND_DOWN:         { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-400',     label: 'TREND DOWN',         icon: <TrendingDown size={18} className="text-red-400" /> },
  RANGE:              { bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40',  text: 'text-yellow-400',  label: 'RANGE-BOUND',        icon: <Minus size={18} className="text-yellow-400" /> },
  BREAKOUT_EXPANSION: { bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    text: 'text-blue-400',    label: 'BREAKOUT EXPANSION', icon: <BarChart3 size={18} className="text-blue-400" /> },
  MEAN_REVERTING:     { bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  text: 'text-purple-400',  label: 'MEAN REVERTING',     icon: <Minus size={18} className="text-purple-400" /> },
  HIGH_VOL_UNSTABLE:  { bg: 'bg-orange-500/15',  border: 'border-orange-500/40',  text: 'text-orange-400',  label: 'HIGH VOL / UNSTABLE',icon: <AlertTriangle size={18} className="text-orange-400" /> },
  NO_TRADE:           { bg: 'bg-gray-800/60',    border: 'border-gray-700/40',    text: 'text-gray-500',    label: 'NO TRADE',           icon: <AlertTriangle size={18} className="text-gray-600" /> },
};

const TOTAL_BATCHES = 6;

function mergeCandidates(existing: ScanCandidate[], incoming: ScanCandidate[]): ScanCandidate[] {
  const map = new Map<string, ScanCandidate>();
  for (const c of existing) map.set(c.symbol, c);
  for (const c of incoming) {
    const prev = map.get(c.symbol);
    if (!prev || c.bestStrategy.score > prev.bestStrategy.score) {
      map.set(c.symbol, c);
    }
  }
  return Array.from(map.values());
}

export function StocksDaytradeTab() {
  const [activeSubTab, setActiveSubTab] = useState<'daytrade' | 'swing'>('daytrade');
  const [regime, setRegime] = useState<IntradayRegimeResult | null>(null);
  const [regimeLoading, setRegimeLoading] = useState(true);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: TOTAL_BATCHES });
  const [selectedCandidate, setSelectedCandidate] = useState<ScanCandidate | null>(null);
  const [lastScanned, setLastScanned] = useState('');
  const [showUniverse, setShowUniverse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegime = useCallback(async () => {
    setRegimeLoading(true);
    try {
      const res = await fetch('/api/stocks/regime').then(r => r.json());
      if (res.success) setRegime(res.data.regime);
    } catch (e) {
      setError(String(e));
    } finally {
      setRegimeLoading(false);
    }
  }, []);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setCandidates([]);
    setScanProgress({ current: 0, total: TOTAL_BATCHES });
    setSelectedCandidate(null);
    setError(null);

    let allCandidates: ScanCandidate[] = [];
    for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
      try {
        const res = await fetch(`/api/stocks/scan?batch=${batch}`).then(r => r.json());
        if (res.success && res.data.candidates) {
          allCandidates = mergeCandidates(allCandidates, res.data.candidates);
          // Update regime from scan response if we didn't have it yet
          if (!regime && res.data.regime) setRegime(res.data.regime);
        }
      } catch {
        // Continue scanning remaining batches even if one fails
      }
      setScanProgress({ current: batch + 1, total: TOTAL_BATCHES });
    }

    allCandidates.sort((a, b) => b.bestStrategy.score - a.bestStrategy.score);
    setCandidates(allCandidates);
    setScanLoading(false);
    setLastScanned(
      new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }) + ' ET'
    );
  }, [regime]);

  useEffect(() => {
    fetchRegime().then(() => runScan());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cfg = regime ? REGIME_CONFIG[regime.regime] : REGIME_CONFIG.NO_TRADE;

  return (
    <div className="space-y-5">
      {/* ── Header + Sub-nav ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 size={17} className="text-blue-400" />
            Stocks
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            61-symbol universe · Alpaca live data
          </p>
        </div>
        {/* Sub-navigation */}
        <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs font-semibold">
          <button
            onClick={() => setActiveSubTab('daytrade')}
            className={`px-4 py-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'daytrade'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            <BarChart3 size={12} /> Day Trade
          </button>
          <button
            onClick={() => setActiveSubTab('swing')}
            className={`px-4 py-2 flex items-center gap-1.5 border-l border-gray-700 transition-colors ${
              activeSubTab === 'swing'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            <Moon size={12} /> Swing Watchlist
          </button>
        </div>
      </div>

      {/* ── Swing Watchlist Sub-tab ───────────────────────────────────────── */}
      {activeSubTab === 'swing' && <SwingWatchlistPanel />}

      {/* ── Day Trade content ─────────────────────────────────────────────── */}
      {activeSubTab === 'daytrade' && (<>

      {/* ── Day Trade Header controls ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          61-symbol universe · 7 strategies · regime-filtered signals
          {lastScanned && <span className="ml-2 text-gray-600">Last scan: {lastScanned}</span>}
        </p>
        <button
          onClick={runScan}
          disabled={scanLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          <RefreshCw size={14} className={scanLoading ? 'animate-spin' : ''} />
          {scanLoading ? `Scanning ${scanProgress.current}/${scanProgress.total}…` : 'Scan Universe'}
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Intraday Regime Banner ─────────────────────────────────────────── */}
      {regimeLoading ? (
        <div className="h-24 rounded-xl bg-gray-800/40 animate-pulse" />
      ) : regime ? (
        <div className={`border rounded-xl p-4 ${cfg.bg} ${cfg.border}`}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-2.5">
              {cfg.icon}
              <div>
                <p className={`text-lg font-bold tracking-tight ${cfg.text}`}>{cfg.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{regime.description}</p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded border font-medium ${
                regime.tradeable
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30'
                  : 'bg-red-500/10 text-red-400 border-red-600/30'
              }`}>
                {regime.tradeable ? 'TRADEABLE' : 'NO TRADE'}
              </span>
              <span className={`px-2 py-0.5 rounded border font-medium ${
                regime.biasDirection === 'long'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30'
                  : regime.biasDirection === 'short'
                  ? 'bg-red-500/10 text-red-400 border-red-600/30'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-600/30'
              }`}>
                {regime.biasDirection === 'long' ? '▲ LONG BIAS'
                  : regime.biasDirection === 'short' ? '▼ SHORT BIAS'
                  : '↔ NEUTRAL'}
              </span>
              <span className="text-gray-500">Strength: <span className="text-gray-300 font-semibold">{regime.regimeStrength}%</span></span>
              {regime.activeStrategyIds.length > 0 && (
                <span className="text-gray-500">
                  Active: <span className="text-gray-300">{regime.activeStrategyIds.join(', ')}</span>
                </span>
              )}
            </div>
          </div>
          {regime.warnings.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {regime.warnings.map((w, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 border border-orange-600/20 rounded px-2 py-0.5">
                  <AlertTriangle size={10} />{w}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Scan Progress ─────────────────────────────────────────────────── */}
      {scanLoading && (
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Scanning batch {scanProgress.current} of {scanProgress.total}…</span>
            <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Scanner + Trade Plan split layout ────────────────────────────── */}
      <div className={`grid gap-5 ${selectedCandidate ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
        {/* Table */}
        <div className={selectedCandidate ? 'lg:col-span-3' : ''}>
          <StockScannerTable
            candidates={candidates}
            onSelectCandidate={setSelectedCandidate}
            selectedSymbol={selectedCandidate?.symbol ?? null}
            loading={scanLoading}
          />
        </div>

        {/* Trade Plan */}
        {selectedCandidate && (
          <div className="lg:col-span-2">
            <StockTradePlanCard
              candidate={selectedCandidate}
              onClose={() => setSelectedCandidate(null)}
            />
          </div>
        )}
      </div>

      {/* ── Universe Accordion ────────────────────────────────────────────── */}
      <div className="border border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowUniverse(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gray-900/60 hover:bg-gray-800/60 transition-colors text-left"
        >
          {showUniverse ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
          <span className="text-xs font-semibold text-gray-400">Universe Reference</span>
          <span className="ml-1 text-xs text-gray-600">31 ETFs · 30 Stocks</span>
        </button>
        {showUniverse && (
          <div className="p-4 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-950/40">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-2">ETFs + Indices</p>
              <div className="flex flex-wrap gap-1.5">
                {ETF_LIST.map(s => (
                  <span key={s} className={`text-xs px-2 py-0.5 rounded border font-mono ${
                    s === 'SPX'
                      ? 'bg-yellow-500/10 text-yellow-300 border-yellow-600/20'
                      : 'bg-purple-500/10 text-purple-300 border-purple-600/20'
                  }`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-2">Stocks</p>
              <div className="flex flex-wrap gap-1.5">
                {STOCK_LIST.map(s => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-600/20 font-mono">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      </>)}
    </div>
  );
}
