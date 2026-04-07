'use client';

import { useState, useEffect, useCallback } from 'react';
import { DirectionalBiasBar } from './DirectionalBiasBar';
import { StrategyCompare } from './StrategyCompare';
import { IntradayPanel } from './IntradayPanel';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface StrategiesHubProps {
  spxPrice?: number;
  vix?: number;
}

export function StrategiesHub({ spxPrice, vix }: StrategiesHubProps) {
  const [strategiesData, setStrategiesData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/strategies').then(r => r.json());
      if (res?.success) setStrategiesData(res.data);
    } catch {
      // Silently ignore — IntradayPanel and DirectionalBiasBar self-fetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return (
    <div className="space-y-6">
      {/* ── Directional Intelligence ─────────────────────────────────────── */}
      <DirectionalBiasBar />

      {/* ── 0DTE Section ─────────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon="⚡"
          title="0DTE Intraday Strategies"
          subtitle="Today's setups — sorted by viability and expected value"
          tag="0DTE · Expires Today"
          tagColor="yellow"
        />
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IntradayPanel spxPrice={spxPrice} vix={vix} />
          <ZeroDTERules />
        </div>
      </div>

      {/* ── Swing Strategies Section ──────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon="📊"
          title="Swing Strategies"
          subtitle="Multi-day setups (7–30 DTE) — sorted by availability and profitability"
          tag="7–30 DTE"
          tagColor="blue"
        />
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading swing strategies...
            </div>
          ) : strategiesData ? (
            <StrategyCompare
              strategies={strategiesData.strategies ?? []}
              marketContext={strategiesData.marketContext}
              recommended={strategiesData.recommended}
            />
          ) : (
            <div className="text-center py-12 text-gray-500 text-sm">
              Strategy data unavailable — please refresh
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────

interface SectionHeaderProps {
  icon: string;
  title: string;
  subtitle: string;
  tag: string;
  tagColor: 'yellow' | 'blue' | 'green';
}

const TAG_COLORS: Record<SectionHeaderProps['tagColor'], string> = {
  yellow: 'bg-yellow-500/10 border-yellow-600/30 text-yellow-400',
  blue: 'bg-blue-500/10 border-blue-600/30 text-blue-400',
  green: 'bg-emerald-500/10 border-emerald-600/30 text-emerald-400',
};

function SectionHeader({ icon, title, subtitle, tag, tagColor }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${TAG_COLORS[tagColor]}`}>
            {tag}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex-1 h-px bg-gray-800/60 ml-2 hidden sm:block" />
    </div>
  );
}

// ─────────────────────────────────────────────
// 0DTE Rules card (moved from page.tsx)
// ─────────────────────────────────────────────

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

function ZeroDTERules() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>0DTE Rules of Engagement</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { num: 1, rule: 'Wait for opening range (first 30 min) before entering', color: 'text-blue-400' },
              { num: 2, rule: 'Sell strikes OUTSIDE the intraday expected move', color: 'text-green-400' },
              { num: 3, rule: 'High IV → wider spreads (25 pts). Low IV → tighter (10 pts)', color: 'text-yellow-400' },
              { num: 4, rule: 'Take profit at 25–50% of credit received', color: 'text-green-400' },
              { num: 5, rule: 'Stop loss at 1.5× credit — no exceptions', color: 'text-red-400' },
              { num: 6, rule: 'Close ALL positions before 3:45 PM ET', color: 'text-orange-400' },
              { num: 7, rule: 'Gamma emergency: exit if price approaches short strike', color: 'text-red-400' },
              { num: 8, rule: 'Max 3 trades per day — quality over quantity', color: 'text-gray-400' },
              { num: 9, rule: 'Do NOT trade 0DTE on FOMC, CPI, or NFP release days', color: 'text-red-400' },
            ].map(item => (
              <div key={item.num} className="flex items-start gap-2.5 text-xs">
                <span className={`${item.color} font-bold w-4 shrink-0`}>{item.num}.</span>
                <span className="text-gray-400">{item.rule}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Intraday POP Formula</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs text-gray-400">
            <div className="font-mono bg-gray-800/60 rounded p-3 space-y-1">
              <div>EM_intraday = S × σ × √(t / 390)</div>
              <div className="text-gray-600">where t = minutes remaining, σ = VIX/100</div>
            </div>
            <div className="font-mono bg-gray-800/60 rounded p-3 space-y-1">
              <div>POP_final =</div>
              <div className="pl-4">POP_mc × 0.4 +</div>
              <div className="pl-4">POP_em × 0.3 +</div>
              <div className="pl-4">POP_delta × 0.2 +</div>
              <div className="pl-4">Gamma_Adj × 0.1</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
