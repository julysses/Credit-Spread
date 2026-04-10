import { NextRequest, NextResponse } from 'next/server';
import { fetchInstitutionalSignals } from '@/server/institutional-signals';
import type { DarkPoolOverride } from '@/server/institutional-signals';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Dark pool manual override via query params (e.g. ?dpBias=bullish&dpCallPct=68)
  const dpBias = searchParams.get('dpBias') as DarkPoolOverride['bias'] | null;
  const dpCallPct = searchParams.get('dpCallPct');
  const darkPoolOverride: DarkPoolOverride | undefined =
    dpBias && dpCallPct
      ? { bias: dpBias, callPct: parseFloat(dpCallPct) }
      : undefined;

  try {
    const signals = await fetchInstitutionalSignals(darkPoolOverride);
    return NextResponse.json({ success: true, data: signals });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
