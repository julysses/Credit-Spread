import { NextResponse } from 'next/server';
import { fetchMarketSnapshot, getMockMarketData } from '@/server/market-data';
import { buildVolatilitySurface, computeVolatilitySkew, classifyVIXRegime, ivRank } from '@/lib/models/volatility';
import { expectedMove } from '@/lib/models/black-scholes';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = process.env.MARKETDATA_API_KEY
      ? await fetchMarketSnapshot()
      : getMockMarketData();

    const { spx, vix, optionChain } = snapshot;
    const riskFreeRate = 0.05;

    // Build volatility surface
    const surfacePoints = optionChain.length > 0
      ? buildVolatilitySurface(
          optionChain.map(o => ({
            strike: o.strike,
            expiry: o.expiry,
            daysToExpiry: o.daysToExpiry,
            callBid: o.callBid,
            callAsk: o.callAsk,
            putBid: o.putBid,
            putAsk: o.putAsk,
          })),
          spx.price,
          riskFreeRate
        )
      : [];

    // Compute skew
    const skew = surfacePoints.length > 0
      ? computeVolatilitySkew(surfacePoints, spx.price, 7)
      : null;

    const impliedVol = vix.price / 100;
    const expMove7d = expectedMove(spx.price, impliedVol, 7);
    const expMove30d = expectedMove(spx.price, impliedVol, 30);

    // IV Rank (using a synthetic 52-week range approximation)
    const vixYearLow = Math.max(vix.price * 0.6, 10);
    const vixYearHigh = vix.price * 1.6;
    const ivRankValue = ivRank(vix.price, vixYearLow, vixYearHigh);

    const vixRegime = classifyVIXRegime(vix.price);

    const res = NextResponse.json({
      success: true,
      data: {
        snapshot,
        analysis: {
          vixRegime,
          ivRank: ivRankValue,
          impliedVol,
          expectedMove7d: expMove7d,
          expectedMove30d: expMove30d,
          skew,
          surfacePoints: surfacePoints.slice(0, 50),
        },
      },
      timestamp: Date.now(),
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (error) {
    console.error('Market API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch market data' }, { status: 500 });
  }
}
