import { NextResponse } from 'next/server';
import { fetchMarketSnapshot } from '@/server/market-data';
import { analyzeNews } from '@/server/news-analyzer';
import { marketSnapshotMissingSources } from '@/server/live-data';
import {
  evaluateAllStrategies,
  assessRiskLevel,
  selectStrategy,
  MarketConditions,
  STRATEGY_METADATA,
} from '@/lib/models/strategy-engine';
import {
  classifyVIXRegime,
  computeVolatilitySkew,
  buildVolatilitySurface,
} from '@/lib/models/volatility';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await fetchMarketSnapshot();
    const missingSources = marketSnapshotMissingSources(snapshot).filter(source => source !== 'optionChain' || snapshot.providerMode === 'analytics_only');
    const hasNewsSource = process.env.GNEWS_API_KEY || process.env.NEWS_API_KEY || process.env.ALPHA_VANTAGE_API_KEY;
    const newsAnalysis = hasNewsSource ? await analyzeNews() : {
      items: [],
      overallSentiment: 'neutral' as const,
      overallScore: 0,
      geopoliticalRiskLevel: 'low' as const,
      macroRiskLevel: 'low' as const,
      keyRisks: ['News source unavailable'],
      tradeabilityScore: 50,
    };

    const { spx, vix } = snapshot;
    const impliedVol = vix.price > 0 ? vix.price / 100 : 0;
    const realizedVol = snapshot.realizedVol ?? 0;
    const dailyChangePct = spx.changePct || 0;

    const riskFreeRate = 0.05;
    const surfacePoints = snapshot.optionChain.length > 0
      ? buildVolatilitySurface(
          snapshot.optionChain.map(o => ({
            strike: o.strike, expiry: o.expiry, daysToExpiry: o.daysToExpiry,
            callBid: o.callBid, callAsk: o.callAsk, putBid: o.putBid, putAsk: o.putAsk,
          })),
          spx.price, riskFreeRate
        )
      : [];

    const skew = surfacePoints.length > 0
      ? computeVolatilitySkew(surfacePoints, spx.price, 7)
      : null;

    const vixRegime = classifyVIXRegime(vix.price);

    let directionalBias: MarketConditions['directionalBias'] = 'neutral';
    if (newsAnalysis.overallSentiment === 'bullish' && dailyChangePct > 0) directionalBias = 'bullish';
    else if (newsAnalysis.overallSentiment === 'bearish' || dailyChangePct < -0.5) directionalBias = 'bearish';

    let marketRegime: MarketConditions['marketRegime'] = 'range_bound';
    if (Math.abs(dailyChangePct) > 1.5) marketRegime = 'volatile';
    else if (dailyChangePct > 0.5) marketRegime = 'trending_up';
    else if (dailyChangePct < -0.5) marketRegime = 'trending_down';
    if (vix.price > 35) marketRegime = 'crisis';

    const ivRankValue = Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100));
    const now = new Date();
    const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const timeOfDay = ny.getHours() * 100 + ny.getMinutes();

    const conditions: MarketConditions = {
      spxPrice: spx.price,
      spyPrice: snapshot.spy.price,
      vix: vix.price,
      vixRegime,
      vixPctile: ivRankValue,
      ivRank: ivRankValue,
      directionalBias,
      marketRegime,
      riskLevel: assessRiskLevel({ vix: vix.price, spxDailyChange: dailyChangePct, isMacroEventDay: false } as MarketConditions),
      isMacroEventDay: newsAnalysis.macroRiskLevel === 'high',
      isExpiry: false,
      timeOfDay,
      spxDailyChange: dailyChangePct,
      technicalSignal: 'neutral',
      realizedVol,
      impliedVol,
      skew,
      dataConfidence: missingSources.length > 0 || !snapshot.tradeable ? 'unavailable' : 'live',
      dataWarnings: missingSources.map(source => `${source.toUpperCase()} unavailable — live strategy pricing blocked`),
      providerMode: snapshot.providerMode,
      tradeInstrument: snapshot.tradeInstrument,
      tradePrice: snapshot.tradeInstrument === 'SPY' ? snapshot.spy.price : snapshot.spx.price,
      optionChainSource: snapshot.optionChainSource,
      optionChain: snapshot.optionChain,
    };

    const recommended = missingSources.length > 0 || !snapshot.tradeable ? 'NO_TRADE' : selectStrategy(conditions);
    const allStrategies = evaluateAllStrategies(conditions);

    // Current time window checks for each strategy
    const inWindow = (windows: { start: number; end: number }[]) =>
      windows.length === 0 || windows.some(w => timeOfDay >= w.start && timeOfDay <= w.end);

    const strategyCards = allStrategies.map(({ strategy, recommendation, metadata, isRecommended, isViable }) => ({
      strategy,
      displayName: metadata.displayName,
      tagline: metadata.tagline,
      description: metadata.description,
      marketConditions: metadata.marketConditions,
      idealVIXRange: metadata.idealVIXRange,
      typicalDTE: metadata.typicalDTE,
      riskProfile: metadata.riskProfile,
      entryWindow: metadata.entryWindow,
      exitRules: metadata.exitRules,
      bestFor: metadata.bestFor,
      avoid: metadata.avoid,
      isRecommended: missingSources.length === 0 && snapshot.tradeable && isRecommended,
      isViable: missingSources.length === 0 && snapshot.tradeable && isViable,
      tradeable: missingSources.length === 0 && snapshot.tradeable,
      inEntryWindow: inWindow(metadata.entryHHMM),
      recommendation: {
        tradeType: recommendation.tradeType,
        shortLeg: recommendation.shortLeg,
        longLeg: recommendation.longLeg,
        shortLeg2: recommendation.shortLeg2 ?? null,
        longLeg2: recommendation.longLeg2 ?? null,
        credit: recommendation.credit,
        maxProfit: recommendation.maxProfit,
        maxLoss: recommendation.maxLoss,
        probOfProfit: recommendation.probOfProfit,
        probOfTouch: recommendation.probOfTouch,
        expectedValue: recommendation.expectedValue,
        kellySize: recommendation.kellySize,
        profitTarget: recommendation.profitTarget,
        stopLoss: recommendation.stopLoss,
        daysToExpiry: recommendation.daysToExpiry,
        expiryDate: recommendation.expiryDate,
        confidence: recommendation.confidence,
        warnings: recommendation.warnings,
        conditions: recommendation.conditions,
      },
    }));

    const res = NextResponse.json({
      success: true,
      data: {
        recommended,
        isMacroEventDay: conditions.isMacroEventDay,
        marketContext: {
          spxPrice: spx.price,
          spxChangePct: dailyChangePct,
          vix: vix.price,
          vixRegime,
          ivRank: ivRankValue,
          marketRegime,
          directionalBias,
          impliedVol,
          realizedVol,
          timeOfDay,
          isMarketOpen: snapshot.isMarketOpen,
          tradeable: missingSources.length === 0,
          missingSources,
          sources: snapshot.sources,
        },
        strategies: strategyCards,
      },
      timestamp: Date.now(),
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (error) {
    console.error('Strategies API error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
