'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HedgeEntry {
  id: number;
  type: string;
  strike: number;
  expiry: string;
  premium: number;
  status: 'active' | 'expired' | 'closed';
}

export function HedgeStatusPanel() {
  const [hedges, setHedges] = useState<HedgeEntry[]>([]);
  const [hedged, setHedged] = useState(false);
  const [form, setForm] = useState({ type: 'put', strike: '', expiry: '', premium: '' });
  const [adding, setAdding] = useState(false);

  const addHedge = () => {
    if (!form.strike || !form.expiry || !form.premium) return;
    setHedges(h => [
      ...h,
      {
        id: Date.now(),
        type: form.type,
        strike: parseFloat(form.strike),
        expiry: form.expiry,
        premium: parseFloat(form.premium),
        status: 'active',
      },
    ]);
    setHedged(true);
    setAdding(false);
    setForm({ type: 'put', strike: '', expiry: '', premium: '' });
  };

  const removeHedge = (id: number) => {
    setHedges(h => h.filter(e => e.id !== id));
    setHedged(hedges.length > 1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hedge Status</CardTitle>
        <Badge variant={hedged ? 'success' : 'outline'} className="tracking-[0.14em] text-[9px]">
          {hedged ? 'HEDGED' : 'UNHEDGED'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {hedges.length === 0 && (
          <div className="text-center py-4 text-[11px] text-gray-500">
            No hedge positions recorded
          </div>
        )}

        {hedges.map(h => (
          <div key={h.id} className="flex items-center justify-between rounded border border-sd-line/40 bg-sd-muted/30 px-3 py-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.12em]">{h.type.toUpperCase()}</span>
              <span className="text-gray-200 font-mono">{h.strike}</span>
              <span className="text-gray-500">{h.expiry}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-orange-400 font-mono">${h.premium.toFixed(2)}</span>
              <button
                onClick={() => removeHedge(h.id)}
                className="text-gray-600 hover:text-red-400 text-[10px] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {adding ? (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1 text-[11px] text-gray-100"
                >
                  <option value="put">Put</option>
                  <option value="call">Call</option>
                  <option value="put-spread">Put Spread</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Strike</label>
                <input
                  type="number"
                  value={form.strike}
                  onChange={e => setForm(f => ({ ...f, strike: e.target.value }))}
                  placeholder="5600"
                  className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-sd-accent"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Expiry</label>
                <input
                  type="text"
                  value={form.expiry}
                  onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))}
                  placeholder="2025-05-02"
                  className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-sd-accent"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Premium</label>
                <input
                  type="number"
                  value={form.premium}
                  onChange={e => setForm(f => ({ ...f, premium: e.target.value }))}
                  placeholder="1.50"
                  step="0.01"
                  className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-sd-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={addHedge}
                className="flex-1 py-1.5 bg-sd-accent text-white text-[11px] font-semibold rounded transition-opacity hover:opacity-90"
              >
                Add Hedge
              </button>
              <button
                onClick={() => setAdding(false)}
                className="px-3 py-1.5 border border-sd-line text-[11px] text-gray-400 rounded hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-2 border border-dashed border-sd-line/60 rounded text-[11px] text-gray-500 hover:text-gray-300 hover:border-sd-line transition-colors"
          >
            + Add Hedge Position
          </button>
        )}
      </CardContent>
    </Card>
  );
}
