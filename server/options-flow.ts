/**
 * Options Flow Scanner
 * Detects unusual options activity across individual stocks.
 * Primary: MarketData.app options chain endpoint
 * Fallback: mock data when MARKETDATA_API_KEY is not configured
 */

import axios from 'axios';
import { fetchEarningsCalendar } from './finnhub';

const MD_BASE = 'https://api.marketdata.app/v1';

function mdHeaders() {
  return {
    Authorization: `Token ${process.env.MARKETDATA_API_KEY ?? ''}`,
    Accept: 'application/json',
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptionsFlowAlert {
  symbol: string;
  alertType: 'unusual_call' | 'unusual_put' | 'squeeze_setup' | 'dark_pool';
  strike: number;
  expiry: string;
  daysToExpiry: number;
  premium: number;        // mid-price × volume × 100 (total $ value)
  volume: number;
  openInterest: number;
  volumeOiRatio: number;  // volume / open interest
  impliedVolatility: number;
  sentiment: 'bullish' | 'bearish';
  notes: string;
}

export interface StockFlowSummary {
  symbol: string;
  flowScore: number;       // 0–15
  sentiment: 'bullish' | 'bearish' | 'neutral';
  unusualCallCount: number;
  unusualPutCount: number;
  putCallVolumeRatio: number;
  putCallOiRatio: number;
  ivRank: number;          // 0–100
  ivPercentile: number;    // 0–100
  impliedMoveEarnings: number; // % implied for upcoming earnings
  alerts: OptionsFlowAlert[];
}

// ─── MarketData.app Options Chain Fetch ───────────────────────────────────────

interface MDOptionQuote {
  optionSymbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  side: 'call' | 'put';
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  volume: number;
  openInterest: number;
  dte: number;
}

async function fetchOptionsChain(symbol: string): Promise<MDOptionQuote[]> {
  try {
    const resp = await axios.get(`${MD_BASE}/options/chain/${symbol}/`, {
      headers: mdHeaders(),
      params: { dte: '7-90', strikeLimit: 20 },
      timeout: 10000,
    });
    const d = resp.data;
    if (!d || d.s === 'error') return [];

    const fields = ['optionSymbol','underlying','expiration','strike','side','bid','ask','iv','delta','volume','openInterest','dte'];
    const rows: MDOptionQuote[] = [];
    const len = Array.isArray(d[fields[0]]) ? d[fields[0]].length : 0;
    for (let i = 0; i < len; i++) {
      rows.push({
        optionSymbol: d.optionSymbol?.[i] ?? '',
        underlying:   d.underlying?.[i] ?? symbol,
        expiration:   d.expiration?.[i] ?? '',
        strike:       d.strike?.[i] ?? 0,
        side:         d.side?.[i] ?? 'call',
        bid:          d.bid?.[i] ?? 0,
        ask:          d.ask?.[i] ?? 0,
        iv:           d.iv?.[i] ?? 0,
        delta:        d.delta?.[i] ?? 0,
        volume:       d.volume?.[i] ?? 0,
        openInterest: d.openInterest?.[i] ?? 0,
        dte:          d.dte?.[i] ?? 0,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

// ─── Unusual Activity Detection ───────────────────────────────────────────────

function detectUnusualFlow(symbol: string, chain: MDOptionQuote[]): OptionsFlowAlert[] {
  const alerts: OptionsFlowAlert[] = [];

  for (const q of chain) {
    if (q.volume < 100) continue; // skip illiquid strikes
    const volOiRatio = q.openInterest > 0 ? q.volume / q.openInterest : q.volume;
    const mid        = (q.bid + q.ask) / 2;
    const totalValue = mid * q.volume * 100;

    // Unusual call: volume > 2× OI and significant dollar value
    if (q.side === 'call' && volOiRatio >= 2 && totalValue >= 25000) {
      alerts.push({
        symbol,
        alertType: 'unusual_call',
        strike:    q.strike,
        expiry:    q.expiration,
        daysToExpiry: q.dte,
        premium:   totalValue,
        volume:    q.volume,
        openInterest: q.openInterest,
        volumeOiRatio: parseFloat(volOiRatio.toFixed(2)),
        impliedVolatility: q.iv,
        sentiment: 'bullish',
        notes:     `${q.volume.toLocaleString()} contracts, ${(q.dte)}DTE, $${(totalValue/1000).toFixed(0)}K premium`,
      });
    }

    // Unusual put: volume > 2× OI and significant $
    if (q.side === 'put' && volOiRatio >= 2 && totalValue >= 25000) {
      alerts.push({
        symbol,
        alertType: 'unusual_put',
        strike:    q.strike,
        expiry:    q.expiration,
        daysToExpiry: q.dte,
        premium:   totalValue,
        volume:    q.volume,
        openInterest: q.openInterest,
        volumeOiRatio: parseFloat(volOiRatio.toFixed(2)),
        impliedVolatility: q.iv,
        sentiment: 'bearish',
        notes:     `${q.volume.toLocaleString()} contracts, ${q.dte}DTE, $${(totalValue/1000).toFixed(0)}K premium`,
      });
    }
  }

  // Sort by total premium descending
  return alerts.sort((a, b) => b.premium - a.premium).slice(0, 5);
}

function computeFlowScore(alerts: OptionsFlowAlert[], putCallVol: number): number {
  let score = 0;

  const bullishAlerts = alerts.filter(a => a.sentiment === 'bullish');
  const bearishAlerts = alerts.filter(a => a.sentiment === 'bearish');

  // Unusual call buying: up to 10 pts
  if (bullishAlerts.length >= 3) score += 10;
  else if (bullishAlerts.length === 2) score += 7;
  else if (bullishAlerts.length === 1) score += 4;

  // Call/put ratio: up to 5 pts
  if (putCallVol < 0.5) score += 5;       // very bullish flow
  else if (putCallVol < 0.7) score += 3;
  else if (putCallVol < 1.0) score += 1;

  // Penalize heavy put buying
  if (bearishAlerts.length >= 3) score = Math.max(0, score - 5);

  return Math.min(15, score);
}

// ─── Main Flow Analyzer ───────────────────────────────────────────────────────

export async function analyzeOptionsFlow(symbol: string): Promise<StockFlowSummary> {
  if (!process.env.MARKETDATA_API_KEY) return getMockFlowSummary(symbol);

  try {
    const chain = await fetchOptionsChain(symbol);
    if (chain.length === 0) return getMockFlowSummary(symbol);

    const calls = chain.filter(q => q.side === 'call');
    const puts  = chain.filter(q => q.side === 'put');

    const callVol = calls.reduce((s, q) => s + q.volume, 0);
    const putVol  = puts.reduce((s, q) => s + q.volume, 0);
    const callOI  = calls.reduce((s, q) => s + q.openInterest, 0);
    const putOI   = puts.reduce((s, q) => s + q.openInterest, 0);

    const putCallVolumeRatio = callVol > 0 ? parseFloat((putVol / callVol).toFixed(2)) : 1;
    const putCallOiRatio     = callOI > 0 ? parseFloat((putOI / callOI).toFixed(2)) : 1;

    const allIVs = chain.map(q => q.iv).filter(v => v > 0);
    const avgIV  = allIVs.length > 0 ? allIVs.reduce((a, b) => a + b, 0) / allIVs.length : 0;

    // Approximate IV rank (assume 0.2–0.8 range for typical stocks)
    const ivRank = avgIV > 0 ? Math.min(100, Math.max(0, ((avgIV - 0.2) / (0.8 - 0.2)) * 100)) : 50;

    const alerts    = detectUnusualFlow(symbol, chain);
    const flowScore = computeFlowScore(alerts, putCallVolumeRatio);

    const unusualCallCount = alerts.filter(a => a.alertType === 'unusual_call').length;
    const unusualPutCount  = alerts.filter(a => a.alertType === 'unusual_put').length;
    const sentiment: StockFlowSummary['sentiment'] =
      unusualCallCount > unusualPutCount ? 'bullish' :
      unusualPutCount  > unusualCallCount ? 'bearish' : 'neutral';

    // Implied earnings move: ATM straddle / strike at the expiry covering earnings
    let impliedMoveEarnings = 0;
    try {
      const calendar = await fetchEarningsCalendar();
      const today = new Date().toISOString().split('T')[0];
      const entry = calendar.find(e => e.symbol === symbol && e.date >= today);
      if (entry && chain.length > 0) {
        const earningsDate = entry.date;
        const expiries = [...new Set(chain.map(q => q.expiration))].sort();
        const targetExpiry = expiries.find(exp => exp >= earningsDate) ?? expiries[expiries.length - 1];
        const expiryChain = chain.filter(q => q.expiration === targetExpiry);
        const calls = expiryChain.filter(q => q.side === 'call');
        const puts  = expiryChain.filter(q => q.side === 'put');
        if (calls.length > 0 && puts.length > 0) {
          const atmCall = calls.reduce((best, q) =>
            Math.abs(q.delta - 0.5) < Math.abs(best.delta - 0.5) ? q : best
          );
          const atmPut = puts.find(q => q.strike === atmCall.strike);
          if (atmPut && atmCall.strike > 0) {
            const straddle = ((atmCall.bid + atmCall.ask) / 2) + ((atmPut.bid + atmPut.ask) / 2);
            impliedMoveEarnings = parseFloat((straddle / atmCall.strike * 100).toFixed(1));
          }
        }
      }
    } catch { /* ignore — non-critical */ }

    return {
      symbol,
      flowScore,
      sentiment,
      unusualCallCount,
      unusualPutCount,
      putCallVolumeRatio,
      putCallOiRatio,
      ivRank:              parseFloat(ivRank.toFixed(1)),
      ivPercentile:        parseFloat(ivRank.toFixed(1)),
      impliedMoveEarnings,
      alerts,
    };
  } catch (err) {
    console.error(`[options-flow] Failed for ${symbol}:`, (err as Error).message);
    return getMockFlowSummary(symbol);
  }
}

// ─── Batch Scanner ────────────────────────────────────────────────────────────

export async function scanOptionsFlowBatch(
  symbols: string[],
  concurrency = 5
): Promise<Map<string, StockFlowSummary>> {
  const results = new Map<string, StockFlowSummary>();
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += concurrency) {
    chunks.push(symbols.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(chunk.map(sym => analyzeOptionsFlow(sym)));
    for (let i = 0; i < chunk.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        results.set(chunk[i], r.value);
      } else {
        results.set(chunk[i], getMockFlowSummary(chunk[i]));
      }
    }
    // small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export function getMockFlowSummary(symbol: string): StockFlowSummary {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const bullish = seed % 3 !== 2;
  const callCount = bullish ? (seed % 3) + 1 : 0;
  const putCount  = bullish ? 0 : (seed % 2) + 1;

  const alerts: OptionsFlowAlert[] = [];
  for (let i = 0; i < callCount; i++) {
    alerts.push({
      symbol,
      alertType: 'unusual_call',
      strike:    Math.round((100 + seed % 100 + i * 10) / 5) * 5,
      expiry:    new Date(Date.now() + (21 + i * 14) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      daysToExpiry: 21 + i * 14,
      premium:   (seed % 10 + 1) * 50000,
      volume:    (seed % 20 + 5) * 100,
      openInterest: (seed % 10 + 1) * 50,
      volumeOiRatio: 2.5 + i * 0.5,
      impliedVolatility: 0.35 + i * 0.05,
      sentiment: 'bullish',
      notes: `${(seed % 20 + 5) * 100} contracts, ${21 + i * 14}DTE, $${((seed % 10 + 1) * 50)}K`,
    });
  }

  const pcr = bullish ? 0.4 + (seed % 3) * 0.1 : 1.2 + (seed % 3) * 0.2;
  return {
    symbol,
    flowScore:            computeFlowScore(alerts, pcr),
    sentiment:            bullish ? 'bullish' : 'bearish',
    unusualCallCount:     callCount,
    unusualPutCount:      putCount,
    putCallVolumeRatio:   pcr,
    putCallOiRatio:       pcr * 0.9,
    ivRank:               30 + (seed % 40),
    ivPercentile:         35 + (seed % 35),
    impliedMoveEarnings:  3 + (seed % 7),
    alerts,
  };
}
