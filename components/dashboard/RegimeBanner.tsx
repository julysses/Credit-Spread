'use client';

import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { FourRegime } from '@/lib/models/regime-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RegimeBannerData {
  regime: FourRegime;
  compositeScore: number;
  componentScores: Record<string, number>;
  confidence: string;
  regimeDescription: string;
  dataQuality: number;
  bullishSignals: number;
  bearishSignals: number;
  ivr: number;
  fetchedAt: number;
}

const REGIME_CONFIG: Record<FourRegime, {
  bg: string; border: string; text: string; label: string; icon: React.ReactNode;
}> = {
  RISK_ON_TRENDING:  { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'RISK-ON TRENDING',  icon: <TrendingUp size={20} className="text-emerald-400" /> },
  RISK_OFF_TRENDING: { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-400',     label: 'RISK-OFF TRENDING', icon: <TrendingDown size={20} className="text-red-400" /> },
  RANGE_BOUND:       { bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40',  text: 'text-yellow-400',  label: 'RANGE-BOUND',       icon: <Minus size={20} className="text-yellow-400" /> },
  CRISIS:            { bg: 'bg-red-900/30',     border: 'border-red-700/60',     text: 'text-red-300',     label: 'CRISIS / EXTREME VOL', icon: <AlertTriangle size={20} className="text-red-300" /> },
};

const SIGNAL_LABELS: Record<string, string> = {
  spxVs200sma:    'SPX/200MA',
  breadth:        'Breadth',
  hyCreditSpreads:'HY Spread',
  vix:            'VIX',
  gex:            'GEX',
  putCallRatio:   'P/C Ratio',
  vvix:           'VVIX',
  dxy:            'DXY',
  wtiVelocity:    'WTI Mom.',
  goldVelocity:   'Gold Mom.',
};

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(-5, Math.min(5, score));
  const pct = ((clamped + 5) / 10) * 100;
  const color =
    clamped >= 2 ? 'bg-emerald-500' :
    clamped >= 0.5 ? 'bg-emerald-400/70' :
    clamped <= -2 ? 'bg-red-500' :
    clamped <= -0.5 ? 'bg-red-400/70' :
    'bg-yellow-500';

  return (
    <div className="relative w-full">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>−5</span><span>0</span><span>+5</span>
      </div>
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        {/* Zero line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600 z-10" />
        {/* Filled bar from center */}
        {clamped >= 0 ? (
          <div
            className={`absolute top-0 bottom-0 ${color} rounded-r transition-all duration-500`}
            style={{ left: '50%', width: `${(clamped / 5) * 50}%` }}
          />
        ) : (
          <div
            className={`absolute top-0 bottom-0 ${color} rounded-l transition-all duration-500`}
            style={{ right: '50%', width: `${(Math.abs(clamped) / 5) * 50}%` }}
          />
        )}
      </div>
      <div className="text-center mt-1">
        <span className={`text-2xl font-bold font-mono ${
          clamped >= 1 ? 'text-emerald-400' : clamped <= -1 ? 'text-red-400' : 'text-yellow-400'
        }`}>
          {clamped >= 0 ? '+' : ''}{clamped.toFixed(2)}
        </span>
        <span className="text-xs text-gray-500 ml-1">composite</span>
      </div>
    </div>
  );
}

function ComponentPill({ label, value }: { label: string; value: number }) {
  const color = value > 0.15 ? 'text-emerald-400 bg-emerald-500/10' :
                value < -0.15 ? 'text-red-400 bg-red-500/10' :
                'text-gray-500 bg-gray-800/50';
  const arrow = value > 0.15 ? '▲' : value < -0.15 ? '▼' : '–';
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-transparent ${color}`}>
      <span>{arrow}</span>
      <span>{label}</span>
    </div>
  );
}

export function RegimeBanner() {
  const [data, setData] = useState<RegimeBannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/options/regime')
      .then(r => r.json())
      .then((res: any) => {
        if (res.success) setData(res.data);
        else setError(res.error ?? 'Unknown error');
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-gray-800 rounded-xl p-4 bg-gray-900/40 animate-pulse">
        <div className="h-6 bg-gray-800 rounded w-48 mb-3" />
        <div className="h-4 bg-gray-800 rounded w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border border-red-900/40 rounded-xl p-4 bg-red-900/10">
        <p className="text-red-400 text-sm">Regime data unavailable — {error ?? 'no data returned'}</p>
      </div>
    );
  }

  const cfg = REGIME_CONFIG[data.regime];

  return (
    <div className={`border rounded-xl p-5 ${cfg.bg} ${cfg.border} space-y-4`}>
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        {cfg.icon}
        <div>
          <h2 className={`text-xl font-bold tracking-tight ${cfg.text}`}>{cfg.label}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{data.regimeDescription}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${
            data.confidence === 'high' ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-400' :
            data.confidence === 'medium' ? 'border-yellow-600/40 bg-yellow-500/10 text-yellow-400' :
            'border-gray-700 bg-gray-800/50 text-gray-500'
          }`}>
            {data.confidence.toUpperCase()} CONFIDENCE
          </span>
          <span>IVR≈{data.ivr}</span>
          <Activity size={12} />
          <span>{data.bullishSignals} bull / {data.bearishSignals} bear</span>
        </div>
      </div>

      {/* Composite score bar */}
      <ScoreBar score={data.compositeScore} />

      {/* Component pills */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(data.componentScores).map(([key, value]) => (
          <ComponentPill
            key={key}
            label={SIGNAL_LABELS[key] ?? key}
            value={value}
          />
        ))}
      </div>

      {/* Data quality */}
      {data.dataQuality < 0.7 && (
        <p className="text-xs text-yellow-500 flex items-center gap-1">
          <AlertTriangle size={11} />
          {Math.round(data.dataQuality * 10)}/10 signals available — some inputs missing, confidence may be reduced.
        </p>
      )}
    </div>
  );
}
