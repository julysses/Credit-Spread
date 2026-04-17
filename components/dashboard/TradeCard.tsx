'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent, strategyLabel, getConfidenceColor } from '@/lib/utils';

interface SpreadLeg {
  strike: number;
  optionType: string;
  action: string;
  delta: number;
  premium: number;
}

interface NoTradeEvent {
  name: string;
  description?: string;
  scheduledTime?: string;
  sources: { headline: string; url: string; source?: string }[];
}

interface TradeCardProps {
  strategy: string;
  tradeType: string;
  shortLeg: SpreadLeg | null;
  longLeg: SpreadLeg | null;
  shortLeg2?: SpreadLeg | null;
  longLeg2?: SpreadLeg | null;
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
  noTradeEvent?: NoTradeEvent;
  onAcceptTrade?: () => void;
}

export function TradeCard({
  strategy,
  tradeType,
  shortLeg,
  longLeg,
  shortLeg2,
  longLeg2,
  credit,
  maxProfit,
  maxLoss,
  probOfProfit,
  probOfTouch,
  expectedValue,
  kellySize,
  profitTarget,
  stopLoss,
  daysToExpiry,
  expiryDate,
  confidence,
  warnings,
  conditions,
  noTradeEvent,
  onAcceptTrade,
}: TradeCardProps) {
  if (tradeType === 'no_trade') {
    const eventName     = noTradeEvent?.name          ?? 'Macro Event';
    const description   = noTradeEvent?.description   ?? '';
    const scheduledTime = noTradeEvent?.scheduledTime  ?? 'Today';
    const sources       = noTradeEvent?.sources        ?? [];

    return (
      <Card className="border-yellow-800/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trade Recommendation</CardTitle>
            <Badge variant="warning">NO TRADE</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-center">
            <div className="text-3xl mb-2">⛔</div>
            <div className="text-yellow-400 font-semibold text-lg">Standing Aside</div>
            <div className="text-sm text-gray-300 mt-1 font-medium">{eventName}</div>
            <div className="text-xs text-gray-500 mt-0.5">per institutional SOP Rule 3</div>
            <div className="flex items-center justify-center gap-1 mt-2 text-xs text-yellow-300/80 font-medium">
              <span>🕐</span>
              <span>{scheduledTime}</span>
            </div>
            {description && (
              <div className="mt-2 text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                {description}
              </div>
            )}
          </div>

          {sources.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Triggering News</div>
              <div className="space-y-2">
                {sources.map((s, i) => (
                  s.url && s.url !== '#'
                    ? (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-800/30 rounded px-3 py-2 transition-colors"
                      >
                        <span className="mt-0.5 shrink-0">📰</span>
                        <span className="flex-1 line-clamp-2">{s.headline}</span>
                        <span className="shrink-0 flex flex-col items-end gap-0.5">
                          {s.source && <span className="text-gray-500">{s.source}</span>}
                          <span className="text-gray-600">↗</span>
                        </span>
                      </a>
                    )
                    : (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/40 rounded px-3 py-2">
                        <span className="mt-0.5 shrink-0">📰</span>
                        <span className="flex-1 line-clamp-2">{s.headline}</span>
                        {s.source && <span className="shrink-0 text-gray-600">{s.source}</span>}
                      </div>
                    )
                ))}
              </div>
            </div>
          )}

          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-yellow-400 bg-yellow-500/10 rounded px-3 py-2">{w}</div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const isIronCondor = tradeType === 'iron_condor';
  const popColor = probOfProfit >= 0.88 ? 'text-green-400' : probOfProfit >= 0.80 ? 'text-yellow-400' : 'text-red-400';
  const evColor = expectedValue > 0 ? 'text-green-400' : 'text-red-400';

  return (
    <Card className={`border ${confidence === 'high' ? 'border-green-800/40' : confidence === 'medium' ? 'border-yellow-800/40' : 'border-gray-800/40'}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{strategyLabel(strategy)}</CardTitle>
            <div className="text-xs text-gray-500 mt-0.5 capitalize">
              {tradeType.replace(/_/g, ' ')} · {daysToExpiry === 0 ? 'Intraday' : `${daysToExpiry} DTE`} · Exp {expiryDate}
            </div>
          </div>
          <Badge variant={confidence === 'high' ? 'success' : confidence === 'medium' ? 'warning' : 'danger'}>
            {confidence.toUpperCase()} CONFIDENCE
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Trade Structure */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Trade Structure</div>

          {/* Put spread or call spread */}
          {shortLeg && (
            <TradeLegRow
              action="SELL"
              strike={shortLeg.strike}
              type={shortLeg.optionType.toUpperCase()}
              delta={shortLeg.delta}
              premium={shortLeg.premium}
              color="text-red-400"
            />
          )}
          {longLeg && (
            <TradeLegRow
              action="BUY"
              strike={longLeg.strike}
              type={longLeg.optionType.toUpperCase()}
              delta={longLeg.delta}
              premium={longLeg.premium}
              color="text-green-400"
            />
          )}

          {/* Iron condor second side */}
          {isIronCondor && shortLeg2 && longLeg2 && (
            <>
              <div className="border-t border-gray-700/50 my-1" />
              <TradeLegRow
                action="SELL"
                strike={shortLeg2.strike}
                type={shortLeg2.optionType.toUpperCase()}
                delta={shortLeg2.delta}
                premium={shortLeg2.premium}
                color="text-red-400"
              />
              <TradeLegRow
                action="BUY"
                strike={longLeg2.strike}
                type={longLeg2.optionType.toUpperCase()}
                delta={longLeg2.delta}
                premium={longLeg2.premium}
                color="text-green-400"
              />
            </>
          )}

          <div className="border-t border-gray-700/50 mt-2 pt-2 flex justify-between items-center">
            <span className="text-sm text-gray-400">Net Credit</span>
            <span className="text-lg font-bold font-mono text-white">${credit.toFixed(2)}</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <MetricBox label="POP" value={formatPercent(probOfProfit)} sub="Monte Carlo" valueClass={popColor} />
          <MetricBox label="Max Profit" value={formatCurrency(maxProfit)} sub="Per contract" valueClass="text-green-400" />
          <MetricBox label="Max Loss" value={formatCurrency(-maxLoss)} sub="Per contract" valueClass="text-red-400" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MetricBox label="Exp. Value" value={`$${expectedValue.toFixed(2)}`} sub="Per share" valueClass={evColor} />
          <MetricBox label="P. Touch" value={formatPercent(probOfTouch)} sub="Strike" valueClass="text-orange-400" />
          <MetricBox label="Kelly Size" value={formatPercent(kellySize)} sub="Capital" valueClass="text-blue-400" />
        </div>

        {/* Exit Rules */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <div className="text-xs text-green-400 font-semibold mb-1">✓ Profit Target</div>
            <div className="text-sm font-mono text-white">Close at ${profitTarget.toFixed(2)}</div>
            <div className="text-xs text-gray-500">50% of credit</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-xs text-red-400 font-semibold mb-1">✗ Stop Loss</div>
            <div className="text-sm font-mono text-white">Exit at ${stopLoss.toFixed(2)}</div>
            <div className="text-xs text-gray-500">2.2× credit</div>
          </div>
        </div>

        {/* Rationale */}
        {conditions.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Analysis</div>
            <div className="space-y-1">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="text-blue-400 mt-0.5">›</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 rounded px-3 py-2">
                <span>⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Accept Button */}
        {onAcceptTrade && (
          <button
            onClick={onAcceptTrade}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Log Trade
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function TradeLegRow({ action, strike, type, delta, premium, color }: {
  action: string;
  strike: number;
  type: string;
  delta: number;
  premium: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-3">
        <span className={`text-xs font-bold w-8 ${color}`}>{action}</span>
        <span className="font-mono text-white font-semibold">{strike}</span>
        <span className="text-gray-400 text-sm">{type}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>Δ {delta.toFixed(2)}</span>
        <span className="font-mono text-gray-300">${premium.toFixed(2)}</span>
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub, valueClass }: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${valueClass || 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600">{sub}</div>}
    </div>
  );
}
