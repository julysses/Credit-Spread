import axios from 'axios';
import type { OptionChainEntry } from './market-data';

const YAHOO_OPTIONS_BASES = [
  'https://query2.finance.yahoo.com/v7/finance/options',
  'https://query1.finance.yahoo.com/v7/finance/options',
];

/**
 * Yahoo's options endpoint is now frequently protected by crumb/cookie checks
 * and returns 401/429 from server runtimes. Keep the adapter available for
 * local experiments, but do not call it by default in production/builds where
 * it creates noisy failures and an unreliable "free live" chain.
 */
const YAHOO_OPTIONS_ENABLED = process.env.ENABLE_YAHOO_OPTIONS === 'true';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

type YahooContract = {
  contractSymbol?: string;
  strike?: number;
  currency?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  change?: number;
  percentChange?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
  contractSize?: string;
  expiration?: number;
};

function expirationToDate(expiration: number): string {
  return new Date(expiration * 1000).toISOString().split('T')[0];
}

function daysToExpiry(expiration: number): number {
  return Math.max(0, Math.ceil((expiration * 1000 - Date.now()) / 86400000));
}

export async function fetchYahooOptionExpirations(symbol = 'SPY'): Promise<number[]> {
  if (!YAHOO_OPTIONS_ENABLED) return [];
  try {
    for (const base of YAHOO_OPTIONS_BASES) {
      try {
        const resp = await axios.get(`${base}/${symbol}`, {
          headers: YAHOO_HEADERS,
          timeout: 8000,
        });
        const expirations = resp.data?.optionChain?.result?.[0]?.expirationDates;
        if (Array.isArray(expirations)) return expirations.filter((v: unknown) => Number.isFinite(Number(v))).map(Number);
      } catch (err) {
        console.error(`Yahoo options expirations failed (${symbol}, ${base}):`, (err as Error).message);
      }
    }
    return [];
  } catch (err) {
    console.error(`Yahoo options expirations failed (${symbol}):`, (err as Error).message);
    return [];
  }
}

export async function fetchYahooOptionChain(symbol = 'SPY', targetDaysOut = 7): Promise<OptionChainEntry[]> {
  if (!YAHOO_OPTIONS_ENABLED) return [];
  const expirations = await fetchYahooOptionExpirations(symbol);
  if (expirations.length === 0) return [];

  const targetTs = Date.now() + targetDaysOut * 86400000;
  const expiration = expirations.reduce((best, exp) => {
    return Math.abs(exp * 1000 - targetTs) < Math.abs(best * 1000 - targetTs) ? exp : best;
  }, expirations[0]);

  try {
    let option: { calls?: YahooContract[]; puts?: YahooContract[] } | null = null;
    for (const base of YAHOO_OPTIONS_BASES) {
      try {
        const resp = await axios.get(`${base}/${symbol}`, {
          params: { date: expiration },
          headers: YAHOO_HEADERS,
          timeout: 10000,
        });
        option = resp.data?.optionChain?.result?.[0]?.options?.[0] ?? null;
        if (option) break;
      } catch (err) {
        console.error(`Yahoo options chain failed (${symbol}, ${base}):`, (err as Error).message);
      }
    }
    if (!option) return [];
    const calls: YahooContract[] = Array.isArray(option?.calls) ? option.calls : [];
    const puts: YahooContract[] = Array.isArray(option?.puts) ? option.puts : [];
    if (calls.length === 0 && puts.length === 0) return [];

    const expiry = expirationToDate(expiration);
    const dte = daysToExpiry(expiration);
    const chainMap = new Map<number, OptionChainEntry>();

    const ensureEntry = (strike: number) => {
      if (!chainMap.has(strike)) {
        chainMap.set(strike, {
          strike,
          expiry,
          daysToExpiry: dte,
          callBid: 0, callAsk: 0, callLast: 0, callIV: 0, callDelta: 0, callVolume: 0, callOI: 0,
          putBid: 0, putAsk: 0, putLast: 0, putIV: 0, putDelta: 0, putVolume: 0, putOI: 0,
        });
      }
      return chainMap.get(strike)!;
    };

    for (const call of calls) {
      const strike = Number(call.strike ?? 0);
      if (!strike) continue;
      const entry = ensureEntry(strike);
      entry.callBid = Number(call.bid ?? 0);
      entry.callAsk = Number(call.ask ?? 0);
      entry.callLast = Number(call.lastPrice ?? 0);
      entry.callIV = Number(call.impliedVolatility ?? 0);
      entry.callVolume = Number(call.volume ?? 0);
      entry.callOI = Number(call.openInterest ?? 0);
    }

    for (const put of puts) {
      const strike = Number(put.strike ?? 0);
      if (!strike) continue;
      const entry = ensureEntry(strike);
      entry.putBid = Number(put.bid ?? 0);
      entry.putAsk = Number(put.ask ?? 0);
      entry.putLast = Number(put.lastPrice ?? 0);
      entry.putIV = Number(put.impliedVolatility ?? 0);
      entry.putVolume = Number(put.volume ?? 0);
      entry.putOI = Number(put.openInterest ?? 0);
    }

    return Array.from(chainMap.values()).sort((a, b) => a.strike - b.strike);
  } catch (err) {
    console.error(`Yahoo options chain failed (${symbol}):`, (err as Error).message);
    return [];
  }
}
