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

interface RegimeBannerProps {
  spxPrice?: number;
  vix?: number;
  spxHigh?: number;
  spxLow?: number;
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

function ExpectedRangeBar({ spxPrice, vix, spxHigh, spxLow }: { spxPrice: number; vix: number; spxHigh?: number; spxLow?: number }) {
  const dailySigma = spxPrice * (vix / 100) / Math.sqrt(252);
  const weeklySigma = spxPrice * (vix / 100) / Math.sqrt(52);

  // 1σ and 2σ bands derived from IV
  const lo1 = spxPrice - dailySigma;
  const hi1 = spxPrice + dailySigma;
  const lo2 = spxPrice - 2 * dailySigma;
  const hi2 = spxPrice + 2 * dailySigma;

  // If we have actual intraday H/L, use the wider of the two for display scale
  const rangeMin = Math.min(lo2, spxLow ?? lo2) * 0.9995;
  const rangeMax = Math.max(hi2, spxHigh ?? hi2) * 1.0005;
  const scale = rangeMax - rangeMin;
  const pct = (v: number) => `${((v - rangeMin) / scale) * 100}%`;

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">Expected Trading Range · Today</div>

      {/* Bar */}
      <div className="relative h-6 bg-sd-muted rounded-md overflow-hidden">
        {/* 2σ band */}
        <div className="absolute top-0 bottom-0 bg-blue-500/10 rounded"
          style={{ left: pct(lo2), right: `${100 - parseFloat(pct(hi2))}%` }} />
        {/* 1σ band */}
        <div className="absolute top-0 bottom-0 bg-blue-500/20 rounded"
          style={{ left: pct(lo1), right: `${100 - parseFloat(pct(hi1))}%` }} />
        {/* Actual intraday range */}
        {spxHigh && spxLow && (
          <div className="absolute top-1 bottom-1 bg-green-400/30 border border-green-400/40 rounded"
            style={{ left: pct(spxLow), right: `${100 - parseFloat(pct(spxHigh))}%` }} />
        )}
        {/* Spot price tick */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-100/80"
          style={{ left: pct(spxPrice) }} />
      </div>

      {/* Labels row */}
      <div className="grid grid-cols-4 gap-2 text-[10px] font-mono">
        <div>
          <div className="text-gray-600 uppercase tracking-wider">−2σ</div>
          <div className="slab text-gray-300">{lo2.toFixed(0)}</div>
        </div>
        <div>
          <div className="text-gray-600 uppercase tracking-wider">−1σ</div>
          <div className="slab text-gray-300">{lo1.toFixed(0)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-600 uppercase tracking-wider">+1σ</div>
          <div className="slab text-gray-300">{hi1.toFixed(0)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-600 uppercase tracking-wider">+2σ</div>
          <div className="slab text-gray-300">{hi2.toFixed(0)}</div>
        </div>
      </div>

      {/* Compact summary row */}
      <div className="flex items-center gap-4 pt-1 text-[10px] font-mono flex-wrap">
        <span className="text-gray-500">
          SPOT <span className="slab text-gray-200">{spxPrice.toFixed(2)}</span>
        </span>
        <span className="text-gray-500">
          ±1σ/day <span className="slab text-blue-400">±{dailySigma.toFixed(0)}</span>
        </span>
        <span className="text-gray-500">
          ±1σ/wk <span className="slab text-blue-400">±{weeklySigma.toFixed(0)}</span>
        </span>
        {spxHigh && spxLow && (
          <span className="text-gray-500">
            Day H/L <span className="slab text-green-400">{spxLow.toFixed(0)}–{spxHigh.toFixed(0)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function RegimeBanner({ spxPrice, vix, spxHigh, spxLow }: RegimeBannerProps = {}) {
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
        {/* Expected trading range — shown when spxPrice + vix are available */}
        {spxPrice && vix && (
          <div className="pb-3 border-b border-sd-line">
            <ExpectedRangeBar spxPrice={spxPrice} vix={vix} spxHigh={spxHigh} spxLow={spxLow} />
          </div>
        )}

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
