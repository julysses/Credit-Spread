'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Signal {
  name: string;
  exp: string;
  struct: string;
  pop: number;
  score: number;
  tag: 'ENTRY' | 'WATCH' | 'WAIT';
}

const MOCK_SIGNALS: Signal[] = [
  { name: 'QQQ IRON CONDOR',  exp: '28 DTE', struct: '495/505 · 535/545', pop: 71, score: 82, tag: 'ENTRY' },
  { name: 'IWM PUT CREDIT',   exp: '35 DTE', struct: '205/200',            pop: 68, score: 78, tag: 'ENTRY' },
  { name: 'SPY CALL DEBIT',   exp: '45 DTE', struct: '585/595',            pop: 54, score: 71, tag: 'WATCH' },
  { name: 'TSLA PUT SPREAD',  exp: '14 DTE', struct: '320/310',            pop: 58, score: 64, tag: 'WATCH' },
  { name: 'META IRON FLY',    exp: '30 DTE', struct: '590·610',            pop: 46, score: 52, tag: 'WAIT'  },
];

const ArrowIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

function tagVariant(tag: string): 'success' | 'info' | 'outline' {
  if (tag === 'ENTRY') return 'success';
  if (tag === 'WATCH') return 'info';
  return 'outline';
}

interface SignalStackPanelProps {
  signals?: Signal[];
}

export function SignalStackPanel({ signals = MOCK_SIGNALS }: SignalStackPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signal Stack</CardTitle>
        <span className="text-[10px] text-gray-500 font-mono">{signals.length} DEMO QUEUED</span>
      </CardHeader>
      <div className="divide-y divide-sd-line">
        {signals.map((s, i) => (
          <div
            key={i}
            className="px-5 py-3 flex items-center gap-3 hover:bg-sd-muted/40 cursor-pointer group"
          >
            <div className="font-mono text-[10px] text-gray-600 w-5 shrink-0">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div
              className={`w-1 h-8 rounded-full shrink-0 ${
                s.score >= 80 ? 'bg-green-400' :
                s.score >= 65 ? 'bg-yellow-400' : 'bg-gray-600'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-gray-100 tracking-tight">{s.name}</span>
                <Badge variant="outline" className="text-[9px]">{s.exp}</Badge>
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">
                {s.struct} · POP {s.pop}%
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="slab text-base tabular-nums text-gray-100">{s.score}</div>
              <Badge variant={tagVariant(s.tag)} className="text-[9px]">{s.tag}</Badge>
            </div>
            <span className="text-gray-600 group-hover:text-sd-accent transition-colors shrink-0">
              <ArrowIcon />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
