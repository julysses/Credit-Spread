'use client';

import { Badge } from '@/components/ui/badge';
import type { DefenseRegime } from '@/lib/models/defense-engine';

interface RegimeClassifierProps {
  regime: DefenseRegime | null;
  vix: number;
  dte: number;
  pnlPct: number;
}

export function RegimeClassifier({ regime, vix, dte, pnlPct }: RegimeClassifierProps) {
  if (!regime) {
    return (
      <div className="rounded-lg border border-sd-line bg-sd-muted/40 p-4 animate-pulse h-24" />
    );
  }

  const badgeVariant: 'success' | 'danger' | 'info' | 'outline' =
    regime.level === 'HOLD'   ? 'success' :
    regime.level === 'BAIL'   ? 'danger'  :
    regime.level === 'HEDGE'  ? 'info'    : 'outline';

  return (
    <div className={`rounded-lg border ${regime.border} ${regime.bg} p-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${regime.level === 'BAIL' ? 'bg-red-400 live-dot' : regime.level === 'HEDGE' ? 'bg-orange-400' : regime.level === 'DEFEND' ? 'bg-yellow-400' : 'bg-green-400'}`} />
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.18em] mb-0.5">Defense Regime</div>
            <div className="flex items-center gap-2">
              <Badge variant={badgeVariant} className="tracking-[0.16em] text-[11px]">
                {regime.level}
              </Badge>
              <span className={`text-[12px] font-medium ${regime.color}`}>{regime.description}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="text-center">
            <div className="text-gray-500 text-[9px] uppercase tracking-[0.14em]">VIX</div>
            <div className={`tabular-nums ${vix > 30 ? 'text-red-400' : vix > 20 ? 'text-orange-400' : 'text-green-400'}`}>
              {vix.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[9px] uppercase tracking-[0.14em]">DTE</div>
            <div className={`tabular-nums ${dte <= 1 ? 'text-red-400' : dte <= 3 ? 'text-orange-400' : 'text-gray-200'}`}>
              {dte.toFixed(1)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[9px] uppercase tracking-[0.14em]">P&L</div>
            <div className={`tabular-nums ${pnlPct >= 0 ? 'text-green-400' : pnlPct < -0.5 ? 'text-red-400' : 'text-orange-400'}`}>
              {pnlPct >= 0 ? '+' : ''}{(pnlPct * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {regime.actions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-sd-line/40 flex flex-wrap gap-2">
          {regime.actions.map((a, i) => (
            <span key={i} className="text-[10px] text-gray-400 bg-sd-muted/60 border border-sd-line/50 rounded px-2 py-0.5">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
