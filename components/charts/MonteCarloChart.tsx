'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface MonteCarloChartProps {
  paths: number[][];
  histogram: { bucket: number; frequency: number }[];
  spotPrice: number;
  shortStrike?: number;
  longStrike?: number;
  percentile5?: number;
  percentile95?: number;
  meanPrice?: number;
  probOfProfit?: number;
}

export function MonteCarloChart({
  paths,
  histogram,
  spotPrice,
  shortStrike,
  longStrike,
  percentile5,
  percentile95,
  meanPrice,
  probOfProfit,
}: MonteCarloChartProps) {
  // Convert paths to chart format — sample every N paths
  const samplePaths = paths.slice(0, 30);
  const timeSteps = samplePaths[0]?.length || 0;
  const pathData = [];

  for (let t = 0; t < timeSteps; t++) {
    const point: Record<string, number> = { step: t };
    samplePaths.forEach((path, i) => {
      point[`p${i}`] = path[t];
    });
    pathData.push(point);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Monte Carlo Simulation</CardTitle>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{paths.length} paths shown</span>
            {probOfProfit !== undefined && (
              <span className={`font-semibold ${probOfProfit >= 0.88 ? 'text-green-400' : probOfProfit >= 0.80 ? 'text-yellow-400' : 'text-red-400'}`}>
                POP: {(probOfProfit * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Price Paths */}
        {pathData.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Simulated Price Paths</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pathData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="step" tick={false} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => v.toFixed(0)}
                />
                {shortStrike && (
                  <ReferenceLine y={shortStrike} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: `Short ${shortStrike}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
                )}
                {longStrike && (
                  <ReferenceLine y={longStrike} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1}
                    label={{ value: `Long ${longStrike}`, position: 'right', fontSize: 10, fill: '#f97316' }} />
                )}
                <ReferenceLine y={spotPrice} stroke="#3b82f6" strokeDasharray="6 2" strokeWidth={1.5}
                  label={{ value: `Spot ${spotPrice.toFixed(0)}`, position: 'right', fontSize: 10, fill: '#3b82f6' }} />
                {samplePaths.map((_, i) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={`p${i}`}
                    stroke={i < 5 ? '#6366f1' : '#374151'}
                    strokeWidth={i < 5 ? 1 : 0.5}
                    dot={false}
                    opacity={i < 5 ? 0.7 : 0.3}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Distribution Histogram */}
        {histogram.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Terminal Price Distribution</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={histogram} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 9, fill: '#6b7280' }}
                  tickFormatter={(v) => v.toFixed(0)}
                  interval={Math.floor(histogram.length / 5)}
                />
                <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px', fontSize: 11 }}
                  formatter={(v: number) => [(v * 100).toFixed(2) + '%', 'Frequency']}
                  labelFormatter={(l: number) => `Price: ${l.toFixed(0)}`}
                />
                {shortStrike && (
                  <ReferenceLine x={shortStrike} stroke="#ef4444" strokeDasharray="3 3" />
                )}
                {percentile5 && (
                  <ReferenceLine x={percentile5} stroke="#f97316" strokeDasharray="3 3" strokeWidth={1} />
                )}
                {percentile95 && (
                  <ReferenceLine x={percentile95} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
                )}
                <Bar dataKey="frequency" fill="#6366f1" opacity={0.8} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Spot</div>
              {shortStrike && <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Short {shortStrike}</div>}
              {percentile5 && <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-500 inline-block" /> 5th %ile</div>}
              {percentile95 && <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> 95th %ile</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
