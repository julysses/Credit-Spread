'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, CheckCircle, Circle, AlertTriangle, X } from 'lucide-react';
import type { SwingCandidate } from '@/app/api/stocks/swing/route';

interface SwingCandidateCardProps {
  candidate: SwingCandidate;
  onClose?: () => void;
}

const TIER_STYLES: Record<string, string> = {
  A:    'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  B:    'bg-blue-500/20 text-blue-300 border-blue-600/40',
  C:    'bg-yellow-500/20 text-yellow-300 border-yellow-600/40',
  PASS: 'bg-gray-800 text-gray-500 border-gray-700',
};

const STRATEGY_COLORS: Record<string, string> = {
  TREND_TEMPLATE:    'border-l-emerald-500',
  VCP_BREAKOUT:      'border-l-blue-500',
  PULLBACK_20SMA:    'border-l-cyan-500',
  MOMENTUM_BREAKOUT: 'border-l-purple-500',
  RSI2_OVERSOLD:     'border-l-yellow-500',
  RS_LEADER:         'border-l-orange-500',
};

function Stat({ label, value, color = 'text-white', sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export function SwingCandidateCard({ candidate, onClose }: SwingCandidateCardProps) {
  const [showAllScores, setShowAllScores] = useState(false);
  const { features: f, bestStrategy: b, tradePlan: tp } = candidate;
  const accentColor = STRATEGY_COLORS[b.strategyId] ?? 'border-l-gray-600';

  return (
    <div className={`border border-gray-700 border-l-2 ${accentColor} rounded-xl bg-gray-900/60 overflow-hidden`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-white">{candidate.symbol}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
            candidate.type === 'etf'
              ? 'bg-purple-500/10 text-purple-400 border-purple-600/30'
              : 'bg-blue-500/10 text-blue-400 border-blue-600/30'
          }`}>{candidate.type.toUpperCase()}</span>
          <span className={`text-xs px-2 py-0.5 rounded border font-bold ${TIER_STYLES[b.tier] ?? TIER_STYLES.PASS}`}>
            Grade {b.tier}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            <TrendingUp size={12} /> {b.direction.toUpperCase()}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Strategy name + description */}
        <div>
          <p className="text-sm font-semibold text-white">{b.strategyName}</p>
          <p className="text-xs text-gray-400 mt-0.5">{b.setupDescription}</p>
        </div>

        {/* Daily feature snapshot */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Last Close" value={`$${f.lastClose.toFixed(2)}`}
            color={f.dayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}
            sub={`${f.dayChangePct >= 0 ? '+' : ''}${f.dayChangePct.toFixed(2)}%`} />
          <Stat label="RS (63d)" value={f.rs63.toFixed(2)}
            color={f.rs63 >= 1.3 ? 'text-emerald-400' : f.rs63 >= 1.0 ? 'text-gray-300' : 'text-red-400'} />
          <Stat label="ATR (14d)" value={`$${f.atr14.toFixed(2)}`}
            sub={`${f.atrPct.toFixed(1)}%`} />
          <Stat label="vs 20 SMA" value={`${f.priceVsSma20Pct >= 0 ? '+' : ''}${f.priceVsSma20Pct.toFixed(1)}%`}
            color={f.priceVsSma20Pct > 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="vs 50 SMA" value={`${f.priceVsSma50Pct >= 0 ? '+' : ''}${f.priceVsSma50Pct.toFixed(1)}%`}
            color={f.priceVsSma50Pct > 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="from 52wk Hi" value={`-${f.distFrom52wHighPct.toFixed(1)}%`}
            color={f.distFrom52wHighPct <= 5 ? 'text-emerald-400' : f.distFrom52wHighPct <= 15 ? 'text-yellow-400' : 'text-gray-400'} />
        </div>

        {/* SMA alignment pills */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {[
            { label: `20 SMA ${f.sma20.toFixed(1)}`, ok: f.lastClose > f.sma20 },
            { label: `50 SMA ${f.sma50.toFixed(1)}`, ok: f.lastClose > f.sma50 },
            { label: `200 SMA ${f.sma200.toFixed(1)}`, ok: f.lastClose > f.sma200 },
            { label: `200 SMA ↑`, ok: f.sma200Slope > 0 },
            { label: `ATR⬇`, ok: f.atrContracting },
            { label: `Vol⬇`, ok: f.volDryup },
          ].map(({ label, ok }) => (
            <span key={label} className={`px-1.5 py-0.5 rounded border font-medium ${
              ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/25'
                 : 'bg-gray-800/60 text-gray-600 border-gray-700'
            }`}>
              {label}
            </span>
          ))}
        </div>

        {/* Trade Plan */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trade Plan</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Entry" value={`$${tp.entry.toFixed(2)}`} color="text-blue-300" />
            <Stat label="Stop Loss" value={`$${tp.stopLoss.toFixed(2)}`} color="text-red-400" />
            <Stat label="Target 1" value={`$${tp.target1.toFixed(2)}`} color="text-emerald-400" />
            <Stat label="Target 2" value={`$${tp.target2.toFixed(2)}`} color="text-emerald-300" />
            <Stat label="Risk / Share" value={`$${tp.riskPerShare.toFixed(2)}`} />
            <Stat label="Hold" value={tp.holdDays} />
          </div>
        </div>

        {/* Entry note */}
        <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <p className="text-xs text-blue-200 leading-relaxed">{tp.entryNote}</p>
        </div>

        {/* Trigger conditions checklist */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Verify Before Entry
          </p>
          <ul className="space-y-1">
            {b.triggerConditions.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <Circle size={12} className="text-gray-600 shrink-0 mt-0.5" />
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Invalidation */}
        <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">Invalidation</p>
          <p className="text-xs text-red-300/80">{tp.invalidation}</p>
        </div>

        {/* Risk note */}
        {b.riskNote && (
          <p className="text-xs text-gray-500 italic">{b.riskNote}</p>
        )}

        {/* Warnings */}
        {b.warnings.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <ul className="space-y-0.5">
              {b.warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-300">{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* All scores accordion */}
        <div className="border-t border-gray-800 pt-2">
          <button
            onClick={() => setShowAllScores(o => !o)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showAllScores ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            All Strategy Scores ({candidate.allScores.length})
          </button>
          {showAllScores && (
            <div className="mt-2 space-y-1">
              {candidate.allScores.map(s => (
                <div key={s.strategyId} className="flex items-center justify-between text-xs">
                  <span className={s.meetsMinimum ? 'text-gray-300' : 'text-gray-600'}>
                    {s.strategyName}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.meetsMinimum ? 'bg-blue-500' : 'bg-gray-700'}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <span className={`font-mono w-6 text-right ${s.meetsMinimum ? 'text-white' : 'text-gray-600'}`}>
                      {s.score}
                    </span>
                    <span className={`w-8 text-center text-[10px] font-bold px-1 py-0.5 rounded border ${
                      TIER_STYLES[s.tier] ?? TIER_STYLES.PASS
                    }`}>{s.tier}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
