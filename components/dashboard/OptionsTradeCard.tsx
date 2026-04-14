'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Target, AlertTriangle,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import type { OptionsTradePlan, OptionsLeg } from '@/app/api/options/trade-plans/route';

interface OptionsTradeCardProps {
  plan: OptionsTradePlan;
}

const DIRECTION_CONFIG = {
  bullish: { icon: TrendingUp,  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-600/30' },
  bearish: { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-500/10 border-red-600/30'         },
  neutral: { icon: Minus,        color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-600/30'   },
};

const CATEGORY_CONFIG = {
  options_day_trade: { label: '0DTE / Day Trade', color: 'bg-yellow-500/10 border-yellow-600/30 text-yellow-400' },
  options_swing:     { label: 'Swing',            color: 'bg-blue-500/10 border-blue-600/30 text-blue-400'       },
};

function StatBox({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function LegRow({ leg }: { leg: OptionsLeg }) {
  const isSell = leg.action === 'sell';
  return (
    <tr className="border-t border-gray-800/60">
      <td className="py-1.5 pr-3 text-xs text-gray-300 font-mono whitespace-nowrap">{leg.label}</td>
      <td className="py-1.5 pr-3">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          isSell ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
        }`}>
          {isSell ? 'SELL' : 'BUY'}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-xs text-gray-400 capitalize">{leg.optionType}</td>
      <td className="py-1.5 pr-3 text-xs font-mono text-white">{leg.strike.toFixed(0)}</td>
      <td className="py-1.5 pr-3 text-xs text-gray-400 whitespace-nowrap">{leg.expiry}</td>
      <td className="py-1.5 pr-3 text-xs font-mono text-gray-300">{leg.delta.toFixed(2)}Δ</td>
      <td className="py-1.5 pr-3 text-xs font-mono text-blue-300">${leg.premium.toFixed(2)}</td>
      <td className="py-1.5 text-xs font-mono text-blue-200 font-semibold">${leg.premiumPerContract}</td>
    </tr>
  );
}

export function OptionsTradeCard({ plan }: OptionsTradeCardProps) {
  const [open, setOpen] = useState(false);

  const dirCfg   = DIRECTION_CONFIG[plan.direction];
  const catCfg   = CATEGORY_CONFIG[plan.category];
  const DirIcon  = dirCfg.icon;
  const isCredit = plan.netCredit != null;

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-900/60 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${catCfg.color}`}>
              {catCfg.label}
            </span>
            <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded border border-gray-700">
              {plan.structure}
            </span>
            <span className={`flex items-center gap-1 text-xs font-semibold ${dirCfg.color}`}>
              <DirIcon size={11} />
              {plan.direction.charAt(0).toUpperCase() + plan.direction.slice(1)}
            </span>
          </div>
          <p className="text-sm font-bold text-white">{plan.strategyName}</p>

          {/* Quick stats row */}
          <div className="flex flex-wrap gap-3 mt-1.5">
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <Clock size={10} className="text-gray-600" />
              {plan.entryTimeWindow}
            </span>
            <span className={`text-[11px] font-mono font-semibold ${isCredit ? 'text-emerald-400' : 'text-orange-300'}`}>
              {isCredit
                ? `Credit: $${plan.netCredit?.toFixed(0)}/contract`
                : `Debit: $${plan.netDebit?.toFixed(0)}/contract`}
            </span>
            <span className="text-[11px] text-gray-500">
              Max P: <span className="text-emerald-400 font-mono">${plan.maxProfit}</span>
            </span>
            <span className="text-[11px] text-gray-500">
              Max L: <span className="text-red-400 font-mono">${plan.maxLoss}</span>
            </span>
          </div>
        </div>
        {open
          ? <ChevronDown size={14} className="text-gray-500 shrink-0 mt-1" />
          : <ChevronRight size={14} className="text-gray-500 shrink-0 mt-1" />}
      </button>

      {/* ── Expanded Detail ──────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-4">
          {/* Warnings */}
          {plan.warnings.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/25">
              <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {plan.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-300">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Entry note */}
          <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-1">Entry Note</p>
            <p className="text-xs text-blue-200 leading-relaxed">{plan.entryNote}</p>
          </div>

          {/* Legs table */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Options Legs</p>
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-800/60">
                    {['Leg', 'Action', 'Type', 'Strike', 'Expiry', 'Delta', '$/Share', '$/Contract'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {plan.legs.map((leg, i) => <LegRow key={i} leg={leg} />)}
                </tbody>
              </table>
            </div>
          </div>

          {/* P&L stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox
              label={isCredit ? 'Net Credit' : 'Net Debit'}
              value={`$${isCredit ? plan.netCredit : plan.netDebit}/contract`}
              color={isCredit ? 'text-emerald-400' : 'text-orange-300'}
            />
            <StatBox label="Max Profit" value={`$${plan.maxProfit}`} color="text-emerald-400" />
            <StatBox label="Max Loss" value={`$${plan.maxLoss}`} color="text-red-400" />
            <StatBox
              label="R:R"
              value={`${(plan.maxProfit / Math.max(plan.maxLoss, 1)).toFixed(2)}:1`}
              color={plan.maxProfit / Math.max(plan.maxLoss, 1) >= 1 ? 'text-emerald-400' : 'text-yellow-400'}
            />
          </div>

          {/* Profit target + stop loss */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Target size={11} className="text-emerald-400" />
                <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">
                  Profit Target — ${plan.profitTarget}/contract
                </p>
              </div>
              <p className="text-xs text-emerald-300/80">{plan.profitTargetRule}</p>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={11} className="text-red-400" />
                <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide">
                  Stop Loss — ${plan.stopLoss}/contract
                </p>
              </div>
              <p className="text-xs text-red-300/80">{plan.stopLossRule}</p>
            </div>
          </div>

          {/* Breakevens */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1.5">
              Breakeven{plan.breakevens.length > 1 ? 's' : ''} at Expiry
            </p>
            <div className="flex flex-wrap gap-2">
              {plan.breakevens.map((be, i) => (
                <span key={i} className="text-xs font-mono bg-gray-800 border border-gray-700 px-2 py-1 rounded text-gray-200">
                  SPX {be.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              ))}
              <span className="text-xs text-gray-600 self-center">
                (SPX @ {plan.spxPrice.toFixed(0)}, VIX {plan.vix.toFixed(1)}, IVR ≈{plan.ivr})
              </span>
            </div>
          </div>

          {/* Conditions */}
          {plan.conditions.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Entry Conditions</p>
              <ul className="space-y-0.5">
                {plan.conditions.map((c, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <span className="text-blue-500 mt-0.5 font-bold">·</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Management rules */}
          {plan.management.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Trade Management</p>
              <ul className="space-y-0.5">
                {plan.management.map((m, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <span className="text-yellow-500 mt-0.5 font-bold">·</span>{m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
