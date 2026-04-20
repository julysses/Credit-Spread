'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Zap, TrendingUp, BookOpen, BarChart3, ClipboardList, RefreshCw } from 'lucide-react';
import { RegimeBanner } from './RegimeBanner';
import { OptionsRegimeMatrix } from './OptionsRegimeMatrix';
import { OptionsTradeCard } from './OptionsTradeCard';
import { ZeroDTELibrary } from './ZeroDTELibrary';
import { ZeroDTEPerformance } from './ZeroDTEPerformance';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { FourRegime } from '@/lib/models/regime-engine';
import type {
  OptionsStrategy,
  OptionsStrategyId,
  StructureDecision,
} from '@/lib/models/options-strategy-selector';
import type { OptionsTradePlan } from '@/app/api/options/trade-plans/route';

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

interface TradePlansData {
  plans: OptionsTradePlan[];
  regime: string;
  compositeScore: number;
  spx: number;
  vix: number;
  ivr: number;
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
    <div className={`border border-sd-line border-l-2 ${cat.accent} rounded-xl bg-sd-card/60 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-sd-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cat.badge}`}>
              {cat.label}
            </span>
            <span className="text-xs text-gray-500 bg-sd-muted/60 px-2 py-0.5 rounded border border-sd-line">
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
        <div className="px-4 pb-4 border-t border-sd-line/60 pt-3 space-y-3">
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
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-sd-muted text-gray-400 border border-sd-line">
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
  const [tradePlans, setTradePlans] = useState<TradePlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
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

  const fetchTradePlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await fetch('/api/options/trade-plans').then(r => r.json());
      if (res.success) setTradePlans(res.data);
    } catch {
      // silently fail
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchTradePlans();
  }, [fetchData, fetchTradePlans]);

  const dayTradeActive = data?.activeStrategies.filter(s => s.category === 'options_day_trade') ?? [];
  const swingActive = data?.activeStrategies.filter(s => s.category === 'options_swing') ?? [];
  const activeIds: OptionsStrategyId[] = data?.activeStrategies.map(s => s.id) ?? [];

  // Expected move calculations — formula: SPX × (VIX/100) / √252
  // 1σ = 68% probability price stays within this range
  // 2σ = 95% probability — ultra high-confidence iron condor zone
  const price = spxPrice ?? 0;
  const vol = vix ?? 0;
  const em1 = price > 0 && vol > 0 ? price * (vol / 100) / Math.sqrt(252) : 0;
  const em2 = em1 * 2;
  const em1High = price + em1;
  const em1Low  = price - em1;
  const em2High = price + em2;
  const em2Low  = price - em2;
  // IC short strike suggestions: 1σ boundary rounded to nearest 5-pt strike
  const icCallStrike = em1High > 0 ? Math.ceil(em1High / 5) * 5 : 0;
  const icPutStrike  = em1Low  > 0 ? Math.floor(em1Low  / 5) * 5 : 0;

  return (
    <div className="space-y-6">
      {/* ── Regime Banner (self-fetching) ────────────────────────────────────── */}
      <RegimeBanner spxPrice={spxPrice} vix={vix} />

      {/* ── Expected Trading Range ───────────────────────────────────────────── */}
      {em1 > 0 && (
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
              Expected Day Range — VIX {vol.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500 font-mono">±{em1.toFixed(0)} pts / {((em1 / price) * 100).toFixed(2)}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* 1σ band */}
            <div className="bg-sd-muted/60 rounded-lg p-2.5 border border-sd-line/40">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">1σ Range · 68% probability</div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-red-400 text-sm font-bold">{em1Low.toFixed(0)}</span>
                <span className="text-gray-600 text-xs">↔</span>
                <span className="text-emerald-400 text-sm font-bold">{em1High.toFixed(0)}</span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1 text-center">{(em1 * 2).toFixed(0)} pt width</div>
            </div>
            {/* 2σ band */}
            <div className="bg-sd-muted/60 rounded-lg p-2.5 border border-sd-line/40">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">2σ Range · 95% probability</div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-red-300/70 text-sm font-bold">{em2Low.toFixed(0)}</span>
                <span className="text-gray-600 text-xs">↔</span>
                <span className="text-emerald-300/70 text-sm font-bold">{em2High.toFixed(0)}</span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1 text-center">{(em2 * 2).toFixed(0)} pt width</div>
            </div>
          </div>
          {/* Iron condor short strike zone */}
          {icCallStrike > 0 && icPutStrike > 0 && (
            <div className="flex items-center gap-3 pt-1 text-xs font-mono">
              <span className="text-gray-500">IC Short Strikes (1σ):</span>
              <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded">
                Put ≤ {icPutStrike}
              </span>
              <span className="text-gray-700">/</span>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                Call ≥ {icCallStrike}
              </span>
              <span className="text-gray-600 ml-auto">Sell strikes OUTSIDE this range</span>
            </div>
          )}
        </div>
      )}

      {/* ── Rationale ────────────────────────────────────────────────────────── */}
      {data?.regimeRationale && (
        <div className="px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
          {data.regimeRationale}
        </div>
      )}

      {/* ── Live Trade Plans ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Live Trade Plans</h2>
            {tradePlans && (
              <span className="text-xs font-mono text-gray-500">
                SPX {tradePlans.spx.toFixed(0)} · VIX {tradePlans.vix.toFixed(1)} · IVR ≈{tradePlans.ivr}
              </span>
            )}
          </div>
          <button
            onClick={fetchTradePlans}
            disabled={plansLoading}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={plansLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {plansLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-sd-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tradePlans && tradePlans.plans.length > 0 ? (
          <div className="space-y-2">
            {tradePlans.plans.map(plan => (
              <OptionsTradeCard key={plan.strategyId} plan={plan} />
            ))}
          </div>
        ) : (
          <div className="border border-sd-line rounded-xl p-4 text-center text-gray-500 text-sm">
            No trade plans available. Market may be closed or data unavailable.
          </div>
        )}
      </div>

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
              <div key={i} className="h-20 bg-sd-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : dayTradeActive.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dayTradeActive.map(s => <StrategyCard key={s.id} strategy={s} />)}
          </div>
        ) : (
          <div className="border border-sd-line rounded-xl p-4 text-center text-gray-500 text-sm">
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
              <div key={i} className="h-20 bg-sd-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : swingActive.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {swingActive.map(s => <StrategyCard key={s.id} strategy={s} />)}
          </div>
        ) : (
          <div className="border border-sd-line rounded-xl p-4 text-center text-gray-500 text-sm">
            No swing strategies active in current regime.
          </div>
        )}
      </div>

      {/* ── Regime × Strategy Matrix (collapsible) ───────────────────────────── */}
      <div className="border border-sd-line2 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowMatrix(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-sd-card hover:bg-sd-muted/60 transition-colors text-left"
        >
          {showMatrix
            ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
            : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-200">Regime Matrix &amp; Structure Decision Guide</span>
          <span className="ml-auto text-xs text-gray-500">16 strategies · IVR-based structure logic</span>
        </button>
        {showMatrix && data && (
          <div className="p-5 border-t border-sd-line bg-sd-card/60">
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
      <div className="border border-sd-line2 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowZeroDTE(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-sd-card hover:bg-sd-muted/60 transition-colors text-left"
        >
          {showZeroDTE
            ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
            : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
          <Zap size={15} className="text-yellow-400" />
          <span className="text-sm font-semibold text-gray-200">0DTE Strategy Library</span>
          <span className="ml-auto flex rounded-lg border border-sd-line overflow-hidden text-xs">
            <button
              onClick={e => { e.stopPropagation(); setShowPerf(false); if (!showZeroDTE) setShowZeroDTE(true); }}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${!showPerf ? 'bg-blue-600 text-white' : 'bg-sd-card text-gray-400 hover:text-white'}`}
            >
              <BookOpen size={11} /> Library
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowPerf(true); if (!showZeroDTE) setShowZeroDTE(true); }}
              className={`px-3 py-1.5 flex items-center gap-1.5 border-l border-sd-line transition-colors ${showPerf ? 'bg-blue-600 text-white' : 'bg-sd-card text-gray-400 hover:text-white'}`}
            >
              <BarChart3 size={11} /> Performance
            </button>
          </span>
        </button>
        {showZeroDTE && (
          <div className="p-5 border-t border-sd-line bg-sd-card/60">
            {showPerf ? <ZeroDTEPerformance /> : <ZeroDTELibrary />}
          </div>
        )}
      </div>

      {/* Pass-through props for any child that needs market data */}
      <div className="hidden">{spxPrice}{vix}</div>
    </div>
  );
}
