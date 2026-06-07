import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { stockCandidates, growthScans } from '@/database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { fetchAlpacaSnapshots, snapshotToQuote } from '@/server/alpaca';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  try {
    const strategyType = searchParams.get('type') ?? 'short_term';
    const date         = searchParams.get('date');
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

    // Get the most recent scan date if none provided
    let scanDate = date;
    if (!scanDate) {
      const latestScan = await db
        .select({ scanDate: growthScans.scanDate })
        .from(growthScans)
        .orderBy(desc(growthScans.scanDate))
        .limit(1)
        .execute();
      scanDate = latestScan[0]?.scanDate ?? new Date().toISOString().split('T')[0];
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

    // Enrich with live prices from Alpaca snapshots (best-effort)
    const symbols = candidates.map(c => c.symbol).filter(Boolean) as string[];
    if (symbols.length > 0) {
      try {
        const snaps = await fetchAlpacaSnapshots(symbols);
        for (const c of candidates) {
          const snap = snaps.get(c.symbol);
          if (snap) {
            const q = snapshotToQuote(snap);
            if (q.price > 0) {
              (c as Record<string, unknown>).price          = parseFloat(q.price.toFixed(2));
              (c as Record<string, unknown>).priceChangePct = q.changePct;
            }
          }
        }
      } catch { /* serve stored price on Alpaca failure */ }
    }

    return NextResponse.json({
      ok: true,
      data: {
        scanDate,
        scan:       scan[0] ?? null,
        candidates,
        count:      candidates.length,
      },
    });
  } catch (err) {
    // Return mock data on DB errors (dev mode without DB)
    const scanDate = new Date().toISOString().split('T')[0];
    return NextResponse.json({
      ok: true,
      data: {
        scanDate,
        scan: { scanDate, totalScreened: 300, shortTermCount: 8, longTermCount: 7, futureMoverCount: 3, marketRegime: 'neutral' },
        candidates: getMockCandidates(searchParams.get('type') ?? 'short_term'),
        count: 10,
        _mock: true,
      },
    });
  }
}

function getMockCandidates(type: string) {
  const base = [
    { symbol: 'NVDA', companyName: 'NVIDIA Corp',     sector: 'Technology',  compositeScore: 88, momentumScore: 88, price: '134.50', priceChangePct: '3.85', rsi: '67.3', revenueGrowthPct: '122.4', pegRatio: '1.8' },
    { symbol: 'CRWD', companyName: 'CrowdStrike',     sector: 'Technology',  compositeScore: 79, momentumScore: 79, price: '380.15', priceChangePct: '3.82', rsi: '65.1', revenueGrowthPct: '33.2',  pegRatio: '2.1' },
    { symbol: 'AXON', companyName: 'Axon Enterprise', sector: 'Industrials', compositeScore: 74, momentumScore: 74, price: '310.20', priceChangePct: '3.52', rsi: '63.8', revenueGrowthPct: '29.4',  pegRatio: '1.9' },
    { symbol: 'TTD',  companyName: 'Trade Desk',      sector: 'Technology',  compositeScore: 71, momentumScore: 71, price: '220.80', priceChangePct: '2.91', rsi: '61.2', revenueGrowthPct: '27.1',  pegRatio: '2.3' },
    { symbol: 'DDOG', companyName: 'Datadog',         sector: 'Technology',  compositeScore: 68, momentumScore: 68, price: '195.30', priceChangePct: '3.12', rsi: '60.4', revenueGrowthPct: '26.8',  pegRatio: '2.5' },
    { symbol: 'SNOW', companyName: 'Snowflake',       sector: 'Technology',  compositeScore: 66, momentumScore: 66, price: '155.60', priceChangePct: '1.74', rsi: '58.9', revenueGrowthPct: '32.1',  pegRatio: '3.1' },
    { symbol: 'PLTR', companyName: 'Palantir',        sector: 'Technology',  compositeScore: 63, momentumScore: 63, price: '85.20',  priceChangePct: '2.54', rsi: '57.3', revenueGrowthPct: '21.2',  pegRatio: '2.8' },
    { symbol: 'HUBS', companyName: 'HubSpot',         sector: 'Technology',  compositeScore: 61, momentumScore: 61, price: '490.80', priceChangePct: '1.83', rsi: '55.8', revenueGrowthPct: '18.9',  pegRatio: '2.6' },
  ];

  const scanDate = new Date().toISOString().split('T')[0];
  return base.map((c, i) => ({
    ...c,
    id: i + 1,
    scanDate,
    strategyType: type,
    growthScore: c.compositeScore - 10,
    valueScore: c.compositeScore - 15,
    institutionalScore: 15,
    optionsFlowScore: 8,
    volumeRatio: '1.8',
    above200sma: true,
    above50ema: true,
    epsGrowthPct: (parseFloat(c.revenueGrowthPct) * 1.3).toFixed(1),
    aiThesis: null,
    signals: {},
    marketCap: 100 + i * 50,
    createdAt: new Date().toISOString(),
  }));
}
