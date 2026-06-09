import { NextResponse } from 'next/server';
import { scoreAllIntradayStrategies } from '@/lib/models/intraday-engine';
import { fetchMarketSnapshot } from '@/server/market-data';
import { marketSnapshotMissingSources } from '@/server/live-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await fetchMarketSnapshot();
    const missingSources = marketSnapshotMissingSources(snap).filter(source => ['spx', 'vix'].includes(source));
    if (missingSources.length > 0) {
      return NextResponse.json({
        success: false,
        code: 'DATA_UNAVAILABLE',
        feature: 'intraday-playbook',
        message: `Intraday playbook requires live market inputs: ${missingSources.join(', ')}`,
        missingSources,
        sources: snap.sources,
      }, { status: 503 });
    }

    const spxPrice = snap.spx.price;
    const vix      = snap.vix.price;

    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentHourET    = nowET.getHours();
    const currentMinuteET  = nowET.getMinutes();
    const marketCloseET    = 16 * 60;
    const nowMinutes       = currentHourET * 60 + currentMinuteET;
    const minutesRemaining = Math.max(0, marketCloseET - nowMinutes);

    const inputs = {
      spxPrice,
      vix,
      vwap:             spxPrice,
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
        sources: snap.sources,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, code: 'DATA_UNAVAILABLE', error: String(err) }, { status: 503 });
  }
}
