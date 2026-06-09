import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { optionsFlowAlerts } from '@/database/schema';
import { desc, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days  = Math.min(parseInt(searchParams.get('days') ?? '7'), 30);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const since = new Date(Date.now() - days * 86400000);

    const alerts = await db
      .select()
      .from(optionsFlowAlerts)
      .where(gte(optionsFlowAlerts.detectedAt, since))
      .orderBy(desc(optionsFlowAlerts.detectedAt))
      .limit(limit)
      .execute();

    return NextResponse.json({
      ok: true,
      data: {
        alerts,
        count: alerts.length,
        emptyReason: alerts.length === 0 ? 'no_flow_alerts' : null,
      },
    });
  } catch (err) {
    console.error('Growth flow DB error:', err);
    return NextResponse.json({
      ok: false,
      code: 'DATA_UNAVAILABLE',
      error: 'Options flow alerts are unavailable. Check DATABASE_URL, migrations, and flow worker population.',
    }, { status: 503 });
  }
}
