'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { useLiveTick } from '@/lib/hooks/use-live-tick';
import { LiveNumber } from '@/components/ui/live-number';

export type DashTab =
  | 'options'
  | '0dte'
  | 'stocks'
  | 'analytics'
  | 'journal'
  | 'simulator'
  | 'signal-stack'
  | 'defense';

interface MarketHeaderProps {
  spxPrice: number;
  spxChangePct: number;
  vix: number;
  vixChangePct: number;
  vixRegime: string;
  riskLevel: string;
  isMarketOpen: boolean;
  lastUpdated: string;
  activeTab: DashTab;
  onTabChange: (tab: DashTab) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

function vixColorClass(v: number) {
  if (v > 35) return 'text-red-500';
  if (v > 25) return 'text-red-400';
  if (v > 18) return 'text-orange-400';
  if (v > 12) return 'text-yellow-400';
  return 'text-green-400';
}
function vixLabelText(v: number) {
  if (v > 35) return 'EXTREME';
  if (v > 25) return 'ELEVATED';
  if (v > 18) return 'NORMAL-HI';
  return 'NORMAL';
}

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    <path d="M3 21v-5h5"/>
  </svg>
);

const TABS: { id: DashTab; label: string }[] = [
  { id: 'options',      label: 'OPTIONS'      },
  { id: '0dte',         label: '0DTE'         },
  { id: 'stocks',       label: 'STOCKS'       },
  { id: 'analytics',    label: 'ANALYTICS'    },
  { id: 'journal',      label: 'JOURNAL'      },
  { id: 'simulator',    label: 'SIMULATOR'    },
  { id: 'signal-stack', label: 'SIGNAL STACK' },
  { id: 'defense',      label: 'DEFENSE'      },
];

export function MarketHeader({
  spxPrice,
  spxChangePct,
  vix,
  riskLevel,
  isMarketOpen,
  lastUpdated,
  activeTab,
  onTabChange,
  onRefresh,
  isLoading,
}: MarketHeaderProps) {
  const [spxLive, spxDir] = useLiveTick(spxPrice || 5823, 0.00025, 1500);
  const [spyLive, spyDir] = useLiveTick((spxPrice || 5823) * 0.0998, 0.00025, 1700);
  const [vixLive, vixDir] = useLiveTick(vix || 17.4, 0.002, 1900);

  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dailyEM = spxLive * (vixLive / 100) / Math.sqrt(252);
  const spxPct = spxChangePct + (spxLive - spxPrice) / (spxPrice || 1) * 100;

  const regimeLabel =
    riskLevel === 'extreme' || riskLevel === 'high' ? 'RISK-OFF' :
    riskLevel === 'low' ? 'RISK-ON' : 'RANGE';
  const regimeVariant: 'success' | 'danger' | 'info' =
    regimeLabel === 'RISK-ON' ? 'success' :
    regimeLabel === 'RISK-OFF' ? 'danger' : 'info';

  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md border-b border-sd-line">
      {/* ── Row 1: market data ── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 flex items-center gap-4 sm:gap-6 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md border border-sd-accent-soft bg-sd-accent-soft flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-sd-accent" />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.22em]">Signal Desk</div>
            <div className="text-[13px] text-gray-100 font-semibold tracking-tight mt-0.5">SPX · SPY</div>
          </div>
        </div>

        <div className="hidden sm:block h-8 w-px bg-sd-line shrink-0" />

        {/* Tickers */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          {/* SPX */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.18em]">SPX</div>
            <div className="flex items-baseline gap-1.5">
              <LiveNumber
                value={spxLive}
                dir={spxDir}
                format={v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                className="text-[16px] sm:text-[17px] text-gray-100"
              />
              <span className={`font-mono text-[10px] ${spxPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {spxPct >= 0 ? '▲' : '▼'} {Math.abs(spxPct).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* SPY */}
          <div className="hidden md:flex flex-col gap-0.5 shrink-0">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.18em]">SPY</div>
            <LiveNumber
              value={spyLive}
              dir={spyDir}
              format={v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              className="text-[17px] text-gray-100"
            />
          </div>

          {/* VIX */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.18em]">VIX</div>
            <div className="flex items-baseline gap-1.5">
              <LiveNumber
                value={vixLive}
                dir={vixDir}
                format={v => v.toFixed(2)}
                className={`text-[16px] sm:text-[17px] ${vixColorClass(vixLive)}`}
              />
              <span className={`hidden sm:inline font-mono text-[9px] uppercase tracking-[0.12em] opacity-85 ${vixColorClass(vixLive)}`}>
                {vixLabelText(vixLive)}
              </span>
            </div>
          </div>

          {/* ±1σ */}
          <div className="hidden lg:flex flex-col gap-0.5 shrink-0">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.18em]">±1σ DAILY</div>
            <div className="slab text-[15px] text-gray-200 tabular-nums">±{dailyEM.toFixed(1)}</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Right: regime + live + clock */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Badge variant={regimeVariant} className="hidden sm:inline-flex tracking-[0.16em]">
            REGIME · {regimeLabel}
          </Badge>
          <Badge variant={isMarketOpen ? 'success' : 'outline'} className="tracking-[0.16em]">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isMarketOpen ? 'bg-green-400 live-dot' : 'bg-gray-500'}`} />
            {isMarketOpen ? 'LIVE' : 'CLOSED'}
          </Badge>
          <div className="hidden lg:block font-mono text-[11px] text-gray-400 tabular-nums">{clock} ET</div>
        </div>
      </div>

      {/* ── Row 2: tabs ── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 flex items-center border-t border-sd-line/50">
        <nav className="flex items-end overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`relative px-3 sm:px-4 py-2.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors whitespace-nowrap ${
                  active ? 'text-gray-100' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-sd-accent" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 py-2 shrink-0">
          <Badge variant="outline" className="hidden sm:inline-flex text-[9px]">OPRA · CBOE</Badge>
          {lastUpdated && (
            <span className="hidden lg:block font-mono text-[10px] text-gray-600 tabular-nums">
              {lastUpdated}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center rounded border border-sd-line hover:bg-sd-muted text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            {isLoading
              ? <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
              : <RefreshIcon className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>
    </header>
  );
}
