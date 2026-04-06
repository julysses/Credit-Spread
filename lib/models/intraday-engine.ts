/**
 * SPX 0DTE Intraday Signal Engine
 * Modular, non-breaking addition to the credit spread platform
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type IntradayStrategyType =
  | '0DTE_VOL_CRUSH'
  | '0DTE_DIRECTIONAL_PUT'
  | '0DTE_DIRECTIONAL_CALL'
  | '0DTE_MEAN_REVERSION_PUT'
  | '0DTE_MEAN_REVERSION_CALL'
  | 'NO_TRADE';

export type IntradayTier = 'ELITE' | 'HIGH' | 'MODERATE' | 'LOW' | 'NO_TRADE';

export interface IntradayInputs {
  spxPrice: number;           // Current SPX price
  vix: number;                // Current VIX level
  vwap: number;               // Current VWAP
  openingRangeHigh: number;   // First 30-min session high
  openingRangeLow: number;    // First 30-min session low
  rsi5m: number;              // 5-minute RSI (0-100)
  rsi15m: number;             // 15-minute RSI (0-100)
  hasVolumeSpike: boolean;    // Volume > 1.5x average
  minutesRemaining: number;   // Minutes until 4:00 PM ET
  currentHourET: number;      // Current hour in Eastern Time (9-16)
}

export interface IntradaySignalResult {
  strategy: IntradayStrategyType;
  displayName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;           // 0.0 – 1.0
  confidenceScore: number;      // 0 – 100
  tier: IntradayTier;
  expectedMoveHigh: number;
  expectedMoveLow: number;
  shortStrike: number;
  longStrike: number;
  estimatedCredit: number;      // $ per share
  maxRisk: number;              // $ per share
  pop: number;                  // Probability of profit 0–1
  spreadWidth: number;
  // Per-leg detail (added for full trade structure display)
  optionType: 'put' | 'call';
  shortDelta: number;           // absolute delta of the short leg
  longDelta: number;            // absolute delta of the long leg
  shortPremium: number;         // estimated short leg premium
  longPremium: number;          // estimated long leg premium
  impliedVol: number;           // annualized IV (VIX / 100)
  reasons: string[];
  warnings: string[];
  exitRules: {
    takeProfitPct: number;      // e.g. 0.50 = take 50% of credit
    stopLossMult: number;       // e.g. 1.5 = stop at 1.5× credit
    timeStopMinutes: number;    // Close if X minutes remain
    takeProfitDollar: number;   // credit × takeProfitPct
    stopLossDollar: number;     // credit × stopLossMult
  };
}

// ─────────────────────────────────────────────
// Playbook — all 5 strategies scored
// ─────────────────────────────────────────────

export interface IntradayStrategyAssessment {
  strategyId: IntradayStrategyType;
  displayName: string;
  description: string;
  spreadType: 'put_credit_spread' | 'call_credit_spread' | 'iron_condor';
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  tier: IntradayTier;
  isViable: boolean;
  entryWindow: string;
  setupConditions: string[];
  metConditions: string[];
  shortStrike: number;
  longStrike: number;
  spreadWidth: number;
  estimatedCredit: number;
  maxRisk: number;
  pop: number;
  optionType: 'put' | 'call';
  shortDelta: number;
  longDelta: number;
  shortPremium: number;
  longPremium: number;
  impliedVol: number;
  warnings: string[];
  exitRules: {
    takeProfitPct: number;
    stopLossMult: number;
    timeStop: string;
    takeProfitDollar: number;
    stopLossDollar: number;
  };
}

// ─────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────

/** Cumulative standard normal distribution (Abramowitz & Stegun approx) */
function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

/**
 * Intraday expected move (1-sigma range)
 * EM = S × σ_annual × √(t_minutes / (252 × 390))
 */
function calcIntradayEM(spxPrice: number, vix: number, minutesRemaining: number): number {
  const annualVol = vix / 100;
  return spxPrice * annualVol * Math.sqrt(Math.max(minutesRemaining, 5) / (252 * 390));
}

/**
 * Probability that SPX stays on one side of a strike (simplified Black-Scholes put/call delta)
 * Returns P(S_T < strike) for a put short (profit if stays above strike)
 */
function probAboveStrike(spxPrice: number, strike: number, vix: number, minutesRemaining: number): number {
  const T = Math.max(minutesRemaining, 1) / (252 * 390);
  const sigma = vix / 100;
  if (T <= 0 || sigma <= 0) return strike < spxPrice ? 0.95 : 0.05;
  const d2 = (Math.log(spxPrice / strike) - 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return normCdf(d2);
}

/** Estimate credit for a credit spread based on delta/distance */
function estimateCredit(spxPrice: number, shortStrike: number, longStrike: number, vix: number, minutesRemaining: number): number {
  const T = Math.max(minutesRemaining, 1) / (252 * 390);
  const sigma = vix / 100;
  // Very simplified: approximate as difference in intrinsic probability × spread width
  const shortDelta = 1 - probAboveStrike(spxPrice, shortStrike, vix, minutesRemaining);
  const longDelta = 1 - probAboveStrike(spxPrice, longStrike, vix, minutesRemaining);
  const spreadWidth = Math.abs(longStrike - shortStrike);
  // Use implied vol to scale credit estimate
  const credit = Math.max(0.05, (shortDelta - longDelta) * spreadWidth * (1 + sigma * Math.sqrt(T) * 3));
  return Math.round(credit * 20) / 20; // round to nearest $0.05
}

// ─────────────────────────────────────────────
// Strike selector
// ─────────────────────────────────────────────

function selectStrikes(
  spxPrice: number,
  vix: number,
  minutesRemaining: number,
  direction: 'put' | 'call',
  expectedMoveHigh: number,
  expectedMoveLow: number,
): { shortStrike: number; longStrike: number; spreadWidth: number } {
  // Spread width scales with VIX: higher vol → wider spreads
  const baseWidth = vix > 30 ? 25 : vix > 20 ? 15 : 10;

  let shortStrike: number;
  if (direction === 'put') {
    // Short put strike: just below expected move low (round to nearest 5)
    shortStrike = Math.floor((expectedMoveLow - baseWidth * 0.3) / 5) * 5;
    shortStrike = Math.min(shortStrike, Math.floor((spxPrice - 20) / 5) * 5);
  } else {
    // Short call strike: just above expected move high
    shortStrike = Math.ceil((expectedMoveHigh + baseWidth * 0.3) / 5) * 5;
    shortStrike = Math.max(shortStrike, Math.ceil((spxPrice + 20) / 5) * 5);
  }

  const longStrike = direction === 'put'
    ? shortStrike - baseWidth
    : shortStrike + baseWidth;

  return { shortStrike, longStrike, spreadWidth: baseWidth };
}

// ─────────────────────────────────────────────
// Composite POP model
// ─────────────────────────────────────────────

function calcIntradayPOP(
  spxPrice: number,
  shortStrike: number,
  vix: number,
  minutesRemaining: number,
  direction: 'put' | 'call',
): number {
  const em = calcIntradayEM(spxPrice, vix, minutesRemaining);

  // POP_em: prob price stays within 1-sigma of short strike
  const distanceFromEM = direction === 'put'
    ? spxPrice - shortStrike
    : shortStrike - spxPrice;
  const popEM = normCdf(distanceFromEM / em);

  // POP_delta: 1 - |estimated short delta|
  const shortDelta = direction === 'put'
    ? 1 - probAboveStrike(spxPrice, shortStrike, vix, minutesRemaining)
    : probAboveStrike(spxPrice, shortStrike, vix, minutesRemaining);
  const popDelta = 1 - shortDelta;

  // POP_mc approximation (normal distribution beyond 1.5σ)
  const sigmas = distanceFromEM / Math.max(em, 1);
  const popMC = normCdf(sigmas);

  // Gamma adjustment: reduce POP if price close to strike
  const priceDist = Math.abs(spxPrice - shortStrike);
  const gammaAdj = priceDist < em * 0.5 ? -0.12 : priceDist < em ? -0.05 : 0;

  const finalPOP = popMC * 0.4 + popEM * 0.3 + popDelta * 0.2 + (0.85 + gammaAdj) * 0.1;
  return Math.min(0.97, Math.max(0.50, finalPOP));
}

// ─────────────────────────────────────────────
// Signal generators
// ─────────────────────────────────────────────

function detectVolCrush(inputs: IntradayInputs, em: number): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // IV elevated relative to realized move so far
  const openingRange = inputs.openingRangeHigh - inputs.openingRangeLow;
  const openingRangePct = (openingRange / inputs.spxPrice) * 100;
  if (openingRangePct > 0.3 && openingRange < em * 0.7) {
    score += 2;
    reasons.push(`Morning spike contained (OR: ${openingRange.toFixed(0)} pts, EM: ${em.toFixed(0)} pts)`);
  }

  // VIX elevated
  if (inputs.vix > 20) { score += 2; reasons.push(`VIX elevated at ${inputs.vix.toFixed(1)} — IV premium present`); }
  else if (inputs.vix > 16) { score += 1; reasons.push(`VIX at ${inputs.vix.toFixed(1)} — moderate IV`); }

  // Neutral RSI (price directionless = good for condor/crush)
  if (inputs.rsi5m > 40 && inputs.rsi5m < 60) { score += 1; reasons.push(`5m RSI neutral at ${inputs.rsi5m.toFixed(0)}`); }
  if (inputs.rsi15m > 40 && inputs.rsi15m < 60) { score += 1; reasons.push(`15m RSI neutral at ${inputs.rsi15m.toFixed(0)}`); }

  // Price near VWAP = range bound
  const vwapDev = Math.abs(inputs.spxPrice - inputs.vwap);
  if (vwapDev < em * 0.3) { score += 2; reasons.push(`Price near VWAP (${vwapDev.toFixed(0)} pts off)`); }

  // Volume not spiking = calm = good for crush
  if (!inputs.hasVolumeSpike) { score += 1; reasons.push('Normal volume — no directional push expected'); }
  else warnings.push('Volume spike detected — directional move possible');

  // Time check: best in late session
  if (inputs.currentHourET >= 13) { score += 1; reasons.push('Afternoon session: theta decay accelerating'); }
  if (inputs.currentHourET < 10) warnings.push('Too early — morning volatility not exhausted');

  return { score, reasons, warnings };
}

function detectDirectional(inputs: IntradayInputs, em: number): {
  direction: 'bullish' | 'bearish' | null;
  score: number;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let bullScore = 0, bearScore = 0;

  // VWAP bias
  if (inputs.spxPrice > inputs.vwap + em * 0.2) {
    bullScore += 2;
    reasons.push(`Price ${(inputs.spxPrice - inputs.vwap).toFixed(0)} pts above VWAP`);
  } else if (inputs.spxPrice < inputs.vwap - em * 0.2) {
    bearScore += 2;
    reasons.push(`Price ${(inputs.vwap - inputs.spxPrice).toFixed(0)} pts below VWAP`);
  }

  // RSI momentum
  if (inputs.rsi5m > 60 && inputs.rsi15m > 55) { bullScore += 2; reasons.push(`RSI momentum bullish (5m: ${inputs.rsi5m.toFixed(0)}, 15m: ${inputs.rsi15m.toFixed(0)})`); }
  if (inputs.rsi5m < 40 && inputs.rsi15m < 45) { bearScore += 2; reasons.push(`RSI momentum bearish (5m: ${inputs.rsi5m.toFixed(0)}, 15m: ${inputs.rsi15m.toFixed(0)})`); }

  // Opening range breakout
  if (inputs.spxPrice > inputs.openingRangeHigh) { bullScore += 2; reasons.push('Price broke above opening range — bullish continuation signal'); }
  if (inputs.spxPrice < inputs.openingRangeLow) { bearScore += 2; reasons.push('Price broke below opening range — bearish continuation signal'); }

  // Volume confirmation
  if (inputs.hasVolumeSpike) {
    if (bullScore > bearScore) { bullScore += 1; reasons.push('Volume spike confirming bullish move'); }
    if (bearScore > bullScore) { bearScore += 1; reasons.push('Volume spike confirming bearish move'); }
  }

  // VIX suppressed = directional more reliable
  if (inputs.vix < 18) { bullScore += 0.5; bearScore += 0.5; }

  const maxScore = Math.max(bullScore, bearScore);
  const direction: 'bullish' | 'bearish' | null = bullScore > bearScore + 1
    ? 'bullish'
    : bearScore > bullScore + 1
    ? 'bearish'
    : null;

  if (!direction) warnings.push('No clear directional bias — signal mixed');

  return { direction, score: maxScore, reasons, warnings };
}

function detectMeanReversion(inputs: IntradayInputs, em: number): {
  direction: 'fade_high' | 'fade_low' | null;
  score: number;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let direction: 'fade_high' | 'fade_low' | null = null;

  const emHigh = inputs.vwap + em;
  const emLow = inputs.vwap - em;

  // Price stretched beyond EM
  if (inputs.spxPrice > emHigh * 1.02) {
    score += 3;
    direction = 'fade_high';
    reasons.push(`Price ${(inputs.spxPrice - emHigh).toFixed(0)} pts ABOVE 1σ expected move high`);
  } else if (inputs.spxPrice < emLow * 0.98) {
    score += 3;
    direction = 'fade_low';
    reasons.push(`Price ${(emLow - inputs.spxPrice).toFixed(0)} pts BELOW 1σ expected move low`);
  }

  // RSI extreme at stretch
  if (direction === 'fade_high' && inputs.rsi5m > 75) { score += 2; reasons.push(`RSI overbought at ${inputs.rsi5m.toFixed(0)}`); }
  if (direction === 'fade_low' && inputs.rsi5m < 25) { score += 2; reasons.push(`RSI oversold at ${inputs.rsi5m.toFixed(0)}`); }

  // Volume climax (high vol at extremes = exhaustion)
  if (direction && inputs.hasVolumeSpike) {
    score += 1;
    reasons.push('Volume climax at extreme — possible exhaustion signal');
  }

  // NOT good for mean reversion: strong trend
  if (direction === 'fade_high' && inputs.spxPrice > inputs.openingRangeHigh && inputs.rsi15m > 60) {
    score -= 1;
    warnings.push('Breakout trend in progress — mean reversion risk elevated');
  }
  if (direction === 'fade_low' && inputs.spxPrice < inputs.openingRangeLow && inputs.rsi15m < 40) {
    score -= 1;
    warnings.push('Breakdown trend in progress — mean reversion risk elevated');
  }

  return { direction, score: Math.max(0, score), reasons, warnings };
}

// ─────────────────────────────────────────────
// Confidence tier
// ─────────────────────────────────────────────

function scoreTier(score: number): { tier: IntradayTier; confidence: number } {
  if (score >= 8) return { tier: 'ELITE', confidence: 0.91 + Math.min(0.05, (score - 8) * 0.01) };
  if (score >= 6) return { tier: 'HIGH', confidence: 0.80 + (score - 6) * 0.05 };
  if (score >= 4) return { tier: 'MODERATE', confidence: 0.65 + (score - 4) * 0.075 };
  if (score >= 2) return { tier: 'LOW', confidence: 0.50 + (score - 2) * 0.075 };
  return { tier: 'NO_TRADE', confidence: 0 };
}

// ─────────────────────────────────────────────
// Main engine export
// ─────────────────────────────────────────────

export function analyzeIntradaySignals(inputs: IntradayInputs): IntradaySignalResult {
  // Hard guards
  const noTradeResult = (reason: string): IntradaySignalResult => ({
    strategy: 'NO_TRADE',
    displayName: 'No Trade',
    bias: 'neutral',
    confidence: 0,
    confidenceScore: 0,
    tier: 'NO_TRADE',
    expectedMoveHigh: inputs.spxPrice + calcIntradayEM(inputs.spxPrice, inputs.vix, inputs.minutesRemaining),
    expectedMoveLow: inputs.spxPrice - calcIntradayEM(inputs.spxPrice, inputs.vix, inputs.minutesRemaining),
    shortStrike: 0,
    longStrike: 0,
    estimatedCredit: 0,
    maxRisk: 0,
    pop: 0,
    spreadWidth: 0,
    optionType: 'put',
    shortDelta: 0,
    longDelta: 0,
    shortPremium: 0,
    longPremium: 0,
    impliedVol: inputs.vix / 100,
    reasons: [reason],
    warnings: [],
    exitRules: { takeProfitPct: 0.50, stopLossMult: 1.5, timeStopMinutes: 15, takeProfitDollar: 0, stopLossDollar: 0 },
  });

  // Too close to open (first 30 min) — wait for opening range to form
  if (inputs.currentHourET < 10 || (inputs.currentHourET === 9 && inputs.minutesRemaining > 360)) {
    return noTradeResult('Opening range not yet established — wait until 10:00 AM ET minimum');
  }

  // Too close to close (last 15 min)
  if (inputs.minutesRemaining < 15) {
    return noTradeResult('< 15 minutes remaining — close positions, no new entries');
  }

  // Time stop: no new trades after 3:45 PM ET
  if (inputs.currentHourET >= 15 && inputs.minutesRemaining < 15) {
    return noTradeResult('Time stop: After 3:45 PM ET — no new 0DTE entries');
  }

  const em = calcIntradayEM(inputs.spxPrice, inputs.vix, inputs.minutesRemaining);
  const emHigh = inputs.spxPrice + em;
  const emLow = inputs.spxPrice - em;

  // Evaluate all three strategies
  const volCrush = detectVolCrush(inputs, em);
  const directional = detectDirectional(inputs, em);
  const meanRev = detectMeanReversion(inputs, em);

  // Pick winner
  let winnerStrategy: IntradayStrategyType = 'NO_TRADE';
  let winnerScore = 0;
  let winnerReasons: string[] = [];
  let winnerWarnings: string[] = [];
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let direction: 'put' | 'call' = 'put';

  if (volCrush.score >= directional.score && volCrush.score >= meanRev.score && volCrush.score >= 3) {
    winnerStrategy = '0DTE_VOL_CRUSH';
    winnerScore = volCrush.score;
    winnerReasons = volCrush.reasons;
    winnerWarnings = volCrush.warnings;
    bias = 'neutral';
    direction = 'put'; // prefer put side for vol crush
  } else if (directional.score >= meanRev.score && directional.score >= 3 && directional.direction) {
    bias = directional.direction;
    direction = bias === 'bullish' ? 'put' : 'call';
    winnerStrategy = bias === 'bullish' ? '0DTE_DIRECTIONAL_PUT' : '0DTE_DIRECTIONAL_CALL';
    winnerScore = directional.score;
    winnerReasons = directional.reasons;
    winnerWarnings = directional.warnings;
  } else if (meanRev.score >= 3 && meanRev.direction) {
    direction = meanRev.direction === 'fade_high' ? 'call' : 'put';
    bias = meanRev.direction === 'fade_high' ? 'bearish' : 'bullish';
    winnerStrategy = meanRev.direction === 'fade_high' ? '0DTE_MEAN_REVERSION_CALL' : '0DTE_MEAN_REVERSION_PUT';
    winnerScore = meanRev.score;
    winnerReasons = meanRev.reasons;
    winnerWarnings = meanRev.warnings;
  } else {
    return noTradeResult(`No signal meets minimum threshold — strongest: ${Math.max(volCrush.score, directional.score, meanRev.score).toFixed(1)}/8`);
  }

  // Strike selection
  const { shortStrike, longStrike, spreadWidth } = selectStrikes(
    inputs.spxPrice, inputs.vix, inputs.minutesRemaining,
    direction, emHigh, emLow,
  );

  // Probabilities & per-leg details
  const pop = calcIntradayPOP(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining, direction);
  const estimatedCredit = estimateCredit(inputs.spxPrice, shortStrike, longStrike, inputs.vix, inputs.minutesRemaining);
  const maxRisk = spreadWidth - estimatedCredit;

  // Per-leg deltas and premium estimates
  const impliedVol = inputs.vix / 100;
  const shortDelta = direction === 'put'
    ? 1 - probAboveStrike(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining)
    : probAboveStrike(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining);
  const longDelta = direction === 'put'
    ? 1 - probAboveStrike(inputs.spxPrice, longStrike, inputs.vix, inputs.minutesRemaining)
    : probAboveStrike(inputs.spxPrice, longStrike, inputs.vix, inputs.minutesRemaining);
  // shortPremium ≈ credit + longPremium; longPremium estimated from delta × spreadWidth
  const longPremium = Math.round(Math.max(0.05, longDelta * spreadWidth * 0.35) * 20) / 20;
  const shortPremium = Math.round((estimatedCredit + longPremium) * 20) / 20;

  const { tier, confidence } = scoreTier(winnerScore);
  const confidenceScore = Math.round(confidence * 100);

  const takeProfitPct = 0.50;
  const stopLossMult = 1.5;

  const displayNames: Record<IntradayStrategyType, string> = {
    '0DTE_VOL_CRUSH': 'Volatility Crush',
    '0DTE_DIRECTIONAL_PUT': 'Directional — Put Credit Spread',
    '0DTE_DIRECTIONAL_CALL': 'Directional — Call Credit Spread',
    '0DTE_MEAN_REVERSION_PUT': 'Mean Reversion — Put Credit Spread',
    '0DTE_MEAN_REVERSION_CALL': 'Mean Reversion — Call Credit Spread',
    'NO_TRADE': 'No Trade',
  };

  return {
    strategy: winnerStrategy,
    displayName: displayNames[winnerStrategy],
    bias,
    confidence,
    confidenceScore,
    tier,
    expectedMoveHigh: Math.round(emHigh * 100) / 100,
    expectedMoveLow: Math.round(emLow * 100) / 100,
    shortStrike,
    longStrike,
    estimatedCredit: Math.round(estimatedCredit * 100) / 100,
    maxRisk: Math.round(maxRisk * 100) / 100,
    pop: Math.round(pop * 1000) / 1000,
    spreadWidth,
    optionType: direction,
    shortDelta: Math.round(shortDelta * 1000) / 1000,
    longDelta:  Math.round(longDelta  * 1000) / 1000,
    shortPremium,
    longPremium,
    impliedVol,
    reasons: winnerReasons,
    warnings: winnerWarnings,
    exitRules: {
      takeProfitPct,
      stopLossMult,
      timeStopMinutes: 15,
      takeProfitDollar: Math.round(estimatedCredit * takeProfitPct * 100) / 100,
      stopLossDollar:   Math.round(estimatedCredit * stopLossMult  * 100) / 100,
    },
  };
}

// ─────────────────────────────────────────────
// Playbook — score all 5 intraday strategies
// ─────────────────────────────────────────────

const STRATEGY_META: Record<string, {
  description: string;
  spreadType: 'put_credit_spread' | 'call_credit_spread' | 'iron_condor';
  entryWindow: string;
  setupConditions: string[];
}> = {
  '0DTE_VOL_CRUSH': {
    description: 'Sell an OTM put credit spread (or iron condor) when IV is elevated and morning volatility is contained. Profit as IV reverts and time value decays.',
    spreadType: 'put_credit_spread',
    entryWindow: '10:30 AM – 1:00 PM ET',
    setupConditions: ['VIX > 16 (IV premium present)', 'SPX near VWAP (< 0.3× EM)', 'RSI 40–60 (neutral / directionless)', 'Morning spike contained below 1σ EM', 'Normal volume — no directional push'],
  },
  '0DTE_DIRECTIONAL_PUT': {
    description: 'Sell a put credit spread below the market on a clear bullish day. Price is trending above VWAP and RSI momentum confirms the up-move.',
    spreadType: 'put_credit_spread',
    entryWindow: '9:45 – 11:00 AM ET · 2:00 – 3:30 PM ET',
    setupConditions: ['Price > VWAP + 0.2× EM (bullish VWAP bias)', 'RSI(5m) > 60 and RSI(15m) > 55', 'Price broke above opening range high', 'Volume confirms breakout (spike OK)'],
  },
  '0DTE_DIRECTIONAL_CALL': {
    description: 'Sell a call credit spread above the market on a clear bearish day. Price is breaking below VWAP with RSI momentum confirming the down-move.',
    spreadType: 'call_credit_spread',
    entryWindow: '9:45 – 11:00 AM ET · 2:00 – 3:30 PM ET',
    setupConditions: ['Price < VWAP – 0.2× EM (bearish VWAP bias)', 'RSI(5m) < 40 and RSI(15m) < 45', 'Price broke below opening range low', 'Volume confirms breakdown (spike OK)'],
  },
  '0DTE_MEAN_REVERSION_PUT': {
    description: 'Sell a put credit spread after a sharp downside overextension. Price has stretched >2% beyond the 1σ expected move low — fade the move, collect credit as it snaps back.',
    spreadType: 'put_credit_spread',
    entryWindow: 'Any time (when stretched condition met)',
    setupConditions: ['Price > 2% below 1σ expected move low', 'RSI(5m) < 25 (oversold extreme)', 'Volume climax / exhaustion candle visible'],
  },
  '0DTE_MEAN_REVERSION_CALL': {
    description: 'Sell a call credit spread after a sharp upside overextension. Price has stretched >2% beyond the 1σ expected move high — fade the move, collect credit on the reversal.',
    spreadType: 'call_credit_spread',
    entryWindow: 'Any time (when stretched condition met)',
    setupConditions: ['Price > 2% above 1σ expected move high', 'RSI(5m) > 75 (overbought extreme)', 'Volume climax / exhaustion candle visible'],
  },
};

export function scoreAllIntradayStrategies(inputs: IntradayInputs): IntradayStrategyAssessment[] {
  const em = calcIntradayEM(inputs.spxPrice, inputs.vix, inputs.minutesRemaining);
  const emHigh = inputs.spxPrice + em;
  const emLow  = inputs.spxPrice - em;
  const impliedVol = inputs.vix / 100;

  const volCrush  = detectVolCrush(inputs, em);
  const dir       = detectDirectional(inputs, em);
  const rev       = detectMeanReversion(inputs, em);

  const takeProfitPct = 0.50;
  const stopLossMult  = 1.5;

  const buildAssessment = (
    strategyId: IntradayStrategyType,
    score: number,
    reasons: string[],
    warnings: string[],
    direction: 'put' | 'call',
    bias: 'bullish' | 'bearish' | 'neutral',
  ): IntradayStrategyAssessment => {
    const meta = STRATEGY_META[strategyId];
    const { tier } = scoreTier(score);
    const { shortStrike, longStrike, spreadWidth } = selectStrikes(
      inputs.spxPrice, inputs.vix, inputs.minutesRemaining, direction, emHigh, emLow,
    );
    const pop = calcIntradayPOP(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining, direction);
    const credit = estimateCredit(inputs.spxPrice, shortStrike, longStrike, inputs.vix, inputs.minutesRemaining);
    const shortDelta = direction === 'put'
      ? 1 - probAboveStrike(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining)
      : probAboveStrike(inputs.spxPrice, shortStrike, inputs.vix, inputs.minutesRemaining);
    const longDelta = direction === 'put'
      ? 1 - probAboveStrike(inputs.spxPrice, longStrike, inputs.vix, inputs.minutesRemaining)
      : probAboveStrike(inputs.spxPrice, longStrike, inputs.vix, inputs.minutesRemaining);
    const longPremium  = Math.round(Math.max(0.05, longDelta  * spreadWidth * 0.35) * 20) / 20;
    const shortPremium = Math.round((credit + longPremium) * 20) / 20;

    return {
      strategyId,
      displayName: {
        '0DTE_VOL_CRUSH': 'Volatility Crush',
        '0DTE_DIRECTIONAL_PUT': 'Directional Put Spread',
        '0DTE_DIRECTIONAL_CALL': 'Directional Call Spread',
        '0DTE_MEAN_REVERSION_PUT': 'Mean Reversion Put',
        '0DTE_MEAN_REVERSION_CALL': 'Mean Reversion Call',
        'NO_TRADE': 'No Trade',
      }[strategyId] ?? strategyId,
      description:      meta.description,
      spreadType:       meta.spreadType,
      bias,
      score,
      tier,
      isViable:         score >= 3 && inputs.minutesRemaining >= 15,
      entryWindow:      meta.entryWindow,
      setupConditions:  meta.setupConditions,
      metConditions:    reasons,
      shortStrike,
      longStrike,
      spreadWidth,
      estimatedCredit:  Math.round(credit * 100) / 100,
      maxRisk:          Math.round((spreadWidth - credit) * 100) / 100,
      pop:              Math.round(pop * 1000) / 1000,
      optionType:       direction,
      shortDelta:       Math.round(shortDelta * 1000) / 1000,
      longDelta:        Math.round(longDelta  * 1000) / 1000,
      shortPremium,
      longPremium,
      impliedVol,
      warnings,
      exitRules: {
        takeProfitPct,
        stopLossMult,
        timeStop: '3:45 PM ET',
        takeProfitDollar: Math.round(credit * takeProfitPct * 100) / 100,
        stopLossDollar:   Math.round(credit * stopLossMult  * 100) / 100,
      },
    };
  };

  const results: IntradayStrategyAssessment[] = [
    buildAssessment('0DTE_VOL_CRUSH',           volCrush.score, volCrush.reasons, volCrush.warnings, 'put', 'neutral'),
    buildAssessment('0DTE_DIRECTIONAL_PUT',      dir.direction === 'bullish' ? dir.score : 0, dir.reasons, dir.warnings, 'put',  'bullish'),
    buildAssessment('0DTE_DIRECTIONAL_CALL',     dir.direction === 'bearish' ? dir.score : 0, dir.reasons, dir.warnings, 'call', 'bearish'),
    buildAssessment('0DTE_MEAN_REVERSION_PUT',   rev.direction === 'fade_low'  ? rev.score : 0, rev.reasons, rev.warnings, 'put',  'bullish'),
    buildAssessment('0DTE_MEAN_REVERSION_CALL',  rev.direction === 'fade_high' ? rev.score : 0, rev.reasons, rev.warnings, 'call', 'bearish'),
  ];

  // Sort: viable first, then by score descending
  return results.sort((a, b) => {
    if (a.isViable !== b.isViable) return a.isViable ? -1 : 1;
    return b.score - a.score;
  });
}
