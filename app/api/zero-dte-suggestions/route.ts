import { NextRequest, NextResponse } from 'next/server';
import {
  blackScholes,
  strikeByDelta,
  strikeByPrice,
} from '@/lib/models/black-scholes';

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
  stopLoss: number | null;          // = total credit (BIC rule)
  targetProfit: number | null;      // 50% of total credit
  putBreakeven: number | null;
  callBreakeven: number | null;
};

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

function optionPrice(
  S: number, K: number, T: number, sigma: number, type: 'put' | 'call'
): number {
  if (T <= 0) return Math.max(type === 'put' ? K - S : S - K, 0);
  return Math.max(blackScholes({ S, K, T, r: 0, sigma, optionType: type }).price, 0);
}

function buildIC(
  S: number, T: number, sigma: number,
  shortPut: number, shortCall: number, width: number,
): StrategySuggestion & { strategyId: string } {
  const longPut = shortPut - width;
  const longCall = shortCall + width;
  const putCredit = Math.max(
    optionPrice(S, shortPut, T, sigma, 'put') - optionPrice(S, longPut, T, sigma, 'put'), 0
  );
  const callCredit = Math.max(
    optionPrice(S, shortCall, T, sigma, 'call') - optionPrice(S, longCall, T, sigma, 'call'), 0
  );
  const totalCredit = putCredit + callCredit;
  return {
    strategyId: '',
    shortPutStrike: shortPut,
    longPutStrike: longPut,
    shortCallStrike: shortCall,
    longCallStrike: longCall,
    spreadWidth: width,
    estimatedCreditPerSide: parseFloat(((putCredit + callCredit) / 2).toFixed(2)),
    estimatedTotalCredit: parseFloat(totalCredit.toFixed(2)),
    stopLoss: parseFloat(totalCredit.toFixed(2)),
    targetProfit: parseFloat((totalCredit * 0.5).toFixed(2)),
    putBreakeven: shortPut - totalCredit,
    callBreakeven: shortCall + totalCredit,
  };
}

function buildPCS(
  S: number, T: number, sigma: number,
  shortPut: number, width: number,
): StrategySuggestion & { strategyId: string } {
  const longPut = shortPut - width;
  const credit = Math.max(
    optionPrice(S, shortPut, T, sigma, 'put') - optionPrice(S, longPut, T, sigma, 'put'), 0
  );
  return {
    strategyId: '',
    shortPutStrike: shortPut,
    longPutStrike: longPut,
    shortCallStrike: null,
    longCallStrike: null,
    spreadWidth: width,
    estimatedCreditPerSide: parseFloat(credit.toFixed(2)),
    estimatedTotalCredit: parseFloat(credit.toFixed(2)),
    stopLoss: parseFloat((credit * 1.5).toFixed(2)),
    targetProfit: parseFloat((credit * 0.5).toFixed(2)),
    putBreakeven: shortPut - credit,
    callBreakeven: null,
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
  // Full-session T (current intraday time remaining)
  const T = Math.max(minutesLeft, 1) / MINS_PER_YEAR;
  // Very short T for late-entry IC (5 min)
  const T_late = 5 / MINS_PER_YEAR;

  const suggestions: StrategySuggestion[] = [];

  // ── 1. Breakeven Iron Condor (BIC) — 12.5-delta, 30-pt wings ─────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, T, sigma, shortPut, shortCall, 30), strategyId: 'BIC' });
  }

  // ── 2. Late-Entry IC (3:55–3:58 PM) — 0.75% OTM, 10-pt wings ────────────
  {
    const shortPut  = round5(spx * 0.9925);
    const shortCall = round5(spx * 1.0075);
    suggestions.push({ ...buildIC(spx, T_late, sigma, shortPut, shortCall, 10), strategyId: 'LateEntryIC' });
  }

  // ── 3. Afternoon Peg IC — 0.25% OTM, 5-pt wings ─────────────────────────
  {
    const shortPut  = round5(spx * 0.9975);
    const shortCall = round5(spx * 1.0025);
    suggestions.push({ ...buildIC(spx, T, sigma, shortPut, shortCall, 5), strategyId: 'PegIC' });
  }

  // ── 4. Tuesday ATM Put Credit Spread — ATM, 5-pt width ───────────────────
  {
    const shortPut = round5(spx);
    suggestions.push({ ...buildPCS(spx, T, sigma, shortPut, 5), strategyId: 'TuesdayPCS' });
  }

  // ── 5. GEX-Anchored Directional Spread — 15-delta put spread, 10-pt ──────
  {
    const shortPut = strikeByDelta(spx, T, sigma, 0.15, 'put');
    suggestions.push({ ...buildPCS(spx, T, sigma, shortPut, 10), strategyId: 'GEXSpread' });
  }

  // ── 6. VIX1D Regime IC — 12.5-delta, 7-pt wings ──────────────────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, T, sigma, shortPut, shortCall, 7), strategyId: 'VIX1DIC' });
  }

  // ── 7. Schwartz Dollar Rule IC — 10-pt wings, ~$1.00 credit each side ────
  {
    const shortPut  = strikeByPrice(spx, T, sigma, 1.00, 'put');
    const shortCall = strikeByPrice(spx, T, sigma, 1.00, 'call');
    suggestions.push({ ...buildIC(spx, T, sigma, shortPut, shortCall, 10), strategyId: 'SchwartzIC' });
  }

  return NextResponse.json({ success: true, data: suggestions, spx, vix, minutesLeft, T });
}
