/**
 * /api/stocks/swing
 * Scans 61-symbol universe using 90 days of daily OHLCV bars.
 * Scores 6 swing strategies per symbol and returns top candidates.
 * Designed for overnight review — entry triggers for next trading day.
 */

import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchAlpacaDailyBars, alpacaConfigured } from '@/server/alpaca';
import {
  computeDailyFeatures,
  scoreAllSwingStrategies,
  generateSwingTradePlan,
  type DailyFeatures,
  type SwingScore,
  type SwingTradePlan,
} from '@/lib/models/stock-swing-engine';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';
import { YAHOO_ONLY_SYMBOLS, YAHOO_SYMBOL_MAP } from '@/lib/constants/stock-universe';

export const dynamic = 'force-dynamic';

// ─── Universe (mirrors scan route) ────────────────────────────────────────────

const ETF_UNIVERSE = [
  'SPX',
  'SPY','QQQ','IWM','DIA','TLT','GLD','SLV','XLF','XLK','XLE',
  'XLI','XLP','XLY','XLV','XLU','XLB','XLC','SMH','SOXX','ARKK',
  'TQQQ','SQQQ','UPRO','SPXU','SDS','UVXY','SVXY','KRE','EEM','FXI',
];

const STOCK_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AMD','NFLX','AVGO',
  'JPM','BAC','WMT','COST','UNH','LLY','XOM','CVX','CAT','PLTR',
  'COIN','CRM','ADBE','ORCL','MU','QCOM','NOW','PANW','UBER','SHOP',
];

// ─── Bar fetching ─────────────────────────────────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchDailyBarsYahoo(symbol: string): Promise<OHLCVBar[] | null> {
  const yahooSym = YAHOO_SYMBOL_MAP[symbol] ?? symbol;
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(yahooSym)}`, {
      params: { range: '1y', interval: '1d', includeAdjustedClose: 'true' },
      headers: YAHOO_HEADERS,
      timeout: 10000,
    });
    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0];
    const adjClose: (number | null)[] =
      result.indicators?.adjclose?.[0]?.adjclose ?? q?.close ?? [];
    if (!q || timestamps.length === 0) return null;
    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i];
      const c = adjClose[i] ?? q.close?.[i];
      const v = q.volume?.[i] ?? 0;
      if (o != null && h != null && l != null && c != null && !isNaN(c)) {
        bars.push({ timestamp: timestamps[i], open: o, high: h, low: l, close: c, volume: v });
      }
    }
    return bars.length >= 50 ? bars : null;
  } catch {
    return null;
  }
}

async function fetchDailyBars(symbol: string): Promise<OHLCVBar[] | null> {
  if (!YAHOO_ONLY_SYMBOLS.has(symbol) && alpacaConfigured()) {
    const bars = await fetchAlpacaDailyBars(symbol, 280); // ~1 year
    if (bars && bars.length >= 50) return bars;
  }
  return fetchDailyBarsYahoo(symbol);
}

// ─── Response Type ─────────────────────────────────────────────────────────────

export interface SwingCandidate {
  symbol: string;
  type: 'etf' | 'stock';
  lastClose: number;
  dayChangePct: number;
  features: DailyFeatures;
  bestStrategy: {
    strategyId: string;
    strategyName: string;
    score: number;
    tier: string;
    direction: string;
    setupDescription: string;
    triggerConditions: string[];
    riskNote: string;
    reasons: string[];
    warnings: string[];
  };
  allScores: SwingScore[];
  tradePlan: SwingTradePlan;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchIndex = Math.max(0, parseInt(searchParams.get('batch') ?? '0'));
    const BATCH_SIZE = 10;

    const allSymbols = [...ETF_UNIVERSE, ...STOCK_UNIVERSE];
    const totalBatches = Math.ceil(allSymbols.length / BATCH_SIZE);
    const batch = allSymbols.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);

    // Fetch SPY daily bars for RS63 computation
    const spyBars = await fetchDailyBars('SPY').catch(() => null);

    // Fetch batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(sym => fetchDailyBars(sym))
    );

    const candidates: SwingCandidate[] = [];

    for (let i = 0; i < batch.length; i++) {
      const sym = batch[i];
      const result = batchResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const bars = result.value;
      const features = computeDailyFeatures(sym, bars, spyBars ?? []);
      if (!features) continue;

      const allScores = scoreAllSwingStrategies(features);
      const best = allScores[0];
      if (!best || !best.meetsMinimum) continue;

      const tradePlan = generateSwingTradePlan(features, best);

      candidates.push({
        symbol: sym,
        type: ETF_UNIVERSE.includes(sym) ? 'etf' : 'stock',
        lastClose: features.lastClose,
        dayChangePct: features.dayChangePct,
        features,
        bestStrategy: {
          strategyId:        best.strategyId,
          strategyName:      best.strategyName,
          score:             best.score,
          tier:              best.tier,
          direction:         best.direction,
          setupDescription:  best.setupDescription,
          triggerConditions: best.triggerConditions,
          riskNote:          best.riskNote,
          reasons:           best.reasons,
          warnings:          best.warnings,
        },
        allScores,
        tradePlan,
      });
    }

    candidates.sort((a, b) => b.bestStrategy.score - a.bestStrategy.score);
    const top = candidates.slice(0, 5);

    return NextResponse.json({
      success: true,
      data: {
        batchIndex,
        totalBatches,
        candidates: top,
        scannedCount: batch.length,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
