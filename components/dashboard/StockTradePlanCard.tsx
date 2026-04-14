'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { ScanCandidate } from '@/app/api/stocks/scan/route';

interface StockTradePlanCardProps {
  candidate: ScanCandidate;
  onClose?: () => void;
}

const TIER_STYLES: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  B: 'bg-blue-500/20 text-blue-300 border-blue-600/40',
  C: 'bg-yellow-500/20 text-yellow-300 border-yellow-600/40',
  PASS: 'bg-gray-800 text-gray-500 border-gray-700',
};

function Stat({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

export function StockTradePlanCard({ candidate, onClose }: StockTradePlanCardProps) {
  const [showAllScores, setShowAllScores] = useState(false);
  const { features: f, bestStrategy, tradePlan, type } = candidate;
  const isLong = tradePlan.direction === 'long';

  return (
    <Card className="sticky top-32">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-white">{candidate.symbol}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
              type === 'etf' ? 'bg-purple-500/10 text-purple-400 border-purple-600/30' : 'bg-blue-500/10 text-blue-400 border-blue-600/30'
            }`}>{type.toUpperCase()}</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-bold ${TIER_STYLES[bestStrategy.tier] ?? TIER_STYLES.PASS}`}>
              Grade {bestStrategy.tier}
            </span>
            <span className={`flex items-center gap-1 text-xs font-semibold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
              {isLong ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isLong ? 'LONG' : 'SHORT'}
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors shrink-0">
              <X size={16} />
            </button>
          )}
        </div>
        <CardTitle className="text-xs font-medium text-gray-400 mt-0.5">{bestStrategy.strategyName}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Feature Snapshot ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="VWAP" value={`$${f.vwap.toFixed(2)}`} color={f.currentPrice > f.vwap ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="RVOL" value={`${f.rvol.toFixed(1)}×`} color={f.rvol >= 1.5 ? 'text-emerald-400' : f.rvol >= 1.0 ? 'text-yellow-400' : 'text-gray-400'} />
          <Stat label="RS/SPY" value={f.rs.toFixed(2)} color={f.rs >= 1.2 ? 'text-emerald-400' : f.rs <= 0.8 ? 'text-red-400' : 'text-gray-300'} />
          <Stat label="EMA 9" value={`$${f.ema9.toFixed(2)}`} />
          <Stat label="EMA 20" value={`$${f.ema20.toFixed(2)}`} />
          <Stat label="ATR" value={`$${f.atr.toFixed(2)} (${f.atrPct.toFixed(2)}%)`} />
        </div>

        {/* OR status pill */}
        <div className="flex gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded border font-medium ${
            f.priceVsOrb === 'above' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30' :
            f.priceVsOrb === 'below' ? 'bg-red-500/10 text-red-400 border-red-600/30' :
            'bg-yellow-500/10 text-yellow-400 border-yellow-600/30'
          }`}>
            Price {f.priceVsOrb === 'above' ? '▲ above OR' : f.priceVsOrb === 'below' ? '▼ below OR' : '↔ inside OR'} ({f.openHigh.toFixed(2)} / {f.openLow.toFixed(2)})
          </span>
        </div>

        {/* ── Trade Plan ──────────────────────────────────────────────────── */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trade Plan</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Entry" value={`$${tradePlan.entry.toFixed(2)}`} color="text-blue-300" />
            <Stat label="Stop Loss" value={`$${tradePlan.stopLoss.toFixed(2)}`} color="text-red-400" />
            <Stat label="Target 1" value={`$${tradePlan.target1.toFixed(2)}`} color="text-emerald-400" />
            <Stat label="Target 2" value={`$${tradePlan.target2.toFixed(2)}`} color="text-emerald-300" />
            <Stat label="Risk/Unit" value={`$${tradePlan.riskPerUnit.toFixed(2)}`} />
            <Stat label="R:R Ratio" value={`${tradePlan.riskRewardRatio}:1`} color={tradePlan.riskRewardRatio >= 2 ? 'text-emerald-400' : 'text-yellow-400'} />
          </div>
        </div>

        {/* ── Explanation ─────────────────────────────────────────────────── */}
        <div className="rounded-lg bg-gray-800/40 p-3">
          <p className="text-xs text-gray-400 leading-relaxed">{tradePlan.explanation}</p>
        </div>

        {/* ── Invalidation ────────────────────────────────────────────────── */}
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">Invalidation</p>
          <p className="text-xs text-red-300/80 leading-relaxed">{tradePlan.invalidation}</p>
        </div>

        {/* ── Entry Conditions ────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Entry Conditions</p>
          <ul className="space-y-0.5">
            {tradePlan.entryConditions.map((c, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                <span className="text-blue-500 mt-0.5">·</span>{c}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Exit Rules ──────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Exit Rules</p>
          <ul className="space-y-0.5">
            {tradePlan.exitRules.map((r, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                <span className="text-yellow-500 mt-0.5">·</span>{r}
              </li>
            ))}
          </ul>
        </div>

        {/* ── All Strategy Scores (accordion) ─────────────────────────────── */}
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
                  <span className={s.meetsMinimum ? 'text-gray-300' : 'text-gray-600'}>{s.strategyName}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.meetsMinimum ? 'bg-blue-500' : 'bg-gray-700'}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <span className={`font-mono w-6 text-right ${s.meetsMinimum ? 'text-white' : 'text-gray-600'}`}>{s.score}</span>
                    <span className={`w-8 text-center text-[10px] font-bold px-1 py-0.5 rounded border ${
                      TIER_STYLES[s.tier] ?? TIER_STYLES.PASS
                    }`}>{s.tier}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
