'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, BarChart3, ChevronDown, Clock, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from 'lucide-react';
import type { IntradaySignalResult } from '@/lib/models/intraday-engine';

interface IntradayInputOverrides {
  vwap: number;
  openingRangeHigh: number;
  openingRangeLow: number;
  rsi5m: number;
  rsi15m: number;
  hasVolumeSpike: boolean;
}

interface IntradayPanelProps {
  spxPrice?: number;
  vix?: number;
}

const TIER_CONFIG = {
  ELITE:    { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: '🟢 ELITE TRADE' },
  HIGH:     { bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    text: 'text-blue-400',    label: '🔵 HIGH QUALITY' },
  MODERATE: { bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40',  text: 'text-yellow-400',  label: '🟡 MODERATE' },
  LOW:      { bg: 'bg-orange-500/15',  border: 'border-orange-500/40',  text: 'text-orange-400',  label: '🟠 LOW QUALITY' },
  NO_TRADE: { bg: 'bg-gray-800/60',    border: 'border-gray-700/40',    text: 'text-gray-500',    label: '⛔ NO TRADE' },
};

const STRATEGY_COLORS = {
  '0DTE_VOL_CRUSH':            'text-purple-400',
  '0DTE_DIRECTIONAL_PUT':      'text-green-400',
  '0DTE_DIRECTIONAL_CALL':     'text-red-400',
  '0DTE_MEAN_REVERSION_PUT':   'text-cyan-400',
  '0DTE_MEAN_REVERSION_CALL':  'text-orange-400',
  NO_TRADE:                    'text-gray-500',
};

export function IntradayPanel({ spxPrice = 5800, vix = 18 }: IntradayPanelProps) {
  const [result, setResult] = useState<IntradaySignalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');

  const defaultOverrides: IntradayInputOverrides = {
    vwap: spxPrice,
    openingRangeHigh: Math.round((spxPrice * 1.002) / 5) * 5,
    openingRangeLow: Math.round((spxPrice * 0.998) / 5) * 5,
    rsi5m: 50,
    rsi15m: 50,
    hasVolumeSpike: false,
  };
  const [overrides, setOverrides] = useState<IntradayInputOverrides>(defaultOverrides);

  // Live countdown to close
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const close = new Date(et);
      close.setHours(16, 0, 0, 0);
      const diff = close.getTime() - et.getTime();
      if (diff <= 0) { setTimeRemaining('Market Closed'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${h}h ${m}m ${s}s until close`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intraday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...overrides, spxPrice, vix }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data.recommendation);
    } catch (e) {
      console.error('Intraday analysis failed:', e);
    } finally {
      setLoading(false);
    }
  }, [overrides, spxPrice, vix]);

  // Auto-analyze when panel mounts with live data
  useEffect(() => { analyze(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tier = result?.tier ?? 'NO_TRADE';
  const tierCfg = TIER_CONFIG[tier];

  // 0DTE expiry = today (Friday if weekend, adjusted for market holidays)
  const todayExpiry = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
    if (day === 6) d.setDate(d.getDate() + 2); // Saturday → Monday
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  })();

  return (
    <Card className={`border ${tierCfg.border} ${tierCfg.bg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <CardTitle className="text-base">0DTE Intraday Engine</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />{timeRemaining}
            </span>
            <button
              onClick={analyze}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 transition-colors"
            >
              {loading ? <span className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" /> : '⟳ Refresh'}
            </button>
            <button
              onClick={() => setShowInputs(!showInputs)}
              className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 transition-colors"
            >
              {showInputs ? 'Hide Inputs' : 'Adjust Inputs'}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Optional input overrides */}
        {showInputs && (
          <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700/40">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Intraday Inputs</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <SmallInput label="VWAP" value={overrides.vwap} onChange={v => setOverrides(p => ({ ...p, vwap: v }))} />
              <SmallInput label="OR High" value={overrides.openingRangeHigh} onChange={v => setOverrides(p => ({ ...p, openingRangeHigh: v }))} />
              <SmallInput label="OR Low" value={overrides.openingRangeLow} onChange={v => setOverrides(p => ({ ...p, openingRangeLow: v }))} />
              <SmallInput label="RSI 5m" value={overrides.rsi5m} onChange={v => setOverrides(p => ({ ...p, rsi5m: v }))} max={100} />
              <SmallInput label="RSI 15m" value={overrides.rsi15m} onChange={v => setOverrides(p => ({ ...p, rsi15m: v }))} max={100} />
              <div>
                <label className="text-xs text-gray-500 block mb-1">Vol Spike</label>
                <button
                  onClick={() => setOverrides(p => ({ ...p, hasVolumeSpike: !p.hasVolumeSpike }))}
                  className={`w-full py-1.5 rounded text-xs font-semibold border transition-colors ${overrides.hasVolumeSpike ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                >
                  {overrides.hasVolumeSpike ? 'SPIKE ACTIVE' : 'Normal Vol'}
                </button>
              </div>
            </div>
            <button
              onClick={analyze}
              disabled={loading}
              className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Run Intraday Analysis'}
            </button>
          </div>
        )}

        {loading && !result && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            <span className="text-gray-400 text-sm">Analyzing intraday signals...</span>
          </div>
        )}

        {result && (
          <>
            {/* Tier Banner */}
            <div className={`rounded-lg p-4 border ${tierCfg.border} ${tierCfg.bg} text-center`}>
              <div className={`text-2xl font-black tracking-wide ${tierCfg.text}`}>
                {tierCfg.label}
              </div>
              <div className={`text-sm font-semibold mt-1 ${STRATEGY_COLORS[result.strategy] ?? 'text-gray-400'}`}>
                {result.displayName}
              </div>
            </div>

            {/* Core Metrics */}
            {result.strategy !== 'NO_TRADE' ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <MetricBox
                    label="Win Prob"
                    value={`${(result.pop * 100).toFixed(1)}%`}
                    valueClass={result.pop >= 0.88 ? 'text-green-400' : result.pop >= 0.80 ? 'text-yellow-400' : 'text-red-400'}
                  />
                  <MetricBox label="Confidence" value={`${result.confidenceScore}/100`} valueClass={tierCfg.text} />
                  <MetricBox label="Credit" value={`$${result.estimatedCredit.toFixed(2)}`} valueClass="text-white" />
                  <MetricBox label="Max Risk" value={`$${result.maxRisk.toFixed(2)}`} valueClass="text-red-400" />
                </div>

                {/* Trade Structure — full per-leg table */}
                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Trade Structure</span>
                    <BiasIcon bias={result.bias} />
                    <span className="ml-auto text-xs text-yellow-400 font-mono">{todayExpiry} · 0DTE</span>
                  </div>

                  {/* Leg table header */}
                  <div className="grid grid-cols-6 gap-1 text-[10px] text-gray-600 uppercase tracking-wider mb-1 px-0.5">
                    <span>Action</span><span className="text-right">Strike</span>
                    <span>Type</span><span>Delta</span>
                    <span>IV</span><span className="text-right">Est. $</span>
                  </div>

                  {/* Short leg (SELL) */}
                  <IntradayLegRow
                    action="sell"
                    strike={result.shortStrike}
                    optionType={result.optionType ?? (result.bias === 'bearish' ? 'call' : 'put')}
                    delta={result.shortDelta}
                    iv={result.impliedVol}
                    premium={result.shortPremium}
                  />
                  {/* Long leg (BUY) */}
                  <IntradayLegRow
                    action="buy"
                    strike={result.longStrike}
                    optionType={result.optionType ?? (result.bias === 'bearish' ? 'call' : 'put')}
                    delta={result.longDelta}
                    iv={result.impliedVol}
                    premium={result.longPremium}
                  />

                  {/* Net summary */}
                  <div className="mt-2 pt-2 border-t border-gray-700/40 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Net Credit</div>
                      <div className="text-white font-mono font-semibold">${result.estimatedCredit.toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Per Contract</div>
                      <div className="text-emerald-400 font-mono font-semibold">${(result.estimatedCredit * 100).toFixed(0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Width</div>
                      <div className="text-gray-300 font-mono">{result.spreadWidth} pts</div>
                    </div>
                  </div>

                  {/* Expected Move */}
                  <div className="mt-3 pt-2 border-t border-gray-700/40">
                    <div className="text-xs text-gray-500 mb-1.5">1σ Expected Move Range</div>
                    <div className="flex items-center gap-2">
                      <div className="bg-green-500/10 border border-green-500/20 rounded px-2 py-1 text-xs text-green-400 font-mono flex-1 text-center">
                        ▲ {result.expectedMoveHigh.toFixed(0)}
                      </div>
                      <div className="text-gray-600 text-xs">1σ</div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded px-2 py-1 text-xs text-red-400 font-mono flex-1 text-center">
                        ▼ {result.expectedMoveLow.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exit Rules — dollar targets prominently */}
                <div className="grid grid-cols-3 gap-2">
                  <ExitBox
                    label="Take Profit"
                    value={`$${result.exitRules.takeProfitDollar?.toFixed(2) ?? (result.estimatedCredit * result.exitRules.takeProfitPct).toFixed(2)}`}
                    sub={`${(result.exitRules.takeProfitPct * 100).toFixed(0)}% of credit`}
                    color="text-green-400"
                    bg="bg-green-500/10 border-green-500/20"
                  />
                  <ExitBox
                    label="Stop Loss"
                    value={`$${result.exitRules.stopLossDollar?.toFixed(2) ?? (result.estimatedCredit * result.exitRules.stopLossMult).toFixed(2)}`}
                    sub={`${result.exitRules.stopLossMult}× credit`}
                    color="text-red-400"
                    bg="bg-red-500/10 border-red-500/20"
                  />
                  <ExitBox
                    label="Time Stop"
                    value="3:45 PM ET"
                    sub={`${result.exitRules.timeStopMinutes} min buffer`}
                    color="text-orange-400"
                    bg="bg-orange-500/10 border-orange-500/20"
                  />
                </div>

                {/* Signal Reasons */}
                {result.reasons.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Active Signals</div>
                    {result.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                        <span className="text-blue-500 mt-0.5 shrink-0">›</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risk Rules */}
                <div className="bg-gray-900/40 rounded-lg p-3 border border-gray-700/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3 h-3 text-orange-400" />
                    <span className="text-xs text-orange-400 font-semibold uppercase tracking-wider">Risk Rules</span>
                  </div>
                  <div className="space-y-1 text-xs text-gray-400">
                    <div>• Max risk per trade: 1–2% of portfolio</div>
                    <div>• Max 3 trades per day</div>
                    <div>• Gamma emergency: exit immediately if price approaches short strike</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {result.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-400 bg-gray-800/40 rounded p-3">
                    <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 rounded px-3 py-2">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Daily Intraday Playbook ─────────────────────────────────────── */}
        <DailyPlaybook />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function MetricBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-900/60 rounded-lg p-2.5 text-center">
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${valueClass ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function StructRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass ?? 'text-white'}>{value}</span>
    </div>
  );
}

function ExitBox({ label, value, sub, color, bg }: { label: string; value: string; sub: string; color: string; bg: string }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${bg}`}>
      <div className={`text-xs font-semibold ${color} mb-0.5`}>{label}</div>
      <div className="text-xs text-white">{value}</div>
      <div className="text-xs text-gray-500 font-mono">{sub}</div>
    </div>
  );
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <span className="text-xs text-green-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />Bullish</span>;
  if (bias === 'bearish') return <span className="text-xs text-red-400 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />Bearish</span>;
  return <span className="text-xs text-gray-500 flex items-center gap-0.5"><Minus className="w-3 h-3" />Neutral</span>;
}

function SmallInput({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Intraday per-leg row
// ─────────────────────────────────────────────

function IntradayLegRow({
  action, strike, optionType, delta, iv, premium,
}: {
  action: 'sell' | 'buy';
  strike: number;
  optionType: 'put' | 'call';
  delta?: number;
  iv?: number;
  premium?: number;
}) {
  const isSell = action === 'sell';
  return (
    <div className="grid grid-cols-6 gap-1 items-center py-1 text-xs font-mono border-b border-gray-800/50 last:border-0">
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase text-center ${
        isSell ? 'bg-red-900/60 text-red-400' : 'bg-green-900/60 text-green-400'
      }`}>{isSell ? 'SELL' : 'BUY'}</span>
      <span className={`text-right ${isSell ? 'text-red-300' : 'text-green-300'}`}>{strike}</span>
      <span className="text-gray-400 uppercase">{optionType?.slice(0, 3)}</span>
      <span className="text-blue-400">
        {delta != null ? `Δ${delta.toFixed(2)}` : '—'}
      </span>
      <span className="text-purple-400">
        {iv != null && iv > 0 ? `${(iv * 100).toFixed(0)}%` : '—'}
      </span>
      <span className={`text-right ${isSell ? 'text-yellow-400' : 'text-gray-400'}`}>
        {premium != null && premium > 0
          ? `${isSell ? '+' : '−'}$${premium.toFixed(2)}`
          : '—'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Daily Intraday Playbook
// ─────────────────────────────────────────────

type PlaybookStrategy = {
  strategyId: string;
  displayName: string;
  description: string;
  spreadType: string;
  bias: string;
  score: number;
  tier: string;
  isViable: boolean;
  entryWindow: string;
  setupConditions: string[];
  metConditions: string[];
  shortStrike: number;
  longStrike: number;
  spreadWidth: number;
  estimatedCredit: number;
  maxRisk: number;
  pop: number;
  optionType: string;
  shortDelta: number;
  longDelta: number;
  shortPremium: number;
  longPremium: number;
  impliedVol: number;
  warnings: string[];
  exitRules: {
    takeProfitPct: number;
    stopLossMult: number;
    timeStop: string;
    takeProfitDollar: number;
    stopLossDollar: number;
  };
};

const TIER_COLORS: Record<string, string> = {
  ELITE:    'bg-purple-900/60 text-purple-300 border-purple-700',
  HIGH:     'bg-blue-900/60 text-blue-300 border-blue-700',
  MODERATE: 'bg-yellow-900/40 text-yellow-400 border-yellow-700',
  LOW:      'bg-gray-800 text-gray-400 border-gray-700',
  NO_TRADE: 'bg-gray-900 text-gray-600 border-gray-800',
};

const BIAS_LABELS: Record<string, { label: string; color: string }> = {
  bullish: { label: '▲ Bullish', color: 'text-green-400' },
  bearish: { label: '▼ Bearish', color: 'text-red-400' },
  neutral: { label: '— Neutral', color: 'text-gray-400' },
};

function DailyPlaybook() {
  const [strategies, setStrategies] = useState<PlaybookStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchPlaybook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intraday/playbook');
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Failed'); return; }
      setStrategies(json.data.strategies ?? []);
      setFetchedAt(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when first opened
  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev && strategies.length === 0) fetchPlaybook();
      return !prev;
    });
  }, [strategies.length, fetchPlaybook]);

  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Daily Intraday Playbook</span>
          <span className="text-xs text-gray-500">5 strategies · updated for today&apos;s session</span>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-xs text-gray-600">{fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {loading
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            : <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          {/* Refresh */}
          <div className="flex justify-end">
            <button
              onClick={fetchPlaybook}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded px-3 py-2">
              ⚠ {error}
            </div>
          )}

          {loading && strategies.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              Loading playbook…
            </div>
          )}

          {/* Strategy cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {strategies.map((s) => (
              <PlaybookCard key={s.strategyId} strategy={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaybookCard({ strategy: s }: { strategy: PlaybookStrategy }) {
  const tierColor = TIER_COLORS[s.tier] ?? TIER_COLORS.NO_TRADE;
  const biasInfo  = BIAS_LABELS[s.bias] ?? { label: s.bias, color: 'text-gray-400' };

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      s.isViable ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-900/30 border-gray-800 opacity-60'
    }`}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{s.displayName}</p>
          <p className={`text-xs mt-0.5 ${biasInfo.color}`}>{biasInfo.label}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tierColor}`}>{s.tier}</span>
          <span className="text-[10px] text-gray-600">Score {s.score}/10</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">{s.description}</p>

      {/* Entry window */}
      <div className="bg-gray-800/50 rounded-lg px-3 py-2">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Entry Window</p>
        <p className="text-xs text-white">{s.entryWindow}</p>
      </div>

      {/* Setup conditions */}
      <div>
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Setup Conditions</p>
        <div className="space-y-1">
          {s.setupConditions.map((cond, i) => {
            const isMet = s.metConditions.some((m) => m.toLowerCase().includes(cond.split(' ')[0].toLowerCase()));
            return (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <span className={isMet ? 'text-green-400 shrink-0' : 'text-gray-600 shrink-0'}>
                  {isMet ? '✓' : '○'}
                </span>
                <span className={isMet ? 'text-gray-300' : 'text-gray-600'}>{cond}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legs (only when viable) */}
      {s.isViable && s.shortStrike > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Suggested Spread</p>
          <div className="grid grid-cols-6 gap-1 text-[10px] text-gray-600 mb-1">
            <span>ACT</span><span className="text-right">Strike</span>
            <span>Type</span><span>Δ</span><span>IV</span><span className="text-right">$</span>
          </div>
          <IntradayLegRow
            action="sell" strike={s.shortStrike}
            optionType={s.optionType as 'put' | 'call'}
            delta={s.shortDelta} iv={s.impliedVol} premium={s.shortPremium}
          />
          <IntradayLegRow
            action="buy" strike={s.longStrike}
            optionType={s.optionType as 'put' | 'call'}
            delta={s.longDelta} iv={s.impliedVol} premium={s.longPremium}
          />
          <div className="mt-2 flex justify-between text-xs border-t border-gray-700/40 pt-2">
            <span className="text-gray-500">Net Credit</span>
            <span className="text-white font-mono">${s.estimatedCredit.toFixed(2)} · POP {(s.pop * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Exit rules */}
      {s.isViable && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-green-900/20 border border-green-800/40 rounded px-2.5 py-2 text-center">
            <p className="text-green-400 font-semibold text-[11px]">Take Profit</p>
            <p className="text-white font-mono">${s.exitRules.takeProfitDollar.toFixed(2)}</p>
            <p className="text-gray-600 text-[10px]">{(s.exitRules.takeProfitPct * 100).toFixed(0)}% of credit</p>
          </div>
          <div className="bg-red-900/20 border border-red-800/40 rounded px-2.5 py-2 text-center">
            <p className="text-red-400 font-semibold text-[11px]">Stop Loss</p>
            <p className="text-white font-mono">${s.exitRules.stopLossDollar.toFixed(2)}</p>
            <p className="text-gray-600 text-[10px]">{s.exitRules.stopLossMult}× credit</p>
          </div>
        </div>
      )}

      {/* Not viable badge */}
      {!s.isViable && (
        <div className="text-center text-xs text-gray-600 bg-gray-800/30 rounded py-2">
          Conditions not met today — monitor for setup
        </div>
      )}

      {/* Warnings */}
      {s.warnings.length > 0 && s.isViable && (
        <div className="space-y-0.5">
          {s.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-orange-400 bg-orange-900/20 rounded px-2 py-1">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />{w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
