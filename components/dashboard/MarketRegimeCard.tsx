'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRiskBadgeClass } from '@/lib/utils';

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

export function MarketRegimeCard({
  vix,
  vixRegime,
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
  const ivPremium = impliedVol > realizedVol;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Market Regime</CardTitle>
          <Badge className={getRiskBadgeClass(riskLevel)}>
            {riskLevel.toUpperCase()} RISK
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* VIX Visual Gauge */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-500">VIX Level</span>
            <span className={`text-xs font-semibold capitalize ${
              vixRegime === 'extreme' ? 'text-red-500' :
              vixRegime === 'high' ? 'text-red-400' :
              vixRegime === 'elevated' ? 'text-orange-400' :
              vixRegime === 'moderate' ? 'text-yellow-400' : 'text-green-400'
            }`}>{vixRegime}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                vix > 35 ? 'bg-red-600' :
                vix > 25 ? 'bg-red-400' :
                vix > 18 ? 'bg-orange-400' :
                vix > 12 ? 'bg-yellow-400' : 'bg-green-400'
              }`}
              style={{ width: `${Math.min((vix / 50) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>10</span><span>20</span><span>30</span><span>40</span><span>50+</span>
          </div>
        </div>

        {/* IV Rank */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500">IV Rank</span>
            <span className={`text-xs font-semibold ${
              ivRank >= 70 ? 'text-green-400' : ivRank >= 40 ? 'text-yellow-400' : 'text-red-400'
            }`}>{ivRank.toFixed(0)}/100</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${ivRank >= 70 ? 'bg-green-400' : ivRank >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
              style={{ width: `${ivRank}%` }}
            />
          </div>
        </div>

        {/* IV vs RV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Impl. Vol</div>
            <div className="text-lg font-bold font-mono text-white">{(impliedVol * 100).toFixed(1)}%</div>
            <div className="text-xs text-gray-600">VIX/100</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Realized Vol</div>
            <div className="text-lg font-bold font-mono text-white">{(realizedVol * 100).toFixed(1)}%</div>
            <div className="text-xs text-gray-600">20-day HV</div>
          </div>
        </div>

        {/* IV Premium */}
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
          ivPremium ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <span className="text-xs text-gray-400">IV vs RV Premium</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold font-mono ${ivPremium ? 'text-green-400' : 'text-red-400'}`}>
              {ivPremium ? '+' : ''}{((impliedVol - realizedVol) * 100).toFixed(1)}%
            </span>
            <Badge variant={ivPremium ? 'success' : 'danger'}>
              {ivPremium ? 'SELL FAVORABLE' : 'CAUTION'}
            </Badge>
          </div>
        </div>

        {/* Expected Moves */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Expected Moves</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800/40 rounded p-2 text-center">
              <div className="text-xs text-gray-500">7 Days</div>
              <div className="text-sm font-bold font-mono text-blue-400">±{expectedMove7d.toFixed(0)}</div>
            </div>
            <div className="bg-gray-800/40 rounded p-2 text-center">
              <div className="text-xs text-gray-500">30 Days</div>
              <div className="text-sm font-bold font-mono text-blue-400">±{expectedMove30d.toFixed(0)}</div>
            </div>
          </div>
        </div>

        {/* Volatility Skew */}
        {skew && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Vol Skew</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800/40 rounded p-2 text-center">
                <div className="text-xs text-gray-500">ATM IV</div>
                <div className="text-sm font-bold font-mono text-white">{(skew.atm * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-gray-800/40 rounded p-2 text-center">
                <div className="text-xs text-gray-500">25d RR</div>
                <div className={`text-sm font-bold font-mono ${skew.riskReversal25d > 0.02 ? 'text-red-400' : 'text-gray-300'}`}>
                  {(skew.riskReversal25d * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-800/40 rounded p-2 text-center">
                <div className="text-xs text-gray-500">Skew</div>
                <div className={`text-sm font-bold font-mono capitalize ${
                  skew.regime === 'steep' ? 'text-red-400' :
                  skew.regime === 'moderate' ? 'text-yellow-400' : 'text-green-400'
                }`}>{skew.regime}</div>
              </div>
            </div>
          </div>
        )}

        {/* Directional Bias + Market Regime */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
          <div>
            <div className="text-xs text-gray-500">Bias</div>
            <div className={`text-sm font-semibold capitalize ${
              directionalBias === 'bullish' ? 'text-green-400' :
              directionalBias === 'bearish' ? 'text-red-400' : 'text-gray-400'
            }`}>{directionalBias}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Regime</div>
            <div className="text-sm font-semibold text-gray-300 capitalize">{marketRegime.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
