/**
 * Options Strategy Selector
 * Selects applicable options strategies based on regime, composite score, and IVR.
 * Includes the full 16-strategy catalog (8 day trade + 8 swing).
 */

import type { FourRegime } from './regime-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OptionsStrategyId =
  | 'GEX_IRON_CONDOR'
  | 'GEX_DIRECTIONAL_DEBIT'
  | 'ORB_OPTIONS'
  | 'VWAP_OPTIONS'
  | 'VOLUME_PROFILE'
  | 'INTERNALS_FILTER'
  | 'LIQUIDITY_SWEEP'
  | 'BUTTERFLY_PIN'
  | 'RSI2_MEAN_REVERSION'
  | 'EARNINGS_VOL_CRUSH'
  | 'PEAD'
  | 'MOMENTUM_VCP'
  | 'SEASONALITY'
  | 'FAILED_BREAKOUT'
  | 'PREARNINGS_CALENDAR'
  | 'EMA_RECLAIM';

export type StrategyCategory = 'options_day_trade' | 'options_swing';

export interface OptionsStrategy {
  id: OptionsStrategyId;
  name: string;
  category: StrategyCategory;
  idealRegimes: FourRegime[];
  idealScoreRange: [number, number];
  ivrRange: [number, number];
  structure: string;
  dteSuggested: string;
  description: string;
  entryConditions: string[];
  exitRules: string[];
  deltaTarget: string;
}

export interface StrategySelectionResult {
  activeStrategies: OptionsStrategy[];
  inactiveStrategies: OptionsStrategy[];
  topDayTradeRecommendation: OptionsStrategy | null;
  topSwingRecommendation: OptionsStrategy | null;
  regimeRationale: string;
}

export interface StructureDecision {
  label: string;
  direction: 'neutral' | 'bullish' | 'bearish';
  structure: string;
  deltaTarget: string;
  dteSuggested: string;
  note: string;
}

// ─── Strategy Catalog ─────────────────────────────────────────────────────────

export const STRATEGY_CATALOG: OptionsStrategy[] = [
  // ── Day Trade Strategies ──────────────────────────────────────────────────
  {
    id: 'GEX_IRON_CONDOR',
    name: '0DTE GEX Iron Condor',
    category: 'options_day_trade',
    idealRegimes: ['RANGE_BOUND'],
    idealScoreRange: [-1.5, 1.5],
    ivrRange: [30, 100],
    structure: 'Iron Condor',
    dteSuggested: '0 DTE',
    deltaTarget: '10–16Δ short strikes',
    description:
      'Sell premium in positive-gamma, range-bound environments. Short strikes placed beyond Put/Call Wall levels. Highest-priority 0DTE strategy.',
    entryConditions: [
      'Positive GEX (gamma flip above market)',
      'Enter after 10:00 AM ET',
      'SPX within 0.5% of prior day close',
      'VIX not spiking > 3pts intraday',
      'Score between -1.5 and +1.5',
    ],
    exitRules: [
      'Profit target: 50% of credit collected',
      'Stop: 2× credit per side breached',
      'Hard exit: 3:30 PM ET',
      'Emergency exit: VIX spikes > 3pts intraday',
    ],
  },
  {
    id: 'GEX_DIRECTIONAL_DEBIT',
    name: '0DTE GEX Directional Debit Spread',
    category: 'options_day_trade',
    idealRegimes: ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING', 'RANGE_BOUND'],
    idealScoreRange: [-5, -1.5],
    ivrRange: [0, 100],
    structure: 'Debit Spread',
    dteSuggested: '0–1 DTE',
    deltaTarget: '0.40–0.55Δ long leg',
    description:
      'Directional debit spread when GEX is negative or composite score signals strong directional conviction. Captures trend-day moves.',
    entryConditions: [
      'Negative GEX or strong composite score (> |1.5|)',
      'Trending/breakout regime confirmed',
      'ATM debit spread in direction of score',
      'ORB breakout confirmation or VWAP rejection signal',
    ],
    exitRules: [
      'Profit target: 100% of premium paid',
      'Stop loss: 50% of premium paid',
      'Time stop: close by 3:45 PM ET',
    ],
  },
  {
    id: 'ORB_OPTIONS',
    name: 'Opening Range Breakout (Options)',
    category: 'options_day_trade',
    idealRegimes: ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING', 'RANGE_BOUND'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 100],
    structure: 'ATM Debit Spread',
    dteSuggested: '0 DTE',
    deltaTarget: '0.45–0.55Δ',
    description:
      'Options-translated ORB. Buy ATM call/put debit spread after 30-minute ORB breakout with volume confirmation.',
    entryConditions: [
      '5-min candle close beyond 30-min OR boundary',
      'OR width between 0.2% and 0.5%',
      'RVOL > 1.5× on breakout bar',
      'VWAP aligned with breakout direction',
    ],
    exitRules: [
      'Target: 100% debit paid',
      'Stop: close back inside OR (price-based)',
      'Time stop: 2:00 PM ET if not at target',
    ],
  },
  {
    id: 'VWAP_OPTIONS',
    name: 'VWAP Pullback / Rejection (Options)',
    category: 'options_day_trade',
    idealRegimes: ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 100],
    structure: 'ATM Debit Spread',
    dteSuggested: '0 DTE',
    deltaTarget: '0.40–0.50Δ',
    description:
      'Options spread entry on VWAP pullback in trend or VWAP 2-sigma mean-reversion fade. Requires volume confirmation and candle structure.',
    entryConditions: [
      'Price within 0.15% of VWAP',
      'Reversal candle or continuation candle at VWAP',
      'Composite score supports direction',
      'RVOL > 1.2 at entry bar',
    ],
    exitRules: [
      'Target: next VWAP extension band (+1σ)',
      'Stop: VWAP breach with closing candle',
      'Time stop: 3:30 PM ET',
    ],
  },
  {
    id: 'VOLUME_PROFILE',
    name: 'Volume Profile Setups (Options)',
    category: 'options_day_trade',
    idealRegimes: ['RANGE_BOUND', 'RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 100],
    structure: 'ATM Debit Spread / Credit Spread at VAH/VAL',
    dteSuggested: '0 DTE',
    deltaTarget: '0.40–0.50Δ (debit) / 0.10–0.16Δ (credit)',
    description:
      'Trade 80% Rule (price returns to value area after breakout) or POC bounces. Credit spreads at VAH/VAL in range environments.',
    entryConditions: [
      'Price re-entering value area after breakout (80% Rule)',
      'POC as magnet target in directional trade',
      'Volume profile shows clear high-volume nodes',
    ],
    exitRules: [
      'Target: POC or opposite side of value area',
      'Stop: 50% premium loss',
      'Time stop: 3:00 PM ET',
    ],
  },
  {
    id: 'INTERNALS_FILTER',
    name: 'Market Internals Trend Day Filter',
    category: 'options_day_trade',
    idealRegimes: ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, -2, ],
    ivrRange: [0, 100],
    structure: 'ATM Debit Spread',
    dteSuggested: '0 DTE',
    deltaTarget: '0.45–0.55Δ',
    description:
      'Uses TICK, ADD, VOLD breadth internals to confirm trend day. Sustained extreme TICK/ADD readings confirm one-directional momentum for large debit spread.',
    entryConditions: [
      'TICK sustained above +800 (bull trend) or below -800 (bear trend)',
      'ADD above +1500 or below -1500',
      'VOLD showing directional conviction',
      'Composite score > 1.5 or < -1.5',
    ],
    exitRules: [
      'Hold through day if internals maintain direction',
      'Exit on TICK reversal to opposite extreme',
      'Close by 3:30 PM ET',
    ],
  },
  {
    id: 'LIQUIDITY_SWEEP',
    name: 'Liquidity Sweep Reversal',
    category: 'options_day_trade',
    idealRegimes: ['RANGE_BOUND', 'RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 100],
    structure: 'ATM Debit Spread',
    dteSuggested: '0–1 DTE',
    deltaTarget: '0.45–0.55Δ',
    description:
      'Detect equal highs/lows liquidity sweep, wick beyond level with failure to close, then trade the BOS/CHoCH retracement.',
    entryConditions: [
      'Sweep of equal highs or equal lows',
      'Candle wicks beyond level, closes back inside',
      'Break of Structure (BOS) or Change of Character (CHoCH) confirmed',
      'FVG (Fair Value Gap) forms on retracement',
    ],
    exitRules: [
      'Target: prior session high/low or next liquidity level',
      'Stop: beyond sweep wick',
      'Time stop: 3:30 PM ET',
    ],
  },
  {
    id: 'BUTTERFLY_PIN',
    name: '0DTE Butterfly at Pin Levels',
    category: 'options_day_trade',
    idealRegimes: ['RANGE_BOUND'],
    idealScoreRange: [-1.5, 1.5],
    ivrRange: [0, 100],
    structure: 'Butterfly',
    dteSuggested: '0 DTE',
    deltaTarget: 'ATM centered, $5–$10 wings',
    description:
      'Profit from pinning at max pain, highest net gamma, or POC levels. Enter when directional bias is established mid-day.',
    entryConditions: [
      'Enter between 11:00 AM and 2:00 PM ET',
      'Centered on max pain / highest net-gamma strike / POC',
      'Low composite score (-1.5 to +1.5)',
      'Low intraday range (price compressing)',
    ],
    exitRules: [
      'Target: 50–100% of debit paid',
      'Stop: 50% of debit paid (full loss)',
      'Must exit by 3:45 PM ET',
    ],
  },

  // ── Swing Strategies ──────────────────────────────────────────────────────
  {
    id: 'RSI2_MEAN_REVERSION',
    name: 'RSI(2) Mean Reversion',
    category: 'options_swing',
    idealRegimes: ['RANGE_BOUND', 'RISK_ON_TRENDING'],
    idealScoreRange: [0, 5],
    ivrRange: [0, 60],
    structure: 'ATM Call Debit Spread / Bull Put Spread',
    dteSuggested: '10–21 DTE',
    deltaTarget: '0.40–0.55Δ (debit) / 0.16–0.30Δ (credit)',
    description:
      'Highest-priority swing strategy. Buy in price above 200-day SMA with RSI(2) ≤ 10. Mean reversion to 5-day SMA or RSI(2) > 65.',
    entryConditions: [
      'Price above 200-day SMA',
      'RSI(2) ≤ 10 (standard) or ≤ 5 (aggressive)',
      'Price below 5-day SMA',
      'Composite score > 0 (macro supports longs)',
      'Optional: IBS < 0.25 or Bollinger lower band touch',
    ],
    exitRules: [
      'Exit when price closes above 5-day SMA',
      'Exit when RSI(2) > 65',
      'Stop: 2× ATR(10) below entry (practical stop)',
    ],
  },
  {
    id: 'EARNINGS_VOL_CRUSH',
    name: 'Earnings Volatility Crush',
    category: 'options_swing',
    idealRegimes: ['RANGE_BOUND', 'RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [50, 100],
    structure: 'Short Iron Condor',
    dteSuggested: '7–14 DTE (closest weekly after earnings)',
    deltaTarget: '16Δ short strikes, $5–$10 wings',
    description:
      'Sell premium before earnings when IVR > 50–70. Collect credit around the expected move and profit from IV crush post-announcement.',
    entryConditions: [
      'Enter 1–3 days before earnings',
      'IVR ≥ 50 (prefer 60–70+)',
      'Short strikes at 16Δ beyond expected move',
      'Liquid options chain (tight bid/ask)',
      'Compare implied move vs historical average move',
    ],
    exitRules: [
      'Profit target: 50% of credit collected',
      'Stop: 200% of credit per side',
      'Close remaining by 2 days after earnings',
    ],
  },
  {
    id: 'PEAD',
    name: 'Post-Earnings Announcement Drift (PEAD)',
    category: 'options_swing',
    idealRegimes: ['RISK_ON_TRENDING', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 50],
    structure: 'ATM Debit Spread',
    dteSuggested: '10–14 DTE',
    deltaTarget: '0.45–0.55Δ',
    description:
      'Trade directional drift after earnings release. Enter after IV crush. Hold 5–10 trading days to capture analyst/fund re-positioning.',
    entryConditions: [
      'Enter 1 day after earnings (after IV crush)',
      'Price move in one direction post-earnings',
      'Top or bottom SUE (Standardized Unexpected Earnings) decile preferred',
      'Composite score aligned with post-earnings direction',
    ],
    exitRules: [
      'Hold 5–10 trading days',
      'Target: ATM debit × 2 (100% gain)',
      'Stop: 40% of premium paid lost',
    ],
  },
  {
    id: 'MOMENTUM_VCP',
    name: 'Momentum Continuation / VCP Breakout',
    category: 'options_swing',
    idealRegimes: ['RISK_ON_TRENDING'],
    idealScoreRange: [1.5, 5],
    ivrRange: [0, 50],
    structure: 'Call Debit Spread / Long Call',
    dteSuggested: '30–45 DTE',
    deltaTarget: '0.30–0.45Δ',
    description:
      'Minervini trend template: above all key MAs in proper order. VCP: 2–6 contractions with decreasing volatility. Buy breakout with volume.',
    entryConditions: [
      'Price above 50-day and 200-day SMA',
      'All MAs in proper bull sequence',
      '200-day MA trending up',
      'Within 10–15% of 52-week high',
      'RS line leading price (Relative Strength)',
      'VCP: decreasing vol and depth on contractions',
      'Breakout on 2–3× average volume',
    ],
    exitRules: [
      'Target: 20–25% gain on spread or measured move',
      'Stop: below VCP pivot low (2× ATR rule)',
      'Trail stop as price advances',
    ],
  },
  {
    id: 'SEASONALITY',
    name: 'Seasonality Overlay',
    category: 'options_swing',
    idealRegimes: ['RISK_ON_TRENDING', 'RANGE_BOUND', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 100],
    structure: 'Score Modifier (not standalone)',
    dteSuggested: 'Applied to primary strategy DTE',
    deltaTarget: 'Follows primary strategy',
    description:
      'Seasonal patterns applied as score modifiers to existing strategies. Turn-of-month, Santa Rally, and OpEx effects. Adjust size/direction but not standalone trigger.',
    entryConditions: [
      'Turn of Month (last 3 / first 5 days): adds +0.5 to bullish score',
      'Santa Rally (Dec 24–Jan 2): bullish score boost',
      'OpEx Friday: reduce net short gamma exposure; de-risk into close',
      'FOMC days: prefer defined-risk structures; no naked short',
    ],
    exitRules: [
      'Follows primary strategy exit rules',
      'Reduce risk day before seasonal inflection',
    ],
  },
  {
    id: 'FAILED_BREAKOUT',
    name: 'Failed Breakout / Breakdown Reversal',
    category: 'options_swing',
    idealRegimes: ['RANGE_BOUND', 'RISK_OFF_TRENDING'],
    idealScoreRange: [-5, 5],
    ivrRange: [0, 60],
    structure: 'ATM Debit Spread',
    dteSuggested: '30–45 DTE',
    deltaTarget: '0.40–0.50Δ',
    description:
      'Trade the failure of a breakout or breakdown. Requires clean level break, low volume, fast reclaim, and reversal candle with stronger-than-break volume.',
    entryConditions: [
      'Clear support or resistance level breached',
      'Breakout bar has low/average volume (weak hands)',
      'Fast reclaim of level within 1–3 bars',
      'Reversal candle with stronger volume than break bar',
      'Composite score does not contradict direction of reversal',
    ],
    exitRules: [
      'Target: 50% of width or prior consolidation high/low',
      'Stop: beyond the failed breakout wick',
      'Hold up to 10 trading days',
    ],
  },
  {
    id: 'PREARNINGS_CALENDAR',
    name: 'Pre-Earnings IV Expansion Calendar',
    category: 'options_swing',
    idealRegimes: ['RANGE_BOUND', 'RISK_ON_TRENDING'],
    idealScoreRange: [-2, 5],
    ivrRange: [0, 50],
    structure: 'ATM Calendar Spread',
    dteSuggested: 'Short: post-earnings week; Long: 4–6 weeks out',
    deltaTarget: '0.50Δ ATM',
    description:
      'Enter calendar 1–5 days before earnings when IV Rank is low. Long leg holds value while short leg expires worthless with IV expansion benefits. Exit before earnings.',
    entryConditions: [
      'IV Rank < 50 at entry (low vol environment)',
      'Expected move > historical average (vol expansion likely)',
      'Enter 1–5 trading days before earnings',
      'Liquid options chain (< $0.05 bid/ask spread on ATM)',
    ],
    exitRules: [
      'Exit 1 day before earnings (before IV explosion)',
      'Target: 15–30% of debit paid',
      'Stop: 20% of debit paid lost',
    ],
  },
  {
    id: 'EMA_RECLAIM',
    name: 'EMA Reclaim / Relative Strength Rotation',
    category: 'options_swing',
    idealRegimes: ['RISK_ON_TRENDING', 'RANGE_BOUND'],
    idealScoreRange: [0.5, 5],
    ivrRange: [0, 50],
    structure: 'Bull Call Spread / Long Call',
    dteSuggested: '30–45 DTE',
    deltaTarget: '0.35–0.50Δ',
    description:
      'Buy confirmed EMA reclaims (20/50-day) in established uptrends. Pair with RS rotation — buy top RS sector/name as market leadership shifts.',
    entryConditions: [
      'Price reclaims 20-day or 50-day EMA with bullish candle close',
      'Confirmed uptrend (200 MA rising, price > 200 MA)',
      'Bullish candle close above EMA on above-average volume',
      'Sector RS rank in top quartile',
      'Composite score > 0.5',
    ],
    exitRules: [
      'Target: prior high or measured move (1.5–2× risk)',
      'Stop: 2 ATR below EMA reclaim candle low',
      'Exit if price closes back below EMA for 2 consecutive days',
    ],
  },
];

// ─── Strategy Selection ───────────────────────────────────────────────────────

const REGIME_RATIONALE: Record<FourRegime, string> = {
  RISK_ON_TRENDING:  'Bull regime — favor directional debit spreads, momentum long setups, and ORB breakouts. Full strategy menu active with larger sizing.',
  RISK_OFF_TRENDING: 'Bear regime — favor put debits, bear call spreads, and short-side directional structures. Iron condors suppressed. Sizing at 40–70%.',
  RANGE_BOUND:       'Range/neutral regime — favor premium selling (condors, butterflies), mean-reversion swing, and RSI(2) setups. Balanced sizing at 80%.',
  CRISIS:            'Crisis/extreme volatility — only wide defined-risk structures allowed. Most strategies suppressed. Sizing at 0–20%.',
};

export function selectOptionsStrategies(
  regime: FourRegime,
  compositeScore: number,
  ivr: number
): StrategySelectionResult {
  const activeStrategies: OptionsStrategy[] = [];
  const inactiveStrategies: OptionsStrategy[] = [];

  for (const strategy of STRATEGY_CATALOG) {
    const regimeMatch = strategy.idealRegimes.includes(regime);
    const scoreInRange =
      compositeScore >= strategy.idealScoreRange[0] &&
      compositeScore <= strategy.idealScoreRange[1];
    const ivrInRange = ivr >= strategy.ivrRange[0] && ivr <= strategy.ivrRange[1];

    // Crisis suppresses almost everything except defined-risk structures
    if (regime === 'CRISIS') {
      const crisisAllowed = ['EARNINGS_VOL_CRUSH', 'RSI2_MEAN_REVERSION', 'BUTTERFLY_PIN'];
      if (crisisAllowed.includes(strategy.id) && strategy.structure.includes('Iron') ||
          crisisAllowed.includes(strategy.id) || strategy.structure.includes('Butterfly')) {
        inactiveStrategies.push(strategy);
      } else {
        inactiveStrategies.push(strategy);
      }
      continue;
    }

    if (regimeMatch && (scoreInRange || ivrInRange)) {
      activeStrategies.push(strategy);
    } else {
      inactiveStrategies.push(strategy);
    }
  }

  const activeDayTrade = activeStrategies.filter(s => s.category === 'options_day_trade');
  const activeSwing = activeStrategies.filter(s => s.category === 'options_swing');

  return {
    activeStrategies,
    inactiveStrategies,
    topDayTradeRecommendation: activeDayTrade[0] ?? null,
    topSwingRecommendation: activeSwing[0] ?? null,
    regimeRationale: REGIME_RATIONALE[regime],
  };
}

// ─── IVR Structure Decision Matrix ───────────────────────────────────────────

export function getStructureMatrix(ivr: number, regime: FourRegime): StructureDecision[] {
  const matrix: StructureDecision[] = [];

  if (ivr > 50) {
    matrix.push(
      { label: 'High IVR > 50 — Bullish', direction: 'bullish', structure: 'Bull Put Credit Spread / Jade Lizard', deltaTarget: '0.20–0.30Δ short put', dteSuggested: '35–49 DTE', note: 'Sell premium directionally; defined risk.' },
      { label: 'High IVR > 50 — Bearish', direction: 'bearish', structure: 'Bear Call Credit Spread', deltaTarget: '0.20–0.30Δ short call', dteSuggested: '35–49 DTE', note: 'Sell premium; collect at resistance.' },
      { label: 'High IVR > 50 — Neutral', direction: 'neutral', structure: 'Iron Condor / Iron Butterfly', deltaTarget: '0.16Δ both sides (condor)', dteSuggested: '35–49 DTE', note: 'Collect 1/3 width; manage at 50% profit or 21 DTE.' },
    );
  } else if (ivr >= 30) {
    matrix.push(
      { label: 'Mid IVR 30–50 — Bullish', direction: 'bullish', structure: 'Bull Call Debit Spread / Bullish Diagonal', deltaTarget: '0.35–0.50Δ long leg', dteSuggested: '30–60 DTE', note: 'Buy directional premium at reasonable vol.' },
      { label: 'Mid IVR 30–50 — Bearish', direction: 'bearish', structure: 'Bear Put Debit Spread / Bearish Diagonal', deltaTarget: '0.35–0.50Δ long put', dteSuggested: '30–60 DTE', note: 'Debit spread captures directional move.' },
      { label: 'Mid IVR 30–50 — Neutral', direction: 'neutral', structure: 'Calendar Spread', deltaTarget: '0.50Δ ATM', dteSuggested: 'Short: 30–45 / Long: 60–90 DTE', note: 'Sell near-term, buy back-month at same strike.' },
    );
  } else {
    matrix.push(
      { label: 'Low IVR < 30 — Bullish', direction: 'bullish', structure: 'Bull Call Debit Spread / Long Call', deltaTarget: '0.40–0.55Δ', dteSuggested: '45–90 DTE', note: 'Cheap premium; buy directional. Consider PMCC for income.' },
      { label: 'Low IVR < 30 — Bearish', direction: 'bearish', structure: 'Bear Put Debit Spread / Long Put', deltaTarget: '0.40–0.55Δ', dteSuggested: '45–90 DTE', note: 'Low IV = cheap puts; buy directional.' },
      { label: 'Low IVR < 30 — Neutral', direction: 'neutral', structure: 'Long Butterfly / Calendar', deltaTarget: '0.50Δ ATM wings ±$10–$20', dteSuggested: '30–60 DTE', note: 'Long butterfly profits from low realized vol into expiry.' },
    );
  }

  // Crisis override
  if (regime === 'CRISIS') {
    return [
      { label: 'CRISIS MODE', direction: 'neutral', structure: 'Wide Iron Condor / Defined-Risk Only', deltaTarget: '0.05–0.10Δ (very far OTM)', dteSuggested: '21–45 DTE', note: 'Extreme caution. 0–20% normal sizing only.' },
    ];
  }

  return matrix;
}
