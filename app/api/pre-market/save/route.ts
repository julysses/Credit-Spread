import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { dailySignals, sessionPlans } from '@/database/schema';
import { eq } from 'drizzle-orm';
import type { InstitutionalSignals } from '@/server/institutional-signals';

export const dynamic = 'force-dynamic';

interface SaveRequest {
  signals: InstitutionalSignals;
  tradePlan?: {
    rawOutput: string;
    sections: Record<string, string>;
    appliedRules: string[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveRequest = await req.json();
    const { signals, tradePlan } = body;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

    // Upsert daily_signals (unique on signal_date)
    const existing = await db
      .select({ id: dailySignals.id })
      .from(dailySignals)
      .where(eq(dailySignals.signalDate, today))
      .limit(1);

    let signalId: number;

    if (existing.length > 0) {
      signalId = existing[0].id;
      await db
        .update(dailySignals)
        .set({
          spxClose: signals.spxClose ?? undefined,
          spxVs200sma: signals.spxVs200smaPct ?? undefined,
          vixClose: signals.vixSpot ?? undefined,
          vvixClose: signals.vvixClose ?? undefined,
          vix9d: signals.vix9d ?? undefined,
          vix30: signals.vix3m ?? undefined,
          vixTermStructure: signals.vixTermStructure ?? undefined,
          gexNet: signals.gexNet ?? undefined,
          gammaFlipLevel: signals.gammaFlipLevel ?? undefined,
          callWall: signals.callWall ?? undefined,
          putWall: signals.putWall ?? undefined,
          darkPoolBias: signals.darkPoolBias,
          darkPoolCallPct: signals.darkPoolCallPct,
          adRatio: signals.adRatio ?? undefined,
          pctAbove200sma: signals.pctAbove200sma ?? undefined,
          catalystRisk: signals.catalystRisk,
          catalystDetail: signals.catalystDetail || undefined,
          tierScore: signals.tierScore,
        })
        .where(eq(dailySignals.id, signalId));
    } else {
      const inserted = await db
        .insert(dailySignals)
        .values({
          signalDate: today,
          spxClose: signals.spxClose ?? undefined,
          spxVs200sma: signals.spxVs200smaPct ?? undefined,
          vixClose: signals.vixSpot ?? undefined,
          vvixClose: signals.vvixClose ?? undefined,
          vix9d: signals.vix9d ?? undefined,
          vix30: signals.vix3m ?? undefined,
          vixTermStructure: signals.vixTermStructure ?? undefined,
          gexNet: signals.gexNet ?? undefined,
          gammaFlipLevel: signals.gammaFlipLevel ?? undefined,
          callWall: signals.callWall ?? undefined,
          putWall: signals.putWall ?? undefined,
          darkPoolBias: signals.darkPoolBias,
          darkPoolCallPct: signals.darkPoolCallPct,
          adRatio: signals.adRatio ?? undefined,
          pctAbove200sma: signals.pctAbove200sma ?? undefined,
          catalystRisk: signals.catalystRisk,
          catalystDetail: signals.catalystDetail || undefined,
          tierScore: signals.tierScore,
        })
        .returning({ id: dailySignals.id });
      signalId = inserted[0].id;
    }

    // If a trade plan is provided, save it too
    let planId: number | undefined;
    if (tradePlan) {
      const plan = await db
        .insert(sessionPlans)
        .values({
          planDate: today,
          signalId,
          regimeTier: signals.tierScore,
          strategy: tradePlan.sections['RECOMMENDED STRATEGY'] ?? tradePlan.rawOutput,
          strikes: tradePlan.sections['STRIKE SELECTION'] ?? undefined,
          positionSizePct: undefined, // parsed from section text if needed
          entryConditions: tradePlan.sections['ENTRY CONDITIONS'] ?? undefined,
          exitRules: tradePlan.sections['EXIT RULES'] ?? undefined,
          claudeRawOutput: tradePlan.rawOutput,
          appliedRules: tradePlan.appliedRules,
        })
        .returning({ id: sessionPlans.id });
      planId = plan[0].id;
    }

    return NextResponse.json({ success: true, signalId, planId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
