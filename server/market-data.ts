/**
 * Market Data Aggregator
 * Fetches SPX, VIX, options chain data from MarketData.app (primary)
 * Falls back to Alpha Vantage for quotes when needed.
 */

import axios from 'axios';
import { fetchAlpacaSnapshots, snapshotToQuote, alpacaConfigured } from './alpaca';
import { fetchYahooOptionChain } from './yahoo-options';

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  timestamp: number;
}

export interface OptionChainEntry {
  strike: number;
  expiry: string;
  daysToExpiry: number;
  callBid: number;
  callAsk: number;
  callLast: number;
  callIV: number;
  callDelta: number;
  callVolume: number;
  callOI: number;
  putBid: number;
  putAsk: number;
  putLast: number;
  putIV: number;
  putDelta: number;
  putVolume: number;
  putOI: number;
}

export type ProviderMode = 'spx_pro' | 'spy_free' | 'analytics_only';
export type TradeInstrument = 'SPX' | 'SPY' | null;

export interface MarketDataSnapshot {
  spx: MarketQuote;
  spy: MarketQuote;
  vix: MarketQuote;
  optionChain: OptionChainEntry[];
  fetchedAt: number;
  isMarketOpen: boolean;
  realizedVol?: number;         // 20-day annualized HV (0-1 decimal, e.g. 0.14 = 14%)
  sources?: Record<string, string>;
  providerMode: ProviderMode;
  tradeInstrument: TradeInstrument;
  tradeable: boolean;
  assignmentRisk: boolean;
  taxTreatment: 'section_1256' | 'equity_option' | 'unknown';
  optionChainSource: string;
}

// ─────────────────────────────────────────────
// MarketData.app (primary)
// ─────────────────────────────────────────────

const MD_BASE = 'https://api.marketdata.app/v1';
const MD_KEY = process.env.MARKETDATA_API_KEY;

const mdHeaders = () => ({
  Authorization: `Token ${MD_KEY}`,
  Accept: 'application/json',
});

async function fetchMDIndexQuote(symbol: string): Promise<MarketQuote | null> {
  if (!MD_KEY) return null;

  try {
    const resp = await axios.get(`${MD_BASE}/indices/quotes/${symbol}/`, {
      headers: mdHeaders(),
      timeout: 5000,
    });

    const d = resp.data;
    if (d?.s !== 'ok') return null;

    return {
      symbol,
      price: d.last?.[0] ?? 0,
      change: d.change?.[0] ?? 0,
      changePct: d.changepct?.[0] ?? 0,
      high: d.high?.[0] ?? d['52weekHigh']?.[0] ?? 0,
      low: d.low?.[0] ?? d['52weekLow']?.[0] ?? 0,
      open: d.open?.[0] ?? 0,
      volume: 0,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error(`MarketData index quote failed (${symbol}):`, (err as Error).message);
    return null;
  }
}

async function fetchMDStockQuote(symbol: string): Promise<MarketQuote | null> {
  if (!MD_KEY) return null;

  try {
    const resp = await axios.get(`${MD_BASE}/stocks/quotes/${symbol}/`, {
      headers: mdHeaders(),
      timeout: 5000,
    });

    const d = resp.data;
    if (d?.s !== 'ok') return null;

    return {
      symbol,
      price: d.last?.[0] ?? 0,
      change: d.change?.[0] ?? 0,
      changePct: d.changepct?.[0] ?? 0,
      high: d.high?.[0] ?? d['52weekHigh']?.[0] ?? 0,
      low: d.low?.[0] ?? d['52weekLow']?.[0] ?? 0,
      open: d.open?.[0] ?? 0,
      volume: d.volume?.[0] ?? 0,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error(`MarketData stock quote failed (${symbol}):`, (err as Error).message);
    return null;
  }
}

async function fetchMDExpirations(symbol: string): Promise<string[]> {
  if (!MD_KEY) return [];

  try {
    const resp = await axios.get(`${MD_BASE}/options/expirations/${symbol}/`, {
      headers: mdHeaders(),
      timeout: 5000,
    });

    const d = resp.data;
    if (d?.s !== 'ok') return [];
    return d.expirations ?? [];
  } catch {
    return [];
  }
}

async function fetchMDOptionChain(
  symbol: string,
  expiration: string
): Promise<OptionChainEntry[]> {
  if (!MD_KEY) return [];

  try {
    const resp = await axios.get(`${MD_BASE}/options/chain/${symbol}/`, {
      headers: mdHeaders(),
      params: { expiration, greeks: 'true' },
      timeout: 10000,
    });

    const d = resp.data;
    if (d?.s !== 'ok' || !d.strike) return [];

    const chainMap = new Map<number, OptionChainEntry>();
    const count = d.strike.length;
    const dte = d.dte?.[0] ?? Math.max(0, Math.round(
      (new Date(expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ));

    for (let i = 0; i < count; i++) {
      const strike = d.strike[i];
      const side: string = d.side?.[i] ?? '';

      if (!chainMap.has(strike)) {
        chainMap.set(strike, {
          strike,
          expiry: expiration,
          daysToExpiry: dte,
          callBid: 0, callAsk: 0, callLast: 0, callIV: 0, callDelta: 0, callVolume: 0, callOI: 0,
          putBid: 0, putAsk: 0, putLast: 0, putIV: 0, putDelta: 0, putVolume: 0, putOI: 0,
        });
      }

      const entry = chainMap.get(strike)!;
      if (side === 'call') {
        entry.callBid = d.bid?.[i] ?? 0;
        entry.callAsk = d.ask?.[i] ?? 0;
        entry.callLast = d.last?.[i] ?? 0;
        entry.callIV = d.iv?.[i] ?? 0;
        entry.callDelta = d.delta?.[i] ?? 0;
        entry.callVolume = d.volume?.[i] ?? 0;
        entry.callOI = d.openInterest?.[i] ?? 0;
      } else if (side === 'put') {
        entry.putBid = d.bid?.[i] ?? 0;
        entry.putAsk = d.ask?.[i] ?? 0;
        entry.putLast = d.last?.[i] ?? 0;
        entry.putIV = d.iv?.[i] ?? 0;
        entry.putDelta = d.delta?.[i] ?? 0;
        entry.putVolume = d.volume?.[i] ?? 0;
        entry.putOI = d.openInterest?.[i] ?? 0;
      }
    }

    return Array.from(chainMap.values()).sort((a, b) => a.strike - b.strike);
  } catch (err) {
    console.error('MarketData option chain fetch failed:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// Yahoo Finance (secondary source — free, no auth)
// Uses v8/finance/chart which doesn't require a crumb/cookie
// ─────────────────────────────────────────────

const YAHOO_SYMBOL_MAP: Record<string, string> = { SPX: '%5EGSPC', VIX: '%5EVIX', SPY: 'SPY' };

async function fetchYahooChart(appSymbol: 'SPX' | 'VIX' | 'SPY'): Promise<MarketQuote | null> {
  const yahooSym = YAHOO_SYMBOL_MAP[appSymbol];
  try {
    const resp = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}`,
      {
        params: { range: '1d', interval: '1m', includePrePost: 'false' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 7000,
      }
    );

    const meta = resp.data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;

    const price: number = meta.regularMarketPrice;
    const prev: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    return {
      symbol: appSymbol,
      price,
      change,
      changePct,
      high: meta.regularMarketDayHigh ?? price,
      low: meta.regularMarketDayLow ?? price,
      open: meta.regularMarketOpen ?? price,
      volume: meta.regularMarketVolume ?? 0,
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
    };
  } catch (err) {
    console.error(`Yahoo Finance chart failed (${appSymbol}):`, (err as Error).message);
    return null;
  }
}

async function fetchYahooQuotes(
  symbols: ('SPX' | 'VIX' | 'SPY')[]
): Promise<Map<string, MarketQuote>> {
  const result = new Map<string, MarketQuote>();
  // Fetch all in parallel
  const results = await Promise.all(symbols.map(s => fetchYahooChart(s).then(q => ({ s, q }))));
  for (const { s, q } of results) {
    if (q) result.set(s, q);
  }
  return result;
}

// ─────────────────────────────────────────────
// Alpha Vantage (fallback for quotes)
// ─────────────────────────────────────────────

async function fetchAlphaVantageQuote(symbol: string): Promise<MarketQuote | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;

  try {
    const resp = await axios.get('https://www.alphavantage.co/query', {
      params: { function: 'GLOBAL_QUOTE', symbol, apikey: key },
      timeout: 5000,
    });

    const q = resp.data?.['Global Quote'];
    if (!q) return null;

    return {
      symbol,
      price: parseFloat(q['05. price']) || 0,
      change: parseFloat(q['09. change']) || 0,
      changePct: parseFloat(q['10. change percent']?.replace('%', '')) || 0,
      high: parseFloat(q['03. high']) || 0,
      low: parseFloat(q['04. low']) || 0,
      open: parseFloat(q['02. open']) || 0,
      volume: parseInt(q['06. volume']) || 0,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────
// Finnhub (free backup for quotes)
// ─────────────────────────────────────────────

const FINNHUB_SYMBOL_MAP: Record<string, string> = { SPX: '^GSPC', VIX: '^VIX', SPY: 'SPY' };

async function fetchFinnhubQuote(appSymbol: 'SPX' | 'VIX' | 'SPY'): Promise<MarketQuote | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const symbol = FINNHUB_SYMBOL_MAP[appSymbol];
    const resp = await axios.get('https://finnhub.io/api/v1/quote', {
      params: { symbol, token: key },
      timeout: 5000,
    });

    const q = resp.data;
    const price = Number(q?.c ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;

    const previousClose = Number(q?.pc ?? price);
    const change = Number(q?.d ?? price - previousClose);
    const changePct = Number(q?.dp ?? (previousClose ? change / previousClose * 100 : 0));

    return {
      symbol: appSymbol,
      price,
      change: Number.isFinite(change) ? change : 0,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      high: Number(q?.h ?? price) || price,
      low: Number(q?.l ?? price) || price,
      open: Number(q?.o ?? price) || price,
      volume: 0,
      timestamp: q?.t ? Number(q.t) * 1000 : Date.now(),
    };
  } catch (err) {
    console.error(`Finnhub quote failed (${appSymbol}):`, (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Realized Volatility (20-day HV, annualized)
// Primary: Yahoo Finance daily history (free, no auth)
// ─────────────────────────────────────────────

/**
 * Fetch 20-day historical realized volatility for SPX.
 * Uses Yahoo Finance /v8/finance/chart for daily closes (2-month range).
 * Computes: stddev of daily log returns × √252
 * Returns null if fetch fails or insufficient data.
 */
export async function fetchRealizedVol(): Promise<{ rv: number; source: string } | null> {
  try {
    const resp = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC',
      {
        params: { range: '2mo', interval: '1d', includePrePost: 'false' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 7000,
      }
    );

    const closes: number[] = resp.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c) => c != null && isFinite(c) && c > 0);

    if (valid.length < 22) {
      console.warn(`fetchRealizedVol: insufficient data (${valid.length} closes)`);
      return null;
    }

    // Use most recent 21 closes → 20 log-return pairs
    const recent = valid.slice(-21);
    const logReturns: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      logReturns.push(Math.log(recent[i] / recent[i - 1]));
    }

    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
    const hv20 = parseFloat((Math.sqrt(variance * 252)).toFixed(4));

    console.log(`fetchRealizedVol: 20-day HV = ${(hv20 * 100).toFixed(2)}% (Yahoo Finance)`);
    return { rv: hv20, source: 'Yahoo Finance (20-day HV)' };
  } catch (err) {
    console.error('fetchRealizedVol failed:', (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Option Chain Liquidity Filter
// Strips strikes with poor bid-ask quality or negligible OI
// ─────────────────────────────────────────────

/**
 * Liquidity thresholds for SPX options.
 * SPX options are among the most liquid in the world; these are
 * intentionally conservative to catch truly illiquid entries.
 */
const LIQUIDITY = {
  minPutOI: 10,                   // minimum open interest per side
  minCallOI: 10,
  maxSpreadPct: 0.30,             // max (ask - bid) / mid for either side
  minMid: 0.05,                   // ignore near-zero premium entries
} as const;

function calcMid(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

function isLiquidPut(entry: OptionChainEntry): boolean {
  const mid = calcMid(entry.putBid, entry.putAsk);
  if (mid < LIQUIDITY.minMid) return false;
  if (entry.putOI < LIQUIDITY.minPutOI) return false;
  const spread = entry.putAsk - entry.putBid;
  return spread / mid <= LIQUIDITY.maxSpreadPct;
}

function isLiquidCall(entry: OptionChainEntry): boolean {
  const mid = calcMid(entry.callBid, entry.callAsk);
  if (mid < LIQUIDITY.minMid) return false;
  if (entry.callOI < LIQUIDITY.minCallOI) return false;
  const spread = entry.callAsk - entry.callBid;
  return spread / mid <= LIQUIDITY.maxSpreadPct;
}

/**
 * Filter the raw option chain to only retain strikes where at least one
 * side (call or put) passes liquidity checks.  Entries where both sides
 * are illiquid / zero are removed from the surface and skew calculations.
 * Returns the filtered list and a quality label.
 */
export function filterLiquidChain(
  chain: OptionChainEntry[]
): { filtered: OptionChainEntry[]; quality: 'good' | 'thin' | 'missing' } {
  if (chain.length === 0) return { filtered: [], quality: 'missing' };

  const filtered = chain.filter((e) => isLiquidPut(e) || isLiquidCall(e));
  const pct = filtered.length / chain.length;

  const quality: 'good' | 'thin' | 'missing' =
    filtered.length === 0 ? 'missing' : pct >= 0.5 ? 'good' : 'thin';

  if (quality !== 'good') {
    console.warn(`filterLiquidChain: ${quality} — ${filtered.length}/${chain.length} strikes passed`);
  }

  return { filtered, quality };
}

// ─────────────────────────────────────────────
// Market Status
// ─────────────────────────────────────────────

export function isMarketOpen(): boolean {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = ny.getDay();
  const hour = ny.getHours();
  const min = ny.getMinutes();
  const timeNum = hour * 100 + min;

  if (day < 1 || day > 5) return false;
  return timeNum >= 930 && timeNum < 1600;
}

export function getNextExpiry(daysOut: number = 7): string {
  const today = new Date();
  const target = new Date(today);
  target.setDate(target.getDate() + daysOut);

  const day = target.getDay();
  const daysToFriday = day <= 5 ? 5 - day : 6;
  target.setDate(target.getDate() + daysToFriday);

  return target.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// Main aggregator
// ─────────────────────────────────────────────

export async function fetchMarketSnapshot(): Promise<MarketDataSnapshot> {
  const expiry = getNextExpiry(7);

  // Fetch MarketData.app (indices + SPX chain), Yahoo SPY chain, Alpaca SPY, and realized vol in parallel.
  const [spxRaw, vixRaw, spyRaw, rawSpxOptionChain, rawSpyOptionChain, alpacaSnaps, rvResult] = await Promise.all([
    fetchMDIndexQuote('SPX'),
    fetchMDIndexQuote('VIX'),
    fetchMDStockQuote('SPY'),
    fetchMDOptionChain('SPX', expiry),
    fetchYahooOptionChain('SPY', 7),
    alpacaConfigured() ? fetchAlpacaSnapshots(['SPY']) : Promise.resolve(new Map()),
    fetchRealizedVol(),
  ]);

  const { filtered: spxOptionChain, quality: spxChainQuality } = filterLiquidChain(rawSpxOptionChain);
  const { filtered: spyOptionChain, quality: spyChainQuality } = filterLiquidChain(rawSpyOptionChain);
  const providerMode: ProviderMode = spxOptionChain.length > 0 ? 'spx_pro' : spyOptionChain.length > 0 ? 'spy_free' : 'analytics_only';
  const tradeInstrument: TradeInstrument = providerMode === 'spx_pro' ? 'SPX' : providerMode === 'spy_free' ? 'SPY' : null;
  const optionChain = providerMode === 'spx_pro' ? spxOptionChain : providerMode === 'spy_free' ? spyOptionChain : [];
  const chainQuality = providerMode === 'spx_pro' ? spxChainQuality : providerMode === 'spy_free' ? spyChainQuality : 'missing';
  const optionChainSource = providerMode === 'spx_pro' ? `MarketData SPX (${spxChainQuality})` : providerMode === 'spy_free' ? `Yahoo Finance SPY (${spyChainQuality}, delayed/unofficial)` : 'unavailable — configure MARKETDATA_API_KEY or set ENABLE_YAHOO_OPTIONS=true for experimental Yahoo SPY options';

  // Alpaca SPY — most reliable real-time source for stock quotes
  const alpacaSpy = alpacaSnaps.get('SPY');
  const alpacaSpyQuote = alpacaSpy ? snapshotToQuote(alpacaSpy) : null;

  // Determine which symbols need a Yahoo Finance fallback
  // Also fetch Yahoo for SPX when high/low is missing (MarketData.app indices endpoint
  // often omits intraday H/L even when the price is valid)
  const needsYahoo: ('SPX' | 'VIX' | 'SPY')[] = [];
  if (!spxRaw || spxRaw.price === 0 || !spxRaw.high || !spxRaw.low) needsYahoo.push('SPX');
  if (!vixRaw || vixRaw.price === 0) needsYahoo.push('VIX');
  // SPY: skip Yahoo if Alpaca already has it
  if (!alpacaSpyQuote && (!spyRaw || spyRaw.price === 0)) needsYahoo.push('SPY');

  // Fallback: Yahoo Finance (free, no auth, delayed/unofficial)
  const yahooData = needsYahoo.length > 0
    ? await fetchYahooQuotes(needsYahoo)
    : new Map<string, MarketQuote>();

  const needsFinnhub = needsYahoo.filter(symbol => !yahooData.get(symbol));
  const finnhubResults = needsFinnhub.length > 0
    ? await Promise.all(needsFinnhub.map(symbol => fetchFinnhubQuote(symbol).then(q => ({ symbol, q }))))
    : [];
  const finnhubData = new Map<string, MarketQuote>();
  for (const { symbol, q } of finnhubResults) {
    if (q) finnhubData.set(symbol, q);
  }

  // Fallback chain for SPY: Alpaca → MarketData → Yahoo → Finnhub → Alpha Vantage
  let spyData: MarketQuote | null = null;
  if (alpacaSpyQuote && alpacaSpyQuote.price > 0) {
    spyData = {
      symbol: 'SPY',
      price: alpacaSpyQuote.price,
      change: alpacaSpyQuote.change,
      changePct: alpacaSpyQuote.changePct,
      high: alpacaSpyQuote.high,
      low: alpacaSpyQuote.low,
      open: alpacaSpyQuote.open,
      volume: alpacaSpyQuote.volume,
      timestamp: alpacaSpyQuote.timestamp,
    };
  } else if (spyRaw && spyRaw.price > 0) {
    spyData = spyRaw;
  } else if (yahooData.get('SPY')) {
    spyData = yahooData.get('SPY') ?? null;
  } else if (finnhubData.get('SPY')) {
    spyData = finnhubData.get('SPY') ?? null;
  } else {
    spyData = await fetchAlphaVantageQuote('SPY');
  }
  const spyPrice = spyData?.price ?? 0;

  // SPX: MarketData → Yahoo delayed. No synthetic/default price in production.
  const spxSource = (spxRaw && spxRaw.price > 0) ? spxRaw : yahooData.get('SPX') ?? finnhubData.get('SPX') ?? null;
  const spxPrice = spxSource?.price ?? 0;
  if (!spxSource) console.warn('SPX: unavailable from MarketData/Yahoo');

  // VIX: MarketData → Yahoo delayed. No hardcoded/default VIX in production.
  const vixSource = (vixRaw && vixRaw.price > 0) ? vixRaw : yahooData.get('VIX') ?? finnhubData.get('VIX') ?? null;
  const vixValue = vixSource?.price ?? 0;
  if (!vixSource) console.warn('VIX: unavailable from MarketData/Yahoo');

  const yahooSpx = yahooData.get('SPX');
  // Use live SPX/SPY ratio to estimate SPX H/L from Alpaca SPY bars (reliable fallback)
  const spxSpyRatio = spyPrice > 0 ? spxPrice / spyPrice : 10.05;
  const spxHighFallback = spyData?.high ? Math.round(spyData.high * spxSpyRatio * 100) / 100 : 0;
  const spxLowFallback  = spyData?.low  ? Math.round(spyData.low  * spxSpyRatio * 100) / 100 : 0;
  const spxOpenFallback = spyData?.open ? Math.round(spyData.open * spxSpyRatio * 100) / 100 : 0;

  const spxQuote: MarketQuote = {
    symbol: 'SPX',
    price: spxPrice,
    change: spxSource?.change ?? 0,
    changePct: spxSource?.changePct ?? 0,
    high: spxSource?.high || yahooSpx?.high || spxHighFallback,
    low: spxSource?.low  || yahooSpx?.low  || spxLowFallback,
    open: spxSource?.open || yahooSpx?.open || spxOpenFallback,
    volume: 0,
    timestamp: Date.now(),
  };

  const spyQuote: MarketQuote = {
    symbol: 'SPY',
    price: spyPrice,
    change: spyData?.change ?? 0,
    changePct: spyData?.changePct ?? 0,
    high: spyData?.high ?? 0,
    low: spyData?.low ?? 0,
    open: spyData?.open ?? 0,
    volume: spyData?.volume ?? 0,
    timestamp: Date.now(),
  };

  const vixQuote: MarketQuote = {
    symbol: 'VIX',
    price: vixValue,
    change: vixSource?.change ?? 0,
    changePct: vixSource?.changePct ?? 0,
    high: vixSource?.high ?? 0,
    low: vixSource?.low ?? 0,
    open: vixSource?.open ?? 0,
    volume: 0,
    timestamp: Date.now(),
  };

  const spxSourceLabel = spxSource ? (spxRaw?.price ? 'MarketData' : yahooData.get('SPX') ? 'Yahoo delayed' : 'Finnhub delayed') : 'unavailable';
  const vixSourceLabel = vixSource ? (vixRaw?.price ? 'MarketData' : yahooData.get('VIX') ? 'Yahoo delayed' : 'Finnhub delayed') : 'unavailable';
  const spySource = (alpacaSpyQuote && alpacaSpyQuote.price > 0) ? 'Alpaca' : spyRaw?.price ? 'MarketData' : yahooData.get('SPY') ? 'Yahoo delayed' : finnhubData.get('SPY') ? 'Finnhub delayed' : spyData ? 'Alpha Vantage delayed' : 'unavailable';
  const rvSource = rvResult ? rvResult.source : 'unavailable';
  console.log(`Market snapshot: SPX=${spxPrice} VIX=${vixValue} SPY=${spyPrice} | sources: SPX=${spxSourceLabel} VIX=${vixSourceLabel} SPY=${spySource} RV=${rvSource} chain=${chainQuality}`);

  return {
    spx: spxQuote,
    spy: spyQuote,
    vix: vixQuote,
    optionChain,
    fetchedAt: Date.now(),
    isMarketOpen: isMarketOpen(),
    realizedVol: rvResult?.rv,
    sources: {
      spx: spxSourceLabel,
      vix: vixSourceLabel,
      spy: spySource,
      optionChain: optionChain.length > 0 ? optionChainSource : 'unavailable',
      optionChainLiquidity: chainQuality,
      realizedVol: rvSource,
      providerMode,
      tradeInstrument: tradeInstrument ?? 'none',
    },
    providerMode,
    tradeInstrument,
    tradeable: optionChain.length > 0 && tradeInstrument !== null,
    assignmentRisk: tradeInstrument === 'SPY',
    taxTreatment: tradeInstrument === 'SPX' ? 'section_1256' : tradeInstrument === 'SPY' ? 'equity_option' : 'unknown',
    optionChainSource,
  };
}
