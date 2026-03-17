/**
 * News & Geopolitical Risk Analyzer
 * Fetches and analyzes financial news for market risk assessment
 */

import axios from 'axios';

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

function assessRiskImpact(item: NewsItem): 'low' | 'medium' | 'high' {
  if (item.geopoliticalRisk && item.sentiment === 'negative') return 'high';
  if (item.macroRelevance && item.sentimentScore < -0.5) return 'high';
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
  // Fetch from both sources in parallel, merge, and deduplicate by headline
  const [gnewsItems, newsApiItems] = await Promise.all([
    fetchFromGNews(),
    fetchFromNewsAPI(),
  ]);

  const seen = new Set<string>();
  const rawItems: Partial<NewsItem>[] = [];
  for (const item of [...gnewsItems, ...newsApiItems]) {
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

  const geoRiskCount = items.filter(i => i.geopoliticalRisk && i.riskImpact === 'high').length;
  const macroRiskCount = items.filter(i => i.macroRelevance && i.riskImpact === 'high').length;

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
