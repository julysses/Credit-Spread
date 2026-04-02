import { NextRequest, NextResponse } from 'next/server';
import { analyzeIntradaySignals, type IntradayInputs } from '@/lib/models/intraday-engine';
import { fetchMarketSnapshot } from '@/server/market-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getETHour(): { hour: number; minutesRemaining: number } {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = etStr.split(':').map(Number);
  const totalMinutes = h * 60 + m;
  const closeMinutes = 16 * 60; // 4:00 PM ET
  const minutesRemaining = Math.max(0, closeMinutes - totalMinutes);
  return { hour: h, minutesRemaining };
}

export async function POST(req: NextRequest) {
  try {
    const body: Partial<IntradayInputs> & { vwap?: number; rsi5m?: number; rsi15m?: number; openingRangeHigh?: number; openingRangeLow?: number; hasVolumeSpike?: boolean } = await req.json();

    // Fetch live market data for SPX + VIX
    let spxPrice = body.spxPrice ?? 5800;
    let vix = body.vix ?? 18;
    try {
      const snapshot = await fetchMarketSnapshot();
      spxPrice = snapshot.spx?.price ?? spxPrice;
      vix = snapshot.vix?.price ?? vix;
    } catch {
      // use caller-supplied values
    }

    const { hour: currentHourET, minutesRemaining } = getETHour();

    const inputs: IntradayInputs = {
      spxPrice,
      vix,
      vwap: body.vwap ?? spxPrice,             // default VWAP = current price
      openingRangeHigh: body.openingRangeHigh ?? spxPrice + (spxPrice * 0.002),
      openingRangeLow: body.openingRangeLow ?? spxPrice - (spxPrice * 0.002),
      rsi5m: body.rsi5m ?? 50,
      rsi15m: body.rsi15m ?? 50,
      hasVolumeSpike: body.hasVolumeSpike ?? false,
      minutesRemaining,
      currentHourET,
    };

    const result = analyzeIntradaySignals(inputs);

    return NextResponse.json({
      success: true,
      data: {
        recommendation: result,
        inputs: { ...inputs, currentHourET, minutesRemaining },
        timestamp: new Date().toISOString(),
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// GET: auto-mode (use live market data + neutral defaults)
export async function GET() {
  try {
    let spxPrice = 5800;
    let vix = 18;
    try {
      const snapshot = await fetchMarketSnapshot();
      spxPrice = snapshot.spx?.price ?? spxPrice;
      vix = snapshot.vix?.price ?? vix;
    } catch { /* ignore */ }

    const { hour: currentHourET, minutesRemaining } = getETHour();

    const inputs: IntradayInputs = {
      spxPrice,
      vix,
      vwap: spxPrice,
      openingRangeHigh: spxPrice + spxPrice * 0.002,
      openingRangeLow: spxPrice - spxPrice * 0.002,
      rsi5m: 50,
      rsi15m: 50,
      hasVolumeSpike: false,
      minutesRemaining,
      currentHourET,
    };

    const result = analyzeIntradaySignals(inputs);
    return NextResponse.json({ success: true, data: { recommendation: result, inputs, timestamp: new Date().toISOString() } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
