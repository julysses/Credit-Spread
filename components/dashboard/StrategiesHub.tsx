'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DirectionalBiasBar } from './DirectionalBiasBar';
import { StrategyCompare } from './StrategyCompare';
import { IntradayPanel } from './IntradayPanel';
import { ZeroDTELibrary } from './ZeroDTELibrary';
import { ZeroDTEPerformance } from './ZeroDTEPerformance';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

/* eslint-disable @typescript-eslint/no-explicit-any */

type StrategiesSubTab = '0dte-library' | '0dte-performance' | 'live-analysis';

interface StrategiesHubProps {
  spxPrice?: number;
  vix?: number;
}

export function StrategiesHub({ spxPrice, vix }: StrategiesHubProps) {
  const [subTab, setSubTab] = useState<StrategiesSubTab>('0dte-library');
  const [swingOpen, setSwingOpen] = useState(false);
  const [strategiesData, setStrategiesData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/strategies').then(r => r.json());
      if (res?.success) setStrategiesData(res.data);
    } catch {
      // Silently ignore — IntradayPanel self-fetches
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'live-analysis') fetchStrategies();
  }, [subTab, fetchStrategies]);

  const SUB_TABS: { id: StrategiesSubTab; label: string }[] = [
    { id: '0dte-library',     label: '📚 0DTE Library' },
    { id: '0dte-performance', label: '📊 0DTE Performance' },
    { id: 'live-analysis',    label: '⚡ Live Analysis' },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="border-b border-slate-800">
        <div className="flex gap-1">
          {SUB_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                subTab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === '0dte-library' && <ZeroDTELibrary />}

      {subTab === '0dte-performance' && <ZeroDTEPerformance />}

      {subTab === 'live-analysis' && (
        <div className="space-y-6">
          <DirectionalBiasBar />
          <div>
            <SectionHeader
              icon="⚡"
              title="0DTE Intraday Analysis"
              subtitle="Today's setups — scored by viability and expected value"
              tag="0DTE · Expires Today"
              tagColor="yellow"
            />
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <IntradayPanel spxPrice={spxPrice} vix={vix} />
              <ZeroDTERules />
            </div>
          </div>

          {strategiesData && (
            <div>
              <SectionHeader
                icon="📊"
                title="Swing Strategies (Live)"
                subtitle="Multi-day setups (7–30 DTE) — sorted by availability"
                tag="7–30 DTE"
                tagColor="blue"
              />
              <div className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
                    <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading strategies…
                  </div>
                ) : (
                  <StrategyCompare
                    strategies={strategiesData.strategies ?? []}
                    marketContext={strategiesData.marketContext}
                    recommended={strategiesData.recommended}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Collapsible Swing & Income Strategies ─────────────────────────── */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setSwingOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-left"
        >
          {swingOpen ? (
            <ChevronDown size={16} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          )}
          <span className="text-sm font-semibold text-slate-200">
            Swing &amp; Multi-Day Income Strategies
          </span>
          <span className="text-xs text-slate-500 border border-slate-700 rounded-full px-2 py-0.5">
            Wheel · PMCC · IC 45DTE · Jade Lizard
          </span>
        </button>

        {swingOpen && <SwingStrategiesAccordion />}
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: string;
  title: string;
  subtitle: string;
  tag: string;
  tagColor: 'yellow' | 'blue' | 'green';
}

const TAG_COLORS: Record<SectionHeaderProps['tagColor'], string> = {
  yellow: 'bg-yellow-500/10 border-yellow-600/30 text-yellow-400',
  blue:   'bg-blue-500/10 border-blue-600/30 text-blue-400',
  green:  'bg-emerald-500/10 border-emerald-600/30 text-emerald-400',
};

function SectionHeader({ icon, title, subtitle, tag, tagColor }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${TAG_COLORS[tagColor]}`}>
            {tag}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex-1 h-px bg-slate-800/60 ml-2 hidden sm:block" />
    </div>
  );
}

// ─── 0DTE Rules card ──────────────────────────────────────────────────────────

function ZeroDTERules() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>0DTE Rules of Engagement</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { num: 1, rule: 'Wait for opening range (first 30 min) before entering', color: 'text-blue-400' },
              { num: 2, rule: 'Sell strikes OUTSIDE the intraday expected move', color: 'text-green-400' },
              { num: 3, rule: 'High IV → wider spreads (25 pts). Low IV → tighter (10 pts)', color: 'text-yellow-400' },
              { num: 4, rule: 'Take profit at 25–50% of credit received', color: 'text-green-400' },
              { num: 5, rule: 'Stop loss at 1.5× credit — no exceptions', color: 'text-red-400' },
              { num: 6, rule: 'Close ALL positions before 3:45 PM ET', color: 'text-orange-400' },
              { num: 7, rule: 'Gamma emergency: exit if price approaches short strike', color: 'text-red-400' },
              { num: 8, rule: 'Max 3 trades per day — quality over quantity', color: 'text-slate-400' },
              { num: 9, rule: 'Do NOT trade 0DTE on FOMC, CPI, or NFP release days', color: 'text-red-400' },
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

type SwingStrategy = { title: string; tag: string; content: React.ReactNode };

const SWING_STRATEGIES: SwingStrategy[] = [
  {
    title: "The Wheel (Cash-Secured Puts + Covered Calls)",
    tag: 'Neutral-Bullish · 30–45 DTE',
    content: (
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
        <p><span className="text-slate-200 font-medium">Phase 1 — Cash-Secured Put:</span> Sell OTM put at strike where you would be happy owning the stock/ETF. Target: 30–45 DTE, 0.25–0.30 delta. Close at 50% profit OR roll if stock approaches strike.</p>
        <p><span className="text-slate-200 font-medium">Phase 2 — Covered Call (if assigned):</span> Sell OTM call against 100 shares at strike above your cost basis. Target: 30 DTE, 0.20–0.30 delta. Repeat until called away above cost basis.</p>
        <p><span className="text-slate-300">Best Underlying:</span> SPY, QQQ, or high-liquidity large-cap stocks. <span className="text-slate-300">IVR Filter:</span> IVR ≥ 50. <span className="text-yellow-500">Risk:</span> Assignment risk — only Wheel stocks you would hold long-term.</p>
      </div>
    ),
  },
  {
    title: 'Vertical Credit Spreads (30–45 DTE)',
    tag: 'Directional · 30–45 DTE',
    content: (
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
        <p><span className="text-slate-200 font-medium">Bull Put Spread (Bullish):</span> Sell put at 0.30 delta, buy put 5–10 points lower. Credit received = max profit; spread width − credit = max loss. Close at 50% profit or 21 DTE.</p>
        <p><span className="text-slate-200 font-medium">Bear Call Spread (Bearish):</span> Sell call at 0.30 delta, buy call 5–10 points higher. Same management rules.</p>
        <p><span className="text-slate-300">Signal Stack Integration:</span> Only enter directional spreads when Crown Signal Stack score aligns with direction (score ≤2 for bullish, ≥5 for bearish).</p>
      </div>
    ),
  },
  {
    title: 'Iron Condor (30–45 DTE, tastytrade Method)',
    tag: 'Neutral · 30–45 DTE · SPX 1256',
    content: (
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
        <p>Sell put spread + sell call spread simultaneously. Target: 0.16 delta on short strikes (1 standard deviation). Width: 5–10 points each side. Entry: IVR ≥ 50.</p>
        <p>Close at 50% profit or 21 DTE (whichever first). Roll untested side toward current price if one side breached. <span className="text-green-400">Best on SPX for 1256 tax treatment.</span></p>
      </div>
    ),
  },
  {
    title: "PMCC — Poor Man's Covered Call (LEAPS)",
    tag: 'Moderately Bullish · LEAPS 12–24 mo',
    content: (
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
        <p><span className="text-slate-200 font-medium">Setup:</span> Buy deep ITM LEAPS call (0.70–0.80 delta) 12–24 months out. Sell OTM short-term call (0.25–0.30 delta) 30–45 DTE against it. Net debit must be less than the spread width.</p>
        <p><span className="text-slate-200 font-medium">Management:</span> Roll short call monthly as it decays. Close if short call is breached. Target: collect enough short call premium to offset LEAPS cost over time.</p>
        <p><span className="text-slate-300">Crown Score Filter:</span> Only enter PMCC when Crown score is 0–2 (bullish macro).</p>
      </div>
    ),
  },
  {
    title: 'Jade Lizard',
    tag: 'Neutral-Bullish · 30–45 DTE · IVR ≥ 50',
    content: (
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
        <p><span className="text-slate-200 font-medium">Setup:</span> Sell OTM put (0.30 delta) + sell OTM call spread (sell 0.20 delta call, buy further OTM call). Net credit received must exceed the width of the call spread.</p>
        <p><span className="text-green-400 font-medium">Key Property:</span> No risk to the upside if credit &gt; call spread width. Downside risk = put strike − credit received (same as a naked put).</p>
        <p><span className="text-slate-300">Best Use:</span> When neutral to slightly bullish but want extra premium by selling a call spread. IVR must be ≥ 50.</p>
      </div>
    ),
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
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800/40 transition-colors text-left"
          >
            {openIndex === i ? (
              <ChevronDown size={14} className="text-slate-500 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-500 shrink-0" />
            )}
            <span className="text-sm text-slate-200">{s.title}</span>
            <span className="ml-auto text-xs text-slate-500 border border-slate-700 rounded-full px-2 py-0.5 whitespace-nowrap">
              {s.tag}
            </span>
          </button>
          {openIndex === i && (
            <div className="px-5 pb-4 pt-2 bg-slate-900/30">
              {s.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
