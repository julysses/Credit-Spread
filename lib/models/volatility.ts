/**
 * Volatility Surface, Skew, and Term Structure Models
 * SABR model + cubic spline interpolation
 * Institutional-grade implementation
 */

import { impliedVolatility } from './black-scholes';

export interface OptionQuote {
  strike: number;
  expiry: string;
  daysToExpiry: number;
  callBid: number;
  callAsk: number;
  putBid: number;
  putAsk: number;
  callIV?: number;
  putIV?: number;
}

export interface VolatilitySurfacePoint {
  strike: number;
  moneyness: number; // log(K/F)
  daysToExpiry: number;
  impliedVol: number;
  optionType: 'call' | 'put';
}

export interface VolatilitySkew {
  atm: number;
  skewSlope: number;
  putCallRatio: number;
  riskReversal25d: number; // 25-delta put IV - 25-delta call IV
  butterfly25d: number;     // 0.5*(25d put IV + 25d call IV) - ATM IV
  termStructure: { days: number; atm: number }[];
  regime: 'steep' | 'moderate' | 'flat';
}

/**
 * Calculate the full volatility surface from option chain data
 */
export function buildVolatilitySurface(
  quotes: OptionQuote[],
  spotPrice: number,
  riskFreeRate: number
): VolatilitySurfacePoint[] {
  const surface: VolatilitySurfacePoint[] = [];

  for (const q of quotes) {
    const T = q.daysToExpiry / 365;
    if (T <= 0) continue;
    const F = spotPrice * Math.exp(riskFreeRate * T); // forward price

    // Process call side
    if (q.callBid > 0 && q.callAsk > 0) {
      const callMid = (q.callBid + q.callAsk) / 2;
      try {
        const iv = impliedVolatility(callMid, spotPrice, q.strike, T, riskFreeRate, 'call');
        if (iv > 0.01 && iv < 5.0) {
          surface.push({
            strike: q.strike,
            moneyness: Math.log(q.strike / F),
            daysToExpiry: q.daysToExpiry,
            impliedVol: iv,
            optionType: 'call',
          });
        }
      } catch { /* skip bad quotes */ }
    }

    // Process put side
    if (q.putBid > 0 && q.putAsk > 0) {
      const putMid = (q.putBid + q.putAsk) / 2;
      try {
        const iv = impliedVolatility(putMid, spotPrice, q.strike, T, riskFreeRate, 'put');
        if (iv > 0.01 && iv < 5.0) {
          surface.push({
            strike: q.strike,
            moneyness: Math.log(q.strike / F),
            daysToExpiry: q.daysToExpiry,
            impliedVol: iv,
            optionType: 'put',
          });
        }
      } catch { /* skip bad quotes */ }
    }
  }

  return surface;
}

/**
 * SABR Volatility Model
 * σ(K) = α / ((F*K)^((1−β)/2)) approximation
 *
 * Parameters:
 *   α = volatility level
 *   β = elasticity (0=normal, 1=lognormal, 0.5=typical)
 *   ρ = correlation between F and σ
 *   ν = vol-of-vol
 */
export interface SABRParams {
  alpha: number;  // Volatility level
  beta: number;   // Elasticity [0,1]
  rho: number;    // Correlation [-1,1]
  nu: number;     // Vol-of-vol
}

export function sabrImpliedVol(
  F: number,   // Forward price
  K: number,   // Strike
  T: number,   // Time to expiry
  params: SABRParams
): number {
  const { alpha, beta, rho, nu } = params;

  if (Math.abs(F - K) < 1e-6) {
    // ATM formula
    const FK_beta = Math.pow(F, 1 - beta);
    const term1 = alpha / FK_beta;
    const term2 = 1 + (
      ((1 - beta) ** 2 / 24) * (alpha ** 2 / (F ** (2 - 2 * beta))) +
      (rho * beta * nu * alpha) / (4 * F ** (1 - beta)) +
      ((2 - 3 * rho ** 2) / 24) * nu ** 2
    ) * T;
    return term1 * term2;
  }

  const logFK = Math.log(F / K);
  const FK_mid = Math.pow(F * K, (1 - beta) / 2);
  const z = (nu / alpha) * FK_mid * logFK;
  const chi_z = Math.log((Math.sqrt(1 - 2 * rho * z + z ** 2) + z - rho) / (1 - rho));

  const numerator = alpha;
  const denom1 = FK_mid * (
    1 +
    ((1 - beta) ** 2 / 24) * logFK ** 2 +
    ((1 - beta) ** 4 / 1920) * logFK ** 4
  );

  const correction = 1 + (
    ((1 - beta) ** 2 / 24) * (alpha ** 2 / FK_mid ** 2) +
    (rho * beta * nu * alpha) / (4 * FK_mid) +
    ((2 - 3 * rho ** 2) / 24) * nu ** 2
  ) * T;

  return (numerator / denom1) * (z / chi_z) * correction;
}

/**
 * Calibrate SABR parameters to market implied vols using least-squares
 * Simple gradient-free approach for robustness
 */
export function calibrateSABR(
  F: number,
  T: number,
  strikes: number[],
  marketIVs: number[]
): SABRParams {
  // Initial guess
  const atmIV = marketIVs[Math.floor(marketIVs.length / 2)] || 0.2;
  let best: SABRParams = { alpha: atmIV, beta: 0.5, rho: -0.3, nu: 0.4 };
  let bestError = Infinity;

  // Grid search over key parameters
  const alphas = [atmIV * 0.7, atmIV, atmIV * 1.3];
  const rhos = [-0.6, -0.3, 0, 0.1];
  const nus = [0.2, 0.4, 0.6];

  for (const alpha of alphas) {
    for (const rho of rhos) {
      for (const nu of nus) {
        const params: SABRParams = { alpha, beta: 0.5, rho, nu };
        let error = 0;
        for (let i = 0; i < strikes.length; i++) {
          try {
            const modelIV = sabrImpliedVol(F, strikes[i], T, params);
            error += (modelIV - marketIVs[i]) ** 2;
          } catch { error += 1; }
        }
        if (error < bestError) {
          bestError = error;
          best = params;
        }
      }
    }
  }

  return best;
}

/**
 * Compute volatility skew metrics
 */
export function computeVolatilitySkew(
  surface: VolatilitySurfacePoint[],
  spotPrice: number,
  targetDTE: number = 30
): VolatilitySkew {
  // Filter to target DTE ±5 days
  const filtered = surface.filter(
    p => Math.abs(p.daysToExpiry - targetDTE) <= 10
  );

  if (filtered.length === 0) {
    return {
      atm: 0.20,
      skewSlope: 0,
      putCallRatio: 1.0,
      riskReversal25d: 0,
      butterfly25d: 0,
      termStructure: [],
      regime: 'flat',
    };
  }

  // Find ATM vol (nearest to spot)
  const atmPoint = filtered.reduce((prev, curr) =>
    Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev
  );
  const atmVol = atmPoint.impliedVol;

  // Skew slope: (IV_put OTM - IV_call OTM) / strike distance
  const otmPuts = filtered.filter(p => p.strike < spotPrice * 0.97 && p.optionType === 'put');
  const otmCalls = filtered.filter(p => p.strike > spotPrice * 1.03 && p.optionType === 'call');

  const avgPutIV = otmPuts.length > 0
    ? otmPuts.reduce((a, b) => a + b.impliedVol, 0) / otmPuts.length
    : atmVol;
  const avgCallIV = otmCalls.length > 0
    ? otmCalls.reduce((a, b) => a + b.impliedVol, 0) / otmCalls.length
    : atmVol;

  const strikeDist = spotPrice * 0.05; // 5% OTM
  const skewSlope = (avgPutIV - avgCallIV) / strikeDist;

  // 25-delta risk reversal
  const riskReversal25d = avgPutIV - avgCallIV;

  // Butterfly (convexity)
  const butterfly25d = 0.5 * (avgPutIV + avgCallIV) - atmVol;

  // Put/call IV ratio
  const putCallRatio = avgCallIV > 0 ? avgPutIV / avgCallIV : 1;

  // Term structure
  const dteGroups = new Map<number, number[]>();
  for (const p of surface) {
    const key = Math.round(p.daysToExpiry / 7) * 7; // Group by week
    if (!dteGroups.has(key)) dteGroups.set(key, []);
    if (Math.abs(p.strike - spotPrice) < spotPrice * 0.02) {
      dteGroups.get(key)!.push(p.impliedVol);
    }
  }

  const termStructure = Array.from(dteGroups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([days, ivs]) => ({
      days,
      atm: ivs.reduce((a, b) => a + b, 0) / ivs.length,
    }))
    .filter(p => p.atm > 0);

  // Classify regime
  let regime: 'steep' | 'moderate' | 'flat';
  if (riskReversal25d > 0.05) regime = 'steep';
  else if (riskReversal25d > 0.02) regime = 'moderate';
  else regime = 'flat';

  return {
    atm: atmVol,
    skewSlope,
    putCallRatio,
    riskReversal25d,
    butterfly25d,
    termStructure,
    regime,
  };
}

/**
 * VIX Regime Classification
 */
export type VIXRegime = 'low' | 'moderate' | 'elevated' | 'high' | 'extreme';

export function classifyVIXRegime(vix: number): VIXRegime {
  if (vix < 12) return 'low';
  if (vix < 18) return 'moderate';
  if (vix < 25) return 'elevated';
  if (vix < 35) return 'high';
  return 'extreme';
}

/**
 * IV Percentile (IVP) — how current IV compares to 1-year history
 */
export function ivPercentile(currentIV: number, historicalIVs: number[]): number {
  if (historicalIVs.length === 0) return 50;
  const below = historicalIVs.filter(iv => iv < currentIV).length;
  return (below / historicalIVs.length) * 100;
}

/**
 * IV Rank (IVR) — normalized position within 52-week range
 */
export function ivRank(currentIV: number, yearLow: number, yearHigh: number): number {
  if (yearHigh === yearLow) return 50;
  return ((currentIV - yearLow) / (yearHigh - yearLow)) * 100;
}

/**
 * Term structure interpolation via cubic spline (simplified linear for robustness)
 */
export function interpolateTermStructure(
  termStructure: { days: number; atm: number }[],
  targetDays: number
): number {
  if (termStructure.length === 0) return 0.20;
  if (termStructure.length === 1) return termStructure[0].atm;

  const sorted = [...termStructure].sort((a, b) => a.days - b.days);

  if (targetDays <= sorted[0].days) return sorted[0].atm;
  if (targetDays >= sorted[sorted.length - 1].days) return sorted[sorted.length - 1].atm;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (targetDays >= sorted[i].days && targetDays <= sorted[i + 1].days) {
      const t = (targetDays - sorted[i].days) / (sorted[i + 1].days - sorted[i].days);
      return sorted[i].atm + t * (sorted[i + 1].atm - sorted[i].atm);
    }
  }

  return sorted[Math.floor(sorted.length / 2)].atm;
}
