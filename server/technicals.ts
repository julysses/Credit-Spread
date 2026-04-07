/**
 * Technical Analysis Computations
 *
 * Pure functions that operate on arrays of daily close prices (oldest → newest).
 * Used for SPX swing + intraday directional bias in the Strategies Hub.
 */

// ─── Core Math ────────────────────────────────────────────────────────────────

export function computeSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeEMA(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [];
  // Seed with SMA of first `period` closes
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(seed);
  for (let i = period; i < closes.length; i++) {
    emas.push(closes[i] * k + emas[emas.length - 1] * (1 - k));
  }
  return emas;
}

// ─── RSI ──────────────────────────────────────────────────────────────────────

export function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  // Wilder smoothing: seed with simple average of first `period` bars
  const gains = changes.slice(0, period).map(c => Math.max(c, 0));
  const losses = changes.slice(0, period).map(c => Math.max(-c, 0));
  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    const gain = Math.max(changes[i], 0);
    const loss = Math.max(-changes[i], 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

export interface MACDResult {
  macd: number;       // MACD line = EMA(12) − EMA(26)
  signal: number;     // Signal line = EMA(9) of MACD line
  histogram: number;  // MACD − Signal
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDResult {
  if (closes.length < slow + signal) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);

  // Align the two EMA arrays (emaSlow is shorter by (slow - fast) elements)
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  const signalLine = computeEMA(macdLine, signal);
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];

  return {
    macd: lastMACD,
    signal: lastSignal,
    histogram: lastMACD - lastSignal,
  };
}

// ─── Series Variants (for chart rendering) ────────────────────────────────────

/** Rolling SMA aligned 1:1 with closes. Returns null for bars before warmup. */
export function computeSMASeries(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

/** Rolling RSI(period) aligned 1:1 with closes. Returns null before warmup. */
export function computeRSISeries(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(period).fill(null);
  if (closes.length <= period) return result;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const initGains = changes.slice(0, period).map(c => Math.max(c, 0));
  const initLosses = changes.slice(0, period).map(c => Math.max(-c, 0));
  let avgGain = initGains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = initLosses.reduce((a, b) => a + b, 0) / period;

  const rsiAt = (ag: number, al: number) => al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  result.push(rsiAt(avgGain, avgLoss));

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
    result.push(rsiAt(avgGain, avgLoss));
  }

  return result;
}

export interface MACDSeriesPoint {
  macd: number | null;
  macdSignal: number | null;
  histogram: number | null;
}

/** Full MACD series aligned 1:1 with closes. Returns nulls during warmup. */
export function computeMACDSeries(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDSeriesPoint[] {
  const empty = (): MACDSeriesPoint => ({ macd: null, macdSignal: null, histogram: null });
  if (closes.length < slow) return closes.map(empty);

  // Build full EMA series for fast and slow
  const emaFastFull: (number | null)[] = new Array(fast - 1).fill(null);
  const emaSeries = computeEMA(closes, fast);
  emaFastFull.push(...emaSeries);

  const emaSlowFull: (number | null)[] = new Array(slow - 1).fill(null);
  emaSlowFull.push(...computeEMA(closes, slow));

  // Build MACD line aligned to closes
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFastFull[i];
    const s = emaSlowFull[i];
    return f != null && s != null ? f - s : null;
  });

  // Compute signal EMA on the non-null MACD values
  const macdValues = macdLine.filter((v): v is number => v != null);
  const signalValues = computeEMA(macdValues, signal);

  // Map signal back — starts at the (slow-1 + signal-1)-th bar of closes
  const signalStartBar = slow - 1 + signal - 1;
  const result: MACDSeriesPoint[] = closes.map((_, i) => {
    const macd = macdLine[i];
    if (macd == null) return empty();
    const signalIdx = i - signalStartBar;
    const sig = signalIdx >= 0 ? (signalValues[signalIdx] ?? null) : null;
    return {
      macd,
      macdSignal: sig,
      histogram: sig != null ? macd - sig : null,
    };
  });

  return result;
}

// ─── Bias Derivation ──────────────────────────────────────────────────────────

export type BiasSignal = 'bullish' | 'bearish' | 'neutral';

export interface TechnicalEvidence {
  indicator: string;
  value: string;
  signal: BiasSignal;
  note: string;
}

export interface TechnicalAnalysis {
  swingBias: BiasSignal;
  swingStrength: number;   // 0–1: fraction of indicators aligned with bias
  evidence: TechnicalEvidence[];
}

export function deriveTechnicalAnalysis(closes: number[], currentPrice: number): TechnicalAnalysis {
  const rsi = computeRSI(closes, 14);
  const { macd, signal: macdSignal } = computeMACD(closes);
  const sma200 = computeSMA(closes, 200);
  const sma50 = computeSMA(closes, 50);

  const evidence: TechnicalEvidence[] = [];

  // RSI(14)
  let rsiSignal: BiasSignal = 'neutral';
  if (rsi > 55) rsiSignal = 'bullish';
  else if (rsi < 45) rsiSignal = 'bearish';
  evidence.push({
    indicator: 'RSI(14)',
    value: rsi.toFixed(1),
    signal: rsiSignal,
    note:
      rsi > 70
        ? 'Overbought — momentum stretched'
        : rsi > 55
          ? 'Above 50, positive momentum'
          : rsi < 30
            ? 'Oversold — potential reversal'
            : rsi < 45
              ? 'Below 50, negative momentum'
              : 'Neutral zone (45–55)',
  });

  // MACD
  const macdSignalBias: BiasSignal = macd > macdSignal ? 'bullish' : macd < macdSignal ? 'bearish' : 'neutral';
  evidence.push({
    indicator: 'MACD(12/26/9)',
    value: macd >= 0 ? `+${macd.toFixed(1)}` : macd.toFixed(1),
    signal: macdSignalBias,
    note:
      macd > macdSignal
        ? `MACD above signal (histogram +${(macd - macdSignal).toFixed(1)})`
        : `MACD below signal (histogram ${(macd - macdSignal).toFixed(1)})`,
  });

  // Price vs 200 SMA
  const pctAbove200 = ((currentPrice - sma200) / sma200) * 100;
  const sma200Signal: BiasSignal = pctAbove200 > 1 ? 'bullish' : pctAbove200 < -1 ? 'bearish' : 'neutral';
  evidence.push({
    indicator: 'Price vs 200 SMA',
    value: `${pctAbove200 >= 0 ? '+' : ''}${pctAbove200.toFixed(1)}%`,
    signal: sma200Signal,
    note:
      pctAbove200 > 0
        ? `${pctAbove200.toFixed(1)}% above 200-day SMA (${sma200.toFixed(0)})`
        : `${Math.abs(pctAbove200).toFixed(1)}% below 200-day SMA (${sma200.toFixed(0)})`,
  });

  // Price vs 50 SMA
  const pctAbove50 = ((currentPrice - sma50) / sma50) * 100;
  const sma50Signal: BiasSignal = pctAbove50 > 0.5 ? 'bullish' : pctAbove50 < -0.5 ? 'bearish' : 'neutral';
  evidence.push({
    indicator: 'Price vs 50 SMA',
    value: `${pctAbove50 >= 0 ? '+' : ''}${pctAbove50.toFixed(1)}%`,
    signal: sma50Signal,
    note:
      pctAbove50 > 0
        ? `${pctAbove50.toFixed(1)}% above 50-day SMA (${sma50.toFixed(0)})`
        : `${Math.abs(pctAbove50).toFixed(1)}% below 50-day SMA (${sma50.toFixed(0)})`,
  });

  // Tally signals
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const e of evidence) counts[e.signal]++;

  let swingBias: BiasSignal = 'neutral';
  if (counts.bullish > counts.bearish && counts.bullish >= 2) swingBias = 'bullish';
  else if (counts.bearish > counts.bullish && counts.bearish >= 2) swingBias = 'bearish';

  const total = evidence.length;
  const aligned = swingBias === 'neutral' ? counts.neutral : counts[swingBias];
  const swingStrength = aligned / total;

  return { swingBias, swingStrength, evidence };
}
