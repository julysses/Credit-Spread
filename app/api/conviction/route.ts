import { NextRequest, NextResponse } from 'next/server';
import { buildConvictionPicks } from '@/server/conviction/conviction-engine';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 10), 1), 25);

  try {
    const picks = await buildConvictionPicks(limit);
    return NextResponse.json({
      ok: true,
      data: {
        picks,
        count: picks.length,
        generatedAt: new Date().toISOString(),
        methodology: {
          fundamentals: 25,
          sec: 20,
          politician: 15,
          news: 15,
          technical: 15,
          institutional: 10,
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
