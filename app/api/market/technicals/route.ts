import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchMarketSnapshot } from '@/server/market-data';
import {
  deriveTechnicalAnalysis,
  computeSMASeries,
  computeRSISeries,
  computeMACDSeries,
  type TechnicalAnalysis,
} from '@/server/technicals';

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface ChartDataPoint {
  date: string;
  close: number;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  histogram: number | null;
}

interface SPXHistory {
  timestamps: number[];
  closes: number[];
}

async function fetchSPXHistory(): Promise<SPXHistory | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent('^GSPC')}`, {
      params: { range: '1y', interval: '1d', includeAdjustedClose: 'true' },
      headers: YAHOO_HEADERS,
      timeout: 10000,
    });
    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;

    const rawTimestamps: (number | null)[] = result.timestamps ?? [];
    const rawCloses: (number | null)[] =
      result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ??
      [];

    // Zip and filter out any null pairs
    const timestamps: number[] = [];
    const closes: number[] = [];
    for (let i = 0; i < Math.min(rawTimestamps.length, rawCloses.length); i++) {
      const t = rawTimestamps[i];
      const c = rawCloses[i];
      if (t != null && c != null && !isNaN(c)) {
        timestamps.push(t);
        closes.push(c);
      }
    }

    return timestamps.length > 0 ? { timestamps, closes } : null;
  } catch {
    return null;
  }
}

function formatDate(unixSecs: number): string {
  const d = new Date(unixSecs * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildChartData(
  timestamps: number[],
  closes: number[],
  chartBars = 120,
): ChartDataPoint[] {
  // Compute series on full history for accuracy, then trim to chartBars for output
  const sma50Series = computeSMASeries(closes, 50);
  const sma200Series = computeSMASeries(closes, 200);
  const rsiSeries = computeRSISeries(closes, 14);
  const macdSeries = computeMACDSeries(closes);

  const start = Math.max(0, closes.length - chartBars);
  return closes.slice(start).map((close, i) => {
    const idx = start + i;
    const m = macdSeries[idx];
    return {
      date: formatDate(timestamps[idx]),
      close: Math.round(close * 100) / 100,
      sma50: sma50Series[idx] != null ? Math.round(sma50Series[idx]! * 100) / 100 : null,
      sma200: sma200Series[idx] != null ? Math.round(sma200Series[idx]! * 100) / 100 : null,
      rsi: rsiSeries[idx] != null ? Math.round(rsiSeries[idx]! * 10) / 10 : null,
      macd: m.macd != null ? Math.round(m.macd * 100) / 100 : null,
      macdSignal: m.macdSignal != null ? Math.round(m.macdSignal * 100) / 100 : null,
      histogram: m.histogram != null ? Math.round(m.histogram * 100) / 100 : null,
    };
  });
}

export interface TechnicalsResponse {
  success: true;
  data: TechnicalAnalysis & {
    currentPrice: number;
    intradayBias: 'bullish' | 'bearish' | 'neutral';
    intradayNote: string;
    chartData: ChartDataPoint[];
    fetchedAt: number;
  };
}

export async function GET() {
  try {
    const [snapshot, history] = await Promise.all([
      fetchMarketSnapshot(),
      fetchSPXHistory(),
    ]);

    const currentPrice = snapshot.spx.price;
    const vix = snapshot.vix.price;

    if (!history || history.closes.length < 30) {
      return NextResponse.json({
        success: true,
        data: {
          swingBias: 'neutral' as const,
          swingStrength: 0,
          evidence: [],
          currentPrice,
          intradayBias: 'neutral' as const,
          intradayNote: 'Insufficient historical data',
          chartData: [] as ChartDataPoint[],
          fetchedAt: Date.now(),
        },
      });
    }

    const { timestamps, closes } = history;
    const analysis = deriveTechnicalAnalysis(closes, currentPrice);
    const chartData = buildChartData(timestamps, closes, 120);

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
        chartData,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
