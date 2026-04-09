import { NextRequest, NextResponse } from 'next/server';
import {
  blackScholes,
  strikeByDelta,
  strikeByPrice,
} from '@/lib/models/black-scholes';
import {
  estimateCredit,
  calcIntradayPOP,
  calcIntradayEM,
} from '@/lib/models/intraday-engine';

export const dynamic = 'force-dynamic';

// 252 trading days × 390 min/day
const MINS_PER_YEAR = 252 * 390;

export type StrategySuggestion = {
  strategyId: string;
  shortPutStrike: number | null;
  longPutStrike: number | null;
  shortCallStrike: number | null;
  longCallStrike: number | null;
  spreadWidth: number;
  estimatedCreditPerSide: number | null;
  estimatedTotalCredit: number | null;
  stopLoss: number | null;
  targetProfit: number | null;
  putBreakeven: number | null;
  callBreakeven: number | null;
  // Richer fields for IntradayPanel-style display
  pop: number;
  expectedMoveHigh: number;
  expectedMoveLow: number;
  impliedVol: number;
  shortPutDelta: number | null;
  longPutDelta: number | null;
  shortCallDelta: number | null;
  longCallDelta: number | null;
  shortPutPremium: number | null;
  longPutPremium: number | null;
  shortCallPremium: number | null;
  longCallPremium: number | null;
};

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

function absDelta(spx: number, K: number, T: number, sigma: number, type: 'put' | 'call'): number {
  if (T <= 0) return 0;
  return Math.abs(blackScholes({ S: spx, K, T, r: 0, sigma, optionType: type }).delta);
}

function bsPrice(spx: number, K: number, T: number, sigma: number, type: 'put' | 'call'): number {
  if (T <= 0) return Math.max(type === 'put' ? K - spx : spx - K, 0);
  return Math.max(blackScholes({ S: spx, K, T, r: 0, sigma, optionType: type }).price, 0);
}

function buildIC(
  spx: number, vix: number, minutesLeft: number, T: number, sigma: number,
  shortPut: number, shortCall: number, width: number,
): StrategySuggestion {
  const longPut  = shortPut  - width;
  const longCall = shortCall + width;

  // Net spread credits via intraday engine (probability-based, more realistic for 0DTE)
  const putCredit  = estimateCredit(spx, shortPut,  longPut,  vix, minutesLeft);
  const callCredit = estimateCredit(spx, shortCall, longCall, vix, minutesLeft);
  const totalCredit = parseFloat((putCredit + callCredit).toFixed(2));

  // Per-leg BS prices for display
  const shortPutPremium  = parseFloat(bsPrice(spx, shortPut,  T, sigma, 'put').toFixed(2));
  const longPutPremium   = parseFloat(bsPrice(spx, longPut,   T, sigma, 'put').toFixed(2));
  const shortCallPremium = parseFloat(bsPrice(spx, shortCall, T, sigma, 'call').toFixed(2));
  const longCallPremium  = parseFloat(bsPrice(spx, longCall,  T, sigma, 'call').toFixed(2));

  // Deltas (absolute values)
  const shortPutDelta  = parseFloat(absDelta(spx, shortPut,  T, sigma, 'put').toFixed(2));
  const longPutDelta   = parseFloat(absDelta(spx, longPut,   T, sigma, 'put').toFixed(2));
  const shortCallDelta = parseFloat(absDelta(spx, shortCall, T, sigma, 'call').toFixed(2));
  const longCallDelta  = parseFloat(absDelta(spx, longCall,  T, sigma, 'call').toFixed(2));

  // POP — use put side (more conservative for IC)
  const pop = calcIntradayPOP(spx, shortPut, vix, minutesLeft, 'put');
  const em  = calcIntradayEM(spx, vix, minutesLeft);

  return {
    strategyId: '',
    shortPutStrike: shortPut,
    longPutStrike: longPut,
    shortCallStrike: shortCall,
    longCallStrike: longCall,
    spreadWidth: width,
    estimatedCreditPerSide: parseFloat(((putCredit + callCredit) / 2).toFixed(2)),
    estimatedTotalCredit: totalCredit,
    stopLoss: totalCredit,
    targetProfit: parseFloat((totalCredit * 0.5).toFixed(2)),
    putBreakeven:  parseFloat((shortPut  - totalCredit).toFixed(2)),
    callBreakeven: parseFloat((shortCall + totalCredit).toFixed(2)),
    pop,
    expectedMoveHigh: Math.round(spx + em),
    expectedMoveLow:  Math.round(spx - em),
    impliedVol: sigma,
    shortPutDelta, longPutDelta, shortCallDelta, longCallDelta,
    shortPutPremium, longPutPremium, shortCallPremium, longCallPremium,
  };
}

function buildPCS(
  spx: number, vix: number, minutesLeft: number, T: number, sigma: number,
  shortPut: number, width: number,
): StrategySuggestion {
  const longPut = shortPut - width;

  const credit = estimateCredit(spx, shortPut, longPut, vix, minutesLeft);
  const totalCredit = parseFloat(credit.toFixed(2));

  const shortPutPremium = parseFloat(bsPrice(spx, shortPut, T, sigma, 'put').toFixed(2));
  const longPutPremium  = parseFloat(bsPrice(spx, longPut,  T, sigma, 'put').toFixed(2));
  const shortPutDelta   = parseFloat(absDelta(spx, shortPut, T, sigma, 'put').toFixed(2));
  const longPutDelta    = parseFloat(absDelta(spx, longPut,  T, sigma, 'put').toFixed(2));

  const pop = calcIntradayPOP(spx, shortPut, vix, minutesLeft, 'put');
  const em  = calcIntradayEM(spx, vix, minutesLeft);

  return {
    strategyId: '',
    shortPutStrike: shortPut,
    longPutStrike: longPut,
    shortCallStrike: null,
    longCallStrike: null,
    spreadWidth: width,
    estimatedCreditPerSide: totalCredit,
    estimatedTotalCredit: totalCredit,
    stopLoss: parseFloat((totalCredit * 1.5).toFixed(2)),
    targetProfit: parseFloat((totalCredit * 0.5).toFixed(2)),
    putBreakeven:  parseFloat((shortPut - totalCredit).toFixed(2)),
    callBreakeven: null,
    pop,
    expectedMoveHigh: Math.round(spx + em),
    expectedMoveLow:  Math.round(spx - em),
    impliedVol: sigma,
    shortPutDelta, longPutDelta,
    shortCallDelta: null, longCallDelta: null,
    shortPutPremium, longPutPremium,
    shortCallPremium: null, longCallPremium: null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const spx = parseFloat(searchParams.get('spx') ?? '5800');
  const vix = parseFloat(searchParams.get('vix') ?? '18');
  const minutesLeft = parseFloat(searchParams.get('minutesLeft') ?? '240');

  if (!spx || !vix || spx < 1000 || vix < 1) {
    return NextResponse.json({ success: false, error: 'Invalid spx or vix' }, { status: 400 });
  }

  const sigma = vix / 100;
  const T = Math.max(minutesLeft, 1) / MINS_PER_YEAR;
  const T_late = 5 / MINS_PER_YEAR;

  const suggestions: StrategySuggestion[] = [];

  // ── 1. Breakeven Iron Condor (BIC) — 12.5-delta, 30-pt wings ─────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 30), strategyId: 'BIC' });
  }

  // ── 2. Late-Entry IC (3:55–3:58 PM) — 0.75% OTM, 10-pt wings ────────────
  {
    const shortPut  = round5(spx * 0.9925);
    const shortCall = round5(spx * 1.0075);
    suggestions.push({ ...buildIC(spx, vix, 5, T_late, sigma, shortPut, shortCall, 10), strategyId: 'LateEntryIC' });
  }

  // ── 3. Afternoon Peg IC — 0.25% OTM, 5-pt wings ─────────────────────────
  {
    const shortPut  = round5(spx * 0.9975);
    const shortCall = round5(spx * 1.0025);
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 5), strategyId: 'PegIC' });
  }

  // ── 4. Tuesday ATM Put Credit Spread — ATM, 5-pt width ───────────────────
  {
    const shortPut = round5(spx);
    suggestions.push({ ...buildPCS(spx, vix, minutesLeft, T, sigma, shortPut, 5), strategyId: 'TuesdayPCS' });
  }

  // ── 5. GEX-Anchored Directional Spread — 15-delta put spread, 10-pt ──────
  {
    const shortPut = strikeByDelta(spx, T, sigma, 0.15, 'put');
    suggestions.push({ ...buildPCS(spx, vix, minutesLeft, T, sigma, shortPut, 10), strategyId: 'GEXSpread' });
  }

  // ── 6. VIX1D Regime IC — 12.5-delta, 7-pt wings ──────────────────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 7), strategyId: 'VIX1DIC' });
  }

  // ── 7. Schwartz Dollar Rule IC — 10-pt wings, ~$1.00 credit each side ────
  {
    const shortPut  = strikeByPrice(spx, T, sigma, 1.00, 'put');
    const shortCall = strikeByPrice(spx, T, sigma, 1.00, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 10), strategyId: 'SchwartzIC' });
  }

  return NextResponse.json({ success: true, data: suggestions, spx, vix, minutesLeft, T });
}
