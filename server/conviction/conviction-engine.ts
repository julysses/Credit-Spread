import { db } from '@/database/db';
import { stockCandidates, growthScans } from '@/database/schema';
import { desc, eq } from 'drizzle-orm';
import { fetchFundamentals } from '@/server/fundamentals';
import { fetchInstitutionalData } from '@/server/institutional';
import { fetchSecCompanyFacts, fetchSecCompanyProfile, scoreSecSignals } from '@/server/sec/sec-client';
import { fetchPoliticianSignal } from '@/server/politicians/politician-signals';
import { fetchRecommendationTrends, fetchNewsSentiment } from '@/server/finnhub';
import type { ConvictionPick } from './conviction-types';

interface CandidateInput {
  symbol: string;
  companyName?: string | null;
  sector?: string | null;
  compositeScore?: number | null;
  momentumScore?: number | null;
  growthScore?: number | null;
  valueScore?: number | null;
  institutionalScore?: number | null;
  priceChangePct?: number | string | null;
  revenueGrowthPct?: number | string | null;
  epsGrowthPct?: number | string | null;
  above200sma?: boolean | null;
}

const DEFAULT_UNIVERSE = ['NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'AVGO', 'CRWD', 'PLTR', 'AXON'];

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function classify(score: number): ConvictionPick['classification'] {
  if (score >= 90) return 'Elite Conviction';
  if (score >= 80) return 'High Conviction';
  if (score >= 70) return 'Watchlist';
  if (score >= 60) return 'Interesting';
  return 'Low Priority';
}

async function loadUniverse(limit: number): Promise<CandidateInput[]> {
  try {
    const latest = await db.select({ scanDate: growthScans.scanDate }).from(growthScans).orderBy(desc(growthScans.scanDate)).limit(1).execute();
    const scanDate = latest[0]?.scanDate;
    if (!scanDate) throw new Error('No scan date');
    const rows = await db.select().from(stockCandidates).where(eq(stockCandidates.scanDate, scanDate)).orderBy(desc(stockCandidates.compositeScore)).limit(Math.max(limit * 2, 20)).execute();
    const unique = new Map<string, CandidateInput>();
    for (const row of rows) if (!unique.has(row.symbol)) unique.set(row.symbol, row);
    return Array.from(unique.values()).slice(0, limit);
  } catch {
    return DEFAULT_UNIVERSE.slice(0, limit).map(symbol => ({ symbol }));
  }
}

export async function buildConvictionPick(symbol: string, candidate?: CandidateInput): Promise<ConvictionPick> {
  const upper = symbol.toUpperCase();
  const [fundamentals, institutional, secProfileResult, secFactsResult, politician, recTrends, newsSentiment] = await Promise.allSettled([
    fetchFundamentals(upper),
    fetchInstitutionalData(upper),
    fetchSecCompanyProfile(upper),
    fetchSecCompanyFacts(upper),
    fetchPoliticianSignal(upper),
    fetchRecommendationTrends(upper),
    fetchNewsSentiment(upper),
  ]);

  const fd = fundamentals.status === 'fulfilled' ? fundamentals.value : null;
  const inst = institutional.status === 'fulfilled' ? institutional.value : null;
  const secProfile = secProfileResult.status === 'fulfilled' ? secProfileResult.value : null;
  const secFacts = secFactsResult.status === 'fulfilled' ? secFactsResult.value : [];
  const pol = politician.status === 'fulfilled' ? politician.value : null;
  const sec = scoreSecSignals(secProfile, secFacts);

  // Analyst recommendation trend (most recent month — Finnhub)
  let analystTrendScore = 50;
  const recs = recTrends.status === 'fulfilled' ? recTrends.value : [];
  if (recs.length > 0) {
    const latest = recs[0];
    const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell || 1;
    analystTrendScore = Math.round(((latest.strongBuy + latest.buy) / total) * 100);
  }

  // Finnhub news sentiment (bullish % 0–100)
  const fhSentiment = newsSentiment.status === 'fulfilled' ? newsSentiment.value : null;
  const newsBullishScore = fhSentiment?.sentiment
    ? Math.round(fhSentiment.sentiment.bullishPercent * 100)
    : null;

  const growth = num(candidate?.growthScore, Math.min(100, 50 + num(fd?.revenueGrowthYoy) * 0.8 + num(fd?.epsGrowthYoy) * 0.4));
  const value = num(candidate?.valueScore, fd?.pegRatio && fd.pegRatio > 0 ? Math.max(20, 85 - fd.pegRatio * 12) : 50);
  const fundamentalsScore = Math.max(0, Math.min(100, Math.round(growth * 0.65 + value * 0.35)));
  const technicalScore = Math.max(0, Math.min(100, Math.round(num(candidate?.momentumScore, 50 + (candidate?.above200sma ? 12 : 0) + num(candidate?.priceChangePct) * 2))));
  const institutionalScore = Math.max(0, Math.min(100, Math.round(num(candidate?.institutionalScore, inst ? inst.institutionalScore * 4 : 50))));
  const politicianScore = pol?.score ?? 50;
  const secNewsScore = 50 + (sec.catalysts.length * 6) - (sec.risks.length * 7);
  // Blend SEC-derived news signal with Finnhub sentiment when available
  const newsScore = newsBullishScore !== null
    ? Math.round(secNewsScore * 0.5 + newsBullishScore * 0.5)
    : secNewsScore;

  let convictionScore =
    fundamentalsScore * 0.25 +
    sec.score * 0.20 +
    politicianScore * 0.15 +
    newsScore * 0.10 +
    analystTrendScore * 0.05 +
    technicalScore * 0.15 +
    institutionalScore * 0.10;

  if (sec.catalysts.some(c => c.includes('8-K'))) convictionScore += 3;
  if (pol && pol.recentBuys >= 2 && pol.netFlow === 'positive') convictionScore += 3;
  if (sec.risks.some(r => r.includes('dilution'))) convictionScore -= 5;
  convictionScore = Math.max(0, Math.min(100, Math.round(convictionScore)));

  const latestSec = secProfile?.recentFilings?.[0];
  const latestPol = pol?.trades?.[0];
  const bullCase = [
    fundamentalsScore >= 65 ? 'Fundamental profile supports the setup.' : 'Fundamentals are acceptable but not the primary driver.',
    sec.score >= 60 ? 'SEC filings add recent hard-source signal confirmation.' : 'SEC signal is neutral.',
    technicalScore >= 65 ? 'Technical/momentum backdrop is constructive.' : 'Technical timing still needs confirmation.',
  ];
  if (pol && pol.recentBuys > pol.recentSells) bullCase.push(pol.explanation);

  const bearCase = [
    fundamentalsScore < 55 ? 'Fundamental score is below conviction threshold.' : 'Valuation/growth still needs monitoring.',
    politicianScore < 45 ? 'Recent congressional flow skews negative.' : 'Political-trade data is lagged and should be treated as confirmatory only.',
  ];

  return {
    ticker: upper,
    companyName: candidate?.companyName ?? fd?.companyName ?? secProfile?.companyName ?? upper,
    sector: candidate?.sector ?? fd?.sector,
    rank: 0,
    convictionScore,
    classification: classify(convictionScore),
    timeHorizon: convictionScore >= 80 ? '1-6 months' : 'Watchlist / setup dependent',
    signalBreakdown: {
      fundamentals: fundamentalsScore,
      sec: sec.score,
      politician: politicianScore,
      news: Math.max(0, Math.min(100, Math.round(newsScore))),
      technical: technicalScore,
      institutional: institutionalScore,
      analystTrend: analystTrendScore,
    },
    bullCase,
    bearCase,
    catalysts: [...sec.catalysts, ...(pol && pol.recentBuys > 0 ? [`${pol.recentBuys} recent congressional buy disclosure(s)`] : [])],
    risks: sec.risks,
    sourceSummary: {
      latestSecFiling: latestSec ? `${latestSec.form} filed ${latestSec.filingDate}` : undefined,
      latestPoliticianTrade: latestPol ? `${latestPol.chamber} ${latestPol.type} disclosed ${latestPol.disclosureDate || latestPol.transactionDate}` : undefined,
      dataFreshness: new Date().toISOString(),
    },
    raw: { secFilings: secProfile?.recentFilings?.slice(0, 8), politicianTrades: pol?.trades?.slice(0, 5), secFacts },
  };
}

export async function buildConvictionPicks(limit = 10): Promise<ConvictionPick[]> {
  const universe = await loadUniverse(limit);
  const picks = await Promise.all(universe.map(c => buildConvictionPick(c.symbol, c)));
  return picks.sort((a, b) => b.convictionScore - a.convictionScore).map((p, i) => ({ ...p, rank: i + 1 })).slice(0, limit);
}
