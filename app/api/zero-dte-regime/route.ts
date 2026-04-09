import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

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

function sma(arr: number[], period: number): number {
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export async function GET() {
  const [vixSpot, vix1dHistory, spxHistory] = await Promise.allSettled([
    yahooSpot('^VIX'),
    yahooHistory('^VIX1D', '2mo'),   // ~42 trading days → need last 22
    yahooHistory('^GSPC', '2mo'),    // ~42 trading days → need last 25
  ]);

  const vixLevel: number | null =
    vixSpot.status === 'fulfilled' ? vixSpot.value : null;

  // ── VIX1D ────────────────────────────────────────────────────────────────────
  let vix1dLevel: number | null = null;
  let vix1d20dAvg: number | null = null;
  let vix1dRelative: 'below' | 'at' | 'above' = 'at';

  if (vix1dHistory.status === 'fulfilled' && vix1dHistory.value && vix1dHistory.value.length >= 5) {
    const hist = vix1dHistory.value;
    vix1dLevel = hist[hist.length - 1];
    const avgPeriod = Math.min(20, hist.length - 1); // exclude today
    vix1d20dAvg = sma(hist.slice(0, -1), avgPeriod);
    const ratio = vix1dLevel / vix1d20dAvg;
    vix1dRelative = ratio < 0.95 ? 'below' : ratio > 1.05 ? 'above' : 'at';
  }

  // ── SPX vs 20 SMA ─────────────────────────────────────────────────────────
  let spxPrice: number | null = null;
  let spx20sma: number | null = null;
  let spxVsSma: 'above' | 'below' = 'above';

  if (spxHistory.status === 'fulfilled' && spxHistory.value && spxHistory.value.length >= 5) {
    const hist = spxHistory.value;
    spxPrice = hist[hist.length - 1];
    const smaPeriod = Math.min(20, hist.length - 1);
    spx20sma = sma(hist.slice(0, -1), smaPeriod);
    spxVsSma = spxPrice >= spx20sma ? 'above' : 'below';
  }

  // ── GEX proxy ────────────────────────────────────────────────────────────
  // VIX1D ≤ VIX = near-term vol compressed vs 30-day norm → dealers likely long gamma (positive GEX)
  // VIX1D > VIX = elevated near-term fear → dealers likely short gamma (negative GEX)
  const gexEnv: 'positive' | 'negative' =
    vix1dLevel != null && vixLevel != null && vix1dLevel > vixLevel
      ? 'negative'
      : 'positive';

  return NextResponse.json({
    success: true,
    data: {
      vixLevel,
      vix1dLevel,
      vix1d20dAvg,
      vix1dRelative,
      gexEnv,
      spxPrice,
      spx20sma,
      spxVsSma,
      fetchedAt: Date.now(),
    },
  });
}
