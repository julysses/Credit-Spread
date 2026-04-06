import { NextResponse } from 'next/server';
import { fetchSignalStackInputs } from '@/server/signal-stack-inputs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchSignalStackInputs();
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
