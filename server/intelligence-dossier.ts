/**
 * Intelligence Dossier Builder
 * Assembles a 8-layer hedge fund research dossier for each top stock candidate.
 * All layers fetched in parallel; synthesized by Claude into an investment memo.
 */

import axios from 'axios';
import { analyzeNewsForSymbol } from './news-analyzer';
import type { FundamentalsData, InsiderData, AnalystEstimatesData } from './fundamentals';
import type { StockFlowSummary } from './options-flow';
import type { InstitutionalData } from './institutional';
import type { GrowthFeatures } from '@/lib/models/growth-screener';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsLayer {
  recentHeadlines: { headline: string; sentiment: 'positive' | 'negative' | 'neutral'; source: string; publishedAt: string }[];
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  catalystEvents: string[];
  macroAlignment: string;
}

export interface TechnicalsLayer {
  weeklyTrend: 'above_40w_sma' | 'below_40w_sma';
  dailyRSI: number;
  macdStatus: string;
  keySupport: number;
  keyResistance: number;
  distFrom52wHighPct: number;
  relStrengthVsSpy1m: number;
  relStrengthVsSector1m: number;
}

export interface SectorLayer {
  sectorName: string;
  sectorEtf: string;
  sectorMomentum1m: number;
  sectorRank: string;  // e.g. "#2 of 11 sectors"
  macroTheme: string;  // 'AI tailwind', 'rate-sensitive', etc.
  peers: { symbol: string; performance1m: number }[];
}

export interface InvestmentMemo {
  bullCase: string;
  bearCase: string;
  entryStrategy: string;
  keyCatalysts: string;
  keyRisks: string;
  targetPriceRange: string;
  convictionLevel: 'High' | 'Medium' | 'Speculative';
  fullMemo: string;
  generatedBy: 'claude' | 'template';
}

export interface IntelligenceDossier {
  symbol: string;
  companyName: string;
  generatedAt: string;
  layer1_fundamentals: FundamentalsData;
  layer2_valuation: {
    peRatio: number; forwardPe: number; psRatio: number;
    evEbitda: number; pegRatio: number;
    impliedUpside: number; analystTargetPrice: number;
    numberOfAnalysts: number; consensusRating: string;
  };
  layer3_news: NewsLayer;
  layer4_institutional: InstitutionalData;
  layer5_options: StockFlowSummary;
  layer6_technicals: TechnicalsLayer;
  layer7_sector: SectorLayer;
  layer8_aiMemo: InvestmentMemo;
}

// ─── News Layer Builder ───────────────────────────────────────────────────────

async function buildNewsLayer(symbol: string, companyName: string): Promise<NewsLayer> {
  const { headlines, overallSentiment } = await analyzeNewsForSymbol(symbol, companyName);

  // Detect catalyst keywords in headlines
  const catalysts: string[] = [];
  for (const item of headlines) {
    const text = (item.headline).toLowerCase();
    if (/earnings|guidance|fda|merger|acquisition|buyback|dividend/.test(text)) {
      const catalyst =
        /earnings/.test(text) ? 'Earnings announcement' :
        /guidance/.test(text) ? 'Guidance update' :
        /fda/.test(text) ? 'FDA decision' :
        /merger|acquisition/.test(text) ? 'M&A activity' :
        /buyback/.test(text) ? 'Share buyback' : 'Corporate event';
      if (!catalysts.includes(catalyst)) catalysts.push(catalyst);
    }
  }

  return {
    recentHeadlines: headlines,
    overallSentiment,
    catalystEvents: catalysts,
    macroAlignment: '',
  };
}

// ─── Technicals Layer Builder ─────────────────────────────────────────────────

function buildTechnicalsLayer(features: GrowthFeatures, sectorEtfReturn: number): TechnicalsLayer {
  const t = features.technical;
  const closes = [];
  // 40-week SMA proxy: use sma200 as close enough
  const weeklyTrend: TechnicalsLayer['weeklyTrend'] = t.lastClose > t.sma200 ? 'above_40w_sma' : 'below_40w_sma';

  const macdStatus =
    features.macdBullishCrossover ? `Bullish crossover ${features.macdDaysAgo === 0 ? 'today' : features.macdDaysAgo + 'd ago'}` :
    features.rsi14 > 50 ? 'Neutral — above midline' : 'Bearish — below midline';

  // Key support: last major swing low proxy (sma200 or sma50 as floor)
  const keySupport    = Math.min(t.sma200, t.sma50);
  const keyResistance = t.high52w;

  return {
    weeklyTrend,
    dailyRSI:             features.rsi14,
    macdStatus,
    keySupport:           parseFloat(keySupport.toFixed(2)),
    keyResistance:        parseFloat(keyResistance.toFixed(2)),
    distFrom52wHighPct:   t.distFrom52wHighPct,
    relStrengthVsSpy1m:   features.relStrengthVsSpy1m,
    relStrengthVsSector1m: sectorEtfReturn,
  };
}

// ─── Sector Layer Builder ─────────────────────────────────────────────────────

function buildSectorLayer(features: GrowthFeatures): SectorLayer {
  const fd = features.fundamentals;
  const sector = fd.sector;

  const macroTheme =
    /technology|software|semiconductor|ai/i.test(sector + fd.industry) ? 'AI & Tech tailwind' :
    /healthcare|biotech|pharma/i.test(sector) ? 'Healthcare innovation' :
    /energy|oil|gas/i.test(sector) ? 'Commodity cycle' :
    /financial|bank/i.test(sector) ? 'Rate-sensitive (Fed policy)' :
    /consumer|retail/i.test(sector) ? 'Consumer spending cycle' :
    'Sector rotation play';

  return {
    sectorName:       sector,
    sectorEtf:        'XLK', // placeholder; resolved from SYMBOL_ETF_MAP in worker
    sectorMomentum1m: 0,     // filled in by worker
    sectorRank:       'N/A',
    macroTheme,
    peers:            [],    // filled in by worker
  };
}

// ─── AI Investment Memo Generator ────────────────────────────────────────────

async function generateInvestmentMemo(
  symbol: string,
  dossierContext: string,
): Promise<InvestmentMemo> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return generateTemplateMemo(symbol, dossierContext);
  }

  const systemPrompt = `You are a senior portfolio manager at a quantitative hedge fund.
Generate a concise, actionable investment memo for an equity position.
Structure your response EXACTLY as follows (use these exact headers):

BULL CASE: [2-3 sentences]
BEAR CASE: [2-3 sentences]
ENTRY STRATEGY: [1-2 sentences on optimal entry zone and sizing]
KEY CATALYSTS: [bullet list of 2-3 upcoming catalysts]
KEY RISKS: [bullet list of 2-3 risks that would invalidate the thesis]
TARGET PRICE RANGE: [$X - $Y over Z months]
CONVICTION: [High / Medium / Speculative] — [one-line rationale]

Be specific, data-driven, and institutional in tone. Total under 350 words.`;

  try {
    const resp = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate investment memo for ${symbol}:\n\n${dossierContext}` }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const text: string = resp.data?.content?.[0]?.text ?? '';
    return parseMemo(text, 'claude');
  } catch (err) {
    console.error('[dossier] Claude memo failed:', (err as Error).message);
    return generateTemplateMemo(symbol, dossierContext);
  }
}

function parseMemo(text: string, source: 'claude' | 'template'): InvestmentMemo {
  const extract = (label: string) => {
    const match = text.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i'));
    return match ? match[1].trim() : '';
  };

  const convictionRaw = extract('CONVICTION').toUpperCase();
  const convictionLevel: InvestmentMemo['convictionLevel'] =
    convictionRaw.startsWith('HIGH') ? 'High' :
    convictionRaw.startsWith('MEDIUM') ? 'Medium' : 'Speculative';

  return {
    bullCase:         extract('BULL CASE'),
    bearCase:         extract('BEAR CASE'),
    entryStrategy:    extract('ENTRY STRATEGY'),
    keyCatalysts:     extract('KEY CATALYSTS'),
    keyRisks:         extract('KEY RISKS'),
    targetPriceRange: extract('TARGET PRICE RANGE'),
    convictionLevel,
    fullMemo:         text,
    generatedBy:      source,
  };
}

function generateTemplateMemo(symbol: string, context: string): InvestmentMemo {
  return {
    bullCase:         `${symbol} shows strong fundamental momentum with accelerating revenue growth and positive insider activity. Technical structure supports continued upside with price holding above key moving averages.`,
    bearCase:         `Valuation premium leaves limited margin of safety if growth decelerates. Macro headwinds or rising rates could compress multiples despite solid fundamentals.`,
    entryStrategy:    `Consider initiating on pullbacks to the 20 EMA with position sizing at 2-3% of portfolio. Scale in over 2-3 entries if volatility permits.`,
    keyCatalysts:     `• Upcoming earnings report\n• Analyst estimate revisions\n• Sector rotation into growth`,
    keyRisks:         `• Guidance miss at next earnings\n• Macro regime shift to risk-off\n• Valuation compression if rates rise`,
    targetPriceRange: 'N/A — AI memo requires ANTHROPIC_API_KEY',
    convictionLevel:  'Medium',
    fullMemo:         context,
    generatedBy:      'template',
  };
}

// ─── Dossier Context Builder ──────────────────────────────────────────────────

function buildDossierContext(
  symbol: string,
  fd: FundamentalsData,
  institutional: InstitutionalData,
  flow: StockFlowSummary,
  news: NewsLayer,
  technicals: TechnicalsLayer,
  sector: SectorLayer,
): string {
  return `
COMPANY: ${fd.companyName} (${symbol}) | ${fd.sector} | Market Cap: $${fd.marketCap.toFixed(1)}B

FUNDAMENTALS:
- Revenue Growth YoY: ${fd.revenueGrowthYoy.toFixed(1)}%
- EPS Growth YoY: ${fd.epsGrowthYoy.toFixed(1)}%
- Gross Margin: ${fd.grossMargin.toFixed(1)}% | Net Margin: ${fd.netMargin.toFixed(1)}%
- FCF Margin: ${fd.fcfMargin.toFixed(1)}% | ROE: ${fd.roe.toFixed(1)}%
- Earnings Surprise (last Q): +${fd.earningsSurprisePct.toFixed(1)}%

VALUATION:
- P/E: ${fd.peRatio.toFixed(1)}x | Forward P/E: ${fd.forwardPe.toFixed(1)}x
- P/S: ${fd.psRatio.toFixed(1)}x | PEG: ${fd.pegRatio.toFixed(1)}
- Analyst Target: $${fd.analystTargetPrice.toFixed(0)} (${fd.impliedUpside > 0 ? '+' : ''}${fd.impliedUpside.toFixed(1)}% upside)
${fd.daysToEarnings ? `- Next Earnings: ${fd.daysToEarnings} days away` : ''}

TECHNICALS:
- Trend: ${technicals.weeklyTrend === 'above_40w_sma' ? 'Above 40-week SMA (bullish)' : 'Below 40-week SMA (caution)'}
- RSI(14): ${technicals.dailyRSI}
- MACD: ${technicals.macdStatus}
- From 52w High: ${technicals.distFrom52wHighPct.toFixed(1)}%
- vs SPY (1M): ${technicals.relStrengthVsSpy1m > 0 ? '+' : ''}${technicals.relStrengthVsSpy1m.toFixed(1)}%

SMART MONEY:
- HF Position Change: ${institutional.hfNetShareChangePct > 0 ? '+' : ''}${institutional.hfNetShareChangePct.toFixed(1)}% QoQ
- Insider Activity (90d): ${institutional.insiderNetBuyDollars90d > 0 ? 'Net BUYING' : 'Net SELLING'} $${Math.abs(institutional.insiderNetBuyDollars90d / 1000).toFixed(0)}K
- Short Float: ${institutional.shortFloatPct.toFixed(1)}%

OPTIONS FLOW:
- Flow Sentiment: ${flow.sentiment}
- IV Rank: ${flow.ivRank.toFixed(0)}
- Put/Call Ratio: ${flow.putCallVolumeRatio.toFixed(2)}
${flow.unusualCallCount > 0 ? `- Unusual Calls: ${flow.unusualCallCount} sweeps detected` : ''}

NEWS (7 days):
- Sentiment: ${news.overallSentiment}
${news.recentHeadlines.slice(0, 3).map(h => `- ${h.headline}`).join('\n')}
${news.catalystEvents.length > 0 ? `- Catalysts: ${news.catalystEvents.join(', ')}` : ''}

MACRO THEME: ${sector.macroTheme}
`.trim();
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export async function buildIntelligenceDossier(
  symbol: string,
  features: GrowthFeatures,
  analystData?: AnalystEstimatesData | null,
): Promise<IntelligenceDossier> {
  const fd = features.fundamentals;
  const institutional = features.institutional;
  const flow = features.flow;

  // Fetch news layer (can run in parallel but needs symbol/companyName)
  const news = await buildNewsLayer(symbol, fd.companyName);

  const technicals = buildTechnicalsLayer(features, 0);
  const sector     = buildSectorLayer(features);

  const dossierContext = buildDossierContext(symbol, fd, institutional, flow, news, technicals, sector);
  const aiMemo = await generateInvestmentMemo(symbol, dossierContext);

  return {
    symbol,
    companyName:     fd.companyName,
    generatedAt:     new Date().toISOString(),
    layer1_fundamentals: fd,
    layer2_valuation: {
      peRatio:          fd.peRatio,
      forwardPe:        fd.forwardPe,
      psRatio:          fd.psRatio,
      evEbitda:         fd.evEbitda,
      pegRatio:         fd.pegRatio,
      impliedUpside:    fd.impliedUpside,
      analystTargetPrice: fd.analystTargetPrice,
      numberOfAnalysts: analystData?.numberOfAnalysts ?? 0,
      consensusRating:  analystData?.consensusRating ?? 'hold',
    },
    layer3_news:          news,
    layer4_institutional: institutional,
    layer5_options:       flow,
    layer6_technicals:    technicals,
    layer7_sector:        sector,
    layer8_aiMemo:        aiMemo,
  };
}

// ─── Mock Dossier ─────────────────────────────────────────────────────────────

export function getMockDossier(symbol: string): IntelligenceDossier {
  const fd = {
    symbol, companyName: `${symbol} Corp`, sector: 'Technology', industry: 'Software',
    marketCap: 150, revenueGrowthYoy: 28, revenueGrowthQoq: 7, epsGrowthYoy: 35, epsGrowthQoq: 9,
    grossMargin: 72, operatingMargin: 25, netMargin: 20, fcfMargin: 22,
    roe: 32, roa: 18, debtToEbitda: 1.2, currentRatio: 2.1, netCash: 500,
    peRatio: 38, forwardPe: 28, psRatio: 8, pbRatio: 6, evEbitda: 32, pegRatio: 1.4,
    earningsSurprisePct: 8, earningsSurpriteRate4q: 9, analystTargetPrice: 320, impliedUpside: 22,
    epsRevisionUp30d: 4, epsRevisionDown30d: 0, nextEarningsDate: '2025-08-15', daysToEarnings: 25,
  } as FundamentalsData;

  return {
    symbol, companyName: `${symbol} Corp`, generatedAt: new Date().toISOString(),
    layer1_fundamentals: fd,
    layer2_valuation: { peRatio: 38, forwardPe: 28, psRatio: 8, evEbitda: 32, pegRatio: 1.4, impliedUpside: 22, analystTargetPrice: 320, numberOfAnalysts: 18, consensusRating: 'buy' },
    layer3_news: { recentHeadlines: [{ headline: `${symbol} beats Q2 estimates`, sentiment: 'positive', source: 'Reuters', publishedAt: new Date().toISOString() }], overallSentiment: 'bullish', catalystEvents: ['Upcoming earnings'], macroAlignment: 'AI tailwind' },
    layer4_institutional: { symbol, institutionalOwnershipPct: 72, hfNetShareChangePct: 3.2, topHolders: [], insiderNetBuyDollars90d: 450000, shortFloatPct: 4.2, shortRatioDaysToCover: 1.8, shortFloatChangePct: -0.5, institutionalScore: 18 },
    layer5_options: { symbol, flowScore: 10, sentiment: 'bullish', unusualCallCount: 2, unusualPutCount: 0, putCallVolumeRatio: 0.52, putCallOiRatio: 0.65, ivRank: 45, ivPercentile: 48, impliedMoveEarnings: 7, alerts: [] },
    layer6_technicals: { weeklyTrend: 'above_40w_sma', dailyRSI: 62, macdStatus: 'Bullish crossover 3d ago', keySupport: 240, keyResistance: 290, distFrom52wHighPct: 4.2, relStrengthVsSpy1m: 6.8, relStrengthVsSector1m: 2.1 },
    layer7_sector: { sectorName: 'Technology', sectorEtf: 'XLK', sectorMomentum1m: 5.2, sectorRank: '#1 of 11', macroTheme: 'AI & Tech tailwind', peers: [{ symbol: 'MSFT', performance1m: 4.1 }, { symbol: 'GOOGL', performance1m: 3.8 }] },
    layer8_aiMemo: {
      bullCase: `${symbol} demonstrates accelerating revenue growth with strong FCF generation, positioning it well for continued market share gains. Hedge fund accumulation and insider buying confirm institutional conviction in the thesis.`,
      bearCase: 'Premium valuation leaves little room for execution errors. Any guidance miss or macro-driven multiple compression could result in significant downside from current levels.',
      entryStrategy: 'Initiate 2% position on pullbacks to the 20 EMA (~$245). Add on earnings confirmation. Stop-loss below the 50 SMA.',
      keyCatalysts: '• Earnings in 25 days — consensus expects 8% EPS beat\n• New product cycle announcement\n• Continued AI infrastructure spend',
      keyRisks: '• Macro headwinds from rate uncertainty\n• Competitive pressure from hyperscalers\n• Margin compression if growth decelerates',
      targetPriceRange: `$${Math.round(fd.analystTargetPrice * 0.9)} - $${Math.round(fd.analystTargetPrice * 1.1)} over 12 months`,
      convictionLevel: 'High',
      fullMemo: '',
      generatedBy: 'template',
    },
  };
}
