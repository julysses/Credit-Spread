'use client';

import { useState, useEffect } from 'react';
import { ScoreRing } from './ScoreRing';
import { SignalBadge, sentimentFromScore } from './SignalBadge';
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
  convictionScore?: number;
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

export function MomentumPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [scanInfo, setScanInfo]     = useState<{ scanDate?: string; marketRegime?: string } | null>(null);
  const [selected, setSelected]     = useState<Candidate | null>(null);

  useEffect(() => {
    fetch('/api/growth/screener?type=short_term&limit=10')
      .then(r => r.json())
      .then(data => {
        setCandidates(data?.data?.candidates ?? []);
        setScanInfo(data?.data?.scan ?? null);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      {scanInfo && (
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>Scan: {scanInfo.scanDate}</span>
          {scanInfo.marketRegime && (
            <span className={`uppercase tracking-wider ${scanInfo.marketRegime === 'bull' ? 'text-green-400' : scanInfo.marketRegime === 'bear' ? 'text-red-400' : 'text-gray-400'}`}>
              {scanInfo.marketRegime} regime
            </span>
          )}
        </div>
      )}

      {candidates.length === 0 ? (
        <EmptyState message="No momentum candidates today — market regime may be suppressing signals" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {candidates.map(c => (
            <CandidateCard key={c.symbol} candidate={c} onClick={() => setSelected(c)} />
          ))}
        </div>
      )}

      {selected && (
        <StockDossierModal candidate={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CandidateCard({ candidate: c, onClick }: { candidate: Candidate; onClick: () => void }) {
  const priceChange = parseFloat(c.priceChangePct ?? '0');
  const rsi = parseFloat(c.rsi ?? '50');
  const sentiment = sentimentFromScore(c.momentumScore ?? 0);

  return (
    <button
      onClick={onClick}
      className="text-left bg-[#0d0f14] border border-sd-line hover:border-sd-accent/50 rounded-xl p-4 transition-all hover:bg-sd-muted/30 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-gray-100">{c.symbol}</span>
            {c.sector && (
              <span className="text-[9px] text-gray-500 border border-sd-line rounded px-1.5 py-0.5 truncate">
                {c.sector}
              </span>
            )}
          </div>
          {c.companyName && (
            <div className="text-[10px] text-gray-500 truncate">{c.companyName}</div>
          )}

          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-mono text-sm font-semibold text-gray-200">${c.price}</span>
            <span className={`font-mono text-[10px] ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            <SignalBadge label={`RSI ${rsi.toFixed(0)}`} sentiment={rsi >= 50 && rsi <= 70 ? 'bullish' : 'neutral'} />
            {c.above200sma && <SignalBadge label="↑ 200 SMA" sentiment="bullish" />}
            {parseFloat(c.revenueGrowthPct ?? '0') >= 20 && (
              <SignalBadge label={`Rev +${c.revenueGrowthPct}%`} sentiment="bullish" />
            )}
            {(c.optionsFlowScore ?? 0) >= 8 && <SignalBadge label="⚡ Flow" sentiment="bullish" />}
          </div>
        </div>

        <div className="shrink-0">
          <ScoreRing score={c.momentumScore ?? 0} size={56} label="MOM" />
        </div>
      </div>

      {/* Sub-scores bar */}
      <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-sd-line/40">
        <MiniScore label="Tech" value={Math.round((c.momentumScore ?? 0) * 0.4)} max={40} />
        <MiniScore label="Struct" value={Math.round((c.momentumScore ?? 0) * 0.2)} max={20} />
        <MiniScore label="Catalyst" value={Math.round((c.momentumScore ?? 0) * 0.25)} max={25} />
        <MiniScore label="Flow" value={c.optionsFlowScore ?? 0} max={15} />
      </div>

      {c.aiThesis && (
        <p className="text-[10px] text-gray-500 mt-2 line-clamp-2 italic">{c.aiThesis}</p>
      )}
    </button>
  );
}

function MiniScore({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div>
      <div className="text-[8px] text-gray-600 uppercase tracking-[0.12em] mb-1">{label}</div>
      <div className="h-1.5 bg-sd-muted rounded-full">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-gray-400 font-mono mt-0.5">{value}/{max}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-sd-muted/30 rounded-xl p-4 h-36" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-gray-600 text-sm border border-sd-line/30 rounded-xl">
      <div className="text-2xl mb-3">📊</div>
      <div>{message}</div>
    </div>
  );
}
