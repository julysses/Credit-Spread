'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RecoveryPlay } from '@/lib/models/defense-engine';

interface RecoveryPlaybookProps {
  plays: RecoveryPlay[];
}

const PLAY_ICONS: Record<string, string> = {
  hold:      '◈',
  'roll-out': '↷',
  'roll-away': '↗',
  close:     '✕',
};

export function RecoveryPlaybook({ plays }: RecoveryPlaybookProps) {
  if (!plays.length) {
    return (
      <Card className="animate-pulse">
        <CardHeader><CardTitle>Recovery Playbook</CardTitle></CardHeader>
        <CardContent><div className="h-48 bg-sd-muted rounded" /></CardContent>
      </Card>
    );
  }

  const activePlay = plays.find(p => p.active);

  return (
    <Card>
      <CardHeader>
        <CardTitle>4-Play Recovery Playbook</CardTitle>
        {activePlay && (
          <Badge variant="info" className="tracking-[0.14em] text-[9px]">
            ACTIVE: {activePlay.name.toUpperCase()}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {plays.map((play) => (
          <div
            key={play.id}
            className={`rounded-lg border p-3 transition-colors ${
              play.active
                ? 'border-sd-accent/50 bg-sd-accent-soft/20'
                : 'border-sd-line/40 bg-sd-muted/30 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-gray-400 font-mono">{PLAY_ICONS[play.id] ?? '·'}</span>
                <span className={`text-[12px] font-semibold tracking-tight ${play.active ? 'text-gray-100' : 'text-gray-400'}`}>
                  {play.name}
                </span>
                {play.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sd-accent live-dot" />
                )}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 mb-1">
              <span className="text-gray-600 uppercase tracking-[0.1em]">Trigger: </span>{play.trigger}
            </div>
            <div className="text-[11px] text-gray-300 mb-2">{play.action}</div>
            <div className="flex gap-3 text-[10px]">
              <span className="text-red-400/80"><span className="text-gray-600">Risk: </span>{play.risk}</span>
            </div>
            <div className="flex gap-3 text-[10px] mt-0.5">
              <span className="text-green-400/80"><span className="text-gray-600">Reward: </span>{play.reward}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
