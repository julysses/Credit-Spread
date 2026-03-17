/**
 * Market Data Aggregator
 * Fetches SPX, VIX, options chain data from MarketData.app (primary)
 * Falls back to Alpha Vantage for quotes when needed.
 */

import axios from 'axios';

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

export interface MarketDataSnapshot {
  spx: MarketQuote;
  spy: MarketQuote;
  vix: MarketQuote;
  optionChain: OptionChainEntry[];
  fetchedAt: number;
  isMarketOpen: boolean;
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

  // Fetch SPX, VIX, SPY, and option chain all in parallel
  const [spxRaw, vixRaw, spyRaw, optionChain] = await Promise.all([
    fetchMDIndexQuote('SPX'),
    fetchMDIndexQuote('VIX'),
    fetchMDStockQuote('SPY'),
    fetchMDOptionChain('SPX', expiry),
  ]);

  // Fallback to Alpha Vantage for SPY if MarketData fails
  const spyFallback = (!spyRaw || spyRaw.price === 0)
    ? await fetchAlphaVantageQuote('SPY')
    : null;

  const spyData = spyRaw ?? spyFallback;
  const spyPrice = spyData?.price ?? 0;
  const spxPrice = spxRaw?.price ?? (spyPrice * 10.05 || 5800);

  // VIX: use live price, or derive from option chain ATM IV, or fall back to 18
  let vixValue = vixRaw?.price ?? 0;
  if (!vixValue && optionChain.length > 0) {
    const atmOptions = optionChain.filter(
      o => Math.abs(o.strike - spxPrice) / spxPrice < 0.015 && o.putIV > 0
    );
    if (atmOptions.length > 0) {
      const avgIV = atmOptions.reduce((s, o) => s + o.putIV, 0) / atmOptions.length;
      vixValue = parseFloat((avgIV * 100).toFixed(2));
      console.log(`VIX derived from ATM put IV: ${vixValue}`);
    }
  }
  if (!vixValue) {
    console.warn('VIX fallback to 18 — live and chain-derived data unavailable');
    vixValue = 18;
  }

  const spxQuote: MarketQuote = {
    symbol: 'SPX',
    price: spxPrice,
    change: spxRaw?.change ?? 0,
    changePct: spxRaw?.changePct ?? 0,
    high: spxRaw?.high ?? 0,
    low: spxRaw?.low ?? 0,
    open: spxRaw?.open ?? 0,
    volume: 0,
    timestamp: Date.now(),
  };

  const spyQuote: MarketQuote = {
    symbol: 'SPY',
    price: spyPrice || 580,
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
    change: vixRaw?.change ?? 0,
    changePct: vixRaw?.changePct ?? 0,
    high: vixRaw?.high ?? 0,
    low: vixRaw?.low ?? 0,
    open: vixRaw?.open ?? 0,
    volume: 0,
    timestamp: Date.now(),
  };

  return {
    spx: spxQuote,
    spy: spyQuote,
    vix: vixQuote,
    optionChain,
    fetchedAt: Date.now(),
    isMarketOpen: isMarketOpen(),
  };
}

/**
 * Mock data for development/demo when API keys not configured
 */
export function getMockMarketData(): MarketDataSnapshot {
  const spxPrice = 5820 + (Math.random() - 0.5) * 50;

  const chain: OptionChainEntry[] = [];
  const expiry = getNextExpiry(7);
  const dte = 7;

  for (let strike = spxPrice - 200; strike <= spxPrice + 200; strike += 5) {
    const moneyness = Math.abs(strike - spxPrice) / spxPrice;
    const baseIV = 0.18 + moneyness * 0.1;
    const putSkew = strike < spxPrice ? 0.02 * ((spxPrice - strike) / 50) : 0;

    chain.push({
      strike: Math.round(strike / 5) * 5,
      expiry,
      daysToExpiry: dte,
      callBid: Math.max(0, (spxPrice - strike) * 0.01 + 2),
      callAsk: Math.max(0, (spxPrice - strike) * 0.01 + 2.2),
      callLast: Math.max(0, (spxPrice - strike) * 0.01 + 2.1),
      callIV: baseIV,
      callDelta: strike > spxPrice ? -0.2 : 0.5,
      callVolume: Math.floor(Math.random() * 1000),
      callOI: Math.floor(Math.random() * 5000),
      putBid: Math.max(0, (strike - spxPrice) * 0.01 + 2),
      putAsk: Math.max(0, (strike - spxPrice) * 0.01 + 2.2),
      putLast: Math.max(0, (strike - spxPrice) * 0.01 + 2.1),
      putIV: baseIV + putSkew,
      putDelta: strike < spxPrice ? -0.2 : -0.05,
      putVolume: Math.floor(Math.random() * 1200),
      putOI: Math.floor(Math.random() * 6000),
    });
  }

  return {
    spx: { symbol: 'SPX', price: spxPrice, change: -12.5, changePct: -0.21, high: spxPrice + 20, low: spxPrice - 30, open: spxPrice + 5, volume: 0, timestamp: Date.now() },
    spy: { symbol: 'SPY', price: spxPrice / 10, change: -1.2, changePct: -0.21, high: (spxPrice + 20) / 10, low: (spxPrice - 30) / 10, open: (spxPrice + 5) / 10, volume: 85000000, timestamp: Date.now() },
    vix: { symbol: 'VIX', price: 18.5, change: 0.8, changePct: 4.5, high: 19.2, low: 17.8, open: 17.7, volume: 0, timestamp: Date.now() },
    optionChain: chain,
    fetchedAt: Date.now(),
    isMarketOpen: isMarketOpen(),
  };
}
