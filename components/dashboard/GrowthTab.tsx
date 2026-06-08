'use client';

import { useState } from 'react';
import { MomentumPanel }    from './growth/MomentumPanel';
import { LongTermPanel }    from './growth/LongTermPanel';
import { FutureMoverPanel } from './growth/FutureMoverPanel';

type SubTab = 'momentum' | 'value' | 'future';

const SUB_TABS: { id: SubTab; label: string; icon: string; description: string }[] = [
  { id: 'momentum', label: 'Momentum',      icon: '⚡', description: '1–30 day technical setups' },
  { id: 'value',    label: 'Value + Growth', icon: '🏦', description: '3–12 month quality growth' },
  { id: 'future',   label: 'Future Movers', icon: '🎯', description: 'Predictions · squeeze · flow' },
];

export function GrowthTab() {
  const [subTab, setSubTab] = useState<SubTab>('momentum');

  return (
    <div className="space-y-5">
      {/* Sub-tab selector */}
      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-left shrink-0 transition-all ${
              subTab === t.id
                ? 'border-sd-accent bg-sd-accent/10 text-gray-100'
                : 'border-sd-line text-gray-500 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="text-base">{t.icon}</span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]">{t.label}</div>
              <div className="text-[9px] opacity-60">{t.description}</div>
            </div>
          </button>
        ))}

        <div className="flex-1" />

        <a
          href="/conviction"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10 text-[10px] text-green-400 hover:text-green-300 hover:border-green-500/50 transition-colors shrink-0 uppercase tracking-[0.12em]"
        >
          🧠 Conviction Picks
        </a>

        <a
          href="/api/growth/training-data?format=csv&minReturnDaysLabeled=30"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sd-line text-[10px] text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors shrink-0"
          download
        >
          <DownloadIcon />
          ML Data
        </a>
      </div>

      {/* Stats bar */}
      <GrowthStatsBar />

      {/* Sub-tab content */}
      <div>
        {subTab === 'momentum' && <MomentumPanel />}
        {subTab === 'value'    && <LongTermPanel />}
        {subTab === 'future'   && <FutureMoverPanel />}
      </div>
    </div>
  );
}

function GrowthStatsBar() {
  const [stats, setStats] = useState<{
    shortTermCount?: number;
    longTermCount?: number;
    futureMoverCount?: number;
    scanDate?: string;
    marketRegime?: string;
  } | null>(null);

  useState(() => {
    fetch('/api/growth/screener?type=short_term&limit=1')
      .then(r => r.json())
      .then(data => {
        const scan = data?.data?.scan;
        if (scan) setStats(scan);
      })
      .catch(() => {});
  });

  const regimeColor = stats?.marketRegime === 'bull' ? 'text-green-400'
    : stats?.marketRegime === 'bear' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Momentum Picks" value={stats?.shortTermCount ?? '--'} sub="score ≥ 60" color="text-green-400" />
      <StatCard label="Value+Growth"   value={stats?.longTermCount ?? '--'}  sub="Piotroski ≥ 5" color="text-blue-400" />
      <StatCard label="Future Movers"  value={stats?.futureMoverCount ?? '--'} sub="prediction" color="text-yellow-400" />
      <StatCard
        label="Market Regime"
        value={stats?.marketRegime ? stats.marketRegime.toUpperCase() : '—'}
        sub={stats?.scanDate ? `Scan: ${stats.scanDate}` : 'Daily 6 AM ET'}
        color={regimeColor}
      />
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="bg-sd-muted/30 border border-sd-line/50 rounded-lg p-3">
      <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] text-gray-600 mt-0.5">{sub}</div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
