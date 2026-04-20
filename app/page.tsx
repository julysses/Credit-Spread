'use client';

import { useState, useEffect, useCallback } from 'react';
import { MarketHeader, type DashTab } from '@/components/dashboard/MarketHeader';
import { MorningBrief } from '@/components/dashboard/MorningBrief';
import { TradeCard } from '@/components/dashboard/TradeCard';
import { MarketRegimeCard } from '@/components/dashboard/MarketRegimeCard';
import { TradeJournal } from '@/components/dashboard/TradeJournal';
import { SignalStackEngine } from '@/components/dashboard/SignalStackEngine';
import { OptionsTab } from '@/components/dashboard/OptionsTab';
import { StocksDaytradeTab } from '@/components/dashboard/StocksDaytradeTab';
import { RegimeBanner } from '@/components/dashboard/RegimeBanner';
import { SignalStackPanel } from '@/components/dashboard/SignalStackPanel';
import { JournalStrip } from '@/components/dashboard/JournalStrip';
import { StocksScannerPanel } from '@/components/dashboard/StocksScannerPanel';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DashboardState {
  loading: boolean;
  error: string | null;
  strategy: any;
  analytics: any;
  trades: any;
  monteCarlo: any;
  lastUpdated: string;
}

export default function DashboardPage() {
  const [tab, setTab] = useState<DashTab>('options');
  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    strategy: null,
    analytics: null,
    trades: null,
    monteCarlo: null,
    lastUpdated: '',
  });

  const fetchAll = useCallback(async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));

      const [stratRes, analyticsRes, tradesRes] = await Promise.all([
        fetch('/api/strategy').then(r => r.json()),
        fetch('/api/analytics').then(r => r.json()),
        fetch('/api/trades').then(r => r.json()),
      ]);

      let mcData = null;
      const rec = stratRes?.data?.decision?.recommendation;
      if (rec && rec.tradeType !== 'no_trade' && rec.shortLeg) {
        const mcRes = await fetch('/api/monte-carlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spotPrice:        stratRes.data.conditions.spxPrice,
            impliedVolatility: stratRes.data.conditions.impliedVol || 0.18,
            drift: 0,
            daysToExpiry:     rec.daysToExpiry || 7,
            numSimulations:   5000,
            numPaths:         40,
            shortStrike:      rec.shortLeg?.strike,
            longStrike:       rec.longLeg?.strike,
            spreadType:       rec.shortLeg?.optionType,
            creditReceived:   rec.credit,
          }),
        }).then(r => r.json());
        mcData = mcRes?.data;
      }

      setState({
        loading: false,
        error: null,
        strategy:   stratRes?.data,
        analytics:  analyticsRes?.data,
        trades:     tradesRes?.data,
        monteCarlo: mcData,
        lastUpdated: new Date().toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }) + ' ET',
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleAcceptTrade = async () => {
    const rec = state.strategy?.decision?.recommendation;
    if (!rec || rec.tradeType === 'no_trade') return;
    try {
      await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy:    rec.strategy,
          tradeType:   rec.tradeType,
          shortStrike: rec.shortLeg?.strike,
          longStrike:  rec.longLeg?.strike,
          shortStrike2:rec.shortLeg2?.strike,
          longStrike2: rec.longLeg2?.strike,
          optionType:  rec.shortLeg?.optionType,
          contracts:   1,
          openCredit:  rec.credit,
          expiryDate:  rec.expiryDate,
        }),
      });
      await fetchAll();
    } catch (err) {
      console.error('Failed to log trade:', err);
    }
  };

  const conditions = state.strategy?.conditions;
  const decision   = state.strategy?.decision;
  const brief      = state.strategy?.brief;
  const news       = state.strategy?.news;
  const rec        = decision?.recommendation;

  if (state.loading && !state.strategy) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-sd-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-400 text-sm">Loading SPX Signal Desk…</div>
          <div className="text-gray-600 text-xs mt-1">Running models · fetching data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <MarketHeader
        spxPrice={conditions?.spxPrice ?? 5800}
        spxChangePct={conditions?.spxDailyChange ?? 0}
        vix={conditions?.vix ?? 18}
        vixChangePct={conditions?.vixChangePct ?? 0}
        vixRegime={conditions?.vixRegime ?? 'moderate'}
        riskLevel={conditions?.riskLevel ?? 'moderate'}
        isMarketOpen={state.strategy?.snapshot?.isMarketOpen ?? false}
        lastUpdated={state.lastUpdated}
        activeTab={tab}
        onTabChange={setTab}
        onRefresh={fetchAll}
        isLoading={state.loading}
      />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6">
        {state.error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
            {state.error}
          </div>
        )}

        {/* ── OPTIONS TAB ── */}
        {tab === 'options' && (
          <div className="space-y-6">
            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-[0.18em]">OPTIONS · DAILY SIGNAL</div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-100 mt-1">
                  Today&apos;s Trade · SPX
                </h1>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-gray-500 font-mono">
                <div><span className="text-gray-600">COHORT</span> <span className="text-gray-300">30-DAY PUT CREDIT</span></div>
                <div className="hidden sm:block"><span className="text-gray-600">HIT-RATE</span> <span className="text-green-400">71%</span></div>
              </div>
            </div>

            {/* Hero: TradeCard + MC + Regime */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                {rec ? (
                  <TradeCard
                    strategy={rec.strategy}
                    tradeType={rec.tradeType}
                    shortLeg={rec.shortLeg}
                    longLeg={rec.longLeg}
                    shortLeg2={rec.shortLeg2}
                    longLeg2={rec.longLeg2}
                    credit={rec.credit ?? 0}
                    maxProfit={rec.maxProfit ?? 0}
                    maxLoss={rec.maxLoss ?? 0}
                    probOfProfit={rec.probOfProfit ?? 0}
                    probOfTouch={rec.probOfTouch ?? 0}
                    expectedValue={rec.expectedValue ?? 0}
                    kellySize={rec.kellySize ?? 0}
                    profitTarget={rec.profitTarget ?? 0}
                    stopLoss={rec.stopLoss ?? 0}
                    daysToExpiry={rec.daysToExpiry ?? 7}
                    expiryDate={rec.expiryDate ?? ''}
                    confidence={rec.confidence ?? 'medium'}
                    warnings={rec.warnings ?? []}
                    conditions={rec.conditions ?? []}
                    noTradeEvent={rec.noTradeEvent}
                    onAcceptTrade={handleAcceptTrade}
                  />
                ) : (
                  <TradeCardSkeleton />
                )}
              </div>
              <div className="lg:col-span-5 space-y-6">
                {state.monteCarlo && rec?.tradeType !== 'no_trade' ? (
                  <MonteCarloPanel
                    paths={state.monteCarlo.paths ?? []}
                    histogram={state.monteCarlo.histogram ?? []}
                    spotPrice={conditions?.spxPrice ?? 5800}
                    shortStrike={rec?.shortLeg?.strike}
                    longStrike={rec?.longLeg?.strike}
                    percentile5={state.monteCarlo.summary?.percentile5}
                    percentile95={state.monteCarlo.summary?.percentile95}
                    meanPrice={state.monteCarlo.summary?.meanPrice}
                    probOfProfit={rec?.probOfProfit}
                    vix={conditions?.vix ?? 18}
                  />
                ) : (
                  <MCPanelSkeleton />
                )}
                {conditions && (
                  <MarketRegimeCard
                    vix={conditions.vix}
                    vixRegime={conditions.vixRegime}
                    ivRank={conditions.ivRank}
                    impliedVol={conditions.impliedVol}
                    realizedVol={conditions.realizedVol}
                    expectedMove7d={(conditions.impliedVol ?? 0.18) * (conditions.spxPrice ?? 5800) * Math.sqrt(7 / 365)}
                    expectedMove30d={(conditions.impliedVol ?? 0.18) * (conditions.spxPrice ?? 5800) * Math.sqrt(30 / 365)}
                    directionalBias={conditions.directionalBias}
                    marketRegime={conditions.marketRegime}
                    riskLevel={conditions.riskLevel}
                    skew={conditions.skew}
                  />
                )}
              </div>
            </div>

            {/* Secondary panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {brief ? (
                <MorningBrief
                  brief={brief}
                  tradeabilityScore={news?.tradeabilityScore ?? 70}
                  newsItems={news?.items ?? []}
                />
              ) : <PanelSkeleton />}
              <SignalStackPanel />
              <JournalStrip trades={state.trades?.trades ?? []} />
            </div>

            {/* Regime timeline */}
            <RegimeBanner
              spxPrice={conditions?.spxPrice}
              vix={conditions?.vix}
              spxHigh={conditions?.spxHigh}
              spxLow={conditions?.spxLow}
            />

            {/* Stocks cross-section */}
            <div className="flex items-end justify-between pt-2">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-[0.18em]">CROSS-SECTION</div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-100 mt-1">
                  Stocks · Daytrade Scanner
                </h2>
              </div>
              <button
                onClick={() => setTab('stocks')}
                className="text-[11px] font-semibold uppercase tracking-wider text-sd-accent hover:brightness-110 flex items-center gap-1.5"
              >
                Open Scanner →
              </button>
            </div>
            <StocksScannerPanel />

            <Footer />
          </div>
        )}

        {/* ── 0DTE TAB ── */}
        {tab === '0dte' && (
          <div className="space-y-6">
            <SectionHeader
              label="0DTE · INTRADAY"
              title="0DTE Credit Spreads"
              subtitle="Same-day expiry strategies"
            />
            <OptionsTab spxPrice={conditions?.spxPrice} vix={conditions?.vix} />
          </div>
        )}

        {/* ── STOCKS TAB ── */}
        {tab === 'stocks' && (
          <div className="space-y-6">
            <SectionHeader
              label="EQUITIES · DAYTRADE"
              title="Stock Scanner"
              subtitle="Technical setups · relative strength"
            />
            <StocksDaytradeTab spxHigh={conditions?.spxHigh} spxLow={conditions?.spxLow} />
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {tab === 'analytics' && (
          <div className="space-y-6">
            <SectionHeader
              label="PERFORMANCE · ANALYTICS"
              title="P&L Analytics"
              subtitle="Win rate · drawdown · Sharpe"
            />
            {state.analytics ? (
              <AnalyticsChart data={state.analytics} />
            ) : (
              <div className="text-center py-20 text-gray-500 text-sm">No analytics data available</div>
            )}
          </div>
        )}

        {/* ── JOURNAL TAB ── */}
        {tab === 'journal' && (
          <div className="space-y-6">
            <SectionHeader
              label="TRADE JOURNAL"
              title="Trade History"
              subtitle="All executed positions"
            />
            {state.trades ? (
              <TradeJournal
                trades={state.trades.trades ?? []}
                summary={state.trades.summary ?? {
                  openTrades: 0, closedTrades: 0, totalPnl: 0, winRate: 0, openExposure: 0,
                }}
              />
            ) : (
              <div className="text-center py-20 text-gray-500 text-sm">No trade data available</div>
            )}
          </div>
        )}

        {/* ── SIMULATOR TAB ── */}
        {tab === 'simulator' && (
          <div className="space-y-6">
            <SectionHeader
              label="RISK MODEL · SIMULATOR"
              title="Monte Carlo Simulator"
              subtitle="25,000 GBM paths · spread P&L distribution"
            />
            <MonteCarloSimulator
              spxPrice={conditions?.spxPrice ?? 5800}
              iv={conditions?.impliedVol ?? 0.18}
            />
          </div>
        )}

        {/* ── SIGNAL STACK TAB ── */}
        {tab === 'signal-stack' && (
          <div className="space-y-6">
            <SectionHeader
              label="MACRO · CROWN FRAMEWORK"
              title="Signal Stack Engine"
              subtitle="Nicholas Crown macro + flow stacking"
            />
            <SignalStackEngine />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Shared section header ──────────────────────────────────────────────────
function SectionHeader({
  label,
  title,
  subtitle,
}: { label: string; title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-[0.18em]">{label}</div>
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-100 mt-1">{title}</h1>
      <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

// ── Monte Carlo panel wrapper ──────────────────────────────────────────────
function MonteCarloPanel({
  paths, histogram, spotPrice, shortStrike, longStrike,
  percentile5, percentile95, meanPrice, probOfProfit, vix,
}: {
  paths: number[][]; histogram: any[]; spotPrice: number;
  shortStrike?: number; longStrike?: number;
  percentile5?: number; percentile95?: number;
  meanPrice?: number; probOfProfit?: number; vix: number;
}) {
  const sigma = (vix / 100).toFixed(1);
  const pop = probOfProfit != null ? `${(probOfProfit * 100).toFixed(0)}%` : '—';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monte Carlo · Paths</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-gray-500 border border-sd-line rounded px-1.5 py-0.5">σ = {sigma}</span>
          <span className="text-[9px] font-mono text-green-400 border border-green-500/30 rounded px-1.5 py-0.5 bg-green-500/10">POP {pop}</span>
        </div>
      </CardHeader>
      <CardContent>
        <MonteCarloChart
          paths={paths}
          histogram={histogram}
          spotPrice={spotPrice}
          shortStrike={shortStrike}
          longStrike={longStrike}
          percentile5={percentile5}
          percentile95={percentile95}
          meanPrice={meanPrice}
          probOfProfit={probOfProfit}
        />
      </CardContent>
    </Card>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────
function TradeCardSkeleton() {
  return (
    <Card className="p-6 space-y-4 animate-pulse">
      <div className="flex gap-2"><div className="h-5 w-20 bg-sd-muted rounded" /><div className="h-5 w-28 bg-sd-muted rounded" /></div>
      <div className="h-8 w-2/3 bg-sd-muted rounded" />
      <div className="h-4 w-1/3 bg-sd-muted rounded" />
      <div className="grid grid-cols-3 gap-3 pt-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-sd-muted rounded" />)}
      </div>
      <div className="text-center pt-2 text-[11px] text-gray-500 uppercase tracking-[0.14em] font-mono">
        <span className="inline-block w-2 h-2 rounded-full bg-sd-accent live-dot mr-2 align-middle" />
        Running Monte Carlo · Analysing paths…
      </div>
    </Card>
  );
}

function MCPanelSkeleton() {
  return (
    <Card className="p-5 animate-pulse">
      <div className="h-4 w-40 bg-sd-muted rounded mb-4" />
      <div className="h-48 bg-sd-muted rounded" />
    </Card>
  );
}

function PanelSkeleton() {
  return (
    <Card className="p-5 animate-pulse space-y-3">
      <div className="h-4 w-32 bg-sd-muted rounded" />
      <div className="h-3 w-full bg-sd-muted rounded" />
      <div className="h-3 w-4/5 bg-sd-muted rounded" />
      <div className="h-3 w-3/5 bg-sd-muted rounded" />
    </Card>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="pt-4 pb-8 flex items-center justify-between text-[10px] text-gray-600 font-mono uppercase tracking-wider">
      <div>Signal Desk v2.5 · Engine · BT-5Y · MC · 25K paths</div>
      <div>Not financial advice · Paper tested</div>
    </footer>
  );
}

// ── Monte Carlo Simulator Tab ──────────────────────────────────────────────
function calc0DteDays(): string {
  try {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const close = new Date(et); close.setHours(16, 0, 0, 0);
    return (Math.max(close.getTime() - et.getTime(), 60000) / (1000 * 60 * 60 * 24)).toFixed(4);
  } catch { return '0.2500'; }
}
function calc0DteLabel(): string {
  try {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const close = new Date(et); close.setHours(16, 0, 0, 0);
    const ms = Math.max(close.getTime() - et.getTime(), 0);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m until close` : `${m}m until close`;
  } catch { return '0DTE'; }
}
function calc10DeltaStrike(spx: number, vix: number) {
  return String(Math.round((spx - 1.28 * (vix / 100) / Math.sqrt(252) * spx) / 5) * 5);
}

function MonteCarloSimulator({ spxPrice, iv }: { spxPrice: number; iv: number }) {
  const [params, setParams] = useState({
    spotPrice:      spxPrice.toFixed(0),
    impliedVol:     (iv * 100).toFixed(1),
    daysToExpiry:   calc0DteDays(),
    numSimulations: '10000',
    shortStrike:    calc10DeltaStrike(spxPrice, iv * 100),
    spreadType:     'put' as 'put' | 'call',
    creditReceived: '1.50',
  });
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const timeLabel = calc0DteLabel();

  const runSim = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/monte-carlo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotPrice:         parseFloat(params.spotPrice),
          impliedVolatility: parseFloat(params.impliedVol) / 100,
          drift: 0,
          daysToExpiry:      parseFloat(params.daysToExpiry),
          numSimulations:    parseInt(params.numSimulations),
          numPaths:          40,
          shortStrike:       parseFloat(params.shortStrike),
          longStrike:        parseFloat(params.shortStrike) - 10,
          spreadType:        params.spreadType,
          creditReceived:    parseFloat(params.creditReceived),
        }),
      });
      const data = await res.json();
      setResults(data?.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monte Carlo Simulator</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5 bg-yellow-500/10">
              0DTE — {timeLabel}
            </span>
            <button
              onClick={() => setParams(p => ({
                ...p,
                daysToExpiry: calc0DteDays(),
                spotPrice: spxPrice.toFixed(0),
                impliedVol: (iv * 100).toFixed(1),
                shortStrike: calc10DeltaStrike(spxPrice, iv * 100),
              }))}
              className="text-[10px] text-sd-accent hover:opacity-80 border border-sd-line rounded px-2 py-0.5 transition-opacity"
            >
              Reset to 0DTE
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <SimInput label="Spot Price"   value={params.spotPrice}      onChange={v => setParams(p => ({ ...p, spotPrice: v }))} />
            <SimInput label="IV (%)"       value={params.impliedVol}     onChange={v => setParams(p => ({ ...p, impliedVol: v }))} />
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-[0.14em] block mb-1">DTE (days)</label>
              <input type="number" value={params.daysToExpiry} step="0.001"
                onChange={e => setParams(p => ({ ...p, daysToExpiry: e.target.value }))}
                className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-sd-accent" />
            </div>
            <SimInput label="Simulations"  value={params.numSimulations} onChange={v => setParams(p => ({ ...p, numSimulations: v }))} />
            <SimInput label="Short Strike" value={params.shortStrike}    onChange={v => setParams(p => ({ ...p, shortStrike: v }))} />
            <SimInput label="Credit ($)"   value={params.creditReceived} onChange={v => setParams(p => ({ ...p, creditReceived: v }))} />
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-[0.14em] block mb-1">Type</label>
              <select value={params.spreadType}
                onChange={e => setParams(p => ({ ...p, spreadType: e.target.value as 'put' | 'call' }))}
                className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-sm text-gray-100">
                <option value="put">Put Spread</option>
                <option value="call">Call Spread</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={runSim} disabled={loading}
                className="w-full py-2 bg-sd-accent text-white text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50">
                {loading ? 'Running…' : 'Run Simulation'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          <Card>
            <CardContent className="pt-4">
              <MonteCarloChart
                paths={results.paths ?? []}
                histogram={results.histogram ?? []}
                spotPrice={parseFloat(params.spotPrice)}
                shortStrike={parseFloat(params.shortStrike)}
                longStrike={parseFloat(params.shortStrike) - 10}
                percentile5={results.summary?.percentile5}
                percentile95={results.summary?.percentile95}
                meanPrice={results.summary?.meanPrice}
                probOfProfit={results.spreadProbabilities?.probProfit}
              />
            </CardContent>
          </Card>

          {results.spreadProbabilities && (
            <Card>
              <CardHeader><CardTitle>Simulation Results</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <SimStat label="Prob of Profit" value={`${(results.spreadProbabilities.probProfit * 100).toFixed(1)}%`} color="text-green-400" />
                  <SimStat label="Prob of Touch"  value={`${(results.spreadProbabilities.probTouchStrike * 100).toFixed(1)}%`} color="text-orange-400" />
                  <SimStat label="Expected Value" value={`$${results.spreadProbabilities.expectedValue.toFixed(2)}`}
                    color={results.spreadProbabilities.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'} />
                  <SimStat label="Mean Price"     value={results.summary?.meanPrice?.toFixed(0) ?? '--'} color="text-blue-400" />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SimInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 uppercase tracking-[0.14em] block mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-sd-accent" />
    </div>
  );
}

function SimStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-sd-muted/50 border border-sd-line/60 rounded-lg p-3 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-1">{label}</div>
      <div className={`slab text-xl tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
