import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { intelligenceDossiers } from '@/database/schema';
import { and, eq, desc } from 'drizzle-orm';
import { getMockDossier } from '@/server/intelligence-dossier';

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
      // Return mock dossier for dev
      return NextResponse.json({ ok: true, data: { dossier: getMockDossier(symbol), _mock: true } });
    }

    return NextResponse.json({ ok: true, data: { dossier: rows[0] } });
  } catch {
    return NextResponse.json({ ok: true, data: { dossier: getMockDossier(symbol), _mock: true } });
  }
}
