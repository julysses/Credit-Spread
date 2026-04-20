'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Trade {
  pnl?: number;
  closedAt?: string;
}

interface JournalStripProps {
  trades?: Trade[];
}

function Sparkbar({ value, max }: { value: number; max: number }) {
  const h = (Math.abs(value) / max) * 44;
  const isPos = value >= 0;
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: 52 }}>
      {isPos && (
        <div
          className="w-full rounded-sm bg-green-400/80"
          style={{ height: h }}
        />
      )}
      {!isPos && (
        <div
          className="w-full rounded-sm bg-red-400/80 self-start mt-auto"
          style={{ height: h, marginTop: 52 - h }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, valueClass = 'text-gray-100' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">{label}</div>
      <div className={`slab text-base mt-0.5 tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

export function JournalStrip({ trades = [] }: JournalStripProps) {
  // Build last-10-day P&L from real trades or fall back to mock
  const recentPnl: { label: string; value: number }[] =
    trades.length > 0
      ? trades
          .slice(-10)
          .map((t, i) => ({ label: ['M','T','W','T','F','M','T','W','T','F'][i] ?? 'D', value: t.pnl ?? 0 }))
      : [
          { label: 'M', value: 420  }, { label: 'T', value: -180 }, { label: 'W', value: 310  },
          { label: 'T', value: 550  }, { label: 'F', value: -90  }, { label: 'M', value: 680  },
          { label: 'T', value: 120  }, { label: 'W', value: -240 }, { label: 'T', value: 410  },
          { label: 'F', value: 320  },
        ];

  const total    = recentPnl.reduce((s, d) => s + d.value, 0);
  const wins     = recentPnl.filter(d => d.value > 0);
  const losses   = recentPnl.filter(d => d.value < 0);
  const winRate  = recentPnl.length ? Math.round((wins.length / recentPnl.length) * 100) : 0;
  const avgWin   = wins.length   ? wins.reduce((s, d) => s + d.value, 0) / wins.length   : 0;
  const avgLoss  = losses.length ? losses.reduce((s, d) => s + d.value, 0) / losses.length : 0;
  const maxAbs   = Math.max(...recentPnl.map(d => Math.abs(d.value)), 1);

  const totalColor = total >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal · 10D P&L</CardTitle>
        <span className={`text-[10px] font-mono slab ${totalColor}`}>
          {total >= 0 ? '+' : ''}${total.toFixed(0)} · {winRate}% WIN
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Metric label="WIN RATE" value={`${winRate}%`}    valueClass="text-green-400" />
          <Metric label="AVG WIN"  value={`$${avgWin.toFixed(0)}`}  />
          <Metric label="AVG LOSS" value={`−$${Math.abs(avgLoss).toFixed(0)}`} valueClass="text-red-400" />
        </div>

        {/* P&L bars */}
        <div className="flex items-end gap-1" style={{ height: 60 }}>
          {recentPnl.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col" style={{ height: 60 }}>
              <div className="flex-1 flex flex-col justify-end">
                {d.value >= 0 && (
                  <div
                    className="rounded-sm bg-green-400/80"
                    style={{ height: `${(d.value / maxAbs) * 50}%` }}
                  />
                )}
              </div>
              <div className="flex-1 flex flex-col justify-start">
                {d.value < 0 && (
                  <div
                    className="rounded-sm bg-red-400/80"
                    style={{ height: `${(Math.abs(d.value) / maxAbs) * 50}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {recentPnl.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-gray-600 font-mono">{d.label}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
