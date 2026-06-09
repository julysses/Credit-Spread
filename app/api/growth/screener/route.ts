import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { db } from '@/database/db';
import { stockCandidates, growthScans, intelligenceDossiers } from '@/database/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { fetchLiveStockQuotes } from '@/server/stock-quotes';
import { fetchPoliticianSignal } from '@/server/politicians/politician-signals';
import { fetchAlpacaDailyBars, alpacaConfigured } from '@/server/alpaca';
import { fetchFundamentals } from '@/server/fundamentals';
import {
  buildGrowthFeatures,
  scoreCandidate,
  type StrategyType,
} from '@/lib/models/growth-screener';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const GROWTH_UNIVERSE = [
  'NVDA','MSFT','AAPL','META','AMZN','GOOGL','AMD','AVGO','TSLA',
  'CRWD','AXON','PLTR','DDOG','SNOW','TTD','HUBS','NOW','PANW','CRM','COIN',
];

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
}

function formatAvailableFor(value: Date | string | null | undefined): string {
  if (!value) return 'unknown';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 'unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function latestBySymbol<T extends { symbol: string; dossierDate?: string | null; createdAt?: Date | null }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const existing = map.get(row.symbol);
    const rowTime = new Date(row.createdAt ?? row.dossierDate ?? 0).getTime();
    const existingTime = existing ? new Date(existing.createdAt ?? existing.dossierDate ?? 0).getTime() : -Infinity;
    if (!existing || rowTime > existingTime) map.set(row.symbol, row);
  }
  return map;
}

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
    const quote = result.indicators?.quote?.[0];
    const adjClose: (number | null)[] =
      result.indicators?.adjclose?.[0]?.adjclose ?? quote?.close ?? [];
    if (!quote || timestamps.length === 0) return null;

    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = adjClose[i] ?? quote.close?.[i];
      const volume = quote.volume?.[i] ?? 0;
      if (open != null && high != null && low != null && close != null && Number.isFinite(close)) {
        bars.push({ timestamp: timestamps[i], open, high, low, close, volume });
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

async function fetchLiveGrowthCandidates(type: StrategyType | 'all', limit: number) {
  const spyBars = await fetchDailyBars('SPY').catch(() => null) ?? [];
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

    const strategyTypes: StrategyType[] = ['short_term', 'long_term', 'future_mover'];
    for (const strategyType of strategyTypes) {
      if (type !== 'all' && strategyType !== type) continue;
      const scored = scoreCandidate(features, strategyType);
      const latestBar = bars[bars.length - 1];
      const previousBar = bars[bars.length - 2] ?? latestBar;
      const change = latestBar.close - previousBar.close;
      const changePct = previousBar.close > 0 ? (change / previousBar.close) * 100 : 0;

      candidates.push({
        ...scored,
        id: `${symbol}-${strategyType}`,
        symbol,
        scanDate: new Date().toISOString().split('T')[0],
        strategyType,
        companyName: fundamentals.companyName,
        sector: fundamentals.sector,
        price: latestBar.close,
        priceChangePct: changePct,
        scanPrice: latestBar.close,
        entryPrice: latestBar.close,
        currentPrice: latestBar.close,
        currentPriceChangePct: changePct,
        entryReturnPct: 0,
        priceStatus: alpacaConfigured() ? 'live' : 'delayed',
        priceProvider: alpacaConfigured() ? 'Alpaca' : 'Yahoo Finance',
        priceAsOf: new Date(latestBar.timestamp * 1000).toISOString(),
        currentPriceStatus: alpacaConfigured() ? 'live' : 'delayed',
        currentPriceProvider: alpacaConfigured() ? 'Alpaca' : 'Yahoo Finance',
        currentPriceAsOf: new Date(latestBar.timestamp * 1000).toISOString(),
        availableSince: new Date().toISOString(),
        availableForLabel: '0m',
        rsi14: features.rsi14,
        momentumScore: scored.momentumScore?.total ?? scored.compositeScore,
        growthScore: scored.valueGrowthScore?.total ?? Math.max(0, scored.compositeScore - 10),
        valueScore: scored.valueGrowthScore?.total ?? Math.max(0, scored.compositeScore - 15),
        institutionalScore: features.institutional.institutionalScore,
        optionsFlowScore: Math.round(features.flow.flowScore),
        above200sma: features.technical.lastClose > features.technical.sma200,
        above50ema: features.priceAboveEma50,
        revenueGrowthPct: fundamentals.revenueGrowthYoy,
        epsGrowthPct: fundamentals.epsGrowthYoy,
        pegRatio: fundamentals.pegRatio,
        marketCap: fundamentals.marketCap,
        aiThesis: null,
        signals: scored.signals,
        sources: {
          price: {
            status: alpacaConfigured() ? 'live' : 'delayed',
            provider: alpacaConfigured() ? 'Alpaca' : 'Yahoo Finance',
            asOf: new Date(latestBar.timestamp * 1000).toISOString(),
          },
          fundamentals: {
            status: fundamentals.sector === 'Unavailable' ? 'unavailable' : 'live',
            provider: fundamentals.sector === 'Unavailable' ? 'none' : 'FMP/Alpha Vantage',
          },
        },
      });
    }
  }

  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  return candidates.slice(0, limit);
}

async function liveFallbackResponse(strategyType: StrategyType | 'all', limit: number, reason: string) {
  try {
    const candidates = await Promise.race([
      fetchLiveGrowthCandidates(strategyType, limit),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('live fetch timeout')), 18000)),
    ]);
    const liveQuotes = await fetchLiveStockQuotes(candidates.map(c => c.symbol)).catch(() => new Map());
    const hydratedCandidates = candidates.map(candidate => {
      const liveQuote = liveQuotes.get(candidate.symbol);
      if (!liveQuote) return candidate;
      const entryPrice = Number(candidate.entryPrice ?? candidate.scanPrice ?? candidate.price);
      const entryReturnPct = entryPrice > 0 ? ((liveQuote.price - entryPrice) / entryPrice) * 100 : null;
      return {
        ...candidate,
        currentPrice: liveQuote.price,
        currentPriceChangePct: liveQuote.changePct,
        currentPriceStatus: liveQuote.status,
        currentPriceProvider: liveQuote.provider,
        currentPriceAsOf: new Date(liveQuote.timestamp).toISOString(),
        price: liveQuote.price,
        priceChangePct: liveQuote.changePct,
        priceStatus: liveQuote.status,
        priceProvider: liveQuote.provider,
        priceAsOf: new Date(liveQuote.timestamp).toISOString(),
        entryReturnPct,
        sources: {
          ...candidate.sources,
          price: {
            status: liveQuote.status,
            provider: liveQuote.provider,
            fetchedAt: liveQuote.timestamp,
          },
        },
      };
    });
    const scanDate = new Date().toISOString().split('T')[0];
    return NextResponse.json({
      ok: true,
      data: {
        scanDate,
        scan: {
          scanDate,
          totalScreened: GROWTH_UNIVERSE.length,
          shortTermCount: hydratedCandidates.filter(c => c.strategyType === 'short_term').length,
          longTermCount: hydratedCandidates.filter(c => c.strategyType === 'long_term').length,
          futureMoverCount: hydratedCandidates.filter(c => c.strategyType === 'future_mover').length,
          marketRegime: 'neutral',
          dataSource: 'live',
          fallbackReason: reason,
        },
        candidates: hydratedCandidates,
        count: hydratedCandidates.length,
        emptyReason: hydratedCandidates.length === 0 ? 'live_sources_unavailable' : null,
      },
    });
  } catch (err) {
    console.error('[growth/screener] Live fallback failed:', (err as Error).message);
    return NextResponse.json({
      ok: false,
      code: 'DATA_UNAVAILABLE',
      error: 'Growth screener live data is unavailable. Check DATABASE_URL, Alpaca/Yahoo access, and FMP/Alpha Vantage provider configuration.',
    }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const strategyType = (searchParams.get('type') ?? 'short_term') as StrategyType | 'all';
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  try {
    const date         = searchParams.get('date');

    let scanDate = date;
    if (!scanDate) {
      const latestScan = await db
        .select({ scanDate: growthScans.scanDate })
        .from(growthScans)
        .orderBy(desc(growthScans.scanDate))
        .limit(1)
        .execute();
      scanDate = latestScan[0]?.scanDate ?? null;
    }

    if (!scanDate) {
      return liveFallbackResponse(strategyType, limit, 'no_scan_data');
    }

    const conditions = [eq(stockCandidates.scanDate, scanDate)];
    if (strategyType !== 'all') {
      conditions.push(eq(stockCandidates.strategyType, strategyType));
    }

    const candidates = await db
      .select()
      .from(stockCandidates)
      .where(and(...conditions))
      .orderBy(desc(stockCandidates.compositeScore))
      .limit(limit)
      .execute();

    const scan = await db
      .select()
      .from(growthScans)
      .where(eq(growthScans.scanDate, scanDate))
      .limit(1)
      .execute();

    const symbols = candidates.map(c => c.symbol);
    const [liveQuotes, dossierRows, politicianRows] = await Promise.all([
      fetchLiveStockQuotes(symbols).catch(() => new Map()),
      symbols.length > 0
        ? db.select().from(intelligenceDossiers).where(inArray(intelligenceDossiers.symbol, symbols)).orderBy(desc(intelligenceDossiers.dossierDate), desc(intelligenceDossiers.createdAt)).limit(Math.max(symbols.length * 3, 10)).execute().catch(() => [])
        : Promise.resolve([]),
      Promise.allSettled(symbols.map(symbol => fetchPoliticianSignal(symbol))),
    ]);

    const dossiers = latestBySymbol(dossierRows);
    const politicians = new Map<string, Awaited<ReturnType<typeof fetchPoliticianSignal>>>();
    politicianRows.forEach((result, index) => {
      if (result.status === 'fulfilled') politicians.set(symbols[index], result.value);
    });

    const hydratedCandidates = candidates.map(candidate => {
      const liveQuote = liveQuotes.get(candidate.symbol);
      const dossier = dossiers.get(candidate.symbol);
      const institutionalData = asRecord(dossier?.institutionalData);
      const fundamentalsData = asRecord(dossier?.fundamentalsData);
      const valuationData = asRecord(dossier?.valuationData);
      const signals = asRecord(candidate.signals);
      const politician = politicians.get(candidate.symbol);
      const entryPrice = candidate.price;
      const currentPrice = liveQuote?.price ?? candidate.price;
      const entryReturnPct = entryPrice && currentPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 : null;
      const piotroskiScore = asNumber(institutionalData?.piotroskiScore) ?? asNumber(fundamentalsData?.piotroskiScore) ?? asNumber(signals?.piotroskiScore);
      const altmanZScore = asNumber(institutionalData?.altmanZScore) ?? asNumber(fundamentalsData?.altmanZScore) ?? asNumber(signals?.altmanZScore);

      return {
        ...candidate,
        scanPrice: candidate.price,
        scanPriceChangePct: candidate.priceChangePct,
        entryPrice,
        currentPrice,
        currentPriceChangePct: liveQuote?.changePct ?? candidate.priceChangePct,
        entryReturnPct,
        availableSince: candidate.createdAt,
        availableForLabel: formatAvailableFor(candidate.createdAt),
        price: currentPrice,
        priceChangePct: liveQuote?.changePct ?? candidate.priceChangePct,
        priceStatus: liveQuote?.status ?? 'persisted',
        priceProvider: liveQuote?.provider ?? 'database_scan',
        priceAsOf: liveQuote?.timestamp ? new Date(liveQuote.timestamp).toISOString() : candidate.createdAt,
        currentPriceStatus: liveQuote?.status ?? 'persisted',
        currentPriceProvider: liveQuote?.provider ?? 'database_scan',
        currentPriceAsOf: liveQuote?.timestamp ? new Date(liveQuote.timestamp).toISOString() : candidate.createdAt,
        piotroskiScore,
        altmanZScore,
        analystTargetPrice: asNumber(valuationData?.analystTargetPrice) ?? asNumber(valuationData?.targetPriceMean),
        politicianScore: politician?.score,
        politicianRecentBuys: politician?.recentBuys,
        politicianRecentSells: politician?.recentSells,
        politicianNetFlow: politician?.netFlow,
        politicianLargestTradeRange: politician?.largestTradeRange,
        politicianExplanation: politician?.explanation,
        sources: {
          price: liveQuote ? {
            status: liveQuote.status,
            provider: liveQuote.provider,
            fetchedAt: liveQuote.timestamp,
          } : {
            status: 'persisted',
            provider: 'database_scan',
            asOf: candidate.createdAt,
          },
          piotroskiScore: piotroskiScore != null ? { status: 'persisted', provider: dossier ? 'intelligence_dossier' : 'candidate_signals', asOf: dossier?.createdAt ?? candidate.createdAt } : { status: 'unavailable', provider: 'none' },
          altmanZScore: altmanZScore != null ? { status: 'persisted', provider: dossier ? 'intelligence_dossier' : 'candidate_signals', asOf: dossier?.createdAt ?? candidate.createdAt } : { status: 'unavailable', provider: 'none' },
          politician: politician ? { status: 'delayed', provider: 'congressional_disclosures', fetchedAt: Date.now() } : { status: 'unavailable', provider: 'none' },
        },
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        scanDate,
        scan:       scan[0] ?? null,
        candidates: hydratedCandidates,
        count:      hydratedCandidates.length,
        emptyReason: hydratedCandidates.length === 0 ? 'no_candidates_for_scan' : null,
      },
    });
  } catch (err) {
    console.error('Growth screener DB error:', err);
    return liveFallbackResponse(strategyType, limit, 'database_unavailable');
  }
}
