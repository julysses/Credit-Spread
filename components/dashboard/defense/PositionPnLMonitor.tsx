'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { LivePnL, SpreadPosition } from '@/lib/models/defense-engine';

interface PositionPnLMonitorProps {
  position: SpreadPosition | null;
  pnl: LivePnL | null;
  spx: number;
  dte: number;
}

function Stat({ label, value, color = 'text-gray-100' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-sd-muted/50 border border-sd-line/60 rounded-lg p-3 text-center">
      <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1">{label}</div>
      <div className={`slab text-lg tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function PositionPnLMonitor({ position, pnl, spx, dte }: PositionPnLMonitorProps) {
  if (!position || !pnl) {
    return (
      <Card className="animate-pulse">
        <CardHeader><CardTitle>Position P&amp;L</CardTitle></CardHeader>
        <CardContent><div className="h-32 bg-sd-muted rounded" /></CardContent>
      </Card>
    );
  }

  const pnlColor = pnl.pnlDollar >= 0 ? 'text-green-400' : pnl.pnlDollar < -pnl.maxLoss * 0.5 ? 'text-red-400' : 'text-orange-400';
  const distancePct = ((spx - position.shortStrike) / spx * 100);
  const isCall = position.optionType === 'call';
  // For puts: distance is positive when SPX is above short strike (safe)
  // For calls: distance is positive when SPX is below short strike (safe)
  const safeDistance = isCall ? -distancePct : distancePct;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position P&amp;L Monitor</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-mono text-gray-500 border border-sd-line rounded px-1.5 py-0.5 uppercase">
            {position.optionType.toUpperCase()} SPREAD
          </span>
          <span className="text-[9px] font-mono text-gray-400 border border-sd-line rounded px-1.5 py-0.5">
            {position.shortStrike}/{position.longStrike} × {position.contracts}
          </span>
          <span className={`text-[9px] font-mono border rounded px-1.5 py-0.5 ${safeDistance < 0.5 ? 'text-red-400 border-red-500/30 bg-red-500/10' : safeDistance < 1.5 ? 'text-orange-400 border-orange-500/30' : 'text-green-400 border-green-500/30'}`}>
            {safeDistance >= 0 ? '+' : ''}{safeDistance.toFixed(2)}% from strike
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Entry Credit" value={`$${(position.entryCredit * 100).toFixed(0)}`} />
          <Stat label="Current Cost" value={`$${(pnl.currentValue * 100).toFixed(0)}`} />
          <Stat label="P&L" value={`${pnl.pnlDollar >= 0 ? '+' : ''}$${pnl.pnlDollar.toFixed(0)}`} color={pnlColor} />
          <Stat label="P&L %" value={`${pnl.pnlPct >= 0 ? '+' : ''}${(pnl.pnlPct * 100).toFixed(1)}%`} color={pnlColor} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Max Profit" value={`$${pnl.maxProfit.toFixed(0)}`} color="text-green-400" />
          <Stat label="Max Loss"   value={`$${pnl.maxLoss.toFixed(0)}`}   color="text-red-400" />
          <Stat label="DTE"        value={dte.toFixed(1)}                  color={dte <= 1 ? 'text-red-400' : dte <= 3 ? 'text-orange-400' : 'text-gray-200'} />
        </div>

        {/* Greeks strip */}
        <div className="pt-2 border-t border-sd-line/40 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em]">Delta</div>
            <div className={`font-mono text-sm tabular-nums ${pnl.delta < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {pnl.delta.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em]">Theta /day</div>
            <div className={`font-mono text-sm tabular-nums ${pnl.theta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl.theta > 0 ? '+' : ''}{pnl.theta.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em]">Gamma</div>
            <div className="font-mono text-sm tabular-nums text-gray-300">
              {pnl.gamma.toFixed(4)}
            </div>
          </div>
        </div>

        {/* P&L progress bar */}
        <div>
          <div className="flex justify-between text-[9px] text-gray-500 mb-1">
            <span>Max Loss</span>
            <span>Breakeven</span>
            <span>Max Profit</span>
          </div>
          <div className="h-2 rounded-full bg-sd-muted/60 border border-sd-line/40 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pnl.pnlPct >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.max(2, Math.min(100, (pnl.pnlPct + 1) / 2 * 100))}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
