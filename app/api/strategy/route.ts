import { NextRequest, NextResponse } from 'next/server';
import { getMockMarketData } from '@/server/market-data';
import { analyzeNews, getMockNewsAnalysis } from '@/server/news-analyzer';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime, computeVolatilitySkew, buildVolatilitySurface } from '@/lib/models/volatility';
import { expectedMove } from '@/lib/models/black-scholes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const useMock = url.searchParams.get('mock') === 'true' || !process.env.TRADIER_API_KEY;

    const snapshot = getMockMarketData(); // Always use mock for demo reliability
    const newsAnalysis = useMock ? getMockNewsAnalysis() : await analyzeNews();

    const { spx, vix } = snapshot;
    const impliedVol = vix.price / 100;
    const realizedVol = impliedVol * 0.85; // synthetic RV estimate

    // Build surface from chain
    const riskFreeRate = 0.05;
    const surfacePoints = snapshot.optionChain.length > 0
      ? buildVolatilitySurface(
          snapshot.optionChain.map(o => ({
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

    const skew = surfacePoints.length > 0
      ? computeVolatilitySkew(surfacePoints, spx.price, 7)
      : null;

    const vixRegime = classifyVIXRegime(vix.price);
    const dailyChangePct = spx.changePct || 0;

    // Determine directional bias
    let directionalBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (newsAnalysis.overallSentiment === 'bullish' && dailyChangePct > 0) directionalBias = 'bullish';
    else if (newsAnalysis.overallSentiment === 'bearish' || dailyChangePct < -0.5) directionalBias = 'bearish';

    // Market regime
    let marketRegime: MarketConditions['marketRegime'] = 'range_bound';
    if (Math.abs(dailyChangePct) > 1.5) marketRegime = 'volatile';
    else if (dailyChangePct > 0.5) marketRegime = 'trending_up';
    else if (dailyChangePct < -0.5) marketRegime = 'trending_down';
    if (vix.price > 35) marketRegime = 'crisis';

    // IV Rank synthetic
    const ivRankValue = Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100));

    const conditions: MarketConditions = {
      spxPrice: spx.price,
      spyPrice: snapshot.spy.price,
      vix: vix.price,
      vixRegime,
      vixPctile: ivRankValue,
      ivRank: ivRankValue,
      directionalBias,
      marketRegime,
      riskLevel: assessRiskLevel({
        vix: vix.price,
        spxDailyChange: dailyChangePct,
        isMacroEventDay: false,
      } as MarketConditions),
      isMacroEventDay: newsAnalysis.macroRiskLevel === 'high',
      isExpiry: false,
      timeOfDay: getCurrentTimeHHMM(),
      spxDailyChange: dailyChangePct,
      technicalSignal: 'neutral',
      realizedVol,
      impliedVol,
      skew,
    };

    const decision = runStrategyEngine(conditions);

    // Import here to avoid circular
    const { generateMorningBrief } = await import('@/server/ai-briefing');
    const brief = await generateMorningBrief(snapshot, newsAnalysis, decision);

    return NextResponse.json({
      success: true,
      data: {
        decision,
        brief,
        news: newsAnalysis,
        conditions,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Strategy API error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function getCurrentTimeHHMM(): number {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return ny.getHours() * 100 + ny.getMinutes();
}
