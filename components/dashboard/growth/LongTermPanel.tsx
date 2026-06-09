'use client';

import { useState, useEffect } from 'react';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { StockDossierModal } from './StockDossierModal';
import { ageLabel, money, num, pct, politicianLabel, politicianTone, priceStatusLabel, type EnrichedGrowthCandidate as Candidate } from './card-utils';

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
        <StockDossierModal candidate={selected as any} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function LongTermCard({ candidate: c, onClick }: { candidate: Candidate; onClick: () => void }) {
  const currentPrice = c.currentPrice ?? c.price;
  const priceChange = num(c.currentPriceChangePct ?? c.priceChangePct);
  const revGrowth   = num(c.revenueGrowthPct);
  const epsGrowth   = num(c.epsGrowthPct);
  const peg         = num(c.pegRatio);
  const entryReturn = c.entryReturnPct;
  const pio = c.piotroskiScore != null ? num(c.piotroskiScore) : null;
  const altman = c.altmanZScore != null ? num(c.altmanZScore) : null;

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

          <div className="mt-3 rounded-lg border border-sd-line/50 bg-sd-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-[0.14em]">Current</div>
                <div className="font-mono text-base font-semibold text-gray-100">{money(currentPrice)}</div>
                <div className={`font-mono text-[10px] ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-[0.14em]">Entry / Signal</div>
                <div className="font-mono text-base font-semibold text-gray-100">{money(c.entryPrice ?? c.scanPrice)}</div>
                <div className={`font-mono text-[10px] ${num(entryReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {pct(entryReturn)} from entry
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-gray-500 font-mono">
              <span>{priceStatusLabel(c)}</span>
              <span>•</span>
              <span>{ageLabel(c)}</span>
              {c.marketCap && <><span>•</span><span>${c.marketCap.toFixed(0)}B mkt cap</span></>}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <SignalBadge label={pio != null ? `Piotroski ${pio}/9` : 'Piotroski —'} sentiment={pio != null && pio >= 7 ? 'bullish' : pio != null && pio < 5 ? 'bearish' : 'neutral'} />
            <SignalBadge label={altman != null ? `Altman Z ${altman.toFixed(1)}` : 'Altman Z —'} sentiment={altman != null && altman > 3 ? 'bullish' : altman != null && altman < 1.8 ? 'bearish' : 'neutral'} />
            <SignalBadge label={politicianLabel(c)} sentiment={politicianTone(c.politicianNetFlow)} />
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
