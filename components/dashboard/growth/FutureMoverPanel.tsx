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
  price?: string;
  priceChangePct?: string;
  rsi?: string;
  revenueGrowthPct?: string;
  above200sma?: boolean;
  aiThesis?: string | null;
  signals?: Record<string, unknown>;
}

interface FlowAlert {
  id: number;
  symbol: string;
  alertType: string;
  strike?: string;
  expiry?: string;
  premium?: string;
  volume?: string;
  volumeOiRatio?: string;
  sentiment?: string;
  detectedAt: string;
}

export function FutureMoverPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [flowAlerts, setFlowAlerts] = useState<FlowAlert[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Candidate | null>(null);
  const [dataSource, setDataSource] = useState<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([
      fetch('/api/growth/screener?type=future_mover&limit=5').then(r => r.json()),
      fetch('/api/growth/flow?days=7&limit=20').then(r => r.json()),
    ]).then(([screener, flow]) => {
      setCandidates(screener?.data?.candidates ?? []);
      setDataSource(screener?.data?.scan?.dataSource);
      setFlowAlerts(flow?.data?.alerts ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-6">
      {/* Prediction picks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em]">
            Prediction Watchlist — Squeeze · Congress · Unusual Flow
          </div>
          <div className="text-[10px] font-mono">
            {dataSource === 'live' && <span className="text-green-400 font-semibold">● LIVE</span>}
            {dataSource === 'mock' && <span className="text-yellow-500 font-semibold">○ MOCK</span>}
            {dataSource === 'db'   && <span className="text-blue-400 font-semibold">● CACHED</span>}
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm border border-sd-line/30 rounded-xl">
            <div className="text-2xl mb-2">🎯</div>
            No future mover signals today
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map(c => (
              <FutureCard key={c.symbol} candidate={c} onClick={() => setSelected(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Options flow alerts */}
      {flowAlerts.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-[0.14em] mb-3">
            Unusual Options Flow — Last 7 Days
          </div>
          <div className="space-y-2">
            {flowAlerts.slice(0, 10).map(alert => (
              <FlowAlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <StockDossierModal candidate={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function FutureCard({ candidate: c, onClick }: { candidate: Candidate; onClick: () => void }) {
  const signals = c.signals as Record<string, unknown> | undefined;
  const squeezePotential  = signals?.squeezePotential  as boolean | undefined;
  const congressSignal    = signals?.congressSignal    as boolean | undefined;
  const maSignal          = signals?.maSignal          as boolean | undefined;
  const analystUpgrade    = signals?.analystUpgrade    as boolean | undefined;
  const unusualCallSweep  = signals?.unusualCallSweep  as boolean | undefined;

  return (
    <button
      onClick={onClick}
      className="text-left bg-[#0d0f14] border border-sd-line hover:border-yellow-500/40 rounded-xl p-4 transition-all hover:bg-sd-muted/30"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-base font-bold text-gray-100">{c.symbol}</div>
          {c.companyName && <div className="text-[9px] text-gray-500 truncate max-w-[140px]">{c.companyName}</div>}
          <div className="font-mono text-sm text-gray-200 mt-1">${c.price}</div>
        </div>
        <ScoreRing score={c.compositeScore ?? 0} size={50} label="PRED" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {unusualCallSweep && <SignalBadge label="⚡ Call Sweep" sentiment="strong_bullish" />}
        {squeezePotential  && <SignalBadge label="🔄 Squeeze"   sentiment="bullish" />}
        {congressSignal    && <SignalBadge label="🏛️ Congress"  sentiment="bullish" />}
        {analystUpgrade    && <SignalBadge label="↑ Upgrade"    sentiment="bullish" />}
        {maSignal          && <SignalBadge label="🎯 M&A"       sentiment="neutral" />}
        {!unusualCallSweep && !squeezePotential && !congressSignal && !analystUpgrade && !maSignal && (
          <SignalBadge label="Watchlist" sentiment="neutral" />
        )}
      </div>
    </button>
  );
}

function FlowAlertRow({ alert }: { alert: FlowAlert }) {
  const isBullish = alert.sentiment === 'bullish' || alert.alertType?.includes('call');
  const premium = alert.premium ? `$${parseInt(alert.premium).toLocaleString()}` : '--';
  const vol = alert.volume ? parseInt(alert.volume).toLocaleString() : '--';

  return (
    <div className="flex items-center gap-3 bg-sd-muted/20 border border-sd-line/40 rounded-lg px-3 py-2.5">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBullish ? 'bg-green-400' : 'bg-red-400'}`} />

      <div className="flex-1 flex items-center gap-3 min-w-0">
        <span className="text-sm font-bold text-gray-100 shrink-0">{alert.symbol}</span>

        <span className={`text-[10px] uppercase tracking-[0.1em] shrink-0 ${isBullish ? 'text-green-400' : 'text-red-400'}`}>
          {alert.alertType?.replace('_', ' ')}
        </span>

        {alert.strike && (
          <span className="text-[10px] text-gray-500 font-mono shrink-0">@{alert.strike}</span>
        )}

        {alert.expiry && (
          <span className="text-[10px] text-gray-600 shrink-0">{alert.expiry}</span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className="text-[9px] text-gray-600">Premium</div>
          <div className="text-[10px] font-mono text-gray-300">{premium}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-600">Vol</div>
          <div className="text-[10px] font-mono text-gray-300">{vol}</div>
        </div>
        {alert.volumeOiRatio && (
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-gray-600">Vol/OI</div>
            <div className={`text-[10px] font-mono ${parseFloat(alert.volumeOiRatio) >= 2 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {parseFloat(alert.volumeOiRatio).toFixed(1)}×
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="bg-sd-muted/30 rounded-xl p-4 h-28" />)}
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="bg-sd-muted/30 rounded-lg h-10" />)}
      </div>
    </div>
  );
}
