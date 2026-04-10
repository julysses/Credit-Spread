import { NextResponse } from 'next/server';
import { fetchInstitutionalSignals } from '@/server/institutional-signals';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const signals = await fetchInstitutionalSignals();

    return NextResponse.json({
      success: true,
      data: {
        esOvernightHigh: signals.esOvernightHigh,
        esOvernightLow: signals.esOvernightLow,
        esCurrentPrice: signals.esCurrentPrice,
        nqOvernightHigh: signals.nqOvernightHigh,
        nqOvernightLow: signals.nqOvernightLow,
        gapVsPriorClose: signals.gapVsPriorClose,
        gapPct: signals.gapPct,
        overnightType: signals.overnightType,
        fetchedAt: signals.fetchedAt,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
