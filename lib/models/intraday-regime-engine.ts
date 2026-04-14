/**
 * Intraday Regime Engine
 * Classifies the current intraday market state for stocks/ETF day trading.
 * Uses SPY 5-min bars and VIX to determine which strategies are applicable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntradayRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'BREAKOUT_EXPANSION'
  | 'MEAN_REVERTING'
  | 'HIGH_VOL_UNSTABLE'
  | 'NO_TRADE';

export interface IntradayRegimeInputs {
  spyPrice: number;
  spyOpen: number;
  spyVwap: number;
  spyOrbHigh: number;    // Opening range high (first 5-min bar)
  spyOrbLow: number;     // Opening range low (first 5-min bar)
  spyAtr: number;        // ATR on 5-min bars (price points)
  spyRvol: number;       // Relative volume ratio (today / avg at same time)
  vixLevel: number;
  spyEma9: number;
  spyEma20: number;
  minutesSinceOpen: number;
  isMarketOpen: boolean;
}

export interface IntradayRegimeResult {
  regime: IntradayRegime;
  description: string;
  tradeable: boolean;
  biasDirection: 'long' | 'short' | 'neutral';
  regimeStrength: number;        // 0-100
  activeStrategyIds: string[];
  warnings: string[];
}

// ─── Strategy ID lists per regime ────────────────────────────────────────────

const REGIME_STRATEGIES: Record<IntradayRegime, string[]> = {
  TREND_UP:           ['VWAP_TREND', 'RS_LEADER', 'PULLBACK_VWAP', 'ORB'],
  TREND_DOWN:         ['VWAP_TREND', 'RS_LEADER', 'PULLBACK_VWAP'],
  BREAKOUT_EXPANSION: ['ORB', 'BREAKOUT_VOLUME', 'GAP_PLAY', 'VWAP_TREND'],
  MEAN_REVERTING:     ['MEAN_REVERSION', 'PULLBACK_VWAP', 'ETF_PAIRS'],
  RANGE:              ['MEAN_REVERSION', 'ETF_PAIRS', 'PULLBACK_VWAP'],
  HIGH_VOL_UNSTABLE:  ['ETF_PAIRS'],
  NO_TRADE:           [],
};

const REGIME_DESCRIPTIONS: Record<IntradayRegime, string> = {
  TREND_UP:           'SPY above VWAP with EMA alignment. Favor long-side VWAP continuation and RS leaders.',
  TREND_DOWN:         'SPY below VWAP with bearish EMA alignment. Favor short-side continuation and weak laggards.',
  BREAKOUT_EXPANSION: 'Price breaking out of opening range with elevated volume. ORB and breakout-volume setups active.',
  MEAN_REVERTING:     'Oscillating around VWAP with low relative volume. Favor mean-reversion and pullback setups.',
  RANGE:              'No clear directional bias. Price contained within OR and VWAP. Pairs and reversion favored.',
  HIGH_VOL_UNSTABLE:  'Elevated VIX or extreme ATR. Conditions unsafe for most directional day trades. Pairs only with reduced size.',
  NO_TRADE:           'Market closed, pre-market, or within first 5 minutes. No trades active.',
};

// ─── Main Function ────────────────────────────────────────────────────────────

export function classifyIntradayRegime(inputs: IntradayRegimeInputs): IntradayRegimeResult {
  const {
    spyPrice, spyOpen, spyVwap, spyOrbHigh, spyOrbLow,
    spyAtr, spyRvol, vixLevel, spyEma9, spyEma20,
    minutesSinceOpen, isMarketOpen,
  } = inputs;

  const warnings: string[] = [];

  // ── NO_TRADE gates ────────────────────────────────────────────────────────
  if (!isMarketOpen || minutesSinceOpen < 5) {
    return {
      regime: 'NO_TRADE',
      description: REGIME_DESCRIPTIONS.NO_TRADE,
      tradeable: false,
      biasDirection: 'neutral',
      regimeStrength: 0,
      activeStrategyIds: [],
      warnings: ['Market not open or within first 5 minutes — no day trades active.'],
    };
  }

  if (vixLevel > 40) {
    return {
      regime: 'NO_TRADE',
      description: 'VIX > 40 — extreme systemic stress. All day trades suppressed.',
      tradeable: false,
      biasDirection: 'neutral',
      regimeStrength: 0,
      activeStrategyIds: [],
      warnings: ['VIX exceeds 40 — circuit breaker active, no day trades.'],
    };
  }

  // ── HIGH_VOL_UNSTABLE ─────────────────────────────────────────────────────
  const atrPct = spyPrice > 0 ? (spyAtr / spyPrice) * 100 : 0;
  if (vixLevel > 30 || atrPct > 0.8) {
    if (vixLevel > 30) warnings.push(`VIX elevated at ${vixLevel.toFixed(1)} — reduce position size significantly.`);
    if (atrPct > 0.8) warnings.push(`SPY intraday ATR is ${atrPct.toFixed(2)}% — extreme intraday range, pairs only.`);
    return {
      regime: 'HIGH_VOL_UNSTABLE',
      description: REGIME_DESCRIPTIONS.HIGH_VOL_UNSTABLE,
      tradeable: true,
      biasDirection: 'neutral',
      regimeStrength: 30,
      activeStrategyIds: REGIME_STRATEGIES.HIGH_VOL_UNSTABLE,
      warnings,
    };
  }

  // ── Compute key boolean indicators ───────────────────────────────────────
  const priceAboveVwap = spyPrice > spyVwap;
  const ema9AboveEma20 = spyEma9 > spyEma20;
  const priceAboveOrbHigh = spyPrice > spyOrbHigh;
  const priceBelowOrbLow = spyPrice < spyOrbLow;
  const priceInsideOrb = !priceAboveOrbHigh && !priceBelowOrbLow;

  const orbWidth = spyOrbHigh - spyOrbLow;
  const orbWidthPct = spyOpen > 0 ? (orbWidth / spyOpen) * 100 : 0;
  const vwapDist = Math.abs(spyPrice - spyVwap);
  const vwapDistPct = spyVwap > 0 ? (vwapDist / spyVwap) * 100 : 0;

  // Gap detection: if open is significantly away from prior close approximation
  const gapPct = spyOpen > 0 ? Math.abs((spyPrice - spyOpen) / spyOpen) * 100 : 0;

  // ── BREAKOUT_EXPANSION ────────────────────────────────────────────────────
  if ((priceAboveOrbHigh || priceBelowOrbLow) && spyRvol >= 1.5 && minutesSinceOpen >= 5) {
    const direction: 'long' | 'short' = priceAboveOrbHigh ? 'long' : 'short';
    const strength = Math.min(100, 60 + (spyRvol - 1.5) * 20);
    if (vixLevel > 22) warnings.push('Elevated VIX — breakout may be volatile, tighten stops.');
    return {
      regime: 'BREAKOUT_EXPANSION',
      description: REGIME_DESCRIPTIONS.BREAKOUT_EXPANSION,
      tradeable: true,
      biasDirection: direction,
      regimeStrength: Math.round(strength),
      activeStrategyIds: REGIME_STRATEGIES.BREAKOUT_EXPANSION,
      warnings,
    };
  }

  // ── TREND_UP ──────────────────────────────────────────────────────────────
  if (priceAboveVwap && ema9AboveEma20 && !priceBelowOrbLow) {
    const vwapDev = spyVwap > 0 ? (spyPrice - spyVwap) / spyVwap * 100 : 0;
    let strength = 50;
    if (spyRvol > 1.2) strength += 15;
    if (vwapDev > 0.15) strength += 10;
    if (spyRvol > 1.5) strength += 10;
    if (priceAboveOrbHigh) strength += 15;
    strength = Math.min(100, strength);

    if (minutesSinceOpen < 30) warnings.push('First 30 minutes — avoid chasing opens, wait for structure.');
    return {
      regime: 'TREND_UP',
      description: REGIME_DESCRIPTIONS.TREND_UP,
      tradeable: true,
      biasDirection: 'long',
      regimeStrength: Math.round(strength),
      activeStrategyIds: REGIME_STRATEGIES.TREND_UP,
      warnings,
    };
  }

  // ── TREND_DOWN ────────────────────────────────────────────────────────────
  if (!priceAboveVwap && !ema9AboveEma20 && !priceAboveOrbHigh) {
    let strength = 50;
    if (spyRvol > 1.2) strength += 15;
    if (vwapDistPct > 0.15) strength += 10;
    if (spyRvol > 1.5) strength += 10;
    if (priceBelowOrbLow) strength += 15;
    strength = Math.min(100, strength);

    if (minutesSinceOpen < 30) warnings.push('First 30 minutes — avoid shorting into open panic, wait for structure.');
    return {
      regime: 'TREND_DOWN',
      description: REGIME_DESCRIPTIONS.TREND_DOWN,
      tradeable: true,
      biasDirection: 'short',
      regimeStrength: Math.round(strength),
      activeStrategyIds: REGIME_STRATEGIES.TREND_DOWN,
      warnings,
    };
  }

  // ── MEAN_REVERTING ────────────────────────────────────────────────────────
  if (priceInsideOrb && spyRvol < 0.9 && vwapDistPct < 0.2) {
    if (orbWidthPct < 0.15) warnings.push('Very narrow opening range — mean reversion targets may be small.');
    return {
      regime: 'MEAN_REVERTING',
      description: REGIME_DESCRIPTIONS.MEAN_REVERTING,
      tradeable: true,
      biasDirection: 'neutral',
      regimeStrength: 55,
      activeStrategyIds: REGIME_STRATEGIES.MEAN_REVERTING,
      warnings,
    };
  }

  // ── RANGE (fallthrough) ───────────────────────────────────────────────────
  if (orbWidthPct < 0.3) warnings.push('Narrow intraday range — breakout setups have lower conviction.');
  return {
    regime: 'RANGE',
    description: REGIME_DESCRIPTIONS.RANGE,
    tradeable: true,
    biasDirection: 'neutral',
    regimeStrength: 40,
    activeStrategyIds: REGIME_STRATEGIES.RANGE,
    warnings,
  };
}
