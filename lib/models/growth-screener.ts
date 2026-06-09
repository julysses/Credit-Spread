/**
 * Growth & Momentum Screener Engine
 * Scores stocks across three strategy types:
 *   - short_term:    momentum + catalyst + options flow (0–100)
 *   - long_term:     fundamental quality + institutional + trend (0–100)
 *   - future_mover:  prediction signals (squeeze, unusual flow, initiation)
 */

import type { OHLCVBar } from './stock-feature-engine';
import { computeDailyFeatures, type DailyFeatures } from './stock-swing-engine';
import type { FundamentalsData } from '@/server/fundamentals';
import type { StockFlowSummary, OptionsFlowAlert } from '@/server/options-flow';
import type { HedgeFundPosition, InstitutionalData } from '@/server/institutional';
import { getUnavailableFlowSummary } from '@/server/options-flow';
import { getUnavailableInstitutionalData } from '@/server/institutional';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StrategyType = 'short_term' | 'long_term' | 'future_mover';

export interface GrowthFeatures {
  // Technical (from computeDailyFeatures)
  technical: DailyFeatures;
  // Additional technicals
  rsi14: number;
  macdBullishCrossover: boolean;
  macdDaysAgo: number;        // how many days ago was the crossover (0 = today)
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  ema20: number;
  ema50: number;
  sma20: number;
  sma50: number;
  sma200: number;
  priceAboveEma20: boolean;
  priceAboveEma50: boolean;
  priceVsSma200Pct: number;
  priceVsEma50Pct: number;
  sma50VsSma200Pct: number;
  volumeRatio: number;
  distFromHigh52w: number;
  weekChangePct: number;
  monthChangePct: number;
  threeMonthChangePct: number;
  relStrengthVsSpy1m: number; // % outperformance vs SPY over 1 month
  // Fundamental
  fundamentals: FundamentalsData;
  // Options flow
  flow: StockFlowSummary;
  // Institutional
  institutional: InstitutionalData;
  // Screener enrichment fields (set by daily-growth-screener after initial build)
  piotroskiScore?: number;
  altmanZScore?: number;
  congressionalBuySignal?: boolean;
  maRumorSignal?: boolean;
  institutionalOwnershipPct?: number;
  hfNetShareChangePct?: number;
  insiderNetBuyDollars90d?: number;
  shortFloatPct?: number;
  topHedgeFundHolders?: HedgeFundPosition[];
}

export interface MomentumScore {
  total: number;             // 0–100
  technical: number;         // 0–40
  priceStructure: number;    // 0–20
  catalyst: number;          // 0–25
  optionsFlow: number;       // 0–15
  reasons: string[];
  warnings: string[];
}

export interface ValueGrowthScore {
  total: number;             // 0–100
  fundamentalQuality: number; // 0–35
  institutional: number;     // 0–25
  technicalTrend: number;    // 0–25
  valueReasonableness: number; // 0–15
  reasons: string[];
  warnings: string[];
}

export interface FutureMoverScore {
  total: number;             // 0–100
  unusualFlow: number;       // 0–30
  squeezeSetup: number;      // 0–25
  analystInitiation: number; // 0–20
  sectorInflow: number;      // 0–15
  darkPool: number;          // 0–10
  reasons: string[];
}

export interface GrowthCandidate {
  symbol: string;
  companyName: string;
  sector: string;
  marketCap: number;
  strategyType: StrategyType;
  compositeScore: number;
  momentumScore: MomentumScore | null;
  valueGrowthScore: ValueGrowthScore | null;
  futureMoverScore: FutureMoverScore | null;
  price: number;
  priceChangePct: number;
  volumeRatio: number;
  rsi14: number;
  above200sma: boolean;
  above50ema: boolean;
  revenueGrowthPct: number;
  epsGrowthPct: number;
  pegRatio: number;
  signals: Record<string, unknown>;
}

// ─── RSI(14) Calculation ─────────────────────────────────────────────────────

export function computeRSI14(closes: number[]): number {
  if (closes.length < 15) return 50;
  const changes = closes.slice(-15).map((c, i, arr) => i > 0 ? c - arr[i - 1] : 0).slice(1);
  let avgGain = changes.filter(c => c > 0).reduce((s, c) => s + c, 0) / 14;
  let avgLoss = changes.filter(c => c < 0).reduce((s, c) => s + Math.abs(c), 0) / 14;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

// ─── MACD Calculation ─────────────────────────────────────────────────────────

function computeEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    emas.push(closes[i] * k + emas[i - 1] * (1 - k));
  }
  return emas;
}

interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  bullishCrossover: boolean;
  crossoverDaysAgo: number;
}

export function computeMACD(closes: number[]): MACDResult {
  if (closes.length < 35) {
    return { macdLine: 0, signalLine: 0, histogram: 0, bullishCrossover: false, crossoverDaysAgo: 999 };
  }
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdArr = ema12.map((v, i) => v - ema26[i]);
  const signalArr = computeEMA(macdArr, 9);

  const macdLine   = macdArr[macdArr.length - 1];
  const signalLine = signalArr[signalArr.length - 1];
  const histogram  = macdLine - signalLine;

  // Find most recent bullish crossover (macd crosses above signal)
  let crossoverDaysAgo = 999;
  for (let i = macdArr.length - 1; i > 0; i--) {
    const daysAgo = macdArr.length - 1 - i;
    if (daysAgo > 20) break; // only look back 20 days
    if (macdArr[i] > signalArr[i] && macdArr[i - 1] <= signalArr[i - 1]) {
      crossoverDaysAgo = daysAgo;
      break;
    }
  }

  return {
    macdLine:         parseFloat(macdLine.toFixed(3)),
    signalLine:       parseFloat(signalLine.toFixed(3)),
    histogram:        parseFloat(histogram.toFixed(3)),
    bullishCrossover: crossoverDaysAgo <= 10,
    crossoverDaysAgo,
  };
}

// ─── EMA Calculation ─────────────────────────────────────────────────────────

export function computeCurrentEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  return computeEMA(closes.slice(-Math.max(period * 3, closes.length)), period).slice(-1)[0];
}

// ─── Feature Builder ─────────────────────────────────────────────────────────

export function buildGrowthFeatures(
  symbol: string,
  bars: OHLCVBar[],
  spyBars: OHLCVBar[],
  fundamentals: FundamentalsData,
  flow: StockFlowSummary | null,
  institutional: InstitutionalData | null,
): GrowthFeatures | null {
  const technical = computeDailyFeatures(symbol, bars, spyBars);
  if (!technical) return null;

  const closes = bars.map(b => b.close);
  const rsi14  = computeRSI14(closes);
  const macd   = computeMACD(closes);
  const ema20  = computeCurrentEMA(closes, 20);
  const ema50  = computeCurrentEMA(closes, 50);

  const price  = closes[closes.length - 1];
  const week1  = closes.length >= 5  ? closes[closes.length - 6]  : price;
  const month1 = closes.length >= 21 ? closes[closes.length - 22] : price;
  const month3 = closes.length >= 63 ? closes[closes.length - 64] : price;

  const spyCloses  = spyBars.map(b => b.close);
  const spyNow     = spyCloses[spyCloses.length - 1] ?? 1;
  const spy1mAgo   = spyCloses.length >= 21 ? spyCloses[spyCloses.length - 22] : spyNow;
  const spyReturn1m = spy1mAgo > 0 ? (spyNow - spy1mAgo) / spy1mAgo * 100 : 0;
  const symReturn1m = month1 > 0 ? (price - month1) / month1 * 100 : 0;

  const volRatio = technical.volAvg50 > 0 ? technical.lastVol / technical.volAvg50 : 1;
  const sma50VsSma200 = technical.sma200 > 0
    ? (technical.sma50 - technical.sma200) / technical.sma200 * 100 : 0;

  return {
    technical,
    rsi14,
    macdBullishCrossover: macd.bullishCrossover,
    macdDaysAgo:          macd.crossoverDaysAgo,
    macdLine:             macd.macdLine,
    macdSignal:           macd.signalLine,
    macdHistogram:        macd.histogram,
    ema20,
    ema50,
    sma20:                technical.sma20,
    sma50:                technical.sma50,
    sma200:               technical.sma200,
    priceAboveEma20:      price > ema20,
    priceAboveEma50:      price > ema50,
    priceVsSma200Pct:     technical.priceVsSma200Pct,
    priceVsEma50Pct:      ema50 > 0 ? parseFloat(((price - ema50) / ema50 * 100).toFixed(2)) : 0,
    sma50VsSma200Pct:     parseFloat(sma50VsSma200.toFixed(2)),
    volumeRatio:          parseFloat(volRatio.toFixed(2)),
    distFromHigh52w:      technical.distFrom52wHighPct,
    weekChangePct:        week1  > 0 ? parseFloat(((price - week1)  / week1  * 100).toFixed(2)) : 0,
    monthChangePct:       month1 > 0 ? parseFloat(((price - month1) / month1 * 100).toFixed(2)) : 0,
    threeMonthChangePct:  month3 > 0 ? parseFloat(((price - month3) / month3 * 100).toFixed(2)) : 0,
    relStrengthVsSpy1m:   parseFloat((symReturn1m - spyReturn1m).toFixed(2)),
    fundamentals,
    flow:          flow ?? getUnavailableFlowSummary(symbol),
    institutional: institutional ?? getUnavailableInstitutionalData(symbol),
  };
}

// ─── Short-Term Momentum Scorer (0–100) ──────────────────────────────────────

export function scoreShortTermMomentum(f: GrowthFeatures): MomentumScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let technical = 0, priceStructure = 0, catalyst = 0, optionsFlow = 0;

  // ── Technical Momentum (0–40) ──
  // RSI(14) in sweet spot 50–70
  if (f.rsi14 >= 55 && f.rsi14 <= 68) {
    technical += 15; reasons.push(`RSI(14) ${f.rsi14} — momentum zone`);
  } else if (f.rsi14 >= 50 && f.rsi14 < 55) {
    technical += 10; reasons.push(`RSI(14) ${f.rsi14} — building momentum`);
  } else if (f.rsi14 > 68 && f.rsi14 <= 75) {
    technical += 8; warnings.push(`RSI(14) ${f.rsi14} — approaching overbought`);
  } else if (f.rsi14 > 75) {
    warnings.push(`RSI(14) ${f.rsi14} — overbought, caution`);
  } else {
    warnings.push(`RSI(14) ${f.rsi14} — below momentum threshold`);
  }

  // Price above 20 EMA and 50 EMA
  if (f.priceAboveEma20 && f.priceAboveEma50) {
    technical += 10; reasons.push('Price above 20 & 50 EMA');
  } else if (f.priceAboveEma50) {
    technical += 5; reasons.push('Price above 50 EMA');
    warnings.push('Below 20 EMA — short-term weakness');
  } else {
    warnings.push('Below key EMAs');
  }

  // MACD bullish crossover
  if (f.macdBullishCrossover && f.macdDaysAgo <= 3) {
    technical += 10; reasons.push(`MACD bullish crossover ${f.macdDaysAgo === 0 ? 'today' : f.macdDaysAgo + 'd ago'}`);
  } else if (f.macdBullishCrossover && f.macdDaysAgo <= 7) {
    technical += 7;  reasons.push(`MACD bullish crossover ${f.macdDaysAgo}d ago`);
  } else if (f.macdBullishCrossover) {
    technical += 4;  reasons.push(`MACD bullish crossover ${f.macdDaysAgo}d ago (fading)`);
  } else {
    warnings.push('No MACD bullish crossover');
  }

  // Volume surge
  const volRatio = f.technical.volAvg50 > 0 ? f.technical.lastVol / f.technical.volAvg50 : 1;
  if (volRatio >= 2.0) { technical += 5; reasons.push(`Volume ${volRatio.toFixed(1)}× avg — strong surge`); }
  else if (volRatio >= 1.5) { technical += 3; reasons.push(`Volume ${volRatio.toFixed(1)}× avg`); }

  // ── Price Structure (0–20) ──
  const distFromHigh = f.technical.distFrom52wHighPct;
  if (distFromHigh <= 5)  { priceStructure += 10; reasons.push(`Within ${distFromHigh.toFixed(1)}% of 52w high — breakout zone`); }
  else if (distFromHigh <= 10) { priceStructure += 7; reasons.push(`${distFromHigh.toFixed(1)}% from 52w high`); }
  else if (distFromHigh <= 20) { priceStructure += 4; }
  else { warnings.push(`${distFromHigh.toFixed(1)}% below 52w high — too far from highs`); }

  // Higher highs / higher lows proxy (3-month momentum)
  if (f.threeMonthChangePct >= 15) { priceStructure += 5; reasons.push(`+${f.threeMonthChangePct.toFixed(1)}% 3-month momentum`); }
  else if (f.threeMonthChangePct >= 5) { priceStructure += 3; }

  // Relative strength vs SPY
  if (f.relStrengthVsSpy1m >= 5) { priceStructure += 5; reasons.push(`Outperforming SPY by ${f.relStrengthVsSpy1m.toFixed(1)}% (1M)`); }
  else if (f.relStrengthVsSpy1m >= 0) { priceStructure += 2; }
  else { warnings.push('Underperforming SPY'); }

  // ── Growth Catalyst (0–25) ──
  const dte = f.fundamentals.daysToEarnings;
  if (dte !== null && dte >= 7 && dte <= 30) {
    catalyst += 10; reasons.push(`Earnings in ${dte} days — catalyst window`);
  } else if (dte !== null && dte >= 31 && dte <= 45) {
    catalyst += 5;
  }

  // EPS estimate revisions
  if (f.fundamentals.epsRevisionUp30d >= 3) { catalyst += 8; reasons.push(`${f.fundamentals.epsRevisionUp30d} analyst EPS upgrades (30d)`); }
  else if (f.fundamentals.epsRevisionUp30d >= 1) { catalyst += 4; reasons.push(`${f.fundamentals.epsRevisionUp30d} analyst EPS upgrade(s)`); }

  // Revenue growth
  if (f.fundamentals.revenueGrowthYoy >= 30) { catalyst += 7; reasons.push(`Revenue +${f.fundamentals.revenueGrowthYoy.toFixed(0)}% YoY`); }
  else if (f.fundamentals.revenueGrowthYoy >= 20) { catalyst += 5; reasons.push(`Revenue +${f.fundamentals.revenueGrowthYoy.toFixed(0)}% YoY`); }
  else if (f.fundamentals.revenueGrowthYoy >= 10) { catalyst += 2; }

  // ── Options Flow (0–15) ──
  optionsFlow = f.flow.flowScore;
  if (f.flow.unusualCallCount >= 2) reasons.push(`${f.flow.unusualCallCount} unusual call sweeps detected`);
  if (f.flow.putCallVolumeRatio < 0.5) reasons.push(`Bullish P/C ratio: ${f.flow.putCallVolumeRatio}`);

  technical     = Math.min(40, technical);
  priceStructure = Math.min(20, priceStructure);
  catalyst      = Math.min(25, catalyst);
  optionsFlow   = Math.min(15, optionsFlow);

  return {
    total: technical + priceStructure + catalyst + optionsFlow,
    technical, priceStructure, catalyst, optionsFlow,
    reasons, warnings,
  };
}

// ─── Long-Term Value + Growth Scorer (0–100) ─────────────────────────────────

export function scoreLongTermValueGrowth(f: GrowthFeatures): ValueGrowthScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let fundamentalQuality = 0, institutional = 0, technicalTrend = 0, valueReasonableness = 0;

  // ── Fundamental Quality (0–35) ──
  const revGrowth = f.fundamentals.revenueGrowthYoy;
  if (revGrowth >= 25) { fundamentalQuality += 15; reasons.push(`Revenue +${revGrowth.toFixed(0)}% YoY — high growth`); }
  else if (revGrowth >= 15) { fundamentalQuality += 10; reasons.push(`Revenue +${revGrowth.toFixed(0)}% YoY`); }
  else if (revGrowth >= 5)  { fundamentalQuality += 4; }
  else warnings.push('Revenue growth <5% YoY');

  if (f.fundamentals.epsGrowthYoy >= 20) { fundamentalQuality += 8; reasons.push(`EPS +${f.fundamentals.epsGrowthYoy.toFixed(0)}% YoY`); }
  else if (f.fundamentals.epsGrowthYoy >= 10) { fundamentalQuality += 4; }

  if (f.fundamentals.fcfMargin >= 15) { fundamentalQuality += 7; reasons.push(`FCF margin ${f.fundamentals.fcfMargin.toFixed(0)}%`); }
  else if (f.fundamentals.fcfMargin > 0) { fundamentalQuality += 3; }
  else warnings.push('Negative FCF');

  if (f.fundamentals.roe >= 20) { fundamentalQuality += 5; reasons.push(`ROE ${f.fundamentals.roe.toFixed(0)}%`); }
  else if (f.fundamentals.roe >= 15) { fundamentalQuality += 2; }

  // ── Institutional Backing (0–25) ──
  institutional = f.institutional.institutionalScore;
  if (f.institutional.hfNetShareChangePct >= 3) reasons.push(`HFs buying: +${f.institutional.hfNetShareChangePct.toFixed(1)}% QoQ`);
  if (f.institutional.insiderNetBuyDollars90d >= 250_000) reasons.push(`Insider buying: $${(f.institutional.insiderNetBuyDollars90d / 1000).toFixed(0)}K net (90d)`);

  // ── Technical Trend (0–25) ──
  if (f.technical.lastClose > f.technical.sma200) {
    technicalTrend += 10; reasons.push('Price above 200 SMA');
  } else {
    warnings.push('Price below 200 SMA — trend not confirmed');
  }

  if (f.technical.sma50 > f.technical.sma200) {
    technicalTrend += 8; reasons.push('50 SMA > 200 SMA (golden cross territory)');
  } else {
    warnings.push('Death cross or no golden cross');
  }

  if (f.rsi14 > 50) { technicalTrend += 4; reasons.push(`RSI ${f.rsi14} above 50`); }
  if (f.technical.sma200Slope > 0.1) { technicalTrend += 3; reasons.push(`200 SMA trending up (+${f.technical.sma200Slope.toFixed(1)}%)`); }

  // ── Value Reasonableness (0–15) ──
  if (f.fundamentals.pegRatio > 0 && f.fundamentals.pegRatio < 1.5) {
    valueReasonableness += 5; reasons.push(`PEG ${f.fundamentals.pegRatio.toFixed(1)} — attractive for growth`);
  } else if (f.fundamentals.pegRatio < 2.5) {
    valueReasonableness += 2;
  } else {
    warnings.push(`PEG ${f.fundamentals.pegRatio.toFixed(1)} — premium valuation`);
  }

  if (f.fundamentals.psRatio > 0 && f.fundamentals.psRatio < 10) {
    valueReasonableness += 5; reasons.push(`P/S ${f.fundamentals.psRatio.toFixed(1)}`);
  } else if (f.fundamentals.psRatio < 20) {
    valueReasonableness += 2;
  }

  if (f.fundamentals.debtToEbitda >= 0 && f.fundamentals.debtToEbitda < 3) {
    valueReasonableness += 5; reasons.push('Manageable debt load');
  } else if (f.fundamentals.debtToEbitda >= 3) {
    warnings.push(`High leverage: Debt/EBITDA ${f.fundamentals.debtToEbitda.toFixed(1)}×`);
  }

  fundamentalQuality  = Math.min(35, fundamentalQuality);
  institutional       = Math.min(25, institutional);
  technicalTrend      = Math.min(25, technicalTrend);
  valueReasonableness = Math.min(15, valueReasonableness);

  return {
    total: fundamentalQuality + institutional + technicalTrend + valueReasonableness,
    fundamentalQuality, institutional, technicalTrend, valueReasonableness,
    reasons, warnings,
  };
}

// ─── Future Mover Scorer (0–100) ─────────────────────────────────────────────

export function scoreFutureMover(f: GrowthFeatures): FutureMoverScore {
  const reasons: string[] = [];
  let unusualFlow = 0, squeezeSetup = 0, analystInitiation = 0, sectorInflow = 0, darkPool = 0;

  // Large OTM call sweeps
  const bigCalls = f.flow.alerts.filter(a =>
    a.alertType === 'unusual_call' && a.daysToExpiry >= 30 && a.premium >= 50_000
  );
  if (bigCalls.length >= 2) { unusualFlow = 30; reasons.push(`${bigCalls.length} large OTM call sweeps (smart money positioning)`); }
  else if (bigCalls.length === 1) { unusualFlow = 18; reasons.push('Large OTM call sweep detected'); }
  else if (f.flow.unusualCallCount > 0) { unusualFlow = 10; }

  // Short squeeze setup
  if (f.institutional.shortFloatPct >= 20 && f.rsi14 > 50) {
    squeezeSetup = 25; reasons.push(`Short float ${f.institutional.shortFloatPct.toFixed(0)}% + improving technicals = squeeze potential`);
  } else if (f.institutional.shortFloatPct >= 15 && f.rsi14 > 45) {
    squeezeSetup = 15; reasons.push(`Short float ${f.institutional.shortFloatPct.toFixed(0)}%`);
  } else if (f.institutional.shortFloatPct >= 10) {
    squeezeSetup = 8;
  }

  // Analyst initiation (proxy via positive estimate revisions + low prior coverage)
  if (f.fundamentals.epsRevisionUp30d >= 5) { analystInitiation = 20; reasons.push('Strong analyst estimate revisions — potential new coverage'); }
  else if (f.fundamentals.epsRevisionUp30d >= 2) { analystInitiation = 10; }

  // Sector ETF inflow proxy (use sector relative volume from flow)
  if (f.flow.putCallVolumeRatio < 0.4) { sectorInflow = 15; reasons.push('Extremely bullish options flow — sector rotation signal'); }
  else if (f.flow.putCallVolumeRatio < 0.6) { sectorInflow = 8; }

  // Dark pool (placeholder — would use Polygon tick data)
  darkPool = 0;

  return {
    total: Math.min(100, unusualFlow + squeezeSetup + analystInitiation + sectorInflow + darkPool),
    unusualFlow, squeezeSetup, analystInitiation, sectorInflow, darkPool,
    reasons,
  };
}

// ─── Master Scoring Function ──────────────────────────────────────────────────

export function scoreCandidate(
  features: GrowthFeatures,
  strategyType: StrategyType,
): GrowthCandidate {
  const { fundamentals: fd, technical: tech } = features;
  const volRatio = tech.volAvg50 > 0 ? tech.lastVol / tech.volAvg50 : 1;

  const momentumScore    = strategyType !== 'long_term'  ? scoreShortTermMomentum(features) : null;
  const valueGrowthScore = strategyType !== 'short_term' && strategyType !== 'future_mover' ? scoreLongTermValueGrowth(features) : null;
  const futureMoverScore = strategyType === 'future_mover' ? scoreFutureMover(features) : null;

  const compositeScore =
    strategyType === 'short_term'    ? momentumScore!.total :
    strategyType === 'long_term'     ? valueGrowthScore!.total :
    futureMoverScore!.total;

  return {
    symbol:         fd.symbol,
    companyName:    fd.companyName,
    sector:         fd.sector,
    marketCap:      fd.marketCap,
    strategyType,
    compositeScore: parseFloat(compositeScore.toFixed(1)),
    momentumScore,
    valueGrowthScore,
    futureMoverScore,
    price:          tech.lastClose,
    priceChangePct: tech.dayChangePct,
    volumeRatio:    parseFloat(volRatio.toFixed(2)),
    rsi14:          features.rsi14,
    above200sma:    tech.lastClose > tech.sma200,
    above50ema:     features.priceAboveEma50,
    revenueGrowthPct: fd.revenueGrowthYoy,
    epsGrowthPct:   fd.epsGrowthYoy,
    pegRatio:       fd.pegRatio,
    signals: {
      rsi14:            features.rsi14,
      macdCrossover:    features.macdBullishCrossover,
      distFrom52wHigh:  tech.distFrom52wHighPct,
      rs63:             tech.rs63,
      revGrowthYoy:     fd.revenueGrowthYoy,
      epsGrowthYoy:     fd.epsGrowthYoy,
      insiderNetBuy:    features.institutional.insiderNetBuyDollars90d,
      shortFloat:       features.institutional.shortFloatPct,
      ivRank:           features.flow.ivRank,
      flowSentiment:    features.flow.sentiment,
    },
  };
}
