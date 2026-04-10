'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { InstitutionalSignals } from '@/server/institutional-signals';

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<number, { label: string; color: string; bg: string; border: string; dot: string }> = {
  1: { label: 'TIER 1 — MAX SHORT VOL', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  2: { label: 'TIER 2 — MILD BULLISH', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  3: { label: 'TIER 3 — NEUTRAL / WAIT', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-400' },
  4: { label: 'TIER 4 — DEFENSIVE', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-400' },
  5: { label: 'TIER 5 — RISK-OFF / HEDGE', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-400' },
};

const TIER_STRUCTURES: Record<number, string> = {
  1: 'Iron Condor · Strangle Sell · ATM Credit Spread',
  2: 'Bull Put Spread · PMCC · Jade Lizard',
  3: 'Calendar Spreads only · Reduce size',
  4: 'Debit Put Spreads · Long Puts · Reduce delta',
  5: 'LEAPS Puts · VIX Calls · Cash — preserve capital',
};

// ─── Checkpoint config ────────────────────────────────────────────────────────

const CHECKPOINTS = [
  { id: 1, name: 'Close Review', window: '4:00–4:30 PM', startH: 16, startM: 0, endH: 16, endM: 30 },
  { id: 2, name: 'Dark Pool & Flow Scan', window: '4:30–6:00 PM', startH: 16, startM: 30, endH: 18, endM: 0 },
  { id: 3, name: 'GEX & Vol Structure Pull', window: '6:00–7:00 PM', startH: 18, startM: 0, endH: 19, endM: 0 },
  { id: 4, name: 'Catalyst & Calendar Check', window: '7:00–8:00 PM', startH: 19, startM: 0, endH: 20, endM: 0 },
  { id: 5, name: 'Trade Plan Build', window: '8:00–9:00 PM', startH: 20, startM: 0, endH: 21, endM: 0 },
  { id: 6, name: 'Pre-Market Final Check', window: '4:00–8:00 AM', startH: 4, startM: 0, endH: 8, endM: 0 },
  { id: 7, name: 'Final Position Sizing', window: '8:00–9:25 AM', startH: 8, startM: 0, endH: 9, endM: 25 },
];

function getETHourMinute(): { h: number; m: number } {
  const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  return { h: et.getHours(), m: et.getMinutes() };
}

function isCheckpointActive(cp: typeof CHECKPOINTS[0]): boolean {
  const { h, m } = getETHourMinute();
  const now = h * 60 + m;
  const start = cp.startH * 60 + cp.startM;
  const end = cp.endH * 60 + cp.endM;
  return now >= start && now < end;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 2, prefix = '', suffix = ''): string {
  if (v == null) return 'N/A';
  return `${prefix}${v.toFixed(decimals)}${suffix}`;
}

function signalBadge(bullish: boolean | null) {
  if (bullish === null) return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">NEUTRAL</span>;
  return bullish
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium">BULLISH</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 font-medium">BEARISH</span>;
}

function Row({ label, value, bullish }: { label: string; value: string; bullish?: boolean | null }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-800/40 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-gray-200">{value}</span>
        {bullish !== undefined && signalBadge(bullish ?? null)}
      </div>
    </div>
  );
}

function EdgeBadge({ num, primary }: { num: string; primary: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono font-bold text-blue-300">EDGE {num}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        primary ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300' : 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
      }`}>
        {primary ? 'PRIMARY' : 'SECONDARY'}
      </span>
    </div>
  );
}

// ─── Signal Cards ─────────────────────────────────────────────────────────────

function GEXCard({ s }: { s: InstitutionalSignals }) {
  const isPositive = (s.gexNet ?? 0) >= 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>GEX / Dealer Gamma</CardTitle>
          <EdgeBadge num="01" primary />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.gexNet != null ? `$${(s.gexNet / 1e6).toFixed(1)}B` : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Net GEX ({isPositive ? 'Positive — pinning' : 'Negative — trending'})</div>
          </div>
          {signalBadge(isPositive)}
        </div>
        <Row label="Gamma Flip Level" value={fmt(s.gammaFlipLevel, 0)} bullish={s.spxClose != null && s.gammaFlipLevel != null ? s.spxClose > s.gammaFlipLevel : null} />
        <Row label="Call Wall" value={fmt(s.callWall, 0)} />
        <Row label="Put Wall" value={fmt(s.putWall, 0)} />
        <Row label="Regime" value={s.gexRegime?.toUpperCase() ?? 'N/A'} bullish={isPositive} />
      </CardContent>
    </Card>
  );
}

function VIXTermCard({ s }: { s: InstitutionalSignals }) {
  const isBullish = s.vixTermStructure === 'steep_contango' || s.vixTermStructure === 'mild_contango';
  const isBearish = s.vixTermStructure === 'backwardation';
  const vvixOk = (s.vvixClose ?? 100) < 100;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>VIX Term Structure</CardTitle>
          <EdgeBadge num="02" primary />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${isBullish ? 'text-emerald-400' : isBearish ? 'text-red-400' : 'text-yellow-400'}`}>
              {s.vixTermStructure?.replace(/_/g, ' ').toUpperCase() ?? 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">VIX Curve Shape</div>
          </div>
          {signalBadge(isBullish ? true : isBearish ? false : null)}
        </div>
        <Row label="VIX Spot" value={fmt(s.vixSpot)} bullish={(s.vixSpot ?? 20) < 20} />
        <Row label="VVIX" value={fmt(s.vvixClose)} bullish={vvixOk} />
        <Row label="VIX9D" value={fmt(s.vix9d)} />
        <Row label="VIX3M" value={fmt(s.vix3m)} />
        <Row label="VIX9D–VIX3M Spread" value={fmt(s.vix9dVsVix30Spread, 2, '', '')} bullish={(s.vix9dVsVix30Spread ?? 0) < 0} />
      </CardContent>
    </Card>
  );
}

function OvernightCard({ s }: { s: InstitutionalSignals }) {
  const isTrending = s.overnightType === 'trending_up';
  const isBearish = s.overnightType === 'trending_down';
  const gapBullish = (s.gapPct ?? 0) > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Overnight Futures</CardTitle>
          <EdgeBadge num="03" primary />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${isTrending ? 'text-emerald-400' : isBearish ? 'text-red-400' : 'text-yellow-400'}`}>
              {s.overnightType?.replace(/_/g, ' ').toUpperCase() ?? 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">ES Overnight Session</div>
          </div>
          {signalBadge(isTrending ? true : isBearish ? false : null)}
        </div>
        <Row label="ES High" value={fmt(s.esOvernightHigh, 2)} />
        <Row label="ES Low" value={fmt(s.esOvernightLow, 2)} />
        <Row label="ES Current" value={fmt(s.esCurrentPrice, 2)} />
        <Row label="NQ High" value={fmt(s.nqOvernightHigh, 2)} />
        <Row label="NQ Low" value={fmt(s.nqOvernightLow, 2)} />
        <Row
          label="Gap vs Prior Close"
          value={s.gapVsPriorClose != null ? `${s.gapVsPriorClose > 0 ? '+' : ''}${s.gapVsPriorClose.toFixed(2)} (${s.gapPct != null ? `${s.gapPct > 0 ? '+' : ''}${s.gapPct.toFixed(2)}%` : 'N/A'})` : 'N/A'}
          bullish={s.gapPct != null ? gapBullish : null}
        />
      </CardContent>
    </Card>
  );
}

function DarkPoolCard({
  s,
  onOverride,
}: {
  s: InstitutionalSignals;
  onOverride: (bias: InstitutionalSignals['darkPoolBias'], callPct: number) => void;
}) {
  const [manual, setManual] = useState(true);
  const [callPct, setCallPct] = useState(s.darkPoolCallPct);
  const [bias, setBias] = useState<InstitutionalSignals['darkPoolBias']>(s.darkPoolBias);

  const isBullish = bias === 'bullish' || callPct > 60;
  const isBearish = bias === 'bearish' || callPct < 40;

  useEffect(() => {
    if (manual) onOverride(bias, callPct);
  }, [bias, callPct, manual, onOverride]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Dark Pool & Options Flow</CardTitle>
          <EdgeBadge num="04" primary />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${isBullish ? 'text-emerald-400' : isBearish ? 'text-red-400' : 'text-yellow-400'}`}>
              {bias.toUpperCase()}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Flow Bias</div>
          </div>
          {signalBadge(isBullish ? true : isBearish ? false : null)}
        </div>

        {/* Manual input toggle */}
        <div className="mb-3 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium">Input Mode</span>
            <button
              onClick={() => setManual(m => !m)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${manual ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-700 text-gray-400'}`}
            >
              {manual ? 'Manual' : 'Auto (API required)'}
            </button>
          </div>

          {manual ? (
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-gray-500">Call Sweep %</span>
                  <span className="text-xs font-mono text-blue-300">{callPct}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={callPct}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setCallPct(v);
                    setBias(v > 60 ? 'bullish' : v < 40 ? 'bearish' : 'neutral');
                  }}
                  className="w-full h-1.5 rounded-full bg-gray-700 accent-blue-500 cursor-pointer"
                />
              </div>
              <div className="flex gap-1.5">
                {(['bullish', 'neutral', 'bearish'] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setBias(b)}
                    className={`flex-1 text-xs py-1 rounded capitalize transition-colors ${
                      bias === b
                        ? b === 'bullish' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                          : b === 'bearish' ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                          : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-400'
                        : 'bg-gray-700/50 text-gray-500'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              Connect Unusual Whales API key in .env for auto-fetch (UNUSUAL_WHALES_API_KEY)
            </p>
          )}
        </div>

        <Row label="Call Sweep %" value={`${callPct}%`} bullish={callPct > 60} />
        <Row label="Put Sweep %" value={`${100 - callPct}%`} bullish={100 - callPct < 40} />
        <Row label="Threshold" value="$500K+ premium sweeps" />
      </CardContent>
    </Card>
  );
}

function CatalystCard({ s }: { s: InstitutionalSignals }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Economic Calendar & Catalysts</CardTitle>
          <EdgeBadge num="05" primary />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${s.catalystRisk ? 'text-red-400' : 'text-emerald-400'}`}>
              {s.catalystRisk ? 'CATALYST RISK' : 'CLEAR'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Next Session Risk Flag</div>
          </div>
          {signalBadge(s.catalystRisk ? false : true)}
        </div>
        {s.catalystDetail && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-300">{s.catalystDetail}</p>
          </div>
        )}
        {s.nextSessionEvents.length > 0 ? (
          <div className="space-y-1">
            {s.nextSessionEvents.map((ev, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800/40 last:border-0">
                <div>
                  <span className="text-xs text-gray-300 font-medium">{ev.type}</span>
                  <span className="text-xs text-gray-500 ml-1.5">{ev.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-gray-400">{ev.time}</span>
                  <span className={`text-xs px-1 py-0.5 rounded ${
                    ev.importance === 'high' ? 'bg-red-500/20 text-red-400' :
                    ev.importance === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>{ev.importance}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">No high-impact events found for next session</p>
        )}
        {s.catalystRisk && (
          <div className="mt-3 p-2 rounded bg-orange-500/10 border border-orange-500/20">
            <p className="text-xs text-orange-300 font-medium">Override active: 50% max position size · Min 21 DTE</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreadthCard({ s }: { s: InstitutionalSignals }) {
  const adBull = (s.adRatio ?? 1) > 1.5;
  const adBear = (s.adRatio ?? 1) < 0.8;
  const breadthBull = (s.pctAbove200sma ?? 50) > 60;
  const breadthBear = (s.pctAbove200sma ?? 50) < 40;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Market Breadth & Internals</CardTitle>
          <EdgeBadge num="06" primary={false} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${breadthBull ? 'text-emerald-400' : breadthBear ? 'text-red-400' : 'text-yellow-400'}`}>
              {s.pctAbove200sma != null ? `${s.pctAbove200sma.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">% SPX Above 200-SMA</div>
          </div>
          {signalBadge(breadthBull ? true : breadthBear ? false : null)}
        </div>
        <Row label="NYSE A/D Ratio" value={fmt(s.adRatio)} bullish={adBull ? true : adBear ? false : null} />
        <Row label="% Above 200-SMA" value={fmt(s.pctAbove200sma, 1, '', '%')} bullish={breadthBull ? true : breadthBear ? false : null} />
        <Row label="Breadth Regime" value={breadthBull ? 'BROAD PARTICIPATION' : breadthBear ? 'DETERIORATING' : 'MIXED'} bullish={breadthBull ? true : breadthBear ? false : null} />
      </CardContent>
    </Card>
  );
}

function MacroRegimeCard({ s }: { s: InstitutionalSignals }) {
  const spxAbove = (s.spxVs200smaPct ?? 0) > 0;
  const hyTight = (s.hySpread2wkChange ?? 0) < 0;
  const dxyOk = (s.dxyLevel ?? 99) <= 100;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>SPX vs 200-SMA & Macro Regime</CardTitle>
          <EdgeBadge num="07" primary={false} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-2xl font-bold font-mono ${spxAbove ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.spxVs200smaPct != null
                ? `${spxAbove ? '+' : ''}${s.spxVs200smaPct.toFixed(2)}%`
                : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">SPX vs 200-Day SMA</div>
          </div>
          {signalBadge(spxAbove)}
        </div>
        <Row label="SPX Close" value={fmt(s.spxClose, 2)} />
        <Row label="200-Day SMA" value={fmt(s.spx200sma, 2)} />
        <Row label="HY Spread" value={s.hySpreadBps != null ? `${s.hySpreadBps} bps` : 'N/A'} bullish={hyTight} />
        <Row label="HY 2-Week Change" value={s.hySpread2wkChange != null ? `${s.hySpread2wkChange > 0 ? '+' : ''}${s.hySpread2wkChange} bps` : 'N/A'} bullish={hyTight} />
        <Row label="DXY" value={fmt(s.dxyLevel)} bullish={dxyOk} />
      </CardContent>
    </Card>
  );
}

// ─── Tier Banner ──────────────────────────────────────────────────────────────

function TierBanner({ signals }: { signals: InstitutionalSignals }) {
  const tier = signals.tierScore;
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG[3];
  return (
    <div className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-3 h-3 rounded-full ${cfg.dot} animate-pulse`} />
            <span className={`text-lg font-bold tracking-wide ${cfg.color}`}>{cfg.label}</span>
          </div>
          <p className="text-sm text-gray-300">{signals.tierRationale}</p>
          <p className="text-xs text-gray-500 mt-1 font-mono">{TIER_STRUCTURES[tier]}</p>
        </div>
        <div className="flex-shrink-0">
          <div className={`text-5xl font-black font-mono ${cfg.color}`}>{tier}</div>
          <div className="text-xs text-gray-500 text-right">/ 5</div>
        </div>
      </div>
      {signals.tierRules.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Active Override Rules</p>
          <div className="space-y-0.5">
            {signals.tierRules.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-orange-400 text-xs mt-0.5">⚠</span>
                <span className="text-xs text-orange-300">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Checkpoint Tracker ───────────────────────────────────────────────────────

function CheckpointTracker({ completed, onToggle }: { completed: Set<number>; onToggle: (id: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>7-Checkpoint Night-Before Workflow</CardTitle>
          <span className="text-xs text-gray-500">
            {completed.size}/7 complete
          </span>
        </div>
      </CardHeader>
      <CardContent className="!py-3">
        <div className="space-y-1.5">
          {CHECKPOINTS.map(cp => {
            const active = isCheckpointActive(cp);
            const done = completed.has(cp.id);
            return (
              <div
                key={cp.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer
                  ${active ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-gray-800/30 border border-transparent'}
                  ${done ? 'opacity-60' : ''}
                `}
                onClick={() => onToggle(cp.id)}
              >
                <div className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center text-xs transition-colors ${
                  done ? 'bg-emerald-500 border-emerald-500 text-white' :
                  active ? 'border-blue-400 bg-blue-400/10' :
                  'border-gray-600 bg-transparent'
                }`}>
                  {done ? '✓' : cp.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-200 font-medium">{cp.name}</span>
                    {active && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">ACTIVE NOW</span>}
                  </div>
                  <span className="text-xs text-gray-500">{cp.window} ET</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Trade Plan Panel ─────────────────────────────────────────────────────────

const PLAN_SECTIONS = [
  'REGIME CLASSIFICATION',
  'RECOMMENDED STRATEGY',
  'STRIKE SELECTION',
  'POSITION SIZING',
  'ENTRY CONDITIONS',
  'EXIT RULES',
];

const SECTION_ICONS: Record<string, string> = {
  'REGIME CLASSIFICATION': '📊',
  'RECOMMENDED STRATEGY': '⚡',
  'STRIKE SELECTION': '🎯',
  'POSITION SIZING': '⚖️',
  'ENTRY CONDITIONS': '🟢',
  'EXIT RULES': '🔴',
};

function TradePlanPanel({
  signals,
  onSave,
}: {
  signals: InstitutionalSignals;
  onSave: (plan: { rawOutput: string; sections: Record<string, string>; appliedRules: string[] }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ rawOutput: string; sections: Record<string, string>; appliedRules: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    setSaved(false);
    try {
      const res = await fetch('/api/pre-market/trade-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signals),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Unknown error');
      setPlan({ rawOutput: data.rawOutput, sections: data.tradePlan, appliedRules: data.appliedRules ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [signals]);

  const save = useCallback(async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pre-market/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals, tradePlan: plan }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Save failed');
      setSaved(true);
      onSave(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [plan, signals, onSave]);

  const tier = signals.tierScore;
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG[3];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Claude Trade Plan Generator</CardTitle>
          <div className="flex items-center gap-2">
            {plan && (
              <button
                onClick={save}
                disabled={saving || saved}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
              >
                {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Plan'}
              </button>
            )}
            <button
              onClick={generate}
              disabled={loading}
              className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>Generate Trade Plan</>
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!plan && !loading && !error && (
          <div className={`rounded-lg border ${tierCfg.bg} ${tierCfg.border} p-4 text-center`}>
            <p className={`text-sm font-medium ${tierCfg.color} mb-1`}>{tierCfg.label}</p>
            <p className="text-xs text-gray-400">{signals.tierRationale}</p>
            <p className="text-xs text-gray-500 mt-2">Click "Generate Trade Plan" to get Claude's structured analysis</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Analyzing 7 institutional signals...</p>
            <p className="text-xs text-gray-600">Claude is generating your trade plan</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {plan && (
          <div className="space-y-3">
            {plan.appliedRules.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <p className="text-xs text-orange-400 font-semibold mb-1 uppercase tracking-wider">Applied Override Rules</p>
                {plan.appliedRules.map((r, i) => (
                  <p key={i} className="text-xs text-orange-300">⚠ {r}</p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PLAN_SECTIONS.map(section => {
                const content = plan.sections[section];
                if (!content) return null;
                return (
                  <div
                    key={section}
                    className={`p-3.5 rounded-lg border border-gray-800/60 bg-gray-800/30 ${
                      section === 'REGIME CLASSIFICATION' || section === 'RECOMMENDED STRATEGY' ? 'md:col-span-2' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{SECTION_ICONS[section]}</span>
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{section}</span>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PreMarketDashboard() {
  const [signals, setSignals] = useState<InstitutionalSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [checkpointsDone, setCheckpointsDone] = useState<Set<number>>(new Set());
  const [dpOverride, setDpOverride] = useState<{ bias: InstitutionalSignals['darkPoolBias']; callPct: number } | null>(null);

  const load = useCallback(async (dpBias?: string, dpCallPct?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dpBias) params.set('dpBias', dpBias);
      if (dpCallPct != null) params.set('dpCallPct', String(dpCallPct));
      const res = await fetch(`/api/pre-market/signals?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Failed to fetch signals');
      setSignals(data.data);
      setLastUpdated(new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' ET');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when dark pool override changes
  useEffect(() => {
    if (dpOverride) load(dpOverride.bias, dpOverride.callPct);
  }, [dpOverride, load]);

  const toggleCheckpoint = useCallback((id: number) => {
    setCheckpointsDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Pre-Market Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-gray-600">Updated {lastUpdated}</span>}
          <button
            onClick={() => load(dpOverride?.bias, dpOverride?.callPct)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            {loading
              ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <span>⟳</span>}
            Refresh Signals
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {loading && !signals && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Fetching 7 institutional signals...</p>
            <p className="text-gray-600 text-xs mt-1">GEX · VIX curve · ES futures · Dark pool · Catalysts · Breadth · Macro</p>
          </div>
        </div>
      )}

      {signals && (
        <>
          {/* Tier Banner */}
          <TierBanner signals={signals} />

          {/* Checkpoint Tracker */}
          <CheckpointTracker completed={checkpointsDone} onToggle={toggleCheckpoint} />

          {/* Signal Grid — 7 cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GEXCard s={signals} />
            <VIXTermCard s={signals} />
            <OvernightCard s={signals} />
            <DarkPoolCard
              s={signals}
              onOverride={(bias, callPct) => setDpOverride({ bias, callPct })}
            />
            <CatalystCard s={signals} />
            <BreadthCard s={signals} />
            <div className="lg:col-span-2">
              <MacroRegimeCard s={signals} />
            </div>
          </div>

          {/* Trade Plan Panel */}
          <TradePlanPanel
            signals={signals}
            onSave={() => {}}
          />

          {/* Source status footer */}
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(signals.sources).map(([key, status]) => (
              <span
                key={key}
                className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                  status === 'ok' ? 'bg-emerald-500/10 text-emerald-500' :
                  status === 'manual' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-red-500/10 text-red-500'
                }`}
              >
                {key}: {status}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
