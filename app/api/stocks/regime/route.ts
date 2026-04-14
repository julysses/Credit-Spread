import { NextResponse } from 'next/server';
import axios from 'axios';
import { computeSymbolFeatures, type OHLCVBar } from '@/lib/models/stock-feature-engine';
import { classifyIntradayRegime } from '@/lib/models/intraday-regime-engine';

export const dynamic = 'force-dynamic';

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchIntradayBars(symbol: string): Promise<OHLCVBar[] | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(symbol)}`, {
      params: { range: '1d', interval: '5m', includePrePost: 'false' },
      headers: YAHOO_HEADERS,
      timeout: 8000,
    });

    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0];
    if (!q || timestamps.length === 0) return null;

    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      const v = q.volume?.[i];
      if (o != null && h != null && l != null && c != null && v != null && !isNaN(c)) {
        bars.push({ timestamp: timestamps[i], open: o, high: h, low: l, close: c, volume: v });
      }
    }
    return bars.length >= 3 ? bars : null;
  } catch {
    return null;
  }
}

async function fetchVixSpot(): Promise<number> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/%5EVIX`, {
      params: { range: '1d', interval: '5m', includePrePost: 'false' },
      headers: YAHOO_HEADERS,
      timeout: 5000,
    });
    const result = resp.data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const last = closes.filter((c: number | null) => c != null).pop();
    return last ?? 18;
  } catch {
    return 18;
  }
}

function isMarketOpen(): boolean {
  try {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etNow.getDay();
    if (day === 0 || day === 6) return false;
    const hours = etNow.getHours();
    const minutes = etNow.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
  } catch {
    return false;
  }
}

function minutesSinceOpen(): number {
  try {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const openMinutes = 9 * 60 + 30;
    const nowMinutes = etNow.getHours() * 60 + etNow.getMinutes();
    return Math.max(0, nowMinutes - openMinutes);
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const [spyBars, vix] = await Promise.all([
      fetchIntradayBars('SPY'),
      fetchVixSpot(),
    ]);

    const marketOpen = isMarketOpen();
    const minsOpen = minutesSinceOpen();

    if (!spyBars || spyBars.length < 3) {
      const regime = classifyIntradayRegime({
        spyPrice: 0, spyOpen: 0, spyVwap: 0,
        spyOrbHigh: 0, spyOrbLow: 0, spyAtr: 0,
        spyRvol: 0, vixLevel: vix,
        spyEma9: 0, spyEma20: 0,
        minutesSinceOpen: minsOpen,
        isMarketOpen: marketOpen,
      });
      return NextResponse.json({
        success: true,
        data: { regime, spyFeatures: null, fetchedAt: Date.now() },
      });
    }

    // SPY avg daily volume fallback
    const AVG_SPY_VOLUME = 80_000_000;
    const spyFeatures = computeSymbolFeatures('SPY', spyBars, spyBars, AVG_SPY_VOLUME, minsOpen);

    const regime = classifyIntradayRegime({
      spyPrice:        spyFeatures?.currentPrice ?? spyBars[spyBars.length - 1].close,
      spyOpen:         spyBars[0].open,
      spyVwap:         spyFeatures?.vwap ?? 0,
      spyOrbHigh:      spyFeatures?.openHigh ?? 0,
      spyOrbLow:       spyFeatures?.openLow ?? 0,
      spyAtr:          spyFeatures?.atr ?? 0,
      spyRvol:         spyFeatures?.rvol ?? 1,
      vixLevel:        vix,
      spyEma9:         spyFeatures?.ema9 ?? 0,
      spyEma20:        spyFeatures?.ema20 ?? 0,
      minutesSinceOpen: minsOpen,
      isMarketOpen:    marketOpen,
    });

    return NextResponse.json({
      success: true,
      data: {
        regime,
        spyFeatures,
        vix,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
