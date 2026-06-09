'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { strategyLabel } from '@/lib/utils';

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
  decisionStatus?: 'trade_approved' | 'watch_only' | 'no_trade' | 'data_invalid';
  dataConfidence?: string;
  creditToWidth?: number;
  breakeven?: number;
  exitPlan?: {
    profitTarget: string;
    stopLoss: string;
    technicalStop: string;
    timeStop: string;
    eventStop: string;
    invalidation: string;
  };
  kellySize: number;
  profitTarget: number;
  stopLoss: number;
  daysToExpiry: number;
  expiryDate: string;
  confidence: string;
  warnings: string[];
  conditions: string[];
  noTradeEvent?: NoTradeEvent;
  providerMode?: string;
  tradeInstrument?: string | null;
  optionChainSource?: string;
  onAcceptTrade?: () => void;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  );
}
function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

function confVal(c: string) {
  if (c === 'high') return 87;
  if (c === 'medium') return 71;
  return 47;
}
function confVariant(c: string): 'success' | 'warning' | 'danger' {
  if (c === 'high') return 'success';
  if (c === 'medium') return 'warning';
  return 'danger';
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
  decisionStatus,
  dataConfidence,
  creditToWidth,
  breakeven,
  exitPlan,
  kellySize,
  profitTarget,
  stopLoss,
  daysToExpiry,
  expiryDate,
  confidence,
  warnings,
  conditions,
  noTradeEvent,
  providerMode,
  tradeInstrument,
  optionChainSource,
  onAcceptTrade,
}: TradeCardProps) {
  const [expanded, setExpanded] = useState(true);

  // ── Mock-data state ──
  if (dataConfidence === 'mock') {
    return (
      <Card className="overflow-hidden border-2 border-red-500/60">
        <div className="px-6 sm:px-8 py-8 sm:py-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-red-500 bg-red-500/10 mb-4 sm:mb-5">
            <WarnIcon className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />
          </div>
          <Badge variant="danger" className="mb-3">MOCK DATA · PAPER ONLY</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-red-100 tracking-tight mt-2">Live Market Data Unavailable</h2>
          <p className="mt-2 text-gray-400 max-w-xl mx-auto leading-relaxed text-[13px]">
            This setup is based on mock or fallback inputs. Do not place live orders until the data feed is restored and the trade is recalculated from live quotes.
          </p>
          <div className="mt-2 font-mono text-[11px] text-red-500/80 uppercase tracking-wider">DATA CONFIDENCE · MOCK</div>
        </div>

        {warnings.length > 0 && (
          <div className="border-t-2 border-red-500/40 px-5 pb-4 space-y-1.5 pt-4">
            {warnings.map((w, i) => (
              <div key={i} className="text-[12px] text-red-300 bg-red-500/10 rounded px-3 py-2">⚠ {w}</div>
            ))}
          </div>
        )}

        <div className="px-6 py-3 border-t-2 border-red-500/40 bg-red-500/5 flex items-center justify-between">
          <div className="text-[11px] text-red-500/90 font-mono uppercase tracking-wider">
            LIVE TRADING BLOCKED · VERIFY DATA FEEDS BEFORE ENTRY
          </div>
        </div>
      </Card>
    );
  }

  // ── Data-invalid state ──
  if (decisionStatus === 'data_invalid' || dataConfidence === 'invalid') {
    return (
      <Card className="overflow-hidden border-2 border-red-500/60">
        <div className="px-6 sm:px-8 py-8 sm:py-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-red-500 bg-red-500/10 mb-4 sm:mb-5">
            <WarnIcon className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />
          </div>
          <Badge variant="danger" className="mb-3">DATA INVALID · NO TRADE</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-red-100 tracking-tight mt-2">Trade Recommendation Blocked</h2>
          <p className="mt-2 text-gray-400 max-w-xl mx-auto leading-relaxed text-[13px]">
            Required market inputs failed validation. The risk model cannot support a live spread recommendation until the invalid data is corrected.
          </p>
          <div className="mt-2 font-mono text-[11px] text-red-500/80 uppercase tracking-wider">DATA CONFIDENCE · INVALID</div>
        </div>

        {warnings.length > 0 && (
          <div className="border-t-2 border-red-500/40 px-5 pb-4 space-y-1.5 pt-4">
            {warnings.map((w, i) => (
              <div key={i} className="text-[12px] text-red-300 bg-red-500/10 rounded px-3 py-2">⚠ {w}</div>
            ))}
          </div>
        )}

        <div className="px-6 py-3 border-t-2 border-red-500/40 bg-red-500/5 flex items-center justify-between">
          <div className="text-[11px] text-red-500/90 font-mono uppercase tracking-wider">
            STANDING ASIDE · DATA QUALITY HARD BLOCK
          </div>
        </div>
      </Card>
    );
  }

  // ── No-trade state ──
  if (tradeType === 'no_trade') {
    const eventName = noTradeEvent?.name ?? 'Macro Event';
    const description = noTradeEvent?.description ?? '';
    const scheduledTime = noTradeEvent?.scheduledTime ?? 'Today';
    const sources = noTradeEvent?.sources ?? [];

    return (
      <Card className="overflow-hidden border-2 border-yellow-500/60 hatch-warn">
        <div className="px-6 sm:px-8 py-8 sm:py-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-yellow-500 bg-yellow-500/10 mb-4 sm:mb-5">
            <WarnIcon className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-400" />
          </div>
          <Badge variant="warning" className="mb-3">NO TRADE · STAND DOWN</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-yellow-100 tracking-tight mt-2">{eventName}</h2>
          {description && (
            <p className="mt-2 text-gray-400 max-w-xl mx-auto leading-relaxed text-[13px]">{description}</p>
          )}
          {scheduledTime && (
            <div className="mt-2 font-mono text-[11px] text-yellow-500/80 uppercase tracking-wider">{scheduledTime}</div>
          )}
        </div>

        {sources.length > 0 && (
          <div className="border-t-2 border-yellow-500/40 px-5 py-4 space-y-2">
            <div className="text-[10px] text-yellow-500/80 uppercase tracking-[0.14em] mb-2">TRIGGERING NEWS</div>
            {sources.slice(0, 3).map((s, i) =>
              s.url && s.url !== '#' ? (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-2 text-[12px] text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-800/30 rounded px-3 py-2 transition-colors">
                  <span className="flex-1 line-clamp-2">{s.headline}</span>
                  <ArrowIcon className="w-3 h-3 shrink-0 mt-0.5" />
                </a>
              ) : (
                <div key={i} className="text-[12px] text-gray-400 bg-gray-800/40 rounded px-3 py-2 line-clamp-2">
                  {s.headline}
                </div>
              )
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="border-t-2 border-yellow-500/40 px-5 pb-4 space-y-1.5 pt-4">
            {warnings.map((w, i) => (
              <div key={i} className="text-[12px] text-yellow-400 bg-yellow-500/10 rounded px-3 py-2">⚠ {w}</div>
            ))}
          </div>
        )}

        <div className="px-6 py-3 border-t-2 border-yellow-500/40 bg-yellow-500/5 flex items-center justify-between">
          <div className="text-[11px] text-yellow-500/90 font-mono uppercase tracking-wider">
            STANDING ASIDE · INSTITUTIONAL SOP RULE 3
          </div>
        </div>
      </Card>
    );
  }

  const isCondor = tradeType === 'iron_condor';
  const cv = confVal(confidence);
  const pop = Math.round(probOfProfit * 100);
  const popTone = pop >= 70 ? 'text-green-400' : pop >= 60 ? 'text-yellow-400' : 'text-red-400';
  const evTone = expectedValue > 0 ? 'text-green-400' : 'text-red-400';
  const tradeName = strategyLabel(strategy).toUpperCase();
  const bias = tradeType.includes('put') ? 'NEUTRAL → BULLISH' : tradeType.includes('call') ? 'NEUTRAL → BEARISH' : 'NEUTRAL';
  const expLabel = daysToExpiry === 0 ? 'INTRADAY' : `${daysToExpiry} DTE · Exp ${expiryDate}`;
  const statusLabel = decisionStatus === 'trade_approved' ? 'TRADE APPROVED' : decisionStatus === 'watch_only' ? 'WATCH ONLY' : 'NO TRADE';
  const statusVariant = decisionStatus === 'trade_approved' ? 'success' : decisionStatus === 'watch_only' ? 'warning' : 'outline';
  const dataVariant = dataConfidence === 'live' ? 'success' : dataConfidence === 'invalid' || dataConfidence === 'mock' ? 'danger' : 'warning';

  const legs = [
    ...(shortLeg ? [{ action: 'SELL', type: shortLeg.optionType.toUpperCase(), strike: shortLeg.strike, delta: shortLeg.delta, px: shortLeg.premium }] : []),
    ...(longLeg  ? [{ action: 'BUY',  type: longLeg.optionType.toUpperCase(),  strike: longLeg.strike,  delta: longLeg.delta,  px: longLeg.premium  }] : []),
    ...(isCondor && shortLeg2 ? [{ action: 'SELL', type: shortLeg2.optionType.toUpperCase(), strike: shortLeg2.strike, delta: shortLeg2.delta, px: shortLeg2.premium }] : []),
    ...(isCondor && longLeg2  ? [{ action: 'BUY',  type: longLeg2.optionType.toUpperCase(),  strike: longLeg2.strike,  delta: longLeg2.delta,  px: longLeg2.premium  }] : []),
  ];

  return (
    <Card className="overflow-hidden">
      {/* Confidence strip */}
      <div className="relative h-1 bg-sd-muted">
        <div className="absolute left-0 top-0 h-full bg-sd-accent transition-all" style={{ width: `${cv}%` }} />
      </div>

      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              <Badge variant={dataVariant}>DATA · {(dataConfidence ?? 'LIVE').toUpperCase()}</Badge>
              {providerMode && (
                <Badge variant={providerMode === 'spy_free' ? 'warning' : providerMode === 'spx_pro' ? 'success' : 'outline'}>
                  {providerMode === 'spy_free' ? 'SPY FREE' : providerMode === 'spx_pro' ? 'SPX PRO' : 'ANALYTICS'}
                </Badge>
              )}
              <Badge variant="outline" className="hidden sm:inline-flex">{expLabel}</Badge>
            </div>
            <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-gray-100 leading-tight">{tradeName}</h2>
            <div className="mt-1 text-[11px] sm:text-[12px] text-gray-400 font-mono uppercase tracking-wider">
              {bias} · {daysToExpiry} DTE HORIZON{tradeInstrument ? ` · ${tradeInstrument}` : ''}
            </div>
            {optionChainSource && (
              <div className="mt-1 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                OPTIONS SOURCE · {optionChainSource}
              </div>
            )}
          </div>

          {/* Confidence dial */}
          <div className="flex flex-col items-end shrink-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.18em]">CONFIDENCE</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="slab text-3xl sm:text-4xl text-gray-100 tabular-nums">{cv}</span>
              <span className="text-xs text-gray-500 font-mono">/100</span>
            </div>
            <Badge variant={confVariant(confidence)} className="mt-1">{confidence.toUpperCase()}</Badge>
          </div>
        </div>
      </div>

      {providerMode === 'spy_free' && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-[12px] text-yellow-200 leading-relaxed">
          <strong>SPY Free Live Mode.</strong> Signal context remains SPX/VIX, but the trade instrument is SPY using Yahoo option-chain data. SPY options are not Section 1256, are American-style, physically settled, and carry assignment risk. Close before expiration.
        </div>
      )}

      {/* Primary metrics row */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 border-t border-sd-line divide-x divide-sd-line">
        <NumCell label="PROB. OF PROFIT" value={`${pop}%`} sub={`Touch ${(probOfTouch * 100).toFixed(0)}%`} tone={popTone} />
        <NumCell label="EXPECTED VALUE" value={`$${expectedValue.toFixed(2)}`} sub="model EV per spread" tone={evTone} />
        <NumCell label="CREDIT / WIDTH" value={`${((creditToWidth ?? 0) * 100).toFixed(1)}%`} sub={breakeven ? `BE ${breakeven.toFixed(0)}` : 'payoff quality'} tone={(creditToWidth ?? 0) >= 0.12 ? 'text-green-400' : 'text-yellow-400'} />
        <NumCell label="MAX WIN" value={`$${maxProfit.toFixed(0)}`} sub={`Credit $${credit.toFixed(2)}`} tone="text-green-400" />
        <NumCell label="MAX LOSS" value={`−$${maxLoss.toFixed(0)}`} sub="true risk per spread" tone="text-red-400" />
      </div>

      {/* Structure */}
      {legs.length > 0 && (
        <div className="px-4 sm:px-6 py-5 border-t border-sd-line bg-sd-muted/30">
          <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-3">STRUCTURE</div>
          <div className={`grid gap-2 ${legs.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {legs.map((l, i) => (
              <div key={i} className="bg-sd-card border border-sd-line rounded-lg px-3 sm:px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={l.action === 'SELL' ? 'danger' : 'success'}>{l.action}</Badge>
                  <span className="text-[10px] text-gray-500 font-mono">Δ{l.delta.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">{l.type} · STRIKE</div>
                <div className="slab text-lg sm:text-xl text-gray-100 tabular-nums">{l.strike}</div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">@ ${l.px.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 sm:px-6 py-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-200 hover:bg-sd-muted/40 border-t border-sd-line transition-colors"
      >
        <span>{expanded ? 'Hide' : 'Show'} analysis · exit rules · rationale</span>
        <ChevronIcon className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Accordion */}
      {expanded && (
        <div className="accordion-open">
          {/* Why + Risks */}
          {conditions.length > 0 && (
            <div className="px-4 sm:px-6 py-5 border-t border-sd-line grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-3">WHY THIS TRADE</div>
                <ul className="space-y-2">
                  {conditions.map((c, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px] text-gray-300 leading-relaxed">
                      <span className="text-sd-accent mt-1.5 text-[9px] shrink-0">■</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {warnings.length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-3">KEY RISKS</div>
                  <ul className="space-y-2">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex gap-2.5 text-[12.5px] text-gray-300 leading-relaxed">
                        <span className="text-yellow-400 mt-1.5 text-[9px] shrink-0">▲</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Exit rules */}
          <div className="px-4 sm:px-6 py-5 border-t border-sd-line">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-3">EXIT RULES</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ExitRule tone="green" title="Profit Target" text={exitPlan?.profitTarget ?? `Buy back near $${profitTarget.toFixed(2)}`} />
              <ExitRule tone="red" title="Stop Loss" text={exitPlan?.stopLoss ?? `Exit near $${stopLoss.toFixed(2)}`} />
              <ExitRule tone="yellow" title="Technical Stop" text={exitPlan?.technicalStop ?? 'Exit if price violates the short strike thesis.'} />
              <ExitRule tone="blue" title="Time / Event Stop" text={`${exitPlan?.timeStop ?? 'Reassess before close.'} ${exitPlan?.eventStop ?? ''}`} />
            </div>
            {exitPlan?.invalidation && (
              <div className="mt-3 text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                <span className="font-semibold uppercase tracking-wider text-[10px] block mb-1">Invalidation</span>
                {exitPlan.invalidation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA footer */}
      <div className="px-4 sm:px-6 py-4 border-t border-sd-line bg-sd-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 sm:gap-5 text-[11px] text-gray-500 font-mono">
          <div><span className="text-gray-600">CREDIT</span> <span className="text-gray-200">${credit.toFixed(2)}</span></div>
          <div><span className="text-gray-600">TARGET</span> <span className="text-gray-200">${profitTarget.toFixed(2)}</span></div>
          <div><span className="text-gray-600">STOP</span> <span className="text-gray-200">${stopLoss.toFixed(2)}</span></div>
        </div>
        <div className="flex items-center gap-2">
          {onAcceptTrade && (
            <button
              onClick={onAcceptTrade}
              className="px-4 sm:px-5 py-2 text-[11px] font-semibold uppercase tracking-wider rounded bg-sd-accent text-white hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              Log Trade <ArrowIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ExitRule({ tone, title, text }: { tone: 'green' | 'red' | 'yellow' | 'blue'; title: string; text: string }) {
  const styles = {
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  }[tone];
  return (
    <div className={`border rounded-lg px-4 py-3 ${styles}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1">{title}</div>
      <div className="text-[12px] text-gray-200 leading-relaxed">{text}</div>
    </div>
  );
}

function NumCell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="px-3 sm:px-5 py-4">
      <div className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-1.5">{label}</div>
      <div className={`slab text-lg sm:text-2xl tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">{sub}</div>
    </div>
  );
}
