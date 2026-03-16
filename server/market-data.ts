/**
 * Market Data Aggregator
 * Fetches SPX, VIX, options chain data from multiple providers
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
// Tradier API (primary for options data)
// ─────────────────────────────────────────────

const TRADIER_BASE = 'https://api.tradier.com/v1';
const TRADIER_KEY = process.env.TRADIER_API_KEY;

async function fetchTradierQuote(symbols: string[]): Promise<Record<string, MarketQuote>> {
  if (!TRADIER_KEY) return {};

  try {
    const resp = await axios.get(`${TRADIER_BASE}/markets/quotes`, {
      params: { symbols: symbols.join(','), greeks: 'true' },
      headers: { Authorization: `Bearer ${TRADIER_KEY}`, Accept: 'application/json' },
      timeout: 5000,
    });

    const quotes: Record<string, MarketQuote> = {};
    const rawQuotes = resp.data?.quotes?.quote;
    const items = Array.isArray(rawQuotes) ? rawQuotes : [rawQuotes];

    for (const q of items) {
      if (!q) continue;
      quotes[q.symbol] = {
        symbol: q.symbol,
        price: q.last || q.close || 0,
        change: q.change || 0,
        changePct: q.change_percentage || 0,
        high: q.high || 0,
        low: q.low || 0,
        open: q.open || 0,
        volume: q.volume || 0,
        timestamp: Date.now(),
      };
    }

    return quotes;
  } catch (err) {
    console.error('Tradier quote fetch failed:', err);
    return {};
  }
}

async function fetchTradierOptionChain(
  symbol: string,
  expiration: string
): Promise<OptionChainEntry[]> {
  if (!TRADIER_KEY) return [];

  try {
    const resp = await axios.get(`${TRADIER_BASE}/markets/options/chains`, {
      params: { symbol, expiration, greeks: 'true' },
      headers: { Authorization: `Bearer ${TRADIER_KEY}`, Accept: 'application/json' },
      timeout: 8000,
    });

    const options = resp.data?.options?.option;
    if (!options) return [];

    const items = Array.isArray(options) ? options : [options];
    const chainMap = new Map<number, OptionChainEntry>();

    for (const opt of items) {
      if (!opt?.strike) continue;
      const strike = opt.strike;

      if (!chainMap.has(strike)) {
        const dte = Math.max(0, Math.round(
          (new Date(expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ));
        chainMap.set(strike, {
          strike,
          expiry: expiration,
          daysToExpiry: dte,
          callBid: 0, callAsk: 0, callLast: 0, callIV: 0, callDelta: 0, callVolume: 0, callOI: 0,
          putBid: 0, putAsk: 0, putLast: 0, putIV: 0, putDelta: 0, putVolume: 0, putOI: 0,
        });
      }

      const entry = chainMap.get(strike)!;
      if (opt.option_type === 'call') {
        entry.callBid = opt.bid || 0;
        entry.callAsk = opt.ask || 0;
        entry.callLast = opt.last || 0;
        entry.callIV = opt.greeks?.mid_iv || 0;
        entry.callDelta = opt.greeks?.delta || 0;
        entry.callVolume = opt.volume || 0;
        entry.callOI = opt.open_interest || 0;
      } else {
        entry.putBid = opt.bid || 0;
        entry.putAsk = opt.ask || 0;
        entry.putLast = opt.last || 0;
        entry.putIV = opt.greeks?.mid_iv || 0;
        entry.putDelta = opt.greeks?.delta || 0;
        entry.putVolume = opt.volume || 0;
        entry.putOI = opt.open_interest || 0;
      }
    }

    return Array.from(chainMap.values()).sort((a, b) => a.strike - b.strike);
  } catch (err) {
    console.error('Tradier option chain fetch failed:', err);
    return [];
  }
}

async function fetchTradierExpirations(symbol: string): Promise<string[]> {
  if (!TRADIER_KEY) return [];

  try {
    const resp = await axios.get(`${TRADIER_BASE}/markets/options/expirations`, {
      params: { symbol, includeAllRoots: 'true' },
      headers: { Authorization: `Bearer ${TRADIER_KEY}`, Accept: 'application/json' },
      timeout: 5000,
    });

    return resp.data?.expirations?.date || [];
  } catch {
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

  // Monday=1 through Friday=5
  if (day < 1 || day > 5) return false;
  return timeNum >= 930 && timeNum < 1600;
}

export function getNextExpiry(daysOut: number = 7): string {
  const today = new Date();
  const target = new Date(today);
  target.setDate(target.getDate() + daysOut);

  // Find next Friday
  const day = target.getDay();
  const daysToFriday = day <= 5 ? 5 - day : 6;
  target.setDate(target.getDate() + daysToFriday);

  return target.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// Main aggregator
// ─────────────────────────────────────────────

export async function fetchMarketSnapshot(): Promise<MarketDataSnapshot> {
  const symbols = ['^SPX', 'SPY', '^VIX'];

  // Fetch quotes
  const quotes = await fetchTradierQuote(['SPY', 'VIX']);

  // If Tradier fails, try Alpha Vantage
  let spxPrice = 0, spyPrice = 0, vixValue = 0;

  if (quotes['SPY']) {
    spyPrice = quotes['SPY'].price;
    // SPX ≈ SPY * 10 (rough approximation when SPX not directly available)
    spxPrice = spyPrice * 10.05;
  }
  if (quotes['VIX']) {
    vixValue = quotes['VIX'].price;
  }

  // Fallback to Alpha Vantage
  if (!spyPrice) {
    const spyQuote = await fetchAlphaVantageQuote('SPY');
    if (spyQuote) {
      spyPrice = spyQuote.price;
      spxPrice = spyPrice * 10.05;
    }
  }

  // Fetch option chain for nearest expiry
  const expiry = getNextExpiry(7);
  const optionChain = await fetchTradierOptionChain('SPX', expiry);

  const spxQuote: MarketQuote = {
    symbol: 'SPX',
    price: spxPrice || 5800,
    change: 0, changePct: 0, high: 0, low: 0, open: 0, volume: 0,
    timestamp: Date.now(),
  };

  const spyQuote: MarketQuote = {
    symbol: 'SPY',
    price: spyPrice || 580,
    change: quotes['SPY']?.change || 0,
    changePct: quotes['SPY']?.changePct || 0,
    high: quotes['SPY']?.high || 0,
    low: quotes['SPY']?.low || 0,
    open: quotes['SPY']?.open || 0,
    volume: quotes['SPY']?.volume || 0,
    timestamp: Date.now(),
  };

  const vixQuote: MarketQuote = {
    symbol: 'VIX',
    price: vixValue || 18,
    change: quotes['VIX']?.change || 0,
    changePct: quotes['VIX']?.changePct || 0,
    high: quotes['VIX']?.high || 0,
    low: quotes['VIX']?.low || 0,
    open: quotes['VIX']?.open || 0,
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
