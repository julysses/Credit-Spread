'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface StrategyCard {
  strategy: string;
  displayName: string;
  tagline: string;
  description: string;
  marketConditions: string[];
  idealVIXRange: { min: number; max: number };
  typicalDTE: { min: number; max: number };
  riskProfile: string;
  entryWindow: string;
  exitRules: string[];
  bestFor: string[];
  avoid: string[];
  isRecommended: boolean;
  isViable: boolean;
  inEntryWindow: boolean;
  recommendation: {
    tradeType: string;
    shortLeg: any;
    longLeg: any;
    shortLeg2?: any;
    longLeg2?: any;
    credit: number;
    maxProfit: number;
    maxLoss: number;
    probOfProfit: number;
    probOfTouch: number;
    expectedValue: number;
    kellySize: number;
    profitTarget: number;
    stopLoss: number;
    daysToExpiry: number;
    expiryDate: string;
    confidence: string;
    warnings: string[];
    conditions: string[];
  };
}

interface MarketContext {
  spxPrice: number;
  spxChangePct: number;
  vix: number;
  vixRegime: string;
  ivRank: number;
  marketRegime: string;
  directionalBias: string;
  impliedVol: number;
  realizedVol: number;
  timeOfDay: number;
  isMarketOpen: boolean;
}

interface StrategyCompareProps {
  strategies: StrategyCard[];
  marketContext: MarketContext;
  recommended: string;
  onSelectStrategy?: (strategy: StrategyCard) => void;
}

export function StrategyCompare({ strategies, marketContext, recommended, onSelectStrategy }: StrategyCompareProps) {
  const tradeableStrategies = strategies.filter(s => s.strategy !== 'NO_TRADE');
  const noTrade = strategies.find(s => s.strategy === 'NO_TRADE');

  return (
    <div className="space-y-6">
      {/* Market Context Bar */}
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider font-semibold">Market Context</span>
          <Stat label="SPX" value={`$${marketContext.spxPrice?.toLocaleString()}`} />
          <Stat label="VIX" value={marketContext.vix?.toFixed(2)} color={marketContext.vix > 25 ? 'text-red-400' : marketContext.vix > 18 ? 'text-yellow-400' : 'text-green-400'} />
          <Stat label="IV Rank" value={`${marketContext.ivRank?.toFixed(0)}%`} />
          <Stat label="Regime" value={marketContext.marketRegime?.replace(/_/g, ' ')} />
          <Stat label="Bias" value={marketContext.directionalBias} />
          <Stat label="IV/RV" value={`${(marketContext.impliedVol * 100).toFixed(1)}% / ${(marketContext.realizedVol * 100).toFixed(1)}%`} />
          {noTrade && recommended === 'NO_TRADE' && (
            <Badge variant="warning" className="ml-auto">STANDING ASIDE</Badge>
          )}
          {recommended !== 'NO_TRADE' && (
            <Badge variant="success" className="ml-auto">MARKET TRADEABLE</Badge>
          )}
        </div>
      </div>

      {/* Strategy Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {tradeableStrategies.map(s => (
          <StrategyCardView
            key={s.strategy}
            card={s}
            onSelect={onSelectStrategy}
          />
        ))}
      </div>

      {/* Comparison Table */}
      <ComparisonTable strategies={tradeableStrategies} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Individual Strategy Card
// ─────────────────────────────────────────────
function StrategyCardView({ card, onSelect }: { card: StrategyCard; onSelect?: (s: StrategyCard) => void }) {
  const rec = card.recommendation;
  const isNoTrade = rec.tradeType === 'no_trade';
  const popColor = rec.probOfProfit >= 0.88 ? 'text-green-400' : rec.probOfProfit >= 0.80 ? 'text-yellow-400' : 'text-red-400';
  const evColor = rec.expectedValue > 0 ? 'text-green-400' : 'text-red-400';
  const confColor = rec.confidence === 'high' ? 'border-green-700/50' : rec.confidence === 'medium' ? 'border-yellow-700/50' : 'border-gray-700/40';

  return (
    <Card className={`border ${card.isRecommended ? 'border-blue-600/60 ring-1 ring-blue-600/20' : confColor} relative flex flex-col`}>
      {card.isRecommended && (
        <div className="absolute -top-px left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{card.displayName}</CardTitle>
              {card.isRecommended && <Badge variant="success">RECOMMENDED</Badge>}
              {!card.isViable && !isNoTrade && <Badge variant="danger">NOT VIABLE</Badge>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{card.tagline}</div>
          </div>
          <Badge variant={rec.confidence === 'high' ? 'success' : rec.confidence === 'medium' ? 'warning' : 'danger'}>
            {rec.confidence?.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Entry / Timing */}
        <div className={`rounded-lg p-3 ${card.inEntryWindow ? 'bg-green-500/10 border border-green-500/20' : 'bg-gray-800/40 border border-gray-700/30'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Entry Window</span>
            {card.inEntryWindow ? (
              <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
                NOW OPEN
              </span>
            ) : (
              <span className="text-xs text-gray-500">Outside window</span>
            )}
          </div>
          <div className="text-sm text-white">{card.entryWindow}</div>
        </div>

        {/* Key Metrics */}
        {!isNoTrade ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <MiniMetric label="POP" value={formatPercent(rec.probOfProfit)} valueClass={popColor} />
              <MiniMetric label="Credit" value={`$${rec.credit?.toFixed(2)}`} valueClass="text-white" />
              <MiniMetric label="EV" value={`$${rec.expectedValue?.toFixed(2)}`} valueClass={evColor} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniMetric label="Max Profit" value={formatCurrency(rec.maxProfit)} valueClass="text-green-400" />
              <MiniMetric label="Max Loss" value={formatCurrency(-rec.maxLoss)} valueClass="text-red-400" />
              <MiniMetric label="Kelly" value={formatPercent(rec.kellySize)} valueClass="text-blue-400" />
            </div>

            {/* Trade Structure Summary */}
            <div className="bg-gray-800/40 rounded-lg p-3 space-y-1.5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Structure</div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Type</span>
                <span className="text-white capitalize">{rec.tradeType?.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">DTE</span>
                <span className="text-white">{rec.daysToExpiry === 0 ? '0-DTE (intraday)' : `${rec.daysToExpiry} days`}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Expiry</span>
                <span className="text-white font-mono">{rec.expiryDate}</span>
              </div>
              {rec.shortLeg && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Short Strike</span>
                  <span className="text-red-400 font-mono">{rec.shortLeg.strike} {rec.shortLeg.optionType?.toUpperCase()} (Δ{rec.shortLeg.delta?.toFixed(2)})</span>
                </div>
              )}
              {rec.longLeg && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Long Strike</span>
                  <span className="text-green-400 font-mono">{rec.longLeg.strike} {rec.longLeg.optionType?.toUpperCase()} (Δ{rec.longLeg.delta?.toFixed(2)})</span>
                </div>
              )}
            </div>

            {/* Exit Rules */}
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Exit Rules</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-center">
                  <div className="text-xs text-green-400 font-semibold">Take Profit</div>
                  <div className="text-xs font-mono text-white mt-0.5">${rec.profitTarget?.toFixed(2)}</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-center">
                  <div className="text-xs text-red-400 font-semibold">Stop Loss</div>
                  <div className="text-xs font-mono text-white mt-0.5">${rec.stopLoss?.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Strategy-level exit rules */}
            {card.exitRules.length > 0 && (
              <div className="space-y-1">
                {card.exitRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                    <span className="text-gray-600 mt-0.5 shrink-0">›</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Ideal conditions */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-600">VIX {card.idealVIXRange.min}–{card.idealVIXRange.max}</span>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-600">{card.typicalDTE.min}–{card.typicalDTE.max} DTE</span>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-600 capitalize">{card.riskProfile}</span>
            </div>
          </>
        ) : (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-center">
            <div className="text-2xl mb-1">⛔</div>
            <div className="text-yellow-400 font-semibold text-sm">Standing Aside</div>
            <div className="text-xs text-gray-500 mt-1">Macro event day — per SOP Rule 3</div>
          </div>
        )}

        {/* Warnings */}
        {rec.warnings?.length > 0 && (
          <div className="space-y-1">
            {rec.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1.5">
                <span>⚠</span><span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Analysis bullets */}
        {rec.conditions?.length > 0 && (
          <div className="space-y-1">
            {rec.conditions.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                <span className="text-blue-500 mt-0.5 shrink-0">›</span><span>{c}</span>
              </div>
            ))}
          </div>
        )}

        {/* Select Button */}
        {onSelect && !isNoTrade && card.isViable && (
          <button
            onClick={() => onSelect(card)}
            className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-auto ${
              card.isRecommended
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
            }`}
          >
            {card.isRecommended ? 'Use This Strategy (Recommended)' : 'Use This Strategy'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Comparison Table
// ─────────────────────────────────────────────
function ComparisonTable({ strategies }: { strategies: StrategyCard[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 px-4 py-3 font-medium w-36">Metric</th>
                {strategies.map(s => (
                  <th key={s.strategy} className="text-center px-4 py-3 font-medium">
                    <div className="text-white">{s.displayName}</div>
                    {s.isRecommended && <div className="text-blue-400 text-xs font-normal">★ Recommended</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              <CompRow label="Confidence" values={strategies.map(s => (
                <Badge key={s.strategy} variant={s.recommendation.confidence === 'high' ? 'success' : s.recommendation.confidence === 'medium' ? 'warning' : 'danger'}>
                  {s.recommendation.confidence?.toUpperCase()}
                </Badge>
              ))} />
              <CompRow label="Viable Now" values={strategies.map(s => (
                <span key={s.strategy} className={s.isViable ? 'text-green-400' : 'text-red-400'}>
                  {s.isViable ? '✓ Yes' : '✗ No'}
                </span>
              ))} />
              <CompRow label="Entry Window" values={strategies.map(s => (
                <span key={s.strategy} className={s.inEntryWindow ? 'text-green-400' : 'text-gray-500'}>
                  {s.inEntryWindow ? '● Open' : '○ Closed'}
                </span>
              ))} />
              <CompRow label="POP" values={strategies.map(s => (
                <span key={s.strategy} className={s.recommendation.probOfProfit >= 0.88 ? 'text-green-400' : s.recommendation.probOfProfit >= 0.80 ? 'text-yellow-400' : 'text-red-400'}>
                  {formatPercent(s.recommendation.probOfProfit)}
                </span>
              ))} />
              <CompRow label="Credit" values={strategies.map(s => (
                <span key={s.strategy} className="text-white font-mono">${s.recommendation.credit?.toFixed(2)}</span>
              ))} />
              <CompRow label="Max Profit" values={strategies.map(s => (
                <span key={s.strategy} className="text-green-400 font-mono">{formatCurrency(s.recommendation.maxProfit)}</span>
              ))} />
              <CompRow label="Max Loss" values={strategies.map(s => (
                <span key={s.strategy} className="text-red-400 font-mono">{formatCurrency(-s.recommendation.maxLoss)}</span>
              ))} />
              <CompRow label="Exp. Value" values={strategies.map(s => (
                <span key={s.strategy} className={s.recommendation.expectedValue > 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                  ${s.recommendation.expectedValue?.toFixed(2)}
                </span>
              ))} />
              <CompRow label="P. Touch" values={strategies.map(s => (
                <span key={s.strategy} className="text-orange-400">{formatPercent(s.recommendation.probOfTouch)}</span>
              ))} />
              <CompRow label="Kelly Size" values={strategies.map(s => (
                <span key={s.strategy} className="text-blue-400">{formatPercent(s.recommendation.kellySize)}</span>
              ))} />
              <CompRow label="DTE" values={strategies.map(s => (
                <span key={s.strategy} className="text-gray-300">
                  {s.recommendation.daysToExpiry === 0 ? '0 (intraday)' : s.recommendation.daysToExpiry}
                </span>
              ))} />
              <CompRow label="VIX Range" values={strategies.map(s => (
                <span key={s.strategy} className="text-gray-400">{s.idealVIXRange.min}–{s.idealVIXRange.max}</span>
              ))} />
              <CompRow label="Risk Profile" values={strategies.map(s => (
                <span key={s.strategy} className="text-gray-400 capitalize">{s.riskProfile}</span>
              ))} />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CompRow({ label, values }: { label: string; values: React.ReactNode[] }) {
  return (
    <tr className="hover:bg-gray-800/20 transition-colors">
      <td className="px-4 py-2.5 text-gray-500 font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-2.5 text-center">{v}</td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${color ?? 'text-gray-300'}`}>{value}</span>
    </div>
  );
}

function MiniMetric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-800/40 rounded p-2 text-center">
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${valueClass ?? 'text-white'}`}>{value}</div>
    </div>
  );
}
