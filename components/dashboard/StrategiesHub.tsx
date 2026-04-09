'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, BarChart3, Zap, BookOpen } from 'lucide-react';
import { DirectionalBiasBar } from './DirectionalBiasBar';
import { IntradayPanel } from './IntradayPanel';
import { ZeroDTELibrary } from './ZeroDTELibrary';
import { ZeroDTEPerformance } from './ZeroDTEPerformance';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface StrategiesHubProps {
  spxPrice?: number;
  vix?: number;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function StrategiesHub({ spxPrice, vix }: StrategiesHubProps) {
  const [swingOpen,   setSwingOpen]   = useState(false);
  const [liveOpen,    setLiveOpen]    = useState(false);
  const [showPerf,    setShowPerf]    = useState(false);

  return (
    <div className="space-y-5">

      {/* ═══ SECTION A — 0DTE INTRADAY STRATEGIES (primary, always visible) ═══ */}
      <div>
        {/* Section A Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              0DTE Intraday Strategies
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-600/40 bg-yellow-500/10 text-yellow-400 font-medium">
              7 Strategies · SPX Section 1256
            </span>
          </div>
          <div className="flex-1 h-px bg-slate-800 hidden sm:block" />
          {/* Toggle between Library and Performance */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setShowPerf(false)}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                !showPerf
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen size={12} />
              Strategy Library
            </button>
            <button
              onClick={() => setShowPerf(true)}
              className={`px-3 py-1.5 flex items-center gap-1.5 border-l border-slate-700 transition-colors ${
                showPerf
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 size={12} />
              0DTE Performance
            </button>
          </div>
        </div>

        {/* Section A Content */}
        {showPerf ? <ZeroDTEPerformance /> : <ZeroDTELibrary />}
      </div>

      {/* ═══ SECTION B — SWING & INCOME STRATEGIES (collapsible) ═══ */}
      <div className="border-2 border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setSwingOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-slate-900/80 hover:bg-slate-800/80 transition-colors text-left"
        >
          {swingOpen
            ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
            : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-semibold text-slate-100">
              Swing &amp; Multi-Day Income Strategies
            </span>
            <span className="text-xs text-slate-500 border border-slate-700 rounded-full px-2 py-0.5">
              Wheel · PMCC · IC 45DTE · Jade Lizard · Verticals
            </span>
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            {swingOpen ? 'Click to collapse' : 'Click to expand'}
          </span>
        </button>
        {swingOpen && <SwingStrategiesAccordion />}
      </div>

      {/* ═══ SECTION C — LIVE ANALYSIS (collapsible) ═══ */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setLiveOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-3.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-left"
        >
          {liveOpen
            ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
            : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
          <span className="text-sm font-medium text-slate-300">
            ⚡ Live 0DTE Analysis &amp; Directional Bias
          </span>
          <span className="ml-auto text-xs text-slate-500 shrink-0">
            {liveOpen ? 'Collapse' : 'Expand for live signals'}
          </span>
        </button>
        {liveOpen && (
          <div className="p-5 space-y-5 border-t border-slate-800">
            <DirectionalBiasBar />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <IntradayPanel spxPrice={spxPrice} vix={vix} />
              <ZeroDTERules />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 0DTE Rules (used in Live Analysis) ──────────────────────────────────────

function ZeroDTERules() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>0DTE Rules of Engagement</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { num: 1,  rule: 'Wait for opening range (first 30 min) before entering',       color: 'text-blue-400' },
              { num: 2,  rule: 'Sell strikes OUTSIDE the intraday expected move',              color: 'text-green-400' },
              { num: 3,  rule: 'High IV → wider spreads (25 pts). Low IV → tighter (10 pts)', color: 'text-yellow-400' },
              { num: 4,  rule: 'Take profit at 25–50% of credit received',                    color: 'text-green-400' },
              { num: 5,  rule: 'Stop loss at 1.5× credit — no exceptions',                    color: 'text-red-400' },
              { num: 6,  rule: 'Close ALL positions before 3:45 PM ET',                        color: 'text-orange-400' },
              { num: 7,  rule: 'Gamma emergency: exit if price approaches short strike',       color: 'text-red-400' },
              { num: 8,  rule: 'Max 3 trades per day — quality over quantity',                 color: 'text-slate-400' },
              { num: 9,  rule: 'Do NOT trade 0DTE on FOMC, CPI, or NFP release days',         color: 'text-red-400' },
            ].map(item => (
              <div key={item.num} className="flex items-start gap-2.5 text-xs">
                <span className={`${item.color} font-bold w-4 shrink-0`}>{item.num}.</span>
                <span className="text-slate-400">{item.rule}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Swing Strategies Accordion ───────────────────────────────────────────────

const SWING_STRATEGIES = [
  {
    title: 'The Wheel (Cash-Secured Puts + Covered Calls)',
    tag: 'Neutral-Bullish · 30–45 DTE',
    body: [
      'Phase 1 — Cash-Secured Put: Sell OTM put at strike where you\'d be happy owning the stock/ETF. Target: 30–45 DTE, 0.25–0.30 delta. Close at 50% profit OR roll if stock approaches strike.',
      'Phase 2 — Covered Call (if assigned): Sell OTM call against 100 shares at strike above your cost basis. Target: 30 DTE, 0.20–0.30 delta. Repeat until called away above cost basis.',
      'Best Underlying: SPY, QQQ, or high-liquidity large-cap stocks. IVR Filter: IVR ≥ 50. Risk: Assignment risk — only Wheel stocks you\'d hold long-term.',
    ],
  },
  {
    title: 'Vertical Credit Spreads (30–45 DTE)',
    tag: 'Directional · 30–45 DTE',
    body: [
      'Bull Put Spread (Bullish): Sell put at 0.30 delta, buy put 5–10 points lower. Credit received = max profit; spread width − credit = max loss. Close at 50% profit or 21 DTE.',
      'Bear Call Spread (Bearish): Sell call at 0.30 delta, buy call 5–10 points higher. Same management rules.',
      'Signal Stack Integration: Only enter directional spreads when Crown Signal Stack score aligns with direction (score ≤2 for bullish, ≥5 for bearish).',
    ],
  },
  {
    title: 'Iron Condor (30–45 DTE, tastytrade Method)',
    tag: 'Neutral · 30–45 DTE · SPX 1256',
    body: [
      'Sell put spread + sell call spread simultaneously. Target: 0.16 delta on short strikes (1 standard deviation). Width: 5–10 points each side. Entry: IVR ≥ 50.',
      'Close at 50% profit or 21 DTE (whichever first). Roll untested side toward current price if one side breached.',
      'Best on SPX for 1256 tax treatment.',
    ],
  },
  {
    title: "PMCC — Poor Man's Covered Call (LEAPS)",
    tag: 'Moderately Bullish · LEAPS 12–24 mo',
    body: [
      'Setup: Buy deep ITM LEAPS call (0.70–0.80 delta) 12–24 months out. Sell OTM short-term call (0.25–0.30 delta) 30–45 DTE. Net debit must be less than the spread width.',
      'Management: Roll short call monthly as it decays. Close if short call is breached. Target: collect enough short call premium to offset LEAPS cost over time.',
      'Crown Score Filter: Only enter PMCC when Crown score is 0–2 (bullish macro).',
    ],
  },
  {
    title: 'Jade Lizard',
    tag: 'Neutral-Bullish · 30–45 DTE · IVR ≥ 50',
    body: [
      'Setup: Sell OTM put (0.30 delta) + sell OTM call spread (sell 0.20 delta call, buy further OTM call). Net credit must exceed the width of the call spread.',
      'Key Property: No risk to the upside if credit > call spread width. Downside risk = put strike − credit received (same as a naked put).',
      'Best Use: When neutral to slightly bullish but want extra premium. IVR must be ≥ 50.',
    ],
  },
];

function SwingStrategiesAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-slate-800">
      {SWING_STRATEGIES.map((s, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-800/40 transition-colors text-left"
          >
            {openIndex === i
              ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
              : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
            <span className="text-sm text-slate-200 font-medium">{s.title}</span>
            <span className="ml-auto text-xs text-slate-500 border border-slate-700 rounded-full px-2 py-0.5 whitespace-nowrap shrink-0">
              {s.tag}
            </span>
          </button>
          {openIndex === i && (
            <div className="px-5 pb-4 pt-2 bg-slate-900/30 space-y-2">
              {s.body.map((line, j) => (
                <p key={j} className="text-xs text-slate-400 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
