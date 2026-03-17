import { NextResponse } from 'next/server';
import { fetchMarketSnapshot, getMockMarketData } from '@/server/market-data';
import { getMockNewsAnalysis, analyzeNews } from '@/server/news-analyzer';
import { generateMorningBrief } from '@/server/ai-briefing';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime } from '@/lib/models/volatility';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = process.env.MARKETDATA_API_KEY
      ? await fetchMarketSnapshot()
      : getMockMarketData();
    const newsAnalysis = process.env.GNEWS_API_KEY
      ? await analyzeNews()
      : getMockNewsAnalysis();

    const { spx, vix } = snapshot;
    const impliedVol = vix.price / 100;
    const ivRankValue = Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100));

    const conditions: MarketConditions = {
      spxPrice: spx.price,
      spyPrice: snapshot.spy.price,
      vix: vix.price,
      vixRegime: classifyVIXRegime(vix.price),
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
      realizedVol: impliedVol * 0.85,
      impliedVol,
      skew: null,
    };

    conditions.riskLevel = assessRiskLevel(conditions);
    const decision = runStrategyEngine(conditions);
    const brief = await generateMorningBrief(snapshot, newsAnalysis, decision);

    return NextResponse.json({
      success: true,
      data: brief,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
