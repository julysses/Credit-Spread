'use client';

import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { DecisionNode } from '@/lib/models/defense-engine';

interface DecisionTreeNavigatorProps {
  initialNode: DecisionNode | null;
}

export function DecisionTreeNavigator({ initialNode }: DecisionTreeNavigatorProps) {
  const [node, setNode] = useState<DecisionNode | null>(initialNode);
  const [history, setHistory] = useState<{ node: DecisionNode; answer: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const navigate = useCallback(async (nextNode: string, answerLabel: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/defense/tree', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextNode, answerLabel }),
      });
      const data = await res.json();
      if (data.success && node) {
        setHistory(h => [...h, { node, answer: answerLabel }]);
        setNode(data.data.node);
      }
    } finally {
      setLoading(false);
    }
  }, [node]);

  const reset = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/defense/tree', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextNode: null }),
      });
      const data = await res.json();
      if (data.success) {
        setHistory([]);
        setNode(data.data.node);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  if (!node) {
    return (
      <Card className="animate-pulse">
        <CardHeader><CardTitle>Decision Tree</CardTitle></CardHeader>
        <CardContent><div className="h-40 bg-sd-muted rounded" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Tree Navigator</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-gray-500 border border-sd-line rounded px-1.5 py-0.5 uppercase">
            {history.length} steps
          </span>
          <button
            onClick={reset}
            disabled={loading}
            className="text-[9px] text-sd-accent hover:opacity-80 border border-sd-line rounded px-2 py-0.5 transition-opacity disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Breadcrumb */}
        {history.length > 0 && (
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-gray-600">
                <span className="text-gray-700 mt-0.5">→</span>
                <span className="text-gray-500 truncate">{h.answer}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current question */}
        <div className={`rounded-lg border p-4 ${node.isTerminal ? 'border-sd-accent/40 bg-sd-accent-soft/10' : 'border-sd-line bg-sd-muted/30'}`}>
          <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1.5">
            {node.isTerminal ? 'Recommendation' : 'Question'}
          </div>
          <div className="text-[13px] font-semibold text-gray-100 mb-1">{node.question}</div>
          <div className="text-[11px] text-gray-500">{node.context}</div>

          {node.recommendation && (
            <div className="mt-3 p-3 rounded bg-sd-accent-soft/20 border border-sd-accent/30 text-[11px] text-gray-200">
              {node.recommendation}
            </div>
          )}
        </div>

        {/* Options */}
        {!node.isTerminal && (
          <div className="space-y-2">
            {node.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => navigate(opt.nextNode, opt.label)}
                disabled={loading}
                className="w-full text-left rounded border border-sd-line/50 bg-sd-muted/20 hover:bg-sd-muted/60 hover:border-sd-line transition-colors px-3 py-2 text-[11px] text-gray-300 hover:text-gray-100 disabled:opacity-40"
              >
                <span className="text-sd-accent mr-2">{i + 1}.</span>
                {opt.label}
                {opt.action && (
                  <span className="block text-[10px] text-gray-500 mt-0.5 ml-4">→ {opt.action}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {node.isTerminal && (
          <button
            onClick={reset}
            disabled={loading}
            className="w-full py-2 border border-sd-line rounded text-[11px] text-gray-400 hover:text-gray-200 hover:border-sd-line/80 transition-colors disabled:opacity-40"
          >
            Start Over
          </button>
        )}
      </CardContent>
    </Card>
  );
}
