import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { db } from '@/database/db';
import { stockCandidates, growthScans } from '@/database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { fetchAlpacaDailyBars, alpacaConfigured } from '@/server/alpaca';
import { fetchFundamentals } from '@/server/fundamentals';
import {
  buildGrowthFeatures,
  scoreCandidate,
  type StrategyType,
} from '@/lib/models/growth-screener';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';

// ─── Growth Universe ───────────────────────────────────────────────────────────

const GROWTH_UNIVERSE = [
  'NVDA','MSFT','AAPL','META','AMZN','GOOGL','AMD','AVGO','TSLA',
  'CRWD','AXON','PLTR','DDOG','SNOW','TTD','HUBS','NOW','PANW','CRM','COIN',
];

// ─── Yahoo Finance Daily Bar Fetcher (fallback) ────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchDailyBarsYahoo(symbol: string): Promise<OHLCVBar[] | null> {
  try {
    const resp = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(symbol)}`, {
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
  if (alpacaConfigured()) {
    const bars = await fetchAlpacaDailyBars(symbol, 280);
    if (bars && bars.length >= 50) return bars;
  }
  return fetchDailyBarsYahoo(symbol);
}

// ─── Normalization ─────────────────────────────────────────────────────────────
// Ensures every candidate object has the string-typed fields that all three
// panel components (MomentumPanel, LongTermPanel, FutureMoverPanel) expect.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCandidate(c: Record<string, any>, i: number) {
  return {
    ...c,
    id: c.id ?? i + 1,
    // DB stores this as rsi14 (number); components read c.rsi (string)
    rsi: String(c.rsi14 ?? c.rsi ?? 50),
    // DB returns real (number); components call parseFloat(c.price ?? '0')
    price:            String(c.price            ?? 0),
    priceChangePct:   String(c.priceChangePct   ?? 0),
    volumeRatio:      String(c.volumeRatio       ?? 1),
    revenueGrowthPct: String(c.revenueGrowthPct  ?? 0),
    epsGrowthPct:     String(c.epsGrowthPct      ?? 0),
    pegRatio:         String(c.pegRatio           ?? 0),
  };
}

// ─── Live Data Fetch ──────────────────────────────────────────────────────────

async function fetchLiveGrowthCandidates(type: StrategyType | 'all', limit: number) {
  // SPY bars fetched once for relative-strength computation
  const spyBars = await fetchDailyBars('SPY').catch(() => null) ?? [];

  // Fetch bars + fundamentals for every symbol in parallel
  const results = await Promise.allSettled(
    GROWTH_UNIVERSE.map(async (symbol) => {
      const [bars, fundamentals] = await Promise.all([
        fetchDailyBars(symbol),
        fetchFundamentals(symbol),
      ]);
      return { symbol, bars, fundamentals };
    })
  );

  const candidates = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { symbol, bars, fundamentals } = result.value;
    if (!bars || bars.length < 50) continue;

    const features = buildGrowthFeatures(symbol, bars, spyBars, fundamentals, null, null);
    if (!features) continue;

    // Score for all three strategy types so we can filter by requested type
    const strategyTypes: StrategyType[] = ['short_term', 'long_term', 'future_mover'];
    for (const st of strategyTypes) {
      if (type !== 'all' && st !== type) continue;
      const scored = scoreCandidate(features, st);
      candidates.push({
        ...scored,
        scanDate: new Date().toISOString().split('T')[0],
        strategyType: st,
        // Score sub-fields stored as flat numbers for the components
        momentumScore:     scored.momentumScore?.total     ?? scored.compositeScore,
        growthScore:       scored.valueGrowthScore?.total  ?? scored.compositeScore - 10,
        valueScore:        scored.valueGrowthScore?.total  ?? scored.compositeScore - 15,
        institutionalScore: features.institutional.institutionalScore,
        optionsFlowScore:   Math.round(features.flow.flowScore),
        above200sma:        features.technical.lastClose > features.technical.sma200,
        above50ema:         features.priceAboveEma50,
        aiThesis:           null,
        signals:            scored.signals,
      });
    }
  }

  // Sort descending by compositeScore and take top N
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  return candidates.slice(0, limit);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const strategyType = (searchParams.get('type') ?? 'short_term') as StrategyType | 'all';
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
  const forceRefresh = searchParams.get('refresh') === 'true';
  const scanDate     = new Date().toISOString().split('T')[0];

  // ── 1. Try DB (skip if ?refresh=true) ──────────────────────────────────────
  if (!forceRefresh) {
    try {
      let dbScanDate = searchParams.get('date') ?? null;
      if (!dbScanDate) {
        const latest = await db
          .select({ scanDate: growthScans.scanDate })
          .from(growthScans)
          .orderBy(desc(growthScans.scanDate))
          .limit(1)
          .execute();
        dbScanDate = latest[0]?.scanDate ?? null;
      }

      if (dbScanDate) {
        const conditions = [eq(stockCandidates.scanDate, dbScanDate)];
        if (strategyType !== 'all') {
          conditions.push(eq(stockCandidates.strategyType, strategyType));
        }

        const rows = await db
          .select()
          .from(stockCandidates)
          .where(and(...conditions))
          .orderBy(desc(stockCandidates.compositeScore))
          .limit(limit)
          .execute();

        if (rows.length > 0) {
          const scan = await db
            .select()
            .from(growthScans)
            .where(eq(growthScans.scanDate, dbScanDate))
            .limit(1)
            .execute();

          return NextResponse.json({
            ok: true,
            data: {
              scanDate: dbScanDate,
              scan: { ...(scan[0] ?? {}), dataSource: 'db' },
              candidates: rows.map(normalizeCandidate),
              count: rows.length,
            },
          });
        }
      }
    } catch {
      // DB unavailable — fall through to live fetch
    }
  }

  // ── 2. Live data fetch (15s timeout) ───────────────────────────────────────
  try {
    const liveCandidates = await Promise.race([
      fetchLiveGrowthCandidates(strategyType, limit),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('live fetch timeout')), 15000)
      ),
    ]);
    if (liveCandidates.length > 0) {
      return NextResponse.json({
        ok: true,
        data: {
          scanDate,
          scan: {
            scanDate,
            totalScreened: GROWTH_UNIVERSE.length,
            shortTermCount:   liveCandidates.filter(c => c.strategyType === 'short_term').length,
            longTermCount:    liveCandidates.filter(c => c.strategyType === 'long_term').length,
            futureMoverCount: liveCandidates.filter(c => c.strategyType === 'future_mover').length,
            marketRegime: 'neutral',
            dataSource: 'live',
          },
          candidates: liveCandidates.map(normalizeCandidate),
          count: liveCandidates.length,
          _live: true,
        },
      });
    }
  } catch (err) {
    console.error('[growth/screener] Live fetch failed:', (err as Error).message);
  }

  // ── 3. Last-resort mock (approximate 2026-era prices) ──────────────────────
  return NextResponse.json({
    ok: true,
    data: {
      scanDate,
      scan: {
        scanDate,
        totalScreened: 300,
        shortTermCount: 8,
        longTermCount: 7,
        futureMoverCount: 3,
        marketRegime: 'neutral',
        dataSource: 'mock',
      },
      candidates: getMockCandidates(strategyType).map(normalizeCandidate),
      count: 10,
      _mock: true,
    },
  });
}

// ─── Mock Data (last-resort fallback only) ────────────────────────────────────
// Prices are approximate 2026-era values. This path is only hit when both
// the DB and the live Alpaca/Yahoo fetch are unavailable.

function getMockCandidates(type: string) {
  const base = [
    { symbol: 'NVDA', companyName: 'NVIDIA Corp',     sector: 'Technology',  compositeScore: 88, momentumScore: 88, price: 155.20, priceChangePct: 3.84, rsi14: 67.3, revenueGrowthPct: 122.4, pegRatio: 1.8 },
    { symbol: 'CRWD', companyName: 'CrowdStrike',     sector: 'Technology',  compositeScore: 79, momentumScore: 79, price: 420.50, priceChangePct: 3.12, rsi14: 65.1, revenueGrowthPct: 33.2,  pegRatio: 2.1 },
    { symbol: 'AXON', companyName: 'Axon Enterprise', sector: 'Industrials', compositeScore: 74, momentumScore: 74, price: 650.80, priceChangePct: 2.91, rsi14: 63.8, revenueGrowthPct: 29.4,  pegRatio: 1.9 },
    { symbol: 'PLTR', companyName: 'Palantir',        sector: 'Technology',  compositeScore: 71, momentumScore: 71, price: 185.40, priceChangePct: 2.54, rsi14: 61.2, revenueGrowthPct: 27.1,  pegRatio: 2.3 },
    { symbol: 'DDOG', companyName: 'Datadog',         sector: 'Technology',  compositeScore: 68, momentumScore: 68, price: 210.70, priceChangePct: 2.18, rsi14: 60.4, revenueGrowthPct: 26.8,  pegRatio: 2.5 },
    { symbol: 'SNOW', companyName: 'Snowflake',       sector: 'Technology',  compositeScore: 66, momentumScore: 66, price: 185.30, priceChangePct: 1.74, rsi14: 58.9, revenueGrowthPct: 32.1,  pegRatio: 3.1 },
    { symbol: 'NOW',  companyName: 'ServiceNow',      sector: 'Technology',  compositeScore: 63, momentumScore: 63, price: 1050.0, priceChangePct: 2.31, rsi14: 57.3, revenueGrowthPct: 21.2,  pegRatio: 2.8 },
    { symbol: 'HUBS', companyName: 'HubSpot',         sector: 'Technology',  compositeScore: 61, momentumScore: 61, price: 580.00, priceChangePct: 1.62, rsi14: 55.8, revenueGrowthPct: 18.9,  pegRatio: 2.6 },
  ];

  const today = new Date().toISOString().split('T')[0];
  return base.map((c, i) => ({
    ...c,
    id: i + 1,
    scanDate: today,
    strategyType: type,
    growthScore: c.compositeScore - 10,
    valueScore:  c.compositeScore - 15,
    institutionalScore: 15,
    optionsFlowScore: 8,
    volumeRatio: 1.8,
    above200sma: true,
    above50ema:  true,
    epsGrowthPct: parseFloat((c.revenueGrowthPct * 1.3).toFixed(1)),
    aiThesis: null,
    signals:  {},
    marketCap: 100 + i * 50,
    createdAt: new Date().toISOString(),
  }));
}
