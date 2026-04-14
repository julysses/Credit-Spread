/**
 * Stock Swing Trade Engine
 * Computes daily-bar technical features and scores 6 systematic swing strategies.
 * Designed for overnight review — entry triggers checked at next session open.
 */

import type { OHLCVBar } from './stock-feature-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyFeatures {
  symbol: string;
  lastClose: number;
  dayChangePct: number;   // last bar vs prior close
  sma20: number;
  sma50: number;
  sma150: number;
  sma200: number;
  atr14: number;
  atrPct: number;
  high52w: number;
  low52w: number;
  rs63: number;           // 63-day return ratio vs SPY (1.0 = matched, 1.3 = 30% better)
  volAvg50: number;
  lastVol: number;
  priceVsSma20Pct: number;
  priceVsSma50Pct: number;
  priceVsSma200Pct: number;
  sma200Slope: number;    // (sma200_now - sma200_20barsAgo) / sma200_now × 100
  distFrom52wHighPct: number;
  rsi2: number;
  atrContracting: boolean; // recent 5d ATR < 20d ATR × 0.85
  volDryup: boolean;       // recent 5d avg vol < 50d avg × 0.75
  barsAvailable: number;
}

export interface SwingScore {
  strategyId: string;
  strategyName: string;
  score: number;          // 0–100
  tier: 'A' | 'B' | 'C' | 'PASS';
  meetsMinimum: boolean;  // score >= 60
  direction: 'long' | 'short';
  setupDescription: string;
  triggerConditions: string[];  // things to verify at next open
  riskNote: string;
  reasons: string[];
  warnings: string[];
}

export interface SwingTradePlan {
  symbol: string;
  strategyId: string;
  strategyName: string;
  direction: 'long' | 'short';
  entry: number;          // suggested entry price
  entryNote: string;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  riskPerShare: number;
  holdDays: string;
  invalidation: string;
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function computeSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeDailyATR(bars: OHLCVBar[], period = 14): number {
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

function computeRSI2(closes: number[]): number {
  if (closes.length < 3) return 50;
  const last = closes.slice(-3);
  const changes = [last[1] - last[0], last[2] - last[1]];
  const gains = changes.map(c => Math.max(c, 0));
  const losses = changes.map(c => Math.max(-c, 0));
  const avgGain = (gains[0] + gains[1]) / 2;
  const avgLoss = (losses[0] + losses[1]) / 2;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

function tierFromScore(score: number): 'A' | 'B' | 'C' | 'PASS' {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'PASS';
}

// ─── Master Daily Feature Computation ────────────────────────────────────────

export function computeDailyFeatures(
  symbol: string,
  bars: OHLCVBar[],
  spyBars: OHLCVBar[]
): DailyFeatures | null {
  if (bars.length < 50) return null;

  const closes = bars.map(b => b.close);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? lastClose;
  const dayChangePct = prevClose > 0 ? parseFloat(((lastClose - prevClose) / prevClose * 100).toFixed(2)) : 0;

  const sma20  = computeSMA(closes, 20);
  const sma50  = computeSMA(closes, 50);
  const sma150 = computeSMA(closes, 150);
  const sma200 = computeSMA(closes, 200);

  // 200 SMA slope: compare current vs 20 bars ago
  const sma200_20ago = bars.length >= 220
    ? computeSMA(closes.slice(0, closes.length - 20), 200)
    : sma200;
  const sma200Slope = sma200_20ago > 0
    ? parseFloat(((sma200 - sma200_20ago) / sma200_20ago * 100).toFixed(2))
    : 0;

  const atr14  = computeDailyATR(bars, 14);
  const atrPct = lastClose > 0 ? parseFloat((atr14 / lastClose * 100).toFixed(2)) : 0;

  // 52-week high/low (last 252 bars or all available)
  const yearBars = bars.slice(-252);
  const high52w = Math.max(...yearBars.map(b => b.high));
  const low52w  = Math.min(...yearBars.map(b => b.low));

  // RS63 vs SPY
  let rs63 = 1.0;
  if (spyBars.length >= 63 && bars.length >= 63) {
    const symStart = closes[closes.length - 63];
    const symEnd   = lastClose;
    const spyCloses = spyBars.map(b => b.close);
    const spyStart = spyCloses[spyCloses.length - 63];
    const spyEnd   = spyCloses[spyCloses.length - 1];
    if (symStart > 0 && spyStart > 0 && spyEnd !== spyStart) {
      const symRet = (symEnd - symStart) / symStart;
      const spyRet = (spyEnd - spyStart) / spyStart;
      rs63 = spyRet !== 0 ? parseFloat((symRet / spyRet).toFixed(2)) : (symRet >= 0 ? 2 : 0.5);
    }
  }

  // 50-day avg volume
  const vol50bars = bars.slice(-50);
  const volAvg50 = vol50bars.reduce((s, b) => s + b.volume, 0) / vol50bars.length;
  const lastVol  = bars[bars.length - 1].volume;

  // ATR contraction (recent 5d vs 20d)
  const recentATR = computeDailyATR(bars.slice(-6), 5);
  const longerATR = computeDailyATR(bars.slice(-21), 20);
  const atrContracting = longerATR > 0 && recentATR < longerATR * 0.85;

  // Volume dry-up (recent 5-bar avg vs 50-bar avg)
  const recentVolAvg = bars.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
  const volDryup = volAvg50 > 0 && recentVolAvg < volAvg50 * 0.75;

  const rsi2 = computeRSI2(closes);

  return {
    symbol,
    lastClose,
    dayChangePct,
    sma20, sma50, sma150, sma200,
    atr14, atrPct,
    high52w, low52w,
    rs63,
    volAvg50,
    lastVol,
    priceVsSma20Pct:  sma20  > 0 ? parseFloat(((lastClose - sma20)  / sma20  * 100).toFixed(1)) : 0,
    priceVsSma50Pct:  sma50  > 0 ? parseFloat(((lastClose - sma50)  / sma50  * 100).toFixed(1)) : 0,
    priceVsSma200Pct: sma200 > 0 ? parseFloat(((lastClose - sma200) / sma200 * 100).toFixed(1)) : 0,
    sma200Slope,
    distFrom52wHighPct: high52w > 0 ? parseFloat(((high52w - lastClose) / high52w * 100).toFixed(1)) : 0,
    rsi2,
    atrContracting,
    volDryup,
    barsAvailable: bars.length,
  };
}

// ─── Strategy Scorers ─────────────────────────────────────────────────────────

export function scoreTrendTemplate(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (f.lastClose > f.sma200) { score += 20; reasons.push(`Price ${f.priceVsSma200Pct > 0 ? '+' : ''}${f.priceVsSma200Pct}% above 200 SMA`); }
  else { warnings.push('Price below 200 SMA — trend template fails'); }

  if (f.lastClose > f.sma150) { score += 15; reasons.push('Price above 150 SMA'); }
  else warnings.push('Price below 150 SMA');

  if (f.lastClose > f.sma50) { score += 15; reasons.push('Price above 50 SMA'); }
  else warnings.push('Price below 50 SMA');

  if (f.sma200Slope > 0.1) { score += 15; reasons.push(`200 SMA sloping up (+${f.sma200Slope.toFixed(2)}%)`); }
  else warnings.push('200 SMA not trending up');

  if (f.sma50 > f.sma150) { score += 15; reasons.push('50 SMA > 150 SMA'); }
  if (f.sma150 > f.sma200) { score += 10; reasons.push('150 SMA > 200 SMA'); }

  if (f.distFrom52wHighPct <= 25) { score += 10; reasons.push(`Within ${f.distFrom52wHighPct.toFixed(1)}% of 52wk high`); }
  else warnings.push(`${f.distFrom52wHighPct.toFixed(1)}% below 52wk high — too extended from highs`);

  const s = Math.min(100, score);
  return {
    strategyId: 'TREND_TEMPLATE',
    strategyName: 'Minervini Trend Template',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: 'All SMAs aligned in bull order with 200 SMA sloping up. Highest-probability long environment.',
    triggerConditions: [
      'Confirm no broad market distribution at next open',
      'Entry on intraday pullback to 10-day MA or VWAP',
      'Avoid chasing if up >3% on day',
    ],
    riskNote: `Stop 1 ATR (${f.atr14.toFixed(2)}) below entry. Swing hold 5–15 days.`,
    reasons, warnings,
  };
}

export function scoreVCPBreakout(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (f.distFrom52wHighPct <= 10) { score += 25; reasons.push(`${f.distFrom52wHighPct.toFixed(1)}% from 52wk high — tight base`); }
  else if (f.distFrom52wHighPct <= 20) { score += 12; reasons.push(`${f.distFrom52wHighPct.toFixed(1)}% from 52wk high`); }
  else warnings.push(`${f.distFrom52wHighPct.toFixed(1)}% below 52wk high — base too deep for VCP`);

  if (f.distFrom52wHighPct <= 5) { score += 10; reasons.push('Within 5% of 52wk high — breakout imminent'); }

  if (f.atrContracting) { score += 20; reasons.push('ATR contracting (volatility squeezing)'); }
  else warnings.push('ATR not contracting — VCP compression not confirmed');

  if (f.volDryup) { score += 20; reasons.push('Volume drying up — institutional supply absorbed'); }
  else warnings.push('Volume not drying up — base may not be complete');

  if (f.lastClose > f.sma50) { score += 20; reasons.push(`Price above 50 SMA (+${f.priceVsSma50Pct.toFixed(1)}%)`); }
  else warnings.push('Price below 50 SMA');

  if (f.lastClose > f.sma200) { score += 15; reasons.push('Price above 200 SMA'); }
  else warnings.push('Price below 200 SMA');

  const s = Math.min(100, score);
  return {
    strategyId: 'VCP_BREAKOUT',
    strategyName: 'VCP Breakout Setup',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: 'Volatility Contraction Pattern — tight base near 52wk high with drying volume. Enter on pivot breakout.',
    triggerConditions: [
      `Buy on close above 52wk high (${f.high52w.toFixed(2)}) on RVOL > 1.5×`,
      'Confirm volume expansion on breakout day',
      'Do not chase if gap >5% above pivot',
    ],
    riskNote: `Stop below the tightest part of the base (pivot − 1 ATR: ~${(f.lastClose - f.atr14).toFixed(2)}).`,
    reasons, warnings,
  };
}

export function scorePullbackTo20SMA(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // Price within 3% above 20 SMA (testing it from above)
  if (f.priceVsSma20Pct >= 0 && f.priceVsSma20Pct <= 3) {
    score += 35; reasons.push(`Price +${f.priceVsSma20Pct.toFixed(1)}% above 20 SMA — testing support`);
  } else if (f.priceVsSma20Pct > 3 && f.priceVsSma20Pct <= 6) {
    score += 15; reasons.push(`Price ${f.priceVsSma20Pct.toFixed(1)}% above 20 SMA — approaching`);
  } else if (f.priceVsSma20Pct < 0) {
    warnings.push('Price below 20 SMA — already broken support');
  } else {
    warnings.push(`Price ${f.priceVsSma20Pct.toFixed(1)}% above 20 SMA — not yet near enough`);
  }

  if (f.sma20 > f.sma50 * 0.995) { score += 20; reasons.push('20 SMA sloping up (above 50 SMA)'); }
  else warnings.push('20 SMA not in uptrend');

  if (f.lastClose > f.sma50) { score += 20; reasons.push(`Price above 50 SMA (+${f.priceVsSma50Pct.toFixed(1)}%)`); }
  else warnings.push('Price below 50 SMA — uptrend broken');

  if (f.lastClose > f.sma200) { score += 15; reasons.push('Price above 200 SMA'); }
  else warnings.push('Price below 200 SMA');

  if (f.volDryup) { score += 10; reasons.push('Volume drying up on pullback (normal)'); }

  const s = Math.min(100, score);
  return {
    strategyId: 'PULLBACK_20SMA',
    strategyName: 'Pullback to Rising 20 SMA',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: 'Stock in uptrend pulling back to rising 20-day SMA on light volume. Classic continuation entry.',
    triggerConditions: [
      `Enter on bounce off 20 SMA (${f.sma20.toFixed(2)}) with intraday reversal candle`,
      'Confirm RVOL picks up on bounce day',
      'Pass if 20 SMA is declining or price closes below it',
    ],
    riskNote: `Stop below 20 SMA (${f.sma20.toFixed(2)}) − 0.5 ATR. Hold 3–8 days.`,
    reasons, warnings,
  };
}

export function scoreMomentumBreakout(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (f.distFrom52wHighPct <= 2) { score += 35; reasons.push(`At 52wk high — breakout territory (${f.high52w.toFixed(2)})`); }
  else if (f.distFrom52wHighPct <= 5) { score += 20; reasons.push(`${f.distFrom52wHighPct.toFixed(1)}% from 52wk high`); }
  else warnings.push(`${f.distFrom52wHighPct.toFixed(1)}% below 52wk high — not near enough for momentum breakout`);

  if (f.rs63 >= 1.4) { score += 30; reasons.push(`RS(63) = ${f.rs63.toFixed(2)} — strong market leader`); }
  else if (f.rs63 >= 1.2) { score += 20; reasons.push(`RS(63) = ${f.rs63.toFixed(2)} — outperforming SPY`); }
  else warnings.push(`RS(63) = ${f.rs63.toFixed(2)} — not outperforming market`);

  if (f.rs63 >= 1.6) { score += 10; reasons.push('Exceptional RS — top-tier leader'); }

  if (f.lastClose > f.sma50) { score += 15; reasons.push('Price above 50 SMA'); }
  else warnings.push('Price below 50 SMA');

  if (f.lastClose > f.sma200) { score += 10; reasons.push('Price above 200 SMA'); }
  else warnings.push('Price below 200 SMA');

  const s = Math.min(100, score);
  return {
    strategyId: 'MOMENTUM_BREAKOUT',
    strategyName: 'Momentum 52wk High Breakout',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: 'Stock making new 52-week highs with strong RS vs SPY. Breakout buy on volume.',
    triggerConditions: [
      `Buy above ${f.high52w.toFixed(2)} (52wk high) on RVOL > 1.5×`,
      'Market regime must be RISK_ON or neutral — avoid in downtrend',
      'Position size reduced if broad market weak',
    ],
    riskNote: `Aggressive stop: 1 ATR (${f.atr14.toFixed(2)}) below breakout bar. Momentum stop trails.`,
    reasons, warnings,
  };
}

export function scoreRSI2Oversold(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (f.rsi2 <= 5) { score += 45; reasons.push(`RSI(2) = ${f.rsi2} — extremely oversold`); }
  else if (f.rsi2 <= 10) { score += 25; reasons.push(`RSI(2) = ${f.rsi2} — oversold`); }
  else warnings.push(`RSI(2) = ${f.rsi2} — not yet oversold (need ≤ 10)`);

  if (f.lastClose > f.sma200) { score += 30; reasons.push(`Above 200 SMA (+${f.priceVsSma200Pct.toFixed(1)}%) — bull regime`); }
  else warnings.push('Below 200 SMA — mean reversion has macro headwinds, skip');

  if (f.lastClose > f.sma50) { score += 15; reasons.push('Above 50 SMA — intermediate uptrend intact'); }
  else warnings.push('Below 50 SMA — structural trend broken');

  if (f.rsi2 <= 2) { score += 10; reasons.push('RSI(2) ≤ 2 — highest-probability reversal zone'); }

  const s = Math.min(100, score);
  return {
    strategyId: 'RSI2_OVERSOLD',
    strategyName: 'RSI(2) Mean Reversion Swing',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: `RSI(2) = ${f.rsi2} — short-term oversold in longer-term uptrend. High win-rate mean reversion.`,
    triggerConditions: [
      'Buy on next open if RSI(2) ≤ 10 at close',
      'Exit when RSI(2) crosses above 65 or price closes above 5-day SMA',
      'Hard stop: close below 200 SMA',
    ],
    riskNote: `Stop: close below 200 SMA (${f.sma200.toFixed(2)}). Target: 5-day SMA bounce. Hold 1–4 days.`,
    reasons, warnings,
  };
}

export function scoreRSLeader(f: DailyFeatures): SwingScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (f.rs63 >= 1.5) { score += 35; reasons.push(`RS(63) = ${f.rs63.toFixed(2)} — elite market leader`); }
  else if (f.rs63 >= 1.3) { score += 25; reasons.push(`RS(63) = ${f.rs63.toFixed(2)} — strong relative strength`); }
  else warnings.push(`RS(63) = ${f.rs63.toFixed(2)} — RS not strong enough (need ≥ 1.3)`);

  if (f.rs63 >= 1.8) { score += 15; reasons.push('Top 5% RS — exceptional leadership'); }

  if (f.distFrom52wHighPct <= 15) { score += 20; reasons.push(`Within ${f.distFrom52wHighPct.toFixed(1)}% of 52wk high`); }
  else warnings.push(`${f.distFrom52wHighPct.toFixed(1)}% from 52wk high — RS leader lagging`);

  if (f.distFrom52wHighPct <= 5) { score += 10; reasons.push('Near 52wk high — leadership confirmed'); }

  if (f.lastClose > f.sma50) { score += 20; reasons.push('Price above 50 SMA'); }
  else warnings.push('Price below 50 SMA');

  if (f.lastClose > f.sma200) { score += 5; reasons.push('Price above 200 SMA'); }

  const s = Math.min(100, score);
  return {
    strategyId: 'RS_LEADER',
    strategyName: 'Relative Strength Leader',
    score: s, tier: tierFromScore(s), meetsMinimum: s >= 60,
    direction: 'long',
    setupDescription: `63-day RS = ${f.rs63.toFixed(2)} vs SPY. Holding leaders in bull markets outperforms.`,
    triggerConditions: [
      'Buy on any pullback to rising 20-day MA',
      'Can add on breakout to new highs if broad market confirms',
      'Cut if RS line breaks below recent lows',
    ],
    riskNote: `Trend stop: 1.5× ATR (${(f.atr14 * 1.5).toFixed(2)}) below entry. Hold until RS line breaks.`,
    reasons, warnings,
  };
}

// ─── Score All Strategies ─────────────────────────────────────────────────────

export function scoreAllSwingStrategies(f: DailyFeatures): SwingScore[] {
  return [
    scoreTrendTemplate(f),
    scoreVCPBreakout(f),
    scorePullbackTo20SMA(f),
    scoreMomentumBreakout(f),
    scoreRSI2Oversold(f),
    scoreRSLeader(f),
  ].sort((a, b) => b.score - a.score);
}

// ─── Trade Plan Generator ─────────────────────────────────────────────────────

export function generateSwingTradePlan(f: DailyFeatures, best: SwingScore): SwingTradePlan {
  const dir = best.direction;

  // Entry: next-day open estimate (last close ± small buffer)
  let entry = f.lastClose;
  let entryNote = 'Enter at next open or intraday on trigger confirmation.';
  let stopLoss = dir === 'long' ? entry - f.atr14 * 1.5 : entry + f.atr14 * 1.5;
  let holdDays = '3–8 trading days';
  let invalidation = `Close below ${(f.lastClose - f.atr14 * 2).toFixed(2)}`;

  if (best.strategyId === 'VCP_BREAKOUT') {
    entry = parseFloat((f.high52w * 1.002).toFixed(2)); // just above 52wk high
    entryNote = `Buy breakout above ${f.high52w.toFixed(2)} on RVOL > 1.5×.`;
    stopLoss = parseFloat((f.lastClose - f.atr14).toFixed(2));
    holdDays = '5–15 trading days';
    invalidation = `Price closes back below the 52wk high (${f.high52w.toFixed(2)})`;
  } else if (best.strategyId === 'PULLBACK_20SMA') {
    entry = parseFloat((f.sma20 * 1.005).toFixed(2));
    entryNote = `Buy bounce off 20 SMA (${f.sma20.toFixed(2)}) with reversal candle.`;
    stopLoss = parseFloat((f.sma20 - f.atr14 * 0.5).toFixed(2));
    holdDays = '3–8 trading days';
    invalidation = `Close below 20 SMA (${f.sma20.toFixed(2)})`;
  } else if (best.strategyId === 'MOMENTUM_BREAKOUT') {
    entry = parseFloat((f.high52w * 1.003).toFixed(2));
    entryNote = `Buy above 52wk high (${f.high52w.toFixed(2)}) on strong volume.`;
    stopLoss = parseFloat((entry - f.atr14).toFixed(2));
    holdDays = '5–20 trading days';
    invalidation = `Intraday reversal below breakout bar low`;
  } else if (best.strategyId === 'RSI2_OVERSOLD') {
    entry = f.lastClose;
    entryNote = 'Buy at next open. RSI(2) oversold in uptrend.';
    stopLoss = parseFloat((f.sma200 * 0.995).toFixed(2));
    holdDays = '1–4 trading days';
    invalidation = `Close below 200 SMA (${f.sma200.toFixed(2)})`;
  }

  const risk = Math.abs(entry - stopLoss);
  const target1 = dir === 'long' ? entry + risk * 1.5 : entry - risk * 1.5;
  const target2 = dir === 'long' ? entry + risk * 2.5 : entry - risk * 2.5;
  const rr = risk > 0 ? parseFloat((risk * 1.5 / risk).toFixed(1)) : 1.5;

  return {
    symbol: f.symbol,
    strategyId: best.strategyId,
    strategyName: best.strategyName,
    direction: dir,
    entry:  parseFloat(entry.toFixed(2)),
    entryNote,
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    target1: parseFloat(target1.toFixed(2)),
    target2: parseFloat(target2.toFixed(2)),
    riskRewardRatio: rr,
    riskPerShare: parseFloat(risk.toFixed(2)),
    holdDays,
    invalidation,
  };
}
