import { NextRequest, NextResponse } from 'next/server';
import { buildConvictionPick } from '@/server/conviction/conviction-engine';

export async function GET(_req: NextRequest, { params }: { params: { ticker: string } }) {
  try {
    const pick = await buildConvictionPick(params.ticker);
    return NextResponse.json({ ok: true, data: { pick, generatedAt: new Date().toISOString() } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
