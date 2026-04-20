'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity } from 'lucide-react';
import type { FourRegime } from '@/lib/models/regime-engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  badge: 'success' | 'danger' | 'warning' | 'info';
  text: string;
  label: string;
  icon: React.ReactNode;
}> = {
  RISK_ON_TRENDING:  { badge: 'success', text: 'text-green-400',  label: 'RISK-ON TRENDING',     icon: <TrendingUp  size={16} className="text-green-400" /> },
  RISK_OFF_TRENDING: { badge: 'danger',  text: 'text-red-400',    label: 'RISK-OFF TRENDING',    icon: <TrendingDown size={16} className="text-red-400" /> },
  RANGE_BOUND:       { badge: 'info',    text: 'text-blue-400',   label: 'RANGE-BOUND',          icon: <Minus size={16} className="text-blue-400" /> },
  CRISIS:            { badge: 'danger',  text: 'text-red-300',    label: 'CRISIS / EXTREME VOL', icon: <AlertTriangle size={16} className="text-red-300" /> },
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

function CompositeBar({ score }: { score: number }) {
  const clamped = Math.max(-5, Math.min(5, score));
  const pct = ((clamped + 5) / 10) * 100;
  const barColor =
    clamped >= 1  ? 'bg-green-400' :
    clamped <= -1 ? 'bg-red-400' : 'bg-yellow-400';
  const textColor =
    clamped >= 1  ? 'text-green-400' :
    clamped <= -1 ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="space-y-1">
      <div className="relative h-2 bg-sd-muted rounded-full overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-sd-line2 z-10" />
        {clamped >= 0 ? (
          <div className={`absolute top-0 bottom-0 ${barColor} transition-all`}
            style={{ left: '50%', width: `${(clamped / 5) * 50}%` }} />
        ) : (
          <div className={`absolute top-0 bottom-0 ${barColor} transition-all`}
            style={{ right: '50%', width: `${(Math.abs(clamped) / 5) * 50}%` }} />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-gray-600 font-mono uppercase tracking-wider">
        <span>Bearish −5</span>
        <span className={`slab text-xs ${textColor}`}>
          {clamped >= 0 ? '+' : ''}{clamped.toFixed(2)} composite
        </span>
        <span>+5 Bullish</span>
      </div>
    </div>
  );
}

function SignalPill({ label, value }: { label: string; value: number }) {
  const isPos = value > 0.15;
  const isNeg = value < -0.15;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
      isPos ? 'text-green-400 bg-green-500/10 border-green-500/20' :
      isNeg ? 'text-red-400 bg-red-500/10 border-red-500/20' :
              'text-gray-500 bg-sd-muted border-sd-line'
    }`}>
      {isPos ? '▲' : isNeg ? '▼' : '—'} {label}
    </span>
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
      <Card className="p-5 animate-pulse">
        <div className="h-5 bg-sd-muted rounded w-48 mb-3" />
        <div className="h-2 bg-sd-muted rounded w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="px-5 py-4">
        <p className="text-[12px] text-gray-500">
          Regime data unavailable — {error ?? 'no data'}
        </p>
      </Card>
    );
  }

  const cfg = REGIME_CONFIG[data.regime];
  const confVariant =
    data.confidence === 'high'   ? 'success' :
    data.confidence === 'medium' ? 'warning' : 'outline';

  return (
    <Card>
      <div className="px-5 py-3.5 border-b border-sd-line flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <h3 className={`text-[13px] font-bold tracking-tight ${cfg.text}`}>{cfg.label}</h3>
        </div>
        <Badge variant={cfg.badge}>{data.confidence.toUpperCase()} CONFIDENCE</Badge>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-500 font-mono">
          <span>IVR≈{data.ivr}</span>
          <Activity size={11} />
          <span>{data.bullishSignals}↑ {data.bearishSignals}↓</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {data.regimeDescription && (
          <p className="text-[12.5px] text-gray-300 leading-relaxed">{data.regimeDescription}</p>
        )}

        <CompositeBar score={data.compositeScore} />

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(data.componentScores).map(([key, value]) => (
            <SignalPill key={key} label={SIGNAL_LABELS[key] ?? key} value={value} />
          ))}
        </div>

        {data.dataQuality < 0.7 && (
          <p className="text-[11px] text-yellow-500 flex items-center gap-1.5">
            <AlertTriangle size={11} />
            {Math.round(data.dataQuality * 10)}/10 signals available — reduced confidence
          </p>
        )}
      </div>
    </Card>
  );
}
