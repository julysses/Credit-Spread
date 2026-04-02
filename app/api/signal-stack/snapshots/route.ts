import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { signalSnapshots } from '@/database/schema';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// GET — last 10 snapshots ordered by most recent
export async function GET() {
  try {
    const data = await db
      .select()
      .from(signalSnapshots)
      .orderBy(desc(signalSnapshots.createdAt))
      .limit(10);

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// POST — insert new signal snapshot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const [record] = await db
      .insert(signalSnapshots)
      .values({
        wtiPrice:               body.wtiPrice               ?? body.wti_price,
        wti4weekChangePct:      body.wti4wkChangePct        ?? body.wti_4week_change_pct,
        spxPrice:               body.spxPrice               ?? body.spx_price,
        spx200sma:              body.spx200sma              ?? body.spx_200sma,
        breadthPctAbove200sma:  body.breadthPctAbove200     ?? body.breadth_pct_above_200sma,
        hySpreadBps:            body.hySpreadBps            ?? body.hy_spread_bps,
        hySpread2weekChange:    body.hySpread2wkChange      ?? body.hy_spread_2week_change,
        dxyLevel:               body.dxyLevel               ?? body.dxy_level,
        vixLevel:               body.vixLevel               ?? body.vix_level,
        goldPrice:              body.goldPrice              ?? body.gold_price,
        goldWeeklyChangePct:    body.goldWeeklyChangePct    ?? body.gold_weekly_change_pct,
        portfolioVolAnnualized: body.portfolioVolAnnualized ?? body.portfolio_vol_annualized,
        gexValue:               body.gexValue               ?? body.gex_value,
        vvixLevel:              body.vvixLevel              ?? body.vvix_level,
        pcrValue:               body.pcrValue               ?? body.pcr_value,
        macroScore:             body.macroScore             ?? body.macro_score,
        flowScore:              body.flowScore              ?? body.flow_score,
        compositeSignal:        body.compositeSignal        ?? body.composite_signal,
        notes:                  body.notes,
        aiRecommendation:       body.aiRecommendation       ?? body.ai_recommendation,
      })
      .returning();

    return NextResponse.json({ success: true, data: record });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// PATCH — update ai_recommendation and/or notes on an existing snapshot
export async function PATCH(req: NextRequest) {
  try {
    const { id, ai_recommendation, aiRecommendation, notes } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const [record] = await db
      .update(signalSnapshots)
      .set({
        aiRecommendation: aiRecommendation ?? ai_recommendation,
        notes,
      })
      .where(eq(signalSnapshots.id, Number(id)))
      .returning();

    return NextResponse.json({ success: true, data: record });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
