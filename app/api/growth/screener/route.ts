import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { stockCandidates, growthScans, intelligenceDossiers } from '@/database/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { fetchLiveStockQuotes } from '@/server/stock-quotes';
import { fetchPoliticianSignal } from '@/server/politicians/politician-signals';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  try {
    const strategyType = searchParams.get('type') ?? 'short_term';
    const date         = searchParams.get('date');
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

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
      return NextResponse.json({
        ok: true,
        data: {
          scanDate: null,
          scan: null,
          candidates: [],
          count: 0,
          emptyReason: 'no_scan_data',
        },
      });
    }

    const conditions = [eq(stockCandidates.scanDate, scanDate)];
    if (strategyType !== 'all') {
      conditions.push(eq(stockCandidates.strategyType, strategyType as 'short_term' | 'long_term' | 'future_mover'));
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
    return NextResponse.json({
      ok: false,
      code: 'DATA_UNAVAILABLE',
      error: 'Growth screener data is unavailable. Check DATABASE_URL, migrations, and worker population.',
    }, { status: 503 });
  }
}
