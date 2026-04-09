'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Award, Target, Zap, Activity } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

type ZeroDTETrade = {
  id: string;
  created_at: string;
  strategy_name: string;
  entry_credit: number | null;
  entry_time: string | null;
  exit_time: string | null;
  exit_debit: number | null;
  outcome: string | null;
  total_pnl: number | null;
  all_conditions_met: boolean | null;
  underlying: string;
  structure_type: string | null;
};

type Stats = {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  bestStrategy: string;
  byStrategy: { name: string; winRate: number; totalPnl: number; totalTrades: number }[];
};

function fmt$(n: number | null | undefined) {
  if (n == null) return '—';
  const s = Math.abs(n).toFixed(0);
  return (n < 0 ? '-$' : '$') + s;
}

function fmtPct(n: number) {
  return (n * 100).toFixed(1) + '%';
}

const STRATEGY_LABELS: Record<string, string> = {
  BIC: 'BIC',
  LateEntryIC: 'Late IC',
  PegIC: 'Peg IC',
  TuesdayPCS: 'Tue PCS',
  GEXSpread: 'GEX',
  VIX1DIC: 'VIX1D IC',
  SchwartzIC: 'Schwartz',
};

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest">
        <Icon size={13} />
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

// ── Outcome badge ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-slate-600 text-xs">—</span>;
  const map: Record<string, string> = {
    max_profit:    'bg-green-900/40 text-green-400 border-green-700',
    partial_profit:'bg-emerald-900/40 text-emerald-400 border-emerald-700',
    breakeven:     'bg-slate-800 text-slate-400 border-slate-600',
    stop_loss:     'bg-red-900/40 text-red-400 border-red-700',
    max_loss:      'bg-red-950 text-red-300 border-red-600',
  };
  const cls = map[outcome] ?? 'bg-slate-800 text-slate-400 border-slate-700';
  return (
    <span className={`border rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {outcome.replace('_', ' ')}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ZeroDTEPerformance() {
  const [trades, setTrades] = useState<ZeroDTETrade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/zero-dte-trades');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load');
      setTrades(json.data.trades ?? []);
      setStats(json.data.stats ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build cumulative P&L series from trades (oldest first)
  const cumulativeData = [...trades]
    .filter(t => t.total_pnl != null)
    .reverse()
    .reduce<{ date: string; pnl: number; cumPnl: number }[]>((acc, t, i) => {
      const prev = acc[i - 1]?.cumPnl ?? 0;
      acc.push({
        date: new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl: t.total_pnl!,
        cumPnl: prev + (t.total_pnl ?? 0),
      });
      return acc;
    }, []);

  // Win rate bar data
  const barData = (stats?.byStrategy ?? [])
    .filter(s => s.totalTrades >= 1)
    .map(s => ({
      name: STRATEGY_LABELS[s.name] ?? s.name,
      winRate: Math.round(s.winRate * 100),
      trades: s.totalTrades,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm gap-2">
        <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading performance data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  const totalTrades = stats?.totalTrades ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">0DTE Performance</h2>
          <p className="text-xs text-slate-500 mt-0.5">Based on logged trades in zero_dte_trades table</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {totalTrades === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No trades logged yet.</p>
          <p className="text-slate-600 text-xs mt-1">
            Use the &quot;Log This Trade&quot; button in the 0DTE Library to record your first trade.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              label="Total Trades"
              value={String(stats?.totalTrades ?? 0)}
              color="text-white"
              icon={Activity}
            />
            <StatCard
              label="Win Rate"
              value={fmtPct(stats?.winRate ?? 0)}
              color={(stats?.winRate ?? 0) >= 0.65 ? 'text-green-400' : (stats?.winRate ?? 0) >= 0.5 ? 'text-yellow-400' : 'text-red-400'}
              icon={Target}
            />
            <StatCard
              label="Avg Win"
              value={fmt$(stats?.avgWin ?? null)}
              color="text-green-400"
              icon={TrendingUp}
            />
            <StatCard
              label="Avg Loss"
              value={fmt$(stats?.avgLoss ?? null)}
              color="text-red-400"
              icon={TrendingDown}
            />
            <StatCard
              label="Expectancy"
              value={fmt$(stats?.expectancy ?? null)}
              color={(stats?.expectancy ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}
              icon={Zap}
            />
            <StatCard
              label="Best Strategy"
              value={STRATEGY_LABELS[stats?.bestStrategy ?? ''] ?? (stats?.bestStrategy ?? '—')}
              color="text-blue-400"
              icon={Award}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Win Rate by Strategy */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Win Rate by Strategy</h3>
              {barData.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No strategy data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#94a3b8' }}
                      itemStyle={{ color: '#e2e8f0' }}
                      formatter={(val: number) => [`${val}%`, 'Win Rate']}
                    />
                    <ReferenceLine y={65} stroke="#eab308" strokeDasharray="4 4" />
                    <Bar dataKey="winRate" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Cumulative P&L */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Cumulative P&amp;L</h3>
              {cumulativeData.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No P&amp;L data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={cumulativeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#94a3b8' }}
                      itemStyle={{ color: '#e2e8f0' }}
                      formatter={(val: number) => [`$${val.toFixed(0)}`, 'Cumulative P&L']}
                    />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                    <Line
                      type="monotone"
                      dataKey="cumPnl"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Trade log table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Trades (last 20)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Date', 'Strategy', 'Structure', 'Credit', 'P&L', 'Outcome', 'All Cond.'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-slate-400 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 20).map(t => (
                    <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2 px-3 text-white font-medium text-xs">
                        {STRATEGY_LABELS[t.strategy_name] ?? t.strategy_name}
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-xs">
                        {t.structure_type ?? '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-300 font-mono text-xs">
                        {t.entry_credit != null ? `$${t.entry_credit.toFixed(2)}` : '—'}
                      </td>
                      <td className={`py-2 px-3 font-mono font-semibold text-xs ${
                        (t.total_pnl ?? 0) > 0 ? 'text-green-400' : (t.total_pnl ?? 0) < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {fmt$(t.total_pnl)}
                      </td>
                      <td className="py-2 px-3">
                        <OutcomeBadge outcome={t.outcome} />
                      </td>
                      <td className="py-2 px-3 text-xs text-center">
                        {t.all_conditions_met == null ? (
                          <span className="text-slate-600">—</span>
                        ) : t.all_conditions_met ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <span className="text-red-500">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
