import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { intelligenceDossiers } from '@/database/schema';
import { and, eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const symbol = params.ticker.toUpperCase();

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    const conditions = [eq(intelligenceDossiers.symbol, symbol)];
    if (date) conditions.push(eq(intelligenceDossiers.dossierDate, date));

    const rows = await db
      .select()
      .from(intelligenceDossiers)
      .where(and(...conditions))
      .orderBy(desc(intelligenceDossiers.dossierDate))
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          dossier: null,
          symbol,
          emptyReason: 'no_dossier_data',
        },
      });
    }

    return NextResponse.json({ ok: true, data: { dossier: rows[0] } });
  } catch (err) {
    console.error(`Growth dossier DB error (${symbol}):`, err);
    return NextResponse.json({
      ok: false,
      code: 'DATA_UNAVAILABLE',
      error: 'Growth dossier is unavailable. Check DATABASE_URL, migrations, and dossier generation.',
      symbol,
    }, { status: 503 });
  }
}
