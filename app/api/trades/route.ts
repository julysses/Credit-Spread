import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/database/db';
import { trades } from '@/database/schema';

export const dynamic = 'force-dynamic';

const TradeSchema = z.object({
  strategy: z.string(),
  tradeType: z.string(),
  shortStrike: z.number(),
  longStrike: z.number(),
  shortStrike2: z.number().optional(),
  longStrike2: z.number().optional(),
  optionType: z.string(),
  contracts: z.number().int().positive().default(1),
  openCredit: z.number().positive(),
  expiryDate: z.string(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const allTrades = await db
      .select()
      .from(trades)
      .orderBy(desc(trades.openedAt));

    const openTrades = allTrades.filter(t => t.status === 'open');
    const closedTrades = allTrades.filter(t => t.status === 'closed');

    const totalPnl = closedTrades.reduce((a, t) => a + (t.pnl ?? 0), 0);
    const winRate = closedTrades.length > 0
      ? closedTrades.filter(t => (t.pnl ?? 0) > 0).length / closedTrades.length
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        trades: allTrades,
        summary: {
          openTrades: openTrades.length,
          closedTrades: closedTrades.length,
          totalPnl,
          winRate,
          openExposure: openTrades.reduce(
            (a, t) => a + (t.openCredit ?? 0) * (t.contracts ?? 1) * 100,
            0
          ),
        },
      },
    });
  } catch (err) {
    console.error('[trades GET]', (err as Error).message);
    // Return empty data instead of crashing when DB is unreachable
    return NextResponse.json({
      success: true,
      data: {
        trades: [],
        summary: { openTrades: 0, closedTrades: 0, totalPnl: 0, winRate: 0, openExposure: 0 },
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = TradeSchema.parse(body);

    const [trade] = await db
      .insert(trades)
      .values({
        strategy: input.strategy,
        tradeType: input.tradeType,
        shortStrike: input.shortStrike,
        longStrike: input.longStrike,
        shortStrike2: input.shortStrike2,
        longStrike2: input.longStrike2,
        optionType: input.optionType,
        contracts: input.contracts,
        openCredit: input.openCredit,
        expiryDate: input.expiryDate,
        notes: input.notes,
        status: 'open',
      })
      .returning();

    return NextResponse.json({ success: true, data: trade }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors }, { status: 400 });
    }
    console.error('[trades POST]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
