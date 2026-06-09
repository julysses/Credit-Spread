import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketSnapshot, type OptionChainEntry } from '@/server/market-data';
import { analyzeNews } from '@/server/news-analyzer';
import { marketSnapshotMissingSources } from '@/server/live-data';
import { runStrategyEngine, assessRiskLevel, MarketConditions } from '@/lib/models/strategy-engine';
import { classifyVIXRegime, computeVolatilitySkew, buildVolatilitySurface } from '@/lib/models/volatility';
import { buildDataQuality } from '@/lib/models/risk-controls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('mock') === 'true') {
      return NextResponse.json({ success: false, code: 'MOCK_DISABLED', error: 'Mock strategy data is disabled in production.' }, { status: 400 });
    }

    const snapshot = await fetchMarketSnapshot();
    const missingSources = marketSnapshotMissingSources(snapshot);
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
    const dataQuality = buildDataQuality(snapshot.sources ?? {});
    const blockingMissingSources = missingSources.filter(source => source !== 'optionChain' || snapshot.providerMode === 'analytics_only');
    if (blockingMissingSources.length > 0 || !snapshot.tradeable) {
      dataQuality.confidence = 'unavailable';
      dataQuality.tradeable = false;
      dataQuality.missingSources = Array.from(new Set([...dataQuality.missingSources, ...blockingMissingSources]));
      dataQuality.warnings.push(...blockingMissingSources.map(source => `${source.toUpperCase()} unavailable — trade recommendations blocked`));
    } else {
      dataQuality.tradeable = true;
    }

    const impliedVol = vix.price > 0 ? vix.price / 100 : 0;
    const realizedVol = snapshot.realizedVol ?? 0;
    if (!snapshot.realizedVol) {
      dataQuality.warnings.push('REALIZEDVOL unavailable — trade recommendations blocked');
    }

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

    const vixRegime = classifyVIXRegime(vix.price || 0);
    const dailyChangePct = spx.changePct || 0;

    let directionalBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (newsAnalysis.overallSentiment === 'bullish' && dailyChangePct > 0) directionalBias = 'bullish';
    else if (newsAnalysis.overallSentiment === 'bearish' || dailyChangePct < -0.5) directionalBias = 'bearish';

    let marketRegime: MarketConditions['marketRegime'] = 'range_bound';
    if (Math.abs(dailyChangePct) > 1.5) marketRegime = 'volatile';
    else if (dailyChangePct > 0.5) marketRegime = 'trending_up';
    else if (dailyChangePct < -0.5) marketRegime = 'trending_down';
    if (vix.price > 35) marketRegime = 'crisis';

    const ivRankValue = vix.price > 0 ? Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100)) : 0;

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
      dataConfidence: dataQuality.tradeable ? dataQuality.confidence : 'unavailable',
      dataWarnings: dataQuality.warnings,
      providerMode: snapshot.providerMode,
      tradeInstrument: snapshot.tradeInstrument,
      tradePrice: snapshot.tradeInstrument === 'SPY' ? snapshot.spy.price : snapshot.spx.price,
      optionChainSource: snapshot.optionChainSource,
      optionChain: snapshot.optionChain,
    };

    const decision = runStrategyEngine(conditions);

    if (!dataQuality.tradeable && decision.recommendation) {
      decision.strategy = 'NO_TRADE';
      decision.recommendation.tradeType = 'no_trade';
      decision.recommendation.decisionStatus = 'data_invalid';
      decision.recommendation.confidence = 'low';
      decision.recommendation.warnings = Array.from(new Set([
        ...(decision.recommendation.warnings ?? []),
        ...dataQuality.warnings,
      ]));
    }

    if (
      dataQuality.tradeable &&
      decision.recommendation &&
      decision.recommendation.tradeType !== 'no_trade' &&
      snapshot.optionChain.length > 0
    ) {
      const chainWarnings = checkStrikeLiquidity(
        snapshot.optionChain,
        decision.recommendation.shortLeg?.strike ?? null,
        decision.recommendation.longLeg?.strike ?? null,
        decision.recommendation.shortLeg?.optionType ?? 'put',
      );
      if (chainWarnings.length > 0) {
        decision.recommendation.warnings = [
          ...(decision.recommendation.warnings ?? []),
          ...chainWarnings,
        ];
      }
    }

    const chainLiqLabel = snapshot.sources?.optionChainLiquidity;
    if (chainLiqLabel === 'thin') {
      dataQuality.warnings.push('Option chain liquidity is thin — bid-ask spreads elevated');
    } else if (chainLiqLabel === 'missing') {
      dataQuality.warnings.push('Option chain data unavailable — strike liquidity unverified');
    }

    if (decision.recommendation?.tradeType === 'no_trade' && conditions.isMacroEventDay) {
      const macroEvent = detectMacroEvent(newsAnalysis);
      (decision.recommendation as unknown as Record<string, unknown>).noTradeEvent = macroEvent;
    }

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
        snapshot: {
          isMarketOpen: snapshot.isMarketOpen,
          sources: snapshot.sources,
          realizedVol: snapshot.realizedVol,
          providerMode: snapshot.providerMode,
          tradeInstrument: snapshot.tradeInstrument,
          tradeable: snapshot.tradeable,
          assignmentRisk: snapshot.assignmentRisk,
          taxTreatment: snapshot.taxTreatment,
          optionChainSource: snapshot.optionChainSource,
        },
        dataQuality,
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
  sources: { headline: string; url: string; source?: string }[];
}

const MACRO_EVENT_DESCRIPTIONS: Record<string, string> = {
  'FOMC Rate Decision':   'Federal Reserve interest rate decision and monetary policy statement',
  'CPI Release':          'Bureau of Labor Statistics Consumer Price Index inflation report',
  'NFP Jobs Report':      'Bureau of Labor Statistics nonfarm payroll and unemployment report',
  'GDP Release':          'Bureau of Economic Analysis gross domestic product estimate',
  'PPI Release':          'Bureau of Labor Statistics Producer Price Index report',
  'PCE Release':          'Bureau of Economic Analysis Personal Consumption Expenditures price index',
  'Earnings Risk':        'Major corporate earnings announcements with broad market impact',
  'Fiscal Event':         'Congressional action on debt ceiling, government spending, or fiscal policy',
  'Geopolitical Event':   'International conflict, sanctions, or geopolitical shock affecting markets',
  'Trade Policy Event':   'Trade negotiations, tariffs, or trade policy action affecting market sentiment',
  'Energy Market Event':  'Significant energy supply shock or oil market disruption',
  'Macro Event':          'High-impact macroeconomic or geopolitical event requiring trade caution',
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

function detectMacroEvent(newsAnalysis: { items: { headline: string; summary: string; url: string; source?: string; macroRelevance: boolean; geopoliticalRisk?: boolean; riskImpact: string }[]; keyRisks: string[] }): MacroEventInfo {
  let triggerItems = newsAnalysis.items.filter(
    i => i.macroRelevance && i.riskImpact === 'high'
  );
  if (triggerItems.length === 0) {
    triggerItems = newsAnalysis.items.filter(i => i.riskImpact === 'high');
  }
  if (triggerItems.length === 0) {
    triggerItems = newsAnalysis.items.filter(i => i.macroRelevance || i.geopoliticalRisk);
  }

  const sources = triggerItems.slice(0, 3).map(i => ({
    headline: i.headline,
    url: i.url,
    source: i.source,
  }));

  const text = triggerItems
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
  else if (/tariff|trade talks|trade war|trade deal|trade policy/.test(text)) name = 'Trade Policy Event';
  else if (/energy crisis|oil supply|opec|energy shock|oil price/.test(text)) name = 'Energy Market Event';
  else if (/geopolit|war|sanctions|military|conflict/.test(text)) name = 'Geopolitical Event';

  const description = MACRO_EVENT_DESCRIPTIONS[name] ?? MACRO_EVENT_DESCRIPTIONS['Macro Event'];
  const scheduledTime = extractScheduledTime(text);

  return { name, description, scheduledTime, sources };
}

function checkStrikeLiquidity(
  chain: OptionChainEntry[],
  shortStrike: number | null,
  longStrike: number | null,
  side: 'call' | 'put',
): string[] {
  const warnings: string[] = [];

  for (const strike of [shortStrike, longStrike]) {
    if (strike == null) continue;

    const entry = chain.reduce<OptionChainEntry | null>((best, e) => {
      const d = Math.abs(e.strike - strike);
      if (d > 2.5) return best;
      return best == null || d < Math.abs(best.strike - strike) ? e : best;
    }, null);

    if (!entry) {
      warnings.push(`Strike ${strike} not found in live chain — spread not verifiable`);
      continue;
    }

    const bid  = side === 'put' ? entry.putBid  : entry.callBid;
    const ask  = side === 'put' ? entry.putAsk  : entry.callAsk;
    const oi   = side === 'put' ? entry.putOI   : entry.callOI;
    const mid  = (bid + ask) / 2;
    const spreadPct = mid > 0 ? (ask - bid) / mid : 1;

    if (oi < 50) {
      warnings.push(`${side.toUpperCase()} ${strike}: low OI (${oi}) — fill risk elevated`);
    }
    if (spreadPct > 0.25) {
      warnings.push(`${side.toUpperCase()} ${strike}: wide bid-ask (${(spreadPct * 100).toFixed(0)}%) — use limit orders`);
    }
  }

  return warnings;
}
