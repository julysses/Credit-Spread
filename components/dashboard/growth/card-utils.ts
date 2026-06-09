export interface EnrichedGrowthCandidate {
  id: number;
  symbol: string;
  companyName?: string;
  sector?: string;
  compositeScore?: number;
  momentumScore?: number;
  growthScore?: number;
  valueScore?: number;
  institutionalScore?: number;
  optionsFlowScore?: number;
  convictionScore?: number;
  price?: string | number;
  currentPrice?: string | number;
  currentPriceChangePct?: string | number;
  currentPriceStatus?: string;
  currentPriceProvider?: string;
  currentPriceAsOf?: string;
  priceChangePct?: string | number;
  priceStatus?: string;
  priceProvider?: string;
  priceAsOf?: string;
  scanPrice?: string | number;
  entryPrice?: string | number;
  entryReturnPct?: string | number | null;
  availableSince?: string;
  availableForLabel?: string;
  piotroskiScore?: string | number;
  altmanZScore?: string | number;
  politicianScore?: string | number;
  politicianRecentBuys?: number;
  politicianRecentSells?: number;
  politicianNetFlow?: 'positive' | 'negative' | 'neutral' | string;
  politicianLargestTradeRange?: string;
  politicianExplanation?: string;
  rsi?: string | number;
  rsi14?: string | number;
  revenueGrowthPct?: string | number;
  epsGrowthPct?: string | number;
  pegRatio?: string | number;
  above200sma?: boolean;
  aiThesis?: string | null;
  signals?: Record<string, unknown>;
  marketCap?: number;
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function maybeNum(value: unknown): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) ? n : null;
}

export function money(value: unknown): string {
  const n = maybeNum(value);
  return n == null ? '—' : `$${n.toFixed(2)}`;
}

export function pct(value: unknown, digits = 2): string {
  const n = maybeNum(value);
  return n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function priceStatusLabel(c: EnrichedGrowthCandidate): string {
  const status = (c.currentPriceStatus ?? c.priceStatus ?? 'persisted').toUpperCase();
  const provider = c.currentPriceProvider ?? c.priceProvider ?? 'scan';
  return `${status} · ${provider}`;
}

export function politicianTone(flow?: string): 'bullish' | 'bearish' | 'neutral' {
  if (flow === 'positive') return 'bullish';
  if (flow === 'negative') return 'bearish';
  return 'neutral';
}

export function politicianLabel(c: EnrichedGrowthCandidate): string {
  const buys = c.politicianRecentBuys ?? 0;
  const sells = c.politicianRecentSells ?? 0;
  const flow = c.politicianNetFlow ?? 'neutral';
  if (buys === 0 && sells === 0) return 'Congress neutral';
  return `Congress ${flow} · ${buys}B/${sells}S`;
}

export function ageLabel(c: EnrichedGrowthCandidate): string {
  return c.availableForLabel ? `Available ${c.availableForLabel}` : 'Available —';
}
