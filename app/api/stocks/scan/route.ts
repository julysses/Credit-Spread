import { NextResponse } from 'next/server';
import axios from 'axios';
import {
  fetchAlpacaSnapshots,
  fetchAlpacaIntraday,
  snapshotToQuote,
  alpacaConfigured,
} from '@/server/alpaca';
import {
  computeSymbolFeatures,
  scoreAllStrategies,
  generateTradePlan,
  type OHLCVBar,
  type SymbolFeatures,
  type StrategyScore,
  type TradePlan,
} from '@/lib/models/stock-feature-engine';
import { classifyIntradayRegime, type IntradayRegimeResult } from '@/lib/models/intraday-regime-engine';
import { YAHOO_ONLY_SYMBOLS, YAHOO_SYMBOL_MAP } from '@/lib/constants/stock-universe';

export const dynamic = 'force-dynamic';

// ─── Universe ─────────────────────────────────────────────────────────────────

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

// Symbols that Alpaca cannot serve (indices) — see lib/constants/stock-universe

// Approximate avg daily volumes for RVOL baseline (shares, not dollar volume)
const AVG_VOLUMES: Record<string, number> = {
  SPX: 0,  // index — no true volume; RVOL will default to 1.0
  SPY: 80_000_000, QQQ: 40_000_000, IWM: 30_000_000, DIA: 5_000_000,
  TLT: 15_000_000, GLD: 8_000_000, SLV: 10_000_000, XLF: 25_000_000,
  XLK: 10_000_000, XLE: 12_000_000, XLI: 5_000_000, XLP: 5_000_000,
  XLY: 5_000_000, XLV: 8_000_000, XLU: 6_000_000, XLB: 4_000_000,
  XLC: 3_000_000, SMH: 6_000_000, SOXX: 2_000_000, ARKK: 10_000_000,
  TQQQ: 60_000_000, SQQQ: 50_000_000, UPRO: 5_000_000, SPXU: 4_000_000,
  SDS: 3_000_000, UVXY: 15_000_000, SVXY: 2_000_000, KRE: 8_000_000,
  EEM: 30_000_000, FXI: 15_000_000,
  AAPL: 60_000_000, MSFT: 25_000_000, NVDA: 50_000_000, AMZN: 35_000_000,
  META: 20_000_000, GOOGL: 20_000_000, TSLA: 80_000_000, AMD: 45_000_000,
  NFLX: 5_000_000, AVGO: 8_000_000, JPM: 12_000_000, BAC: 35_000_000,
  WMT: 8_000_000, COST: 3_000_000, UNH: 3_000_000, LLY: 4_000_000,
  XOM: 18_000_000, CVX: 10_000_000, CAT: 3_000_000, PLTR: 50_000_000,
  COIN: 15_000_000, CRM: 5_000_000, ADBE: 4_000_000, ORCL: 6_000_000,
  MU: 12_000_000, QCOM: 8_000_000, NOW: 2_000_000, PANW: 3_000_000,
  UBER: 20_000_000, SHOP: 8_000_000,
};

// ─── Bar fetching — Alpaca primary, Yahoo Finance fallback ────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchIntradayBarsYahoo(symbol: string): Promise<OHLCVBar[] | null> {
  const yahooSym = YAHOO_SYMBOL_MAP[symbol] ?? symbol;
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(yahooSym)}`, {
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
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
      if (o != null && h != null && l != null && c != null && v != null && !isNaN(c)) {
        bars.push({ timestamp: timestamps[i], open: o, high: h, low: l, close: c, volume: v });
      }
    }
    return bars.length >= 3 ? bars : null;
  } catch {
    return null;
  }
}

/** Alpaca primary → Yahoo Finance fallback (indices always via Yahoo) */
async function fetchIntradayBars(symbol: string): Promise<OHLCVBar[] | null> {
  if (!YAHOO_ONLY_SYMBOLS.has(symbol) && alpacaConfigured()) {
    const bars = await fetchAlpacaIntraday(symbol);
    if (bars && bars.length >= 3) return bars;
  }
  return fetchIntradayBarsYahoo(symbol);
}

function isMarketOpen(): boolean {
  try {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etNow.getDay();
    if (day === 0 || day === 6) return false;
    const total = etNow.getHours() * 60 + etNow.getMinutes();
    return total >= 570 && total < 960; // 9:30–16:00
  } catch { return false; }
}

function minutesSinceOpen(): number {
  try {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return Math.max(0, etNow.getHours() * 60 + etNow.getMinutes() - 570);
  } catch { return 0; }
}

// ─── Response Type ─────────────────────────────────────────────────────────────

export interface ScanCandidate {
  symbol: string;
  type: 'etf' | 'stock';
  currentPrice: number;
  dayChangePct: number;
  features: SymbolFeatures;
  bestStrategy: {
    strategyId: string;
    strategyName: string;
    score: number;
    tier: string;
    direction: string;
    reasons: string[];
  };
  allScores: StrategyScore[];
  tradePlan: TradePlan;
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

    const marketOpen = isMarketOpen();
    const minsOpen = minutesSinceOpen();

    // Alpaca snapshots for the whole batch (+ SPY) to get accurate avgDailyVolume
    const snapshotSymbols = ['SPY', ...batch.filter(s => s !== 'SPY')];
    const snapshots = alpacaConfigured()
      ? await fetchAlpacaSnapshots(snapshotSymbols).catch(() => new Map())
      : new Map();

    // Always fetch SPY first for RS computation and regime
    const spyBars = await fetchIntradayBars('SPY').catch(() => null);

    // Fetch batch intraday bars in parallel
    const batchResults = await Promise.allSettled(
      batch.map(sym => fetchIntradayBars(sym))
    );

    // Compute SPY features for regime detection
    const spyFeatures = spyBars
      ? computeSymbolFeatures('SPY', spyBars, spyBars, AVG_VOLUMES['SPY'], minsOpen)
      : null;

    // Build intraday regime
    const regime = classifyIntradayRegime({
      spyPrice:        spyFeatures?.currentPrice ?? 0,
      spyOpen:         spyBars?.[0]?.open ?? 0,
      spyVwap:         spyFeatures?.vwap ?? 0,
      spyOrbHigh:      spyFeatures?.openHigh ?? 0,
      spyOrbLow:       spyFeatures?.openLow ?? 0,
      spyAtr:          spyFeatures?.atr ?? 0,
      spyRvol:         spyFeatures?.rvol ?? 1,
      vixLevel:        20, // fallback — dedicated route fetches VIX
      spyEma9:         spyFeatures?.ema9 ?? 0,
      spyEma20:        spyFeatures?.ema20 ?? 0,
      minutesSinceOpen: minsOpen,
      isMarketOpen:    marketOpen,
    });

    // Score each symbol in the batch
    const candidates: ScanCandidate[] = [];

    for (let i = 0; i < batch.length; i++) {
      const sym = batch[i];
      const result = batchResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const bars = result.value;
      // Use Alpaca prevDailyBar volume when available — more accurate than hardcoded table
      const alpacaSnap = snapshots.get(sym);
      const alpacaAvgVol = alpacaSnap ? snapshotToQuote(alpacaSnap).avgDailyVolume : 0;
      const avgVol = alpacaAvgVol > 0 ? alpacaAvgVol : (AVG_VOLUMES[sym] ?? 5_000_000);
      const features = computeSymbolFeatures(sym, bars, spyBars ?? [], avgVol, minsOpen);
      if (!features) continue;

      const allScores = scoreAllStrategies(features, regime.regime as IntradayRegimeResult['regime']);
      const best = allScores[0];
      if (!best || !best.meetsMinimum) continue;

      const tradePlan = generateTradePlan(features, best);

      candidates.push({
        symbol: sym,
        type: ETF_UNIVERSE.includes(sym) ? 'etf' : 'stock',
        currentPrice: features.currentPrice,
        dayChangePct: features.dayChangePct,
        features,
        bestStrategy: {
          strategyId:   best.strategyId,
          strategyName: best.strategyName,
          score:        best.score,
          tier:         best.tier,
          direction:    best.direction,
          reasons:      best.reasons,
        },
        allScores,
        tradePlan,
      });
    }

    // Sort by best score descending, return top 5
    candidates.sort((a, b) => b.bestStrategy.score - a.bestStrategy.score);
    const top = candidates.slice(0, 5);

    return NextResponse.json({
      success: true,
      data: {
        regime,
        batchIndex,
        totalBatches,
        candidates: top,
        scannedCount: batch.length,
        marketOpen,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
