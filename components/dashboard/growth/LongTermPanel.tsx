'use client';

import { useState, useEffect } from 'react';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { StockDossierModal } from './StockDossierModal';

interface Candidate {
  id: number;
  symbol: string;
  companyName?: string;
  sector?: string;
  compositeScore?: number;
  momentumScore?: number;
  growthScore?: number;
  valueScore?: number;
  institutionalScore?: number;
  optionsFlowScore?: number;
  price?: string;
  priceChangePct?: string;
  rsi?: string;
  revenueGrowthPct?: string;
  epsGrowthPct?: string;
  pegRatio?: string;
  above200sma?: boolean;
  aiThesis?: string | null;
  signals?: Record<string, unknown>;
  marketCap?: number;
}

export function LongTermPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Candidate | null>(null);
  const [scanInfo, setScanInfo]     = useState<{ scanDate?: string } | null>(null);

  useEffect(() => {
    fetch('/api/growth/screener?type=long_term&limit=10')
      .then(r => r.json())
      .then(data => {
        setCandidates(data?.data?.candidates ?? []);
        setScanInfo(data?.data?.scan ?? null);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      {scanInfo?.scanDate && (
        <div className="text-[10px] font-mono text-gray-500">Scan: {scanInfo.scanDate}</div>
      )}

      <div className="text-[10px] text-gray-500 bg-sd-muted/30 border border-sd-line/40 rounded-lg px-3 py-2">
        <span className="text-yellow-400 font-semibold">Filter:</span> Piotroski ≥ 5 · Altman Z &gt; 2 · Score ≥ 55 · Composite long-term signal
      </div>

      {candidates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {candidates.map(c => (
            <LongTermCard key={c.symbol} candidate={c} onClick={() => setSelected(c)} />
          ))}
        </div>
      )}

      {selected && (
        <StockDossierModal candidate={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function LongTermCard({ candidate: c, onClick }: { candidate: Candidate; onClick: () => void }) {
  const priceChange = parseFloat(c.priceChangePct ?? '0');
  const revGrowth   = parseFloat(c.revenueGrowthPct ?? '0');
  const epsGrowth   = parseFloat(c.epsGrowthPct ?? '0');
  const peg         = parseFloat(c.pegRatio ?? '0');

  return (
    <button
      onClick={onClick}
      className="text-left bg-[#0d0f14] border border-sd-line hover:border-sd-accent/50 rounded-xl p-4 transition-all hover:bg-sd-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-gray-100">{c.symbol}</span>
            {c.sector && (
              <span className="text-[9px] text-gray-500 border border-sd-line rounded px-1.5 py-0.5">
                {c.sector}
              </span>
            )}
          </div>
          {c.companyName && (
            <div className="text-[10px] text-gray-500 truncate mb-2">{c.companyName}</div>
          )}

          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-gray-200">${c.price}</span>
            <span className={`font-mono text-[10px] ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </span>
            {c.marketCap && (
              <span className="text-[9px] text-gray-600">${c.marketCap?.toFixed(0)}B</span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {revGrowth >= 15  && <SignalBadge label={`Rev +${revGrowth.toFixed(0)}%`} sentiment="bullish" />}
            {epsGrowth >= 20  && <SignalBadge label={`EPS +${epsGrowth.toFixed(0)}%`} sentiment="bullish" />}
            {peg > 0 && peg <= 2 && <SignalBadge label={`PEG ${peg.toFixed(1)}`} sentiment="bullish" />}
            {c.above200sma    && <SignalBadge label="↑ 200 SMA" sentiment="neutral" />}
            {(c.institutionalScore ?? 0) >= 15 && <SignalBadge label="🏦 Inst. Backed" sentiment="bullish" />}
          </div>
        </div>

        <ScoreRing score={c.compositeScore ?? 0} size={56} label="QUAL" />
      </div>

      {/* Dimension bars */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-sd-line/40">
        <DimBar label="Fundamentals"  score={c.growthScore ?? 0}       max={35} />
        <DimBar label="Institutional" score={c.institutionalScore ?? 0} max={25} />
        <DimBar label="Technical"     score={c.momentumScore ?? 0}      max={25} />
        <DimBar label="Valuation"     score={c.valueScore ?? 0}         max={15} />
      </div>

      {c.aiThesis && (
        <p className="text-[10px] text-gray-500 mt-2 line-clamp-2 italic">{c.aiThesis}</p>
      )}
    </button>
  );
}

function DimBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[8px] text-gray-600 mb-0.5">
        <span className="uppercase tracking-[0.1em]">{label}</span>
        <span className="font-mono">{score}/{max}</span>
      </div>
      <div className="h-1 bg-sd-muted rounded-full">
        <div
          className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-gray-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
      {[...Array(6)].map((_, i) => <div key={i} className="bg-sd-muted/30 rounded-xl p-4 h-40" />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-600 text-sm border border-sd-line/30 rounded-xl">
      <div className="text-2xl mb-3">🏦</div>
      <div>No qualifying long-term candidates today — Piotroski or Altman gates may be filtering</div>
    </div>
  );
}
