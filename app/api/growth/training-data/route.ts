import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { stockParameterSnapshots } from '@/database/schema';
import { and, gte, lte, isNotNull, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate           = searchParams.get('startDate') ?? '2025-01-01';
    const endDate             = searchParams.get('endDate')   ?? new Date().toISOString().split('T')[0];
    const minLabeledDays      = parseInt(searchParams.get('minReturnDaysLabeled') ?? '30');
    const format              = searchParams.get('format') ?? 'json';
    const limit               = Math.min(parseInt(searchParams.get('limit') ?? '10000'), 50000);

    const conditions = [
      gte(stockParameterSnapshots.snapshotDate, startDate),
      lte(stockParameterSnapshots.snapshotDate, endDate),
    ];

    if (minLabeledDays >= 5)  conditions.push(isNotNull(stockParameterSnapshots.returnFwd5d));
    if (minLabeledDays >= 30) conditions.push(isNotNull(stockParameterSnapshots.returnFwd30d));
    if (minLabeledDays >= 90) conditions.push(isNotNull(stockParameterSnapshots.returnFwd90d));

    const rows = await db
      .select()
      .from(stockParameterSnapshots)
      .where(and(...conditions))
      .limit(limit)
      .execute();

    if (format === 'csv') {
      if (rows.length === 0) {
        return new NextResponse('No data', { status: 200, headers: { 'Content-Type': 'text/csv' } });
      }
      const headers = Object.keys(rows[0]).join(',');
      const lines   = rows.map((row: Record<string, unknown>) => Object.values(row).map(v =>
        v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      ).join(','));
      const csv = [headers, ...lines].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv',
          'Content-Disposition': `attachment; filename="growth-training-${startDate}-${endDate}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        rows,
        count:     rows.length,
        startDate,
        endDate,
        minLabeledDays,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
