'use client';

import { useState, useCallback } from 'react';
import { Moon, RefreshCw, TrendingUp, ChevronRight } from 'lucide-react';
import { SwingCandidateCard } from './SwingCandidateCard';
import type { SwingCandidate } from '@/app/api/stocks/swing/route';

const TOTAL_BATCHES = 7; // 61 symbols ÷ 10 = 7 batches

const TIER_STYLES: Record<string, string> = {
  A:    'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  B:    'bg-blue-500/20 text-blue-300 border-blue-600/40',
  C:    'bg-yellow-500/20 text-yellow-300 border-yellow-600/40',
  PASS: 'bg-gray-800 text-gray-500 border-gray-700',
};

const STRATEGY_LABELS: Record<string, string> = {
  TREND_TEMPLATE:    'Trend Template',
  VCP_BREAKOUT:      'VCP Breakout',
  PULLBACK_20SMA:    '20 SMA Pullback',
  MOMENTUM_BREAKOUT: 'Momentum Breakout',
  RSI2_OVERSOLD:     'RSI(2) Oversold',
  RS_LEADER:         'RS Leader',
};

function mergeSwingCandidates(
  existing: SwingCandidate[],
  incoming: SwingCandidate[]
): SwingCandidate[] {
  const map = new Map<string, SwingCandidate>();
  for (const c of existing) map.set(c.symbol, c);
  for (const c of incoming) {
    const prev = map.get(c.symbol);
    if (!prev || c.bestStrategy.score > prev.bestStrategy.score) {
      map.set(c.symbol, c);
    }
  }
  return Array.from(map.values());
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: SwingCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const b = candidate.bestStrategy;
  const f = candidate.features;
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-800/60 last:border-0 ${
        selected ? 'bg-blue-500/10' : 'hover:bg-gray-800/40'
      }`}
    >
      {/* Symbol + type */}
      <div className="w-20 shrink-0">
        <p className="text-sm font-bold text-white font-mono">{candidate.symbol}</p>
        <p className="text-[10px] text-gray-500">{candidate.type.toUpperCase()}</p>
      </div>

      {/* Price + change */}
      <div className="w-20 shrink-0 text-right">
        <p className="text-xs font-mono text-white">${f.lastClose.toFixed(2)}</p>
        <p className={`text-[10px] font-mono ${f.dayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {f.dayChangePct >= 0 ? '+' : ''}{f.dayChangePct.toFixed(2)}%
        </p>
      </div>

      {/* Setup */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{STRATEGY_LABELS[b.strategyId] ?? b.strategyName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_STYLES[b.tier] ?? TIER_STYLES.PASS}`}>
            {b.tier}
          </span>
          <span className="text-[10px] text-gray-500">RS {f.rs63.toFixed(2)}</span>
          <span className={`text-[10px] ${f.distFrom52wHighPct <= 5 ? 'text-emerald-400' : 'text-gray-500'}`}>
            -{f.distFrom52wHighPct.toFixed(1)}% hi
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-12 shrink-0">
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${b.score}%` }} />
        </div>
        <p className="text-[10px] font-mono text-gray-400 text-right mt-0.5">{b.score}</p>
      </div>

      <ChevronRight size={12} className="text-gray-600 shrink-0" />
    </button>
  );
}

export function SwingWatchlistPanel() {
  const [candidates, setCandidates] = useState<SwingCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: TOTAL_BATCHES });
  const [selected, setSelected] = useState<SwingCandidate | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true);
    setCandidates([]);
    setProgress({ current: 0, total: TOTAL_BATCHES });
    setSelected(null);

    let all: SwingCandidate[] = [];
    for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
      try {
        const res = await fetch(`/api/stocks/swing?batch=${batch}`).then(r => r.json());
        if (res.success && res.data.candidates) {
          all = mergeSwingCandidates(all, res.data.candidates);
        }
      } catch {
        // continue
      }
      setProgress({ current: batch + 1, total: TOTAL_BATCHES });
    }

    all.sort((a, b) => b.bestStrategy.score - a.bestStrategy.score);
    setCandidates(all);
    setLoading(false);
    setHasLoaded(true);
    setLastUpdated(
      new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit',
      }) + ' ET'
    );
  }, []);

  // Sort displayed candidates: A-tier first, then by score
  const sorted = [...candidates].sort((a, b) => {
    const tierOrder = { A: 0, B: 1, C: 2, PASS: 3 };
    const ta = tierOrder[a.bestStrategy.tier as keyof typeof tierOrder] ?? 3;
    const tb = tierOrder[b.bestStrategy.tier as keyof typeof tierOrder] ?? 3;
    if (ta !== tb) return ta - tb;
    return b.bestStrategy.score - a.bestStrategy.score;
  });

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Moon size={15} className="text-blue-400" />
            Swing Watchlist
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Daily bar analysis · 6 setups · overnight review for next session
            {lastUpdated && <span className="ml-2 text-gray-600">Updated: {lastUpdated}</span>}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? `Scanning ${progress.current}/${progress.total}…` : 'Scan Universe'}
        </button>
      </div>

      {/* ── Not yet scanned ───────────────────────────────────────────────── */}
      {!hasLoaded && !loading && (
        <div className="border border-dashed border-gray-700 rounded-xl p-10 text-center">
          <Moon size={28} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium">Tonight&apos;s watchlist not loaded yet</p>
          <p className="text-xs text-gray-600 mt-1 mb-4">
            Scans 61 symbols on daily bars for swing setups to act on tomorrow.
          </p>
          <button
            onClick={runScan}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
          >
            Run Swing Scan
          </button>
        </div>
      )}

      {/* ── Progress ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Fetching daily bars — batch {progress.current} of {progress.total}…</span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {hasLoaded && !loading && (
        <>
          {sorted.length === 0 ? (
            <div className="border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
              No swing setups meeting minimum score. Market conditions may not favor any setups.
            </div>
          ) : (
            <>
              {/* Strategy coverage summary */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(
                  sorted.reduce((acc, c) => {
                    const id = c.bestStrategy.strategyId;
                    acc[id] = (acc[id] ?? 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([id, count]) => (
                  <span key={id} className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400">
                    {STRATEGY_LABELS[id] ?? id} <span className="text-white font-bold">{count}</span>
                  </span>
                ))}
                <span className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400">
                  Total <span className="text-white font-bold">{sorted.length}</span> setups
                </span>
              </div>

              {/* Split layout */}
              <div className={`grid gap-5 ${selected ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
                {/* Candidate list */}
                <div className={`${selected ? 'lg:col-span-2' : ''} border border-gray-800 rounded-xl overflow-hidden`}>
                  <div className="px-4 py-2 bg-gray-900/60 border-b border-gray-800 flex items-center gap-2">
                    <TrendingUp size={13} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-gray-300">
                      {sorted.length} Setup{sorted.length !== 1 ? 's' : ''} Found
                    </span>
                  </div>
                  <div className="divide-y divide-gray-800/40">
                    {sorted.map(c => (
                      <CandidateRow
                        key={c.symbol}
                        candidate={c}
                        selected={selected?.symbol === c.symbol}
                        onSelect={() => setSelected(prev => prev?.symbol === c.symbol ? null : c)}
                      />
                    ))}
                  </div>
                </div>

                {/* Detail card */}
                {selected && (
                  <div className="lg:col-span-3">
                    <SwingCandidateCard
                      candidate={selected}
                      onClose={() => setSelected(null)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
