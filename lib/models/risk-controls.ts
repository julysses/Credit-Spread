import type { MarketConditions, TradeRecommendation } from './strategy-engine';

export type DataConfidence = 'live' | 'delayed' | 'derived' | 'synthetic' | 'unavailable' | 'invalid' | 'mock';

export interface DataQuality {
  confidence: DataConfidence;
  warnings: string[];
  sources: Record<string, string>;
  tradeable: boolean;
  missingSources: string[];
}

export function buildDataQuality(sources: Record<string, string | undefined>, useMock = false): DataQuality {
  const normalized = Object.fromEntries(
    Object.entries(sources).map(([k, v]) => [k, v ?? 'unknown'])
  );
  const values = Object.values(normalized).map(v => v.toLowerCase());
  const warnings: string[] = [];
  const missingSources: string[] = [];

  let confidence: DataConfidence = 'live';
  if (useMock || values.some(v => v.includes('mock'))) confidence = 'mock';
  else if (values.some(v => v.includes('unavailable') || v.includes('missing') || v.includes('unknown'))) confidence = 'unavailable';
  else if (values.some(v => v.includes('hardcoded') || v.includes('fallback'))) confidence = 'invalid';
  else if (values.some(v => v.includes('derived') || v.includes('synthetic') || v.includes('estimate'))) confidence = 'derived';
  else if (values.some(v => v.includes('delayed') || v.includes('yahoo') || v.includes('alpha'))) confidence = 'delayed';

  for (const [key, value] of Object.entries(normalized)) {
    if (/mock|hardcoded|fallback|derived|synthetic|estimate|unknown|unavailable|missing/i.test(value)) {
      warnings.push(`${key.toUpperCase()} source is ${value}`);
    }
    if (/unknown|unavailable|missing|mock|hardcoded/i.test(value)) {
      missingSources.push(key);
    }
  }

  const tradeable = !useMock
    && confidence !== 'mock'
    && confidence !== 'invalid'
    && confidence !== 'unavailable'
    && !missingSources.includes('optionChain')
    && !missingSources.includes('spx')
    && !missingSources.includes('vix');

  return { confidence, warnings, sources: normalized, tradeable, missingSources };
}

export function buildUnavailableDataQuality(sources: Record<string, string | undefined>, missingSources: string[], warnings: string[] = []): DataQuality {
  const normalized = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v ?? 'unknown']));
  return {
    confidence: 'unavailable',
    warnings: [...warnings, ...missingSources.map(source => `${source.toUpperCase()} unavailable`)],
    sources: normalized,
    tradeable: false,
    missingSources,
  };
}

export function buildExitPlan(
  spreadType: 'put' | 'call',
  breakeven: number,
  profitTarget: number,
  stopLoss: number,
  daysToExpiry: number,
  conditions: MarketConditions
): TradeRecommendation['exitPlan'] {
  const technicalStop = spreadType === 'put'
    ? `Exit if SPX closes below ${breakeven.toFixed(0)} or short-put support fails.`
    : `Exit if SPX closes above ${breakeven.toFixed(0)} or short-call resistance fails.`;

  return {
    profitTarget: `Buy back around $${profitTarget.toFixed(2)} debit, roughly 50% of credit captured.`,
    stopLoss: `Buy back around $${stopLoss.toFixed(2)} debit, or earlier if the thesis breaks.`,
    technicalStop,
    timeStop: daysToExpiry <= 1 ? 'Close before 3:30 PM ET. Do not carry unmanaged 0DTE gamma into the close.' : 'Reassess daily. Close before expiry week if risk/reward deteriorates.',
    eventStop: conditions.isMacroEventDay ? 'No entry while macro event risk is active.' : 'Exit or stand down before CPI, FOMC, NFP, or unscheduled shock risk.',
    invalidation: `Invalid if VIX spikes above ${(conditions.vix * 1.15).toFixed(1)}, data confidence drops, or directional bias flips from ${conditions.directionalBias}.`,
  };
}

export function getDecisionLabel(status?: TradeRecommendation['decisionStatus']): string {
  if (status === 'trade_approved') return 'TRADE APPROVED';
  if (status === 'watch_only') return 'WATCH ONLY';
  if (status === 'data_invalid') return 'DATA INVALID';
  return 'NO TRADE';
}
