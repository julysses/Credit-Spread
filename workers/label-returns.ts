/**
 * Forward Return Labeling Worker
 * Runs at 4:30 PM ET after market close.
 * Fills in returnFwd5d, returnFwd10d, returnFwd30d, returnFwd60d, returnFwd90d
 * for stock_parameter_snapshots rows old enough to have data.
 */

import { db } from '@/database/db';
import { stockParameterSnapshots } from '@/database/schema';
import { isNull, lte, and, eq } from 'drizzle-orm';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const { ALPACA_API_KEY, ALPACA_SECRET_KEY } = process.env;
  if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
    return null; // can't label without price data
  }

  try {
    const { default: axios } = await import('axios');
    const resp = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/bars/latest`, {
      params: { feed: 'iex' },
      headers: {
        'APCA-API-KEY-ID':     ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      },
      timeout: 8000,
    });
    return resp.data?.bar?.c ?? null;
  } catch {
    return null;
  }
}

async function run() {
  console.log('[label-returns] Starting forward return labeling…');
  const now = new Date();

  // Find rows where returnFwd5d is null and snapshot is ≥5 days old
  const cutoff5d  = new Date(now.getTime() - 5  * 86400000).toISOString().split('T')[0];
  const cutoff10d = new Date(now.getTime() - 10 * 86400000).toISOString().split('T')[0];
  const cutoff30d = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const cutoff60d = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
  const cutoff90d = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];

  // Fetch rows needing labeling (oldest returns first)
  const rows = await db.select({
    id:          stockParameterSnapshots.id,
    symbol:      stockParameterSnapshots.symbol,
    snapshotDate: stockParameterSnapshots.snapshotDate,
    price:       stockParameterSnapshots.price,
    returnFwd5d:  stockParameterSnapshots.returnFwd5d,
    returnFwd10d: stockParameterSnapshots.returnFwd10d,
    returnFwd30d: stockParameterSnapshots.returnFwd30d,
    returnFwd60d: stockParameterSnapshots.returnFwd60d,
    returnFwd90d: stockParameterSnapshots.returnFwd90d,
  })
    .from(stockParameterSnapshots)
    .where(
      and(
        isNull(stockParameterSnapshots.returnFwd5d),
        lte(stockParameterSnapshots.snapshotDate, cutoff5d),
      )
    )
    .limit(500)
    .execute();

  console.log('[label-returns] Found', rows.length, 'rows needing labels');
  if (rows.length === 0) { process.exit(0); return; }

  // Group by symbol to minimize API calls
  const bySymbol = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = bySymbol.get(row.symbol) ?? [];
    group.push(row);
    bySymbol.set(row.symbol, group);
  }

  let labeled = 0;

  for (const [symbol, symbolRows] of Array.from(bySymbol.entries())) {
    const currentPrice = await fetchCurrentPrice(symbol);
    if (!currentPrice) {
      await sleep(100);
      continue;
    }

    for (const row of symbolRows) {
      const snapshotPrice = row.price ?? 0;
      if (!snapshotPrice || snapshotPrice <= 0) continue;

      const ret = (currentPrice - snapshotPrice) / snapshotPrice * 100;
      const date = row.snapshotDate;

      await db.update(stockParameterSnapshots)
        .set({
          returnFwd5d:  date <= cutoff5d  ? ret : null,
          returnFwd10d: date <= cutoff10d ? ret : null,
          returnFwd30d: date <= cutoff30d ? ret : null,
          returnFwd60d: date <= cutoff60d ? ret : null,
          returnFwd90d: date <= cutoff90d ? ret : null,
          labeledAt:    new Date(),
        })
        .where(eq(stockParameterSnapshots.id, row.id))
        .execute();

      labeled++;
    }

    await sleep(200);
  }

  console.log('[label-returns] Labeled', labeled, 'rows');
  process.exit(0);
}

run().catch(err => {
  console.error('[label-returns] Fatal:', err);
  process.exit(1);
});
