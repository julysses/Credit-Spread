'use client';

import {
  ComposedChart,
  AreaChart,
  Area,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ChartDataPoint } from '@/app/api/market/technicals/route';

type BiasSignal = 'bullish' | 'bearish' | 'neutral';

interface SPXChartProps {
  data: ChartDataPoint[];
  swingBias: BiasSignal;
}

// ─── Shared style constants ────────────────────────────────────────────────────

const GRID = { stroke: '#1f2937', strokeDasharray: '3 3' };
const AXIS_STYLE = { fill: '#6b7280', fontSize: 10 };
const TOOLTIP_STYLE = {
  contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: '#9ca3af', fontWeight: 600 },
  itemStyle: { color: '#d1d5db' },
};

const BIAS_COLOR: Record<BiasSignal, string> = {
  bullish: '#10b981',
  bearish: '#ef4444',
  neutral: '#6b7280',
};

// Show every Nth label so the axis isn't crowded
function sparseTickFormatter(data: ChartDataPoint[], interval = 20) {
  return (value: string, index: number) =>
    index % interval === 0 ? value : '';
}

// ─── Custom MACD histogram dot-free bar ──────────────────────────────────────

function HistogramBar(props: {
  x?: number; y?: number; width?: number; height?: number; value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={value >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.85} />;
}

// ─── Price panel tooltip ──────────────────────────────────────────────────────

function PriceTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <p style={{ ...TOOLTIP_STYLE.labelStyle, marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 leading-5">
          <span style={{ color: p.color }}>●</span>
          <span style={TOOLTIP_STYLE.itemStyle}>{p.name}:</span>
          <span className="font-mono text-gray-200">{p.value?.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
        </div>
      ))}
    </div>
  );
}

// ─── RSI tooltip ──────────────────────────────────────────────────────────────

function RSITooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const rsi = payload[0].value;
  const zone = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral';
  const zoneColor = rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#9ca3af';
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <p style={{ ...TOOLTIP_STYLE.labelStyle, marginBottom: 4 }}>{label}</p>
      <div className="flex items-center gap-2">
        <span style={{ color: '#a78bfa' }}>●</span>
        <span style={TOOLTIP_STYLE.itemStyle}>RSI(14):</span>
        <span className="font-mono text-gray-200">{rsi?.toFixed(1)}</span>
        <span style={{ color: zoneColor }} className="text-xs ml-1">{zone}</span>
      </div>
    </div>
  );
}

// ─── MACD tooltip ─────────────────────────────────────────────────────────────

function MACDTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <p style={{ ...TOOLTIP_STYLE.labelStyle, marginBottom: 4 }}>{label}</p>
      {payload.map(p => p.value != null && (
        <div key={p.name} className="flex items-center gap-2 leading-5">
          <span style={{ color: p.color }}>●</span>
          <span style={TOOLTIP_STYLE.itemStyle}>{p.name}:</span>
          <span className="font-mono text-gray-200">{p.value >= 0 ? '+' : ''}{p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SPXChart({ data, swingBias }: SPXChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        Chart data unavailable
      </div>
    );
  }

  const biasColor = BIAS_COLOR[swingBias];
  const labelInterval = Math.max(1, Math.floor(data.length / 6));
  const tickFormatter = sparseTickFormatter(data, labelInterval);

  // Y-axis domain for price with padding
  const closes = data.map(d => d.close).filter(Boolean);
  const smas = data.flatMap(d => [d.sma50, d.sma200]).filter((v): v is number => v != null);
  const allPrices = [...closes, ...smas];
  const priceMin = Math.min(...allPrices) * 0.985;
  const priceMax = Math.max(...allPrices) * 1.015;

  return (
    <div className="space-y-0.5">
      {/* ── Panel 1: Price + SMAs ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-4 px-1 mb-1">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">SPX Daily</span>
          <span className="flex items-center gap-1 text-xs text-orange-400"><span className="inline-block w-4 border-t-2 border-dashed border-orange-400" />50 SMA</span>
          <span className="flex items-center gap-1 text-xs text-blue-400"><span className="inline-block w-4 border-t-2 border-dashed border-blue-400" />200 SMA</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} syncId="spx" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickFormatter} axisLine={false} tickLine={false} />
            <YAxis
              domain={[priceMin, priceMax]}
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              width={52}
            />
            <Tooltip content={<PriceTooltip />} />
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={biasColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={biasColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="close"
              name="SPX"
              stroke={biasColor}
              strokeWidth={1.5}
              fill="url(#priceGrad)"
              dot={false}
              activeDot={{ r: 3, fill: biasColor }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="sma50"
              name="50 SMA"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="sma200"
              name="200 SMA"
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Panel 2: MACD ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-4 px-1 mb-1 mt-2">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">MACD (12/26/9)</span>
          <span className="flex items-center gap-1 text-xs text-blue-400"><span className="inline-block w-3 border-t border-blue-400" />MACD</span>
          <span className="flex items-center gap-1 text-xs text-orange-400"><span className="inline-block w-3 border-t border-dashed border-orange-400" />Signal</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={data} syncId="spx" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickFormatter} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} width={52} />
            <Tooltip content={<MACDTooltip />} />
            <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
            <Bar dataKey="histogram" name="Histogram" barSize={3} shape={<HistogramBar />}>
              {data.map((entry, index) => (
                <Cell key={index} fill={(entry.histogram ?? 0) >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.85} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macd" name="MACD" stroke="#60a5fa" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="macdSignal" name="Signal" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Panel 3: RSI ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-4 px-1 mb-1 mt-2">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">RSI (14)</span>
          <span className="text-xs text-red-400/70">Overbought &gt;70</span>
          <span className="text-xs text-emerald-400/70">Oversold &lt;30</span>
        </div>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={data} syncId="spx" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickFormatter} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 100]} width={52} />
            <Tooltip content={<RSITooltip />} />
            <ReferenceArea y1={70} y2={100} fill="#ef444415" />
            <ReferenceArea y1={0} y2={30} fill="#10b98115" />
            <ReferenceLine y={70} stroke="#ef444450" strokeDasharray="3 3" label={{ value: '70', position: 'right', fill: '#ef444490', fontSize: 9 }} />
            <ReferenceLine y={30} stroke="#10b98150" strokeDasharray="3 3" label={{ value: '30', position: 'right', fill: '#10b98190', fontSize: 9 }} />
            <ReferenceLine y={50} stroke="#37415150" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="rsi" name="RSI(14)" stroke="#a78bfa" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#a78bfa' }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
