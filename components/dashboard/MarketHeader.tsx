'use client';

import { Badge } from '@/components/ui/badge';
import { getRiskBadgeClass } from '@/lib/utils';

interface MarketHeaderProps {
  spxPrice: number;
  spxChangePct: number;
  vix: number;
  vixChangePct: number;
  vixRegime: string;
  riskLevel: string;
  isMarketOpen: boolean;
  lastUpdated: string;
}

export function MarketHeader({
  spxPrice,
  spxChangePct,
  vix,
  vixChangePct,
  vixRegime,
  riskLevel,
  isMarketOpen,
  lastUpdated,
}: MarketHeaderProps) {
  const spxPositive = spxChangePct >= 0;
  const vixPositive = vixChangePct >= 0;

  return (
    <header className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-tight">SPX Signal Desk</div>
              <div className="text-gray-500 text-xs">Options Intelligence Engine</div>
            </div>
          </div>

          {/* Market Tickers */}
          <div className="flex items-center gap-6">
            {/* SPX */}
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wider">SPX</div>
              <div className="font-mono font-bold text-white text-lg leading-tight">
                {spxPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-mono ${spxPositive ? 'text-green-400' : 'text-red-400'}`}>
                {spxPositive ? '+' : ''}{spxChangePct.toFixed(2)}%
              </div>
            </div>

            <div className="w-px h-10 bg-gray-800" />

            {/* VIX */}
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wider">VIX</div>
              <div className={`font-mono font-bold text-lg leading-tight ${vix > 25 ? 'text-red-400' : vix > 18 ? 'text-yellow-400' : 'text-green-400'}`}>
                {vix.toFixed(2)}
              </div>
              <div className={`text-xs font-mono ${vixPositive ? 'text-red-400' : 'text-green-400'}`}>
                {vixPositive ? '+' : ''}{vixChangePct.toFixed(2)}%
              </div>
            </div>

            <div className="w-px h-10 bg-gray-800" />

            {/* Status Badges */}
            <div className="flex flex-col gap-1">
              <Badge className={getRiskBadgeClass(riskLevel)}>
                {riskLevel.toUpperCase()} RISK
              </Badge>
              <Badge variant={isMarketOpen ? 'success' : 'warning'}>
                {isMarketOpen ? '● LIVE' : '○ CLOSED'}
              </Badge>
            </div>
          </div>

          {/* Right: VIX Regime + Time */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-gray-500">Vol Regime</div>
              <div className={`text-sm font-semibold capitalize ${
                vixRegime === 'extreme' ? 'text-red-500' :
                vixRegime === 'high' ? 'text-red-400' :
                vixRegime === 'elevated' ? 'text-orange-400' :
                vixRegime === 'moderate' ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {vixRegime}
              </div>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-xs text-gray-500">Updated</div>
              <div className="text-xs text-gray-400 font-mono">{lastUpdated}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
