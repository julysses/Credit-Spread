'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AnalyticsData {
  monthlyPnl: { month: string; pnl: number }[];
  byStrategy: { strategy: string; trades: number; winRate: number; pnl: number }[];
  summary: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
}

export function AnalyticsChart({ data }: { data: AnalyticsData }) {
  const strategyColors = ['#6366f1', '#22c55e', '#f59e0b'];
  const winLossData = [
    { name: 'Wins', value: Math.round(data.summary.totalTrades * data.summary.winRate), color: '#22c55e' },
    { name: 'Losses', value: Math.round(data.summary.totalTrades * (1 - data.summary.winRate)), color: '#ef4444' },
  ];

  return (
    <div className="space-y-4">
      {/* Monthly P&L */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly P&L</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data.monthlyPnl} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 15%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 15% 55%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 15% 55%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(220 20% 8%)', border: '1px solid hsl(220 15% 20%)', borderRadius: '6px', fontSize: 11 }}
                formatter={(v: number) => [`$${v.toFixed(0)}`, 'P&L']}
              />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}
                fill="#6366f1"
                // Color bars by sign
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Win Rate Donut + Key Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Win/Loss</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="relative">
              <PieChart width={120} height={120}>
                <Pie data={winLossData} cx={55} cy={55} innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value">
                  {winLossData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{(data.summary.winRate * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-500">win rate</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Key Stats</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <StatRow label="Total P&L" value={`$${data.summary.totalPnl.toFixed(0)}`} positive={data.summary.totalPnl >= 0} />
            <StatRow label="Profit Factor" value={data.summary.profitFactor.toFixed(2)} positive />
            <StatRow label="Sharpe" value={data.summary.sharpeRatio.toFixed(2)} positive />
            <StatRow label="Max DD" value={`$${Math.abs(data.summary.maxDrawdown).toFixed(0)}`} negative />
          </CardContent>
        </Card>
      </div>

      {/* Strategy Breakdown */}
      <Card>
        <CardHeader><CardTitle>By Strategy</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.byStrategy.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-300 font-medium">{s.strategy.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-500">{s.trades} trades</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Win Rate</div>
                    <div className="text-sm font-bold text-green-400">{(s.winRate * 100).toFixed(0)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">P&L</div>
                    <div className={`text-sm font-bold font-mono ${s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${s.pnl.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({ label, value, positive, negative }: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-bold font-mono ${negative ? 'text-red-400' : positive ? 'text-green-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}
