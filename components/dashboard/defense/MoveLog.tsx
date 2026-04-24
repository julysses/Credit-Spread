'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DefenseEvent {
  id: number;
  createdAt: string;
  eventType: string;
  description: string;
  spxAtEvent?: number;
  vixAtEvent?: number;
  pnlAtEvent?: number;
  notes?: string;
}

interface MoveLogProps {
  spx: number;
  vix: number;
  pnlAtEvent?: number;
}

const EVENT_TYPES = ['roll', 'close', 'hedge', 'adjust', 'note'];

const TYPE_VARIANT: Record<string, 'success' | 'danger' | 'info' | 'outline'> = {
  roll:   'info',
  close:  'danger',
  hedge:  'outline',
  adjust: 'outline',
  note:   'outline',
};

export function MoveLog({ spx, vix, pnlAtEvent }: MoveLogProps) {
  const [events, setEvents] = useState<DefenseEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ eventType: 'note', description: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/defense/events');
    const data = await res.json();
    if (data.success) setEvents(data.data.events);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const saveEvent = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/defense/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType:   form.eventType,
          description: form.description,
          spxAtEvent:  spx,
          vixAtEvent:  vix,
          pnlAtEvent:  pnlAtEvent,
          notes:       form.notes || undefined,
        }),
      });
      setForm({ eventType: 'note', description: '', notes: '' });
      setAdding(false);
      await fetchEvents();
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) + ' ET';
    } catch { return iso; }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical Move Log</CardTitle>
        <button
          onClick={() => setAdding(a => !a)}
          className="text-[10px] text-sd-accent hover:opacity-80 border border-sd-line rounded px-2 py-1 transition-opacity"
        >
          {adding ? 'Cancel' : '+ Log Move'}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border border-sd-line/60 bg-sd-muted/30 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Type</label>
                <select
                  value={form.eventType}
                  onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}
                  className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1 text-[11px] text-gray-100"
                >
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <div className="text-[10px] text-gray-500 font-mono">
                  SPX {spx.toFixed(0)} · VIX {vix.toFixed(2)}
                </div>
              </div>
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Rolled 5650/5640 put spread to 5620/5610 +0.35 credit"
                className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-[11px] text-gray-100 focus:outline-none focus:border-sd-accent"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase tracking-[0.12em] block mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Reasoning, observations..."
                className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-[11px] text-gray-100 focus:outline-none focus:border-sd-accent"
              />
            </div>
            <button
              onClick={saveEvent}
              disabled={saving || !form.description.trim()}
              className="w-full py-2 bg-sd-accent text-white text-[11px] font-semibold rounded transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Log Move'}
            </button>
          </div>
        )}

        {events.length === 0 && !adding && (
          <div className="text-center py-6 text-[11px] text-gray-500">
            No moves logged yet — click &quot;+ Log Move&quot; to record a defensive action
          </div>
        )}

        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="rounded border border-sd-line/40 bg-sd-muted/20 px-3 py-2">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={TYPE_VARIANT[ev.eventType] ?? 'outline'} className="text-[9px] tracking-[0.1em]">
                    {ev.eventType.toUpperCase()}
                  </Badge>
                  <span className="text-[11px] text-gray-200">{ev.description}</span>
                </div>
                <span className="text-[10px] text-gray-600 font-mono shrink-0">{fmt(ev.createdAt)}</span>
              </div>
              {(ev.spxAtEvent || ev.vixAtEvent || ev.pnlAtEvent != null) && (
                <div className="flex gap-3 text-[10px] text-gray-600 font-mono">
                  {ev.spxAtEvent  && <span>SPX {ev.spxAtEvent.toFixed(0)}</span>}
                  {ev.vixAtEvent  && <span>VIX {ev.vixAtEvent.toFixed(2)}</span>}
                  {ev.pnlAtEvent != null && (
                    <span className={ev.pnlAtEvent >= 0 ? 'text-green-500/70' : 'text-red-500/70'}>
                      P&L {ev.pnlAtEvent >= 0 ? '+' : ''}${ev.pnlAtEvent.toFixed(0)}
                    </span>
                  )}
                </div>
              )}
              {ev.notes && <div className="text-[10px] text-gray-500 mt-0.5 italic">{ev.notes}</div>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
