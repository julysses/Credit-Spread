/**
 * /api/options/trade-plans
 * Generates concrete, actionable options trade plans for every strategy
 * active in the current regime. Each plan includes specific strikes
 * (computed via Black-Scholes delta approximation), expiry dates,
 * entry time windows, premiums, max profit/loss, breakevens, and
 * management rules.
 */

import { NextResponse } from 'next/server';
import { fetchMarketSnapshot } from '@/server/market-data';
import { fetchSignalStackInputs } from '@/server/signal-stack-inputs';
import { computeCompositeScore } from '@/lib/models/regime-engine';
import { selectOptionsStrategies, STRATEGY_CATALOG } from '@/lib/models/options-strategy-selector';
import { blackScholes } from '@/lib/models/black-scholes';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptionsLeg {
  label: string;       // e.g. "Short Put", "Long Put (wing)"
  action: 'buy' | 'sell';
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;      // "Mon Apr 14 — 0DTE" or "Fri May 16 — 30 DTE"
  dte: number;
  delta: number;
  premium: number;          // per share
  premiumPerContract: number; // × 100
  iv: number;
}

export interface OptionsTradePlan {
  strategyId: string;
  strategyName: string;
  category: 'options_day_trade' | 'options_swing';
  structure: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  regime: string;
  compositeScore: number;
  entryTimeWindow: string;
  entryNote: string;
  legs: OptionsLeg[];
  netCredit: number | null;       // per contract ($)
  netDebit: number | null;
  maxProfit: number;              // per contract ($)
  maxLoss: number;                // per contract ($)
  profitTarget: number;           // per contract ($)
  profitTargetRule: string;
  stopLoss: number;               // per contract ($)
  stopLossRule: string;
  breakevens: number[];
  wingWidth: number | null;
  ivr: number;
  vix: number;
  spxPrice: number;
  management: string[];
  conditions: string[];
  warnings: string[];
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function getExpiryDate(dteTarget: number): { date: Date; dte: number } {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = etNow.getHours();
  const minute = etNow.getMinutes();
  // If after 3:45 PM ET on a weekday, 0DTE is effectively next day
  const postClose = (hour > 15) || (hour === 15 && minute >= 45);

  if (dteTarget === 0) {
    const target = new Date(etNow);
    if (postClose) target.setDate(target.getDate() + 1);
    // Skip weekend
    while (target.getDay() === 0 || target.getDay() === 6) target.setDate(target.getDate() + 1);
    return { date: target, dte: 0 };
  }

  // Find next Friday at or beyond dteTarget days
  const target = new Date(etNow);
  target.setDate(target.getDate() + dteTarget);
  // Advance to nearest Friday
  while (target.getDay() !== 5) target.setDate(target.getDate() + 1);

  const msPerDay = 1000 * 60 * 60 * 24;
  const dteActual = Math.round((target.getTime() - etNow.getTime()) / msPerDay);
  return { date: target, dte: dteActual };
}

function formatExpiry(date: Date, dte: number): string {
  const label = date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: 'America/New_York',
  });
  if (dte === 0) return `${label} — 0DTE (today)`;
  if (dte === 1) return `${label} — 1 DTE`;
  return `${label} — ${dte} DTE`;
}

// ─── Strike Computation ────────────────────────────────────────────────────────
// Delta approximation using lognormal: K ≈ S × exp(μT - z × σ√T)
// For OTM put at delta d: z = N_inv(d) [negative for OTM puts]
// Quick z values: 50Δ=0, 30Δ=0.52, 25Δ=0.67, 16Δ=1.00, 10Δ=1.28, 5Δ=1.65

const DELTA_Z: Record<number, number> = {
  50: 0.00, 45: 0.13, 40: 0.25, 35: 0.39,
  30: 0.52, 25: 0.67, 20: 0.84, 16: 1.00,
  10: 1.28,  5: 1.65,
};

function zForDelta(deltaAbs: number): number {
  const keys = Object.keys(DELTA_Z).map(Number).sort((a, b) => b - a);
  for (let i = 0; i < keys.length - 1; i++) {
    const hi = keys[i], lo = keys[i + 1];
    if (deltaAbs <= hi && deltaAbs >= lo) {
      const t = (deltaAbs - lo) / (hi - lo);
      return DELTA_Z[lo] + t * (DELTA_Z[hi] - DELTA_Z[lo]);
    }
  }
  return DELTA_Z[keys[keys.length - 1]] ?? 1.65;
}

function deltaToStrike(
  spx: number,
  sigma: number,
  dte: number,
  deltaAbs: number,
  side: 'put' | 'call',
  roundTo = 5
): number {
  const T = Math.max(dte, 0.5) / 365;
  const sSqrtT = sigma * Math.sqrt(T);
  const z = zForDelta(deltaAbs);
  let strike: number;
  if (side === 'put') {
    strike = spx * Math.exp(-z * sSqrtT);
  } else {
    strike = spx * Math.exp(z * sSqrtT);
  }
  return Math.round(strike / roundTo) * roundTo;
}

// ─── Leg Pricing ──────────────────────────────────────────────────────────────

function priceleg(
  spx: number,
  strike: number,
  dte: number,
  iv: number,
  optionType: 'call' | 'put',
  action: 'buy' | 'sell',
  label: string,
  expiryStr: string
): OptionsLeg {
  const T = Math.max(dte, 0.25) / 365;
  const bs = blackScholes({ S: spx, K: strike, T, r: 0.05, sigma: iv, optionType });
  const mid = Math.max(bs.price, 0.05);

  return {
    label,
    action,
    optionType,
    strike,
    expiry: expiryStr,
    dte,
    delta: parseFloat(Math.abs(bs.delta).toFixed(3)),
    premium: parseFloat(mid.toFixed(2)),
    premiumPerContract: parseFloat((mid * 100).toFixed(0)),
    iv: parseFloat((iv * 100).toFixed(1)),
  };
}

// ─── Trade Plan Builders ──────────────────────────────────────────────────────

function buildIronCondorPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(0);
  const expiryStr = formatExpiry(date, dte);

  // Wing width depends on VIX
  const wingWidth = vix < 15 ? 5 : vix < 20 ? 10 : vix < 25 ? 15 : 20;

  // Short strikes at ~12Δ (between 10Δ and 16Δ)
  const shortPutStrike  = deltaToStrike(spx, iv, Math.max(dte, 0.5), 12, 'put');
  const shortCallStrike = deltaToStrike(spx, iv, Math.max(dte, 0.5), 12, 'call');
  const longPutStrike   = shortPutStrike - wingWidth;
  const longCallStrike  = shortCallStrike + wingWidth;

  const legs: OptionsLeg[] = [
    priceleg(spx, shortPutStrike,  dte, iv, 'put',  'sell', `Short Put  ${shortPutStrike}`,  expiryStr),
    priceleg(spx, longPutStrike,   dte, iv, 'put',  'buy',  `Long Put   ${longPutStrike} (wing)`, expiryStr),
    priceleg(spx, shortCallStrike, dte, iv, 'call', 'sell', `Short Call ${shortCallStrike}`, expiryStr),
    priceleg(spx, longCallStrike,  dte, iv, 'call', 'buy',  `Long Call  ${longCallStrike} (wing)`, expiryStr),
  ];

  const putCredit  = legs[0].premium - legs[1].premium;
  const callCredit = legs[2].premium - legs[3].premium;
  const totalCredit = parseFloat((putCredit + callCredit).toFixed(2));
  const netCreditContract = parseFloat((totalCredit * 100).toFixed(0));
  const maxLoss = parseFloat(((wingWidth - totalCredit) * 100).toFixed(0));
  const profitTarget = parseFloat((netCreditContract * 0.50).toFixed(0));
  const stopLoss = parseFloat((netCreditContract * 2.0).toFixed(0));

  return {
    strategyId: 'GEX_IRON_CONDOR', strategyName: '0DTE GEX Iron Condor',
    category: 'options_day_trade', structure: 'Iron Condor',
    direction: 'neutral', regime, compositeScore,
    entryTimeWindow: '10:00 AM – 12:00 PM ET',
    entryNote: `Enter after 10:00 AM. Place short put below ${shortPutStrike} (Put Wall) and short call above ${shortCallStrike} (Call Wall). Confirm GEX positive and SPX not trending > 0.5% from open.`,
    legs,
    netCredit: netCreditContract, netDebit: null,
    maxProfit: netCreditContract, maxLoss,
    profitTarget, profitTargetRule: `Close at 50% of credit ($${(netCreditContract * 0.5).toFixed(0)}/contract)`,
    stopLoss, stopLossRule: `Exit if either spread reaches 2× credit ($${(totalCredit * 2 * 100).toFixed(0)}/contract per side)`,
    breakevens: [
      parseFloat((shortPutStrike - totalCredit).toFixed(2)),
      parseFloat((shortCallStrike + totalCredit).toFixed(2)),
    ],
    wingWidth, ivr, vix, spxPrice: spx,
    management: [
      `Close full condor when total P&L reaches +$${profitTarget} (50% of credit)`,
      `Close just the breached side if one spread reaches 2× credit; keep other side open`,
      `Hard exit: 3:30 PM ET regardless of P&L`,
      `Emergency exit: VIX spikes > 3pts intraday from open`,
      `Do NOT leg into separate closes if both sides threatened simultaneously`,
    ],
    conditions: [
      `GEX must be positive (price below gamma flip level)`,
      `SPX within 0.5% of prior close at entry`,
      `VIX ${vix.toFixed(1)} — wing width set to $${wingWidth}`,
      `IVR ≈ ${ivr} — IV environment supports premium selling`,
    ],
    warnings: vix > 25 ? ['Elevated VIX — widen wings to $15–$20 or skip'] : [],
  };
}

function buildDirectionalDebitPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(0);
  const expiryStr = formatExpiry(date, dte);
  const isBullish = compositeScore >= 0;
  const direction = isBullish ? 'bullish' : 'bearish';
  const side: 'call' | 'put' = isBullish ? 'call' : 'put';
  const width = 10;

  // ATM long leg (~50Δ), short leg 5–10pts further OTM
  const longStrike  = Math.round(spx / 5) * 5;
  const shortStrike = side === 'call' ? longStrike + width : longStrike - width;

  const longLeg  = priceleg(spx, longStrike,  dte, iv, side, 'buy',  `Long ${side.charAt(0).toUpperCase() + side.slice(1)}  ${longStrike} (ATM)`, expiryStr);
  const shortLeg = priceleg(spx, shortStrike, dte, iv, side, 'sell', `Short ${side.charAt(0).toUpperCase() + side.slice(1)} ${shortStrike} (OTM)`, expiryStr);

  const netDebitPerShare = parseFloat((longLeg.premium - shortLeg.premium).toFixed(2));
  const netDebitContract = parseFloat((netDebitPerShare * 100).toFixed(0));
  const maxProfit = parseFloat(((width - netDebitPerShare) * 100).toFixed(0));
  const profitTarget = parseFloat((netDebitContract * 1.0).toFixed(0));
  const stopLoss = parseFloat((netDebitContract * 0.5).toFixed(0));

  const beDir = side === 'call'
    ? longStrike + netDebitPerShare
    : longStrike - netDebitPerShare;

  return {
    strategyId: 'GEX_DIRECTIONAL_DEBIT',
    strategyName: `0DTE Directional ${side === 'call' ? 'Call' : 'Put'} Debit Spread`,
    category: 'options_day_trade', structure: `${side === 'call' ? 'Call' : 'Put'} Debit Spread`,
    direction, regime, compositeScore,
    entryTimeWindow: '9:45 AM – 11:00 AM ET',
    entryNote: `Enter on ${side === 'call' ? 'ORB breakout above' : 'ORB breakdown below'} opening range or VWAP ${side === 'call' ? 'bounce' : 'rejection'}. Composite score ${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(2)} supports ${direction} bias.`,
    legs: [longLeg, shortLeg],
    netCredit: null, netDebit: netDebitContract,
    maxProfit, maxLoss: netDebitContract,
    profitTarget, profitTargetRule: `Close at 100% gain ($${profitTarget}/contract — debit doubles)`,
    stopLoss, stopLossRule: `Exit if spread loses 50% of premium paid ($${stopLoss}/contract)`,
    breakevens: [parseFloat(beDir.toFixed(2))],
    wingWidth: width, ivr, vix, spxPrice: spx,
    management: [
      `Close at T+100% (full double on debit paid)`,
      `Stop at −50% of premium (cut losses quickly)`,
      `Hard time stop: 3:45 PM ET`,
      `If breakeven reached mid-day, trail stop to breakeven`,
    ],
    conditions: [
      `Composite score ${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(2)} — ${direction} bias`,
      `GEX negative or trend regime active`,
      `Directional confirmation required: ORB break or VWAP alignment`,
    ],
    warnings: Math.abs(compositeScore) < 1.5
      ? ['Score below ±1.5 — directional conviction low, consider skipping']
      : [],
  };
}

function buildORBOptionsPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(0);
  const expiryStr = formatExpiry(date, dte);
  const isBullish = compositeScore >= 0;
  const side: 'call' | 'put' = isBullish ? 'call' : 'put';
  const width = vix < 18 ? 5 : 10;

  const longStrike  = Math.round(spx / 5) * 5;
  const shortStrike = side === 'call' ? longStrike + width : longStrike - width;

  const longLeg  = priceleg(spx, longStrike,  dte, iv, side, 'buy',  `Long ${side === 'call' ? 'Call' : 'Put'}  ${longStrike} (ATM)`,     expiryStr);
  const shortLeg = priceleg(spx, shortStrike, dte, iv, side, 'sell', `Short ${side === 'call' ? 'Call' : 'Put'} ${shortStrike} (OTM)`,     expiryStr);

  const netDebit = parseFloat((longLeg.premium - shortLeg.premium).toFixed(2));
  const netDebitContract = parseFloat((netDebit * 100).toFixed(0));

  return {
    strategyId: 'ORB_OPTIONS',
    strategyName: `ORB ${side === 'call' ? 'Call' : 'Put'} Debit Spread (0DTE)`,
    category: 'options_day_trade', structure: `${side === 'call' ? 'Call' : 'Put'} Debit Spread`,
    direction: isBullish ? 'bullish' : 'bearish', regime, compositeScore,
    entryTimeWindow: '10:00 AM – 10:30 AM ET',
    entryNote: `Wait for 30-min ORB to form (9:30–10:00 AM). Enter on first 5-min candle CLOSE beyond OR boundary with RVOL > 1.5×. OR width must be 0.2–0.5% of SPX.`,
    legs: [longLeg, shortLeg],
    netCredit: null, netDebit: netDebitContract,
    maxProfit: parseFloat(((width - netDebit) * 100).toFixed(0)),
    maxLoss: netDebitContract,
    profitTarget: parseFloat((netDebitContract * 1.0).toFixed(0)),
    profitTargetRule: '100% of debit paid (spread doubles)',
    stopLoss: parseFloat((netDebitContract * 0.50).toFixed(0)),
    stopLossRule: 'Price closes BACK INSIDE the Opening Range (price-based stop)',
    breakevens: [
      parseFloat((side === 'call' ? longStrike + netDebit : longStrike - netDebit).toFixed(2))
    ],
    wingWidth: width, ivr, vix, spxPrice: spx,
    management: [
      'Close if price re-enters OR after breakout',
      'Time stop: 2:00 PM ET if not at target',
      'Hard exit: 3:45 PM ET',
    ],
    conditions: [
      '30-min candle close beyond OR boundary required',
      'RVOL > 1.5× on breakout candle',
      'VWAP aligned with breakout direction',
    ],
    warnings: [],
  };
}

function buildButterflyPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(0);
  const expiryStr = formatExpiry(date, dte);
  const width = vix < 18 ? 5 : 10;
  const body = Math.round(spx / 5) * 5;  // ATM center
  const lowerWing = body - width;
  const upperWing = body + width;

  const legLower = priceleg(spx, lowerWing, dte, iv, 'call', 'buy',  `Long Call  ${lowerWing} (lower wing)`, expiryStr);
  const legBody1 = priceleg(spx, body,      dte, iv, 'call', 'sell', `Short Call ${body} ×2 (body)`,         expiryStr);
  const legUpper = priceleg(spx, upperWing, dte, iv, 'call', 'buy',  `Long Call  ${upperWing} (upper wing)`, expiryStr);

  const netDebit = parseFloat((legLower.premium - 2 * legBody1.premium + legUpper.premium).toFixed(2));
  const netDebitContract = Math.max(parseFloat((netDebit * 100).toFixed(0)), 25);
  const maxProfit = parseFloat(((width - netDebit) * 100).toFixed(0));

  return {
    strategyId: 'BUTTERFLY_PIN',
    strategyName: `0DTE Butterfly — Pin at ${body}`,
    category: 'options_day_trade', structure: 'Long Call Butterfly',
    direction: 'neutral', regime, compositeScore,
    entryTimeWindow: '11:00 AM – 2:00 PM ET',
    entryNote: `Center at max pain / highest OI strike / POC (${body}). Enter only after directional bias has been established or confirmed absent. Best when SPX oscillating near ${body}.`,
    legs: [legLower, legBody1, legBody1, legUpper].filter((_, i) => i !== 2).concat([
      { ...legBody1, label: `Short Call ${body} ×2 (body — sell 2)` },
    ]),
    netCredit: null, netDebit: netDebitContract,
    maxProfit, maxLoss: netDebitContract,
    profitTarget: parseFloat((netDebitContract * 0.75).toFixed(0)),
    profitTargetRule: '75% of debit paid (partial profit at max pain zone)',
    stopLoss: parseFloat((netDebitContract * 0.50).toFixed(0)),
    stopLossRule: '50% loss of debit paid ($' + (netDebitContract * 0.5).toFixed(0) + ')',
    breakevens: [
      parseFloat((lowerWing + netDebit).toFixed(2)),
      parseFloat((upperWing - netDebit).toFixed(2)),
    ],
    wingWidth: width, ivr, vix, spxPrice: spx,
    management: [
      'Do NOT hold through 3:45 PM ET — pin risk becomes binary',
      'Take partial profits if center strike tested before 2 PM',
      'Hard exit: 3:45 PM ET',
    ],
    conditions: [
      `Center strike ${body} = max pain / POC / highest gamma`,
      'Composite score between −1.5 and +1.5 (neutral)',
      'Enter between 11:00 AM and 2:00 PM only',
    ],
    warnings: Math.abs(compositeScore) > 1.5 ? ['Score indicates directional bias — butterfly not ideal, consider debit spread instead'] : [],
  };
}

function buildRSI2SwingPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(14);
  const expiryStr = formatExpiry(date, dte);
  const width = 25;

  const longStrike  = Math.round(spx / 5) * 5;
  const shortStrike = longStrike - width;

  const longLeg  = priceleg(spx, longStrike,  dte, iv, 'call', 'buy',  `Long Call  ${longStrike} (ATM)`,        expiryStr);
  const shortLeg = priceleg(spx, shortStrike, dte, iv, 'call', 'sell', `Short Call ${shortStrike} (OTM wing)`,  expiryStr);

  const netDebit = parseFloat((longLeg.premium - shortLeg.premium).toFixed(2));
  const netDebitContract = parseFloat((netDebit * 100).toFixed(0));

  return {
    strategyId: 'RSI2_MEAN_REVERSION',
    strategyName: 'RSI(2) Mean Reversion — Swing Call Spread',
    category: 'options_swing', structure: 'Bull Call Debit Spread',
    direction: 'bullish', regime, compositeScore,
    entryTimeWindow: 'Any time during regular session',
    entryNote: `Confirm RSI(2) ≤ 10 on daily chart AND SPX > 200-day SMA (${spx.toFixed(0)}). Enter on close or next-day open. Composite score ${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(2)} supports macro backdrop.`,
    legs: [longLeg, shortLeg],
    netCredit: null, netDebit: netDebitContract,
    maxProfit: parseFloat(((width - netDebit) * 100).toFixed(0)),
    maxLoss: netDebitContract,
    profitTarget: parseFloat((netDebitContract * 1.0).toFixed(0)),
    profitTargetRule: `100% gain on spread OR price closes above 5-day SMA`,
    stopLoss: parseFloat((netDebitContract * 0.40).toFixed(0)),
    stopLossRule: `40% of debit lost OR price closes below 200-day SMA`,
    breakevens: [parseFloat((longStrike + netDebit).toFixed(2))],
    wingWidth: width, ivr, vix, spxPrice: spx,
    management: [
      `Primary exit: price closes above 5-day SMA (fastest mean reversion signal)`,
      `Secondary exit: RSI(2) > 65`,
      `Stop: 2× ATR(10) below entry price or 40% debit loss`,
      `Target hold: 2–6 trading days`,
    ],
    conditions: [
      `RSI(2) ≤ 10 required on daily close`,
      `SPX must be above 200-day SMA`,
      `Macro composite score > 0 preferred`,
    ],
    warnings: compositeScore < 0 ? ['Macro score negative — mean reversion has macro headwinds, reduce size'] : [],
  };
}

function buildEarningsCondorPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(7);
  const expiryStr = formatExpiry(date, dte);
  const wingWidth = 10;

  const shortPutStrike  = deltaToStrike(spx, iv, dte, 16, 'put');
  const shortCallStrike = deltaToStrike(spx, iv, dte, 16, 'call');
  const longPutStrike   = shortPutStrike - wingWidth;
  const longCallStrike  = shortCallStrike + wingWidth;

  const legs: OptionsLeg[] = [
    priceleg(spx, shortPutStrike,  dte, iv, 'put',  'sell', `Short Put  ${shortPutStrike}  (16Δ)`,      expiryStr),
    priceleg(spx, longPutStrike,   dte, iv, 'put',  'buy',  `Long Put   ${longPutStrike} (wing)`,       expiryStr),
    priceleg(spx, shortCallStrike, dte, iv, 'call', 'sell', `Short Call ${shortCallStrike} (16Δ)`,      expiryStr),
    priceleg(spx, longCallStrike,  dte, iv, 'call', 'buy',  `Long Call  ${longCallStrike} (wing)`,      expiryStr),
  ];

  const totalCredit = parseFloat(((legs[0].premium - legs[1].premium) + (legs[2].premium - legs[3].premium)).toFixed(2));
  const netCreditContract = parseFloat((totalCredit * 100).toFixed(0));
  const maxLoss = parseFloat(((wingWidth - totalCredit) * 100).toFixed(0));

  return {
    strategyId: 'EARNINGS_VOL_CRUSH',
    strategyName: 'Earnings IV Crush — Short Iron Condor',
    category: 'options_swing', structure: 'Short Iron Condor',
    direction: 'neutral', regime, compositeScore,
    entryTimeWindow: '1–3 trading days before earnings announcement',
    entryNote: `Enter ${dte} DTE (post-earnings expiry). Requires IVR ≥ 50 (current ≈${ivr}). Collect ≈1/3 of wing width. Verify: implied move vs historical avg move — do not trade if implied < historical.`,
    legs,
    netCredit: netCreditContract, netDebit: null,
    maxProfit: netCreditContract, maxLoss,
    profitTarget: parseFloat((netCreditContract * 0.50).toFixed(0)),
    profitTargetRule: '50% of credit received (close order)',
    stopLoss: parseFloat((netCreditContract * 2.0).toFixed(0)),
    stopLossRule: '200% of credit per side breached (2× the credit of that spread)',
    breakevens: [
      parseFloat((shortPutStrike - totalCredit).toFixed(2)),
      parseFloat((shortCallStrike + totalCredit).toFixed(2)),
    ],
    wingWidth, ivr, vix, spxPrice: spx,
    management: [
      'Target: 50% profit close order GTC from entry',
      'Close 2 days after earnings if not at target',
      'Do NOT hold through additional earnings if unexpected',
      `Max hold: ${dte} days to expiry`,
    ],
    conditions: [
      `IVR ≈ ${ivr} — ${ivr >= 50 ? '✓ sufficient for IV crush play' : '⚠ below 50, reduced edge'}`,
      'Compare implied move vs historical average — do not trade if implied < historical',
      'Liquid options chain required (< $0.10 bid/ask on short strikes)',
    ],
    warnings: ivr < 50 ? [`IVR ${ivr} < 50 — IV crush edge reduced, consider skipping`] : [],
  };
}

function buildVCPSwingPlan(
  spx: number, vix: number, iv: number, compositeScore: number, regime: string, ivr: number
): OptionsTradePlan {
  const { date, dte } = getExpiryDate(35);
  const expiryStr = formatExpiry(date, dte);
  const width = 50;
  const longStrike  = Math.round((spx * 1.01) / 5) * 5; // Slightly OTM call on breakout
  const shortStrike = longStrike + width;

  const longLeg  = priceleg(spx, longStrike,  dte, iv, 'call', 'buy',  `Long Call  ${longStrike} (near ATM)`, expiryStr);
  const shortLeg = priceleg(spx, shortStrike, dte, iv, 'call', 'sell', `Short Call ${shortStrike} (OTM cap)`, expiryStr);

  const netDebit = parseFloat((longLeg.premium - shortLeg.premium).toFixed(2));
  const netDebitContract = parseFloat((netDebit * 100).toFixed(0));

  return {
    strategyId: 'MOMENTUM_VCP',
    strategyName: 'Momentum VCP Breakout — Bull Call Spread',
    category: 'options_swing', structure: 'Bull Call Debit Spread',
    direction: 'bullish', regime, compositeScore,
    entryTimeWindow: 'On breakout day — buy on volume confirmation (RVOL > 2×)',
    entryNote: `Enter on VCP breakout above pivot with 2–3× average volume. ${dte} DTE gives time for follow-through. Composite score ${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(2)} confirms macro tailwind.`,
    legs: [longLeg, shortLeg],
    netCredit: null, netDebit: netDebitContract,
    maxProfit: parseFloat(((width - netDebit) * 100).toFixed(0)),
    maxLoss: netDebitContract,
    profitTarget: parseFloat((netDebitContract * 1.0).toFixed(0)),
    profitTargetRule: '100% gain (spread doubles)',
    stopLoss: parseFloat((netDebitContract * 0.40).toFixed(0)),
    stopLossRule: '40% of debit lost OR price closes below VCP pivot',
    breakevens: [parseFloat((longStrike + netDebit).toFixed(2))],
    wingWidth: width, ivr, vix, spxPrice: spx,
    management: [
      'Trail stop to pivot after 10% gain',
      'Scale out 50% at first target',
      'Let runner work toward short strike',
      `Max hold: ${dte} days`,
    ],
    conditions: [
      'Minervini trend template satisfied (all MAs aligned)',
      'Within 15% of 52-week high',
      '2–6 VCP contractions with decreasing volume',
      'Breakout on 2–3× average volume',
    ],
    warnings: compositeScore < 1.5 ? ['Composite score < 1.5 — momentum may lack macro support'] : [],
  };
}

// ─── Main Route ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [snapshot, inputs] = await Promise.all([
      fetchMarketSnapshot(),
      fetchSignalStackInputs(),
    ]);

    const spx = snapshot.spx.price || 5800;
    const vix = snapshot.vix.price || inputs.vixLevel || 18;
    const iv = vix / 100;
    const ivr = Math.max(0, Math.min(100, Math.round(((vix - 10) / 30) * 100)));

    const regimeResult = computeCompositeScore({
      spxPrice:             inputs.spxPrice,
      spx200sma:            inputs.spx200sma,
      breadthPctAbove200:   inputs.breadthPctAbove200,
      hySpreadBps:          inputs.hySpreadBps,
      vixLevel:             vix,
      gexValue:             inputs.gexValue,
      pcrValue:             inputs.pcrValue,
      vvixLevel:            inputs.vvixLevel,
      dxyLevel:             inputs.dxyLevel,
      wti4wkChangePct:      inputs.wti4wkChangePct,
      goldWeeklyChangePct:  inputs.goldWeeklyChangePct,
    });

    const { activeStrategies } = selectOptionsStrategies(
      regimeResult.regime, regimeResult.compositeScore, ivr
    );

    const activeIds = new Set(activeStrategies.map(s => s.id));
    const score = regimeResult.compositeScore;
    const regime = regimeResult.regime;

    // Build plans only for active strategies (plus always include key reference plans)
    const plans: OptionsTradePlan[] = [];

    // Always include top day-trade and top swing if market conditions support them
    const inCondor = regime === 'RANGE_BOUND' || Math.abs(score) <= 1.5;
    const inDirectional = Math.abs(score) > 1.0;

    if (inCondor && vix < 35)
      plans.push(buildIronCondorPlan(spx, vix, iv, score, regime, ivr));

    if (inDirectional || activeIds.has('GEX_DIRECTIONAL_DEBIT'))
      plans.push(buildDirectionalDebitPlan(spx, vix, iv, score, regime, ivr));

    if (activeIds.has('ORB_OPTIONS') || inDirectional)
      plans.push(buildORBOptionsPlan(spx, vix, iv, score, regime, ivr));

    if (inCondor && vix < 30)
      plans.push(buildButterflyPlan(spx, vix, iv, score, regime, ivr));

    // Swing plans
    if (score > 0 || activeIds.has('RSI2_MEAN_REVERSION'))
      plans.push(buildRSI2SwingPlan(spx, vix, iv, score, regime, ivr));

    if (activeIds.has('EARNINGS_VOL_CRUSH') || ivr >= 40)
      plans.push(buildEarningsCondorPlan(spx, vix, iv, score, regime, ivr));

    if (score > 1.5 && activeIds.has('MOMENTUM_VCP'))
      plans.push(buildVCPSwingPlan(spx, vix, iv, score, regime, ivr));

    // Deduplicate by strategyId
    const unique = Array.from(new Map(plans.map(p => [p.strategyId, p])).values());

    return NextResponse.json({
      success: true,
      data: {
        plans: unique,
        regime: regimeResult.regime,
        compositeScore: score,
        spx, vix, ivr,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
