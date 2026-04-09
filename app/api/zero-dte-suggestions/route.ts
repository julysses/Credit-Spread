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
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

type ChainMap = Map<string, number>; // "PUT_5750" | "CALL_5750" → mid-price

function round5(n: number): number { return Math.round(n / 5) * 5; }

/** Only fetch live chain during regular trading hours (9:30–4:05 PM ET, weekdays) */
function isMarketHours(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const t = et.getHours() * 100 + et.getMinutes();
  return t >= 930 && t < 1605;
}

/** Today's ET date in YYYY-MM-DD format */
function todayET(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    .toLocaleDateString('en-CA');
}

/** Look up mid from chain; tolerates ±5 pt rounding artefacts */
function getLive(chain: ChainMap, type: 'PUT' | 'CALL', strike: number): number | null {
  const exact = chain.get(`${type}_${strike}`);
  if (exact != null && exact > 0) return exact;
  for (const d of [5, -5, 10, -10]) {
    const v = chain.get(`${type}_${strike + d}`);
    if (v != null && v > 0) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Option chain fetchers (tried in priority order)
// ─────────────────────────────────────────────────────────────────────────────

/** 1. MarketData.app — real bid/ask, most reliable if API key configured */
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
      if (mid > 0 && (side === 'PUT' || side === 'CALL')) map.set(`${side}_${strike}`, mid);
    }
    console.log(`[chain] MarketData.app: ${map.size} entries`);
    return map;
  } catch (err) {
    console.warn('[chain] MarketData.app failed:', (err as Error).message);
    return new Map();
  }
}

/**
 * 2. CBOE delayed quotes — free, no auth, ~15 min delay.
 * Tries both /SPX.json and /SPXW.json (0DTE can be either depending on day).
 * Symbol format: SPXW240409C05800000 → side=C, strike=5800.000
 */
async function fetchCBOEChain(expiryDate: string): Promise<ChainMap> {
  // CBOE option symbol embeds date as YYMMDD
  const yymmdd = expiryDate.replace(/-/g, '').slice(2);
  const map: ChainMap = new Map();
  try {
    const [spxRes, spxwRes] = await Promise.allSettled([
      axios.get('https://cdn.cboe.com/api/global/delayed_quotes/options/SPX.json', {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000,
      }),
      axios.get('https://cdn.cboe.com/api/global/delayed_quotes/options/SPXW.json', {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000,
      }),
    ]);

    for (const result of [spxRes, spxwRes]) {
      if (result.status !== 'fulfilled') continue;
      const opts: unknown[] = (result.value.data as { data?: { options?: unknown[] } })?.data?.options ?? [];
      for (const raw of opts) {
        const opt = raw as Record<string, unknown>;
        const sym = typeof opt.option === 'string' ? opt.option : '';
        if (!sym.includes(yymmdd)) continue; // skip other expiries

        // Symbol: SPXW240409C05800000 — last char before 8-digit block is C or P
        const m = sym.match(/([CP])(\d{8})$/);
        if (!m) continue;
        const side = m[1] === 'C' ? 'CALL' : 'PUT';
        const strike = parseInt(m[2]) / 1000;
        if (strike < 1000 || strike > 20000) continue;

        const bid = typeof opt.bid === 'number' ? opt.bid : 0;
        const ask = typeof opt.ask === 'number' ? opt.ask : 0;
        const last = typeof opt.last === 'number' ? opt.last : 0;
        const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
        if (mid > 0) {
          const k = `${side}_${strike}`;
          if (!map.has(k)) map.set(k, mid); // SPX takes precedence over SPXW
        }
      }
    }
    if (map.size > 0) console.log(`[chain] CBOE: ${map.size} entries for ${expiryDate}`);
    return map;
  } catch (err) {
    console.warn('[chain] CBOE fetch failed:', (err as Error).message);
    return map;
  }
}

/**
 * 3. Yahoo Finance v7 — free, requests today's date explicitly.
 * Without a date param Yahoo returns the next standard Friday, not 0DTE.
 */
async function fetchYahooChain(expiryDate: string): Promise<ChainMap> {
  try {
    // Convert YYYY-MM-DD to Unix timestamp for 4 PM ET (approx 21:00 UTC)
    const [yr, mo, dy] = expiryDate.split('-').map(Number);
    const expiryUnix = Math.floor(Date.UTC(yr, mo - 1, dy, 21) / 1000);

    const resp = await axios.get(
      'https://query1.finance.yahoo.com/v7/finance/options/%5ESPX',
      { params: { date: expiryUnix }, headers: YAHOO_HEADERS, timeout: 10000 }
    );

    const chain = resp.data?.optionChain?.result?.[0];
    if (!chain) return new Map();

    // Find the option set for today's expiry; fall back to first set
    const opts = (chain.options as { expirationDate?: number; puts?: unknown[]; calls?: unknown[] }[])
      ?.find(o => {
        if (!o.expirationDate) return false;
        const d = new Date(o.expirationDate * 1000)
          .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return d === expiryDate;
      }) ?? chain.options?.[0];

    if (!opts) return new Map();

    const map: ChainMap = new Map();
    const parseSide = (arr: unknown[], side: 'PUT' | 'CALL') => {
      for (const raw of arr ?? []) {
        const o = raw as Record<string, number>;
        if (!o.strike) continue;
        const mid = o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : (o.lastPrice ?? 0);
        if (mid > 0) map.set(`${side}_${o.strike}`, mid);
      }
    };
    parseSide(opts.puts ?? [], 'PUT');
    parseSide(opts.calls ?? [], 'CALL');

    if (map.size > 0) console.log(`[chain] Yahoo: ${map.size} entries for ${expiryDate}`);
    return map;
  } catch (err) {
    console.warn('[chain] Yahoo fetch failed:', (err as Error).message);
    return new Map();
  }
}

/** Tries all sources in priority order; returns best available chain + source name */
async function fetchBestChain(expiry: string): Promise<{ chain: ChainMap; source: string }> {
  if (!isMarketHours()) {
    console.log('[chain] Market closed — using BS pricing');
    return { chain: new Map(), source: 'bs' };
  }

  const md = await fetchMDChain(expiry);
  if (md.size > 0) return { chain: md, source: 'marketdata' };

  const cboe = await fetchCBOEChain(expiry);
  if (cboe.size > 0) return { chain: cboe, source: 'cboe' };

  const yahoo = await fetchYahooChain(expiry);
  if (yahoo.size > 0) return { chain: yahoo, source: 'yahoo' };

  console.warn('[chain] All sources failed — falling back to BS model');
  return { chain: new Map(), source: 'bs' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing helpers
// ─────────────────────────────────────────────────────────────────────────────

function absDelta(spx: number, K: number, T: number, sigma: number, type: 'put' | 'call'): number {
  if (T <= 0) return 0;
  return Math.abs(blackScholes({ S: spx, K, T, r: 0, sigma, optionType: type }).delta);
}

function bsPrice(spx: number, K: number, T: number, sigma: number, type: 'put' | 'call'): number {
  if (T <= 0) return Math.max(type === 'put' ? K - spx : spx - K, 0);
  return Math.max(blackScholes({ S: spx, K, T, r: 0, sigma, optionType: type }).price, 0);
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
  const spx        = parseFloat(searchParams.get('spx')        ?? '5800');
  const vix        = parseFloat(searchParams.get('vix')        ?? '18');
  const vix1d      = parseFloat(searchParams.get('vix1d')      ?? '0');
  const minutesLeft = parseFloat(searchParams.get('minutesLeft') ?? '240');

  if (!spx || !vix || spx < 1000 || vix < 1) {
    return NextResponse.json({ success: false, error: 'Invalid spx or vix' }, { status: 400 });
  }

  // VIX1D is the better vol estimate for same-day (0DTE) options.
  // VIX (30-day) systematically over-prices near-term vol; VIX1D is calibrated to daily reality.
  const sigma = Math.max(0.05, (vix1d > 2 ? vix1d : vix) / 100);

  const T      = Math.max(minutesLeft, 1) / MINS_PER_YEAR;
  const T_late = 5 / MINS_PER_YEAR;

  const expiry = todayET();
  const { chain, source: chainSource } = await fetchBestChain(expiry);

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
    meta: {
      spx, vix, vix1d,
      sigmaUsed: parseFloat((sigma * 100).toFixed(2)),
      sigmaSource: vix1d > 2 ? 'VIX1D' : 'VIX',
      chainSource,
      chainEntries: chain.size,
      expiry,
      minutesLeft,
    },
  });
}
