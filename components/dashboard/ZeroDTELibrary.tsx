'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, ClipboardList, BookOpen, AlertTriangle, Send, RefreshCw, Zap } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryParam = { parameter: string; value: string; notes?: string };
type SetupStep  = { step: number; text: string };

type StrategySuggestion = {
  strategyId: string;
  shortPutStrike: number | null;
  longPutStrike: number | null;
  shortCallStrike: number | null;
  longCallStrike: number | null;
  spreadWidth: number;
  estimatedCreditPerSide: number | null;
  estimatedTotalCredit: number | null;
  stopLoss: number | null;
  targetProfit: number | null;
  putBreakeven: number | null;
  callBreakeven: number | null;
  pop: number;
  expectedMoveHigh: number;
  expectedMoveLow: number;
  impliedVol: number;
  shortPutDelta: number | null;
  longPutDelta: number | null;
  shortCallDelta: number | null;
  longCallDelta: number | null;
  shortPutPremium: number | null;
  longPutPremium: number | null;
  shortCallPremium: number | null;
  longCallPremium: number | null;
};

type Strategy = {
  id: string;
  name: string;
  winRate: string;
  winRateNum: number; // for badge color: >=75 green, 65-74 yellow, <65 gray
  structure: string;
  entryWindow: string;
  vixFilter: string;
  gexFilter: string;
  philosophy: string;
  params: EntryParam[];
  checklist: string[];
  risk: string[];
  setup: SetupStep[];
};

// ─── Strategy Data ────────────────────────────────────────────────────────────

const STRATEGIES: Strategy[] = [
  {
    id: 'BIC',
    name: 'Breakeven Iron Condor',
    winRate: '70–80%',
    winRateNum: 75,
    structure: 'Neutral',
    entryWindow: '1:00 PM – 3:45 PM EST',
    vixFilter: '< 25',
    gexFilter: 'Positive',
    philosophy: 'The highest-probability mechanical 0DTE strategy with 9,100+ live-trade validation (Apr 2021–Feb 2026). Named "Breakeven" because if one side stops out you are roughly flat — you only lose if BOTH sides stop out simultaneously (8.6% occurrence historically).',
    params: [
      { parameter: 'Underlying',        value: 'SPX (Section 1256)' },
      { parameter: 'Structure',         value: 'Iron Condor — sell put spread + sell call spread' },
      { parameter: 'Short Delta',       value: '10–15 on each leg' },
      { parameter: 'Wing Width',        value: '30 points each side' },
      { parameter: 'Premium Collection',value: 'Equal on both sides (~$0.80–$2.00 each side typical)' },
      { parameter: 'Entry Window',      value: '1:00 PM – 3:45 PM EST (most profitable)' },
      { parameter: 'VIX Filter',        value: '< 25 preferred' },
      { parameter: 'GEX Filter',        value: 'Positive GEX preferred (range compression)' },
    ],
    checklist: [
      'GEX is positive (market range-bound environment)',
      'VIX is below 25',
      'SPX is not in a news catalyst hour (Fed, CPI, NFP)',
      'Time is 1:00 PM EST or later',
      'Equal premium collected on both put and call side',
      'Stop-loss orders pre-set on both sides at order entry',
    ],
    risk: [
      'Stop-Loss: Set separately on each side equal to total IC premium collected',
      'Tighten stops throughout the day to lock in gains',
      'Take Profit: When short legs reach $0.05, OR let stops work',
      'Max Loss per Trade: 1–2% of account',
      'Daily Loss Limit: 3–5% — stop trading if hit',
      'Position Size: Max 1 condor per $10,000 account value',
    ],
    setup: [
      { step: 1, text: 'Check regime bar — need GEX positive, VIX <25, time >1 PM' },
      { step: 2, text: 'Find 10–15 delta put strike and matching call strike on SPX 0DTE chain' },
      { step: 3, text: 'Confirm equal premium on both sides (~$0.80–$2.00 each side typical)' },
      { step: 4, text: 'Enter as single iron condor order (4 legs simultaneously)' },
      { step: 5, text: 'Set OCO stop-loss orders on each spread independently at premium-collected level' },
    ],
  },
  {
    id: 'LateEntryIC',
    name: 'Late-Entry Iron Condor',
    winRate: 'Highest (3:58 PM)',
    winRateNum: 80,
    structure: 'Neutral',
    entryWindow: '3:55 – 3:58 PM EST',
    vixFilter: '< 25',
    gexFilter: 'Any',
    philosophy: 'Quantitative study of 3,100+ historical trades (2013–2025) shows the 3:58 PM entry consistently outperforms 3:55 PM across win rate, Sharpe ratio, drawdown severity, and risk of ruin. Minimizes time exposure while capturing steepest theta decay of the session. Near-zero vega risk.',
    params: [
      { parameter: 'Underlying',   value: 'SPX (Section 1256)' },
      { parameter: 'Structure',    value: 'Iron Condor' },
      { parameter: 'Short Delta',  value: '0.10–0.15 (roughly 0.5–0.8% OTM from current price)' },
      { parameter: 'Entry Window', value: '3:55 PM – 3:58 PM EST only' },
      { parameter: 'VIX Filter',   value: '<20 ideal, <25 acceptable' },
      { parameter: 'GEX Filter',   value: 'Any — very little time for regime to matter' },
    ],
    checklist: [
      'Clock is between 3:55 and 3:58 PM EST',
      'VIX below 25 (below 20 = ideal)',
      'SPX is not in a climactic directional move in final 30 min',
      'Strikes selected 0.5–0.8% OTM from current price',
      'Credit collected is meaningful (min 15% of spread width)',
    ],
    risk: [
      'Max Loss = width of spread minus credit received',
      'Position Size: 1 condor per $5,000 (very short-duration)',
      'Stop-Loss: Mental only — there is no time to manage. Size accordingly.',
      "'Set and forget' — positions expire in minutes. Size to accept max loss.",
    ],
    setup: [
      { step: 1, text: 'At 3:55 PM, pull up SPX 0DTE options chain' },
      { step: 2, text: 'Select 0.10–0.15 delta strikes on both call and put side' },
      { step: 3, text: 'Verify credit collected is meaningful relative to spread width (min 15% of width)' },
      { step: 4, text: 'Enter as limit order — accept fill and hold to 4:00 PM cash settlement' },
    ],
  },
  {
    id: 'PegIC',
    name: 'Afternoon Peg Iron Condor',
    winRate: '66–68%',
    winRateNum: 67,
    structure: 'Neutral',
    entryWindow: '1:00 – 2:45 PM EST',
    vixFilter: '< 20',
    gexFilter: 'Positive',
    philosophy: "Based on Option Alpha's SPX intraday \"pegging\" research — SPX statistically closes within a progressively tighter range of its mid-session price as the day advances. 66.1% of the time SPX closes within 0.3% of its 1:00 PM price.",
    params: [
      { parameter: 'Underlying',      value: 'SPX (Section 1256)' },
      { parameter: 'Structure',       value: 'Iron Condor' },
      { parameter: 'OTM %',           value: '0.2–0.3% from current spot price' },
      { parameter: 'Spread Width',    value: '5 points' },
      { parameter: 'Entry Window',    value: '1:00–2:45 PM EST' },
      { parameter: 'Min Reward/Risk', value: '48–51% (must meet threshold — do not trade below)', notes: '64.4% R/R at 2:44 PM → 68% win rate' },
    ],
    checklist: [
      'Time is between 1:00 and 2:45 PM EST',
      'Reward/Risk ratio is ≥48% (credit / max loss at least 48%)',
      'Both strikes are 0.2–0.3% OTM from current SPX price',
      'VIX is not in backwardation (acute stress signal = skip)',
      'No major macro print due in next 2 hours',
    ],
    risk: [
      'Stop-Loss: 2× credit received (collect $196 → stop at $392 debit)',
      'Take Profit: 50% of max credit',
      'Max Loss: 1–2% of account',
      'Daily Limit: 3–5% account',
    ],
    setup: [
      { step: 1, text: 'At 1–2:45 PM, note current SPX price' },
      { step: 2, text: 'Calculate 0.2% and 0.3% OTM levels for both call and put sides' },
      { step: 3, text: 'Pull 5-point-wide spread at those levels — verify credit and compute R/R' },
      { step: 4, text: 'Only enter if R/R ≥ 48%' },
      { step: 5, text: 'Set 50% profit target and 2× stop in platform' },
    ],
  },
  {
    id: 'TuesdayPCS',
    name: 'Tuesday ATM Put Credit Spread',
    winRate: '77%',
    winRateNum: 77,
    structure: 'Directional-Bullish',
    entryWindow: '10:30–11:00 AM EST (Tue only)',
    vixFilter: 'Above 20 SMA',
    gexFilter: 'POTR ≥ 50%',
    philosophy: "Day-of-week seasonality + dual technical confirmation. POTR (Post Open Triumph Rate) measures % of Tuesdays SPX closed higher than 10:30 AM price over trailing 2 months. When POTR ≥50% AND both technical filters pass: 77% win rate, +$61 avg expectancy (2022–2025, 77 trades).",
    params: [
      { parameter: 'Underlying',       value: 'SPX (Section 1256)' },
      { parameter: 'Day',              value: 'Tuesday ONLY' },
      { parameter: 'Structure',        value: 'ATM Put Credit Spread' },
      { parameter: 'Spread Width',     value: '5 points' },
      { parameter: 'Min Credit',       value: '$1.80' },
      { parameter: 'Strike Selection', value: 'At-the-money (short put at current SPX price)' },
      { parameter: 'Entry Window',     value: '10:30–11:00 AM EST' },
      { parameter: 'Hold',             value: "To expiration — no stops, no profit targets", notes: 'Avg win $195 | Avg loss $271 | Expectancy +$61/trade' },
    ],
    checklist: [
      'It is Tuesday',
      "Tuesday's POTR is ≥50% (check AlphaCrunching.com each weekend)",
      'SPX is above its 20-day simple moving average (daily chart)',
      '5-EMA is above 40-EMA on the 1-minute SPX chart between 10:30–11:00 AM',
      'Credit received is ≥$1.80 for the 5-point spread',
    ],
    risk: [
      'Management: None — hold to expiration (no intraday stops, no targets)',
      "Alpha comes from selectivity + hold discipline, NOT management",
      'Position Size: 1% of account max per trade',
      'PDT Note: No PDT issues — position is not closed intraday',
    ],
    setup: [
      { step: 1, text: 'Each weekend, look up Tuesday POTR on AlphaCrunching.com' },
      { step: 2, text: 'If POTR ≥50%, mark Tuesday as a potential trade day' },
      { step: 3, text: 'At market open Tuesday, check SPX vs. 20 SMA on daily chart' },
      { step: 4, text: 'Between 10:30–11:00 AM, check 1-min chart: 5-EMA must be above 40-EMA' },
      { step: 5, text: 'If all conditions met, sell ATM SPX put credit spread, 5-point width, ≥$1.80 credit. Hold to close.' },
    ],
  },
  {
    id: 'GEXSpread',
    name: 'GEX-Anchored Directional Spread',
    winRate: 'Regime-Dependent',
    winRateNum: 68,
    structure: 'Directional',
    entryWindow: '10:00 AM+ EST',
    vixFilter: 'Regime Match',
    gexFilter: 'Required',
    philosophy: 'Uses Gamma Exposure (GEX) as the primary entry filter. Positive GEX = dealers long gamma → price compresses into range → sell put credit spreads. Negative GEX = dealers short gamma → moves accelerate → fade extended rallies with call credit spreads.',
    params: [
      { parameter: 'Underlying',                  value: 'SPX or SPY' },
      { parameter: 'Entry Signal',                value: 'GEX regime + price vs. HVL (High Volatility Level)' },
      { parameter: 'Positive GEX Playbook',       value: 'Sell put credit spread — range compression expected' },
      { parameter: 'Negative GEX Playbook',       value: 'Sell call credit spread — fade extended rallies only' },
      { parameter: 'Spread Width',                value: '5–10 points' },
      { parameter: 'Delta',                       value: '10–20 on short leg' },
      { parameter: 'Data Sources',                value: 'SpotGamma TRACE, Barchart.com, OptionAlpha GEX' },
    ],
    checklist: [
      'Net GEX sign confirmed (SpotGamma or Barchart)',
      '[Positive GEX] SPX is above the HVL for the day',
      '[Positive GEX] Price has pulled back toward Put Wall — not at the wall itself',
      '[Negative GEX] SPX has made a sharp rally from the open (extended move)',
      '[Negative GEX] Price approaching the Call Wall level',
      'VIX is not in acute spike mode (rising fast = skip)',
      'Entry time is 10:00 AM or later (avoid first 30-min chaos)',
    ],
    risk: [
      'Stop-Loss: 2× credit received',
      'Position Size: Reduce to 50% normal size in negative GEX environments',
      'Key Rule: In negative GEX, never fight the direction — only fade extensions',
    ],
    setup: [
      { step: 1, text: 'Pre-market: check SpotGamma or Barchart for GEX sign and HVL level' },
      { step: 2, text: 'Post-10 AM: identify which playbook applies (positive vs. negative GEX)' },
      { step: 3, text: 'Select appropriate spread (put spread if +GEX, call spread if -GEX + extended rally)' },
      { step: 4, text: 'Set 50% profit target and 2× stop' },
    ],
  },
  {
    id: 'VIX1DIC',
    name: 'VIX1D Regime Iron Condor',
    winRate: 'Regime-Dependent',
    winRateNum: 68,
    structure: 'Neutral',
    entryWindow: '10:00–11:00 AM EST',
    vixFilter: 'VIX1D > 20D avg',
    gexFilter: 'Positive',
    philosophy: 'CBOE launched VIX1D in April 2023 to measure expected volatility over the next single trading day — embedded in 0DTE/1DTE SPX pricing. When VIX1D is elevated relative to its 20-day average, 0DTE premiums are rich. When compressed, premiums are thin — skip or go directional.',
    params: [
      { parameter: 'Underlying',    value: 'SPX' },
      { parameter: 'Structure',     value: 'Iron Condor' },
      { parameter: 'Delta',         value: '10–15 (tighter in low vol, 15–20 in high vol)' },
      { parameter: 'Wing Width',    value: '5–10 points depending on premium richness' },
      { parameter: 'Entry Window',  value: '10:00–11:00 AM EST' },
      { parameter: 'VIX1D Data',    value: 'CBOE VIX1D index (ticker: VIX1D) on TradingView or CBOE.com', notes: '≥20% above avg = max size; near avg = half size' },
    ],
    checklist: [
      'VIX1D is above its 20-day moving average',
      'VIX1D is NOT in a spike above 30 (extreme volatility = skip)',
      'GEX is positive (supports range-bound outcome)',
      'SPX is not in a gap-and-go continuation from open',
      'Spread credit meets minimum R/R threshold (≥15% of wing width)',
    ],
    risk: [
      'Max Loss: 1–2% per trade, 3–5% daily limit',
      'In high VIX1D (>20% above avg): standard sizing',
      'In moderate VIX1D: half-size',
      'Stop-Loss: 2× credit received',
    ],
    setup: [
      { step: 1, text: 'Pre-market: look up VIX1D value and its 20-day average on TradingView' },
      { step: 2, text: 'Confirm VIX1D > 20D avg but NOT spiking above 30' },
      { step: 3, text: 'Check GEX is positive and SPX is not gapping directionally' },
      { step: 4, text: 'At 10–11 AM, find 10–15 delta strikes on both sides of SPX 0DTE chain' },
      { step: 5, text: 'Enter IC, set 2× credit stop-loss on each side' },
    ],
  },
  {
    id: 'SchwartzIC',
    name: 'Schwartz Dollar Rule IC',
    winRate: 'High (post-vol)',
    winRateNum: 72,
    structure: 'Neutral-Post-Vol',
    entryWindow: '11:00 AM – 1:00 PM EST',
    vixFilter: 'Post-spike',
    gexFilter: 'Contracting',
    philosophy: 'From Henry Schwartz, Cboe VP of Market Intelligence (Robinhood HOOD Summit 2025). Best deployed AFTER the market has already experienced a volatile open and is beginning to narrow. The "Dollar Rule": find 10-point SPX spreads yielding ~$1.00 premium each side — two independent 9:1 bets.',
    params: [
      { parameter: 'Underlying',     value: 'SPX' },
      { parameter: 'Structure',      value: 'Iron Condor' },
      { parameter: 'Spread Width',   value: '10 points each side' },
      { parameter: 'Target Credit',  value: '~$1.00 per spread (~$2.00 total IC credit)', notes: 'The Dollar Rule' },
      { parameter: 'Entry Window',   value: '11:00 AM – 1:00 PM EST' },
      { parameter: 'Best Condition', value: 'VIX spiked at open and is now contracting' },
      { parameter: 'Risk:Reward',    value: 'Approximately 9:1 per spread leg' },
    ],
    checklist: [
      'VIX spiked earlier in the session and is now declining',
      'Market opened with high volatility and is now narrowing',
      'Time is between 11:00 AM and 1:00 PM EST',
      'Each 10-point spread is yielding approximately $1.00 in premium',
      'Total IC credit is approximately $2.00',
    ],
    risk: [
      'Each side is sized as an independent 9:1 bet — losing one side = near breakeven',
      'Stop-Loss: 50% of max loss on either individual spread',
      'Take Profit: Hold to expiration (let theta work)',
      'Position Size: 1–2 contracts per $10,000 account value',
    ],
    setup: [
      { step: 1, text: 'Watch for a volatile open (VIX spike, big directional move in first 30 min)' },
      { step: 2, text: 'By 11 AM, confirm VIX is contracting — volatility compressing, not expanding' },
      { step: 3, text: 'At 11 AM–1 PM, find 10-point SPX spreads on both sides yielding ~$1.00 each' },
      { step: 4, text: 'Enter IC, hold to expiration' },
    ],
  },
];


// ─── Regime Filter Bar ────────────────────────────────────────────────────────

type VIX1DRelative = 'below' | 'at' | 'above';
type GEXEnv = 'positive' | 'negative';
type SPXVsSMA = 'above' | 'below';

type RegimeState = {
  vixLevel: string;
  vix1dRelative: VIX1DRelative;
  gexEnv: GEXEnv;
  spxVsSma: SPXVsSMA;
};

function vixColor(vix: number) {
  if (vix < 20) return { dot: 'bg-green-500', text: 'text-green-400', label: 'Low', score: 1 };
  if (vix <= 25) return { dot: 'bg-yellow-500', text: 'text-yellow-400', label: 'Moderate', score: 0.5 };
  return { dot: 'bg-red-500', text: 'text-red-400', label: 'High', score: 0 };
}

function RegimeFilterBar({
  regime,
  onChange,
  loading,
  lastUpdated,
  onRefresh,
}: {
  regime: RegimeState;
  onChange: (r: RegimeState) => void;
  loading?: boolean;
  lastUpdated?: number | null;
  onRefresh?: () => void;
}) {
  const vix = parseFloat(regime.vixLevel) || 0;
  const vc = vixColor(vix);

  // Green scores
  const scores = {
    vix: vc.score,
    vix1d: regime.vix1dRelative === 'below' ? 1 : regime.vix1dRelative === 'at' ? 0.5 : 0,
    gex: regime.gexEnv === 'positive' ? 1 : 0,
    spx: regime.spxVsSma === 'above' ? 1 : 0,
  };
  const total = scores.vix + scores.vix1d + scores.gex + scores.spx;

  type Verdict = { label: string; desc: string; cls: string };
  let verdict: Verdict;
  if (total >= 3.5) {
    verdict = { label: 'HIGH PROBABILITY', desc: 'Condor/Credit Spread conditions optimal', cls: 'border-green-600 bg-green-950/50 text-green-300' };
  } else if (total >= 2) {
    verdict = { label: 'MODERATE', desc: 'Proceed with reduced size', cls: 'border-yellow-600 bg-yellow-950/50 text-yellow-300' };
  } else {
    verdict = { label: 'AVOID', desc: 'Regime not favorable for 0DTE premium selling', cls: 'border-red-600 bg-red-950/50 text-red-300' };
  }

  function Toggle({
    label,
    options,
    value,
    onSelect,
    colorMap,
  }: {
    label: string;
    options: string[];
    value: string;
    onSelect: (v: string) => void;
    colorMap: Record<string, string>;
  }) {
    return (
      <div>
        <div className="text-xs text-slate-400 mb-1.5">{label}</div>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {options.map((opt, i) => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className={`flex-1 text-xs py-1.5 px-2 transition-colors font-medium ${
                value === opt
                  ? colorMap[opt] + ' text-white'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              } ${i > 0 ? 'border-l border-slate-700' : ''}`}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-400" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Regime Filter</h3>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <RefreshCw size={10} className="animate-spin" /> Fetching live data…
            </span>
          ) : lastUpdated ? (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Zap size={10} />
              Live · {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh live data"
              className="p-1 rounded text-slate-500 hover:text-white transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* VIX Level */}
        <div>
          <div className="text-xs text-slate-400 mb-1.5">VIX Level</div>
          <div className="relative">
            <input
              type="number"
              value={regime.vixLevel}
              onChange={e => onChange({ ...regime, vixLevel: e.target.value })}
              placeholder="e.g. 18.5"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {vix > 0 && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${vc.text}`}>
              <span className={`w-2 h-2 rounded-full ${vc.dot}`} />
              {vc.label} ({vix < 20 ? '< 20' : vix <= 25 ? '20–25' : '> 25'})
            </div>
          )}
        </div>

        {/* VIX1D vs 20D */}
        <Toggle
          label="VIX1D vs 20D Avg"
          options={['below', 'at', 'above']}
          value={regime.vix1dRelative}
          onSelect={v => onChange({ ...regime, vix1dRelative: v as VIX1DRelative })}
          colorMap={{ below: 'bg-green-700', at: 'bg-yellow-700', above: 'bg-red-700' }}
        />

        {/* GEX */}
        <Toggle
          label="GEX Environment"
          options={['positive', 'negative']}
          value={regime.gexEnv}
          onSelect={v => onChange({ ...regime, gexEnv: v as GEXEnv })}
          colorMap={{ positive: 'bg-green-700', negative: 'bg-red-700' }}
        />

        {/* SPX vs 20 SMA */}
        <Toggle
          label="SPX vs 20 SMA"
          options={['above', 'below']}
          value={regime.spxVsSma}
          onSelect={v => onChange({ ...regime, spxVsSma: v as SPXVsSMA })}
          colorMap={{ above: 'bg-green-700', below: 'bg-red-700' }}
        />
      </div>

      {/* Verdict */}
      <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 ${verdict.cls}`}>
        <span className="text-sm font-bold">{verdict.label}</span>
        <span className="text-slate-400">—</span>
        <span className="text-sm">{verdict.desc}</span>
      </div>
    </div>
  );
}


// ─── Strategy Comparison Table ────────────────────────────────────────────────

function StrategyComparisonTable({ strategies }: { strategies: Strategy[] }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300 mb-3">Strategy Comparison</h3>
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-700">
            {['#', 'Strategy', 'Win Rate', 'Structure', 'Best Entry', 'VIX', 'GEX', '1256'].map(h => (
              <th key={h} className="text-left py-2 px-2 text-slate-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strategies.map((s, i) => (
            <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
              <td className="py-2 px-2 text-slate-500">{i + 1}</td>
              <td className="py-2 px-2 font-medium text-white">{s.name}</td>
              <td className="py-2 px-2"><WinRateBadge rate={s.winRate} num={s.winRateNum} /></td>
              <td className="py-2 px-2 text-slate-400">{s.structure}</td>
              <td className="py-2 px-2 text-slate-300">{s.entryWindow}</td>
              <td className="py-2 px-2 text-slate-400">{s.vixFilter}</td>
              <td className="py-2 px-2 text-slate-400">{s.gexFilter}</td>
              <td className="py-2 px-2 text-green-400">✓</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Win Rate Badge ───────────────────────────────────────────────────────────

function WinRateBadge({ rate, num }: { rate: string; num: number }) {
  const cls =
    num >= 75
      ? 'bg-green-900/40 text-green-400 border-green-700'
      : num >= 65
      ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700'
      : 'bg-slate-800 text-slate-400 border-slate-600';
  return (
    <span className={`border rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {rate}
    </span>
  );
}

// ─── Trade Logger Form ────────────────────────────────────────────────────────

// ─── IntradayPanel-style helpers (local copies) ───────────────────────────────

function LiveMetricBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-900/60 rounded-lg p-2.5 text-center">
      <div className="text-[10px] text-gray-600 mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${valueClass ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function LiveExitBox({ label, value, sub, color, bg }: { label: string; value: string; sub: string; color: string; bg: string }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${bg}`}>
      <div className={`text-xs font-semibold ${color} mb-0.5`}>{label}</div>
      <div className="text-xs text-white">{value}</div>
      <div className="text-xs text-gray-500 font-mono">{sub}</div>
    </div>
  );
}

function LiveLegRow({
  action, strike, optionType, delta, iv, premium,
}: {
  action: 'sell' | 'buy';
  strike: number;
  optionType: 'put' | 'call';
  delta?: number | null;
  iv?: number | null;
  premium?: number | null;
}) {
  const isSell = action === 'sell';
  return (
    <div className="grid grid-cols-6 gap-1 items-center py-1 text-xs font-mono border-b border-gray-800/50 last:border-0">
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase text-center ${
        isSell ? 'bg-red-900/60 text-red-400' : 'bg-green-900/60 text-green-400'
      }`}>{isSell ? 'SELL' : 'BUY'}</span>
      <span className={`text-right ${isSell ? 'text-red-300' : 'text-green-300'}`}>{strike}</span>
      <span className="text-gray-400 uppercase">{optionType.slice(0, 3)}</span>
      <span className="text-blue-400">{delta != null ? `Δ${delta.toFixed(2)}` : '—'}</span>
      <span className="text-purple-400">{iv != null && iv > 0 ? `${(iv * 100).toFixed(0)}%` : '—'}</span>
      <span className={`text-right ${isSell ? 'text-yellow-400' : 'text-gray-400'}`}>
        {premium != null && premium > 0 ? `${isSell ? '+' : '−'}$${premium.toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TradeLoggerForm({
  strategyId,
  checkedItems,
  totalItems,
  onClose,
  prefill,
}: {
  strategyId: string;
  checkedItems: number;
  totalItems: number;
  onClose: () => void;
  prefill?: StrategySuggestion | null;
}) {
  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  const [form, setForm] = useState({
    expirationDate: todayISO,
    vixAtEntry: '',
    vix1dAtEntry: '',
    gexEnvironment: 'positive' as GEXEnv,
    spxVs20sma: 'above' as SPXVsSMA,
    structureType: prefill?.shortCallStrike != null ? 'iron_condor' : 'put_credit_spread',
    shortPutStrike: prefill?.shortPutStrike?.toString() ?? '',
    longPutStrike: prefill?.longPutStrike?.toString() ?? '',
    shortCallStrike: prefill?.shortCallStrike?.toString() ?? '',
    longCallStrike: prefill?.longCallStrike?.toString() ?? '',
    spreadWidth: prefill?.spreadWidth?.toString() ?? '',
    entryTime: '',
    entryCredit: prefill?.estimatedTotalCredit?.toFixed(2) ?? '',
    contracts: '1',
    exitTime: '',
    exitDebit: '',
    outcome: 'max_profit',
    totalPnl: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        strategyName: strategyId,
        expirationDate: form.expirationDate || null,
        vixAtEntry: form.vixAtEntry ? parseFloat(form.vixAtEntry) : null,
        vix1dAtEntry: form.vix1dAtEntry ? parseFloat(form.vix1dAtEntry) : null,
        gexEnvironment: form.gexEnvironment,
        spxVs20sma: form.spxVs20sma,
        structureType: form.structureType,
        shortPutStrike: form.shortPutStrike ? parseFloat(form.shortPutStrike) : null,
        longPutStrike: form.longPutStrike ? parseFloat(form.longPutStrike) : null,
        shortCallStrike: form.shortCallStrike ? parseFloat(form.shortCallStrike) : null,
        longCallStrike: form.longCallStrike ? parseFloat(form.longCallStrike) : null,
        spreadWidth: form.spreadWidth ? parseFloat(form.spreadWidth) : null,
        entryTime: form.entryTime || null,
        entryCredit: form.entryCredit ? parseFloat(form.entryCredit) : null,
        contracts: parseInt(form.contracts) || 1,
        exitTime: form.exitTime || null,
        exitDebit: form.exitDebit ? parseFloat(form.exitDebit) : null,
        outcome: form.outcome,
        totalPnl: form.totalPnl ? parseFloat(form.totalPnl) : null,
        allConditionsMet: checkedItems === totalItems,
        conditionsSkipped: checkedItems < totalItems ? `${totalItems - checkedItems} condition(s) skipped` : null,
        notes: form.notes || null,
        underlying: 'SPX',
      };
      const res = await fetch('/api/zero-dte-trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to save');
      setSubmitted(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-950/40 border border-green-700 rounded-xl p-6 text-center">
        <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
        <p className="text-green-300 font-semibold">Trade logged successfully!</p>
        <button onClick={onClose} className="mt-3 text-xs text-slate-400 hover:text-white">Close</button>
      </div>
    );
  }

  const Field = ({ label, fieldKey, type = 'text', placeholder = '' }: { label: string; fieldKey: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type={type}
        value={(form as any)[fieldKey]}
        onChange={e => set(fieldKey, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Log This Trade</span>
          <span className="text-xs text-slate-500">→ {strategyId}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* Credit spread summary */}
      {(form.shortPutStrike || form.shortCallStrike) && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 mb-3">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">
            Credit Spread Structure · SPX · Exp {form.expirationDate}
          </div>
          <div className="space-y-1">
            {form.shortPutStrike && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-green-700/60 text-green-300 text-[10px] font-bold px-1.5 py-0.5 rounded">SELL</span>
                  <span className="text-white font-mono">SPX {form.expirationDate} {form.shortPutStrike} Put</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-red-900/50 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded">BUY</span>
                  <span className="text-slate-400 font-mono">SPX {form.expirationDate} {form.longPutStrike || '—'} Put</span>
                </div>
              </>
            )}
            {form.shortCallStrike && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-green-700/60 text-green-300 text-[10px] font-bold px-1.5 py-0.5 rounded">SELL</span>
                  <span className="text-white font-mono">SPX {form.expirationDate} {form.shortCallStrike} Call</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-red-900/50 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded">BUY</span>
                  <span className="text-slate-400 font-mono">SPX {form.expirationDate} {form.longCallStrike || '—'} Call</span>
                </div>
              </>
            )}
            {form.entryCredit && (
              <div className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-800">
                Net Credit: <span className="text-green-400 font-semibold">${form.entryCredit}</span>
                {form.contracts && form.contracts !== '1' && <span> × {form.contracts} contracts</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {checkedItems < totalItems && (
        <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-700/50 rounded px-3 py-2 mb-3 text-xs text-yellow-400">
          <AlertTriangle size={12} />
          {totalItems - checkedItems} checklist item(s) not confirmed — log anyway?
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <Field label="Expiration Date" fieldKey="expirationDate" type="date" />
        <Field label="VIX at Entry" fieldKey="vixAtEntry" type="number" placeholder="18.5" />
        <Field label="VIX1D at Entry" fieldKey="vix1dAtEntry" type="number" placeholder="22.1" />
        <div>
          <label className="text-xs text-slate-400 block mb-1">Structure Type</label>
          <select
            value={form.structureType}
            onChange={e => set('structureType', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="iron_condor">Iron Condor</option>
            <option value="put_credit_spread">Put Credit Spread</option>
            <option value="call_credit_spread">Call Credit Spread</option>
          </select>
        </div>
        <Field label="SELL Put Strike" fieldKey="shortPutStrike" type="number" placeholder="5250" />
        <Field label="BUY Put Strike" fieldKey="longPutStrike" type="number" placeholder="5220" />
        <Field label="SELL Call Strike" fieldKey="shortCallStrike" type="number" placeholder="5350" />
        <Field label="BUY Call Strike" fieldKey="longCallStrike" type="number" placeholder="5380" />
        <Field label="Spread Width (pts)" fieldKey="spreadWidth" type="number" placeholder="30" />
        <Field label="Net Credit ($)" fieldKey="entryCredit" type="number" placeholder="1.50" />
        <Field label="Entry Time" fieldKey="entryTime" type="time" />
        <Field label="Contracts" fieldKey="contracts" type="number" placeholder="1" />
        <div>
          <label className="text-xs text-slate-400 block mb-1">GEX Environment</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(['positive', 'negative'] as GEXEnv[]).map((opt, i) => (
              <button
                key={opt}
                onClick={() => setForm(f => ({ ...f, gexEnvironment: opt }))}
                className={`flex-1 text-xs py-1.5 transition-colors font-medium ${
                  form.gexEnvironment === opt ? (opt === 'positive' ? 'bg-green-700 text-white' : 'bg-red-700 text-white') : 'bg-slate-800 text-slate-500'
                } ${i > 0 ? 'border-l border-slate-700' : ''}`}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3 border-t border-slate-700 pt-3">
        <Field label="Exit Time" fieldKey="exitTime" type="time" />
        <Field label="Exit Debit ($)" fieldKey="exitDebit" type="number" placeholder="0.50" />
        <div>
          <label className="text-xs text-slate-400 block mb-1">Outcome</label>
          <select
            value={form.outcome}
            onChange={e => set('outcome', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="max_profit">Max Profit</option>
            <option value="partial_profit">Partial Profit</option>
            <option value="breakeven">Breakeven</option>
            <option value="stop_loss">Stop Loss</option>
            <option value="max_loss">Max Loss</option>
          </select>
        </div>
        <Field label="Total P&L ($)" fieldKey="totalPnl" type="number" placeholder="150" />
      </div>

      <div className="mb-4">
        <label className="text-xs text-slate-400 block mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          placeholder="Market context, adjustments, observations…"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white resize-none focus:outline-none focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="text-red-400 text-xs mb-3 bg-red-950/30 border border-red-700/40 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Send size={13} />
          {submitting ? 'Saving…' : 'Save Trade'}
        </button>
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white px-3 py-2 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}


// ─── Strategy Accordion Row ───────────────────────────────────────────────────

function StrategyAccordionRow({
  strategy,
  index,
  isOpen,
  onToggle,
  suggestion,
}: {
  strategy: Strategy;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  suggestion?: StrategySuggestion | null;
}) {
  const [checked, setChecked] = useState<boolean[]>(() => strategy.checklist.map(() => false));
  const [showLogger, setShowLogger] = useState(false);

  const allChecked = checked.every(Boolean);
  const checkedCount = checked.filter(Boolean).length;

  function toggleItem(i: number) {
    setChecked(c => c.map((v, j) => (j === i ? !v : v)));
  }

  return (
    <div>
      {/* ── Collapsed header row (always visible) ── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800/50 transition-colors text-left"
      >
        <span className="w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-xs flex items-center justify-center font-bold shrink-0">
          {index}
        </span>
        <span className="text-sm font-semibold text-slate-100 flex-1 min-w-0">
          {strategy.name}
        </span>
        <WinRateBadge rate={strategy.winRate} num={strategy.winRateNum} />
        <span className="hidden md:block text-xs text-slate-500 w-24 shrink-0 text-right">{strategy.structure}</span>
        <span className="hidden lg:block text-xs text-slate-500 w-36 shrink-0 text-right">{strategy.entryWindow}</span>
        <span className="hidden sm:block text-xs text-slate-500 w-16 shrink-0 text-right">VIX {strategy.vixFilter}</span>
        {isOpen
          ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
          : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
      </button>

      {/* ── Expanded inline panel ── */}
      {isOpen && (
        <div className="px-4 pb-5 pt-3 bg-slate-900/30 border-t border-slate-800 space-y-4">
          {/* Header info */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs border rounded-full px-2 py-0.5 border-blue-700 bg-blue-900/30 text-blue-300">
                {strategy.structure}
              </span>
              <WinRateBadge rate={strategy.winRate} num={strategy.winRateNum} />
              <span className="text-xs border rounded-full px-2 py-0.5 border-slate-600 bg-slate-800 text-slate-400">
                Section 1256 (SPX)
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{strategy.philosophy}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Entry: <span className="text-slate-300">{strategy.entryWindow}</span></span>
              <span>VIX: <span className="text-slate-300">{strategy.vixFilter}</span></span>
              <span>GEX: <span className="text-slate-300">{strategy.gexFilter}</span></span>
            </div>
          </div>

          {/* [Live] Live Entry Setup — IntradayPanel layout */}
          {suggestion && (() => {
            const today = new Date().toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
              timeZone: 'America/New_York',
            });
            const hasPut  = suggestion.shortPutStrike  != null;
            const hasCall = suggestion.shortCallStrike != null;
            const credit  = suggestion.estimatedTotalCredit ?? 0;
            const maxRisk = suggestion.spreadWidth - credit;
            const popPct  = (suggestion.pop ?? 0) * 100;
            const popClass = popPct >= 88 ? 'text-green-400' : popPct >= 80 ? 'text-yellow-400' : 'text-red-400';

            const timeExits: Record<string, { time: string; sub: string }> = {
              BIC:         { time: '3:45 PM ET',    sub: 'Mandatory close' },
              LateEntryIC: { time: '4:00 PM ET',    sub: 'Hold to settlement' },
              PegIC:       { time: '3:45 PM ET',    sub: 'Or 50% profit' },
              TuesdayPCS:  { time: '4:00 PM ET',    sub: 'Hold to expiration' },
              GEXSpread:   { time: '3:45 PM ET',    sub: 'Or 50% profit' },
              VIX1DIC:     { time: '3:45 PM ET',    sub: 'Mandatory close' },
              SchwartzIC:  { time: '4:00 PM ET',    sub: 'Hold to settlement' },
            };
            const timeExit = timeExits[strategy.id] ?? { time: '3:45 PM ET', sub: 'Mandatory close' };

            return (
              <div className="bg-gray-950/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-full">LIVE</span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-green-300">Live Entry Setup</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">{today} · 0DTE</span>
                </div>

                {/* 4-col metrics */}
                <div className="grid grid-cols-4 gap-2">
                  <LiveMetricBox label="Win Prob"  value={`${popPct.toFixed(1)}%`}    valueClass={popClass} />
                  <LiveMetricBox label="Credit"    value={`$${credit.toFixed(2)}`}     valueClass="text-white" />
                  <LiveMetricBox label="Max Risk"  value={`$${maxRisk.toFixed(2)}`}    valueClass="text-red-400" />
                  <LiveMetricBox label="Width"     value={`${suggestion.spreadWidth} pts`} />
                </div>

                {/* Trade Structure */}
                <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Trade Structure</span>
                    <span className="text-[10px] text-yellow-400 font-mono">SPX · {today} · 0DTE</span>
                  </div>

                  {/* Leg table header */}
                  <div className="grid grid-cols-6 gap-1 text-[10px] text-gray-600 uppercase tracking-wider mb-1 px-0.5">
                    <span>Action</span>
                    <span className="text-right">Strike</span>
                    <span>Type</span>
                    <span>Delta</span>
                    <span>IV</span>
                    <span className="text-right">Est. $</span>
                  </div>

                  {/* Put spread legs */}
                  {hasPut && (
                    <>
                      <LiveLegRow action="sell" strike={suggestion.shortPutStrike!} optionType="put"
                        delta={suggestion.shortPutDelta} iv={suggestion.impliedVol} premium={suggestion.shortPutPremium} />
                      <LiveLegRow action="buy"  strike={suggestion.longPutStrike!}  optionType="put"
                        delta={suggestion.longPutDelta}  iv={suggestion.impliedVol} premium={suggestion.longPutPremium} />
                    </>
                  )}

                  {/* Call spread legs (IC only) */}
                  {hasCall && (
                    <>
                      <LiveLegRow action="sell" strike={suggestion.shortCallStrike!} optionType="call"
                        delta={suggestion.shortCallDelta} iv={suggestion.impliedVol} premium={suggestion.shortCallPremium} />
                      <LiveLegRow action="buy"  strike={suggestion.longCallStrike!}  optionType="call"
                        delta={suggestion.longCallDelta}  iv={suggestion.impliedVol} premium={suggestion.longCallPremium} />
                    </>
                  )}

                  {/* Net summary */}
                  <div className="mt-2 pt-2 border-t border-gray-700/40 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Net Credit</div>
                      <div className="text-white font-mono font-semibold">${credit.toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Per Contract</div>
                      <div className="text-emerald-400 font-mono font-semibold">${(credit * 100).toFixed(0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Width</div>
                      <div className="text-gray-300 font-mono">{suggestion.spreadWidth} pts</div>
                    </div>
                  </div>

                  {/* Expected Move Range */}
                  <div className="mt-3 pt-2 border-t border-gray-700/40">
                    <div className="text-[10px] text-gray-500 mb-1.5">1σ Expected Move Range</div>
                    <div className="flex items-center gap-2">
                      <div className="bg-green-500/10 border border-green-500/20 rounded px-2 py-1 text-xs text-green-400 font-mono flex-1 text-center">
                        ▲ {suggestion.expectedMoveHigh}
                      </div>
                      <div className="text-gray-600 text-xs">1σ</div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded px-2 py-1 text-xs text-red-400 font-mono flex-1 text-center">
                        ▼ {suggestion.expectedMoveLow}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3-col Exit Rules */}
                <div className="grid grid-cols-3 gap-2">
                  <LiveExitBox
                    label="Take Profit"
                    value={`$${(suggestion.targetProfit ?? credit * 0.5).toFixed(2)}`}
                    sub="50% of credit"
                    color="text-green-400"
                    bg="bg-green-500/10 border-green-500/20"
                  />
                  <LiveExitBox
                    label="Stop Loss"
                    value={`$${(suggestion.stopLoss ?? credit).toFixed(2)}`}
                    sub={hasCall ? '= total credit' : '1.5× credit'}
                    color="text-red-400"
                    bg="bg-red-500/10 border-red-500/20"
                  />
                  <LiveExitBox
                    label="Time Stop"
                    value={timeExit.time}
                    sub={timeExit.sub}
                    color="text-orange-400"
                    bg="bg-orange-500/10 border-orange-500/20"
                  />
                </div>
              </div>
            );
          })()}

          {/* [B] Entry Parameters */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-blue-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Entry Parameters</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-1.5 px-2 text-slate-400 font-medium w-1/3">Parameter</th>
                  <th className="text-left py-1.5 px-2 text-slate-400 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {strategy.params.map((p, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="py-2 px-2 text-slate-400">{p.parameter}</td>
                    <td className="py-2 px-2">
                      <span className="text-slate-200">{p.value}</span>
                      {p.notes && <span className="text-slate-500 ml-2 text-xs">({p.notes})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* [C] Entry Checklist */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={14} className="text-blue-400" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Entry Checklist</h3>
              </div>
              <span className="text-xs text-slate-500">{checkedCount}/{strategy.checklist.length} confirmed</span>
            </div>
            <div className="space-y-2 mb-3">
              {strategy.checklist.map((item, i) => (
                <button
                  key={i}
                  onClick={() => toggleItem(i)}
                  className="flex items-start gap-2.5 w-full text-left group"
                >
                  {checked[i] ? (
                    <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={16} className="text-slate-600 shrink-0 mt-0.5 group-hover:text-slate-400" />
                  )}
                  <span className={`text-xs leading-relaxed ${checked[i] ? 'text-slate-400 line-through' : 'text-slate-300'}`}>
                    {item}
                  </span>
                </button>
              ))}
            </div>
            {allChecked ? (
              <div className="flex items-center gap-2 bg-green-950/50 border border-green-700 rounded-lg px-4 py-2.5 text-green-300 font-semibold text-sm">
                <CheckCircle2 size={16} />
                CLEARED TO TRADE
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-yellow-950/30 border border-yellow-700/50 rounded-lg px-4 py-2.5 text-yellow-400 text-sm">
                <AlertTriangle size={14} />
                {strategy.checklist.length - checkedCount} condition(s) not confirmed — verify before trading
              </div>
            )}
          </div>

          {/* [D] Risk Management */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-orange-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Risk Management</h3>
            </div>
            <ul className="space-y-2">
              {strategy.risk.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="text-orange-500 mt-0.5 shrink-0">›</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* [E] Quick Setup */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Send size={14} className="text-blue-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Quick Setup</h3>
            </div>
            <ol className="space-y-2">
              {strategy.setup.map(s => (
                <li key={s.step} className="flex items-start gap-3 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-900/60 border border-blue-700 flex items-center justify-center text-blue-300 font-bold shrink-0 text-[10px]">
                    {s.step}
                  </span>
                  <span className="text-slate-300 leading-relaxed pt-0.5">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* [F] Log This Trade */}
          {!showLogger ? (
            <button
              onClick={() => setShowLogger(true)}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-600 text-slate-300 hover:text-white text-sm font-medium py-3 rounded-xl transition-all"
            >
              <ClipboardList size={15} />
              Log This Trade → {strategy.name}
            </button>
          ) : (
            <TradeLoggerForm
              strategyId={strategy.id}
              checkedItems={checkedCount}
              totalItems={strategy.checklist.length}
              onClose={() => setShowLogger(false)}
              prefill={suggestion}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesUntilClose(): number {
  try {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const close = new Date(etNow);
    close.setHours(16, 0, 0, 0);
    return Math.max((close.getTime() - etNow.getTime()) / 60000, 5);
  } catch {
    return 240; // fallback: 4 hours
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ZeroDTELibrary() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [regime, setRegime] = useState<RegimeState>({
    vixLevel: '',
    vix1dRelative: 'below',
    gexEnv: 'positive',
    spxVsSma: 'above',
  });
  const [showComparison, setShowComparison] = useState(false);
  const [regimeLoading, setRegimeLoading] = useState(false);
  const [regimeUpdatedAt, setRegimeUpdatedAt] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Map<string, StrategySuggestion>>(new Map());

  const fetchLive = useCallback(async () => {
    setRegimeLoading(true);
    try {
      // Fetch regime data
      const regimeRes = await fetch('/api/zero-dte-regime').then(r => r.json());
      if (regimeRes.success && regimeRes.data) {
        const d = regimeRes.data;
        setRegime({
          vixLevel: d.vixLevel != null ? d.vixLevel.toFixed(2) : '',
          vix1dRelative: d.vix1dRelative ?? 'at',
          gexEnv: d.gexEnv ?? 'positive',
          spxVsSma: d.spxVsSma ?? 'above',
        });
        setRegimeUpdatedAt(d.fetchedAt ?? Date.now());

        // Fetch suggestions using live SPX + VIX
        if (d.spxPrice && d.vixLevel) {
          const mins = minutesUntilClose();
          const sugRes = await fetch(
            `/api/zero-dte-suggestions?spx=${d.spxPrice}&vix=${d.vixLevel}&minutesLeft=${mins.toFixed(0)}`
          ).then(r => r.json());
          if (sugRes.success && Array.isArray(sugRes.data)) {
            const map = new Map<string, StrategySuggestion>();
            for (const s of sugRes.data) map.set(s.strategyId, s);
            setSuggestions(map);
          }
        }
      }
    } catch {
      // silently ignore — user can still set regime manually
    } finally {
      setRegimeLoading(false);
    }
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  return (
    <div className="space-y-4">
      <RegimeFilterBar
        regime={regime}
        onChange={setRegime}
        loading={regimeLoading}
        lastUpdated={regimeUpdatedAt}
        onRefresh={fetchLive}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-100">7 Strategies</h3>
          <span className="text-xs text-slate-500">— click any row to expand details</span>
        </div>
        <button
          onClick={() => setShowComparison(s => !s)}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ChevronDown size={12} className={`transition-transform ${showComparison ? 'rotate-180' : ''}`} />
          {showComparison ? 'Hide' : 'Show'} Comparison Table
        </button>
      </div>

      {showComparison && <StrategyComparisonTable strategies={STRATEGIES} />}

      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
        {STRATEGIES.map((strategy, idx) => (
          <StrategyAccordionRow
            key={strategy.id}
            strategy={strategy}
            index={idx + 1}
            isOpen={openId === strategy.id}
            onToggle={() => setOpenId(openId === strategy.id ? null : strategy.id)}
            suggestion={suggestions.get(strategy.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
