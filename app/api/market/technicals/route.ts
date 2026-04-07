import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchMarketSnapshot } from '@/server/market-data';
import { deriveTechnicalAnalysis, type TechnicalAnalysis } from '@/server/technicals';

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchSPXHistory(): Promise<number[] | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent('^GSPC')}`, {
      params: { range: '1y', interval: '1d', includeAdjustedClose: 'true' },
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

export interface TechnicalsResponse {
  success: true;
  data: TechnicalAnalysis & {
    currentPrice: number;
    intradayBias: 'bullish' | 'bearish' | 'neutral';
    intradayNote: string;
    fetchedAt: number;
  };
}

export async function GET() {
  try {
    const [snapshot, closes] = await Promise.all([
      fetchMarketSnapshot(),
      fetchSPXHistory(),
    ]);

    const currentPrice = snapshot.spx.price;
    const vix = snapshot.vix.price;

    // Fall back gracefully if history unavailable
    if (!closes || closes.length < 30) {
      const fallback = {
        swingBias: 'neutral' as const,
        swingStrength: 0,
        evidence: [],
        currentPrice,
        intradayBias: 'neutral' as const,
        intradayNote: 'Insufficient historical data for technicals',
        fetchedAt: Date.now(),
      };
      return NextResponse.json({ success: true, data: fallback });
    }

    const analysis = deriveTechnicalAnalysis(closes, currentPrice);

    // Intraday bias: use VIX level + SPX daily change as simple proxy
    const spxChangePct = snapshot.spx.changePct ?? 0;
    let intradayBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let intradayNote = `VIX ${vix.toFixed(1)}, SPX ${spxChangePct >= 0 ? '+' : ''}${spxChangePct.toFixed(2)}%`;

    if (spxChangePct > 0.3 && vix < 20) {
      intradayBias = 'bullish';
      intradayNote += ' — momentum positive, vol contained';
    } else if (spxChangePct < -0.3 && vix > 20) {
      intradayBias = 'bearish';
      intradayNote += ' — selling pressure, elevated vol';
    } else if (vix > 25) {
      intradayBias = 'bearish';
      intradayNote += ' — high VIX signals risk-off';
    } else {
      intradayNote += ' — choppy/neutral intraday';
    }

    return NextResponse.json({
      success: true,
      data: {
        ...analysis,
        currentPrice,
        intradayBias,
        intradayNote,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
