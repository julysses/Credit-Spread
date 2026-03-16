/**
 * Monte Carlo Simulation Engine
 * Geometric Brownian Motion for SPX price path simulation
 * Institutional-grade implementation
 */

import { normalCDF } from './black-scholes';

// Box-Muller transform for generating standard normal random numbers
function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export interface MonteCarloInputs {
  spotPrice: number;       // Current SPX price
  impliedVolatility: number; // Annualized IV
  drift: number;           // Expected annual return (mu)
  daysToExpiry: number;    // Days to expiration
  numSimulations: number;  // Number of simulation paths
  timeSteps?: number;      // Steps per path (default = daysToExpiry * 8 for intraday)
  minuteMode?: boolean;    // True for intraday 30-90 min simulation
}

export interface SimulationResults {
  terminalPrices: number[];
  meanPrice: number;
  stdDev: number;
  percentile5: number;
  percentile10: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile90: number;
  percentile95: number;
  paths?: number[][];      // Only populated if numPaths requested
}

export interface SpreadProbabilities {
  probAboveStrike: number;
  probBelowStrike: number;
  probTouchStrike: number;
  probWithinRange: number;
  probProfit: number;
  expectedValue: number;
}

/**
 * Run Monte Carlo simulation using Geometric Brownian Motion
 * S_{t+1} = S_t * exp[(μ - ½σ²)Δt + σ√Δt * Z]
 */
export function runMonteCarlo(inputs: MonteCarloInputs): SimulationResults {
  const { spotPrice, impliedVolatility, drift, daysToExpiry, numSimulations, minuteMode } = inputs;

  const T = minuteMode
    ? (daysToExpiry / (6.5 * 60)) // Convert minutes to trading day fraction
    : daysToExpiry / 252;          // Convert days to trading years

  const timeSteps = inputs.timeSteps ?? (minuteMode ? daysToExpiry : Math.max(daysToExpiry, 1));
  const dt = T / timeSteps;

  const mu = drift;
  const sigma = impliedVolatility;
  const drift_adj = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const terminalPrices: number[] = new Array(numSimulations);

  for (let sim = 0; sim < numSimulations; sim++) {
    let price = spotPrice;

    for (let step = 0; step < timeSteps; step++) {
      const z = boxMuller();
      price = price * Math.exp(drift_adj + diffusion * z);
    }

    terminalPrices[sim] = price;
  }

  // Sort for percentile calculations
  const sorted = [...terminalPrices].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = (p: number) => sorted[Math.floor(p * n)];

  const mean = terminalPrices.reduce((a, b) => a + b, 0) / n;
  const variance = terminalPrices.reduce((a, b) => a + (b - mean) ** 2, 0) / n;

  return {
    terminalPrices,
    meanPrice: mean,
    stdDev: Math.sqrt(variance),
    percentile5: percentile(0.05),
    percentile10: percentile(0.10),
    percentile25: percentile(0.25),
    percentile50: percentile(0.50),
    percentile75: percentile(0.75),
    percentile90: percentile(0.90),
    percentile95: percentile(0.95),
  };
}

/**
 * Run Monte Carlo with sample paths (for visualization)
 */
export function runMonteCarloWithPaths(
  inputs: MonteCarloInputs,
  numPaths: number = 50
): { results: SimulationResults; paths: number[][] } {
  const { spotPrice, impliedVolatility, drift, daysToExpiry, minuteMode } = inputs;

  const T = minuteMode
    ? (daysToExpiry / (6.5 * 60))
    : daysToExpiry / 252;

  const timeSteps = inputs.timeSteps ?? Math.max(daysToExpiry, 1);
  const dt = T / timeSteps;

  const mu = drift;
  const sigma = impliedVolatility;
  const drift_adj = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const numSims = inputs.numSimulations;
  const terminalPrices: number[] = new Array(numSims);
  const paths: number[][] = [];

  for (let sim = 0; sim < numSims; sim++) {
    let price = spotPrice;
    const path = sim < numPaths ? [spotPrice] : null;

    for (let step = 0; step < timeSteps; step++) {
      const z = boxMuller();
      price = price * Math.exp(drift_adj + diffusion * z);
      if (path) path.push(price);
    }

    terminalPrices[sim] = price;
    if (path) paths.push(path);
  }

  const sorted = [...terminalPrices].sort((a, b) => a - b);
  const n = sorted.length;
  const percentile = (p: number) => sorted[Math.floor(p * n)];
  const mean = terminalPrices.reduce((a, b) => a + b, 0) / n;
  const variance = terminalPrices.reduce((a, b) => a + (b - mean) ** 2, 0) / n;

  const results: SimulationResults = {
    terminalPrices,
    meanPrice: mean,
    stdDev: Math.sqrt(variance),
    percentile5: percentile(0.05),
    percentile10: percentile(0.10),
    percentile25: percentile(0.25),
    percentile50: percentile(0.50),
    percentile75: percentile(0.75),
    percentile90: percentile(0.90),
    percentile95: percentile(0.95),
    paths,
  };

  return { results, paths };
}

/**
 * Calculate spread probabilities from simulation results
 */
export function calculateSpreadProbabilities(
  results: SimulationResults,
  shortStrike: number,
  longStrike: number,
  spreadType: 'call' | 'put',
  creditReceived: number
): SpreadProbabilities {
  const prices = results.terminalPrices;
  const n = prices.length;

  let probAbove = 0;
  let probBelow = 0;

  for (const price of prices) {
    if (price > shortStrike) probAbove++;
    else probBelow++;
  }

  probAbove /= n;
  probBelow /= n;

  const spreadWidth = Math.abs(longStrike - shortStrike);

  // For call spread: profit if price stays below short strike
  // For put spread: profit if price stays above short strike
  let probProfit: number;
  let probLoss: number;

  if (spreadType === 'call') {
    probProfit = probBelow;
    probLoss = probAbove;
  } else {
    probProfit = probAbove;
    probLoss = probBelow;
  }

  // Probability of touch ≈ 2 × probability ITM
  const probTouch = Math.min(2 * probLoss, 1.0);

  // Within range (between long and short strike)
  let withinRange = 0;
  for (const price of prices) {
    const low = Math.min(shortStrike, longStrike);
    const high = Math.max(shortStrike, longStrike);
    if (price >= low && price <= high) withinRange++;
  }
  const probWithinRange = withinRange / n;

  const maxProfit = creditReceived;
  const maxLoss = spreadWidth - creditReceived;
  const ev = (probProfit * maxProfit) - (probLoss * maxLoss);

  return {
    probAboveStrike: probAbove,
    probBelowStrike: probBelow,
    probTouchStrike: probTouch,
    probWithinRange,
    probProfit,
    expectedValue: ev,
  };
}

/**
 * Intraday volatility crush simulation
 * Simulates 30-90 minute price paths for vol crush strategy
 */
export function intradayMonteCarloSimulation(
  spotPrice: number,
  currentIV: number,
  targetMinutes: number,
  numSimulations: number = 10000
): SimulationResults {
  const tradingMinutesPerDay = 390;
  const dt = 1 / tradingMinutesPerDay;
  const timeSteps = targetMinutes;

  // Risk-neutral drift = 0 for short intraday horizon
  const mu = 0;
  const sigma = currentIV;
  const drift_adj = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const terminalPrices: number[] = new Array(numSimulations);

  for (let sim = 0; sim < numSimulations; sim++) {
    let price = spotPrice;
    for (let step = 0; step < timeSteps; step++) {
      const z = boxMuller();
      price = price * Math.exp(drift_adj + diffusion * z);
    }
    terminalPrices[sim] = price;
  }

  const sorted = [...terminalPrices].sort((a, b) => a - b);
  const n = sorted.length;
  const percentile = (p: number) => sorted[Math.floor(p * n)];
  const mean = terminalPrices.reduce((a, b) => a + b, 0) / n;
  const variance = terminalPrices.reduce((a, b) => a + (b - mean) ** 2, 0) / n;

  return {
    terminalPrices,
    meanPrice: mean,
    stdDev: Math.sqrt(variance),
    percentile5: percentile(0.05),
    percentile10: percentile(0.10),
    percentile25: percentile(0.25),
    percentile50: percentile(0.50),
    percentile75: percentile(0.75),
    percentile90: percentile(0.90),
    percentile95: percentile(0.95),
  };
}

/**
 * Build histogram data for terminal price distribution
 */
export function buildPriceHistogram(
  terminalPrices: number[],
  numBuckets: number = 50
): { bucket: number; count: number; frequency: number }[] {
  const min = Math.min(...terminalPrices);
  const max = Math.max(...terminalPrices);
  const bucketSize = (max - min) / numBuckets;
  const buckets = new Array(numBuckets).fill(0);

  for (const price of terminalPrices) {
    const idx = Math.min(Math.floor((price - min) / bucketSize), numBuckets - 1);
    buckets[idx]++;
  }

  const n = terminalPrices.length;
  return buckets.map((count, i) => ({
    bucket: min + (i + 0.5) * bucketSize,
    count,
    frequency: count / n,
  }));
}
