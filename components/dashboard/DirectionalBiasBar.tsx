'use client';

import { useState, useEffect } from 'react';
import type { TechnicalEvidence, BiasSignal } from '@/server/technicals';

interface TechnicalsData {
  swingBias: BiasSignal;
  swingStrength: number;
  evidence: TechnicalEvidence[];
  currentPrice: number;
  intradayBias: BiasSignal;
  intradayNote: string;
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

function signalArrow(signal: BiasSignal) {
  if (signal === 'bullish') return <span className="text-emerald-400 text-xs font-bold ml-1">▲</span>;
  if (signal === 'bearish') return <span className="text-red-400 text-xs font-bold ml-1">▼</span>;
  return <span className="text-gray-500 text-xs font-bold ml-1">–</span>;
}

function signalDot(signal: BiasSignal) {
  if (signal === 'bullish') return 'bg-emerald-500';
  if (signal === 'bearish') return 'bg-red-500';
  return 'bg-gray-500';
}

export function DirectionalBiasBar() {
  const [data, setData] = useState<TechnicalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/market/technicals')
      .then(r => r.json())
      .then(j => {
        if (j.success) setData(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 animate-pulse">
        <div className="flex gap-4">
          <div className="h-8 w-48 bg-gray-800 rounded" />
          <div className="h-8 w-32 bg-gray-800 rounded" />
          <div className="ml-auto h-8 w-40 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const swingAligned = Math.round(data.swingStrength * data.evidence.length);
  const total = data.evidence.length;

  return (
    <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl overflow-hidden">
      {/* Main bar */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* Swing bias */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Swing (7–14 DTE)</span>
          <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${biasBg(data.swingBias)}`}>
            {biasLabel(data.swingBias)}
          </span>
          <span className="text-gray-600 text-xs">{swingAligned}/{total} signals</span>
        </div>

        <div className="h-5 w-px bg-gray-700 hidden sm:block" />

        {/* Evidence pills (compact) */}
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

        <div className="h-5 w-px bg-gray-700 hidden sm:block" />

        {/* Intraday bias */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Intraday (0DTE)</span>
          <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${biasBg(data.intradayBias)}`}>
            {biasLabel(data.intradayBias)}
          </span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-auto text-gray-600 hover:text-gray-400 transition-colors text-xs"
        >
          {expanded ? 'Hide proof ▲' : 'Show proof ▼'}
        </button>
      </div>

      {/* Expanded technical evidence */}
      {expanded && (
        <div className="border-t border-gray-800/60 bg-gray-950/40 p-4">
          <div className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">
            SPX Technical Analysis — Swing Bias Proof
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.evidence.map(ev => (
              <div
                key={ev.indicator}
                className="flex items-start gap-2.5 bg-gray-900/60 rounded-lg p-3"
              >
                <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${signalDot(ev.signal)}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-gray-300 text-xs font-medium">{ev.indicator}</span>
                    <span className="text-gray-400 font-mono text-xs">{ev.value}</span>
                    {signalArrow(ev.signal)}
                  </div>
                  <div className="text-gray-500 text-xs leading-relaxed">{ev.note}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-600 border-t border-gray-800/40 pt-3">
            <span className="font-medium text-gray-500">Intraday context:</span> {data.intradayNote}
          </div>
        </div>
      )}
    </div>
  );
}
