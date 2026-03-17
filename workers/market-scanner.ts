/**
 * Market Scanner Worker
 * Scans for trade setups every 5 minutes during market hours
 */

import { fetchMarketSnapshot, getMockMarketData } from '../server/market-data';
import { runStrategyEngine, selectStrategy, MarketConditions } from '../lib/models/strategy-engine';
import { classifyVIXRegime } from '../lib/models/volatility';
import { dispatchAlert, formatTradeAlert } from './alert-system';

function isMarketHours(): boolean {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = ny.getDay();
  const hour = ny.getHours();
  const min = ny.getMinutes();
  const timeNum = hour * 100 + min;
  return day >= 1 && day <= 5 && timeNum >= 930 && timeNum < 1600;
}

async function sendTradeAlert(strategy: string, decision: ReturnType<typeof runStrategyEngine>) {
  const rec = decision.recommendation;
  if (!rec || rec.tradeType === 'no_trade') return;

  const alertPhone = process.env.ALERT_PHONE;
  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertPhone && !alertEmail) return;

  const message = formatTradeAlert(
    strategy,
    rec.tradeType ?? '',
    rec.shortLeg?.strike ?? 0,
    rec.longLeg?.strike ?? 0,
    rec.credit ?? 0,
    rec.probOfProfit ?? 0,
    rec.expectedValue ?? 0
  );

  if (alertPhone) {
    await dispatchAlert({
      type: 'signal',
      title: `SPX Setup: ${strategy.replace(/_/g, ' ')}`,
      message,
      priority: 'high',
      channel: 'sms',
      phone: alertPhone,
    });
  }

  if (alertEmail) {
    await dispatchAlert({
      type: 'signal',
      title: `SPX Signal Desk: ${strategy.replace(/_/g, ' ')} Setup`,
      message,
      priority: 'high',
      channel: 'email',
      email: alertEmail,
    });
  }
}

async function scanMarket() {
  if (!isMarketHours()) {
    console.log('Market closed — skipping scan');
    return;
  }

  console.log(`[${new Date().toISOString()}] Scanning market...`);

  const snapshot = process.env.MARKETDATA_API_KEY
    ? await fetchMarketSnapshot()
    : getMockMarketData();

  const { spx, vix } = snapshot;
  const impliedVol = vix.price / 100;
  const ivRankValue = Math.min(100, Math.max(0, (vix.price - 12) / (40 - 12) * 100));

  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const timeNum = ny.getHours() * 100 + ny.getMinutes();

  const conditions: MarketConditions = {
    spxPrice: spx.price,
    spyPrice: snapshot.spy.price,
    vix: vix.price,
    vixRegime: classifyVIXRegime(vix.price),
    vixPctile: ivRankValue,
    ivRank: ivRankValue,
    directionalBias: 'neutral',
    marketRegime: Math.abs(spx.changePct) > 1.5 ? 'volatile' : 'range_bound',
    riskLevel: 'moderate',
    isMacroEventDay: false,
    isExpiry: false,
    timeOfDay: timeNum,
    spxDailyChange: spx.changePct || 0,
    technicalSignal: 'neutral',
    realizedVol: impliedVol * 0.85,
    impliedVol,
    skew: null,
  };

  const strategy = selectStrategy(conditions);
  console.log(`Strategy signal: ${strategy}`);

  const decision = runStrategyEngine(conditions);

  // Check for volatility crush setup (10:30-13:00 window)
  if (strategy === 'VOLATILITY_CRUSH') {
    console.log('*** VOLATILITY CRUSH ALERT — Optimal selling window ***');
    await sendTradeAlert(strategy, decision);
  }

  // Check for elevated IV opportunity
  if (ivRankValue >= 70) {
    console.log(`*** HIGH IV RANK ${ivRankValue.toFixed(0)} — Premium selling opportunity ***`);
    await sendTradeAlert(strategy, decision);
  }

  if (decision.recommendation?.confidence === 'high' && strategy !== 'NO_TRADE') {
    console.log(`HIGH CONFIDENCE SETUP: ${decision.recommendation.tradeType}`);
    console.log(`POP: ${(decision.recommendation.probOfProfit * 100).toFixed(1)}%`);
    console.log(`EV: $${decision.recommendation.expectedValue?.toFixed(2)}`);
  }
}

// Run scanner loop
async function runScanner() {
  console.log('=== SPX Signal Desk — Market Scanner Started ===');

  // Initial scan
  await scanMarket();

  // Scan every 5 minutes
  setInterval(async () => {
    await scanMarket();
  }, 5 * 60 * 1000);
}

runScanner();
