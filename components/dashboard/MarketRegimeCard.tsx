'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarGauge } from '@/components/ui/bar-gauge';

interface MarketRegimeCardProps {
  vix: number;
  vixRegime: string;
  ivRank: number;
  impliedVol: number;
  realizedVol: number;
  expectedMove7d: number;
  expectedMove30d: number;
  directionalBias: string;
  marketRegime: string;
  riskLevel: string;
  skew: {
    atm: number;
    riskReversal25d: number;
    regime: string;
  } | null;
}

function vixColorClass(v: number) {
  if (v > 35) return 'text-red-500';
  if (v > 25) return 'text-red-400';
  if (v > 18) return 'text-orange-400';
  if (v > 12) return 'text-yellow-400';
  return 'text-green-400';
}
function vixBarClass(v: number) {
  if (v > 35) return 'bg-red-500';
  if (v > 25) return 'bg-red-400';
  if (v > 18) return 'bg-orange-400';
  if (v > 12) return 'bg-yellow-400';
  return 'bg-green-400';
}
function vixLabelText(v: number) {
  if (v > 35) return 'EXTREME';
  if (v > 25) return 'ELEVATED';
  if (v > 18) return 'NORMAL-HI';
  return 'NORMAL';
}
function ivBarClass(r: number) {
  if (r >= 70) return 'bg-green-400';
  if (r >= 40) return 'bg-yellow-400';
  return 'bg-red-400';
}
function ivTextClass(r: number) {
  if (r >= 70) return 'text-green-400';
  if (r >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

export function MarketRegimeCard({
  vix,
  ivRank,
  impliedVol,
  realizedVol,
  expectedMove7d,
  expectedMove30d,
  directionalBias,
  marketRegime,
  riskLevel,
  skew,
}: MarketRegimeCardProps) {
  const iv = impliedVol * 100;
  const rv = realizedVol * 100;
  const premium = iv - rv;

  const regimeVariant =
    riskLevel === 'low'  ? 'success' :
    riskLevel === 'high' || riskLevel === 'extreme' ? 'danger' : 'info';

  const biasNum =
    directionalBias === 'bullish' ? 22 :
    directionalBias === 'bearish' ? -22 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Regime</CardTitle>
        <Badge variant={regimeVariant as 'success' | 'danger' | 'info'}>
          {marketRegime.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* VIX gauge */}
        <BarGauge
          label="VIX"
          value={vix}
          min={8}
          max={50}
          stops={[12, 18, 25, 35]}
          barClass={vixBarClass(vix)}
          valueText={
            <span className={vixColorClass(vix)}>
              {vix.toFixed(2)} · {vixLabelText(vix)}
            </span>
          }
        />

        {/* IV Rank gauge */}
        <BarGauge
          label="IV Rank 52w"
          value={ivRank}
          min={0}
          max={100}
          stops={[40, 70]}
          barClass={ivBarClass(ivRank)}
          valueText={
            <span className={ivTextClass(ivRank)}>{ivRank.toFixed(0)}%</span>
          }
        />

        {/* IV / RV / Premium */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-sd-line">
          <Metric label="IV 30D" value={`${iv.toFixed(1)}%`} />
          <Metric label="RV 30D" value={`${rv.toFixed(1)}%`} />
          <Metric
            label="IV − RV"
            value={`${premium >= 0 ? '+' : ''}${premium.toFixed(1)}`}
            valueClass={premium > 0 ? 'text-green-400' : 'text-red-400'}
          />
        </div>

        {/* Expected moves */}
        <div className="grid grid-cols-2 gap-3">
          <Metric label="EXP. MOVE · 7D"  value={`±${expectedMove7d.toFixed(0)}`}  boxed />
          <Metric label="EXP. MOVE · 30D" value={`±${expectedMove30d.toFixed(0)}`} boxed />
        </div>

        {/* Directional bias bar */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">Directional Bias</div>
            <div className="slab text-sm text-gray-200 capitalize">{directionalBias}</div>
          </div>
          <div className="relative h-2 bg-sd-muted rounded-full overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-sd-line2" />
            <div
              className={`absolute top-0 bottom-0 ${biasNum >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
              style={{
                left: biasNum >= 0 ? '50%' : `${50 + biasNum / 2}%`,
                width: `${Math.abs(biasNum) / 2}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-600 font-mono mt-1 uppercase tracking-wider">
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
        </div>

        {/* Skew */}
        {skew && (
          <div className="pt-3 border-t border-sd-line">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-2">Vol Skew</div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="ATM IV"  value={`${(skew.atm * 100).toFixed(1)}%`} boxed />
              <Metric
                label="25d RR"
                value={`${(skew.riskReversal25d * 100).toFixed(1)}%`}
                valueClass={skew.riskReversal25d > 0.02 ? 'text-red-400' : 'text-gray-200'}
                boxed
              />
              <Metric
                label="Skew"
                value={skew.regime}
                valueClass={skew.regime === 'steep' ? 'text-red-400' : skew.regime === 'moderate' ? 'text-yellow-400' : 'text-green-400'}
                boxed
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  valueClass = 'text-gray-100',
  boxed = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  boxed?: boolean;
}) {
  const body = (
    <>
      <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">{label}</div>
      <div className={`slab text-base mt-0.5 tabular-nums ${valueClass}`}>{value}</div>
    </>
  );
  if (boxed) return <div className="bg-sd-muted/50 border border-sd-line/60 rounded-lg px-3 py-2">{body}</div>;
  return <div>{body}</div>;
}
