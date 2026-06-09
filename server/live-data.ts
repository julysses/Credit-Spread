import { NextResponse } from 'next/server';
import type { MarketDataSnapshot } from './market-data';

export type LiveDataStatus = 'live' | 'delayed' | 'persisted' | 'derived' | 'stale' | 'unavailable';

export interface UnavailablePayload {
  success: false;
  code: 'DATA_UNAVAILABLE';
  feature: string;
  message: string;
  missingSources: string[];
  diagnostics?: Record<string, unknown>;
  timestamp: number;
}

export function dataUnavailable(feature: string, missingSources: string[], diagnostics?: Record<string, unknown>, status = 503) {
  return NextResponse.json<UnavailablePayload>({
    success: false,
    code: 'DATA_UNAVAILABLE',
    feature,
    message: `${feature} requires real data from: ${missingSources.join(', ')}`,
    missingSources,
    diagnostics,
    timestamp: Date.now(),
  }, { status });
}

export function missingEnv(keys: string[]): string[] {
  return keys.filter(key => !process.env[key] || process.env[key]?.trim() === '');
}

export function marketSnapshotMissingSources(snapshot: MarketDataSnapshot): string[] {
  const missing: string[] = [];
  const sources = snapshot.sources ?? {};

  if (!snapshot.spx?.price || /missing|unknown|unavailable|hardcoded|synthetic/i.test(sources.spx ?? '')) missing.push('spx');
  if (!snapshot.vix?.price || /missing|unknown|unavailable|hardcoded/i.test(sources.vix ?? '')) missing.push('vix');
  if (!snapshot.spy?.price || /missing|unknown|unavailable|hardcoded/i.test(sources.spy ?? '')) missing.push('spy');
  if (!snapshot.optionChain?.length || /missing|unknown|unavailable|hardcoded|fallback/i.test(sources.optionChain ?? '')) missing.push('optionChain');
  if (!snapshot.realizedVol || /missing|unknown|unavailable|hardcoded|synthetic|estimate/i.test(sources.realizedVol ?? '')) missing.push('realizedVol');

  return Array.from(new Set(missing));
}

export function isTradeableMarketSnapshot(snapshot: MarketDataSnapshot): boolean {
  const missing = marketSnapshotMissingSources(snapshot);
  return !missing.includes('spx') && !missing.includes('vix') && !missing.includes('optionChain');
}
