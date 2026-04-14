'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Zap, TrendingUp, BookOpen, BarChart3 } from 'lucide-react';
import { RegimeBanner } from './RegimeBanner';
import { OptionsRegimeMatrix } from './OptionsRegimeMatrix';
import { ZeroDTELibrary } from './ZeroDTELibrary';
import { ZeroDTEPerformance } from './ZeroDTEPerformance';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { FourRegime } from '@/lib/models/regime-engine';
import type {
  OptionsStrategy,
  OptionsStrategyId,
  StructureDecision,
} from '@/lib/models/options-strategy-selector';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface OptionsTabProps {
  spxPrice?: number;
  vix?: number;
}

interface StrategiesData {
  regime: FourRegime;
  compositeScore: number;
  confidence: string;
  ivr: number;
  activeStrategies: OptionsStrategy[];
  inactiveStrategies: OptionsStrategy[];
  topDayTradeRecommendation: OptionsStrategy | null;
  topSwingRecommendation: OptionsStrategy | null;
  regimeRationale: string;
  structureMatrix: StructureDecision[];
  fetchedAt: number;
}

const CATEGORY_COLORS = {
  options_day_trade: {
    badge: 'bg-yellow-500/10 border-yellow-600/30 text-yellow-400',
    accent: 'border-l-yellow-500',
    label: '0DTE / Day Trade',
  },
  options_swing: {
    badge: 'bg-blue-500/10 border-blue-600/30 text-blue-400',
    accent: 'border-l-blue-500',
    label: 'Swing',
  },
};

function StrategyCard({ strategy }: { strategy: OptionsStrategy }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY_COLORS[strategy.category];

  return (
    <div className={`border border-gray-800 border-l-2 ${cat.accent} rounded-xl bg-gray-900/40 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cat.badge}`}>
              {cat.label}
            </span>
            <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded border border-gray-700">
              {strategy.structure}
            </span>
            <span className="text-xs text-gray-600">{strategy.dteSuggested}</span>
          </div>
          <p className="text-sm font-semibold text-white">{strategy.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{strategy.description}</p>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-gray-500 shrink-0 mt-1" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 shrink-0 mt-1" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800/60 pt-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Delta Target</p>
            <p className="text-xs text-gray-300">{strategy.deltaTarget}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Entry Conditions</p>
            <ul className="space-y-0.5">
              {strategy.entryConditions.map((c, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold mt-0.5">·</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Exit Rules</p>
            <ul className="space-y-0.5">
              {strategy.exitRules.map((r, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                  <span className="text-yellow-500 font-bold mt-0.5">·</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {strategy.idealRegimes.map(r => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OptionsTab({ spxPrice, vix }: OptionsTabProps) {
  const [data, setData] = useState<StrategiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showZeroDTE, setShowZeroDTE] = useState(false);
  const [showPerf, setShowPerf] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/options/strategies').then(r => r.json());
      if (res.success) setData(res.data);
    } catch {
      // silently fail — RegimeBanner self-fetches independently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dayTradeActive = data?.activeStrategies.filter(s => s.category === 'options_day_trade') ?? [];
  const swingActive = data?.activeStrategies.filter(s => s.category === 'options_swing') ?? [];
  const activeIds: OptionsStrategyId[] = data?.activeStrategies.map(s => s.id) ?? [];

  return (
    <div className="space-y-6">
      {/* ── Regime Banner (self-fetching) ────────────────────────────────────── */}
      <RegimeBanner />

      {/* ── Rationale ────────────────────────────────────────────────────────── */}
      {data?.regimeRationale && (
        <div className="px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
          {data.regimeRationale}
        </div>
      )}

      {/* ── Active Day Trade Strategies ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-yellow-400" />
          <h2 className="text-sm font-bold text-white">Options Day Trade Strategies</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-600/30 text-yellow-400">
            {loading ? '…' : `${dayTradeActive.length} active`}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : dayTradeActive.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dayTradeActive.map(s => <StrategyCard key={s.id} strategy={s} />)}
          </div>
        ) : (
          <div className="border border-gray-800 rounded-xl p-4 text-center text-gray-500 text-sm">
            No day trade strategies active in current regime.
            {data?.regime === 'CRISIS' && ' Crisis mode — capital preservation only.'}
          </div>
        )}
      </div>

      {/* ── Active Swing Strategies ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold text-white">Options Swing Strategies</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-600/30 text-blue-400">
            {loading ? '…' : `${swingActive.length} active`}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : swingActive.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {swingActive.map(s => <StrategyCard key={s.id} strategy={s} />)}
          </div>
        ) : (
          <div className="border border-gray-800 rounded-xl p-4 text-center text-gray-500 text-sm">
            No swing strategies active in current regime.
          </div>
        )}
      </div>

      {/* ── Regime × Strategy Matrix (collapsible) ───────────────────────────── */}
      <div className="border-2 border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowMatrix(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-slate-900/80 hover:bg-slate-800/80 transition-colors text-left"
        >
          {showMatrix
            ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
            : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
          <span className="text-sm font-semibold text-slate-200">Regime Matrix &amp; Structure Decision Guide</span>
          <span className="ml-auto text-xs text-slate-500">16 strategies · IVR-based structure logic</span>
        </button>
        {showMatrix && data && (
          <div className="p-5 border-t border-slate-700 bg-slate-950/40">
            <OptionsRegimeMatrix
              regime={data.regime}
              compositeScore={data.compositeScore}
              ivr={data.ivr}
              activeStrategyIds={activeIds}
              structureMatrix={data.structureMatrix}
            />
          </div>
        )}
      </div>

      {/* ── 0DTE Library (collapsible) ───────────────────────────────────────── */}
      <div className="border-2 border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowZeroDTE(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-slate-900/80 hover:bg-slate-800/80 transition-colors text-left"
        >
          {showZeroDTE
            ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
            : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
          <Zap size={15} className="text-yellow-400" />
          <span className="text-sm font-semibold text-slate-200">0DTE Strategy Library</span>
          <span className="ml-auto flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            <button
              onClick={e => { e.stopPropagation(); setShowPerf(false); if (!showZeroDTE) setShowZeroDTE(true); }}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${!showPerf ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              <BookOpen size={11} /> Library
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowPerf(true); if (!showZeroDTE) setShowZeroDTE(true); }}
              className={`px-3 py-1.5 flex items-center gap-1.5 border-l border-slate-700 transition-colors ${showPerf ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              <BarChart3 size={11} /> Performance
            </button>
          </span>
        </button>
        {showZeroDTE && (
          <div className="p-5 border-t border-slate-700 bg-slate-950/40">
            {showPerf ? <ZeroDTEPerformance /> : <ZeroDTELibrary />}
          </div>
        )}
      </div>

      {/* Pass-through props for any child that needs market data */}
      <div className="hidden">{spxPrice}{vix}</div>
    </div>
  );
}
