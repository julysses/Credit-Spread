import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// In-memory event log (single-user desk; persists for session lifetime)
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

let events: DefenseEvent[] = [];
let nextId = 1;

export async function GET() {
  const sorted = [...events].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ).slice(0, 50);

  return NextResponse.json({ success: true, data: { events: sorted, total: events.length } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, description, spxAtEvent, vixAtEvent, pnlAtEvent, notes } = body as Partial<DefenseEvent>;

    if (!eventType || !description) {
      return NextResponse.json(
        { success: false, error: 'eventType and description are required' },
        { status: 400 },
      );
    }

    const event: DefenseEvent = {
      id: nextId++,
      createdAt: new Date().toISOString(),
      eventType,
      description,
      spxAtEvent,
      vixAtEvent,
      pnlAtEvent,
      notes,
    };

    events.push(event);
    return NextResponse.json({ success: true, data: { event } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
