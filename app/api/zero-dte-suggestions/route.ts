import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import {
  blackScholes,
  strikeByDelta,
  strikeByPrice,
} from '@/lib/models/black-scholes';
import {
  calcIntradayPOP,
  calcIntradayEM,
} from '@/lib/models/intraday-engine';

export const dynamic = 'force-dynamic';

// 252 trading days × 390 min/day
const MINS_PER_YEAR = 252 * 390;

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

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
  priceSource: 'live' | 'bs';
};

// ─────────────────────────────────────────────────────────────────────────────
// Live option chain fetchers
// ─────────────────────────────────────────────────────────────────────────────

// Returns a map of "PUT_5750" or "CALL_5750" → mid-price
type ChainMap = Map<string, number>;

/** MarketData.app — real bid/ask, today's 0DTE expiry */
async function fetchMDChain(expiry: string): Promise<ChainMap> {
  const key = process.env.MARKETDATA_API_KEY;
  if (!key) return new Map();
  try {
    const resp = await axios.get('https://api.marketdata.app/v1/options/chain/SPX/', {
      headers: { Authorization: `Token ${key}`, Accept: 'application/json' },
      params: { expiration: expiry, greeks: 'true' },
      timeout: 8000,
    });
    const d = resp.data;
    if (d?.s !== 'ok' || !d.strike) return new Map();
    const map: ChainMap = new Map();
    for (let i = 0; i < d.strike.length; i++) {
      const strike: number = d.strike[i];
      const side: string = (d.side?.[i] ?? '').toUpperCase();
      const bid: number = d.bid?.[i] ?? 0;
      const ask: number = d.ask?.[i] ?? 0;
      const last: number = d.last?.[i] ?? 0;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
      if (mid > 0 && (side === 'PUT' || side === 'CALL')) {
        map.set(`${side}_${strike}`, mid);
      }
    }
    console.log(`MarketData option chain loaded: ${map.size} entries for ${expiry}`);
    return map;
  } catch (err) {
    console.warn('MarketData chain fetch failed:', (err as Error).message);
    return new Map();
  }
}

/** Yahoo Finance — free, no auth, returns today's nearest expiry chain */
async function fetchYahooChain(): Promise<ChainMap> {
  try {
    const resp = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/options/%5ESPX',
      { headers: YAHOO_HEADERS, timeout: 10000 }
    );
    const options = resp.data?.optionChain?.result?.[0]?.options?.[0];
    if (!options) return new Map();

    const map: ChainMap = new Map();
    for (const opt of options.puts ?? []) {
      if (!opt.strike) continue;
      const mid = opt.bid > 0 && opt.ask > 0
        ? (opt.bid + opt.ask) / 2
        : (opt.lastPrice ?? 0);
      if (mid > 0) map.set(`PUT_${opt.strike}`, mid);
    }
    for (const opt of options.calls ?? []) {
      if (!opt.strike) continue;
      const mid = opt.bid > 0 && opt.ask > 0
        ? (opt.bid + opt.ask) / 2
        : (opt.lastPrice ?? 0);
      if (mid > 0) map.set(`CALL_${opt.strike}`, mid);
    }
    console.log(`Yahoo option chain loaded: ${map.size} entries`);
    return map;
  } catch (err) {
    console.warn('Yahoo option chain fetch failed:', (err as Error).message);
    return new Map();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/** Look up mid-price from live chain; nearest-5 strike lookup with ±10 tolerance */
function getLive(chain: ChainMap, type: 'PUT' | 'CALL', strike: number): number | null {
  // Exact match first
  const exact = chain.get(`${type}_${strike}`);
  if (exact != null && exact > 0) return exact;
  // Try ±5 (rounding artefacts)
  for (const delta of [5, -5, 10, -10]) {
    const v = chain.get(`${type}_${strike + delta}`);
    if (v != null && v > 0) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy builders
// ─────────────────────────────────────────────────────────────────────────────

function buildIC(
  spx: number, vix: number, minutesLeft: number, T: number, sigma: number,
  shortPut: number, shortCall: number, width: number,
  chain: ChainMap,
): StrategySuggestion {
  const longPut  = shortPut  - width;
  const longCall = shortCall + width;

  // Premiums: prefer live mid-price (real bid/ask), fall back to BS
  const spPrem = getLive(chain, 'PUT',  shortPut)  ?? bsPrice(spx, shortPut,  T, sigma, 'put');
  const lpPrem = getLive(chain, 'PUT',  longPut)   ?? bsPrice(spx, longPut,   T, sigma, 'put');
  const scPrem = getLive(chain, 'CALL', shortCall) ?? bsPrice(spx, shortCall, T, sigma, 'call');
  const lcPrem = getLive(chain, 'CALL', longCall)  ?? bsPrice(spx, longCall,  T, sigma, 'call');

  const hasLive = !!(getLive(chain, 'PUT', shortPut) || getLive(chain, 'CALL', shortCall));

  const putCredit  = Math.max(0, spPrem - lpPrem);
  const callCredit = Math.max(0, scPrem - lcPrem);
  const totalCredit = parseFloat((putCredit + callCredit).toFixed(2));

  const pop = calcIntradayPOP(spx, shortPut, vix, minutesLeft, 'put');
  const em  = calcIntradayEM(spx, vix, minutesLeft);

  return {
    strategyId: '',
    shortPutStrike: shortPut, longPutStrike: longPut,
    shortCallStrike: shortCall, longCallStrike: longCall,
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
    shortPutDelta:  parseFloat(absDelta(spx, shortPut,  T, sigma, 'put').toFixed(2)),
    longPutDelta:   parseFloat(absDelta(spx, longPut,   T, sigma, 'put').toFixed(2)),
    shortCallDelta: parseFloat(absDelta(spx, shortCall, T, sigma, 'call').toFixed(2)),
    longCallDelta:  parseFloat(absDelta(spx, longCall,  T, sigma, 'call').toFixed(2)),
    shortPutPremium:  parseFloat(spPrem.toFixed(2)),
    longPutPremium:   parseFloat(lpPrem.toFixed(2)),
    shortCallPremium: parseFloat(scPrem.toFixed(2)),
    longCallPremium:  parseFloat(lcPrem.toFixed(2)),
    priceSource: hasLive ? 'live' : 'bs',
  };
}

function buildPCS(
  spx: number, vix: number, minutesLeft: number, T: number, sigma: number,
  shortPut: number, width: number,
  chain: ChainMap,
): StrategySuggestion {
  const longPut = shortPut - width;

  const spPrem = getLive(chain, 'PUT', shortPut) ?? bsPrice(spx, shortPut, T, sigma, 'put');
  const lpPrem = getLive(chain, 'PUT', longPut)  ?? bsPrice(spx, longPut,  T, sigma, 'put');
  const hasLive = !!getLive(chain, 'PUT', shortPut);

  const credit = Math.max(0, spPrem - lpPrem);
  const totalCredit = parseFloat(credit.toFixed(2));

  const pop = calcIntradayPOP(spx, shortPut, vix, minutesLeft, 'put');
  const em  = calcIntradayEM(spx, vix, minutesLeft);

  return {
    strategyId: '',
    shortPutStrike: shortPut, longPutStrike: longPut,
    shortCallStrike: null, longCallStrike: null,
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
    shortPutDelta: parseFloat(absDelta(spx, shortPut, T, sigma, 'put').toFixed(2)),
    longPutDelta:  parseFloat(absDelta(spx, longPut,  T, sigma, 'put').toFixed(2)),
    shortCallDelta: null, longCallDelta: null,
    shortPutPremium:  parseFloat(spPrem.toFixed(2)),
    longPutPremium:   parseFloat(lpPrem.toFixed(2)),
    shortCallPremium: null, longCallPremium: null,
    priceSource: hasLive ? 'live' : 'bs',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

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

  // Today's 0DTE expiry (ET date)
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayExpiry = etNow.toLocaleDateString('en-CA'); // YYYY-MM-DD

  // Fetch live option chain: MarketData.app first, Yahoo Finance fallback
  let chain: ChainMap = await fetchMDChain(todayExpiry);
  if (chain.size === 0) {
    chain = await fetchYahooChain();
  }
  const hasLiveChain = chain.size > 0;

  const suggestions: StrategySuggestion[] = [];

  // ── 1. Breakeven Iron Condor (BIC) — 12.5-delta, 30-pt wings ─────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 30, chain), strategyId: 'BIC' });
  }

  // ── 2. Late-Entry IC (3:55–3:58 PM) — 0.75% OTM, 10-pt wings ────────────
  {
    const shortPut  = round5(spx * 0.9925);
    const shortCall = round5(spx * 1.0075);
    suggestions.push({ ...buildIC(spx, vix, 5, T_late, sigma, shortPut, shortCall, 10, chain), strategyId: 'LateEntryIC' });
  }

  // ── 3. Afternoon Peg IC — 0.25% OTM, 5-pt wings ─────────────────────────
  {
    const shortPut  = round5(spx * 0.9975);
    const shortCall = round5(spx * 1.0025);
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 5, chain), strategyId: 'PegIC' });
  }

  // ── 4. Tuesday ATM Put Credit Spread — ATM, 5-pt width ───────────────────
  {
    const shortPut = round5(spx);
    suggestions.push({ ...buildPCS(spx, vix, minutesLeft, T, sigma, shortPut, 5, chain), strategyId: 'TuesdayPCS' });
  }

  // ── 5. GEX-Anchored Directional Spread — 15-delta put spread, 10-pt ──────
  {
    const shortPut = strikeByDelta(spx, T, sigma, 0.15, 'put');
    suggestions.push({ ...buildPCS(spx, vix, minutesLeft, T, sigma, shortPut, 10, chain), strategyId: 'GEXSpread' });
  }

  // ── 6. VIX1D Regime IC — 12.5-delta, 7-pt wings ──────────────────────────
  {
    const shortPut  = strikeByDelta(spx, T, sigma, 0.125, 'put');
    const shortCall = strikeByDelta(spx, T, sigma, 0.125, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 7, chain), strategyId: 'VIX1DIC' });
  }

  // ── 7. Schwartz Dollar Rule IC — 10-pt wings, ~$1.00 credit each side ────
  {
    const shortPut  = strikeByPrice(spx, T, sigma, 1.00, 'put');
    const shortCall = strikeByPrice(spx, T, sigma, 1.00, 'call');
    suggestions.push({ ...buildIC(spx, vix, minutesLeft, T, sigma, shortPut, shortCall, 10, chain), strategyId: 'SchwartzIC' });
  }

  return NextResponse.json({
    success: true,
    data: suggestions,
    spx, vix, minutesLeft, T,
    priceSource: hasLiveChain ? (process.env.MARKETDATA_API_KEY ? 'marketdata' : 'yahoo') : 'bs',
  });
}
