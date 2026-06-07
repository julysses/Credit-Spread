/**
 * Fundamentals Data Module
 * Primary: Financial Modeling Prep (FMP) API
 * Fallback: Alpha Vantage OVERVIEW endpoint
 * Mock: realistic demo data when FMP_API_KEY is not configured
 */

import axios from 'axios';

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const AV_BASE  = 'https://www.alphavantage.co/query';

export function fmpConfigured(): boolean {
  return !!process.env.FMP_API_KEY;
}

function avConfigured(): boolean {
  return !!process.env.ALPHA_VANTAGE_API_KEY;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FundamentalsData {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  // Growth
  revenueGrowthYoy: number;   // % e.g. 23.5 means +23.5%
  revenueGrowthQoq: number;
  epsGrowthYoy: number;
  epsGrowthQoq: number;
  // Margins
  grossMargin: number;        // 0–100
  operatingMargin: number;
  netMargin: number;
  fcfMargin: number;
  // Balance sheet
  roe: number;
  roa: number;
  debtToEbitda: number;
  currentRatio: number;
  netCash: number;            // in millions
  // Valuation
  peRatio: number;
  forwardPe: number;
  psRatio: number;
  pbRatio: number;
  evEbitda: number;
  pegRatio: number;
  // Earnings quality
  earningsSurprisePct: number;     // last quarter beat % (positive = beat)
  earningsSurpriteRate4q: number;  // avg surprise over 4 quarters
  analystTargetPrice: number;
  impliedUpside: number;           // %
  // Analyst estimates
  epsRevisionUp30d: number;        // count of upward revisions past 30 days
  epsRevisionDown30d: number;
  // Earnings date
  nextEarningsDate: string | null;
  daysToEarnings: number | null;   // null if >90 days or unknown
}

export interface InsiderData {
  symbol: string;
  netBuyDollars90d: number;        // positive = net buying
  mostRecentBuyDate: string | null;
  mostRecentBuyShares: number;
  insiderBuyCount90d: number;
  insiderSellCount90d: number;
}

export interface AnalystEstimatesData {
  symbol: string;
  consensusRating: 'buy' | 'hold' | 'sell' | 'strong_buy';
  targetPriceMean: number;
  targetPriceHigh: number;
  targetPriceLow: number;
  numberOfAnalysts: number;
  revenueEstimateNextQ: number;
  epsEstimateNextQ: number;
}

// ─── FMP Helpers ──────────────────────────────────────────────────────────────

function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  return axios.get<T>(`${FMP_BASE}/${path}`, {
    params: { ...params, apikey: process.env.FMP_API_KEY },
    timeout: 10000,
  }).then(r => r.data);
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// ─── Main Fundamentals Fetcher ────────────────────────────────────────────────

export async function fetchFundamentals(symbol: string): Promise<FundamentalsData> {
  if (!fmpConfigured()) return getMockFundamentals(symbol);

  try {
    const [profile, incomeArr, metricsArr, estimatesArr, earningsArr] = await Promise.all([
      fmpGet<unknown[]>(`profile/${symbol}`),
      fmpGet<unknown[]>(`income-statement/${symbol}`, { limit: '5', period: 'annual' }),
      fmpGet<unknown[]>(`key-metrics/${symbol}`, { limit: '2', period: 'annual' }),
      fmpGet<unknown[]>(`analyst-estimates/${symbol}`, { limit: '4' }),
      fmpGet<unknown[]>(`earnings-surprises/${symbol}`),
    ]);

    const p = (Array.isArray(profile) ? profile[0] : {}) as Record<string, unknown>;
    const inc0 = (Array.isArray(incomeArr) && incomeArr[0]) as Record<string, unknown> ?? {};
    const inc1 = (Array.isArray(incomeArr) && incomeArr[1]) as Record<string, unknown> ?? {};
    const km   = (Array.isArray(metricsArr) && metricsArr[0]) as Record<string, unknown> ?? {};
    const est  = (Array.isArray(estimatesArr) && estimatesArr[0]) as Record<string, unknown> ?? {};

    const rev0 = safeNum(inc0.revenue);
    const rev1 = safeNum(inc1.revenue);
    const eps0 = safeNum(inc0.eps);
    const eps1 = safeNum(inc1.eps);
    const revenueGrowthYoy = rev1 > 0 ? parseFloat(((rev0 - rev1) / rev1 * 100).toFixed(1)) : 0;
    const epsGrowthYoy     = eps1 !== 0 ? parseFloat(((eps0 - eps1) / Math.abs(eps1) * 100).toFixed(1)) : 0;

    // Earnings surprise average
    const surprises = (Array.isArray(earningsArr) ? earningsArr.slice(0, 4) : []) as Record<string, unknown>[];
    const surpPcts = surprises.map(s => safeNum(s.surprisePercentage));
    const earningsSurprisePct   = surpPcts[0] ?? 0;
    const earningsSurpriteRate4q = surpPcts.length > 0
      ? parseFloat((surpPcts.reduce((a, b) => a + b, 0) / surpPcts.length).toFixed(1))
      : 0;

    // Analyst target
    const targetPriceMean = safeNum(p.price && est.estimatedEpsAvg ? safeNum(est.estimatedEpsAvg) * safeNum(km.peRatio) : p.dcfDiff);
    const currentPrice    = safeNum(p.price, 100);
    const analystTarget   = safeNum(p.dcf ?? targetPriceMean, currentPrice * 1.1);
    const impliedUpside   = currentPrice > 0 ? parseFloat(((analystTarget - currentPrice) / currentPrice * 100).toFixed(1)) : 0;

    // Next earnings
    let nextEarningsDate: string | null = null;
    let daysToEarnings: number | null = null;
    if (surpPcts.length > 0 && (surprises[0] as Record<string, unknown>).date) {
      // Approximate: add ~90 days to last earnings date
      const lastEarnings = new Date((surprises[0] as Record<string, unknown>).date as string);
      const nextEarnings = new Date(lastEarnings.getTime() + 90 * 24 * 60 * 60 * 1000);
      nextEarningsDate = nextEarnings.toISOString().split('T')[0];
      const diff = Math.floor((nextEarnings.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      daysToEarnings = diff > 0 && diff <= 90 ? diff : null;
    }

    return {
      symbol,
      companyName:         String(p.companyName ?? symbol),
      sector:              String(p.sector ?? 'Unknown'),
      industry:            String(p.industry ?? 'Unknown'),
      marketCap:           safeNum(p.mktCap) / 1e9, // in billions
      revenueGrowthYoy,
      revenueGrowthQoq:    0, // would need quarterly data
      epsGrowthYoy,
      epsGrowthQoq:        0,
      grossMargin:         safeNum(km.grossProfitMargin) * 100,
      operatingMargin:     safeNum(inc0.operatingIncomeRatio) * 100,
      netMargin:           safeNum(km.netProfitMargin) * 100,
      fcfMargin:           safeNum(km.freeCashFlowPerShare) > 0 ? safeNum(km.fcfPerShare) / safeNum(km.revenuePerShare) * 100 : 0,
      roe:                 safeNum(km.roe) * 100,
      roa:                 safeNum(km.returnOnTangibleAssets) * 100,
      debtToEbitda:        safeNum(km.netDebtToEBITDA),
      currentRatio:        safeNum(km.currentRatio),
      netCash:             (safeNum(km.netCashPerShare) * safeNum(p.sharesOutstanding)) / 1e6,
      peRatio:             safeNum(km.peRatio),
      forwardPe:           safeNum(p.price) / Math.max(safeNum(est.estimatedEpsAvg, 1), 0.01),
      psRatio:             safeNum(km.priceToSalesRatio),
      pbRatio:             safeNum(km.pbRatio),
      evEbitda:            safeNum(km.enterpriseValueOverEBITDA),
      pegRatio:            safeNum(km.priceEarningsToGrowthRatio),
      earningsSurprisePct,
      earningsSurpriteRate4q,
      analystTargetPrice:  analystTarget,
      impliedUpside,
      epsRevisionUp30d:    0, // FMP free tier doesn't include revision history
      epsRevisionDown30d:  0,
      nextEarningsDate,
      daysToEarnings,
    };
  } catch (err) {
    console.error(`[fundamentals] FMP fetch failed for ${symbol}:`, (err as Error).message);
    // Fall through to Alpha Vantage fallback
  }

  return fetchFundamentalsAV(symbol);
}

// ─── Alpha Vantage Fallback ───────────────────────────────────────────────────

async function fetchFundamentalsAV(symbol: string): Promise<FundamentalsData> {
  if (!avConfigured()) return getMockFundamentals(symbol);
  try {
    const resp = await axios.get(AV_BASE, {
      params: {
        function: 'OVERVIEW',
        symbol,
        apikey: process.env.ALPHA_VANTAGE_API_KEY,
      },
      timeout: 8000,
    });
    const d = resp.data as Record<string, string>;
    const currentPrice = parseFloat(d['52WeekHigh'] ?? '0') * 0.9; // rough proxy

    return {
      symbol,
      companyName:          d.Name ?? symbol,
      sector:               d.Sector ?? 'Unknown',
      industry:             d.Industry ?? 'Unknown',
      marketCap:            parseFloat(d.MarketCapitalization ?? '0') / 1e9,
      revenueGrowthYoy:     parseFloat(d.QuarterlyRevenueGrowthYOY ?? '0') * 100,
      revenueGrowthQoq:     0,
      epsGrowthYoy:         parseFloat(d.QuarterlyEarningsGrowthYOY ?? '0') * 100,
      epsGrowthQoq:         0,
      grossMargin:          parseFloat(d.GrossProfitTTM ?? '0') / Math.max(parseFloat(d.RevenueTTM ?? '1'), 1) * 100,
      operatingMargin:      parseFloat(d.OperatingMarginTTM ?? '0') * 100,
      netMargin:            parseFloat(d.ProfitMargin ?? '0') * 100,
      fcfMargin:            0,
      roe:                  parseFloat(d.ReturnOnEquityTTM ?? '0') * 100,
      roa:                  parseFloat(d.ReturnOnAssetsTTM ?? '0') * 100,
      debtToEbitda:         0,
      currentRatio:         0,
      netCash:              0,
      peRatio:              parseFloat(d.PERatio ?? '0'),
      forwardPe:            parseFloat(d.ForwardPE ?? '0'),
      psRatio:              parseFloat(d.PriceToSalesRatioTTM ?? '0'),
      pbRatio:              parseFloat(d.PriceToBookRatio ?? '0'),
      evEbitda:             parseFloat(d.EVToEBITDA ?? '0'),
      pegRatio:             parseFloat(d.PEGRatio ?? '0'),
      earningsSurprisePct:  0,
      earningsSurpriteRate4q: 0,
      analystTargetPrice:   parseFloat(d.AnalystTargetPrice ?? '0') || currentPrice * 1.1,
      impliedUpside:        0,
      epsRevisionUp30d:     0,
      epsRevisionDown30d:   0,
      nextEarningsDate:     null,
      daysToEarnings:       null,
    };
  } catch {
    return getMockFundamentals(symbol);
  }
}

// ─── Insider Activity ─────────────────────────────────────────────────────────

export async function fetchInsiderActivity(symbol: string): Promise<InsiderData> {
  if (!fmpConfigured()) return getMockInsiderData(symbol);

  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data = await fmpGet<Record<string, unknown>[]>('insider-trading', {
      symbol,
      transactionType: 'P-Purchase,S-Sale',
    });

    const recent = (data ?? []).filter(t => String(t.transactionDate ?? '') >= cutoff);
    let netBuy = 0;
    let buys = 0, sells = 0;
    let mostRecentBuyDate: string | null = null;
    let mostRecentBuyShares = 0;

    for (const t of recent) {
      const shares = safeNum(t.securitiesTransacted);
      const price  = safeNum(t.price);
      const value  = shares * price;
      const type   = String(t.transactionType ?? '');
      if (type.includes('P') || type.includes('Purchase')) {
        netBuy += value;
        buys++;
        if (!mostRecentBuyDate || String(t.transactionDate) > mostRecentBuyDate) {
          mostRecentBuyDate  = String(t.transactionDate);
          mostRecentBuyShares = shares;
        }
      } else {
        netBuy -= value;
        sells++;
      }
    }

    return { symbol, netBuyDollars90d: netBuy, mostRecentBuyDate, mostRecentBuyShares, insiderBuyCount90d: buys, insiderSellCount90d: sells };
  } catch {
    return getMockInsiderData(symbol);
  }
}

// ─── Analyst Estimates ────────────────────────────────────────────────────────

export async function fetchAnalystEstimates(symbol: string): Promise<AnalystEstimatesData> {
  if (!fmpConfigured()) return getMockAnalystEstimates(symbol);

  try {
    const data = await fmpGet<Record<string, unknown>[]>(`analyst-stock-recommendations/${symbol}`, { limit: '1' });
    const rec = Array.isArray(data) && data[0] ? data[0] as Record<string, unknown> : {};

    const buy       = safeNum(rec.analystRatingsbuy);
    const strongBuy = safeNum(rec.analystRatingsStrongBuy);
    const hold      = safeNum(rec.analystRatingsHold);
    const sell      = safeNum(rec.analystRatingsSell) + safeNum(rec.analystRatingsStrongSell);
    const total     = buy + strongBuy + hold + sell || 1;
    const buyPct    = (buy + strongBuy) / total;

    let consensusRating: AnalystEstimatesData['consensusRating'] = 'hold';
    if (strongBuy / total > 0.5) consensusRating = 'strong_buy';
    else if (buyPct > 0.6) consensusRating = 'buy';
    else if (sell / total > 0.4) consensusRating = 'sell';

    const priceTarget = await fmpGet<Record<string, unknown>[]>(`price-target-summary/${symbol}`);
    const pt = Array.isArray(priceTarget) && priceTarget[0] ? priceTarget[0] as Record<string, unknown> : {};

    return {
      symbol,
      consensusRating,
      targetPriceMean:       safeNum(pt.targetMean),
      targetPriceHigh:       safeNum(pt.targetHigh),
      targetPriceLow:        safeNum(pt.targetLow),
      numberOfAnalysts:      safeNum(pt.numberOfAnalysts),
      revenueEstimateNextQ:  0,
      epsEstimateNextQ:      0,
    };
  } catch {
    return getMockAnalystEstimates(symbol);
  }
}

// ─── Short Float ──────────────────────────────────────────────────────────────

export async function fetchShortInterest(symbol: string): Promise<{ shortFloatPct: number; daysToCover: number }> {
  if (!fmpConfigured()) return { shortFloatPct: Math.random() * 8 + 2, daysToCover: 2 };

  try {
    const data = await fmpGet<Record<string, unknown>[]>(`historical/employee_count/${symbol}`, { limit: '1' });
    // FMP doesn't provide short interest on free tier; return placeholder
    void data;
    return { shortFloatPct: 0, daysToCover: 0 };
  } catch {
    return { shortFloatPct: 0, daysToCover: 0 };
  }
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_SECTORS: Record<string, string> = {
  NVDA: 'Technology', MSFT: 'Technology', AAPL: 'Technology', META: 'Communication Services',
  GOOGL: 'Communication Services', AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  LLY: 'Healthcare', UNH: 'Healthcare', JPM: 'Financials', V: 'Financials',
  CRWD: 'Technology', DDOG: 'Technology', SNOW: 'Technology', TTD: 'Technology',
};

export function getMockFundamentals(symbol: string): FundamentalsData {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng  = (min: number, max: number) => min + ((seed * 1103515245 + 12345) & 0x7fffffff) % (max - min);

  const revGrowth = rng(8, 45);
  const epsGrowth = rng(10, 60);
  const margin    = rng(15, 40);

  return {
    symbol,
    companyName:          `${symbol} Corp`,
    sector:               MOCK_SECTORS[symbol] ?? 'Technology',
    industry:             'Software',
    marketCap:            rng(10, 500),
    revenueGrowthYoy:     revGrowth,
    revenueGrowthQoq:     Math.round(revGrowth / 4 * 10) / 10,
    epsGrowthYoy:         epsGrowth,
    epsGrowthQoq:         Math.round(epsGrowth / 4 * 10) / 10,
    grossMargin:          rng(55, 82),
    operatingMargin:      margin,
    netMargin:            Math.round(margin * 0.75),
    fcfMargin:            Math.round(margin * 0.85),
    roe:                  rng(15, 45),
    roa:                  rng(8, 22),
    debtToEbitda:         Math.round(rng(0, 30) / 10),
    currentRatio:         1.5 + rng(0, 20) / 10,
    netCash:              rng(100, 5000),
    peRatio:              rng(20, 55),
    forwardPe:            rng(15, 40),
    psRatio:              rng(5, 18),
    pbRatio:              rng(3, 15),
    evEbitda:             rng(20, 60),
    pegRatio:             0.8 + rng(0, 12) / 10,
    earningsSurprisePct:  rng(2, 15),
    earningsSurpriteRate4q: rng(5, 12),
    analystTargetPrice:   rng(150, 800),
    impliedUpside:        rng(10, 35),
    epsRevisionUp30d:     rng(2, 8),
    epsRevisionDown30d:   rng(0, 3),
    nextEarningsDate:     new Date(Date.now() + rng(14, 75) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    daysToEarnings:       rng(14, 75),
  };
}

function getMockInsiderData(symbol: string): InsiderData {
  const seed = symbol.charCodeAt(0);
  return {
    symbol,
    netBuyDollars90d:     (seed % 3 === 0 ? -1 : 1) * seed * 12500,
    mostRecentBuyDate:    seed % 4 !== 0
      ? new Date(Date.now() - seed * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null,
    mostRecentBuyShares:  seed * 200,
    insiderBuyCount90d:   seed % 5,
    insiderSellCount90d:  seed % 3,
  };
}

function getMockAnalystEstimates(symbol: string): AnalystEstimatesData {
  const seed = symbol.charCodeAt(0) % 4;
  const ratings: AnalystEstimatesData['consensusRating'][] = ['strong_buy','buy','buy','hold'];
  return {
    symbol,
    consensusRating:       ratings[seed],
    targetPriceMean:       200 + seed * 50,
    targetPriceHigh:       300 + seed * 60,
    targetPriceLow:        100 + seed * 30,
    numberOfAnalysts:      15 + seed * 3,
    revenueEstimateNextQ:  1e9 * (1 + seed * 0.1),
    epsEstimateNextQ:      2.5 + seed * 0.5,
  };
}

// ─── FMP Stable API Base ──────────────────────────────────────────────────────

const FMP_STABLE = 'https://financialmodelingprep.com/stable';

function fmpStable<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  return axios.get<T>(`${FMP_STABLE}/${endpoint}`, {
    params: { ...params, apikey: process.env.FMP_API_KEY },
    timeout: 15000,
  }).then(r => r.data);
}

// ─── Bulk Types ───────────────────────────────────────────────────────────────

export interface KeyMetricsTTM {
  symbol: string;
  peRatioTTM: number;
  pegRatioTTM: number;
  priceToSalesRatioTTM: number;
  enterpriseValueOverEBITDATTM: number;
  roeTTM: number;
  freeCashFlowYieldTTM: number;
  debtToEquityTTM: number;
}

export interface RatiosTTM {
  symbol: string;
  grossProfitMarginTTM: number;
  operatingProfitMarginTTM: number;
  netProfitMarginTTM: number;
  freeCashFlowMarginTTM: number;
  currentRatioTTM: number;
  debtToEquityRatioTTM: number;
  returnOnAssetsTTM: number;
  returnOnEquityTTM: number;
}

export interface FinancialScores {
  symbol: string;
  piotroskiScore: number;       // 0–9
  altmanZScore: number;
  workingCapital: number;
  totalAssets: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  totalLiabilities: number;
  revenue: number;
}

export interface EarningsSurpriseBulk {
  symbol: string;
  date: string;
  actualEarningResult: number;
  estimatedEarning: number;
  surprisePercent: number;
}

export interface GradesConsensus {
  symbol: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensus: string;
}

export interface PriceTargetSummary {
  symbol: string;
  lastMonthAvgPriceTarget: number;
  lastMonthAvgPriceTargetHigh: number;
  lastMonthAvgPriceTargetLow: number;
  lastMonthCount: number;
  lastQuarterAvgPriceTarget: number;
  lastQuarterCount: number;
}

export interface IncomeStatementGrowth {
  symbol: string;
  revenueGrowth: number;
  grossProfitGrowth: number;
  ebitgrowth: number;
  operatingIncomeGrowth: number;
  netIncomeGrowth: number;
  epsgrowth: number;
  freeCashFlowGrowth: number;
}

export interface CompanyProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  mktCap: number;
  description: string;
  exchangeShortName: string;
  country: string;
}

// ─── Per-Symbol Deep Types ────────────────────────────────────────────────────

export interface DCFData {
  symbol: string;
  date: string;
  dcf: number;
  stockPrice: number;
  impliedUpside: number;   // computed: (dcf - price) / price * 100
}

export interface OwnerEarnings {
  symbol: string;
  date: string;
  ownerEarnings: number;
  netIncome: number;
  capex: number;
  depreciation: number;
}

export interface TranscriptData {
  symbol: string;
  quarter: number;
  year: number;
  content: string;
  sentimentScore: number;   // computed: bullish phrases - bearish phrases
  bullishPhrases: number;
  bearishPhrases: number;
}

export interface CongressTrade {
  disclosureDate: string;
  transactionDate: string;
  name: string;
  asset: string;
  type: string;         // 'purchase' | 'sale'
  amount: string;
  chamber: 'senate' | 'house';
}

export interface InsiderStats {
  symbol: string;
  totalBought: number;
  totalSold: number;
  netActivity: number;       // bought - sold (dollar value)
  buyerCount: number;
  sellerCount: number;
  mostRecentTransaction: string;
}

export interface HFPositionsSummary {
  symbol: string;
  totalInvestors: number;
  totalShares: number;
  totalPutShares: number;
  totalCallShares: number;
  netSharesChange: number;
  quarterDate: string;
}

export interface ESGData {
  symbol: string;
  companyName: string;
  environmentScore: number;
  socialScore: number;
  governanceScore: number;
  ESGScore: number;
  ESGRiskRating: string;
  date: string;
}

// ─── Bulk Fetchers (1 API call covers ALL tickers) ────────────────────────────

export async function fetchBulkKeyMetrics(): Promise<Map<string, KeyMetricsTTM>> {
  if (!fmpConfigured()) return getMockBulkKeyMetrics();
  try {
    const data = await fmpStable<KeyMetricsTTM[]>('key-metrics-ttm-bulk');
    const map = new Map<string, KeyMetricsTTM>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkKeyMetrics failed:', (err as Error).message);
    return getMockBulkKeyMetrics();
  }
}

export async function fetchBulkRatios(): Promise<Map<string, RatiosTTM>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<RatiosTTM[]>('ratios-ttm-bulk');
    const map = new Map<string, RatiosTTM>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkRatios failed:', (err as Error).message);
    return new Map();
  }
}

export async function fetchBulkScores(): Promise<Map<string, FinancialScores>> {
  if (!fmpConfigured()) return getMockBulkScores();
  try {
    const data = await fmpStable<FinancialScores[]>('scores-bulk');
    const map = new Map<string, FinancialScores>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkScores failed:', (err as Error).message);
    return getMockBulkScores();
  }
}

export async function fetchBulkEarningsSurprises(year: string): Promise<Map<string, EarningsSurpriseBulk>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<EarningsSurpriseBulk[]>('earnings-surprises-bulk', { year });
    const map = new Map<string, EarningsSurpriseBulk>();
    if (Array.isArray(data)) {
      // Keep the most recent per symbol
      for (const d of data) {
        if (!map.has(d.symbol) || d.date > (map.get(d.symbol)!.date)) {
          map.set(d.symbol, d);
        }
      }
    }
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkEarningsSurprises failed:', (err as Error).message);
    return new Map();
  }
}

export async function fetchBulkGradesConsensus(): Promise<Map<string, GradesConsensus>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<GradesConsensus[]>('upgrades-downgrades-consensus-bulk');
    const map = new Map<string, GradesConsensus>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkGradesConsensus failed:', (err as Error).message);
    return new Map();
  }
}

export async function fetchBulkPriceTargets(): Promise<Map<string, PriceTargetSummary>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<PriceTargetSummary[]>('price-target-summary-bulk');
    const map = new Map<string, PriceTargetSummary>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkPriceTargets failed:', (err as Error).message);
    return new Map();
  }
}

export async function fetchBulkIncomeGrowth(year: string, period: string = 'annual'): Promise<Map<string, IncomeStatementGrowth>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<IncomeStatementGrowth[]>('income-statement-growth-bulk', { year, period });
    const map = new Map<string, IncomeStatementGrowth>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkIncomeGrowth failed:', (err as Error).message);
    return new Map();
  }
}

export async function fetchBulkProfiles(): Promise<Map<string, CompanyProfile>> {
  if (!fmpConfigured()) return new Map();
  try {
    const data = await fmpStable<CompanyProfile[]>('profile-bulk', { part: '0' });
    const map = new Map<string, CompanyProfile>();
    if (Array.isArray(data)) data.forEach(d => map.set(d.symbol, d));
    return map;
  } catch (err) {
    console.error('[fundamentals] fetchBulkProfiles failed:', (err as Error).message);
    return new Map();
  }
}

// ─── Per-Symbol Deep-Dive (top candidates only) ───────────────────────────────

export async function fetchDCFValuation(symbol: string): Promise<DCFData | null> {
  if (!fmpConfigured()) return getMockDCF(symbol);
  try {
    const data = await fmpStable<Record<string, unknown>[]>('discounted-cash-flow', { symbol });
    const d = Array.isArray(data) ? data[0] : (data as Record<string, unknown>);
    if (!d) return null;
    const dcf = safeNum(d.dcf);
    const price = safeNum(d.stockPrice) || safeNum(d.price);
    return {
      symbol,
      date:          String(d.date ?? ''),
      dcf,
      stockPrice:    price,
      impliedUpside: price > 0 ? parseFloat(((dcf - price) / price * 100).toFixed(1)) : 0,
    };
  } catch {
    return getMockDCF(symbol);
  }
}

export async function fetchOwnerEarnings(symbol: string): Promise<OwnerEarnings | null> {
  if (!fmpConfigured()) return null;
  try {
    const data = await fmpStable<Record<string, unknown>[]>('owner-earnings', { symbol });
    const d = Array.isArray(data) ? data[0] : null;
    if (!d) return null;
    return {
      symbol,
      date:           String(d.date ?? ''),
      ownerEarnings:  safeNum(d.ownerEarnings),
      netIncome:      safeNum(d.netIncome),
      capex:          safeNum(d.capitalExpenditures ?? d.capex),
      depreciation:   safeNum(d.depreciation),
    };
  } catch {
    return null;
  }
}

const BULLISH_PHRASES = ['accelerating', 'record', 'expanding', 'exceeding', 'momentum', 'strong demand', 'outperform', 'raised guidance', 'beat', 'growth'];
const BEARISH_PHRASES = ['headwinds', 'uncertainty', 'challenging', 'softening', 'pressure', 'lowered guidance', 'miss', 'decline', 'slowdown', 'cautious'];

export async function fetchEarningsTranscript(symbol: string): Promise<TranscriptData | null> {
  if (!fmpConfigured()) return null;
  try {
    const now = new Date();
    const year = now.getFullYear().toString();
    const quarter = Math.ceil((now.getMonth() + 1) / 3).toString();
    const data = await fmpStable<Record<string, unknown>[]>('earning-call-transcript', { symbol, year, quarter });
    const d = Array.isArray(data) ? data[0] : null;
    if (!d) return null;

    const content = String(d.content ?? '');
    const lower = content.toLowerCase();
    const bullish = BULLISH_PHRASES.reduce((c, p) => c + (lower.split(p).length - 1), 0);
    const bearish = BEARISH_PHRASES.reduce((c, p) => c + (lower.split(p).length - 1), 0);

    return {
      symbol,
      quarter:        safeNum(d.quarter),
      year:           safeNum(d.year),
      content:        content.slice(0, 2000),
      sentimentScore: bullish - bearish,
      bullishPhrases: bullish,
      bearishPhrases: bearish,
    };
  } catch {
    return null;
  }
}

export async function fetchCongressionalTrades(symbol: string): Promise<CongressTrade[]> {
  if (!fmpConfigured()) return [];
  try {
    const [senateData, houseData] = await Promise.allSettled([
      fmpStable<Record<string, unknown>[]>('senate-trades', { symbol }),
      fmpStable<Record<string, unknown>[]>('house-trades', { symbol }),
    ]);

    const trades: CongressTrade[] = [];
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (senateData.status === 'fulfilled' && Array.isArray(senateData.value)) {
      for (const t of senateData.value) {
        if (String(t.transactionDate ?? '') >= cutoff) {
          trades.push({
            disclosureDate:  String(t.disclosureDate ?? ''),
            transactionDate: String(t.transactionDate ?? ''),
            name:            String(t.name ?? ''),
            asset:           String(t.asset ?? symbol),
            type:            String(t.type ?? '').toLowerCase().includes('purchase') ? 'purchase' : 'sale',
            amount:          String(t.amount ?? ''),
            chamber:         'senate',
          });
        }
      }
    }

    if (houseData.status === 'fulfilled' && Array.isArray(houseData.value)) {
      for (const t of houseData.value) {
        if (String(t.transactionDate ?? '') >= cutoff) {
          trades.push({
            disclosureDate:  String(t.disclosureDate ?? ''),
            transactionDate: String(t.transactionDate ?? ''),
            name:            String(t.name ?? ''),
            asset:           String(t.asset ?? symbol),
            type:            String(t.type ?? '').toLowerCase().includes('purchase') ? 'purchase' : 'sale',
            amount:          String(t.amount ?? ''),
            chamber:         'house',
          });
        }
      }
    }

    return trades.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  } catch {
    return [];
  }
}

export async function fetchInsiderStatistics(symbol: string): Promise<InsiderStats> {
  if (!fmpConfigured()) return getMockInsiderStats(symbol);
  try {
    const data = await fmpStable<Record<string, unknown>[]>('insider-trading/statistics', { symbol });
    const d = Array.isArray(data) ? data[0] as Record<string, unknown> : {};
    const bought = safeNum(d.totalBought);
    const sold   = safeNum(d.totalSold);
    return {
      symbol,
      totalBought:            bought,
      totalSold:              sold,
      netActivity:            bought - sold,
      buyerCount:             safeNum(d.buyerCount ?? d.insiderBuyers),
      sellerCount:            safeNum(d.sellerCount ?? d.insiderSellers),
      mostRecentTransaction:  String(d.mostRecentTransaction ?? ''),
    };
  } catch {
    return getMockInsiderStats(symbol);
  }
}

export async function fetchPositionsSummary(symbol: string): Promise<HFPositionsSummary | null> {
  if (!fmpConfigured()) return null;
  try {
    const now = new Date();
    const year = now.getFullYear().toString();
    const quarter = Math.ceil((now.getMonth() + 1) / 3).toString();
    const data = await fmpStable<Record<string, unknown>[]>(
      'institutional-ownership/symbol-positions-summary',
      { symbol, year, quarter }
    );
    const d = Array.isArray(data) ? data[0] as Record<string, unknown> : null;
    if (!d) return null;
    return {
      symbol,
      totalInvestors:   safeNum(d.totalInvestors),
      totalShares:      safeNum(d.totalShares ?? d.totalInstitutionalShares),
      totalPutShares:   safeNum(d.totalPutShares),
      totalCallShares:  safeNum(d.totalCallShares),
      netSharesChange:  safeNum(d.netSharesChange ?? d.quarterlyNetChange),
      quarterDate:      String(d.date ?? ''),
    };
  } catch {
    return null;
  }
}

export async function fetchESGRatings(symbol: string): Promise<ESGData | null> {
  if (!fmpConfigured()) return null;
  try {
    const data = await fmpStable<Record<string, unknown>[]>('esg-ratings', { symbol });
    const d = Array.isArray(data) ? data[0] as Record<string, unknown> : null;
    if (!d) return null;
    return {
      symbol,
      companyName:       String(d.companyName ?? ''),
      environmentScore:  safeNum(d.environmentScore ?? d.E),
      socialScore:       safeNum(d.socialScore ?? d.S),
      governanceScore:   safeNum(d.governanceScore ?? d.G),
      ESGScore:          safeNum(d.ESGScore ?? d.esgScore),
      ESGRiskRating:     String(d.ESGRiskRating ?? ''),
      date:              String(d.date ?? ''),
    };
  } catch {
    return null;
  }
}

export async function fetchStockPeers(symbol: string): Promise<string[]> {
  if (!fmpConfigured()) return [];
  try {
    const data = await fmpStable<Record<string, unknown>[]>('stock-peers', { symbol });
    const d = Array.isArray(data) ? data[0] as Record<string, unknown> : null;
    if (!d) return [];
    const peers = d.peersList ?? d.peers ?? [];
    return Array.isArray(peers) ? (peers as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export async function fetchRevenueSegments(symbol: string): Promise<{ product: Record<string, number>; geographic: Record<string, number> }> {
  if (!fmpConfigured()) return { product: {}, geographic: {} };
  try {
    const [productData, geoData] = await Promise.allSettled([
      fmpStable<Record<string, unknown>[]>('revenue-product-segmentation', { symbol }),
      fmpStable<Record<string, unknown>[]>('revenue-geographic-segmentation', { symbol }),
    ]);

    const product: Record<string, number> = {};
    if (productData.status === 'fulfilled' && Array.isArray(productData.value)) {
      const latest = productData.value[0] as Record<string, Record<string, number>> | undefined;
      if (latest) {
        const key = Object.keys(latest).find(k => k !== 'symbol' && k !== 'date');
        if (key) Object.assign(product, latest[key]);
      }
    }

    const geographic: Record<string, number> = {};
    if (geoData.status === 'fulfilled' && Array.isArray(geoData.value)) {
      const latest = geoData.value[0] as Record<string, Record<string, number>> | undefined;
      if (latest) {
        const key = Object.keys(latest).find(k => k !== 'symbol' && k !== 'date');
        if (key) Object.assign(geographic, latest[key]);
      }
    }

    return { product, geographic };
  } catch {
    return { product: {}, geographic: {} };
  }
}

// ─── Bulk Mock Data ───────────────────────────────────────────────────────────

function getMockBulkKeyMetrics(): Map<string, KeyMetricsTTM> {
  return new Map(); // empty — growth screener uses getMockFundamentals for individual stocks
}

function getMockBulkScores(): Map<string, FinancialScores> {
  return new Map();
}

function getMockDCF(symbol: string): DCFData {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const price = 100 + (seed % 400);
  const dcf   = price * (1 + (seed % 30) / 100);
  return {
    symbol,
    date:          new Date().toISOString().split('T')[0],
    dcf,
    stockPrice:    price,
    impliedUpside: parseFloat(((dcf - price) / price * 100).toFixed(1)),
  };
}

function getMockInsiderStats(symbol: string): InsiderStats {
  const seed = symbol.charCodeAt(0);
  return {
    symbol,
    totalBought:            seed * 15000,
    totalSold:              seed * 8000,
    netActivity:            seed * 7000,
    buyerCount:             seed % 5 + 1,
    sellerCount:            seed % 3,
    mostRecentTransaction:  new Date(Date.now() - seed * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
}
