import { NextResponse } from 'next/server';
import { fetchMarketSnapshot } from '@/server/market-data';
import { analyzeNews } from '@/server/news-analyzer';
import { generateMorningBrief } from '@/server/ai-briefing';
import { marketSnapshotMissingSources } from '@/server/live-data';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime } from '@/lib/models/volatility';

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
    const ivRankValue = vix.price > 0 ? Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100)) : 0;
    const dataWarnings = missingSources.map(source => `${source.toUpperCase()} unavailable — briefing trade setup blocked`);

    const conditions: MarketConditions = {
      spxPrice: spx.price,
      spyPrice: snapshot.spy.price,
      vix: vix.price,
      vixRegime: classifyVIXRegime(vix.price || 0),
      vixPctile: ivRankValue,
      ivRank: ivRankValue,
      directionalBias: 'neutral',
      marketRegime: 'range_bound',
      riskLevel: 'moderate',
      isMacroEventDay: false,
      isExpiry: false,
      timeOfDay: 1000,
      spxDailyChange: spx.changePct || 0,
      technicalSignal: 'neutral',
      realizedVol: snapshot.realizedVol ?? 0,
      impliedVol,
      skew: null,
      dataConfidence: missingSources.length > 0 || !snapshot.tradeable ? 'unavailable' : 'live',
      dataWarnings,
      providerMode: snapshot.providerMode,
      tradeInstrument: snapshot.tradeInstrument,
      tradePrice: snapshot.tradeInstrument === 'SPY' ? snapshot.spy.price : snapshot.spx.price,
      optionChainSource: snapshot.optionChainSource,
      optionChain: snapshot.optionChain,
    };

    conditions.riskLevel = assessRiskLevel(conditions);
    const decision = runStrategyEngine(conditions);
    if (missingSources.length > 0 && decision.recommendation) {
      decision.strategy = 'NO_TRADE';
      decision.recommendation.tradeType = 'no_trade';
      decision.recommendation.decisionStatus = 'data_invalid';
      decision.recommendation.confidence = 'low';
      decision.recommendation.warnings = Array.from(new Set([...(decision.recommendation.warnings ?? []), ...dataWarnings]));
    }

    const brief = await generateMorningBrief(snapshot, newsAnalysis, decision);

    return NextResponse.json({
      success: true,
      data: {
        ...brief,
        tradeable: snapshot.tradeable && missingSources.length === 0,
        missingSources,
        providerMode: snapshot.providerMode,
        tradeInstrument: snapshot.tradeInstrument,
        optionChainSource: snapshot.optionChainSource,
        sources: snapshot.sources,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
