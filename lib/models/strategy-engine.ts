/**
 * SPX Signal Desk — Strategy Decision Engine
 * Institutional-grade rules engine for credit spread selection
 */

import {
  blackScholes,
  expectedMove,
  creditSpreadEV,
  kellyCriterion,
  probabilityOfTouch,
  strikeByDelta,
} from './black-scholes';
import {
  runMonteCarlo,
  calculateSpreadProbabilities,
} from './monte-carlo';
import type {
  VIXRegime,
  VolatilitySkew,
} from './volatility';
import { buildExitPlan } from './risk-controls';
import { buildRecommendationAudit, type RecommendationAuditRecord } from './audit';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type StrategyType =
  | 'NO_TRADE'
  | '90_PERCENT_FRAMEWORK'
  | 'MODERN_INCOME'
  | 'VOLATILITY_CRUSH';

export type DirectionalBias = 'bullish' | 'bearish' | 'neutral';
export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'extreme';
export type MarketRegime = 'trending_up' | 'trending_down' | 'range_bound' | 'volatile' | 'crisis';

export interface MarketConditions {
  spxPrice: number;
  spyPrice: number;
  vix: number;
  vixRegime: VIXRegime;
  vixPctile: number;        // VIX 1-year percentile
  ivRank: number;           // IV Rank 0-100
  directionalBias: DirectionalBias;
  marketRegime: MarketRegime;
  riskLevel: RiskLevel;
  isMacroEventDay: boolean; // FOMC, CPI, NFP etc.
  isExpiry: boolean;        // Expiration day
  timeOfDay: number;        // 0-2400 in HHMM format
  spxDailyChange: number;   // % change
  technicalSignal: 'above_ma' | 'below_ma' | 'at_support' | 'at_resistance' | 'neutral';
  realizedVol: number;      // 20-day HV annualized
  impliedVol: number;       // Current IV (VIX/100)
  skew: VolatilitySkew | null;
  dataConfidence?: 'live' | 'delayed' | 'synthetic' | 'mock' | 'invalid';
  dataWarnings?: string[];
}

export interface SpreadLeg {
  strike: number;
  optionType: 'call' | 'put';
  action: 'sell' | 'buy';
  delta: number;
  iv: number;
  premium: number;
  daysToExpiry: number;
}

export interface TradeRecommendation {
  strategy: StrategyType;
  tradeType: 'call_credit_spread' | 'put_credit_spread' | 'iron_condor' | 'no_trade';
  shortLeg: SpreadLeg | null;
  longLeg: SpreadLeg | null;
  shortLeg2?: SpreadLeg | null;  // For iron condor
  longLeg2?: SpreadLeg | null;
  credit: number;                // Net credit received per share
  creditTotal: number;           // Credit × 100 (per contract)
  maxProfit: number;
  maxLoss: number;
  probOfProfit: number;          // Monte Carlo derived
  probOfTouch: number;
  expectedValue: number;
  kellySize: number;             // Fraction of capital to risk
  profitTarget: number;          // Close at 50% of credit
  stopLoss: number;              // 2.2× credit
  daysToExpiry: number;
  expiryDate: string;
  conditions: string[];          // Human readable trade rationale
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
  decisionStatus?: 'trade_approved' | 'watch_only' | 'no_trade' | 'data_invalid';
  dataConfidence?: 'live' | 'delayed' | 'synthetic' | 'mock' | 'invalid';
  creditToWidth?: number;
  breakeven?: number;
  accountRiskPct?: number;
  suggestedContracts?: number;
  exitPlan?: {
    profitTarget: string;
    stopLoss: string;
    technicalStop: string;
    timeStop: string;
    eventStop: string;
    invalidation: string;
  };
}

export interface StrategyDecision {
  strategy: StrategyType;
  rationale: string[];
  conditions: MarketConditions;
  recommendation: TradeRecommendation | null;
  audit?: RecommendationAuditRecord;
}

// ─────────────────────────────────────────────
// Strategy Decision Logic
// ─────────────────────────────────────────────

function minutesUntilMarketClose(timeOfDay: number): number {
  const hours = Math.floor(timeOfDay / 100);
  const minutes = timeOfDay % 100;
  const current = hours * 60 + minutes;
  const close = 16 * 60;
  return Math.max(close - current, 15);
}

function minutesToTradingDayFraction(minutes: number): number {
  return Math.max(minutes / 390, 0.02);
}


/**
 * Master strategy selector
 * Rules-based institutional SOP
 */
export function selectStrategy(conditions: MarketConditions): StrategyType {
  const { vix, isMacroEventDay, directionalBias, timeOfDay, spxDailyChange, vixRegime } = conditions;

  // Rule: never trade invalid or demo-quality data unless explicitly reviewed in paper mode.
  if (conditions.dataConfidence === 'invalid' || conditions.dataConfidence === 'mock') return 'NO_TRADE';

  // Rule: Never trade macro event days
  if (isMacroEventDay) return 'NO_TRADE';

  // Rule: Do not sell premium without a volatility risk premium.
  if (conditions.realizedVol > 0 && conditions.impliedVol <= conditions.realizedVol) return 'NO_TRADE';

  // Rule: avoid unmanaged late-day gamma in same-day expiry.
  if (conditions.isExpiry && timeOfDay >= 1430) return 'NO_TRADE';

  // Rule: Check for volatility crush setup
  // — VIX spike (>20% from prior day), time after 10:30, stabilization
  const isVolSpike = Math.abs(spxDailyChange) > 1.5 && vix > 20;
  const isOptimalSellWindow = timeOfDay >= 1030 && timeOfDay <= 1300;
  if (isVolSpike && isOptimalSellWindow && vixRegime !== 'extreme') {
    return 'VOLATILITY_CRUSH';
  }

  // Rule: Use Modern Income when elevated VIX + directional bias
  if (vix > 20 && directionalBias !== 'neutral') {
    return 'MODERN_INCOME';
  }

  // Rule: Use 90% framework in stable moderate vol
  if (vix <= 20 && vixRegime !== 'extreme') {
    return '90_PERCENT_FRAMEWORK';
  }

  // Extreme VIX — avoid
  if (vixRegime === 'extreme') return 'NO_TRADE';

  return '90_PERCENT_FRAMEWORK';
}

/**
 * Construct credit spread parameters
 */
export function constructSpread(
  conditions: MarketConditions,
  strategy: StrategyType,
  daysToExpiry: number = 7,
  riskFreeRate: number = 0.05
): TradeRecommendation {
  const { spxPrice, impliedVol, directionalBias } = conditions;

  const effectiveDaysToExpiry = daysToExpiry <= 0 ? minutesToTradingDayFraction(minutesUntilMarketClose(conditions.timeOfDay)) : daysToExpiry;
  const T = Math.max(effectiveDaysToExpiry, 0.02) / 365;
  const iv = impliedVol || conditions.vix / 100;

  // Expected move for the period
  const expMove = expectedMove(spxPrice, iv, daysToExpiry);

  // Default no-trade
  if (strategy === 'NO_TRADE') {
    return buildNoTrade(conditions);
  }

  let spreadType: 'call' | 'put' = 'put';
  let spreadWidth: number;

  if (strategy === '90_PERCENT_FRAMEWORK') {
    spreadWidth = 10;
    // Place strikes by target short delta, then require expected-move clearance.
    if (directionalBias === 'bearish') {
      spreadType = 'call';
    } else if (directionalBias === 'bullish') {
      spreadType = 'put';
    } else {
      // Iron condor for neutral
      return constructIronCondor(conditions, daysToExpiry, riskFreeRate, expMove);
    }
  } else if (strategy === 'MODERN_INCOME') {
    spreadWidth = 10;
    // Only sell one side based on directional bias
    if (directionalBias === 'bearish') {
      spreadType = 'call';
    } else {
      spreadType = 'put';
    }
  } else {
    // VOLATILITY_CRUSH — tighter strikes, intraday expiry
    spreadWidth = 5;
    spreadType = directionalBias === 'bearish' ? 'call' : 'put';
  }

  // Calculate exact strikes based on expected move
  const minDistanceFromSpot = expMove * (strategy === '90_PERCENT_FRAMEWORK' ? 1.2 : 0.8);

  const targetDelta = strategy === '90_PERCENT_FRAMEWORK' ? 0.10 : strategy === 'MODERN_INCOME' ? 0.16 : 0.12;
  const deltaStrike = strikeByDelta(spxPrice, T, iv, targetDelta, spreadType);
  const expectedMoveStrike = spreadType === 'put'
    ? Math.round((spxPrice - minDistanceFromSpot) / 5) * 5
    : Math.round((spxPrice + minDistanceFromSpot) / 5) * 5;

  let shortStrike = spreadType === 'put'
    ? Math.min(deltaStrike, expectedMoveStrike)
    : Math.max(deltaStrike, expectedMoveStrike);

  // Round to nearest 5 for SPX
  shortStrike = Math.round(shortStrike / 5) * 5;

  const longStrike = spreadType === 'put'
    ? shortStrike - spreadWidth
    : shortStrike + spreadWidth;

  // Black-Scholes pricing for each leg
  const shortBS = blackScholes({
    S: spxPrice,
    K: shortStrike,
    T,
    r: riskFreeRate,
    sigma: iv,
    optionType: spreadType,
  });

  const longBS = blackScholes({
    S: spxPrice,
    K: longStrike,
    T,
    r: riskFreeRate,
    sigma: iv,
    optionType: spreadType,
  });

  const credit = Math.max(shortBS.price - longBS.price, 0);
  const creditPerContract = credit * 100;
  const maxLoss = Math.max((spreadWidth - credit) * 100, 0);
  const creditToWidth = spreadWidth > 0 ? credit / spreadWidth : 0;
  const breakeven = spreadType === 'put' ? shortStrike - credit : shortStrike + credit;

  // Monte Carlo probability estimation
  const mcResults = runMonteCarlo({
    spotPrice: spxPrice,
    impliedVolatility: iv,
    drift: 0, // Risk-neutral
    daysToExpiry,
    numSimulations: 10000,
  });

  const spreadProbs = calculateSpreadProbabilities(
    mcResults,
    shortStrike,
    longStrike,
    spreadType,
    credit
  );

  const pop = spreadProbs.probProfit;
  const pot = probabilityOfTouch(shortBS.delta);

  // Expected value
  const evCalc = creditSpreadEV(pop, credit, spreadWidth);

  // Kelly sizing
  const payoffRatio = credit / (spreadWidth - credit);
  const kelly = kellyCriterion(pop, payoffRatio);

  // Profit target = 50% of credit
  const profitTarget = credit * 0.5;
  // Stop loss = 2.2× credit
  const stopLoss = credit * 2.2;

  // Build conditions rationale
  const conditionsList: string[] = [];
  conditionsList.push(`VIX ${conditions.vix.toFixed(1)} — ${conditions.vixRegime} regime`);
  conditionsList.push(`Expected move: ±${expMove.toFixed(0)} points`);
  conditionsList.push(`Short strike ${shortStrike} is ${Math.abs(((shortStrike - spxPrice) / spxPrice) * 100).toFixed(1)}% OTM`);
  conditionsList.push(`IV ${(iv * 100).toFixed(1)}% vs RV ${(conditions.realizedVol * 100).toFixed(1)}% — ${iv > conditions.realizedVol ? 'IV > RV (favorable)' : 'IV < RV (caution)'}`);
  conditionsList.push(`Monte Carlo POP: ${(pop * 100).toFixed(1)}%`);

  const warnings: string[] = [...(conditions.dataWarnings ?? [])];
  if (conditions.dataConfidence === 'synthetic' || conditions.dataConfidence === 'delayed') warnings.push(`Data confidence is ${conditions.dataConfidence} — paper/verify before entry`);
  if (iv <= conditions.realizedVol) warnings.push('IV not elevated over realized vol');
  if (creditToWidth < 0.12) warnings.push('Credit is below 12% of width — poor payoff quality');
  if (pot > (daysToExpiry <= 1 ? 0.35 : 0.25)) warnings.push('Probability of touch elevated — wider stop required');
  if (evCalc.ev < 0) warnings.push('Negative expected value — do not trade');
  if (conditions.technicalSignal === 'at_support' && spreadType === 'put') warnings.push('Near support — avoid put spread');
  if (conditions.technicalSignal === 'at_resistance' && spreadType === 'call') warnings.push('Near resistance — avoid call spread');

  const hardBlock = conditions.dataConfidence === 'invalid' || conditions.dataConfidence === 'mock' || evCalc.ev < 0 || creditToWidth < 0.08;
  const decisionStatus: TradeRecommendation['decisionStatus'] = hardBlock
    ? (conditions.dataConfidence === 'invalid' || conditions.dataConfidence === 'mock' ? 'data_invalid' : 'no_trade')
    : warnings.length > 0 || pop < 0.80
      ? 'watch_only'
      : 'trade_approved';

  const confidence: 'high' | 'medium' | 'low' =
    decisionStatus === 'trade_approved' && pop >= 0.88 && evCalc.ev > 0 && iv > conditions.realizedVol && warnings.length === 0
      ? 'high'
      : decisionStatus !== 'no_trade' && pop >= 0.80 && evCalc.ev > 0
        ? 'medium'
        : 'low';

  // Calculate expiry date
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + daysToExpiry);

  return {
    strategy,
    tradeType: spreadType === 'put' ? 'put_credit_spread' : 'call_credit_spread',
    shortLeg: {
      strike: shortStrike,
      optionType: spreadType,
      action: 'sell',
      delta: shortBS.delta,
      iv: iv,
      premium: shortBS.price,
      daysToExpiry,
    },
    longLeg: {
      strike: longStrike,
      optionType: spreadType,
      action: 'buy',
      delta: longBS.delta,
      iv: iv,
      premium: longBS.price,
      daysToExpiry,
    },
    credit: parseFloat(credit.toFixed(2)),
    creditTotal: parseFloat(creditPerContract.toFixed(2)),
    maxProfit: parseFloat(creditPerContract.toFixed(2)),
    maxLoss: parseFloat(maxLoss.toFixed(2)),
    probOfProfit: parseFloat(pop.toFixed(4)),
    probOfTouch: parseFloat(pot.toFixed(4)),
    expectedValue: parseFloat(evCalc.ev.toFixed(4)),
    kellySize: parseFloat(kelly.toFixed(4)),
    profitTarget: parseFloat(profitTarget.toFixed(2)),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    daysToExpiry,
    expiryDate: expiry.toISOString().split('T')[0],
    conditions: conditionsList,
    warnings,
    confidence,
    decisionStatus,
    dataConfidence: conditions.dataConfidence ?? 'live',
    creditToWidth: parseFloat(creditToWidth.toFixed(4)),
    breakeven: parseFloat(breakeven.toFixed(2)),
    accountRiskPct: 0.01,
    suggestedContracts: maxLoss > 0 ? 1 : 0,
    exitPlan: buildExitPlan(spreadType, breakeven, profitTarget, stopLoss, daysToExpiry, conditions),
  };
}

/**
 * Construct Iron Condor (neutral strategy)
 */
function constructIronCondor(
  conditions: MarketConditions,
  daysToExpiry: number,
  riskFreeRate: number,
  expMove: number
): TradeRecommendation {
  const { spxPrice, impliedVol, vix } = conditions;
  const iv = impliedVol || vix / 100;
  const T = daysToExpiry / 365;
  const spreadWidth = 10;

  const putShortStrike = Math.round((spxPrice - expMove * 1.2) / 5) * 5;
  const putLongStrike = putShortStrike - spreadWidth;
  const callShortStrike = Math.round((spxPrice + expMove * 1.2) / 5) * 5;
  const callLongStrike = callShortStrike + spreadWidth;

  const putShortBS = blackScholes({ S: spxPrice, K: putShortStrike, T, r: riskFreeRate, sigma: iv, optionType: 'put' });
  const putLongBS = blackScholes({ S: spxPrice, K: putLongStrike, T, r: riskFreeRate, sigma: iv, optionType: 'put' });
  const callShortBS = blackScholes({ S: spxPrice, K: callShortStrike, T, r: riskFreeRate, sigma: iv, optionType: 'call' });
  const callLongBS = blackScholes({ S: spxPrice, K: callLongStrike, T, r: riskFreeRate, sigma: iv, optionType: 'call' });

  const putCredit = Math.max(putShortBS.price - putLongBS.price, 0);
  const callCredit = Math.max(callShortBS.price - callLongBS.price, 0);
  const totalCredit = putCredit + callCredit;
  const totalCreditPerContract = totalCredit * 100;
  const maxLossPerContract = Math.max((spreadWidth - totalCredit) * 100, 0);
  const creditToWidth = totalCredit / spreadWidth;

  const mcResults = runMonteCarlo({
    spotPrice: spxPrice, impliedVolatility: iv, drift: 0,
    daysToExpiry, numSimulations: 10000,
  });

  const prices = mcResults.terminalPrices;
  const n = prices.length;
  let profitCount = 0;
  for (const p of prices) {
    if (p > putShortStrike && p < callShortStrike) profitCount++;
  }
  const pop = profitCount / n;
  const ev = creditSpreadEV(pop, totalCredit, spreadWidth);
  const kelly = kellyCriterion(pop, totalCredit / Math.max(spreadWidth - totalCredit, 0.01));
  const putTouch = probabilityOfTouch(putShortBS.delta);
  const callTouch = probabilityOfTouch(callShortBS.delta);
  const combinedTouch = Math.min(putTouch + callTouch - (putTouch * callTouch), 1);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + daysToExpiry);

  return {
    strategy: '90_PERCENT_FRAMEWORK',
    tradeType: 'iron_condor',
    shortLeg: { strike: putShortStrike, optionType: 'put', action: 'sell', delta: putShortBS.delta, iv, premium: putShortBS.price, daysToExpiry },
    longLeg: { strike: putLongStrike, optionType: 'put', action: 'buy', delta: putLongBS.delta, iv, premium: putLongBS.price, daysToExpiry },
    shortLeg2: { strike: callShortStrike, optionType: 'call', action: 'sell', delta: callShortBS.delta, iv, premium: callShortBS.price, daysToExpiry },
    longLeg2: { strike: callLongStrike, optionType: 'call', action: 'buy', delta: callLongBS.delta, iv, premium: callLongBS.price, daysToExpiry },
    credit: parseFloat(totalCredit.toFixed(2)),
    creditTotal: parseFloat(totalCreditPerContract.toFixed(2)),
    maxProfit: parseFloat(totalCreditPerContract.toFixed(2)),
    maxLoss: parseFloat(maxLossPerContract.toFixed(2)),
    probOfProfit: parseFloat(pop.toFixed(4)),
    probOfTouch: parseFloat(combinedTouch.toFixed(4)),
    expectedValue: parseFloat(ev.ev.toFixed(4)),
    kellySize: parseFloat(kelly.toFixed(4)),
    profitTarget: parseFloat((totalCredit * 0.5).toFixed(2)),
    stopLoss: parseFloat((totalCredit * 2.2).toFixed(2)),
    daysToExpiry,
    expiryDate: expiry.toISOString().split('T')[0],
    conditions: [
      `Iron Condor: Put spread ${putShortStrike}/${putLongStrike} | Call spread ${callShortStrike}/${callLongStrike}`,
      `VIX ${conditions.vix.toFixed(1)} — neutral market regime`,
      `Expected move: ±${expMove.toFixed(0)}`,
    ],
    warnings: creditToWidth < 0.12 ? ['Credit is below 12% of width — poor payoff quality'] : [],
    confidence: pop >= 0.85 && creditToWidth >= 0.12 ? 'high' : 'medium',
    decisionStatus: pop >= 0.85 && creditToWidth >= 0.12 ? 'trade_approved' : 'watch_only',
    dataConfidence: conditions.dataConfidence ?? 'live',
    creditToWidth: parseFloat(creditToWidth.toFixed(4)),
    breakeven: undefined,
    accountRiskPct: 0.01,
    suggestedContracts: maxLossPerContract > 0 ? 1 : 0,
    exitPlan: buildExitPlan('put', putShortStrike - totalCredit, totalCredit * 0.5, totalCredit * 2.2, daysToExpiry, conditions),
  };
}

function buildNoTrade(conditions: MarketConditions): TradeRecommendation {
  return {
    strategy: 'NO_TRADE',
    tradeType: 'no_trade',
    shortLeg: null,
    longLeg: null,
    credit: 0,
    creditTotal: 0,
    maxProfit: 0,
    maxLoss: 0,
    probOfProfit: 0,
    probOfTouch: 0,
    expectedValue: 0,
    kellySize: 0,
    profitTarget: 0,
    stopLoss: 0,
    daysToExpiry: 0,
    expiryDate: '',
    conditions: ['Macro event day — standing aside per SOP Rule 3'],
    warnings: ['NO TRADE — macro event risk too high'],
    confidence: 'high',
    decisionStatus: conditions.dataConfidence === 'invalid' || conditions.dataConfidence === 'mock' ? 'data_invalid' : 'no_trade',
    dataConfidence: conditions.dataConfidence ?? 'live',
    creditToWidth: 0,
    accountRiskPct: 0,
    suggestedContracts: 0,
    exitPlan: {
      profitTarget: 'No target — no position.',
      stopLoss: 'No stop — no position.',
      technicalStop: 'Stand aside until the blocking condition clears.',
      timeStop: 'Re-check next valid trading window.',
      eventStop: 'Do not enter before macro/event risk resolves.',
      invalidation: 'Any live trade idea is invalid while this no-trade state is active.',
    },
  };
}

/**
 * Full strategy decision with rationale
 */
export function runStrategyEngine(conditions: MarketConditions): StrategyDecision {
  const strategy = selectStrategy(conditions);
  const rationale: string[] = [];

  rationale.push(`Market regime: ${conditions.marketRegime}`);
  rationale.push(`VIX: ${conditions.vix.toFixed(1)} (${conditions.vixRegime})`);
  rationale.push(`Directional bias: ${conditions.directionalBias}`);
  rationale.push(`IV Rank: ${conditions.ivRank.toFixed(0)}`);
  rationale.push(`Strategy selected: ${strategy}`);

  if (strategy === 'NO_TRADE') {
    rationale.push('Reason: Macro event day detected');
  } else if (strategy === 'VOLATILITY_CRUSH') {
    rationale.push('Reason: Vol spike detected, post-10:30 stabilization window');
  } else if (strategy === 'MODERN_INCOME') {
    rationale.push('Reason: Elevated VIX with directional bias');
  } else {
    rationale.push('Reason: Stable conditions — 90% framework optimal');
  }

  // Choose DTE based on strategy
  const dte = strategy === 'VOLATILITY_CRUSH' ? 0 : strategy === '90_PERCENT_FRAMEWORK' ? 7 : 14;

  const recommendation = constructSpread(conditions, strategy, dte);

  const audit = buildRecommendationAudit(conditions, recommendation, rationale);
  return { strategy, rationale, conditions, recommendation, audit };
}

// ─────────────────────────────────────────────
// Strategy Metadata — descriptions, timing, exit rules
// ─────────────────────────────────────────────

export interface StrategyMetadata {
  displayName: string;
  tagline: string;
  description: string;
  marketConditions: string;
  idealVIXRange: string;
  typicalDTE: number;
  riskProfile: 'Conservative' | 'Moderate' | 'Aggressive' | 'None';
  entryWindow: string;          // human-readable
  entryHHMM: { start: number; end: number }[]; // 24h HHMM pairs
  exitRules: string[];
  bestFor: string;
  avoid: string;
}

export const STRATEGY_METADATA: Record<StrategyType, StrategyMetadata> = {
  NO_TRADE: {
    displayName: 'Standing Aside',
    tagline: 'Capital preservation',
    description: 'No position. Macro event, extreme VIX, or insufficient edge.',
    marketConditions: 'Macro event day, VIX extreme (>40), or EV negative across all setups',
    idealVIXRange: 'N/A',
    typicalDTE: 0,
    riskProfile: 'None',
    entryWindow: 'N/A',
    entryHHMM: [],
    exitRules: ['Wait for macro event to resolve', 'Re-evaluate next trading session'],
    bestFor: 'FOMC days, CPI/NFP releases, earnings blackout periods',
    avoid: 'Using capital while edge is unclear',
  },
  '90_PERCENT_FRAMEWORK': {
    displayName: '90% Framework',
    tagline: 'High-probability OTM credit spread',
    description: 'Sell an OTM put (or call) spread targeting 88–92% POP. Strike placed 1.2× expected move from spot. Width: $10. Ideal in low-volatility, stable regimes.',
    marketConditions: 'VIX 15–22, range-bound or mild trend, IV > Realized Vol, no macro events',
    idealVIXRange: '15–22',
    typicalDTE: 7,
    riskProfile: 'Conservative',
    entryWindow: '9:45–10:15 AM ET  or  3:00–3:45 PM ET',
    entryHHMM: [{ start: 945, end: 1015 }, { start: 1500, end: 1545 }],
    exitRules: [
      'Close at 50% of credit received (profit target)',
      'Stop loss at 2.2× credit paid to close',
      'Time stop: close at 21 DTE if original DTE > 30',
      'Close same-day if VIX spikes >20% intraday',
    ],
    bestFor: 'Low-vol environments, theta harvesting, defined-risk income',
    avoid: 'FOMC weeks, CPI/NFP days, VIX > 25',
  },
  MODERN_INCOME: {
    displayName: 'Modern Income',
    tagline: 'Directional credit spread in elevated vol',
    description: 'Sell an OTM put spread (bullish bias) or call spread (bearish bias) with elevated IV premium. Tighter OTM placement (0.96/1.04) than 90% framework to capture more credit. Width: $10.',
    marketConditions: 'VIX 20–35, directional bias established, IV significantly above RV',
    idealVIXRange: '20–35',
    typicalDTE: 14,
    riskProfile: 'Moderate',
    entryWindow: '10:00–11:00 AM ET  (after direction established)',
    entryHHMM: [{ start: 1000, end: 1100 }],
    exitRules: [
      'Close at 50% of credit received',
      'Stop loss at 2.0× credit',
      'Exit immediately if directional bias reverses (news/price action)',
      'Max hold: 14 DTE — do not carry through expiry week',
    ],
    bestFor: 'Elevated vol with clear directional signal, post-spike stabilization',
    avoid: 'Neutral markets, extreme vol spikes (VIX > 35), macro uncertainty',
  },
  VOLATILITY_CRUSH: {
    displayName: 'Volatility Crush',
    tagline: '0-DTE — capture IV mean reversion after vol spike',
    description: 'Sell a tight OTM spread (width $5) same-day when SPX has moved >1.5% and VIX has spiked. Trade the stabilization window 10:30 AM–1:00 PM ET only. Close same day.',
    marketConditions: '|SPX change| > 1.5%, VIX spike, 10:30–13:00 ET stabilization window, VIX not extreme',
    idealVIXRange: '25–40',
    typicalDTE: 0,
    riskProfile: 'Aggressive',
    entryWindow: '10:30 AM–1:00 PM ET ONLY  (stabilization window)',
    entryHHMM: [{ start: 1030, end: 1300 }],
    exitRules: [
      'Close at 50% of credit OR end of day — whichever comes first',
      'Hard stop at 1.5× credit (tight — 0 DTE gamma risk)',
      'Exit immediately if VIX re-spikes >10% from entry',
      'NEVER hold through 3:30 PM ET',
    ],
    bestFor: 'Post-spike vol crush plays, 0-DTE theta collection, high-IV days',
    avoid: 'Low-vol days (VIX < 20), before 10:30 AM, trending markets with no stabilization',
  },
};

/**
 * Evaluate all non-NO_TRADE strategies with current conditions.
 * Returns full recommendation for each, useful for comparison view.
 */
export function evaluateAllStrategies(conditions: MarketConditions): {
  strategy: StrategyType;
  recommendation: TradeRecommendation;
  metadata: StrategyMetadata;
  isRecommended: boolean;
  isViable: boolean;
}[] {
  const recommended = selectStrategy(conditions);
  const strategies: StrategyType[] = ['90_PERCENT_FRAMEWORK', 'MODERN_INCOME', 'VOLATILITY_CRUSH'];

  return strategies.map(strategy => {
    const dte = strategy === 'VOLATILITY_CRUSH' ? 0 : strategy === '90_PERCENT_FRAMEWORK' ? 7 : 14;
    const recommendation = constructSpread(conditions, strategy, dte);
    const viable = recommendation.tradeType !== 'no_trade' && recommendation.probOfProfit > 0;
    return {
      strategy,
      recommendation,
      metadata: STRATEGY_METADATA[strategy],
      isRecommended: strategy === recommended,
      isViable: viable,
    };
  });
}

/**
 * Risk assessment
 */
export function assessRiskLevel(conditions: MarketConditions): RiskLevel {
  const { vix, spxDailyChange, isMacroEventDay } = conditions;
  if (isMacroEventDay || Math.abs(spxDailyChange) > 3) return 'extreme';
  if (vix > 35 || Math.abs(spxDailyChange) > 2) return 'high';
  if (vix > 25 || Math.abs(spxDailyChange) > 1.5) return 'elevated';
  if (vix > 18) return 'moderate';
  return 'low';
}
