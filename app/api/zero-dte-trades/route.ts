import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { zeroDteTrades } from '@/database/schema';
import { desc, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── GET — last 50 trades + computed stats ────────────────────────────────────

export async function GET() {
  try {
    const trades = await db
      .select()
      .from(zeroDteTrades)
      .orderBy(desc(zeroDteTrades.createdAt))
      .limit(50);

    // Compute stats from returned rows
    const withPnl = trades.filter(t => t.totalPnl != null);
    const wins = withPnl.filter(t => (t.totalPnl ?? 0) > 0);
    const losses = withPnl.filter(t => (t.totalPnl ?? 0) < 0);

    const totalTrades = withPnl.length;
    const winRate = totalTrades > 0 ? wins.length / totalTrades : 0;
    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + (t.totalPnl ?? 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((s, t) => s + (t.totalPnl ?? 0), 0) / losses.length
      : 0;
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

    // Best strategy by win rate (min 3 trades)
    const byStrategy: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of withPnl) {
      if (!byStrategy[t.strategyName]) byStrategy[t.strategyName] = { wins: 0, total: 0, pnl: 0 };
      byStrategy[t.strategyName].total++;
      byStrategy[t.strategyName].pnl += t.totalPnl ?? 0;
      if ((t.totalPnl ?? 0) > 0) byStrategy[t.strategyName].wins++;
    }

    const byStrategyList = Object.entries(byStrategy).map(([name, s]) => ({
      name,
      winRate: s.total > 0 ? s.wins / s.total : 0,
      totalPnl: s.pnl,
      totalTrades: s.total,
    }));

    const bestStrategy = byStrategyList
      .filter(s => s.totalTrades >= 3)
      .sort((a, b) => b.winRate - a.winRate)[0]?.name ?? (byStrategyList[0]?.name ?? '—');

    return NextResponse.json({
      success: true,
      data: {
        trades,
        stats: {
          totalTrades,
          winRate,
          avgWin,
          avgLoss,
          expectancy,
          bestStrategy,
          byStrategy: byStrategyList,
        },
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── POST — log a new 0DTE trade ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const [record] = await db
      .insert(zeroDteTrades)
      .values({
        strategyName:        body.strategyName,
        vixAtEntry:          body.vixAtEntry ?? null,
        vix1dAtEntry:        body.vix1dAtEntry ?? null,
        vix1d20dAvg:         body.vix1d20dAvg ?? null,
        gexEnvironment:      body.gexEnvironment ?? null,
        spxVs20sma:          body.spxVs20sma ?? null,
        potrValue:           body.potrValue ?? null,
        underlying:          body.underlying ?? 'SPX',
        expirationDate:      body.expirationDate ?? null,
        structureType:       body.structureType ?? null,
        shortPutStrike:      body.shortPutStrike ?? null,
        longPutStrike:       body.longPutStrike ?? null,
        shortCallStrike:     body.shortCallStrike ?? null,
        longCallStrike:      body.longCallStrike ?? null,
        spreadWidth:         body.spreadWidth ?? null,
        entryTime:           body.entryTime ?? null,
        entryCredit:         body.entryCredit ?? null,
        maxRisk:             body.maxRisk ?? null,
        rewardRiskRatio:     body.rewardRiskRatio ?? null,
        contracts:           body.contracts ?? 1,
        totalCreditReceived: body.totalCreditReceived ?? null,
        exitTime:            body.exitTime ?? null,
        exitDebit:           body.exitDebit ?? null,
        outcome:             body.outcome ?? null,
        pnlPerContract:      body.pnlPerContract ?? null,
        totalPnl:            body.totalPnl ?? null,
        allConditionsMet:    body.allConditionsMet ?? null,
        conditionsSkipped:   body.conditionsSkipped ?? null,
        notes:               body.notes ?? null,
        signalSnapshotId:    body.signalSnapshotId ?? null,
      })
      .returning();

    return NextResponse.json({ success: true, data: record });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
