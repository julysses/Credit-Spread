'use client';

import { useState, useEffect, useCallback } from 'react';
import { MarketHeader } from '@/components/dashboard/MarketHeader';
import { MorningBrief } from '@/components/dashboard/MorningBrief';
import { TradeCard } from '@/components/dashboard/TradeCard';
import { MarketRegimeCard } from '@/components/dashboard/MarketRegimeCard';
import { TradeJournal } from '@/components/dashboard/TradeJournal';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';
import { AnalyticsChart } from '@/components/charts/AnalyticsChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Tab = 'dashboard' | 'analytics' | 'journal' | 'simulator';

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
  const [tab, setTab] = useState<Tab>('dashboard');
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
      setState((s: DashboardState) => ({ ...s, loading: true, error: null }));

      const [stratRes, analyticsRes, tradesRes] = await Promise.all([
        fetch('/api/strategy').then(r => r.json()),
        fetch('/api/analytics').then(r => r.json()),
        fetch('/api/trades').then(r => r.json()),
      ]);

      // Run Monte Carlo for the recommended trade
      let mcData = null;
      const rec = stratRes?.data?.decision?.recommendation;
      if (rec && rec.tradeType !== 'no_trade' && rec.shortLeg) {
        const mcRes = await fetch('/api/monte-carlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spotPrice: stratRes.data.conditions.spxPrice,
            impliedVolatility: stratRes.data.conditions.impliedVol || 0.18,
            drift: 0,
            daysToExpiry: rec.daysToExpiry || 7,
            numSimulations: 5000,
            numPaths: 40,
            shortStrike: rec.shortLeg?.strike,
            longStrike: rec.longLeg?.strike,
            spreadType: rec.shortLeg?.optionType,
            creditReceived: rec.credit,
          }),
        }).then(r => r.json());
        mcData = mcRes?.data;
      }

      setState({
        loading: false,
        error: null,
        strategy: stratRes?.data,
        analytics: analyticsRes?.data,
        trades: tradesRes?.data,
        monteCarlo: mcData,
        lastUpdated: new Date().toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' ET',
      });
    } catch (err) {
      setState((s: DashboardState) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleAcceptTrade = async () => {
    const rec = state.strategy?.decision?.recommendation;
    if (!rec || rec.tradeType === 'no_trade') return;

    try {
      await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: rec.strategy,
          tradeType: rec.tradeType,
          shortStrike: rec.shortLeg?.strike,
          longStrike: rec.longLeg?.strike,
          shortStrike2: rec.shortLeg2?.strike,
          longStrike2: rec.longLeg2?.strike,
          optionType: rec.shortLeg?.optionType,
          contracts: 1,
          openCredit: rec.credit,
          expiryDate: rec.expiryDate,
        }),
      });
      await fetchAll();
    } catch (err) {
      console.error('Failed to log trade:', err);
    }
  };

  if (state.loading && !state.strategy) {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-400 text-sm">Loading SPX Signal Desk...</div>
          <div className="text-gray-600 text-xs mt-1">Running models &amp; fetching data</div>
        </div>
      </div>
    );
  }

  const conditions = state.strategy?.conditions;
  const decision = state.strategy?.decision;
  const brief = state.strategy?.brief;
  const news = state.strategy?.news;
  const rec = decision?.recommendation;

  return (
    <div className="min-h-screen bg-[#060b14]">
      {/* Header */}
      <MarketHeader
        spxPrice={conditions?.spxPrice ?? 5800}
        spxChangePct={conditions?.spxDailyChange ?? 0}
        vix={conditions?.vix ?? 18}
        vixChangePct={conditions?.vixChangePct ?? 0}
        vixRegime={conditions?.vixRegime ?? 'moderate'}
        riskLevel={conditions?.riskLevel ?? 'moderate'}
        isMarketOpen={state.strategy?.snapshot?.isMarketOpen ?? false}
        lastUpdated={state.lastUpdated}
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-800/60 bg-gray-950/50 sticky top-[61px] z-40">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'analytics', label: 'Analytics' },
                { id: 'journal', label: 'Trade Journal' },
                { id: 'simulator', label: 'Monte Carlo' },
              ] as { id: Tab; label: string }[]
            ).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tab === t.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 py-2">
              <button
                onClick={fetchAll}
                disabled={state.loading}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800/50"
              >
                {state.loading ? (
                  <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>⟳</span>
                )}
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        {state.error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
            {state.error}
          </div>
        )}

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {brief && (
                <MorningBrief
                  brief={brief}
                  tradeabilityScore={news?.tradeabilityScore ?? 70}
                  newsItems={news?.items ?? []}
                />
              )}

              {rec && (
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
              )}

              {state.monteCarlo && rec?.tradeType !== 'no_trade' && (
                <MonteCarloChart
                  paths={state.monteCarlo.paths ?? []}
                  histogram={state.monteCarlo.histogram ?? []}
                  spotPrice={conditions?.spxPrice ?? 5800}
                  shortStrike={rec?.shortLeg?.strike}
                  longStrike={rec?.longLeg?.strike}
                  percentile5={state.monteCarlo.summary?.percentile5}
                  percentile95={state.monteCarlo.summary?.percentile95}
                  meanPrice={state.monteCarlo.summary?.meanPrice}
                  probOfProfit={rec?.probOfProfit}
                />
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {conditions && (
                <MarketRegimeCard
                  vix={conditions.vix}
                  vixRegime={conditions.vixRegime}
                  ivRank={conditions.ivRank}
                  impliedVol={conditions.impliedVol}
                  realizedVol={conditions.realizedVol}
                  expectedMove7d={
                    (conditions.impliedVol ?? 0.18) *
                    (conditions.spxPrice ?? 5800) *
                    Math.sqrt(7 / 365)
                  }
                  expectedMove30d={
                    (conditions.impliedVol ?? 0.18) *
                    (conditions.spxPrice ?? 5800) *
                    Math.sqrt(30 / 365)
                  }
                  directionalBias={conditions.directionalBias}
                  marketRegime={conditions.marketRegime}
                  riskLevel={conditions.riskLevel}
                  skew={conditions.skew}
                />
              )}

              <InstitutionalSOP />
              <TradingViewWidget />
            </div>
          </div>
        )}

        {tab === 'analytics' && state.analytics && (
          <AnalyticsChart data={state.analytics} />
        )}

        {tab === 'journal' && state.trades && (
          <TradeJournal
            trades={state.trades.trades ?? []}
            summary={
              state.trades.summary ?? {
                openTrades: 0,
                closedTrades: 0,
                totalPnl: 0,
                winRate: 0,
                openExposure: 0,
              }
            }
          />
        )}

        {tab === 'simulator' && (
          <MonteCarloSimulator
            spxPrice={conditions?.spxPrice ?? 5800}
            iv={conditions?.impliedVol ?? 0.18}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Institutional SOP Rules Widget
// ─────────────────────────────────────────────
function InstitutionalSOP() {
  const rules = [
    { num: 1, text: 'Risk ≤ 2% capital per trade' },
    { num: 2, text: 'Sell when IV > Realized Vol' },
    { num: 3, text: 'Avoid macro event days' },
    { num: 4, text: 'Take profit at 50%' },
    { num: 5, text: 'Stop loss at 2–2.5× credit' },
    { num: 6, text: 'Avoid near support/resistance' },
    { num: 7, text: 'Strike beyond expected move' },
    { num: 8, text: 'Scale down in vol spikes' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Institutional SOP</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {rules.map(rule => (
            <div key={rule.num} className="flex items-start gap-2.5 text-xs">
              <span className="text-blue-500 font-bold w-4 flex-shrink-0 mt-0.5">{rule.num}.</span>
              <span className="text-gray-400">{rule.text}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// TradingView Embed
// ─────────────────────────────────────────────
function TradingViewWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SPX Chart</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative" style={{ height: 300 }}>
          <iframe
            src="https://www.tradingview.com/widgetembed/?frameElementId=tradingview_spx&symbol=SP%3ASPX&interval=D&hidesidetoolbar=1&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=1a1f2e&studies=[]&theme=dark&style=1&timezone=America%2FNew_York&locale=en"
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: '0 0 12px 12px' }}
            allowFullScreen
            title="SPX Chart"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Monte Carlo Simulator Tab
// ─────────────────────────────────────────────
function MonteCarloSimulator({ spxPrice, iv }: { spxPrice: number; iv: number }) {
  const [params, setParams] = useState({
    spotPrice: spxPrice.toFixed(0),
    impliedVol: (iv * 100).toFixed(1),
    daysToExpiry: '7',
    numSimulations: '10000',
    shortStrike: (spxPrice * 0.95).toFixed(0),
    spreadType: 'put' as 'put' | 'call',
    creditReceived: '1.50',
  });
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runSim = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/monte-carlo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotPrice: parseFloat(params.spotPrice),
          impliedVolatility: parseFloat(params.impliedVol) / 100,
          drift: 0,
          daysToExpiry: parseInt(params.daysToExpiry),
          numSimulations: parseInt(params.numSimulations),
          numPaths: 40,
          shortStrike: parseFloat(params.shortStrike),
          longStrike: parseFloat(params.shortStrike) - 10,
          spreadType: params.spreadType,
          creditReceived: parseFloat(params.creditReceived),
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
        <CardHeader><CardTitle>Monte Carlo Simulator</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <ParamInput label="Spot Price" value={params.spotPrice} onChange={v => setParams(p => ({ ...p, spotPrice: v }))} />
            <ParamInput label="IV (%)" value={params.impliedVol} onChange={v => setParams(p => ({ ...p, impliedVol: v }))} />
            <ParamInput label="DTE" value={params.daysToExpiry} onChange={v => setParams(p => ({ ...p, daysToExpiry: v }))} />
            <ParamInput label="Simulations" value={params.numSimulations} onChange={v => setParams(p => ({ ...p, numSimulations: v }))} />
            <ParamInput label="Short Strike" value={params.shortStrike} onChange={v => setParams(p => ({ ...p, shortStrike: v }))} />
            <ParamInput label="Credit ($)" value={params.creditReceived} onChange={v => setParams(p => ({ ...p, creditReceived: v }))} />
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <select
                value={params.spreadType}
                onChange={e => setParams(p => ({ ...p, spreadType: e.target.value as 'put' | 'call' }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              >
                <option value="put">Put Spread</option>
                <option value="call">Call Spread</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={runSim}
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Running...' : 'Run Simulation'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
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

          {results.spreadProbabilities && (
            <Card>
              <CardHeader><CardTitle>Simulation Results</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ResultStat label="Prob of Profit" value={`${(results.spreadProbabilities.probProfit * 100).toFixed(1)}%`} color="text-green-400" />
                  <ResultStat label="Prob of Touch" value={`${(results.spreadProbabilities.probTouchStrike * 100).toFixed(1)}%`} color="text-orange-400" />
                  <ResultStat label="Expected Value" value={`$${results.spreadProbabilities.expectedValue.toFixed(2)}`} color={results.spreadProbabilities.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'} />
                  <ResultStat label="Mean Price" value={results.summary?.meanPrice?.toFixed(0) ?? '--'} color="text-blue-400" />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ParamInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function ResultStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
