/**
 * News & Geopolitical Risk Analyzer
 * Fetches and analyzes financial news for market risk assessment
 */

import axios from 'axios';
import { fetchMarketNews, fetchCompanyNews, fetchNewsSentiment } from './finnhub';

export interface NewsItem {
  id: string;
  publishedAt: string;
  source: string;
  headline: string;
  summary: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  geopoliticalRisk: boolean;
  macroRelevance: boolean;
  riskImpact: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface NewsAnalysis {
  items: NewsItem[];
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  overallScore: number;
  geopoliticalRiskLevel: 'low' | 'medium' | 'high';
  macroRiskLevel: 'low' | 'medium' | 'high';
  keyRisks: string[];
  tradeabilityScore: number; // 0-100, higher = safer to trade
}

const MACRO_KEYWORDS = [
  'FOMC', 'Federal Reserve', 'Fed', 'interest rate', 'inflation', 'CPI',
  'jobs report', 'NFP', 'GDP', 'Treasury', 'yield', 'recession', 'debt ceiling',
];

const GEO_KEYWORDS = [
  'war', 'conflict', 'sanctions', 'tariff', 'trade war', 'geopolitical',
  'China', 'Russia', 'Ukraine', 'Middle East', 'nuclear', 'military',
];

const BEARISH_KEYWORDS = [
  'crash', 'selloff', 'collapse', 'plunge', 'decline', 'drop', 'loss',
  'fear', 'panic', 'uncertainty', 'recession', 'crisis',
];

const BULLISH_KEYWORDS = [
  'rally', 'surge', 'gain', 'rise', 'record', 'bullish', 'growth',
  'recovery', 'strong', 'beat expectations',
];

function analyzeSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral'; score: number } {
  const lower = text.toLowerCase();
  let score = 0;

  for (const word of BULLISH_KEYWORDS) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of BEARISH_KEYWORDS) {
    if (lower.includes(word)) score -= 1;
  }

  const normalized = Math.max(-1, Math.min(1, score / 3));
  const sentiment = normalized > 0.2 ? 'positive' : normalized < -0.2 ? 'negative' : 'neutral';
  return { sentiment, score: normalized };
}

function isGeopolitical(text: string): boolean {
  const lower = text.toLowerCase();
  return GEO_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isMacroRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return MACRO_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// Phrases that indicate a macro event is UPCOMING (trade block warranted)
const UPCOMING_PHRASES = [
  'ahead of', 'before the', 'upcoming', 'preview', 'expected to',
  'will decide', 'will announce', 'scheduled', 'tomorrow', 'next week',
  'this week', 'later today', 'later this', 'anticipat', 'awaiting',
  'prepares to', 'braces for', 'on the eve', 'eyes the', 'looks to',
];

// Phrases that indicate a macro event is PAST (no longer a trade block)
const PAST_PHRASES = [
  'decided to', 'raised rates', 'cut rates', 'held rates', 'kept rates',
  'held steady', 'after the fed', 'following the fomc', 'following the fed',
  'in the wake of', 'the fed decided', 'the fed raised', 'the fed cut',
  'the fed held', 'as expected', 'voted to', 'announced that',
  'concluded', 'ended with', 'wrapped up', 'delivered', 'signed into',
  'rate decision was', 'after the decision', 'post-fomc', 'post fomc',
];

/**
 * Returns false if the article is clearly about a PAST macro event,
 * true if the event is upcoming or ambiguous.
 */
function isUpcomingMacroEvent(headline: string, summary: string): boolean {
  const lower = `${headline} ${summary}`.toLowerCase();
  const hasPast = PAST_PHRASES.some(p => lower.includes(p));
  const hasUpcoming = UPCOMING_PHRASES.some(p => lower.includes(p));
  if (hasPast && !hasUpcoming) return false; // clearly post-event coverage
  return true; // upcoming or ambiguous — err on the side of caution
}

function assessRiskImpact(item: NewsItem): 'low' | 'medium' | 'high' {
  if (item.geopoliticalRisk && item.sentiment === 'negative') return 'high';
  if (item.macroRelevance && item.sentimentScore < -0.5) {
    // Only block trading for UPCOMING macro events, not post-event coverage
    if (isUpcomingMacroEvent(item.headline, item.summary)) return 'high';
    return 'medium';
  }
  if (item.geopoliticalRisk || item.macroRelevance) return 'medium';
  return 'low';
}

/**
 * Fetch news from GNews
 */
async function fetchFromGNews(): Promise<Partial<NewsItem>[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];

  try {
    const resp = await axios.get('https://gnews.io/api/v4/search', {
      params: {
        q: 'SPX OR "S&P 500" OR "Federal Reserve" OR VIX OR "stock market"',
        lang: 'en',
        max: 10,
        sortby: 'publishedAt',
        token: key,
      },
      timeout: 5000,
    });

    return (resp.data?.articles || []).map((a: {
      publishedAt: string;
      source?: { name: string };
      title: string;
      description: string;
      url: string;
    }) => ({
      publishedAt: a.publishedAt,
      source: a.source?.name || 'Unknown',
      headline: a.title,
      summary: a.description || '',
      url: a.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch news from Alpha Vantage News Sentiment API
 */
async function fetchFromAlphaVantage(): Promise<Partial<NewsItem>[]> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];

  try {
    const resp = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'NEWS_SENTIMENT',
        tickers: 'SPY',
        limit: 20,
        sort: 'LATEST',
        apikey: key,
      },
      timeout: 5000,
    });

    return (resp.data?.feed || []).map((a: {
      time_published: string;
      source: string;
      title: string;
      summary: string;
      url: string;
    }) => ({
      publishedAt: a.time_published,
      source: a.source,
      headline: a.title,
      summary: a.summary,
      url: a.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch general market news from Finnhub
 */
async function fetchFromFinnhub(): Promise<Partial<NewsItem>[]> {
  try {
    const articles = await fetchMarketNews('general');
    return articles.map(a => ({
      publishedAt: new Date(a.datetime * 1000).toISOString(),
      source: a.source || 'Finnhub',
      headline: a.headline,
      summary: a.summary,
      url: a.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch news from NewsAPI
 */
async function fetchFromNewsAPI(): Promise<Partial<NewsItem>[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];

  try {
    const resp = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: 'SPX OR "S&P 500" OR Federal Reserve OR VIX OR "stock market"',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: key,
      },
      timeout: 5000,
    });

    return (resp.data?.articles || []).map((a: {
      publishedAt: string;
      source?: { name: string };
      title: string;
      description: string;
      url: string;
    }) => ({
      publishedAt: a.publishedAt,
      source: a.source?.name || 'Unknown',
      headline: a.title,
      summary: a.description || '',
      url: a.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Analyze a batch of raw news items
 */
export function processNewsItems(rawItems: Partial<NewsItem>[]): NewsItem[] {
  return rawItems.map((raw, idx) => {
    const text = `${raw.headline || ''} ${raw.summary || ''}`;
    const { sentiment, score } = analyzeSentiment(text);

    const item: NewsItem = {
      id: `news_${Date.now()}_${idx}`,
      publishedAt: raw.publishedAt || new Date().toISOString(),
      source: raw.source || 'Unknown',
      headline: raw.headline || '',
      summary: raw.summary || '',
      url: raw.url || '',
      sentiment,
      sentimentScore: score,
      geopoliticalRisk: isGeopolitical(text),
      macroRelevance: isMacroRelevant(text),
      riskImpact: 'low',
      tags: [],
    };

    item.riskImpact = assessRiskImpact(item);
    return item;
  });
}

/**
 * Full news analysis
 */
export async function analyzeNews(): Promise<NewsAnalysis> {
  // Fetch from all sources in parallel, merge, and deduplicate by headline
  const [gnewsItems, newsApiItems, alphaVantageItems, finnhubItems] = await Promise.all([
    fetchFromGNews(),
    fetchFromNewsAPI(),
    fetchFromAlphaVantage(),
    fetchFromFinnhub(),
  ]);

  const seen = new Set<string>();
  const rawItems: Partial<NewsItem>[] = [];
  for (const item of [...gnewsItems, ...newsApiItems, ...alphaVantageItems, ...finnhubItems]) {
    const key = (item.headline || '').toLowerCase().slice(0, 60);
    if (key && !seen.has(key)) {
      seen.add(key);
      rawItems.push(item);
    }
  }

  // If no API keys configured, use demo data
  if (rawItems.length === 0) {
    return getMockNewsAnalysis();
  }

  const items = processNewsItems(rawItems);

  const avgScore = items.reduce((a, b) => a + b.sentimentScore, 0) / items.length;
  const overallSentiment = avgScore > 0.1 ? 'bullish' : avgScore < -0.1 ? 'bearish' : 'neutral';

  // For isMacroEventDay purposes, only count articles published within the last 20 hours
  // so yesterday's FOMC coverage doesn't keep blocking trading the next day
  const now = Date.now();
  const recentItems = items.filter(i => {
    const age = now - new Date(i.publishedAt).getTime();
    return age <= 20 * 60 * 60 * 1000; // 20 hours
  });
  const recentOrAll = recentItems.length >= 3 ? recentItems : items;

  const geoRiskCount = recentOrAll.filter(i => i.geopoliticalRisk && i.riskImpact === 'high').length;
  const macroRiskCount = recentOrAll.filter(i => i.macroRelevance && i.riskImpact === 'high').length;

  const geopoliticalRiskLevel = geoRiskCount >= 3 ? 'high' : geoRiskCount >= 1 ? 'medium' : 'low';
  const macroRiskLevel = macroRiskCount >= 2 ? 'high' : macroRiskCount >= 1 ? 'medium' : 'low';

  const keyRisks: string[] = [];
  items
    .filter(i => i.riskImpact === 'high')
    .slice(0, 3)
    .forEach(i => keyRisks.push(i.headline));

  // Tradeability: 100 = perfect, 0 = do not trade
  let tradeabilityScore = 70;
  if (geopoliticalRiskLevel === 'high') tradeabilityScore -= 25;
  else if (geopoliticalRiskLevel === 'medium') tradeabilityScore -= 10;
  if (macroRiskLevel === 'high') tradeabilityScore -= 20;
  else if (macroRiskLevel === 'medium') tradeabilityScore -= 8;
  if (overallSentiment === 'bearish') tradeabilityScore -= 10;

  return {
    items: items.slice(0, 10),
    overallSentiment,
    overallScore: parseFloat(avgScore.toFixed(3)),
    geopoliticalRiskLevel,
    macroRiskLevel,
    keyRisks,
    tradeabilityScore: Math.max(0, Math.min(100, tradeabilityScore)),
  };
}

/**
 * Symbol-specific news analysis using Finnhub company news (primary) + GNews (fallback).
 * Returns headlines with sentiment labels and an overall sentiment for the stock.
 */
export async function analyzeNewsForSymbol(
  symbol: string,
  companyName: string
): Promise<{ headlines: { headline: string; sentiment: 'positive' | 'negative' | 'neutral'; source: string; publishedAt: string }[]; overallSentiment: 'bullish' | 'bearish' | 'neutral'; bullishPercent: number }> {
  const rawItems: Partial<NewsItem>[] = [];

  // Primary: Finnhub company news (last 7 days)
  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const articles = await fetchCompanyNews(symbol, from, to);
    for (const a of articles.slice(0, 8)) {
      rawItems.push({
        publishedAt: new Date(a.datetime * 1000).toISOString(),
        source: a.source || 'Finnhub',
        headline: a.headline,
        summary: a.summary,
        url: a.url,
      });
    }
  } catch { /* ignore */ }

  // Fallback: GNews symbol-specific query
  if (rawItems.length < 3 && process.env.GNEWS_API_KEY) {
    try {
      const resp = await axios.get('https://gnews.io/api/v4/search', {
        params: {
          q: `"${symbol}" OR "${companyName}"`,
          lang: 'en',
          country: 'us',
          max: 5,
          apikey: process.env.GNEWS_API_KEY,
        },
        timeout: 8000,
      });
      for (const a of (resp.data?.articles ?? [])) {
        rawItems.push({
          publishedAt: a.publishedAt ?? new Date().toISOString(),
          source: a.source?.name ?? 'GNews',
          headline: a.title ?? '',
          summary: a.description ?? '',
          url: a.url ?? '',
        });
      }
    } catch { /* ignore */ }
  }

  const items = processNewsItems(rawItems);

  // Blend with Finnhub pre-computed sentiment score if available
  let bullishPercent = 0.5;
  try {
    const fhSentiment = await fetchNewsSentiment(symbol);
    if (fhSentiment?.sentiment) {
      bullishPercent = fhSentiment.sentiment.bullishPercent;
    } else if (items.length > 0) {
      const pos = items.filter(i => i.sentiment === 'positive').length;
      bullishPercent = pos / items.length;
    }
  } catch {
    if (items.length > 0) {
      bullishPercent = items.filter(i => i.sentiment === 'positive').length / items.length;
    }
  }

  const overallSentiment: 'bullish' | 'bearish' | 'neutral' =
    bullishPercent >= 0.6 ? 'bullish' :
    bullishPercent <= 0.35 ? 'bearish' : 'neutral';

  return {
    headlines: items.slice(0, 6).map(i => ({
      headline: i.headline,
      sentiment: i.sentiment,
      source: i.source,
      publishedAt: i.publishedAt,
    })),
    overallSentiment,
    bullishPercent: parseFloat(bullishPercent.toFixed(2)),
  };
}

export function getMockNewsAnalysis(): NewsAnalysis {
  return {
    items: [
      {
        id: 'news_1',
        publishedAt: new Date().toISOString(),
        source: 'Reuters',
        headline: 'Fed holds rates steady, signals patience on cuts',
        summary: 'Federal Reserve maintains federal funds rate target, indicating data-dependent approach.',
        url: '#',
        sentiment: 'neutral',
        sentimentScore: 0.0,
        geopoliticalRisk: false,
        macroRelevance: true,
        riskImpact: 'medium',
        tags: ['fed', 'rates'],
      },
      {
        id: 'news_2',
        publishedAt: new Date().toISOString(),
        source: 'Bloomberg',
        headline: 'SPX holds above key 5800 support after mixed jobs data',
        summary: 'Markets show resilience as employment numbers come in close to expectations.',
        url: '#',
        sentiment: 'neutral',
        sentimentScore: 0.1,
        geopoliticalRisk: false,
        macroRelevance: true,
        riskImpact: 'low',
        tags: ['spx', 'jobs'],
      },
    ],
    overallSentiment: 'neutral',
    overallScore: 0.05,
    geopoliticalRiskLevel: 'low',
    macroRiskLevel: 'medium',
    keyRisks: [],
    tradeabilityScore: 72,
  };
}
