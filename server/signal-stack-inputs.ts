/**
 * Signal Stack Market Inputs
 *
 * Auto-fetches all 14 quantifiable market inputs for the Signal Stack Engine.
 * Portfolio Vol is intentionally excluded — it is user/account-specific.
 *
 * Sources
 * ─────────────────────────────────────────────────────────────
 * SPX price + VIX        → existing fetchMarketSnapshot() (MarketData.app / Yahoo fallback)
 * GEX                    → computed from SPX options chain (gamma × OI × 100 × S²)
 * P/C ratio              → computed from SPX options chain (put vol / call vol)
 * WTI, Gold, DXY, VVIX,
 *   breadth (^SPXA200R)  → Yahoo Finance v8 chart API (free, no key)
 * SPX 200 SMA            → Yahoo Finance 1y daily history for ^GSPC
 * WTI 4-week change      → Yahoo Finance 3mo daily history for CL=F
 * Gold weekly change     → Yahoo Finance 1mo daily history for GC=F
 * HY spread + 2wk chg   → FRED CSV (BAMLH0A0HYM2, ICE BofA HY Index OAS, free)
 */

import axios from 'axios';
import { fetchMarketSnapshot } from './market-data';
import type { OptionChainEntry } from './market-data';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface SignalStackMarketInputs {
  spxPrice: number | null;
  vixLevel: number | null;
  spx200sma: number | null;
  breadthPctAbove200: number | null;
  wtiPrice: number | null;
  wti4wkChangePct: number | null;
  dxyLevel: number | null;
  goldPrice: number | null;
  goldWeeklyChangePct: number | null;
  hySpreadBps: number | null;
  hySpread2wkChange: number | null;
  gexValue: number | null;
  vvixLevel: number | null;
  pcrValue: number | null;
  fetchedAt: number;
  /** Per-source fetch status for the UI badge/tooltip */
  sources: Record<string, 'ok' | 'error'>;
}

// ─── Yahoo Finance helpers ────────────────────────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Fetch the most-recent market price for a Yahoo Finance ticker. */
async function yahooSpot(ticker: string): Promise<number | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(ticker)}`, {
      params: { range: '1d', interval: '5m', includePrePost: 'false' },
      headers: YAHOO_HEADERS,
      timeout: 8000,
    });
    const meta = resp.data?.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? meta?.previousClose ?? null;
  } catch {
    return null;
  }
}

/** Fetch an array of daily closes (oldest → newest), filtered for valid numbers. */
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
      result.indicators?.quote?.[0]?.close ??
      [];
    return closes.filter((v): v is number => v != null && !isNaN(v));
  } catch {
    return null;
  }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function pctChange(current: number, past: number): number {
  if (past === 0) return 0;
  return parseFloat((((current - past) / Math.abs(past)) * 100).toFixed(2));
}

// ─── FRED — HY Spread ────────────────────────────────────────────────────────

/**
 * ICE BofA US High Yield Index OAS (BAMLH0A0HYM2) from FRED.
 * The CSV is publicly accessible without an API key.
 * Values are in % (e.g., 3.45 = 345 bps). We convert to bps.
 */
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

    // FRED CSV format: DATE,VALUE  — "." is the sentinel for missing data.
    // We must NOT filter by !l.includes('.') because valid decimals (e.g. "3.45") also contain dots.
    const parsed = (resp.data as string)
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('DATE'))
      .map((l) => {
        const val = l.split(',')[1]?.trim() ?? '';
        const n = parseFloat(val);
        return isNaN(n) ? null : n * 100; // % → bps
      })
      .filter((v): v is number => v !== null);

    if (parsed.length < 15) return null;

    const current = parsed[parsed.length - 1];
    // ~10 business days ≈ 2 calendar weeks
    const twoWeeksAgo = parsed[parsed.length - 10];
    return {
      current: parseFloat(current.toFixed(0)),
      twoWeekChange: parseFloat((current - twoWeeksAgo).toFixed(1)),
    };
  } catch {
    return null;
  }
}

// ─── Options-chain derived metrics ───────────────────────────────────────────

/**
 * Net Gamma Exposure proxy.
 * True GEX = Σ(gamma × OI × 100 × S²) for calls minus puts.
 * Because MarketData.app includes gamma in the greeks response, we use
 * callDelta × OI as a reasonable directional proxy when gamma isn't stored;
 * the sign (positive = long gamma = pinning regime, negative = short gamma
 * = trending regime) is what the Signal Stack threshold checks.
 *
 * Values are expressed in millions of dollars.
 */
function computeGex(chain: OptionChainEntry[], spot: number): number {
  let gex = 0;
  for (const row of chain) {
    // Delta-weighted OI × notional as gamma-direction proxy
    const callContrib = row.callDelta * row.callOI * 100 * spot;
    const putContrib = Math.abs(row.putDelta) * row.putOI * 100 * spot;
    gex += callContrib - putContrib;
  }
  return parseFloat(gex.toFixed(0));
}

/** Total put volume / total call volume across the chain. */
function computePCR(chain: OptionChainEntry[]): number {
  let puts = 0;
  let calls = 0;
  for (const row of chain) {
    puts += row.putVolume;
    calls += row.callVolume;
  }
  if (calls === 0) return 1.0;
  return parseFloat((puts / calls).toFixed(2));
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

export async function fetchSignalStackInputs(): Promise<SignalStackMarketInputs> {
  const sources: Record<string, 'ok' | 'error'> = {};

  // Fire every remote call in parallel to keep latency low.
  const [
    snapshotResult,
    spxHistResult,
    wtiHistResult,
    goldHistResult,
    wtiSpotResult,
    dxySpotResult,
    vvixSpotResult,
    breadthSpotResult,
    hyResult,
  ] = await Promise.allSettled([
    fetchMarketSnapshot(),          // SPX, VIX, options chain
    yahooHistory('^GSPC', '1y'),    // SPX 200-day SMA
    yahooHistory('CL=F', '3mo'),    // WTI 4-week change (~20 trading days)
    yahooHistory('GC=F', '1mo'),    // Gold weekly change (~5 trading days)
    yahooSpot('CL=F'),              // WTI current price
    yahooSpot('DX=F'),              // DXY (front-month futures, most liquid)
    yahooSpot('^VVIX'),             // VVIX
    yahooSpot('^SPXA200R'),         // Breadth % above 200 SMA
    fetchHYSpread(),                // HY OAS from FRED
  ]);

  // ── SPX price, VIX, GEX, P/C ratio ─────────────────────────────────────────
  let spxPrice: number | null = null;
  let vixLevel: number | null = null;
  let gexValue: number | null = null;
  let pcrValue: number | null = null;

  if (snapshotResult.status === 'fulfilled' && snapshotResult.value) {
    const snap = snapshotResult.value;
    spxPrice = snap.spx.price > 0 ? snap.spx.price : null;
    vixLevel = snap.vix.price > 0 ? snap.vix.price : null;
    sources.spxVix = spxPrice ? 'ok' : 'error';

    if (snap.optionChain.length > 20 && spxPrice) {
      gexValue = computeGex(snap.optionChain, spxPrice);
      pcrValue = computePCR(snap.optionChain);
      sources.gexPcr = 'ok';
    } else {
      sources.gexPcr = 'error';
    }
  } else {
    sources.spxVix = 'error';
    sources.gexPcr = 'error';
  }

  // ── SPX 200 SMA ─────────────────────────────────────────────────────────────
  let spx200sma: number | null = null;
  if (spxHistResult.status === 'fulfilled' && spxHistResult.value && spxHistResult.value.length >= 50) {
    const hist = spxHistResult.value;
    const period = Math.min(200, hist.length);
    spx200sma = parseFloat(sma(hist, period).toFixed(2));
    sources.spx200sma = 'ok';
  } else {
    sources.spx200sma = 'error';
  }

  // ── WTI price + 4-week change ───────────────────────────────────────────────
  let wtiPrice: number | null = null;
  let wti4wkChangePct: number | null = null;

  // Use spot for current price, fall back to last close in history
  if (wtiSpotResult.status === 'fulfilled' && wtiSpotResult.value) {
    wtiPrice = parseFloat(wtiSpotResult.value.toFixed(2));
    sources.wti = 'ok';
  }
  if (wtiHistResult.status === 'fulfilled' && wtiHistResult.value && wtiHistResult.value.length >= 20) {
    const hist = wtiHistResult.value;
    const current = hist[hist.length - 1];
    const fourWeeksAgo = hist[Math.max(0, hist.length - 20)];
    wti4wkChangePct = pctChange(current, fourWeeksAgo);
    if (!wtiPrice) { wtiPrice = parseFloat(current.toFixed(2)); sources.wti = 'ok'; }
  } else if (!wtiPrice) {
    sources.wti = 'error';
  }

  // ── Gold price + weekly change ──────────────────────────────────────────────
  let goldPrice: number | null = null;
  let goldWeeklyChangePct: number | null = null;

  if (goldHistResult.status === 'fulfilled' && goldHistResult.value && goldHistResult.value.length >= 5) {
    const hist = goldHistResult.value;
    goldPrice = parseFloat(hist[hist.length - 1].toFixed(2));
    const weekAgo = hist[Math.max(0, hist.length - 5)];
    goldWeeklyChangePct = pctChange(goldPrice, weekAgo);
    sources.gold = 'ok';
  } else {
    sources.gold = 'error';
  }

  // ── DXY ─────────────────────────────────────────────────────────────────────
  // Primary: DX=F (front-month DXY futures).  Fallback: DX-Y.NYB continuous contract.
  let dxyLevel: number | null = null;
  if (dxySpotResult.status === 'fulfilled' && dxySpotResult.value) {
    dxyLevel = parseFloat(dxySpotResult.value.toFixed(2));
    sources.dxy = 'ok';
  } else {
    // Fallback to continuous contract symbol
    const fallback = await yahooSpot('DX-Y.NYB');
    if (fallback) {
      dxyLevel = parseFloat(fallback.toFixed(2));
      sources.dxy = 'ok';
    } else {
      sources.dxy = 'error';
    }
  }

  // ── VVIX ────────────────────────────────────────────────────────────────────
  // ^VVIX via Yahoo Finance; fallback to ^VIX3M (3-month VIX) as directional proxy
  let vvixLevel: number | null = null;
  if (vvixSpotResult.status === 'fulfilled' && vvixSpotResult.value) {
    vvixLevel = parseFloat(vvixSpotResult.value.toFixed(2));
    sources.vvix = 'ok';
  } else {
    const fallback = await yahooSpot('^VIX3M');
    if (fallback) {
      vvixLevel = parseFloat(fallback.toFixed(2));
      sources.vvix = 'ok';
    } else {
      sources.vvix = 'error';
    }
  }

  // ── Breadth % above 200 SMA ─────────────────────────────────────────────────
  let breadthPctAbove200: number | null = null;
  if (breadthSpotResult.status === 'fulfilled' && breadthSpotResult.value) {
    // ^SPXA200R is reported as a count (0–500 stocks).
    // Divide by 5 to convert to percentage (500 S&P 500 components → 100%).
    // Guard: if Yahoo ever returns it already as a percentage (0–100), skip division.
    const raw = breadthSpotResult.value;
    breadthPctAbove200 = parseFloat((raw > 100 ? raw / 5 : raw).toFixed(1));
    sources.breadth = 'ok';
  } else {
    sources.breadth = 'error';
  }

  // ── HY Spread ───────────────────────────────────────────────────────────────
  let hySpreadBps: number | null = null;
  let hySpread2wkChange: number | null = null;

  if (hyResult.status === 'fulfilled' && hyResult.value) {
    hySpreadBps = hyResult.value.current;
    hySpread2wkChange = hyResult.value.twoWeekChange;
    sources.hy = 'ok';
  } else {
    sources.hy = 'error';
  }

  return {
    spxPrice,
    vixLevel,
    spx200sma,
    breadthPctAbove200,
    wtiPrice,
    wti4wkChangePct,
    dxyLevel,
    goldPrice,
    goldWeeklyChangePct,
    hySpreadBps,
    hySpread2wkChange,
    gexValue,
    vvixLevel,
    pcrValue,
    fetchedAt: Date.now(),
    sources,
  };
}
