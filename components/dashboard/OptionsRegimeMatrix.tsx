'use client';

import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { STRATEGY_CATALOG } from '@/lib/models/options-strategy-selector';
import type { FourRegime } from '@/lib/models/regime-engine';
import type { OptionsStrategyId, StructureDecision } from '@/lib/models/options-strategy-selector';

interface OptionsRegimeMatrixProps {
  regime: FourRegime;
  compositeScore: number;
  ivr: number;
  activeStrategyIds: OptionsStrategyId[];
  structureMatrix: StructureDecision[];
}

const REGIME_LABELS: Record<FourRegime, string> = {
  RISK_ON_TRENDING:  'Risk-On',
  RISK_OFF_TRENDING: 'Risk-Off',
  RANGE_BOUND:       'Range',
  CRISIS:            'Crisis',
};

const REGIME_COLORS: Record<FourRegime, string> = {
  RISK_ON_TRENDING:  'text-emerald-400',
  RISK_OFF_TRENDING: 'text-red-400',
  RANGE_BOUND:       'text-yellow-400',
  CRISIS:            'text-red-300',
};

const DIRECTION_COLORS = {
  neutral: 'text-yellow-400 bg-yellow-500/10 border-yellow-600/30',
  bullish: 'text-emerald-400 bg-emerald-500/10 border-emerald-600/30',
  bearish: 'text-red-400 bg-red-500/10 border-red-600/30',
};

const ALL_REGIMES: FourRegime[] = ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING', 'RANGE_BOUND', 'CRISIS'];
const DAY_TRADE_STRATEGIES = STRATEGY_CATALOG.filter(s => s.category === 'options_day_trade');
const SWING_STRATEGIES = STRATEGY_CATALOG.filter(s => s.category === 'options_swing');

export function OptionsRegimeMatrix({
  regime,
  ivr,
  activeStrategyIds,
  structureMatrix,
}: OptionsRegimeMatrixProps) {
  return (
    <div className="space-y-5">
      {/* ── Regime × Strategy Matrix ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Regime × Strategy Activation Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium w-48">Strategy</th>
                  {ALL_REGIMES.map(r => (
                    <th
                      key={r}
                      className={`text-center py-2 px-3 font-semibold ${
                        r === regime ? REGIME_COLORS[r] : 'text-gray-600'
                      } ${r === regime ? 'bg-gray-900/60 rounded' : ''}`}
                    >
                      {REGIME_LABELS[r]}
                      {r === regime && <span className="ml-1 text-[10px]">←now</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Day Trade header */}
                <tr>
                  <td colSpan={5} className="pt-3 pb-1">
                    <span className="text-[10px] uppercase tracking-widest text-yellow-500 font-bold">
                      Options Day Trade
                    </span>
                  </td>
                </tr>
                {DAY_TRADE_STRATEGIES.map(s => (
                  <tr key={s.id} className="border-b border-gray-800/40 hover:bg-gray-900/30">
                    <td className={`py-1.5 pr-4 font-medium ${
                      activeStrategyIds.includes(s.id) ? 'text-white' : 'text-gray-500'
                    }`}>
                      {s.name}
                    </td>
                    {ALL_REGIMES.map(r => {
                      const ideal = s.idealRegimes.includes(r);
                      return (
                        <td key={r} className="text-center py-1.5 px-3">
                          {ideal ? (
                            <CheckCircle size={14} className="mx-auto text-emerald-400" />
                          ) : (
                            <XCircle size={14} className="mx-auto text-gray-700" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Swing header */}
                <tr>
                  <td colSpan={5} className="pt-4 pb-1">
                    <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">
                      Options Swing
                    </span>
                  </td>
                </tr>
                {SWING_STRATEGIES.map(s => (
                  <tr key={s.id} className="border-b border-gray-800/40 hover:bg-gray-900/30">
                    <td className={`py-1.5 pr-4 font-medium ${
                      activeStrategyIds.includes(s.id) ? 'text-white' : 'text-gray-500'
                    }`}>
                      {s.name}
                    </td>
                    {ALL_REGIMES.map(r => {
                      const ideal = s.idealRegimes.includes(r);
                      return (
                        <td key={r} className="text-center py-1.5 px-3">
                          {ideal ? (
                            <CheckCircle size={14} className="mx-auto text-blue-400" />
                          ) : (
                            <XCircle size={14} className="mx-auto text-gray-700" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── IVR Structure Decision Matrix ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Options Structure Decision Matrix</CardTitle>
            <span className="text-xs text-gray-500">Current IVR ≈ {ivr}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {structureMatrix.map((row, i) => (
              <div
                key={i}
                className={`flex flex-wrap items-start gap-3 p-3 rounded-lg border ${DIRECTION_COLORS[row.direction]}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs mb-0.5">{row.label}</div>
                  <div className="text-sm font-bold text-white">{row.structure}</div>
                  <div className="text-xs text-gray-400 mt-1">{row.note}</div>
                </div>
                <div className="text-right shrink-0 text-xs text-gray-500 space-y-0.5">
                  <div>Δ target: <span className="text-gray-300">{row.deltaTarget}</span></div>
                  <div>DTE: <span className="text-gray-300">{row.dteSuggested}</span></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
