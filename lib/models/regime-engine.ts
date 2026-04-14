/**
 * Four-Regime Model Engine
 * Computes composite directional score (-5 to +5) from 10 weighted z-scores
 * and classifies market into one of four macro regimes.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FourRegime =
  | 'RISK_ON_TRENDING'
  | 'RISK_OFF_TRENDING'
  | 'RANGE_BOUND'
  | 'CRISIS';

export interface RegimeInputs {
  spxPrice?: number | null;
  spx200sma?: number | null;
  breadthPctAbove200?: number | null;
  hySpreadBps?: number | null;
  vixLevel?: number | null;
  gexValue?: number | null;
  pcrValue?: number | null;
  vvixLevel?: number | null;
  dxyLevel?: number | null;
  wti4wkChangePct?: number | null;
  goldWeeklyChangePct?: number | null;
}

export interface ComponentScores {
  spxVs200sma: number;
  breadth: number;
  hyCreditSpreads: number;
  vix: number;
  gex: number;
  putCallRatio: number;
  vvix: number;
  dxy: number;
  wtiVelocity: number;
  goldVelocity: number;
}

export interface RegimeEngineResult {
  regime: FourRegime;
  compositeScore: number;
  componentScores: ComponentScores;
  confidence: 'high' | 'medium' | 'low';
  regimeDescription: string;
  dataQuality: number;
  bullishSignals: number;
  bearishSignals: number;
}

// ─── Reference ranges for z-score normalization (63-day rolling approximations) ──

const SIGNAL_PARAMS = {
  spxVs200sma:       { mean: 0,   std: 4.5,  weight: 1.5, invert: false },
  breadth:           { mean: 55,  std: 15,   weight: 1.3, invert: false },
  hySpreadBps:       { mean: 350, std: 100,  weight: 1.3, invert: true  },
  vix:               { mean: 18,  std: 7,    weight: 1.2, invert: true  },
  gex:               { mean: 0,   std: 5e8,  weight: 1.2, invert: false },
  putCallRatio:      { mean: 0.9, std: 0.2,  weight: 1.0, invert: true  },
  vvix:              { mean: 90,  std: 15,   weight: 0.8, invert: true  },
  dxy:               { mean: 102, std: 3,    weight: 0.7, invert: true  },
  wti4wkChangePct:   { mean: 0,   std: 8,    weight: 0.5, invert: false },
  goldWeeklyChangePct:{ mean: 0,  std: 1.5,  weight: 0.5, invert: true  },
};

const MAX_POSSIBLE_WEIGHTED_SUM = Object.values(SIGNAL_PARAMS).reduce(
  (acc, p) => acc + p.weight * 3,
  0
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function zScore(value: number, mean: number, std: number): number {
  const z = (value - mean) / std;
  return Math.max(-3, Math.min(3, z));
}

function weightedContribution(z: number, weight: number, invert: boolean): number {
  const signed = invert ? -z : z;
  return signed * weight;
}

const REGIME_DESCRIPTIONS: Record<FourRegime, string> = {
  RISK_ON_TRENDING:  'Bull trend with healthy breadth, credit spreads tight, gamma supportive — full strategy menu available.',
  RISK_OFF_TRENDING: 'Bearish trend with elevated credit risk and negative market internals — prefer defensive/short structures.',
  RANGE_BOUND:       'Mixed signals without clear directional conviction — favor mean-reversion, condors, and low-delta structures.',
  CRISIS:            'Volatility spike or systemic stress — strict capital preservation mode, only wide defined-risk structures.',
};

// ─── Main Function ────────────────────────────────────────────────────────────

export function computeCompositeScore(inputs: RegimeInputs): RegimeEngineResult {
  const {
    spxPrice, spx200sma, breadthPctAbove200, hySpreadBps,
    vixLevel, gexValue, pcrValue, vvixLevel, dxyLevel,
    wti4wkChangePct, goldWeeklyChangePct,
  } = inputs;

  // Derive spx_vs_200sma percentage deviation
  const spxDev =
    spxPrice != null && spx200sma != null && spx200sma > 0
      ? ((spxPrice - spx200sma) / spx200sma) * 100
      : null;

  const rawValues: Record<keyof ComponentScores, number | null> = {
    spxVs200sma:       spxDev,
    breadth:           breadthPctAbove200 ?? null,
    hyCreditSpreads:   hySpreadBps ?? null,
    vix:               vixLevel ?? null,
    gex:               gexValue ?? null,
    putCallRatio:      pcrValue ?? null,
    vvix:              vvixLevel ?? null,
    dxy:               dxyLevel ?? null,
    wtiVelocity:       wti4wkChangePct ?? null,
    goldVelocity:      goldWeeklyChangePct ?? null,
  };

  // Count available data points
  const availableCount = Object.values(rawValues).filter(v => v != null).length;
  const dataQuality = availableCount / 10;

  // Compute weighted contributions
  let weightedSum = 0;
  let availableWeightSum = 0;
  const componentScores: ComponentScores = {} as ComponentScores;

  for (const [key, params] of Object.entries(SIGNAL_PARAMS)) {
    const k = key as keyof ComponentScores;
    const raw = rawValues[k];
    if (raw != null) {
      const z = zScore(raw, params.mean, params.std);
      const contrib = weightedContribution(z, params.weight, params.invert);
      componentScores[k] = contrib;
      weightedSum += contrib;
      availableWeightSum += params.weight * 3; // max possible from this signal
    } else {
      componentScores[k] = 0;
    }
  }

  // Scale to [-5, +5]
  const scaleDenominator = availableWeightSum > 0 ? availableWeightSum : MAX_POSSIBLE_WEIGHTED_SUM;
  const rawComposite = (weightedSum / scaleDenominator) * 5;
  const compositeScore = Math.max(-5, Math.min(5, parseFloat(rawComposite.toFixed(2))));

  // Count directional signals
  const bullishSignals = Object.values(componentScores).filter(s => s > 0.1).length;
  const bearishSignals = Object.values(componentScores).filter(s => s < -0.1).length;

  // Classify regime
  const vix = vixLevel ?? 20;
  let regime: FourRegime;

  if (vix > 35 || compositeScore <= -3.5) {
    regime = 'CRISIS';
  } else if (compositeScore >= 2.0 && vix < 25 && (breadthPctAbove200 ?? 50) > 45) {
    regime = 'RISK_ON_TRENDING';
  } else if (compositeScore <= -2.0 && vix > 20) {
    regime = 'RISK_OFF_TRENDING';
  } else {
    regime = 'RANGE_BOUND';
  }

  // Confidence based on data quality and signal agreement
  const signalAgreement = Math.abs(bullishSignals - bearishSignals) / Math.max(availableCount, 1);
  let confidence: 'high' | 'medium' | 'low';
  if (dataQuality >= 0.8 && signalAgreement > 0.5) confidence = 'high';
  else if (dataQuality >= 0.5) confidence = 'medium';
  else confidence = 'low';

  return {
    regime,
    compositeScore,
    componentScores,
    confidence,
    regimeDescription: REGIME_DESCRIPTIONS[regime],
    dataQuality,
    bullishSignals,
    bearishSignals,
  };
}
