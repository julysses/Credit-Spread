'use client';

import { useState, useEffect } from 'react';
import { SPXChart } from './SPXChart';
import type { ChartDataPoint } from '@/app/api/market/technicals/route';
import type { BiasSignal, TechnicalEvidence } from '@/server/technicals';

interface TechnicalsData {
  swingBias: BiasSignal;
  swingStrength: number;
  evidence: TechnicalEvidence[];
  currentPrice: number;
  intradayBias: BiasSignal;
  intradayNote: string;
  chartData: ChartDataPoint[];
  fetchedAt: number;
}

function biasBg(bias: BiasSignal) {
  if (bias === 'bullish') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
  if (bias === 'bearish') return 'bg-red-500/20 border-red-500/40 text-red-300';
  return 'bg-gray-700/40 border-gray-600/40 text-gray-400';
}

function biasLabel(bias: BiasSignal) {
  if (bias === 'bullish') return '▲ BULLISH';
  if (bias === 'bearish') return '▼ BEARISH';
  return '— NEUTRAL';
}

function signalDot(signal: BiasSignal) {
  if (signal === 'bullish') return 'bg-emerald-500';
  if (signal === 'bearish') return 'bg-red-500';
  return 'bg-gray-500';
}

function signalArrow(signal: BiasSignal) {
  if (signal === 'bullish') return <span className="text-emerald-400 text-xs font-bold ml-0.5">▲</span>;
  if (signal === 'bearish') return <span className="text-red-400 text-xs font-bold ml-0.5">▼</span>;
  return <span className="text-gray-500 text-xs font-bold ml-0.5">–</span>;
}

export function DirectionalBiasBar() {
  const [data, setData] = useState<TechnicalsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market/technicals')
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 space-y-3 animate-pulse">
        <div className="flex gap-4">
          <div className="h-7 w-44 bg-gray-800 rounded" />
          <div className="h-7 w-32 bg-gray-800 rounded" />
          <div className="ml-auto h-7 w-36 bg-gray-800 rounded" />
        </div>
        <div className="h-[510px] bg-gray-800/60 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  const swingAligned = Math.round(data.swingStrength * data.evidence.length);
  const total = data.evidence.length;

  return (
    <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl overflow-hidden">
      {/* ── Compact bias banner ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-800/60">
        {/* Swing bias */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Swing (7–14 DTE)</span>
          <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${biasBg(data.swingBias)}`}>
            {biasLabel(data.swingBias)}
          </span>
          <span className="text-gray-600 text-xs">{swingAligned}/{total} signals</span>
        </div>

        <div className="h-4 w-px bg-gray-700 hidden sm:block" />

        {/* Indicator pills */}
        <div className="flex flex-wrap gap-1.5">
          {data.evidence.map(ev => (
            <div
              key={ev.indicator}
              title={ev.note}
              className="flex items-center gap-1 bg-gray-800/60 border border-gray-700/40 rounded px-2 py-0.5 cursor-default"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${signalDot(ev.signal)}`} />
              <span className="text-gray-400 text-xs">{ev.indicator}</span>
              <span className="text-gray-300 text-xs font-mono">{ev.value}</span>
              {signalArrow(ev.signal)}
            </div>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-700 hidden sm:block" />

        {/* Intraday bias */}
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Intraday (0DTE)</span>
          <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${biasBg(data.intradayBias)}`}>
            {biasLabel(data.intradayBias)}
          </span>
        </div>

        {/* Intraday note */}
        <span className="text-gray-600 text-xs hidden lg:block truncate max-w-xs" title={data.intradayNote}>
          {data.intradayNote}
        </span>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-4">
        {data.chartData && data.chartData.length > 0 ? (
          <SPXChart data={data.chartData} swingBias={data.swingBias} />
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
            Chart data unavailable
          </div>
        )}
      </div>
    </div>
  );
}
