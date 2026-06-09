/**
 * Daily Growth Screener Worker
 * Runs at 6:00 AM ET — surfaces momentum, value+growth, and future mover candidates.
 * Uses unavailable data when API keys are absent; live data flows in once keys are configured.
 */

import { db } from '@/database/db';
import {
  stockCandidates,
  growthScans,
  optionsFlowAlerts,
  intelligenceDossiers,
  stockParameterSnapshots,
} from '@/database/schema';
import { ALL_GROWTH_SYMBOLS, SYMBOL_SECTOR_MAP } from '@/lib/constants/growth-universe';
import type { OHLCVBar } from '@/lib/models/stock-feature-engine';
import type { GrowthFeatures } from '@/lib/models/growth-screener';
import {
  fetchBulkKeyMetrics,
  fetchBulkRatios,
  fetchBulkScores,
  fetchBulkEarningsSurprises,
  fetchBulkGradesConsensus,
  fetchBulkPriceTargets,
  fetchBulkIncomeGrowth,
  getUnavailableFundamentals,
  fmpConfigured,
} from '@/server/fundamentals';
import { fetchMarketContext } from '@/server/sector-data';
import { fetchInstitutionalData } from '@/server/institutional';
import { scanOptionsFlowBatch } from '@/server/options-flow';
import {
  buildGrowthFeatures,
  scoreShortTermMomentum,
  scoreLongTermValueGrowth,
  scoreFutureMover,
} from '@/lib/models/growth-screener';
import { buildIntelligenceDossier } from '@/server/intelligence-dossier';
import { eq } from 'drizzle-orm';

// ─── Alpaca daily bars fetcher (reuse existing pattern) ───────────────────────

type AlpacaBar = { c: number; o: number; h: number; l: number; v: number; t: string };

function alpacaToOHLCV(b: AlpacaBar): OHLCVBar {
  return {
    timestamp: new Date(b.t).getTime() / 1000,
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
  };
}

async function fetchAlpacaBars(symbols: string[], days = 60): Promise<Map<string, OHLCVBar[]>> {
  const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
  const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET ?? process.env.ALPACA_SECRET_KEY;
  const result = new Map<string, OHLCVBar[]>();

  if (!ALPACA_API_KEY || !ALPACA_API_SECRET) {
    console.warn('[screener] Alpaca credentials unavailable — no synthetic bars generated');
    return result;
  }

  const end   = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const CHUNK = 100;

  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    try {
      const { default: axios } = await import('axios');
      const resp = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
        params: {
          symbols: chunk.join(','),
          timeframe: '1Day',
          start,
          end,
          limit: 1000,
          feed: 'iex',
        },
        headers: {
          'APCA-API-KEY-ID':     ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': ALPACA_API_SECRET,
        },
        timeout: 20000,
      });

      const barsMap = resp.data?.bars ?? {};
      for (const [sym, bars] of Object.entries(barsMap)) {
        result.set(sym, (bars as AlpacaBar[]).map(alpacaToOHLCV));
      }
    } catch (err) {
      console.warn(`[screener] Alpaca batch ${i}–${i + CHUNK} failed:`, (err as Error).message);
      // Do not synthesize bars. Missing symbols are skipped downstream.
    }

    if (i + CHUNK < symbols.length) await sleep(500);
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getSignalStackComposite(): number {
  // In production this would query the signal stack DB row for today.
  // For now return 0 (neutral) — screener will not be suppressed.
  return 0;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

async function run() {
  console.log('[screener] Starting daily growth scan…');
  const scanDate = new Date().toISOString().split('T')[0];
  const ranAt    = new Date();

  // ── Phase 1: Market Context ────────────────────────────────────────────────
  console.log('[screener] Phase 1 — market context');
  const signalStackComposite = getSignalStackComposite();

  const [marketCtx] = await Promise.all([
    fetchMarketContext(),
  ]);

  const maSymbols = new Set(marketCtx.maActivity.flatMap(d => [
    d.companyName.toUpperCase().slice(0, 5),
    d.targetedCompanyName.toUpperCase().slice(0, 5),
  ]));

  const congressBuySymbols = new Set(
    marketCtx.congressLatest
      .filter(t => t.type === 'purchase' && t.symbol)
      .map(t => t.symbol!)
  );

  const earningsMap = new Map(
    marketCtx.earningsCalendar.map(e => [
      e.symbol,
      Math.ceil((new Date(e.date).getTime() - Date.now()) / 86400000),
    ])
  );

  // ── Phase 2: Bulk Fundamentals ─────────────────────────────────────────────
  console.log('[screener] Phase 2 — bulk fundamentals');
  const year = new Date().getFullYear().toString();

  const [bulkMetrics, bulkRatios, bulkScores, bulkSurprises, bulkGrades, bulkTargets, bulkGrowth] =
    await Promise.all([
      fetchBulkKeyMetrics(),
      fetchBulkRatios(),
      fetchBulkScores(),
      fetchBulkEarningsSurprises(year),
      fetchBulkGradesConsensus(),
      fetchBulkPriceTargets(),
      fetchBulkIncomeGrowth(year, 'annual'),
    ]);

  // ── Phase 3: Technical Bars for All Tickers ────────────────────────────────
  console.log('[screener] Phase 3 — fetching bars for', ALL_GROWTH_SYMBOLS.length, 'tickers');
  const allBars = await fetchAlpacaBars(ALL_GROWTH_SYMBOLS, 252);
  const spyBars  = allBars.get('SPY');
  if (!spyBars || spyBars.length < 20) {
    throw new Error('SPY bars unavailable from Alpaca — growth scan blocked');
  }

  // ── Phase 4: Build Features & Initial Scoring ──────────────────────────────
  console.log('[screener] Phase 4 — scoring features');

  interface ScoredEntry {
    symbol: string;
    features: GrowthFeatures;  // non-null — checked before push
    shortScore: ReturnType<typeof scoreShortTermMomentum>;
    longScore: ReturnType<typeof scoreLongTermValueGrowth>;
    futureScore: ReturnType<typeof scoreFutureMover>;
    composite: number;
    fundamentals: ReturnType<typeof getUnavailableFundamentals>;
  }

  const scored: ScoredEntry[] = [];

  for (const symbol of ALL_GROWTH_SYMBOLS) {
    try {
      const bars = allBars.get(symbol);
      if (!bars || bars.length < 20) continue;

      // Assemble fundamentals from bulk data (no per-symbol call yet)
      const km  = bulkMetrics.get(symbol);
      const rat = bulkRatios.get(symbol);
      const sc  = bulkScores.get(symbol);
      const gr  = bulkGrowth.get(symbol);
      const sur = bulkSurprises.get(symbol);
      const pt  = bulkTargets.get(symbol);
      const grd = bulkGrades.get(symbol);

      const fundsBase = getUnavailableFundamentals(symbol);

      const fundamentals = {
        ...fundsBase,
        peRatio:              km?.peRatioTTM            ?? fundsBase.peRatio,
        pegRatio:             km?.pegRatioTTM           ?? fundsBase.pegRatio,
        psRatio:              km?.priceToSalesRatioTTM  ?? fundsBase.psRatio,
        evEbitda:             km?.enterpriseValueOverEBITDATTM ?? fundsBase.evEbitda,
        roe:                  (rat?.returnOnEquityTTM   ?? fundsBase.roe / 100) * 100,
        roa:                  (rat?.returnOnAssetsTTM   ?? fundsBase.roa / 100) * 100,
        grossMargin:          (rat?.grossProfitMarginTTM    ?? fundsBase.grossMargin / 100) * 100,
        operatingMargin:      (rat?.operatingProfitMarginTTM ?? fundsBase.operatingMargin / 100) * 100,
        netMargin:            (rat?.netProfitMarginTTM   ?? fundsBase.netMargin / 100) * 100,
        revenueGrowthYoy:     (gr?.revenueGrowth        ?? fundsBase.revenueGrowthYoy / 100) * 100,
        epsGrowthYoy:         (gr?.epsgrowth            ?? fundsBase.epsGrowthYoy / 100) * 100,
        earningsSurprisePct:  sur?.surprisePercent       ?? fundsBase.earningsSurprisePct,
        analystTargetPrice:   pt?.lastMonthAvgPriceTarget ?? fundsBase.analystTargetPrice,
        // Piotroski and Altman from bulk scores
        piotroskiScore:       sc?.piotroskiScore         ?? 5,
        altmanZScore:         sc?.altmanZScore           ?? 3,
        // Grades consensus
        analystBuyCount:      (grd?.strongBuy ?? 0) + (grd?.buy ?? 0),
        analystHoldCount:     grd?.hold ?? 0,
        analystSellCount:     (grd?.sell ?? 0) + (grd?.strongSell ?? 0),
        daysToEarnings:       earningsMap.get(symbol) ?? null,
        nextEarningsDate:     null,
      } as ReturnType<typeof getUnavailableFundamentals> & {
        piotroskiScore: number;
        altmanZScore: number;
        analystBuyCount: number;
        analystHoldCount: number;
        analystSellCount: number;
      };

      const features = buildGrowthFeatures(
        symbol,
        bars,
        spyBars,
        fundamentals,
        null,  // options flow — enriched in Phase 5
        null,  // institutional — enriched in Phase 6
      );

      if (!features) continue;

      // Override scores with bulk piotroski/altman if available
      if (sc) {
        features.piotroskiScore = sc.piotroskiScore;
        features.altmanZScore   = sc.altmanZScore;
      }
      if (congressBuySymbols.has(symbol)) features.congressionalBuySignal = true;
      if (maSymbols.has(symbol))           features.maRumorSignal = true;

      const shortScore   = scoreShortTermMomentum(features);
      const longScore    = scoreLongTermValueGrowth(features);
      const futureScore  = scoreFutureMover(features);
      const composite    = Math.max(shortScore.total, longScore.total, futureScore.total);

      scored.push({ symbol, features: features as GrowthFeatures, shortScore, longScore, futureScore, composite, fundamentals });
    } catch (err) {
      console.warn(`[screener] Feature build failed for ${symbol}:`, (err as Error).message);
    }
  }

  // Sort by composite score descending
  scored.sort((a, b) => b.composite - a.composite);

  // ── Phase 5: Options Flow for Top 100 ─────────────────────────────────────
  console.log('[screener] Phase 5 — options flow for top 100');
  const top100 = scored.slice(0, 100).map(s => s.symbol);
  const flowMap = await scanOptionsFlowBatch(top100, 5);

  // Re-score with options data
  for (const entry of scored) {
    const flow = flowMap.get(entry.symbol);
    if (flow) {
      entry.features.flow = flow;  // replace the nested flow object
      const newShort  = scoreShortTermMomentum(entry.features);
      const newFuture = scoreFutureMover(entry.features);
      entry.shortScore  = newShort;
      entry.futureScore = newFuture;
      entry.composite   = Math.max(newShort.total, entry.longScore.total, newFuture.total);
    }
  }

  // ── Phase 6: Institutional Data for Top 50 Long-Term Candidates ───────────
  console.log('[screener] Phase 6 — institutional deep dive for top 50');
  const longTermCandidates = [...scored]
    .sort((a, b) => b.longScore.total - a.longScore.total)
    .slice(0, 50);

  for (const entry of longTermCandidates) {
    try {
      const inst = await fetchInstitutionalData(entry.symbol, 0, 0);
      entry.features.institutional = inst;  // replace the nested institutional object
      entry.features.piotroskiScore        = entry.features.piotroskiScore;  // preserved from bulk
      entry.features.institutionalOwnershipPct = inst.institutionalOwnershipPct;
      entry.features.hfNetShareChangePct       = inst.hfNetShareChangePct;
      entry.features.insiderNetBuyDollars90d   = inst.insiderNetBuyDollars90d;
      entry.features.shortFloatPct             = inst.shortFloatPct;
      entry.features.topHedgeFundHolders       = inst.topHolders;

      entry.longScore  = scoreLongTermValueGrowth(entry.features);
      entry.composite  = Math.max(entry.shortScore.total, entry.longScore.total, entry.futureScore.total);
    } catch {
      // keep existing unavailable data
    }
    await sleep(200);
  }

  // Re-sort after enrichment
  scored.sort((a, b) => b.composite - a.composite);

  // ── Build Final Ranked Lists ───────────────────────────────────────────────
  const suppressShortTerm = signalStackComposite < -2;

  const shortTermPicks = suppressShortTerm ? [] : scored
    .filter(s => s.shortScore.total >= 60 && (s.features.altmanZScore ?? 3) > 1.8)
    .sort((a, b) => b.shortScore.total - a.shortScore.total)
    .slice(0, 10);

  const longTermPicks = scored
    .filter(s => s.longScore.total >= 55
      && (s.features.piotroskiScore ?? 5) >= 5
      && (s.features.altmanZScore   ?? 3) > 2)
    .sort((a, b) => b.longScore.total - a.longScore.total)
    .slice(0, 10);

  const futurePicks = scored
    .filter(s => s.futureScore.total >= 30)
    .sort((a, b) => b.futureScore.total - a.futureScore.total)
    .slice(0, 5);

  console.log('[screener] Short-term:', shortTermPicks.length,
    '| Long-term:', longTermPicks.length,
    '| Future movers:', futurePicks.length);

  // ── Phase 7: Intelligence Dossiers for Top 10 ─────────────────────────────
  console.log('[screener] Phase 7 — intelligence dossiers');
  const topUnique = Array.from(new Map(
    [...shortTermPicks, ...longTermPicks, ...futurePicks]
      .map(s => [s.symbol, s])
  ).values()).slice(0, 10);

  const dossierResults = await Promise.allSettled(
    topUnique.map(entry =>
      buildIntelligenceDossier(entry.symbol, entry.features as Parameters<typeof buildIntelligenceDossier>[1], null)
    )
  );

  // ── Phase 8: Save to DB ────────────────────────────────────────────────────
  console.log('[screener] Phase 8 — saving to DB');

  // Save growth scan metadata
  await db.insert(growthScans).values({
    scanDate,
    ranAt,
    totalScreened:    scored.length,
    shortTermCount:   shortTermPicks.length,
    longTermCount:    longTermPicks.length,
    futureMoverCount: futurePicks.length,
    marketRegime:     signalStackComposite >= 1 ? 'bull' : signalStackComposite <= -2 ? 'bear' : 'neutral',
    notes: suppressShortTerm ? 'Short-term picks suppressed: signal stack composite < -2' : null,
  }).onConflictDoUpdate({
    target: growthScans.scanDate,
    set: { ranAt, totalScreened: scored.length, shortTermCount: shortTermPicks.length, longTermCount: longTermPicks.length, futureMoverCount: futurePicks.length },
  }).catch(() => {});

  // Save candidates
  const allPicks = [
    ...shortTermPicks.map(s => ({ ...s, strategyType: 'short_term' as const })),
    ...longTermPicks.map(s => ({ ...s, strategyType: 'long_term' as const })),
    ...futurePicks.map(s => ({ ...s, strategyType: 'future_mover' as const })),
  ];

  for (const pick of allPicks) {
    const f    = pick.features;
    const bars = allBars.get(pick.symbol) ?? [];
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const price = last?.close ?? 0;
    const priceChangePct = (prev?.close && prev.close > 0) ? (price - prev.close) / prev.close * 100 : 0;

    const score = pick.strategyType === 'short_term' ? pick.shortScore
                : pick.strategyType === 'long_term'  ? pick.longScore
                : pick.futureScore;

    await db.insert(stockCandidates).values({
      scanDate,
      symbol:            pick.symbol,
      companyName:       pick.fundamentals.companyName,
      sector:            SYMBOL_SECTOR_MAP[pick.symbol] ?? pick.fundamentals.sector,
      marketCap:         pick.fundamentals.marketCap ?? null,
      strategyType:      pick.strategyType,
      compositeScore:    Math.round(score.total),
      momentumScore:     Math.round(pick.shortScore.total),
      growthScore:        Math.round(pick.longScore.fundamentalQuality ?? 0),
      valueScore:         Math.round(pick.longScore.valueReasonableness ?? 0),
      institutionalScore: Math.round(pick.longScore.institutional ?? 0),
      optionsFlowScore:   Math.round(pick.shortScore.optionsFlow ?? 0),
      price:             parseFloat(price.toFixed(2)),
      priceChangePct:    parseFloat(priceChangePct.toFixed(2)),
      volumeRatio:       parseFloat((f.volumeRatio ?? 1).toFixed(2)),
      rsi14:             parseFloat((f.rsi14 ?? 50).toFixed(1)),
      above200sma:       (f.priceVsSma200Pct ?? 0) > 0,
      above50ema:        (f.priceVsEma50Pct  ?? 0) > 0,
      revenueGrowthPct:  parseFloat((pick.fundamentals.revenueGrowthYoy ?? 0).toFixed(1)),
      epsGrowthPct:      parseFloat((pick.fundamentals.epsGrowthYoy ?? 0).toFixed(1)),
      pegRatio:          parseFloat((pick.fundamentals.pegRatio ?? 0).toFixed(2)),
      signals:           { reasons: (score as { reasons?: string[] }).reasons ?? [] },
    }).onConflictDoNothing().catch(() => {});
  }

  // Save options flow alerts
  for (const [symbol, flow] of Array.from(flowMap.entries())) {
    for (const alert of flow.alerts.slice(0, 3)) {
      await db.insert(optionsFlowAlerts).values({
        symbol,
        alertType:         alert.alertType ?? null,
        strike:            alert.strike ?? null,
        expiry:            alert.expiry ?? null,
        premium:           alert.premium ?? null,
        volume:            alert.volume ? Math.round(alert.volume) : null,
        openInterest:      alert.openInterest ? Math.round(alert.openInterest) : null,
        volumeOiRatio:     alert.volumeOiRatio ?? null,
        impliedVolatility: alert.impliedVolatility ?? null,
        sentiment:         alert.sentiment ?? 'neutral',
        notes:             alert.notes ?? null,
      }).onConflictDoNothing().catch(() => {});
    }
  }

  // Save dossiers
  for (let i = 0; i < topUnique.length; i++) {
    const result = dossierResults[i];
    if (result.status !== 'fulfilled') continue;
    const dossier = result.value;
    await db.insert(intelligenceDossiers).values({
      dossierDate:       scanDate,
      symbol:            topUnique[i].symbol,
      fundamentalsData:  dossier.layer1_fundamentals as object,
      valuationData:     dossier.layer2_valuation as object,
      newsData:          dossier.layer3_news as object,
      institutionalData: dossier.layer4_institutional as object,
      optionsData:       dossier.layer5_options as object,
      technicalsData:    dossier.layer6_technicals as object,
      sectorData:        dossier.layer7_sector as object,
      aiMemo:            dossier.layer8_aiMemo.fullMemo,
      bullCase:          dossier.layer8_aiMemo.bullCase,
      bearCase:          dossier.layer8_aiMemo.bearCase,
      entryStrategy:     dossier.layer8_aiMemo.entryStrategy,
      targetPriceRange:  dossier.layer8_aiMemo.targetPriceRange,
      convictionLevel:   dossier.layer8_aiMemo.convictionLevel,
    }).onConflictDoNothing().catch(() => {});
  }

  // Save parameter snapshots (ML training data) for ALL scanned stocks
  console.log('[screener] Saving parameter snapshots for', scored.length, 'stocks');
  for (const entry of scored) {
    const bars = allBars.get(entry.symbol) ?? [];
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const f    = entry.features;

    const lastPrice = last?.close ?? 0;
    const prevPrice = prev?.close ?? 0;
    const dayChg    = prevPrice > 0 ? (lastPrice - prevPrice) / prevPrice * 100 : 0;

    await db.insert(stockParameterSnapshots).values({
      snapshotDate:         scanDate,
      symbol:               entry.symbol,
      sector:               SYMBOL_SECTOR_MAP[entry.symbol] ?? entry.fundamentals.sector ?? null,
      marketCap:            entry.fundamentals.marketCap ?? null,
      price:                lastPrice || null,
      priceOpen:            last?.open ?? null,
      priceHigh:            last?.high ?? null,
      priceLow:             last?.low ?? null,
      volume:               last?.volume ?? null,
      volumeRatio:          f.volumeRatio ?? null,
      dayChangePct:         dayChg || null,
      rsi14:                f.rsi14 ?? null,
      macdLine:             f.macdLine ?? null,
      macdSignal:           f.macdSignal ?? null,
      macdHistogram:        f.macdHistogram ?? null,
      sma20:                f.sma20 ?? null,
      sma50:                f.sma50 ?? null,
      sma200:               f.sma200 ?? null,
      ema20:                f.ema20 ?? null,
      priceVsSma200Pct:     f.priceVsSma200Pct ?? null,
      sma50VsSma200Pct:     f.sma50VsSma200Pct ?? null,
      distFromHigh52w:      f.distFromHigh52w ?? null,
      relStrengthVsSpy1m:   f.relStrengthVsSpy1m ?? null,
      revenueGrowthYoy:     entry.fundamentals.revenueGrowthYoy ?? null,
      epsGrowthYoy:         entry.fundamentals.epsGrowthYoy ?? null,
      grossMargin:          entry.fundamentals.grossMargin ?? null,
      operatingMargin:      entry.fundamentals.operatingMargin ?? null,
      netMargin:            entry.fundamentals.netMargin ?? null,
      roe:                  entry.fundamentals.roe ?? null,
      peRatio:              entry.fundamentals.peRatio ?? null,
      psRatio:              entry.fundamentals.psRatio ?? null,
      pegRatio:             entry.fundamentals.pegRatio ?? null,
      earningsSurprisePct:  entry.fundamentals.earningsSurprisePct ?? null,
      impliedUpside:        entry.fundamentals.impliedUpside ?? null,
      shortFloatPct:        f.shortFloatPct ?? null,
      compositeShortTerm:   entry.shortScore.total,
      compositeLongTerm:    entry.longScore.total,
      spxRegime:            signalStackComposite >= 1 ? 'bull' : signalStackComposite <= -2 ? 'bear' : 'neutral',
      signalStackComposite: signalStackComposite,
    }).onConflictDoNothing().catch(() => {});
  }

  console.log('[screener] Done. Scan complete for', scanDate);
  console.log(`[screener] Short-term: ${shortTermPicks.length} | Long-term: ${longTermPicks.length} | Future: ${futurePicks.length}`);

  if (shortTermPicks.length > 0 || longTermPicks.length > 0) {
    const top3 = [
      ...(shortTermPicks.slice(0, 2).map(s => `${s.symbol} [MOM ${s.shortScore.total}]`)),
      ...(longTermPicks.slice(0, 1).map(s => `${s.symbol} [VAL ${s.longScore.total}]`)),
    ].join(' · ');
    console.log('[screener] Top picks:', top3);
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error('[screener] Fatal error:', err);
  process.exit(1);
});
