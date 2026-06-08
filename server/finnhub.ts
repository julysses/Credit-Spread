/**
 * Finnhub API Client
 * Provides: earnings calendar, company news + sentiment, analyst recommendations,
 * analyst estimates, insider transactions, economic calendar.
 * All functions return empty/null gracefully when FINNHUB_API_KEY is absent.
 */

import axios from 'axios';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

export function finnhubConfigured(): boolean {
  return !!process.env.FINNHUB_API_KEY;
}

function fhGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  return axios.get<T>(`${FINNHUB_BASE}/${path}`, {
    params: { ...params, token: process.env.FINNHUB_API_KEY },
    timeout: 8000,
  }).then((r: { data: T }) => r.data);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinnhubEarningsEntry {
  symbol: string;
  date: string;            // YYYY-MM-DD
  hour: string;            // 'bmo' | 'amc' | 'dmh'
  year: number;
  quarter: number;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface FinnhubNewsItem {
  id: number;
  category: string;
  datetime: number;        // unix timestamp
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  related: string;
}

export interface FinnhubNewsSentiment {
  symbol: string;
  buzz: {
    articlesInLastWeek: number;
    buzz: number;
    weeklyAverage: number;
  };
  companyNewsScore: number;
  sectorAverageBullishPercent: number;
  sectorAverageNewsScore: number;
  sentiment: {
    bearishPercent: number;
    bullishPercent: number;
  };
}

export interface FinnhubRecommendation {
  period: string;          // YYYY-MM-DD (first day of month)
  symbol: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface FinnhubAnalystEstimate {
  period: string;          // YYYY-MM-DD (quarter end)
  epsAvg: number;
  epsHigh: number;
  epsLow: number;
  epsnumberOfAnalysts: number;
  revenueAvg: number;
  revenueHigh: number;
  revenueLow: number;
  revenueNumberOfAnalysts: number;
}

export interface FinnhubInsiderTransaction {
  symbol: string;
  name: string;
  share: number;
  change: number;          // positive = purchase, negative = sale
  transactionDate: string; // YYYY-MM-DD
  transactionPrice: number;
  transactionCode: string; // 'P' = purchase, 'S' = sale
  isDerivative: boolean;
}

export interface FinnhubEconomicEvent {
  event: string;
  country: string;
  impact: string;          // 'high' | 'medium' | 'low'
  time: string;            // 'YYYY-MM-DD HH:MM:SS'
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
}

// ─── Earnings Calendar (6h cache shared across all callers) ──────────────────

let earningsCache: { data: FinnhubEarningsEntry[]; expiresAt: number } | null = null;

async function getEarningsCache(): Promise<FinnhubEarningsEntry[]> {
  if (earningsCache && Date.now() < earningsCache.expiresAt) return earningsCache.data;
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const resp = await fhGet<{ earningsCalendar?: FinnhubEarningsEntry[] }>('calendar/earnings', {
    from: today,
    to: future,
  });
  const data = resp?.earningsCalendar ?? [];
  earningsCache = { data, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return data;
}

// ─── Economic Calendar (1h cache) ─────────────────────────────────────────────

let econCache: { data: FinnhubEconomicEvent[]; expiresAt: number } | null = null;

async function getEconCache(): Promise<FinnhubEconomicEvent[]> {
  if (econCache && Date.now() < econCache.expiresAt) return econCache.data;
  const from = new Date().toISOString().split('T')[0];
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const resp = await fhGet<{ economicCalendar?: FinnhubEconomicEvent[] }>('calendar/economic', {
    from,
    to,
  });
  const data = resp?.economicCalendar ?? [];
  econCache = { data, expiresAt: Date.now() + 60 * 60 * 1000 };
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Next 90 days of earnings dates for all symbols. Cached 6h. */
export async function fetchEarningsCalendar(): Promise<FinnhubEarningsEntry[]> {
  if (!finnhubConfigured()) return [];
  try {
    return await getEarningsCache();
  } catch (err) {
    console.error('[finnhub] fetchEarningsCalendar failed:', (err as Error).message);
    return [];
  }
}

/** Recent news headlines for a specific stock. */
export async function fetchCompanyNews(symbol: string, from: string, to: string): Promise<FinnhubNewsItem[]> {
  if (!finnhubConfigured()) return [];
  try {
    const data = await fhGet<FinnhubNewsItem[]>('company-news', { symbol, from, to });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Bullish/bearish news sentiment score for a stock. */
export async function fetchNewsSentiment(symbol: string): Promise<FinnhubNewsSentiment | null> {
  if (!finnhubConfigured()) return null;
  try {
    const data = await fhGet<FinnhubNewsSentiment>('news-sentiment', { symbol });
    return data?.sentiment ? data : null;
  } catch {
    return null;
  }
}

/** Analyst recommendation trends (most recent first). */
export async function fetchRecommendationTrends(symbol: string): Promise<FinnhubRecommendation[]> {
  if (!finnhubConfigured()) return [];
  try {
    const data = await fhGet<FinnhubRecommendation[]>('stock/recommendation', { symbol });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Next quarter analyst EPS & revenue estimates. */
export async function fetchAnalystEstimates(symbol: string): Promise<FinnhubAnalystEstimate | null> {
  if (!finnhubConfigured()) return null;
  try {
    const resp = await fhGet<{ data?: FinnhubAnalystEstimate[] }>('analyst-estimates', {
      symbol,
      freq: 'quarterly',
    });
    const quarters = resp?.data;
    if (!Array.isArray(quarters) || quarters.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    return quarters.find(q => q.period >= today) ?? quarters[0] ?? null;
  } catch {
    return null;
  }
}

/** Recent insider buy/sell transactions. */
export async function fetchInsiderTransactions(symbol: string): Promise<FinnhubInsiderTransaction[]> {
  if (!finnhubConfigured()) return [];
  try {
    const resp = await fhGet<{ data?: FinnhubInsiderTransaction[] }>('stock/insider-transactions', {
      symbol,
    });
    return Array.isArray(resp?.data) ? resp.data! : [];
  } catch {
    return [];
  }
}

/** High-impact US economic events for the next 7 days. Cached 1h. */
export async function fetchEconomicCalendar(): Promise<FinnhubEconomicEvent[]> {
  if (!finnhubConfigured()) return [];
  try {
    return await getEconCache();
  } catch (err) {
    console.error('[finnhub] fetchEconomicCalendar failed:', (err as Error).message);
    return [];
  }
}

/** General market/financial news from Finnhub. */
export async function fetchMarketNews(category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'): Promise<FinnhubNewsItem[]> {
  if (!finnhubConfigured()) return [];
  try {
    const data = await fhGet<FinnhubNewsItem[]>('news', { category });
    return Array.isArray(data) ? data.slice(0, 15) : [];
  } catch {
    return [];
  }
}
