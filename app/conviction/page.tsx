'use client';

import { useEffect, useState } from 'react';
import { ScoreRing } from '@/components/dashboard/growth/ScoreRing';
import { SignalBadge } from '@/components/dashboard/growth/SignalBadge';

type ConvictionPick = {
  ticker: string;
  companyName: string;
  sector?: string;
  rank: number;
  convictionScore: number;
  classification: string;
  timeHorizon: string;
  signalBreakdown: Record<string, number>;
  bullCase: string[];
  bearCase: string[];
  catalysts: string[];
  risks: string[];
  sourceSummary: { latestSecFiling?: string; latestPoliticianTrade?: string; dataFreshness: string };
};

export default function ConvictionPage() {
  const [picks, setPicks] = useState<ConvictionPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConvictionPick | null>(null);

  useEffect(() => {
    fetch('/api/conviction?limit=12')
      .then(r => r.json())
      .then(data => {
        const rows = data?.data?.picks ?? [];
        setPicks(rows);
        setSelected(rows[0] ?? null);
      })
      .catch(() => setPicks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#080a0f] text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.18em]">SEC · Congress · Fundamentals · News</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Highest Conviction Stock Picks</h1>
            <p className="text-sm text-gray-500 mt-1">Explainable multi-source ranking using SEC filings, politician trades, fundamentals, technicals, news catalysts, and institutional signals.</p>
          </div>
          <a href="/" className="text-[11px] uppercase tracking-[0.12em] text-gray-400 border border-sd-line rounded-lg px-3 py-2 hover:text-gray-100">← Dashboard</a>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-44 bg-sd-muted/30 rounded-xl" />)}
          </div>
        ) : picks.length === 0 ? (
          <div className="border border-sd-line/40 rounded-xl p-12 text-center text-gray-500">No conviction picks available.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              {picks.map(p => <PickCard key={p.ticker} pick={p} selected={selected?.ticker === p.ticker} onClick={() => setSelected(p)} />)}
            </section>
            <aside className="lg:sticky lg:top-6 h-fit">
              {selected && <DetailPanel pick={selected} />}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function PickCard({ pick, selected, onClick }: { pick: ConvictionPick; selected: boolean; onClick: () => void }) {
  const elite = pick.convictionScore >= 80;
  return (
    <button onClick={onClick} className={`text-left bg-[#0d0f14] border rounded-xl p-4 transition-all hover:bg-sd-muted/30 ${selected ? 'border-sd-accent' : 'border-sd-line/60 hover:border-sd-accent/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">#{pick.rank}</span>
            <span className="text-lg font-bold">{pick.ticker}</span>
            {pick.sector && <span className="text-[9px] text-gray-500 border border-sd-line rounded px-1.5 py-0.5 truncate">{pick.sector}</span>}
          </div>
          <div className="text-[10px] text-gray-500 truncate mt-0.5">{pick.companyName}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <SignalBadge label={pick.classification} sentiment={elite ? 'strong_bullish' : pick.convictionScore >= 70 ? 'bullish' : 'neutral'} />
            {pick.catalysts[0] && <SignalBadge label="SEC/Catalyst" sentiment="bullish" />}
            {pick.sourceSummary.latestPoliticianTrade && <SignalBadge label="🏛️ Congress" sentiment="bullish" />}
          </div>
        </div>
        <ScoreRing score={pick.convictionScore} size={58} label="CONV" />
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-4 pt-3 border-t border-sd-line/40">
        <Mini label="SEC" value={pick.signalBreakdown.sec} />
        <Mini label="Pol" value={pick.signalBreakdown.politician} />
        <Mini label="Fund" value={pick.signalBreakdown.fundamentals} />
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div><div className="text-[8px] text-gray-600 uppercase tracking-[0.12em]">{label}</div><div className="text-[11px] text-gray-300 font-mono">{Math.round(value)}</div></div>;
}

function DetailPanel({ pick }: { pick: ConvictionPick }) {
  return (
    <div className="bg-[#0d0f14] border border-sd-line rounded-xl p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold">{pick.ticker}</div>
          <div className="text-[11px] text-gray-500">{pick.timeHorizon}</div>
        </div>
        <ScoreRing score={pick.convictionScore} size={70} label="SCORE" />
      </div>

      <Breakdown scores={pick.signalBreakdown} />
      <List title="Bull Case" items={pick.bullCase} color="text-green-400" />
      <List title="Bear Case / Risks" items={[...pick.bearCase, ...pick.risks]} color="text-red-400" />
      <List title="Catalysts" items={pick.catalysts} color="text-yellow-400" />

      <div className="border-t border-sd-line/40 pt-4 space-y-2 text-[11px] text-gray-500">
        {pick.sourceSummary.latestSecFiling && <div>SEC: {pick.sourceSummary.latestSecFiling}</div>}
        {pick.sourceSummary.latestPoliticianTrade && <div>Politician: {pick.sourceSummary.latestPoliticianTrade}</div>}
        <div>Generated: {new Date(pick.sourceSummary.dataFreshness).toLocaleString()}</div>
      </div>
    </div>
  );
}

function Breakdown({ scores }: { scores: Record<string, number> }) {
  return <div className="space-y-2">{Object.entries(scores).map(([k, v]) => <div key={k}><div className="flex justify-between text-[9px] text-gray-500 uppercase tracking-[0.12em]"><span>{k}</span><span>{Math.round(v)}</span></div><div className="h-1.5 bg-sd-muted rounded-full"><div className="h-full bg-sd-accent rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></div></div>)}</div>;
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return <div><div className={`text-[10px] uppercase tracking-[0.14em] mb-2 ${color}`}>{title}</div><ul className="space-y-1.5">{items.slice(0, 5).map((item, i) => <li key={i} className="text-[11px] text-gray-400 leading-relaxed">• {item}</li>)}</ul></div>;
}
