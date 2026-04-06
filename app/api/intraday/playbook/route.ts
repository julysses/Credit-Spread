import { NextResponse } from 'next/server';
import { scoreAllIntradayStrategies } from '@/lib/models/intraday-engine';
import { fetchMarketSnapshot, getMockMarketData } from '@/server/market-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch live market data; fall back to mock if unavailable
    let snap;
    try {
      snap = await fetchMarketSnapshot();
      if (!snap || snap.spx.price <= 0) snap = getMockMarketData();
    } catch {
      snap = getMockMarketData();
    }

    const spxPrice = snap.spx.price;
    const vix      = snap.vix.price;

    // Build intraday inputs with neutral/default technicals
    // (the playbook uses market-structure signals; VWAP + RSI can be overridden later)
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentHourET    = nowET.getHours();
    const currentMinuteET  = nowET.getMinutes();
    const marketCloseET    = 16 * 60;               // 4:00 PM
    const nowMinutes       = currentHourET * 60 + currentMinuteET;
    const minutesRemaining = Math.max(0, marketCloseET - nowMinutes);

    const inputs = {
      spxPrice,
      vix,
      vwap:             spxPrice,       // neutral: assume price = VWAP
      openingRangeHigh: spxPrice + spxPrice * 0.002,
      openingRangeLow:  spxPrice - spxPrice * 0.002,
      rsi5m:  50,
      rsi15m: 50,
      hasVolumeSpike:   false,
      minutesRemaining: minutesRemaining > 0 ? minutesRemaining : 390,
      currentHourET,
    };

    const strategies = scoreAllIntradayStrategies(inputs);

    return NextResponse.json({
      success: true,
      data: {
        sessionDate:      nowET.toISOString().slice(0, 10),
        spxPrice,
        vix,
        marketOpen:       snap.isMarketOpen,
        minutesRemaining,
        strategies,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
