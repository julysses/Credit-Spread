import axios from 'axios';
import { alpacaConfigured, fetchAlpacaSnapshots, snapshotToQuote } from './alpaca';

export type StockQuoteStatus = 'live' | 'delayed' | 'unavailable';

export interface LiveStockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  provider: 'Alpaca' | 'Yahoo Finance' | 'unavailable';
  status: StockQuoteStatus;
  timestamp: number;
}

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchYahooQuote(symbol: string): Promise<LiveStockQuote | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(symbol)}`, {
      params: { range: '1d', interval: '1m', includePrePost: 'false' },
      headers: YAHOO_HEADERS,
      timeout: 7000,
    });

    const result = resp.data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    const change = price - prev;

    return {
      symbol,
      price,
      change,
      changePct: prev > 0 ? (change / prev) * 100 : 0,
      open: meta.regularMarketOpen ?? price,
      high: meta.regularMarketDayHigh ?? price,
      low: meta.regularMarketDayLow ?? price,
      volume: meta.regularMarketVolume ?? 0,
      provider: 'Yahoo Finance',
      status: 'delayed',
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function fetchLiveStockQuotes(symbols: string[]): Promise<Map<string, LiveStockQuote>> {
  const unique = Array.from(new Set(symbols.filter(Boolean).map(s => s.toUpperCase())));
  const quotes = new Map<string, LiveStockQuote>();

  if (unique.length === 0) return quotes;

  if (alpacaConfigured()) {
    const snapshots = await fetchAlpacaSnapshots(unique).catch(() => new Map());
    for (const symbol of unique) {
      const snap = snapshots.get(symbol);
      if (!snap) continue;
      const q = snapshotToQuote(snap);
      if (q.price > 0) {
        quotes.set(symbol, {
          symbol,
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          open: q.open,
          high: q.high,
          low: q.low,
          volume: q.volume,
          provider: 'Alpaca',
          status: 'live',
          timestamp: q.timestamp,
        });
      }
    }
  }

  const missing = unique.filter(symbol => !quotes.has(symbol));
  const yahooResults = await Promise.allSettled(missing.map(symbol => fetchYahooQuote(symbol)));
  yahooResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      quotes.set(missing[index], result.value);
    }
  });

  return quotes;
}
