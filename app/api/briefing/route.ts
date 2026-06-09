import { NextResponse } from 'next/server';
import { fetchMarketSnapshotCached, getMockMarketData } from '@/server/market-data';
import { getMockNewsAnalysis, analyzeNews } from '@/server/news-analyzer';
import { generateMorningBrief } from '@/server/ai-briefing';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime } from '@/lib/models/volatility';
import { fetchEconomicCalendar } from '@/server/finnhub';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const [snapshot, newsAnalysis, econEvents] = await Promise.all([
      process.env.MARKETDATA_API_KEY ? fetchMarketSnapshotCached() : Promise.resolve(getMockMarketData()),
      process.env.GNEWS_API_KEY ? analyzeNews() : Promise.resolve(getMockNewsAnalysis()),
      fetchEconomicCalendar(),
    ]);

    const { spx, vix } = snapshot;
    const impliedVol = vix.price / 100;
    const ivRankValue = Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100));

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const isMacroEventDay = econEvents.some(
      e => e.country === 'US' && e.impact === 'high' &&
        (e.time.startsWith(today) || e.time.startsWith(tomorrow))
    );

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
      isMacroEventDay,
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
