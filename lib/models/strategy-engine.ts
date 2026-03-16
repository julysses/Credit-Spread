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
} from './black-scholes';
import {
  runMonteCarlo,
  calculateSpreadProbabilities,
} from './monte-carlo';
import {
  classifyVIXRegime,
  VIXRegime,
  VolatilitySkew,
} from './volatility';

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
}

export interface StrategyDecision {
  strategy: StrategyType;
  rationale: string[];
  conditions: MarketConditions;
  recommendation: TradeRecommendation | null;
}

// ─────────────────────────────────────────────
// Strategy Decision Logic
// ─────────────────────────────────────────────

/**
 * Master strategy selector
 * Rules-based institutional SOP
 */
export function selectStrategy(conditions: MarketConditions): StrategyType {
  const { vix, isMacroEventDay, directionalBias, timeOfDay, spxDailyChange, vixRegime } = conditions;

  // Rule: Never trade macro event days
  if (isMacroEventDay) return 'NO_TRADE';

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
  const { spxPrice, impliedVol, directionalBias, skew } = conditions;

  const T = daysToExpiry / 365;
  const iv = impliedVol || conditions.vix / 100;

  // Expected move for the period
  const expMove = expectedMove(spxPrice, iv, daysToExpiry);

  // Default no-trade
  if (strategy === 'NO_TRADE') {
    return buildNoTrade(conditions);
  }

  let spreadType: 'call' | 'put' = 'put';
  let shortStrikePct: number;
  let spreadWidth: number;

  if (strategy === '90_PERCENT_FRAMEWORK') {
    spreadWidth = 10;
    // Place strikes 5–10 delta OTM, beyond 1× expected move
    shortStrikePct = 0.94; // ~5-6% below for put spread
    if (directionalBias === 'bearish') {
      spreadType = 'call';
      shortStrikePct = 1.06;
    } else if (directionalBias === 'bullish') {
      spreadType = 'put';
      shortStrikePct = 0.94;
    } else {
      // Iron condor for neutral
      return constructIronCondor(conditions, daysToExpiry, riskFreeRate, expMove);
    }
  } else if (strategy === 'MODERN_INCOME') {
    spreadWidth = 10;
    // Only sell one side based on directional bias
    if (directionalBias === 'bearish') {
      spreadType = 'call';
      shortStrikePct = 1.04; // Tighter for elevated vol
    } else {
      spreadType = 'put';
      shortStrikePct = 0.96;
    }
  } else {
    // VOLATILITY_CRUSH — tighter strikes, intraday expiry
    spreadWidth = 5;
    spreadType = directionalBias === 'bearish' ? 'call' : 'put';
    shortStrikePct = spreadType === 'put' ? 0.98 : 1.02;
  }

  // Calculate exact strikes based on expected move
  const minDistanceFromSpot = expMove * (strategy === '90_PERCENT_FRAMEWORK' ? 1.2 : 0.8);

  let shortStrike: number;
  if (spreadType === 'put') {
    shortStrike = Math.round((spxPrice - minDistanceFromSpot) / 5) * 5;
  } else {
    shortStrike = Math.round((spxPrice + minDistanceFromSpot) / 5) * 5;
  }

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

  const credit = shortBS.price - longBS.price;
  const creditPerContract = credit * 100;
  const maxLoss = (spreadWidth - credit) * 100;

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

  const warnings: string[] = [];
  if (iv <= conditions.realizedVol) warnings.push('IV not elevated over realized vol');
  if (pot > 0.15) warnings.push('Probability of touch >15% — wide stop required');
  if (evCalc.ev < 0) warnings.push('Negative expected value — do not trade');
  if (conditions.technicalSignal === 'at_support' && spreadType === 'put') warnings.push('Near support — avoid put spread');
  if (conditions.technicalSignal === 'at_resistance' && spreadType === 'call') warnings.push('Near resistance — avoid call spread');

  const confidence: 'high' | 'medium' | 'low' =
    pop >= 0.88 && evCalc.ev > 0 && iv > conditions.realizedVol && warnings.length === 0
      ? 'high'
      : pop >= 0.80 && evCalc.ev > 0
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

  const putCredit = putShortBS.price - putLongBS.price;
  const callCredit = callShortBS.price - callLongBS.price;
  const totalCredit = putCredit + callCredit;
  const totalCreditPerContract = totalCredit * 100;
  const maxLossPerContract = (spreadWidth - totalCredit) * 100;

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
  const kelly = kellyCriterion(pop, totalCredit / (spreadWidth - totalCredit));

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
    probOfTouch: parseFloat(Math.min(probabilityOfTouch(putShortBS.delta), probabilityOfTouch(callShortBS.delta)).toFixed(4)),
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
    warnings: [],
    confidence: pop >= 0.85 ? 'high' : 'medium',
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

  return { strategy, rationale, conditions, recommendation };
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
