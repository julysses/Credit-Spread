/**
 * AI Morning Briefing Generator
 * Uses Claude/GPT to generate institutional morning brief
 */

import axios from 'axios';
import { MarketDataSnapshot } from './market-data';
import { NewsAnalysis } from './news-analyzer';
import { StrategyDecision } from '../lib/models/strategy-engine';

export interface MorningBrief {
  date: string;
  executiveSummary: string;
  marketOverview: string;
  volatilityAnalysis: string;
  geopoliticalRisk: string;
  strategyOutlook: string;
  keyLevels: string;
  riskWarnings: string;
  fullText: string;
  generatedBy: 'claude' | 'gpt' | 'template';
}

const BRIEF_SYSTEM_PROMPT = `You are the head of a hedge fund SPX options desk.
Generate a concise, institutional-grade morning briefing for options traders.
Focus on: market regime, volatility conditions, key levels, and credit spread strategy.
Be specific, data-driven, and actionable. Keep it under 400 words total.`;

export async function generateMorningBrief(
  marketData: MarketDataSnapshot,
  newsAnalysis: NewsAnalysis,
  strategy: StrategyDecision
): Promise<MorningBrief> {
  const { spx, vix } = marketData;
  const date = new Date().toISOString().split('T')[0];

  const context = `
Market Data:
- SPX: ${spx.price.toFixed(2)} (${spx.changePct.toFixed(2)}%)
- VIX: ${vix.price.toFixed(2)} (${vix.changePct.toFixed(2)}%)
- IV Rank: ${strategy.conditions.ivRank?.toFixed(0) || 'N/A'}
- Market Regime: ${strategy.conditions.marketRegime}
- Risk Level: ${strategy.conditions.riskLevel}

News Sentiment: ${newsAnalysis.overallSentiment}
Geopolitical Risk: ${newsAnalysis.geopoliticalRiskLevel}
Macro Risk: ${newsAnalysis.macroRiskLevel}
Tradeability Score: ${newsAnalysis.tradeabilityScore}/100

Key News: ${newsAnalysis.items.slice(0, 3).map(n => n.headline).join('; ')}

Strategy: ${strategy.strategy}
${strategy.recommendation?.tradeType !== 'no_trade' && strategy.recommendation ? `
Trade: ${strategy.recommendation.tradeType?.toUpperCase()}
${strategy.recommendation.shortLeg ? `Short: ${strategy.recommendation.shortLeg.strike} ${strategy.recommendation.shortLeg.optionType}` : ''}
${strategy.recommendation.longLeg ? `Long: ${strategy.recommendation.longLeg.strike} ${strategy.recommendation.longLeg.optionType}` : ''}
Credit: $${strategy.recommendation.credit?.toFixed(2)}
POP: ${(strategy.recommendation.probOfProfit * 100).toFixed(1)}%
EV: $${strategy.recommendation.expectedValue?.toFixed(2)}
` : 'NO TRADE TODAY'}
`;

  // Try Claude first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const resp = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: BRIEF_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Generate morning briefing:\n${context}` }],
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const fullText = resp.data?.content?.[0]?.text || '';
      return parseBriefText(fullText, date, 'claude');
    } catch (err) {
      console.error('Claude briefing failed:', err);
    }
  }

  // Try GPT fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: BRIEF_SYSTEM_PROMPT },
            { role: 'user', content: `Generate morning briefing:\n${context}` },
          ],
          max_tokens: 600,
        },
        {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          timeout: 15000,
        }
      );

      const fullText = resp.data?.choices?.[0]?.message?.content || '';
      return parseBriefText(fullText, date, 'gpt');
    } catch (err) {
      console.error('GPT briefing failed:', err);
    }
  }

  // Fallback to template-generated brief
  return generateTemplateBrief(marketData, newsAnalysis, strategy, date);
}

function parseBriefText(
  text: string,
  date: string,
  generatedBy: 'claude' | 'gpt'
): MorningBrief {
  const lines = text.split('\n').filter(Boolean);

  return {
    date,
    executiveSummary: lines.slice(0, 2).join(' '),
    marketOverview: text.substring(0, 200),
    volatilityAnalysis: extractSection(text, ['volatil', 'VIX', 'IV']),
    geopoliticalRisk: extractSection(text, ['geopolit', 'risk', 'news']),
    strategyOutlook: extractSection(text, ['strategy', 'trade', 'spread']),
    keyLevels: extractSection(text, ['level', 'support', 'resistance', 'strike']),
    riskWarnings: extractSection(text, ['warn', 'caution', 'avoid', 'risk']),
    fullText: text,
    generatedBy,
  };
}

function extractSection(text: string, keywords: string[]): string {
  const sentences = text.split(/[.!?]/);
  const relevant = sentences.filter(s =>
    keywords.some(kw => s.toLowerCase().includes(kw.toLowerCase()))
  );
  return relevant.slice(0, 2).join('. ').trim() || '';
}

function generateTemplateBrief(
  marketData: MarketDataSnapshot,
  newsAnalysis: NewsAnalysis,
  strategy: StrategyDecision,
  date: string
): MorningBrief {
  const { spx, vix } = marketData;
  const rec = strategy.recommendation;
  const shouldTrade = strategy.strategy !== 'NO_TRADE';

  const executiveSummary = shouldTrade
    ? `SPX at ${spx.price.toFixed(0)}, VIX ${vix.price.toFixed(1)}. ${strategy.strategy.replace(/_/g, ' ')} conditions present. ${rec?.confidence?.toUpperCase()} confidence setup.`
    : `Macro event day — standing aside. No credit spread trades recommended per institutional SOP.`;

  const marketOverview = `SPX ${spx.price.toFixed(2)} (${spx.changePct >= 0 ? '+' : ''}${spx.changePct.toFixed(2)}%). VIX ${vix.price.toFixed(1)}, ${strategy.conditions.vixRegime} volatility regime. Market regime: ${strategy.conditions.marketRegime}. News sentiment: ${newsAnalysis.overallSentiment}.`;

  const volatilityAnalysis = `VIX ${vix.price.toFixed(1)} (${strategy.conditions.vixRegime}). IV Rank: ${strategy.conditions.ivRank?.toFixed(0) || 'N/A'}. Implied vol ${((strategy.conditions.impliedVol || vix.price / 100) * 100).toFixed(1)}% vs realized ${((strategy.conditions.realizedVol || 0) * 100).toFixed(1)}%. ${strategy.conditions.impliedVol > strategy.conditions.realizedVol ? 'IV premium over RV — favorable for selling.' : 'IV discount to RV — caution on selling.'}`;

  const geopoliticalRisk = `Geopolitical risk: ${newsAnalysis.geopoliticalRiskLevel}. Macro risk: ${newsAnalysis.macroRiskLevel}. Tradeability: ${newsAnalysis.tradeabilityScore}/100. ${newsAnalysis.keyRisks.slice(0, 1).join('. ')}`;

  const strategyOutlook = shouldTrade && rec
    ? `Strategy: ${strategy.strategy.replace(/_/g, ' ')}. ${rec.tradeType?.toUpperCase()}. Short ${rec.shortLeg?.strike} ${rec.shortLeg?.optionType}, buy ${rec.longLeg?.strike} ${rec.longLeg?.optionType}. Credit $${rec.credit?.toFixed(2)}, POP ${(rec.probOfProfit * 100).toFixed(1)}%, EV $${rec.expectedValue?.toFixed(2)}.`
    : 'No trade today. Await better conditions.';

  const keyLevels = `Expected move: ±${strategy.conditions.spxPrice > 0 ? ((strategy.conditions.impliedVol || 0.18) * strategy.conditions.spxPrice * Math.sqrt(7 / 365)).toFixed(0) : 'N/A'} points. ${rec?.shortLeg ? `Short strike ${rec.shortLeg.strike}` : ''}. ${rec?.longLeg ? `Long strike ${rec.longLeg.strike}` : ''}.`;

  const riskWarnings = rec?.warnings && rec.warnings.length > 0
    ? rec.warnings.join('. ')
    : 'No major warnings. Standard risk management applies.';

  const fullText = [executiveSummary, marketOverview, volatilityAnalysis, geopoliticalRisk, strategyOutlook, keyLevels, riskWarnings].join('\n\n');

  return {
    date,
    executiveSummary,
    marketOverview,
    volatilityAnalysis,
    geopoliticalRisk,
    strategyOutlook,
    keyLevels,
    riskWarnings,
    fullText,
    generatedBy: 'template',
  };
}
