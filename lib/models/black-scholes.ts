/**
 * Black-Scholes Option Pricing Model
 * Institutional-grade implementation for SPX options desk
 */

// Standard Normal CDF using Hart's approximation (accurate to 7 decimal places)
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// Standard Normal PDF
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BSInputs {
  S: number;   // Spot price
  K: number;   // Strike price
  T: number;   // Time to expiration in years
  r: number;   // Risk-free rate (annualized)
  sigma: number; // Implied volatility (annualized)
  optionType: 'call' | 'put';
}

export interface BSOutput {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  d1: number;
  d2: number;
  probabilityITM: number;
  probabilityOTM: number;
}

export function calculateD1D2(S: number, K: number, T: number, r: number, sigma: number): { d1: number; d2: number } {
  if (T <= 0) return { d1: Infinity, d2: Infinity };
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

export function blackScholes(inputs: BSInputs): BSOutput {
  const { S, K, T, r, sigma, optionType } = inputs;

  if (T <= 0) {
    const intrinsic = optionType === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return {
      price: intrinsic, delta: optionType === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0, theta: 0, vega: 0, rho: 0, d1: 0, d2: 0,
      probabilityITM: optionType === 'call' ? (S > K ? 1 : 0) : (S < K ? 1 : 0),
      probabilityOTM: optionType === 'call' ? (S > K ? 0 : 1) : (S < K ? 0 : 1),
    };
  }

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const discountFactor = Math.exp(-r * T);

  let price: number;
  let delta: number;
  let probabilityITM: number;
  let probabilityOTM: number;

  if (optionType === 'call') {
    price = S * normalCDF(d1) - K * discountFactor * normalCDF(d2);
    delta = normalCDF(d1);
    probabilityITM = normalCDF(d2);
    probabilityOTM = 1 - normalCDF(d2);
  } else {
    price = K * discountFactor * normalCDF(-d2) - S * normalCDF(-d1);
    delta = normalCDF(d1) - 1;
    probabilityITM = normalCDF(-d2);
    probabilityOTM = 1 - normalCDF(-d2);
  }

  // Greeks
  const gamma = normalPDF(d1) / (S * sigma * sqrtT);
  const theta = (
    -(S * normalPDF(d1) * sigma) / (2 * sqrtT) -
    r * K * discountFactor * (optionType === 'call' ? normalCDF(d2) : normalCDF(-d2))
  ) / 365;
  const vega = S * normalPDF(d1) * sqrtT / 100;
  const rho = optionType === 'call'
    ? K * T * discountFactor * normalCDF(d2) / 100
    : -K * T * discountFactor * normalCDF(-d2) / 100;

  return { price, delta, gamma, theta, vega, rho, d1, d2, probabilityITM, probabilityOTM };
}

/**
 * Implied Volatility solver using Newton-Raphson method
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  optionType: 'call' | 'put',
  maxIterations = 100,
  tolerance = 1e-6
): number {
  if (T <= 0) return 0;

  // Initial guess using Brenner-Subrahmanyam approximation
  let sigma = Math.sqrt(2 * Math.PI / T) * marketPrice / S;
  if (sigma <= 0 || isNaN(sigma)) sigma = 0.2;

  for (let i = 0; i < maxIterations; i++) {
    const bs = blackScholes({ S, K, T, r, sigma, optionType });
    const diff = bs.price - marketPrice;
    if (Math.abs(diff) < tolerance) break;
    const vega = bs.vega * 100; // convert back from per 1% to per 1
    if (Math.abs(vega) < 1e-10) break;
    sigma = sigma - diff / vega;
    if (sigma <= 0) sigma = 0.001;
  }

  return sigma;
}

/**
 * Probability of touch approximation
 * Institutional approximation: P(touch) ≈ 2 × P(ITM)
 */
export function probabilityOfTouch(delta: number): number {
  return Math.min(2 * Math.abs(delta), 1.0);
}

/**
 * Credit Spread Expected Value
 */
export function creditSpreadEV(
  probabilityProfit: number,
  creditReceived: number,
  spreadWidth: number
): { ev: number; maxProfit: number; maxLoss: number; probabilityLoss: number } {
  const probabilityLoss = 1 - probabilityProfit;
  const maxProfit = creditReceived;
  const maxLoss = spreadWidth - creditReceived;
  const ev = (probabilityProfit * maxProfit) - (probabilityLoss * maxLoss);
  return { ev, maxProfit, maxLoss, probabilityLoss };
}

/**
 * Kelly Criterion Position Sizing
 */
export function kellyCriterion(
  probabilityWin: number,
  payoffRatio: number
): number {
  const q = 1 - probabilityWin;
  const f = (payoffRatio * probabilityWin - q) / payoffRatio;
  return Math.max(0, Math.min(f, 0.25)); // Cap at 25% Kelly
}

/**
 * Lognormal probability of finishing below strike
 */
export function lognormalProbabilityBelow(
  S: number,
  K: number,
  T: number,
  mu: number,
  sigma: number
): number {
  if (T <= 0) return S < K ? 1 : 0;
  const z = (Math.log(K / S) - (mu - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalCDF(z);
}

/**
 * Expected Move calculation
 */
export function expectedMove(
  S: number,
  iv: number,
  daysToExpiry: number
): number {
  return S * iv * Math.sqrt(daysToExpiry / 365);
}

/**
 * ATM straddle expected move approximation
 */
export function straddleExpectedMove(atmCallPrice: number, atmPutPrice: number): number {
  return atmCallPrice + atmPutPrice;
}

/**
 * Inverse Normal CDF (Peter Acklam's rational approximation, max error < 4.5e-4)
 */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * Find the strike (rounded to nearest 5) that produces a given delta.
 * targetDelta: positive fraction (e.g. 0.10 = 10-delta).
 *   For puts pass side='put' — internally treated as negative delta.
 *   For calls pass side='call' — positive delta.
 */
export function strikeByDelta(
  S: number,
  T: number,
  sigma: number,
  targetDelta: number,  // positive fraction, e.g. 0.10
  side: 'put' | 'call',
): number {
  if (T <= 0 || sigma <= 0) return Math.round(S / 5) * 5;
  // Put delta = N(d1) - 1  → d1 = N⁻¹(1 - targetDelta)
  // Call delta = N(d1)     → d1 = N⁻¹(targetDelta)
  const d1 = side === 'call'
    ? normalInv(targetDelta)
    : normalInv(1 - targetDelta);
  // Solve for K from d1 = (ln(S/K) + 0.5σ²T) / (σ√T)  (r=0)
  const K = S * Math.exp(-(d1 * sigma * Math.sqrt(T)) + 0.5 * sigma * sigma * T);
  return Math.round(K / 5) * 5;
}

/**
 * Binary-search for the strike (rounded to nearest 5) where BS option price ≈ targetPrice.
 * Useful for SchwartzIC "Dollar Rule" (find strike yielding ~$1.00 credit).
 */
export function strikeByPrice(
  S: number,
  T: number,
  sigma: number,
  targetPrice: number,
  side: 'put' | 'call',
): number {
  if (T <= 0 || sigma <= 0) return Math.round(S / 5) * 5;
  // Binary search over strike distance from ATM (0 to 3 expected moves)
  const expectedMove = S * sigma * Math.sqrt(T);
  let lo = side === 'put' ? S - 3 * expectedMove : S;
  let hi = side === 'put' ? S : S + 3 * expectedMove;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const price = blackScholes({ S, K: mid, T, r: 0, sigma, optionType: side }).price;
    if (side === 'put') {
      // deeper ITM = higher price → search left of spot for OTM puts (K < S)
      if (price > targetPrice) lo = mid; else hi = mid;
    } else {
      if (price > targetPrice) hi = mid; else lo = mid;
    }
    if (Math.abs(price - targetPrice) < 0.01) break;
  }
  return Math.round(((lo + hi) / 2) / 5) * 5;
}
