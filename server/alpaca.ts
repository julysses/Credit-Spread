/**
 * Alpaca Markets Data Client
 * Provides real-time and historical market data for US equities and ETFs.
 *
 * Data API base: https://data.alpaca.markets/v2
 * Feed: iex (free with paper account) — full SIP not required for scanning
 *
 * Docs: https://docs.alpaca.markets/reference/stockbars
 */

import axios from 'axios';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_BASE = 'https://data.alpaca.markets/v2';

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID':     process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
    Accept: 'application/json',
  };
}

export function alpacaConfigured(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlpacaBar {
  t: string;   // ISO timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;   // trade count
  vw: number;  // volume-weighted avg price
}

interface AlpacaDailyBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
}

export interface AlpacaSnapshot {
  symbol: string;
  latestTrade: { t: string; p: number; s: number; x: string };
  latestQuote: { t: string; ap: number; as: number; bp: number; bs: number; ax: string; bx: string };
  minuteBar: AlpacaBar;
  dailyBar: AlpacaDailyBar;
  prevDailyBar: AlpacaDailyBar;
}

export interface StockQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  avgDailyVolume: number;  // from prevDailyBar volume
  timestamp: number;
}

// ─── Intraday Bars (5-min) ────────────────────────────────────────────────────

/**
 * Fetch 5-minute bars for a single symbol for today's session.
 * Returns null if the symbol is not available or no bars exist yet.
 */
export async function fetchAlpacaIntraday(symbol: string): Promise<OHLCVBar[] | null> {
  if (!alpacaConfigured()) return null;

  try {
    // Build today's session start in ET
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const y = etNow.getFullYear();
    const mo = String(etNow.getMonth() + 1).padStart(2, '0');
    const d = String(etNow.getDate()).padStart(2, '0');
    const sessionStart = `${y}-${mo}-${d}T09:30:00-04:00`;

    const resp = await axios.get(`${DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars`, {
      headers: alpacaHeaders(),
      params: {
        timeframe: '5Min',
        start: sessionStart,
        limit: 120,         // max 10h × 12 bars/h
        feed: 'iex',
        adjustment: 'raw',
      },
      timeout: 8000,
    });

    const bars: AlpacaBar[] = resp.data?.bars ?? [];
    if (bars.length < 3) return null;

    return bars.map(b => ({
      timestamp: Math.floor(new Date(b.t).getTime() / 1000),
      open:   b.o,
      high:   b.h,
      low:    b.l,
      close:  b.c,
      volume: b.v,
    }));
  } catch (err) {
    const msg = (err as { response?: { status?: number }; message?: string })
      ?.response?.status;
    // 422 = invalid symbol; 403 = subscription; both are non-retryable
    if (msg !== 422 && msg !== 403) {
      console.error(`Alpaca intraday bars failed (${symbol}):`, (err as Error).message);
    }
    return null;
  }
}

// ─── Multi-symbol Snapshots ───────────────────────────────────────────────────

/**
 * Fetch snapshots for up to 100 symbols at once.
 * Each snapshot includes latestTrade, latestQuote, minuteBar, dailyBar, prevDailyBar.
 */
export async function fetchAlpacaSnapshots(
  symbols: string[]
): Promise<Map<string, AlpacaSnapshot>> {
  const result = new Map<string, AlpacaSnapshot>();
  if (!alpacaConfigured() || symbols.length === 0) return result;

  try {
    const resp = await axios.get(`${DATA_BASE}/stocks/snapshots`, {
      headers: alpacaHeaders(),
      params: { symbols: symbols.join(','), feed: 'iex' },
      timeout: 8000,
    });

    const data: Record<string, AlpacaSnapshot> = resp.data ?? {};
    for (const [sym, snap] of Object.entries(data)) {
      result.set(sym, { ...snap, symbol: sym });
    }
  } catch (err) {
    console.error('Alpaca snapshots failed:', (err as Error).message);
  }

  return result;
}

/**
 * Convert an Alpaca snapshot to the StockQuote interface used by market-data.ts.
 */
export function snapshotToQuote(snap: AlpacaSnapshot): StockQuote {
  const price  = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? 0;
  const prevClose = snap.prevDailyBar?.c ?? snap.dailyBar?.o ?? price;
  const open   = snap.dailyBar?.o ?? price;
  const high   = snap.dailyBar?.h ?? price;
  const low    = snap.dailyBar?.l ?? price;
  const vol    = snap.dailyBar?.v ?? 0;
  const avgVol = snap.prevDailyBar?.v ?? vol;
  const change    = parseFloat((price - prevClose).toFixed(2));
  const changePct = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;

  return {
    symbol:         snap.symbol,
    price,
    bid:            snap.latestQuote?.bp ?? price,
    ask:            snap.latestQuote?.ap ?? price,
    open,
    high,
    low,
    prevClose,
    change,
    changePct,
    volume:         vol,
    avgDailyVolume: avgVol,
    timestamp:      snap.latestTrade?.t ? new Date(snap.latestTrade.t).getTime() : Date.now(),
  };
}

// ─── Daily History ────────────────────────────────────────────────────────────

/**
 * Fetch N calendar days of daily OHLCV bars for a symbol.
 * Returns newest-first order. Useful for 200-day SMA (kept on Yahoo for indices).
 */
export async function fetchAlpacaDailyBars(
  symbol: string,
  calendarDays = 30
): Promise<OHLCVBar[] | null> {
  if (!alpacaConfigured()) return null;

  try {
    const end = new Date();
    const start = new Date(end.getTime() - calendarDays * 24 * 60 * 60 * 1000);

    const resp = await axios.get(`${DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars`, {
      headers: alpacaHeaders(),
      params: {
        timeframe: '1Day',
        start: start.toISOString().split('T')[0],
        end:   end.toISOString().split('T')[0],
        limit: 300,
        feed:  'iex',
        adjustment: 'split',
      },
      timeout: 10000,
    });

    const bars: AlpacaBar[] = resp.data?.bars ?? [];
    if (bars.length === 0) return null;

    return bars.map(b => ({
      timestamp: Math.floor(new Date(b.t).getTime() / 1000),
      open:   b.o,
      high:   b.h,
      low:    b.l,
      close:  b.c,
      volume: b.v,
    }));
  } catch {
    return null;
  }
}
