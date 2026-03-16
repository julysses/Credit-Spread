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
