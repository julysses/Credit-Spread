import { NextResponse } from 'next/server';
import { fetchSignalStackInputs } from '@/server/signal-stack-inputs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchSignalStackInputs();
    const res = NextResponse.json({ success: true, data });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
