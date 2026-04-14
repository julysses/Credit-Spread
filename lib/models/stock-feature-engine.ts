/**
 * Stock Feature Engine
 * Computes intraday technical features from Yahoo Finance OHLCV bars.
 * Used by the stocks/scan API route to score all 8 day-trade strategies.
 */

import type { IntradayRegime } from './intraday-regime-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OHLCVBar {
  timestamp: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolFeatures {
  symbol: string;
  currentPrice: number;
  openPrice: number;
  vwap: number;
  openHigh: number;       // First 5-min bar high
  openLow: number;        // First 5-min bar low
  orbMidpoint: number;
  rvol: number;           // Relative volume ratio
  rs: number;             // Relative strength vs SPY (symbol %chg / spy %chg)
  atr: number;            // ATR(14) in price points
  atrPct: number;         // ATR as % of current price
  ema9: number;
  ema20: number;
  priceVsVwap: number;    // % above/below VWAP
  priceVsOrb: 'above' | 'below' | 'inside';
  dayChangePct: number;   // % change from open
  volumeToday: number;
  barsAvailable: number;
}

export interface StrategyScore {
  strategyId: string;
  strategyName: string;
  score: number;          // 0–100
  tier: 'A' | 'B' | 'C' | 'PASS';
  meetsMinimum: boolean;  // score >= 65
  direction: 'long' | 'short' | 'neutral';
  reasons: string[];
  warnings: string[];
}

export interface TradePlan {
  symbol: string;
  strategyId: string;
  strategyName: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  riskPerUnit: number;
  explanation: string;
  invalidation: string;
  entryConditions: string[];
  exitRules: string[];
}

// ─── Core Indicator Functions ─────────────────────────────────────────────────

export function computeVWAP(bars: OHLCVBar[]): number {
  let cumTPV = 0;
  let cumVol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumTPV += tp * b.volume;
    cumVol += b.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : bars[bars.length - 1]?.close ?? 0;
}

export function computeOpeningRange(
  bars: OHLCVBar[],
  orbBars = 1 // number of 5-min bars to include (1 = first 5 min)
): { high: number; low: number; midpoint: number } {
  const slice = bars.slice(0, orbBars);
  if (slice.length === 0) return { high: 0, low: 0, midpoint: 0 };
  const high = Math.max(...slice.map(b => b.high));
  const low = Math.min(...slice.map(b => b.low));
  return { high, low, midpoint: (high + low) / 2 };
}

export function computeRVOL(
  todayVolume: number,
  avgDailyVolume: number,
  minutesSinceOpen: number
): number {
  if (avgDailyVolume <= 0 || minutesSinceOpen <= 0) return 1;
  // Expected fraction of day elapsed (390 trading minutes)
  const dayFraction = Math.min(minutesSinceOpen / 390, 1);
  const expectedVolume = avgDailyVolume * dayFraction;
  return expectedVolume > 0 ? todayVolume / expectedVolume : 1;
}

export function computeRS(
  symbolOpen: number,
  symbolCurrent: number,
  spyOpen: number,
  spyCurrent: number
): number {
  if (symbolOpen <= 0 || spyOpen <= 0) return 1;
  const symChg = (symbolCurrent - symbolOpen) / symbolOpen;
  const spyChg = (spyCurrent - spyOpen) / spyOpen;
  if (Math.abs(spyChg) < 0.0001) return symChg >= 0 ? 2 : 0.5;
  return symChg / spyChg;
}

export function computeATR(bars: OHLCVBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const b = bars[i];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)));
  }
  const window = trs.slice(-period);
  return window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;
}

export function computeCurrentEMA(bars: OHLCVBar[], period: number): number {
  if (bars.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = bars[0].close;
  for (let i = 1; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
  }
  return ema;
}

// ─── Master Feature Computation ───────────────────────────────────────────────

export function computeSymbolFeatures(
  symbol: string,
  bars: OHLCVBar[],
  spyBars: OHLCVBar[],
  avgDailyVolume: number,
  minutesSinceOpen: number
): SymbolFeatures | null {
  if (bars.length < 3) return null;

  const currentPrice = bars[bars.length - 1].close;
  const openPrice = bars[0].open;
  const vwap = computeVWAP(bars);
  const orb = computeOpeningRange(bars, 1);
  const atr = computeATR(bars, 14);
  const ema9 = computeCurrentEMA(bars, 9);
  const ema20 = computeCurrentEMA(bars, 20);
  const volumeToday = bars.reduce((sum, b) => sum + b.volume, 0);
  const rvol = computeRVOL(volumeToday, avgDailyVolume, minutesSinceOpen);

  const spyCurrent = spyBars.length > 0 ? spyBars[spyBars.length - 1].close : 0;
  const spyOpen = spyBars.length > 0 ? spyBars[0].open : 0;
  const rs = computeRS(openPrice, currentPrice, spyOpen, spyCurrent);

  const priceVsVwap = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;
  const dayChangePct = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

  let priceVsOrb: 'above' | 'below' | 'inside';
  if (currentPrice > orb.high) priceVsOrb = 'above';
  else if (currentPrice < orb.low) priceVsOrb = 'below';
  else priceVsOrb = 'inside';

  return {
    symbol,
    currentPrice,
    openPrice,
    vwap,
    openHigh: orb.high,
    openLow: orb.low,
    orbMidpoint: orb.midpoint,
    rvol,
    rs,
    atr,
    atrPct: currentPrice > 0 ? (atr / currentPrice) * 100 : 0,
    ema9,
    ema20,
    priceVsVwap,
    priceVsOrb,
    dayChangePct,
    volumeToday,
    barsAvailable: bars.length,
  };
}

// ─── Strategy Scorers ─────────────────────────────────────────────────────────

export function scoreVWAPContinuation(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const direction: 'long' | 'short' = f.currentPrice >= f.vwap ? 'long' : 'short';

  // Regime filter
  if (regime === 'NO_TRADE') {
    return { strategyId: 'VWAP_TREND', strategyName: 'VWAP Trend Continuation', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['NO_TRADE regime'], warnings };
  }
  if (regime === 'MEAN_REVERTING' || regime === 'RANGE') score -= 20;
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN' || regime === 'BREAKOUT_EXPANSION') score += 10;

  // Price vs VWAP
  if (direction === 'long' && f.currentPrice > f.vwap) { score += 25; reasons.push('Price above VWAP'); }
  else if (direction === 'short' && f.currentPrice < f.vwap) { score += 25; reasons.push('Price below VWAP'); }

  // EMA alignment
  if (direction === 'long' && f.ema9 > f.ema20) { score += 20; reasons.push('EMA9 > EMA20 (bullish stack)'); }
  else if (direction === 'short' && f.ema9 < f.ema20) { score += 20; reasons.push('EMA9 < EMA20 (bearish stack)'); }
  else warnings.push('EMA alignment does not support direction');

  // RVOL
  if (f.rvol >= 1.5) { score += 20; reasons.push(`RVOL ${f.rvol.toFixed(1)}× (strong)`); }
  else if (f.rvol >= 1.2) { score += 12; reasons.push(`RVOL ${f.rvol.toFixed(1)}× (elevated)`); }
  else warnings.push(`Low RVOL ${f.rvol.toFixed(1)}× — limited conviction`);

  // RS
  if (direction === 'long' && f.rs >= 1.3) { score += 20; reasons.push(`RS ${f.rs.toFixed(2)} vs SPY (leader)`); }
  else if (direction === 'long' && f.rs >= 1.0) { score += 10; reasons.push(`RS ${f.rs.toFixed(2)} vs SPY`); }
  else if (direction === 'short' && f.rs <= 0.7) { score += 20; reasons.push(`RS ${f.rs.toFixed(2)} (laggard)`); }
  else if (direction === 'short' && f.rs <= 1.0) { score += 10; }
  else if (direction === 'long') warnings.push('Underperforming SPY');

  // Not too extended
  const extPct = Math.abs(f.priceVsVwap);
  if (extPct > 1.5) { score -= 15; warnings.push(`Extended ${extPct.toFixed(2)}% from VWAP — risk of reversal`); }
  else if (extPct < 0.05) { score -= 10; warnings.push('Too close to VWAP — no clear entry zone'); }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'VWAP_TREND',
    strategyName: 'VWAP Trend Continuation',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreORB(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const direction: 'long' | 'short' = f.priceVsOrb === 'above' ? 'long' : f.priceVsOrb === 'below' ? 'short' : f.dayChangePct >= 0 ? 'long' : 'short';

  if (regime === 'NO_TRADE') {
    return { strategyId: 'ORB', strategyName: 'Opening Range Breakout', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['NO_TRADE'], warnings };
  }

  // Must be outside OR
  if (f.priceVsOrb === 'inside') {
    return { strategyId: 'ORB', strategyName: 'Opening Range Breakout', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['Price still inside opening range'], warnings };
  }

  score += 35; reasons.push(`Price ${direction === 'long' ? 'above' : 'below'} OR boundary`);

  // Volume
  if (f.rvol >= 1.5) { score += 25; reasons.push(`RVOL ${f.rvol.toFixed(1)}× confirms breakout`); }
  else if (f.rvol >= 1.2) { score += 12; }
  else { warnings.push(`Weak RVOL ${f.rvol.toFixed(1)}× — low-conviction breakout`); score -= 10; }

  // EMA alignment
  if (direction === 'long' && f.ema9 > f.ema20) { score += 15; reasons.push('EMA stack bullish'); }
  else if (direction === 'short' && f.ema9 < f.ema20) { score += 15; reasons.push('EMA stack bearish'); }

  // Regime boost
  if (regime === 'BREAKOUT_EXPANSION') { score += 15; reasons.push('Breakout expansion regime'); }
  else if (regime === 'RANGE' || regime === 'MEAN_REVERTING') { score -= 20; warnings.push('Range regime — breakouts have lower follow-through'); }

  // RS
  if (direction === 'long' && f.rs >= 1.1) { score += 10; reasons.push('Leading SPY'); }
  else if (direction === 'short' && f.rs <= 0.9) { score += 10; }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'ORB',
    strategyName: 'Opening Range Breakout',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreRSLeader(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const direction: 'long' | 'short' = f.rs >= 1.0 ? 'long' : 'short';

  if (regime === 'NO_TRADE') {
    return { strategyId: 'RS_LEADER', strategyName: 'Relative Strength Leader', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['NO_TRADE'], warnings };
  }

  // RS vs SPY
  if (direction === 'long') {
    if (f.rs >= 2.0) { score += 40; reasons.push(`RS ${f.rs.toFixed(2)} — extreme leader`); }
    else if (f.rs >= 1.5) { score += 30; reasons.push(`RS ${f.rs.toFixed(2)} — strong leader`); }
    else if (f.rs >= 1.2) { score += 15; reasons.push(`RS ${f.rs.toFixed(2)} — leading SPY`); }
    else { return { strategyId: 'RS_LEADER', strategyName: 'Relative Strength Leader', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['RS not strong enough (< 1.2)'], warnings }; }
  } else {
    if (f.rs <= 0.3) { score += 40; reasons.push(`RS ${f.rs.toFixed(2)} — extreme laggard`); }
    else if (f.rs <= 0.5) { score += 30; reasons.push(`RS ${f.rs.toFixed(2)} — weak laggard`); }
    else if (f.rs <= 0.8) { score += 15; }
    else { return { strategyId: 'RS_LEADER', strategyName: 'Relative Strength Leader', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['RS not weak enough (> 0.8 for shorts)'], warnings }; }
  }

  // Above/below VWAP
  if (direction === 'long' && f.currentPrice > f.vwap) { score += 20; reasons.push('Above VWAP'); }
  else if (direction === 'short' && f.currentPrice < f.vwap) { score += 20; reasons.push('Below VWAP'); }
  else warnings.push('VWAP not supportive of direction');

  // RVOL
  if (f.rvol >= 1.3) { score += 20; reasons.push(`RVOL ${f.rvol.toFixed(1)}×`); }
  else if (f.rvol >= 1.0) score += 10;
  else warnings.push('Below-average volume');

  // Regime
  if (regime === 'TREND_UP' && direction === 'long') { score += 15; reasons.push('Bullish trend regime'); }
  else if (regime === 'TREND_DOWN' && direction === 'short') { score += 15; reasons.push('Bearish trend regime'); }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'RS_LEADER',
    strategyName: 'Relative Strength Leader',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreBreakoutVolume(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const direction: 'long' | 'short' = f.priceVsOrb === 'above' ? 'long' : f.priceVsOrb === 'below' ? 'short' : f.dayChangePct >= 0 ? 'long' : 'short';

  if (regime === 'NO_TRADE') {
    return { strategyId: 'BREAKOUT_VOLUME', strategyName: 'Breakout with Unusual Volume', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['NO_TRADE'], warnings };
  }

  // Must have significant volume anomaly
  if (f.rvol < 1.5) {
    return { strategyId: 'BREAKOUT_VOLUME', strategyName: 'Breakout with Unusual Volume', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['RVOL < 1.5 — no volume anomaly detected'], warnings };
  }

  if (f.rvol >= 3.0) { score += 40; reasons.push(`RVOL ${f.rvol.toFixed(1)}× — exceptional volume spike`); }
  else if (f.rvol >= 2.0) { score += 30; reasons.push(`RVOL ${f.rvol.toFixed(1)}× — strong unusual volume`); }
  else { score += 20; reasons.push(`RVOL ${f.rvol.toFixed(1)}× — elevated volume`); }

  // Level break
  if (f.priceVsOrb !== 'inside') { score += 20; reasons.push('Breaking OR level with volume'); }

  if (regime === 'BREAKOUT_EXPANSION') { score += 20; reasons.push('Breakout regime'); }
  if (f.rs >= 1.3 && direction === 'long') { score += 15; reasons.push('RS leader on breakout'); }
  else if (f.rs <= 0.7 && direction === 'short') { score += 15; }

  if (f.ema9 > f.ema20 && direction === 'long') score += 10;
  else if (f.ema9 < f.ema20 && direction === 'short') score += 10;
  else warnings.push('EMA stack not supporting direction');

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'BREAKOUT_VOLUME',
    strategyName: 'Breakout with Unusual Volume',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scorePullbackToVWAP(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const direction: 'long' | 'short' = f.ema9 > f.ema20 ? 'long' : 'short';

  if (regime === 'NO_TRADE' || regime === 'RANGE' || regime === 'MEAN_REVERTING') {
    return { strategyId: 'PULLBACK_VWAP', strategyName: 'Pullback to VWAP', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: [`${regime} regime — pullbacks lack follow-through`], warnings };
  }

  // Price near VWAP (within 0.3%)
  const vwapProximity = Math.abs(f.priceVsVwap);
  if (vwapProximity <= 0.15) { score += 35; reasons.push(`Price testing VWAP (${f.priceVsVwap.toFixed(2)}% deviation)`); }
  else if (vwapProximity <= 0.30) { score += 20; reasons.push(`Near VWAP (${f.priceVsVwap.toFixed(2)}%)`); }
  else { return { strategyId: 'PULLBACK_VWAP', strategyName: 'Pullback to VWAP', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['Not near VWAP — not a pullback setup'], warnings }; }

  // EMA trend
  if (f.ema9 > f.ema20) { score += 20; reasons.push('Uptrend confirmed (EMA9 > EMA20)'); }
  else if (f.ema9 < f.ema20) { score += 20; reasons.push('Downtrend confirmed (EMA9 < EMA20)'); }

  if (regime === 'TREND_UP' && direction === 'long') { score += 20; reasons.push('Bullish trend regime'); }
  else if (regime === 'TREND_DOWN' && direction === 'short') { score += 20; reasons.push('Bearish trend regime'); }

  if (f.rvol >= 1.2) { score += 15; reasons.push(`RVOL ${f.rvol.toFixed(1)}×`); }
  else warnings.push('Low volume on pullback — wait for reversal candle');

  if (direction === 'long' && f.rs >= 1.1) { score += 10; reasons.push('Leading SPY'); }
  else if (direction === 'short' && f.rs <= 0.9) { score += 10; }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'PULLBACK_VWAP',
    strategyName: 'Pullback to VWAP',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreMeanReversion(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // Only valid in range/reversion regimes
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN' || regime === 'BREAKOUT_EXPANSION' || regime === 'NO_TRADE') {
    return { strategyId: 'MEAN_REVERSION', strategyName: 'Mean Reversion Extension', score: 0, tier: 'PASS', meetsMinimum: false, direction: 'neutral', reasons: [`${regime} not suitable for mean reversion`], warnings };
  }

  const extension = Math.abs(f.priceVsVwap);
  const direction: 'long' | 'short' = f.priceVsVwap < 0 ? 'long' : 'short';

  // Must be extended
  if (extension < 0.5) {
    return { strategyId: 'MEAN_REVERSION', strategyName: 'Mean Reversion Extension', score: 0, tier: 'PASS', meetsMinimum: false, direction, reasons: ['Not sufficiently extended from VWAP (< 0.5%)'], warnings };
  }

  if (extension >= 2.0) { score += 40; reasons.push(`Extreme extension ${extension.toFixed(2)}% from VWAP`); }
  else if (extension >= 1.0) { score += 25; reasons.push(`Extended ${extension.toFixed(2)}% from VWAP`); }
  else { score += 15; reasons.push(`Moderate extension ${extension.toFixed(2)}% from VWAP`); }

  if (regime === 'MEAN_REVERTING') { score += 20; reasons.push('Mean-reverting regime confirmed'); }
  else if (regime === 'RANGE') { score += 15; reasons.push('Range regime supports reversion'); }

  // ATR filter — not in ultra-high-vol environment
  if (f.atrPct > 1.0) { score -= 20; warnings.push('High ATR — reversion targets unpredictable'); }
  else { score += 10; }

  // Low RVOL is fine for mean reversion
  if (f.rvol < 0.8) { score += 10; reasons.push('Low volume — exhaustion signal'); }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'MEAN_REVERSION',
    strategyName: 'Mean Reversion Extension',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreGapPlay(f: SymbolFeatures, regime: IntradayRegime): StrategyScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (regime === 'NO_TRADE') {
    return { strategyId: 'GAP_PLAY', strategyName: 'Gap Continuation / Fade', score: 0, tier: 'PASS', meetsMinimum: false, direction: 'long', reasons: ['NO_TRADE'], warnings };
  }

  const gapPct = Math.abs(f.dayChangePct);
  if (gapPct < 0.5) {
    return { strategyId: 'GAP_PLAY', strategyName: 'Gap Continuation / Fade', score: 0, tier: 'PASS', meetsMinimum: false, direction: 'long', reasons: ['Gap too small (< 0.5%) — not a gap setup'], warnings };
  }

  const isUpGap = f.dayChangePct > 0;
  let direction: 'long' | 'short';

  // Classify gap as continuation or fade
  if (gapPct >= 2.0 && f.rvol >= 1.5 && f.priceVsOrb === 'above' && isUpGap) {
    // Gap continuation long
    direction = 'long';
    score += 35; reasons.push(`Gap up ${gapPct.toFixed(1)}% with volume — continuation`);
    if (f.rvol >= 2.0) { score += 15; reasons.push(`RVOL ${f.rvol.toFixed(1)}× strong`); }
  } else if (gapPct >= 2.0 && f.rvol >= 1.5 && f.priceVsOrb === 'below' && !isUpGap) {
    // Gap continuation short
    direction = 'short';
    score += 35; reasons.push(`Gap down ${gapPct.toFixed(1)}% with volume — continuation`);
  } else if (gapPct >= 1.0 && f.priceVsOrb === 'inside') {
    // Gap fade — OR forming inside gap
    direction = isUpGap ? 'short' : 'long';
    score += 25; reasons.push(`Gap ${isUpGap ? 'up' : 'down'} ${gapPct.toFixed(1)}% fading — price inside OR`);
    warnings.push('Gap fade — risk of trend continuation if OR breaks');
  } else {
    direction = isUpGap ? 'long' : 'short';
    score += 15;
    warnings.push('Gap structure unclear — wait for OR to form');
  }

  if (f.rs >= 1.3 && direction === 'long') { score += 15; reasons.push('Leading SPY on gap'); }
  else if (f.rs <= 0.7 && direction === 'short') { score += 15; }

  if (regime === 'BREAKOUT_EXPANSION') score += 10;
  else if (regime === 'RANGE') score -= 10;

  const clamped = Math.max(0, Math.min(100, score));
  return {
    strategyId: 'GAP_PLAY',
    strategyName: 'Gap Continuation / Fade',
    score: clamped,
    tier: clamped >= 85 ? 'A' : clamped >= 75 ? 'B' : clamped >= 65 ? 'C' : 'PASS',
    meetsMinimum: clamped >= 65,
    direction,
    reasons,
    warnings,
  };
}

export function scoreAllStrategies(f: SymbolFeatures, regime: IntradayRegime): StrategyScore[] {
  return [
    scoreVWAPContinuation(f, regime),
    scoreORB(f, regime),
    scoreRSLeader(f, regime),
    scoreBreakoutVolume(f, regime),
    scorePullbackToVWAP(f, regime),
    scoreMeanReversion(f, regime),
    scoreGapPlay(f, regime),
  ].sort((a, b) => b.score - a.score);
}

// ─── Trade Plan Generator ─────────────────────────────────────────────────────

export function generateTradePlan(
  f: SymbolFeatures,
  best: StrategyScore
): TradePlan {
  const dir = best.direction === 'short' ? 'short' : 'long';
  const entry = f.currentPrice;
  const atrStop = f.atr > 0 ? f.atr : entry * 0.005;

  let stopLoss: number;
  let target1: number;
  let target2: number;
  let explanation: string;
  let invalidation: string;
  const entryConditions: string[] = [...best.reasons];
  const exitRules: string[] = [];

  if (dir === 'long') {
    stopLoss = parseFloat((entry - atrStop).toFixed(2));
    target1 = parseFloat((entry + atrStop * 1.5).toFixed(2));
    target2 = parseFloat((entry + atrStop * 2.5).toFixed(2));
    explanation = `${best.strategyName} long setup on ${f.symbol}. Price ${f.priceVsVwap >= 0 ? 'above' : 'near'} VWAP at ${f.vwap.toFixed(2)}, RS vs SPY ${f.rs.toFixed(2)}, RVOL ${f.rvol.toFixed(1)}×. Score: ${best.score}/100 (${best.tier}).`;
    invalidation = `Invalidated if price closes below VWAP (${f.vwap.toFixed(2)}) or stop at ${stopLoss.toFixed(2)} is breached on a closing bar.`;
    exitRules.push(`Take partial at T1 ${target1.toFixed(2)} (1.5R)`, `Trail stop to entry at T1 hit`, `Target T2 ${target2.toFixed(2)} (2.5R) with runner`, `Exit by 3:45 PM ET regardless`);
  } else {
    stopLoss = parseFloat((entry + atrStop).toFixed(2));
    target1 = parseFloat((entry - atrStop * 1.5).toFixed(2));
    target2 = parseFloat((entry - atrStop * 2.5).toFixed(2));
    explanation = `${best.strategyName} short setup on ${f.symbol}. Price ${f.priceVsVwap < 0 ? 'below' : 'near'} VWAP at ${f.vwap.toFixed(2)}, RS vs SPY ${f.rs.toFixed(2)} (laggard), RVOL ${f.rvol.toFixed(1)}×. Score: ${best.score}/100 (${best.tier}).`;
    invalidation = `Invalidated if price reclaims VWAP (${f.vwap.toFixed(2)}) or stop at ${stopLoss.toFixed(2)} is breached.`;
    exitRules.push(`Cover partial at T1 ${target1.toFixed(2)} (1.5R)`, `Trail stop to entry at T1 hit`, `Target T2 ${target2.toFixed(2)} (2.5R) with runner`, `Exit by 3:45 PM ET regardless`);
  }

  const riskPerUnit = Math.abs(entry - stopLoss);
  const reward1 = Math.abs(entry - target1);
  const rr = riskPerUnit > 0 ? parseFloat((reward1 / riskPerUnit).toFixed(2)) : 1.5;

  return {
    symbol: f.symbol,
    strategyId: best.strategyId,
    strategyName: best.strategyName,
    direction: dir,
    entry,
    stopLoss,
    target1,
    target2,
    riskRewardRatio: rr,
    riskPerUnit,
    explanation,
    invalidation,
    entryConditions,
    exitRules,
  };
}
