import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketSnapshot, getMockMarketData } from '@/server/market-data';
import { analyzeNews, getMockNewsAnalysis } from '@/server/news-analyzer';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime, computeVolatilitySkew, buildVolatilitySurface } from '@/lib/models/volatility';
import { expectedMove } from '@/lib/models/black-scholes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const useMock = url.searchParams.get('mock') === 'true';

    const snapshot = useMock ? getMockMarketData() : await fetchMarketSnapshot();
    const hasNewsSource = process.env.GNEWS_API_KEY || process.env.NEWS_API_KEY || process.env.ALPHA_VANTAGE_API_KEY;
    const newsAnalysis = useMock || !hasNewsSource
      ? getMockNewsAnalysis()
      : await analyzeNews();

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

    // If standing aside, attach the specific event that triggered it
    if (decision.recommendation?.tradeType === 'no_trade' && conditions.isMacroEventDay) {
      const macroEvent = detectMacroEvent(newsAnalysis);
      (decision.recommendation as unknown as Record<string, unknown>).noTradeEvent = macroEvent;
    }

    // Import here to avoid circular
    const { generateMorningBrief } = await import('@/server/ai-briefing');
    const brief = await generateMorningBrief(snapshot, newsAnalysis, decision);

    const res = NextResponse.json({
      success: true,
      data: {
        decision,
        brief,
        news: newsAnalysis,
        conditions: {
          ...conditions,
          vixChangePct: vix.changePct,
          spxChangePct: spx.changePct,
          spxHigh: spx.high,
          spxLow: spx.low,
          spxOpen: spx.open,
        },
        snapshot: { isMarketOpen: snapshot.isMarketOpen },
      },
      timestamp: Date.now(),
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
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

interface MacroEventInfo {
  name: string;
  description: string;
  scheduledTime: string;
  sources: { headline: string; url: string }[];
}

const MACRO_EVENT_DESCRIPTIONS: Record<string, string> = {
  'FOMC Rate Decision':  'Federal Reserve interest rate decision and monetary policy statement',
  'CPI Release':         'Bureau of Labor Statistics Consumer Price Index inflation report',
  'NFP Jobs Report':     'Bureau of Labor Statistics nonfarm payroll and unemployment report',
  'GDP Release':         'Bureau of Economic Analysis gross domestic product estimate',
  'PPI Release':         'Bureau of Labor Statistics Producer Price Index report',
  'PCE Release':         'Bureau of Economic Analysis Personal Consumption Expenditures price index',
  'Earnings Risk':       'Major corporate earnings announcements with broad market impact',
  'Fiscal Event':        'Congressional action on debt ceiling, government spending, or fiscal policy',
  'Geopolitical Event':  'International conflict, sanctions, or geopolitical shock affecting markets',
  'Macro Event':         'High-impact macroeconomic or geopolitical event requiring trade caution',
};

function extractScheduledTime(text: string): string {
  const clockMatch = text.match(
    /\b(\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?(?:\s*et|est|edt)?)\b/i
  );
  if (clockMatch) {
    return clockMatch[1].trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
  }
  const dayMatch = text.match(/\b(?:this\s+)?(monday|tuesday|wednesday|thursday|friday)\b/i);
  if (dayMatch) {
    return dayMatch[0].charAt(0).toUpperCase() + dayMatch[0].slice(1).toLowerCase();
  }
  if (/\btomorrow\b/i.test(text)) return 'Tomorrow';
  if (/\blater today\b|\bthis morning\b|\bthis afternoon\b/i.test(text)) return 'Later Today';
  return 'Today';
}

function detectMacroEvent(newsAnalysis: { items: { headline: string; summary: string; url: string; macroRelevance: boolean; riskImpact: string }[]; keyRisks: string[] }): MacroEventInfo {
  const macroItems = newsAnalysis.items.filter(
    i => i.macroRelevance && i.riskImpact === 'high'
  );

  const sources = macroItems.slice(0, 3).map(i => ({
    headline: i.headline,
    url: i.url,
  }));

  // Detect event type from headlines + summaries
  const text = macroItems
    .map(i => `${i.headline} ${i.summary}`)
    .join(' ')
    .toLowerCase();

  let name = 'Macro Event';
  if (/fomc|federal reserve|fed meeting|rate decision|rate hike|rate cut/.test(text)) name = 'FOMC Rate Decision';
  else if (/cpi|consumer price index|inflation report/.test(text)) name = 'CPI Release';
  else if (/nfp|nonfarm payroll|jobs report|employment report/.test(text)) name = 'NFP Jobs Report';
  else if (/\bgdp\b|gross domestic product/.test(text)) name = 'GDP Release';
  else if (/ppi|producer price/.test(text)) name = 'PPI Release';
  else if (/pce|personal consumption expenditure/.test(text)) name = 'PCE Release';
  else if (/earnings|quarterly results|earning season/.test(text)) name = 'Earnings Risk';
  else if (/debt ceiling|government shutdown|fiscal cliff/.test(text)) name = 'Fiscal Event';
  else if (/geopolit|war|sanctions|military|conflict/.test(text)) name = 'Geopolitical Event';

  const description = MACRO_EVENT_DESCRIPTIONS[name] ?? MACRO_EVENT_DESCRIPTIONS['Macro Event'];
  const scheduledTime = extractScheduledTime(text);

  return { name, description, scheduledTime, sources };
}
