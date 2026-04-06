'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import {
  RefreshCw,
  Brain,
  Save,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  BarChart3,
  Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Inputs = {
  wtiPrice: number;
  wti4wkChangePct: number;
  spxPrice: number;
  spx200sma: number;
  breadthPctAbove200: number;
  hySpreadBps: number;
  hySpread2wkChange: number;
  dxyLevel: number;
  vixLevel: number;
  goldPrice: number;
  goldWeeklyChangePct: number;
  portfolioVolAnnualized: number;
  gexValue: number;
  vvixLevel: number;
  pcrValue: number;
};

type MacroSignal = {
  name: string;
  fired: boolean;
  value: number;
  threshold: string;
  unit?: string;
};

type FlowSignal = {
  name: string;
  fired: boolean;
  value: number;
  threshold: string;
  unit?: string;
};

type ScoreResult = {
  macroScore: number;
  flowScore: number;
  compositeTier: string;
  portfolioVolStatus: string;
  macroSignals: MacroSignal[];
  flowSignals: FlowSignal[];
  feedbackBonusActive: boolean;
  firedSignals: string[];
};

type SignalSnapshot = {
  id: string;
  created_at: string;
  macro_score: number;
  flow_score: number;
  composite_signal: string;
  ai_recommendation?: string;
  notes?: string;
  inputs?: Inputs;
};

// ─── Scoring Logic ────────────────────────────────────────────────────────────

function computeScores(inputs: Inputs): ScoreResult {
  const spxDevPct = ((inputs.spxPrice - inputs.spx200sma) / inputs.spx200sma) * 100;

  const macroSignalDefs: MacroSignal[] = [
    {
      name: 'Oil Shock Confirmed',
      fired: inputs.wti4wkChangePct >= 20,
      value: inputs.wti4wkChangePct,
      threshold: '≥ 20%',
      unit: '%',
    },
    {
      name: 'Price Below 200 SMA',
      fired: spxDevPct < -3,
      value: parseFloat(spxDevPct.toFixed(2)),
      threshold: '< -3%',
      unit: '%',
    },
    {
      name: 'Breadth Breakdown',
      fired: inputs.breadthPctAbove200 < 40,
      value: inputs.breadthPctAbove200,
      threshold: '< 40%',
      unit: '%',
    },
    {
      name: 'Credit Stress Widening',
      fired: inputs.hySpread2wkChange >= 50,
      value: inputs.hySpread2wkChange,
      threshold: '≥ 50 bps',
      unit: 'bps',
    },
    {
      name: 'Dollar Strength Elevated',
      fired: inputs.dxyLevel > 100,
      value: inputs.dxyLevel,
      threshold: '> 100',
      unit: '',
    },
    {
      name: 'Volatility Spike Confirmed',
      fired: inputs.vixLevel > 30,
      value: inputs.vixLevel,
      threshold: '> 30',
      unit: '',
    },
    {
      name: 'Flight to Safety',
      fired: inputs.goldWeeklyChangePct >= 2,
      value: inputs.goldWeeklyChangePct,
      threshold: '≥ 2%',
      unit: '%',
    },
  ];

  const flowSignalDefs: FlowSignal[] = [
    {
      name: 'Negative Gamma — Trending Regime',
      fired: inputs.gexValue < 0,
      value: inputs.gexValue,
      threshold: '< 0',
      unit: '',
    },
    {
      name: 'Vol of Vol Elevated',
      fired: inputs.vvixLevel > 95,
      value: inputs.vvixLevel,
      threshold: '> 95',
      unit: '',
    },
    {
      name: 'Put/Call Ratio — Fear Confirmed',
      fired: inputs.pcrValue > 1.2,
      value: inputs.pcrValue,
      threshold: '> 1.2',
      unit: '',
    },
  ];

  const oilShockFired = macroSignalDefs[0].fired;
  const dollarStrengthFired = macroSignalDefs[4].fired;
  const feedbackBonusActive = oilShockFired && dollarStrengthFired;

  let macroScore = macroSignalDefs.filter((s) => s.fired).length;
  if (feedbackBonusActive) macroScore = Math.min(macroScore + 1, 8);

  const flowScore = flowSignalDefs.filter((s) => s.fired).length;

  let portfolioVolStatus = 'Normal';
  if (inputs.portfolioVolAnnualized >= 18) {
    portfolioVolStatus = 'CRITICAL';
  } else if (inputs.portfolioVolAnnualized >= 13) {
    portfolioVolStatus = 'Elevated';
  }

  const firedSignals = [
    ...macroSignalDefs.filter((s) => s.fired).map((s) => s.name),
    ...flowSignalDefs.filter((s) => s.fired).map((s) => s.name),
  ];

  let compositeTier = 'NO ACTION';

  if (macroScore <= 2) {
    compositeTier = 'NO ACTION';
  } else if (macroScore >= 6 && flowScore >= 2 && inputs.portfolioVolAnnualized >= 18) {
    compositeTier = 'BLACK — Crisis Mode';
  } else if (macroScore >= 5 && flowScore >= 2) {
    compositeTier = 'RED — Full Hedge';
  } else if ((macroScore >= 3 && macroScore <= 4 && flowScore >= 2) || (macroScore === 5 && flowScore <= 1)) {
    compositeTier = 'ORANGE — Reduce Exposure';
  } else if (macroScore >= 3 && macroScore <= 4 && flowScore <= 1) {
    compositeTier = 'YELLOW — Monitor';
  }

  // Escalate one tier if CRITICAL vol + macroScore >= 4
  if (portfolioVolStatus === 'CRITICAL' && macroScore >= 4) {
    if (compositeTier === 'YELLOW — Monitor') compositeTier = 'ORANGE — Reduce Exposure';
    else if (compositeTier === 'ORANGE — Reduce Exposure') compositeTier = 'RED — Full Hedge';
    else if (compositeTier === 'RED — Full Hedge') compositeTier = 'BLACK — Crisis Mode';
  }

  return {
    macroScore,
    flowScore,
    compositeTier,
    portfolioVolStatus,
    macroSignals: macroSignalDefs,
    flowSignals: flowSignalDefs,
    feedbackBonusActive,
    firedSignals,
  };
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function MacroGauge({ score }: { score: number }) {
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const startAngle = -135;
  const sweepAngle = 270;

  function polarToCartesian(angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  function arcPath(start: number, end: number) {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const gaugeColor =
    score <= 2
      ? '#22c55e'
      : score <= 4
      ? '#eab308'
      : score === 5
      ? '#f97316'
      : score <= 7
      ? '#ef4444'
      : '#6b7280';

  const filledDeg = (score / 8) * sweepAngle;
  const filledEndAngle = startAngle + filledDeg;

  return (
    <svg width={180} height={160} viewBox="0 0 180 160">
      {/* Track */}
      <path
        d={arcPath(startAngle, startAngle + sweepAngle)}
        fill="none"
        stroke="#1e293b"
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {score > 0 && (
        <path
          d={arcPath(startAngle, filledEndAngle)}
          fill="none"
          stroke={gaugeColor}
          strokeWidth={14}
          strokeLinecap="round"
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight="bold" fill={gaugeColor}>
        {score}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={12} fill="#64748b">
        / 8
      </text>
      <text x={cx} y={cy - 22} textAnchor="middle" fontSize={10} fill="#94a3b8">
        MACRO SCORE
      </text>
    </svg>
  );
}

function FlowBar({ score }: { score: number }) {
  const colors = ['#ef4444', '#f97316', '#eab308'];
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-slate-400 uppercase tracking-widest">Flow Score</span>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-5 w-16 rounded"
            style={{
              backgroundColor: i < score ? colors[i] : '#1e293b',
              border: '1px solid #334155',
            }}
          />
        ))}
      </div>
      <span className="text-lg font-bold text-white">{score} / 3</span>
    </div>
  );
}

function SignalRow({
  name,
  value,
  threshold,
  fired,
  unit,
}: {
  name: string;
  value: number;
  threshold: string;
  fired: boolean;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{name}</p>
        <p className="text-xs text-slate-500">
          {value}
          {unit} · {threshold}
        </p>
      </div>
      <div
        className={`ml-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
          fired ? 'bg-red-900/50 text-red-400' : 'bg-green-900/30 text-green-500'
        }`}
      >
        {fired ? <XCircle size={12} /> : <CheckCircle size={12} />}
        {fired ? 'FIRED' : 'CLEAR'}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  unit,
  step,
  autoFetched,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  autoFetched?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-slate-400 flex items-center gap-1">
        {label}
        {unit ? ` (${unit})` : ''}
        {autoFetched && (
          <span
            title="Auto-fetched from live market data"
            className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5 shrink-0"
          />
        )}
      </label>
      <input
        type="number"
        step={step ?? 0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-full"
      />
    </div>
  );
}

function AIPanel({
  recommendation,
  onSave,
  saving,
}: {
  recommendation: string;
  onSave: () => void;
  saving: boolean;
}) {
  const lines = recommendation.split('\n');
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="prose prose-invert prose-sm max-w-none">
        {lines.map((line, i) => {
          const isHeader = /^#{1,3}\s/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line);
          const cleaned = line.replace(/^#{1,3}\s/, '').replace(/\*\*/g, '');
          if (!line.trim()) return <div key={i} className="h-2" />;
          if (isHeader) {
            return (
              <p key={i} className="text-blue-400 font-semibold text-sm mt-3 mb-1">
                {cleaned}
              </p>
            );
          }
          return (
            <p key={i} className="text-slate-300 text-sm leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
      >
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving…' : 'Save to Trade Log'}
      </button>
    </div>
  );
}

function HistoryTable({
  rows,
  onRowClick,
}: {
  rows: SignalSnapshot[];
  onRowClick: (row: SignalSnapshot) => void;
}) {
  if (!rows.length) {
    return <p className="text-slate-500 text-sm text-center py-6">No snapshots yet.</p>;
  }

  function tierColor(tier: string) {
    if (tier.includes('BLACK')) return 'text-slate-400';
    if (tier.includes('RED')) return 'text-red-400';
    if (tier.includes('ORANGE')) return 'text-orange-400';
    if (tier.includes('YELLOW')) return 'text-yellow-400';
    return 'text-green-400';
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left py-2 px-3 text-slate-400 font-medium">Date</th>
            <th className="text-center py-2 px-3 text-slate-400 font-medium">Macro</th>
            <th className="text-center py-2 px-3 text-slate-400 font-medium">Flow</th>
            <th className="text-left py-2 px-3 text-slate-400 font-medium">Composite</th>
            <th className="text-left py-2 px-3 text-slate-400 font-medium">AI Preview</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors"
            >
              <td className="py-2 px-3 text-slate-300">
                {new Date(row.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-2 px-3 text-center text-white font-mono">{row.macro_score}</td>
              <td className="py-2 px-3 text-center text-white font-mono">{row.flow_score}</td>
              <td className={`py-2 px-3 font-medium ${tierColor(row.composite_signal)}`}>
                {row.composite_signal}
              </td>
              <td className="py-2 px-3 text-slate-400 truncate max-w-[200px]">
                {row.ai_recommendation ? row.ai_recommendation.slice(0, 60) + '…' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ChartPoint = {
  date: string;
  macro_score: number;
};

function ScoreHistoryChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) {
    return <p className="text-slate-500 text-sm text-center py-6">No history to chart.</p>;
  }

  function dotColor(score: number) {
    if (score >= 6) return '#ef4444';
    if (score >= 5) return '#f97316';
    if (score >= 3) return '#eab308';
    return '#22c55e';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    return <circle cx={cx} cy={cy} r={4} fill={dotColor(payload.macro_score)} stroke="none" />;
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
        <YAxis domain={[0, 8]} tick={{ fill: '#64748b', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#e2e8f0' }}
        />
        <ReferenceLine y={3} stroke="#eab308" strokeDasharray="4 4" label={{ value: 'Yellow', fill: '#eab308', fontSize: 10 }} />
        <ReferenceLine y={5} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'Orange', fill: '#f97316', fontSize: 10 }} />
        <ReferenceLine y={6} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Red', fill: '#ef4444', fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="macro_score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 6, fill: '#3b82f6' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Tactical Response Config ─────────────────────────────────────────────────

type TierConfig = {
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  action: string;
  details: string[];
  baseCase?: string;
};

const TIER_CONFIG: Record<string, TierConfig> = {
  'NO ACTION': {
    color: 'green',
    bgClass: 'bg-green-950/40',
    borderClass: 'border-green-800',
    textClass: 'text-green-400',
    action: 'Normal posture. Continue current positioning.',
    details: ['No macro or flow signals active.', 'Market structure intact.', 'Standard risk parameters apply.'],
  },
  'YELLOW — Monitor': {
    color: 'yellow',
    bgClass: 'bg-yellow-950/40',
    borderClass: 'border-yellow-700',
    textClass: 'text-yellow-400',
    action: 'Shift new positions to defined-risk spreads. Stop buying naked calls. Maintain existing longs.',
    details: [
      'Emerging macro pressure detected.',
      'Avoid adding undefined-risk exposure.',
      'Begin monitoring for escalation.',
    ],
  },
  'ORANGE — Reduce Exposure': {
    color: 'orange',
    bgClass: 'bg-orange-950/40',
    borderClass: 'border-orange-700',
    textClass: 'text-orange-400',
    action: 'Buy SPX put spreads 60–90 DTE. Trim net delta exposure by 25–30%.',
    details: [
      'Multiple macro signals active or flow pressure elevated.',
      'Hedge existing book with put spreads.',
      'Reduce gross delta by 25–30%.',
    ],
  },
  'RED — Full Hedge': {
    color: 'red',
    bgClass: 'bg-red-950/40',
    borderClass: 'border-red-700',
    textClass: 'text-red-400',
    action:
      'Buy outright SPX puts or VIX calls. Eliminate upside risk on new trades. Consider closing profitable longs.',
    details: [
      'High macro signal count with flow confirmation.',
      'Full hedge required.',
      'No new unhedged upside exposure.',
    ],
    baseCase: 'Historical base case: -10% to -15% SPX drawdown in 90 days.',
  },
  'BLACK — Crisis Mode': {
    color: 'gray',
    bgClass: 'bg-slate-900',
    borderClass: 'border-slate-600',
    textClass: 'text-slate-200',
    action:
      'Rotate to cash + maximum hedge posture. Buy wide puts, VIX calls, consider inverse ETF allocation.',
    details: [
      'Critical vol + maximum macro signal stack.',
      'Preserve capital at all costs.',
      'Inverse ETF allocation may be appropriate.',
    ],
    baseCase: 'Pre-crash environment. Protect capital at all costs.',
  },
};

// ─── Default Inputs ───────────────────────────────────────────────────────────

const DEFAULT_INPUTS: Inputs = {
  wtiPrice: 78.5,
  wti4wkChangePct: 5.2,
  spxPrice: 5200,
  spx200sma: 4950,
  breadthPctAbove200: 55,
  hySpreadBps: 380,
  hySpread2wkChange: 20,
  dxyLevel: 103.5,
  vixLevel: 18.2,
  goldPrice: 2320,
  goldWeeklyChangePct: 0.8,
  portfolioVolAnnualized: 10,
  gexValue: 500000000,
  vvixLevel: 88,
  pcrValue: 0.85,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function SignalStackEngine() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [scores, setScores] = useState<ScoreResult>(() => computeScores(DEFAULT_INPUTS));
  const [history, setHistory] = useState<SignalSnapshot[]>([]);
  const [aiRec, setAiRec] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // ── Auto-fetch state ────────────────────────────────────────────────────────
  const [autoFetching, setAutoFetching] = useState(false);
  const [autoFetchError, setAutoFetchError] = useState<string | null>(null);
  const [autoFetchedFields, setAutoFetchedFields] = useState<Set<keyof Inputs>>(new Set());
  const [lastAutoFetch, setLastAutoFetch] = useState<Date | null>(null);

  // Live clock
  useEffect(() => {
    const tick = () =>
      setTimestamp(
        new Date().toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Recompute scores on input change
  useEffect(() => {
    setScores(computeScores(inputs));
  }, [inputs]);

  // Fetch history on mount
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/signal-stack/snapshots');
      const json = await res.json();
      if (json.success) setHistory(json.data ?? []);
      else setHistoryError(json.error ?? 'Failed to load history');
    } catch {
      setHistoryError('Network error loading history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Auto-fetch market inputs ────────────────────────────────────────────────
  const fetchMarketInputs = useCallback(async () => {
    setAutoFetching(true);
    setAutoFetchError(null);
    try {
      const res = await fetch('/api/signal-stack/market-inputs');
      const json = await res.json();
      if (!json.success) {
        setAutoFetchError(json.error ?? 'Failed to fetch market data');
        return;
      }
      const d = json.data;

      // Map API response → Inputs keys, skipping nulls so manual values are preserved
      const updates: Partial<Inputs> = {};
      const fetched = new Set<keyof Inputs>();

      const set = <K extends keyof Inputs>(key: K, val: number | null) => {
        if (val !== null && !isNaN(val)) { updates[key] = val as Inputs[K]; fetched.add(key); }
      };

      set('spxPrice',           d.spxPrice);
      set('vixLevel',           d.vixLevel);
      set('spx200sma',          d.spx200sma);
      set('breadthPctAbove200', d.breadthPctAbove200);
      set('wtiPrice',           d.wtiPrice);
      set('wti4wkChangePct',    d.wti4wkChangePct);
      set('dxyLevel',           d.dxyLevel);
      set('goldPrice',          d.goldPrice);
      set('goldWeeklyChangePct',d.goldWeeklyChangePct);
      set('hySpreadBps',        d.hySpreadBps);
      set('hySpread2wkChange',  d.hySpread2wkChange);
      set('gexValue',           d.gexValue);
      set('vvixLevel',          d.vvixLevel);
      set('pcrValue',           d.pcrValue);

      setInputs((prev) => ({ ...prev, ...updates }));
      setAutoFetchedFields(fetched);
      setLastAutoFetch(new Date());

      // Surface any per-source errors as a warning
      const failed = Object.entries(d.sources ?? {})
        .filter(([, s]) => s === 'error')
        .map(([k]) => k);
      if (failed.length > 0) {
        setAutoFetchError(`Partial: could not fetch ${failed.join(', ')}`);
      }
    } catch (e) {
      setAutoFetchError('Network error fetching market inputs');
      console.error('Auto-fetch error:', e);
    } finally {
      setAutoFetching(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => { fetchMarketInputs(); }, [fetchMarketInputs]);

  function updateInput<K extends keyof Inputs>(key: K, value: Inputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRunSignalStack() {
    setRunning(true);
    try {
      const payload = {
        ...inputs,
        macro_score: scores.macroScore,
        flow_score: scores.flowScore,
        composite_signal: scores.compositeTier,
      };
      const res = await fetch('/api/signal-stack/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setLastSavedId(json.data.id);
        setHistory((prev) => [json.data, ...prev]);
      }
    } catch {
      // fail silently
    } finally {
      setRunning(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAiRec('');
    try {
      const payload = {
        ...inputs,
        macro_score: scores.macroScore,
        flow_score: scores.flowScore,
        composite_signal: scores.compositeTier,
        firedSignals: scores.firedSignals,
        feedbackBonusActive: scores.feedbackBonusActive,
        portfolioVolStatus: scores.portfolioVolStatus,
      };
      const res = await fetch('/api/signal-stack/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) setAiRec(json.recommendation ?? '');
      else setAiRec('Analysis failed. Please try again.');
    } catch {
      setAiRec('Network error. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveToLog() {
    if (!lastSavedId) return;
    setSaving(true);
    try {
      await fetch('/api/signal-stack/snapshots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lastSavedId, ai_recommendation: aiRec, notes }),
      });
    } catch {
      // fail silently
    } finally {
      setSaving(false);
    }
  }

  const tierConfig = TIER_CONFIG[scores.compositeTier] ?? TIER_CONFIG['NO ACTION'];

  const chartData: ChartPoint[] = history
    .slice()
    .reverse()
    .map((row) => ({
      date: new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      macro_score: row.macro_score,
    }));

  const volPillColor =
    scores.portfolioVolStatus === 'CRITICAL'
      ? 'bg-red-900/60 text-red-400 border-red-700'
      : scores.portfolioVolStatus === 'Elevated'
      ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700'
      : 'bg-green-900/30 text-green-500 border-green-800';

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={22} className="text-blue-400" />
              <h1 className="text-2xl font-bold tracking-tight">SPX Signal Stack Engine</h1>
            </div>
            <p className="text-slate-400 text-sm">Macro Directional Intelligence</p>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs bg-slate-900 border border-slate-800 rounded px-3 py-1.5">
            <Clock size={13} />
            {timestamp}
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* LEFT: Input Panel */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Market Inputs</h2>
              <button
                onClick={fetchMarketInputs}
                disabled={autoFetching}
                title="Refresh live market data"
                className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={autoFetching ? 'animate-spin' : ''} />
                {autoFetching ? 'Fetching…' : 'Refresh'}
              </button>
            </div>

            {/* Auto-fetch status banner */}
            {autoFetching && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-950/40 border border-blue-800/40 rounded px-3 py-2 mb-3">
                <RefreshCw size={11} className="animate-spin shrink-0" />
                Loading live market data from MarketData.app, Yahoo Finance &amp; FRED…
              </div>
            )}
            {!autoFetching && lastAutoFetch && (
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="flex items-center gap-1.5 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Live data — {lastAutoFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-slate-500">{autoFetchedFields.size}/14 auto-filled</span>
              </div>
            )}
            {autoFetchError && (
              <div className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800/40 rounded px-3 py-2 mb-3">
                ⚠ {autoFetchError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <InputField label="WTI Price" value={inputs.wtiPrice} onChange={(v) => updateInput('wtiPrice', v)} unit="$" autoFetched={autoFetchedFields.has('wtiPrice')} />
              <InputField label="WTI 4wk Chg" value={inputs.wti4wkChangePct} onChange={(v) => updateInput('wti4wkChangePct', v)} unit="%" autoFetched={autoFetchedFields.has('wti4wkChangePct')} />
              <InputField label="SPX Price" value={inputs.spxPrice} onChange={(v) => updateInput('spxPrice', v)} unit="$" step={1} autoFetched={autoFetchedFields.has('spxPrice')} />
              <InputField label="SPX 200 SMA" value={inputs.spx200sma} onChange={(v) => updateInput('spx200sma', v)} unit="$" step={1} autoFetched={autoFetchedFields.has('spx200sma')} />
              <InputField label="Breadth > 200" value={inputs.breadthPctAbove200} onChange={(v) => updateInput('breadthPctAbove200', v)} unit="%" autoFetched={autoFetchedFields.has('breadthPctAbove200')} />
              <InputField label="HY Spread" value={inputs.hySpreadBps} onChange={(v) => updateInput('hySpreadBps', v)} unit="bps" step={1} autoFetched={autoFetchedFields.has('hySpreadBps')} />
              <InputField label="HY 2wk Chg" value={inputs.hySpread2wkChange} onChange={(v) => updateInput('hySpread2wkChange', v)} unit="bps" step={1} autoFetched={autoFetchedFields.has('hySpread2wkChange')} />
              <InputField label="DXY Level" value={inputs.dxyLevel} onChange={(v) => updateInput('dxyLevel', v)} autoFetched={autoFetchedFields.has('dxyLevel')} />
              <InputField label="VIX Level" value={inputs.vixLevel} onChange={(v) => updateInput('vixLevel', v)} autoFetched={autoFetchedFields.has('vixLevel')} />
              <InputField label="Gold Price" value={inputs.goldPrice} onChange={(v) => updateInput('goldPrice', v)} unit="$" step={1} autoFetched={autoFetchedFields.has('goldPrice')} />
              <InputField label="Gold Wkly Chg" value={inputs.goldWeeklyChangePct} onChange={(v) => updateInput('goldWeeklyChangePct', v)} unit="%" autoFetched={autoFetchedFields.has('goldWeeklyChangePct')} />
              <InputField label="Portfolio Vol" value={inputs.portfolioVolAnnualized} onChange={(v) => updateInput('portfolioVolAnnualized', v)} unit="%" />
              <InputField label="GEX Value" value={inputs.gexValue} onChange={(v) => updateInput('gexValue', v)} step={100000000} autoFetched={autoFetchedFields.has('gexValue')} />
              <InputField label="VVIX Level" value={inputs.vvixLevel} onChange={(v) => updateInput('vvixLevel', v)} autoFetched={autoFetchedFields.has('vvixLevel')} />
              <InputField label="P/C Ratio" value={inputs.pcrValue} onChange={(v) => updateInput('pcrValue', v)} step={0.01} autoFetched={autoFetchedFields.has('pcrValue')} />
            </div>
            <button
              onClick={handleRunSignalStack}
              disabled={running}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              {running ? <RefreshCw size={15} className="animate-spin" /> : <BarChart3 size={15} />}
              {running ? 'Running…' : 'Run Signal Stack'}
            </button>
          </div>

          {/* CENTER: Score Dashboard */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col items-center gap-5">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Score Dashboard</h2>
            </div>

            <MacroGauge score={scores.macroScore} />

            <FlowBar score={scores.flowScore} />

            {/* Portfolio Vol */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${volPillColor}`}>
              <AlertTriangle size={13} />
              Portfolio Vol: {inputs.portfolioVolAnnualized}% — {scores.portfolioVolStatus}
            </div>

            {/* Feedback Loop Bonus */}
            {scores.feedbackBonusActive && (
              <div className="flex items-center gap-2 bg-orange-900/30 border border-orange-700 text-orange-400 text-xs px-3 py-1.5 rounded-full">
                <AlertTriangle size={12} />
                Feedback Loop Bonus Active (+1)
              </div>
            )}

            {/* Composite Tier */}
            <div
              className={`w-full text-center rounded-xl border-2 py-4 px-3 ${tierConfig.bgClass} ${tierConfig.borderClass}`}
            >
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Composite Signal</p>
              <p className={`text-xl font-extrabold tracking-tight ${tierConfig.textClass}`}>
                {scores.compositeTier}
              </p>
            </div>
          </div>

          {/* RIGHT: Active Signals */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Signal Monitor</h2>
              <span className="ml-auto text-xs bg-slate-800 rounded-full px-2 py-0.5 text-slate-400">
                {scores.firedSignals.length} fired
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Macro</p>
              {scores.macroSignals.map((s) => (
                <SignalRow
                  key={s.name}
                  name={s.name}
                  value={s.value}
                  threshold={s.threshold}
                  fired={s.fired}
                  unit={s.unit}
                />
              ))}
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-3 mb-1">Flow</p>
              {scores.flowSignals.map((s) => (
                <SignalRow
                  key={s.name}
                  name={s.name}
                  value={s.value}
                  threshold={s.threshold}
                  fired={s.fired}
                  unit={s.unit}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TACTICAL RESPONSE */}
        <div className={`rounded-xl border-2 p-5 mb-4 ${tierConfig.bgClass} ${tierConfig.borderClass}`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className={tierConfig.textClass} />
            <h2 className={`text-sm font-semibold uppercase tracking-wider ${tierConfig.textClass}`}>
              Tactical Response — {scores.compositeTier}
            </h2>
          </div>
          <p className="text-white font-semibold text-base mb-3">{tierConfig.action}</p>
          <ul className="space-y-1">
            {tierConfig.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className={`mt-0.5 ${tierConfig.textClass}`}>›</span>
                {d}
              </li>
            ))}
          </ul>
          {tierConfig.baseCase && (
            <p className={`mt-3 text-sm font-semibold ${tierConfig.textClass}`}>{tierConfig.baseCase}</p>
          )}
        </div>

        {/* AI PANEL */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">AI Analysis</h2>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors mb-4"
          >
            {analyzing ? <RefreshCw size={15} className="animate-spin" /> : <Brain size={15} />}
            {analyzing ? 'Analyzing…' : 'Analyze with AI'}
          </button>

          {analyzing && (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4">
              <RefreshCw size={16} className="animate-spin text-blue-400" />
              Running signal analysis through Claude…
            </div>
          )}

          {aiRec && !analyzing && (
            <>
              <AIPanel recommendation={aiRec} onSave={handleSaveToLog} saving={saving} />
              <div className="mt-4">
                <label className="text-xs text-slate-400 mb-1 block">Trade Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add context, reasoning, or follow-up actions…"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* HISTORY TABLE */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Snapshot History</h2>
            <button
              onClick={fetchHistory}
              disabled={historyLoading}
              className="ml-auto text-slate-400 hover:text-white transition-colors"
              title="Refresh history"
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {historyError && (
            <p className="text-red-400 text-sm mb-2">{historyError}</p>
          )}
          <HistoryTable
            rows={history}
            onRowClick={(row) => {
              if (row.ai_recommendation) setAiRec(row.ai_recommendation);
              if (row.notes) setNotes(row.notes);
            }}
          />
        </div>

        {/* SCORE HISTORY CHART */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Macro Score History</h2>
          </div>
          <ScoreHistoryChart data={chartData} />
        </div>

      </div>
    </div>
  );
}
