'use client';

import { useState, useCallback, useEffect } from 'react';
import { RegimeClassifier } from './RegimeClassifier';
import { PositionPnLMonitor } from './PositionPnLMonitor';
import { RecoveryPlaybook } from './RecoveryPlaybook';
import { HedgeStatusPanel } from './HedgeStatusPanel';
import { DecisionTreeNavigator } from './DecisionTreeNavigator';
import { MoveLog } from './MoveLog';
import { PositionSizingCalc } from './PositionSizingCalc';
import type { DefenseRegime, LivePnL, RecoveryPlay, SpreadPosition } from '@/lib/models/defense-engine';
import type { DecisionNode } from '@/lib/models/defense-engine';

interface DefenseStatus {
  regime: DefenseRegime;
  position: SpreadPosition;
  pnl: LivePnL;
  plays: RecoveryPlay[];
  marketSnapshot: { spx: number; vix: number; dte: number; iv: number };
}

interface DefenseTabProps {
  spxPrice: number;
  vix: number;
  iv?: number;
  lastUpdated?: string;
}

export function DefenseTab({ spxPrice, vix, iv = 0.18, lastUpdated }: DefenseTabProps) {
  const [status, setStatus] = useState<DefenseStatus | null>(null);
  const [treeNode, setTreeNode] = useState<DecisionNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const dte = 3; // default DTE; can be made user-configurable

      const [statusRes, treeRes] = await Promise.all([
        fetch(`/api/defense/status?spx=${spxPrice}&vix=${vix}&iv=${iv}&dte=${dte}`).then(r => r.json()),
        fetch('/api/defense/tree').then(r => r.json()),
      ]);

      if (statusRes.success) setStatus(statusRes.data);
      if (treeRes.success)   setTreeNode(treeRes.data.node);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [spxPrice, vix, iv]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const snap = status?.marketSnapshot;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Row 1: Regime Classifier (full width) */}
      <RegimeClassifier
        regime={status?.regime ?? null}
        vix={snap?.vix ?? vix}
        dte={snap?.dte ?? 3}
        pnlPct={status?.pnl?.pnlPct ?? 0}
      />

      {/* Row 2: P&L Monitor + Recovery Playbook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <PositionPnLMonitor
            position={status?.position ?? null}
            pnl={status?.pnl ?? null}
            spx={snap?.spx ?? spxPrice}
            dte={snap?.dte ?? 3}
          />
        </div>
        <div className="lg:col-span-5">
          <RecoveryPlaybook plays={status?.plays ?? []} />
        </div>
      </div>

      {/* Row 3: Hedge Status + Decision Tree + Position Sizing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <HedgeStatusPanel />
        <DecisionTreeNavigator initialNode={treeNode} />
        <PositionSizingCalc />
      </div>

      {/* Row 4: Move Log (full width) */}
      <MoveLog
        spx={snap?.spx ?? spxPrice}
        vix={snap?.vix ?? vix}
        pnlAtEvent={status?.pnl?.pnlDollar}
      />

      {loading && !status && (
        <div className="text-center py-6 text-[11px] text-gray-500">
          <span className="inline-block w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
          Loading defense data…
        </div>
      )}

      <div className="pt-2 text-[10px] text-gray-600 font-mono text-right">
        {lastUpdated ?? ''} · Black-Scholes P&L · 60s poll
      </div>
    </div>
  );
}
