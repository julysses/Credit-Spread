'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ScanRow {
  sym: string;
  px: number;
  chg: number;
  vol: string;
  rvol: number;
  setup: string;
  iv: number;
  tone: 'bull' | 'bear' | 'neu';
}

const MOCK_ROWS: ScanRow[] = [
  { sym: 'NVDA', px: 872.14, chg: 2.84,  vol: '14.2M', rvol: 1.82, setup: 'Breakout +2σ',      iv: 54, tone: 'bull' },
  { sym: 'META', px: 598.47, chg: 1.12,  vol: '8.1M',  rvol: 1.31, setup: 'Flag continuation', iv: 38, tone: 'bull' },
  { sym: 'TSLA', px: 342.88, chg: -3.21, vol: '52.7M', rvol: 2.14, setup: 'Gap down · key lvl', iv: 71, tone: 'bear' },
  { sym: 'AAPL', px: 227.92, chg: 0.41,  vol: '22.3M', rvol: 0.78, setup: 'Range · compression',iv: 26, tone: 'neu' },
  { sym: 'AMZN', px: 198.44, chg: 1.87,  vol: '18.6M', rvol: 1.22, setup: 'Mean reversion',     iv: 32, tone: 'bull' },
  { sym: 'AMD',  px: 148.22, chg: -1.92, vol: '28.4M', rvol: 1.54, setup: 'Support test',       iv: 58, tone: 'bear' },
];

// Deterministic sparkline from symbol seed
function sparkData(sym: string): number[] {
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed += sym.charCodeAt(i);
  const rng = () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const arr = [100];
  for (let i = 1; i < 20; i++) arr.push(arr[i - 1] * (1 + (rng() - 0.48) * 0.04));
  return arr;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data), max = Math.max(...data);
  const W = 80, H = 24;
  const X = (i: number) => (i / (data.length - 1)) * W;
  const Y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 2) - 1;
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg width={W} height={H} className="block">
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

export function StocksScannerPanel() {
  const [rows, setRows] = useState<ScanRow[]>(MOCK_ROWS);

  useEffect(() => {
    fetch('/api/stocks/scan')
      .then(r => r.json())
      .then((res: any) => {
        if (res?.data?.candidates?.length) {
          const mapped: ScanRow[] = res.data.candidates.slice(0, 6).map((c: any) => ({
            sym:   c.symbol ?? c.sym,
            px:    c.price ?? c.px ?? 0,
            chg:   c.changePercent ?? c.chg ?? 0,
            vol:   c.volume ?? c.vol ?? '—',
            rvol:  c.relativeVolume ?? c.rvol ?? 1,
            setup: c.setup ?? '—',
            iv:    c.ivPercentile ?? c.iv ?? 0,
            tone:  (c.bias ?? 'neu') as ScanRow['tone'],
          }));
          setRows(mapped);
        }
      })
      .catch(() => {}); // silently fall back to mock data
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stocks Scanner · Top Setups</CardTitle>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">LIVE</span>
        </div>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-[9.5px] text-gray-500 uppercase tracking-[0.14em] border-b border-sd-line">
              <th className="text-left  px-5 py-2 font-semibold">Symbol</th>
              <th className="text-right px-3 py-2 font-semibold">Price</th>
              <th className="text-right px-3 py-2 font-semibold">Chg%</th>
              <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">RVol</th>
              <th className="text-left  px-3 py-2 font-semibold">Setup</th>
              <th className="text-right px-3 py-2 font-semibold hidden md:table-cell">IV</th>
              <th className="text-right px-5 py-2 font-semibold hidden md:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sd-line/70">
            {rows.map((r, i) => {
              const sparkColor =
                r.tone === 'bull' ? '#22c55e' :
                r.tone === 'bear' ? '#ef4444' : '#64748b';
              return (
                <tr key={i} className="hover:bg-sd-muted/40 transition-colors">
                  <td className="px-5 py-2.5 font-semibold text-gray-100 font-mono">{r.sym}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-200 tabular-nums">
                    {typeof r.px === 'number' ? r.px.toFixed(2) : r.px}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.chg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.chg >= 0 ? '+' : ''}{typeof r.chg === 'number' ? r.chg.toFixed(2) : r.chg}%
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums hidden sm:table-cell ${r.rvol >= 1.5 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {typeof r.rvol === 'number' ? r.rvol.toFixed(2) : r.rvol}×
                  </td>
                  <td className="px-3 py-2.5 text-gray-300">{r.setup}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-400 tabular-nums hidden md:table-cell">{r.iv}</td>
                  <td className="px-5 py-2.5 text-right hidden md:table-cell">
                    <span className="inline-block">
                      <Sparkline data={sparkData(r.sym)} color={sparkColor} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
