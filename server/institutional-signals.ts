/**
 * Institutional Pre-Trade Positioning Intelligence
 * Aggregates 7 institutional edges for night-before / pre-market trade planning.
 *
 * Edge 01 — GEX / Dealer Gamma Positioning
 * Edge 02 — VIX Term Structure & Contango/Backwardation
 * Edge 03 — Overnight Futures & Global Session Range
 * Edge 04 — Dark Pool & Unusual Options Flow (manual or API)
 * Edge 05 — Economic Calendar & Catalyst Map
 * Edge 06 — SPX Market Breadth & Internals
 * Edge 07 — SPX vs. 200-Day SMA & Macro Regime
 *
 * Data sources: Yahoo Finance (free), FRED (free), existing market-data.ts
 */

import axios from 'axios';
import { fetchMarketSnapshot } from './market-data';
import { fetchSignalStackInputs } from './signal-stack-inputs';
import type { OptionChainEntry } from './market-data';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VIXTermStructure =
  | 'steep_contango'
  | 'mild_contango'
  | 'flat'
  | 'backwardation';

export type OvernightType = 'trending_up' | 'trending_down' | 'choppy';
export type DarkPoolBias = 'bullish' | 'bearish' | 'neutral';
export type GEXRegime = 'positive' | 'negative';

export interface GEXLevels {
  net: number;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  regime: GEXRegime;
}

export interface OvernightData {
  esHigh: number | null;
  esLow: number | null;
  esCurrent: number | null;
  nqHigh: number | null;
  nqLow: number | null;
  gapVsPriorClose: number | null;
  gapPct: number | null;
  overnightType: OvernightType | null;
}

export interface CatalystEvent {
  type: string;
  title: string;
  time: string;
  importance: 'low' | 'medium' | 'high';
}

export interface InstitutionalSignals {
  // Edge 01 — GEX
  gexNet: number | null;
  gammaFlipLevel: number | null;
  callWall: number | null;
  putWall: number | null;
  gexRegime: GEXRegime | null;

  // Edge 02 — VIX Term Structure
  vixSpot: number | null;
  vvixClose: number | null;
  vix9d: number | null;
  vix3m: number | null;
  vixTermStructure: VIXTermStructure | null;
  vix9dVsVix30Spread: number | null; // negative = VIX9D < VIX30 = bullish (normal)

  // Edge 03 — Overnight Futures
  esOvernightHigh: number | null;
  esOvernightLow: number | null;
  esCurrentPrice: number | null;
  nqOvernightHigh: number | null;
  nqOvernightLow: number | null;
  gapVsPriorClose: number | null;
  gapPct: number | null;
  overnightType: OvernightType | null;

  // Edge 04 — Dark Pool Flow
  darkPoolBias: DarkPoolBias;
  darkPoolCallPct: number;
  darkPoolIsManual: boolean;

  // Edge 05 — Catalyst Risk
  catalystRisk: boolean;
  catalystDetail: string;
  nextSessionEvents: CatalystEvent[];

  // Edge 06 — Breadth
  adRatio: number | null;
  pctAbove200sma: number | null;

  // Edge 07 — SPX vs 200-SMA + macro
  spxClose: number | null;
  spx200sma: number | null;
  spxVs200smaPct: number | null;
  hySpreadBps: number | null;
  hySpread2wkChange: number | null;
  dxyLevel: number | null;

  // Computed output
  tierScore: number;
  tierRationale: string;
  tierRules: string[];

  fetchedAt: number;
  sources: Record<string, 'ok' | 'error' | 'manual'>;
}

// Dark pool override — caller can inject manual flow data
export interface DarkPoolOverride {
  bias: DarkPoolBias;
  callPct: number;
}

// ─── Yahoo Finance helpers ────────────────────────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function yahooSpot(ticker: string): Promise<number | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`, {
      params: { range: '1d', interval: '5m', includePrePost: 'true' },
      headers: YAHOO_HEADERS,
      timeout: 8000,
    });
    const meta = resp.data?.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? meta?.previousClose ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch intraday data points for a ticker.
 * Returns array of { timestamp (epoch seconds), close, high, low }.
 */
async function yahooIntraday(
  ticker: string,
  range = '2d',
  interval = '30m'
): Promise<Array<{ ts: number; close: number; high: number; low: number }> | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`, {
      params: { range, interval, includePrePost: 'true' },
      headers: YAHOO_HEADERS,
      timeout: 10000,
    });
    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const highs: number[] = result.indicators?.quote?.[0]?.high ?? [];
    const lows: number[] = result.indicators?.quote?.[0]?.low ?? [];
    const out: Array<{ ts: number; close: number; high: number; low: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        out.push({ ts: timestamps[i], close: closes[i], high: highs[i] ?? closes[i], low: lows[i] ?? closes[i] });
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function yahooHistory(ticker: string, range: string): Promise<number[] | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`, {
      params: { range, interval: '1d', includeAdjustedClose: 'true' },
      headers: YAHOO_HEADERS,
      timeout: 10000,
    });
    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;
    const closes: (number | null)[] =
      result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];
    return closes.filter((v): v is number => v != null && !isNaN(v));
  } catch {
    return null;
  }
}

// ─── GEX Enhanced ────────────────────────────────────────────────────────────

/**
 * Compute net GEX, gamma flip strike, call wall, and put wall from options chain.
 *
 * - Net GEX: sum of (callDelta × callOI - |putDelta| × putOI) × 100 × spot
 * - Call Wall: strike with highest call OI
 * - Put Wall: strike with highest put OI
 * - Gamma Flip: strike nearest spot where cumulative GEX by strike flips sign
 */
function computeGexEnhanced(chain: OptionChainEntry[], spot: number): GEXLevels {
  if (chain.length === 0) {
    return { net: 0, gammaFlip: null, callWall: null, putWall: null, regime: 'positive' };
  }

  let netGex = 0;
  let maxCallOI = 0;
  let maxPutOI = 0;
  let callWall: number | null = null;
  let putWall: number | null = null;

  // Accumulate per-strike GEX contributions (sorted by strike proximity to spot)
  const strikeGex: Map<number, number> = new Map();

  for (const row of chain) {
    const callContrib = row.callDelta * row.callOI * 100 * spot;
    const putContrib = Math.abs(row.putDelta) * row.putOI * 100 * spot;
    const strikeNet = callContrib - putContrib;
    netGex += strikeNet;
    strikeGex.set(row.strike, (strikeGex.get(row.strike) ?? 0) + strikeNet);

    if (row.callOI > maxCallOI) { maxCallOI = row.callOI; callWall = row.strike; }
    if (row.putOI > maxPutOI) { maxPutOI = row.putOI; putWall = row.strike; }
  }

  // Find gamma flip: walk strikes from spot outward, find where cumulative switches sign
  const strikes = Array.from(strikeGex.keys()).sort((a, b) => a - b);
  let gammaFlip: number | null = null;
  let cumulativeGex = 0;
  let prevSign: number | null = null;

  for (const strike of strikes) {
    cumulativeGex += strikeGex.get(strike) ?? 0;
    const sign = cumulativeGex >= 0 ? 1 : -1;
    if (prevSign !== null && sign !== prevSign) {
      gammaFlip = strike;
      break;
    }
    prevSign = sign;
  }

  return {
    net: parseFloat(netGex.toFixed(0)),
    gammaFlip,
    callWall,
    putWall,
    regime: netGex >= 0 ? 'positive' : 'negative',
  };
}

// ─── VIX Term Structure ───────────────────────────────────────────────────────

function classifyVIXTermStructure(
  vix9d: number | null,
  vix: number | null,
  vix3m: number | null
): VIXTermStructure | null {
  if (vix9d == null || vix == null || vix3m == null) return null;
  const m1m2Spread = vix3m - vix;      // positive = contango (VIX3M > VIX)
  const frontSpread = vix - vix9d;     // positive = normal (VIX > VIX9D)
  if (m1m2Spread > 2 && frontSpread >= 0) return 'steep_contango';
  if (m1m2Spread > 0) return 'mild_contango';
  if (m1m2Spread < -1.5) return 'backwardation';
  return 'flat';
}

// ─── Overnight Range ──────────────────────────────────────────────────────────

/**
 * Extract overnight high/low from ES=F intraday data.
 * "Overnight" = timestamps outside regular 9:30–16:00 ET (approx UTC 13:30–20:00).
 */
function extractOvernightRange(
  data: Array<{ ts: number; close: number; high: number; low: number }>,
  priorClose: number | null
): Omit<OvernightData, 'nqHigh' | 'nqLow'> {
  if (data.length === 0) {
    return { esHigh: null, esLow: null, esCurrent: null, gapVsPriorClose: null, gapPct: null, overnightType: null };
  }

  // Filter to roughly overnight window: exclude 13:30–20:00 UTC (regular session)
  const overnightBars = data.filter(({ ts }) => {
    const hour = new Date(ts * 1000).getUTCHours();
    return hour < 13 || hour >= 20; // outside regular ET session
  });

  const bars = overnightBars.length > 3 ? overnightBars : data; // fallback to all bars
  const esHigh = Math.max(...bars.map(b => b.high));
  const esLow = Math.min(...bars.map(b => b.low));
  const esCurrent = bars[bars.length - 1]?.close ?? null;

  let gapVsPriorClose: number | null = null;
  let gapPct: number | null = null;
  if (esCurrent != null && priorClose != null && priorClose > 0) {
    gapVsPriorClose = parseFloat((esCurrent - priorClose).toFixed(2));
    gapPct = parseFloat((((esCurrent - priorClose) / priorClose) * 100).toFixed(2));
  }

  let overnightType: OvernightType | null = null;
  if (bars.length >= 4) {
    const rangePct = ((esHigh - esLow) / esLow) * 100;
    const direction = esCurrent != null && priorClose != null
      ? esCurrent > priorClose ? 'up' : 'down'
      : null;
    if (rangePct < 0.25) {
      overnightType = 'choppy';
    } else if (direction === 'up') {
      overnightType = 'trending_up';
    } else if (direction === 'down') {
      overnightType = 'trending_down';
    } else {
      overnightType = 'choppy';
    }
  }

  return { esHigh, esLow, esCurrent, gapVsPriorClose, gapPct, overnightType };
}

// ─── A/D Ratio ────────────────────────────────────────────────────────────────

/**
 * NYSE Advance-Decline ratio.
 * ^ADDN = advances, ^DCLN = declines (or use ^ADD for net AD line).
 * As a fallback, uses the breadth % already fetched from signal-stack-inputs.
 */
async function fetchADRatio(): Promise<number | null> {
  try {
    // ^ADDN (advances) and ^DCLN (declines) on Yahoo Finance
    const [advances, declines] = await Promise.all([
      yahooSpot('^ADDN'),
      yahooSpot('^DCLN'),
    ]);
    if (advances != null && declines != null && declines > 0) {
      return parseFloat((advances / declines).toFixed(2));
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Tier 1–5 Scoring Engine ──────────────────────────────────────────────────

interface TierResult {
  tier: number;
  rationale: string;
  rules: string[];
}

export function computeInstitutionalTier(
  signals: Omit<InstitutionalSignals, 'tierScore' | 'tierRationale' | 'tierRules' | 'fetchedAt' | 'sources'>
): TierResult {
  const rules: string[] = [];
  const spxAboveSMA = (signals.spxVs200smaPct ?? 0) > 0;
  const spxBelowSMA = (signals.spxVs200smaPct ?? 0) < 0;
  const gexPositive = (signals.gexNet ?? 0) >= 0;
  const gexNegative = !gexPositive;
  const vvix = signals.vvixClose ?? 0;
  const termStructure = signals.vixTermStructure;
  const contango = termStructure === 'steep_contango' || termStructure === 'mild_contango';
  const steepContango = termStructure === 'steep_contango';
  const backwardation = termStructure === 'backwardation';
  const breadth = signals.pctAbove200sma ?? 50;
  const callPct = signals.darkPoolCallPct ?? 50;
  const catalystRisk = signals.catalystRisk;
  const vix = signals.vixSpot ?? 18;
  const vix9dVsVix30 = signals.vix9dVsVix30Spread ?? 0; // negative is bullish

  // ── Hard override rules ──────────────────────────────────────────────────────
  if (vvix > 110) {
    rules.push('VVIX > 110 — Tier 5 override (extreme vol-of-vol)');
    return { tier: 5, rationale: 'VVIX above 110 — extreme vol-of-vol spike, risk-off only', rules };
  }

  if (gexNegative && spxBelowSMA) {
    rules.push('GEX negative + SPX below 200-SMA — Tier 4 floor applied');
  }

  if (catalystRisk) {
    rules.push('Catalyst risk present — max position 50% of normal, minimum 21 DTE');
  }

  if (vvix > 100) {
    rules.push('VVIX > 100 — elevated vol-of-vol, widen stops or stand aside');
  }

  if (callPct > 75 && !catalystRisk) {
    rules.push(`Dark pool call sweep ${callPct}% — aggressive bullish confirmation signal`);
  }

  // ── Tier 5 — RISK-OFF / HEDGE ONLY ─────────────────────────────────────────
  if (backwardation && vvix > 100 && (gexNegative || catalystRisk)) {
    return {
      tier: 5,
      rationale: 'Backwardation + elevated VVIX + GEX negative/catalyst — capital preservation only',
      rules,
    };
  }

  // ── Tier 4 — DEFENSIVE ──────────────────────────────────────────────────────
  if (
    (gexNegative && spxBelowSMA) ||
    (spxBelowSMA && vix > 25) ||
    (gexNegative && backwardation) ||
    (callPct < 30 && spxBelowSMA)
  ) {
    return {
      tier: 4,
      rationale: `Defensive regime — ${spxBelowSMA ? 'SPX below 200-SMA' : 'GEX negative'} + ${vix > 25 ? 'elevated VIX' : 'bearish indicators'}`,
      rules,
    };
  }

  // ── Tier 3 — NEUTRAL / WAIT ──────────────────────────────────────────────────
  const spxNearSMA = Math.abs(signals.spxVs200smaPct ?? 0) < 1.5;
  const vixFlat = termStructure === 'flat';
  const mixedSignals = (contango && gexNegative) || (spxAboveSMA && backwardation);

  if (spxNearSMA || vixFlat || mixedSignals || (catalystRisk && !steepContango)) {
    return {
      tier: 3,
      rationale: `Neutral — ${spxNearSMA ? 'SPX near 200-SMA' : mixedSignals ? 'mixed signals' : 'vol structure flat'}${catalystRisk ? ' + catalyst risk' : ''}`,
      rules,
    };
  }

  // ── Tier 1 — MAX SHORT VOL ──────────────────────────────────────────────────
  if (
    spxAboveSMA &&
    steepContango &&
    gexPositive &&
    !catalystRisk &&
    breadth > 60 &&
    vvix <= 80 &&
    vix9dVsVix30 < 0
  ) {
    return {
      tier: 1,
      rationale: 'Max short-vol — SPX above 200-SMA, steep contango, positive GEX, no catalyst, broad breadth',
      rules,
    };
  }

  // ── Tier 2 — MILD BULLISH / DIRECTIONAL ─────────────────────────────────────
  if (spxAboveSMA && contango && breadth > 40) {
    return {
      tier: 2,
      rationale: `Mild bullish — SPX above 200-SMA, ${termStructure}, breadth ${breadth.toFixed(0)}%`,
      rules,
    };
  }

  // Default to Tier 3 for anything uncategorized
  return { tier: 3, rationale: 'Mixed signals — neutral posture, wait for confirmation', rules };
}

// ─── FRED HY Spread (re-use pattern from signal-stack-inputs.ts) ──────────────

async function fetchHYSpread(): Promise<{ current: number; twoWeekChange: number } | null> {
  try {
    const resp = await axios.get(
      'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' },
        timeout: 10000,
        responseType: 'text',
      }
    );
    const parsed = (resp.data as string)
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('DATE'))
      .map((l) => {
        const val = l.split(',')[1]?.trim() ?? '';
        const n = parseFloat(val);
        return isNaN(n) ? null : n * 100;
      })
      .filter((v): v is number => v !== null);
    if (parsed.length < 15) return null;
    const current = parsed[parsed.length - 1];
    const twoWeeksAgo = parsed[parsed.length - 10];
    return { current: parseFloat(current.toFixed(0)), twoWeekChange: parseFloat((current - twoWeeksAgo).toFixed(1)) };
  } catch {
    return null;
  }
}

// ─── Main aggregator ──────────────────────────────────────────────────────────

export async function fetchInstitutionalSignals(
  darkPoolOverride?: DarkPoolOverride
): Promise<InstitutionalSignals> {
  const sources: Record<string, 'ok' | 'error' | 'manual'> = {};

  // Re-use the existing Signal Stack inputs for SPX, VIX, GEX base, breadth, HY spread
  const [
    stackInputsResult,
    snapshotResult,
    vix9dResult,
    vix3mResult,
    esIntradayResult,
    nqIntradayResult,
    spxHistResult,
    adRatioResult,
    hyResult,
  ] = await Promise.allSettled([
    fetchSignalStackInputs(),
    fetchMarketSnapshot(),
    yahooSpot('^VIX9D'),
    yahooSpot('^VIX3M'),
    yahooIntraday('ES=F', '2d', '30m'),
    yahooIntraday('NQ=F', '2d', '30m'),
    yahooHistory('^GSPC', '5d'),
    fetchADRatio(),
    fetchHYSpread(),
  ]);

  // ── Existing stack inputs (SPX, VIX, GEX base, breadth, HY, DXY, VVIX) ───
  const stackInputs =
    stackInputsResult.status === 'fulfilled' ? stackInputsResult.value : null;

  const spxClose = stackInputs?.spxPrice ?? null;
  const spx200sma = stackInputs?.spx200sma ?? null;
  const spxVs200smaPct =
    spxClose != null && spx200sma != null && spx200sma > 0
      ? parseFloat((((spxClose - spx200sma) / spx200sma) * 100).toFixed(2))
      : null;
  const vixSpot = stackInputs?.vixLevel ?? null;
  const vvixClose = stackInputs?.vvixLevel ?? null;
  const dxyLevel = stackInputs?.dxyLevel ?? null;
  const pctAbove200sma = stackInputs?.breadthPctAbove200 ?? null;
  sources.stackInputs = stackInputs ? 'ok' : 'error';

  // ── Enhanced GEX (net + gamma flip + call/put walls) ───────────────────────
  let gexLevels: GEXLevels = { net: 0, gammaFlip: null, callWall: null, putWall: null, regime: 'positive' };
  if (snapshotResult.status === 'fulfilled' && snapshotResult.value) {
    const snap = snapshotResult.value;
    if (snap.optionChain.length > 20 && snap.spx.price > 0) {
      gexLevels = computeGexEnhanced(snap.optionChain, snap.spx.price);
      sources.gex = 'ok';
    } else {
      // Fall back to stack inputs net GEX
      gexLevels.net = stackInputs?.gexValue ?? 0;
      gexLevels.regime = gexLevels.net >= 0 ? 'positive' : 'negative';
      sources.gex = 'error';
    }
  } else {
    gexLevels.net = stackInputs?.gexValue ?? 0;
    gexLevels.regime = gexLevels.net >= 0 ? 'positive' : 'negative';
    sources.gex = 'error';
  }

  // ── VIX Term Structure ────────────────────────────────────────────────────
  const vix9d = vix9dResult.status === 'fulfilled' ? vix9dResult.value : null;
  const vix3m = vix3mResult.status === 'fulfilled' ? vix3mResult.value : null;
  sources.vix9d = vix9d != null ? 'ok' : 'error';
  sources.vix3m = vix3m != null ? 'ok' : 'error';

  const vixTermStructure = classifyVIXTermStructure(vix9d, vixSpot, vix3m);
  const vix9dVsVix30Spread =
    vix9d != null && vix3m != null
      ? parseFloat((vix9d - vix3m).toFixed(2))
      : null;

  // ── Overnight ES/NQ ───────────────────────────────────────────────────────
  const spxHistory = spxHistResult.status === 'fulfilled' ? spxHistResult.value : null;
  const priorClose = spxHistory && spxHistory.length >= 2 ? spxHistory[spxHistory.length - 2] : null;

  const esIntraday = esIntradayResult.status === 'fulfilled' ? esIntradayResult.value : null;
  const nqIntraday = nqIntradayResult.status === 'fulfilled' ? nqIntradayResult.value : null;

  let esOvernightHigh: number | null = null;
  let esOvernightLow: number | null = null;
  let esCurrentPrice: number | null = null;
  let gapVsPriorClose: number | null = null;
  let gapPct: number | null = null;
  let overnightType: OvernightType | null = null;

  if (esIntraday && esIntraday.length > 0) {
    const esOvernight = extractOvernightRange(esIntraday, priorClose ?? null);
    esOvernightHigh = esOvernight.esHigh;
    esOvernightLow = esOvernight.esLow;
    esCurrentPrice = esOvernight.esCurrent;
    gapVsPriorClose = esOvernight.gapVsPriorClose;
    gapPct = esOvernight.gapPct;
    overnightType = esOvernight.overnightType;
    sources.esOvernight = 'ok';
  } else {
    sources.esOvernight = 'error';
  }

  let nqOvernightHigh: number | null = null;
  let nqOvernightLow: number | null = null;
  if (nqIntraday && nqIntraday.length > 0) {
    const overnightBars = nqIntraday.filter(({ ts }) => {
      const hour = new Date(ts * 1000).getUTCHours();
      return hour < 13 || hour >= 20;
    });
    const bars = overnightBars.length > 3 ? overnightBars : nqIntraday;
    nqOvernightHigh = Math.max(...bars.map(b => b.high));
    nqOvernightLow = Math.min(...bars.map(b => b.low));
    sources.nqOvernight = 'ok';
  } else {
    sources.nqOvernight = 'error';
  }

  // ── Dark Pool Flow ─────────────────────────────────────────────────────────
  let darkPoolBias: DarkPoolBias = 'neutral';
  let darkPoolCallPct = 50;
  let darkPoolIsManual = false;

  if (darkPoolOverride) {
    darkPoolBias = darkPoolOverride.bias;
    darkPoolCallPct = darkPoolOverride.callPct;
    darkPoolIsManual = true;
    sources.darkPool = 'manual';
  } else {
    // No free Unusual Whales API — default to neutral, require manual input
    sources.darkPool = 'manual';
  }

  // ── A/D Ratio ─────────────────────────────────────────────────────────────
  const adRatio = adRatioResult.status === 'fulfilled' ? adRatioResult.value : null;
  sources.adRatio = adRatio != null ? 'ok' : 'error';

  // ── HY Spread ─────────────────────────────────────────────────────────────
  const hyData = hyResult.status === 'fulfilled' ? hyResult.value : null;
  const hySpreadBps = hyData?.current ?? stackInputs?.hySpreadBps ?? null;
  const hySpread2wkChange = hyData?.twoWeekChange ?? stackInputs?.hySpread2wkChange ?? null;
  sources.hySpread = hySpreadBps != null ? 'ok' : 'error';

  // ── Catalyst Risk — check economic_calendar DB ────────────────────────────
  // Imported lazily to avoid circular deps; uses direct DB query
  let catalystRisk = false;
  let catalystDetail = '';
  const nextSessionEvents: CatalystEvent[] = [];

  try {
    const { db } = await import('../database/db');
    const { economicCalendar } = await import('../database/schema');
    const { gte, lte, eq } = await import('drizzle-orm');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayStart = new Date(tomorrow);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await db
      .select()
      .from(economicCalendar)
      .where(gte(economicCalendar.eventDate, dayStart));

    for (const ev of events.slice(0, 10)) {
      const evDate = new Date(ev.eventDate);
      if (evDate <= dayEnd) {
        nextSessionEvents.push({
          type: ev.eventType,
          title: ev.title,
          time: evDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }),
          importance: (ev.importance as 'low' | 'medium' | 'high') ?? 'medium',
        });
        if (ev.importance === 'high') {
          catalystRisk = true;
          catalystDetail += `${ev.eventType}: ${ev.title}; `;
        }
      }
    }
    catalystDetail = catalystDetail.trim().replace(/;$/, '');
    sources.catalyst = 'ok';
  } catch {
    sources.catalyst = 'error';
  }

  // ── Compute Tier ──────────────────────────────────────────────────────────
  const partialSignals = {
    gexNet: gexLevels.net,
    gammaFlipLevel: gexLevels.gammaFlip,
    callWall: gexLevels.callWall,
    putWall: gexLevels.putWall,
    gexRegime: gexLevels.regime,
    vixSpot,
    vvixClose,
    vix9d,
    vix3m,
    vixTermStructure,
    vix9dVsVix30Spread,
    esOvernightHigh,
    esOvernightLow,
    esCurrentPrice,
    nqOvernightHigh,
    nqOvernightLow,
    gapVsPriorClose,
    gapPct,
    overnightType,
    darkPoolBias,
    darkPoolCallPct,
    darkPoolIsManual,
    catalystRisk,
    catalystDetail,
    nextSessionEvents,
    adRatio,
    pctAbove200sma,
    spxClose,
    spx200sma,
    spxVs200smaPct,
    hySpreadBps,
    hySpread2wkChange,
    dxyLevel,
  };

  const tierResult = computeInstitutionalTier(partialSignals);

  return {
    ...partialSignals,
    tierScore: tierResult.tier,
    tierRationale: tierResult.rationale,
    tierRules: tierResult.rules,
    fetchedAt: Date.now(),
    sources,
  };
}
