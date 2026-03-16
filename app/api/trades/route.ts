import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// In-memory store for demo (replace with DB in production)
let demoTrades: DemoTrade[] = [
  {
    id: 1,
    openedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    strategy: 'MODERN_INCOME',
    tradeType: 'put_credit_spread',
    shortStrike: 5650,
    longStrike: 5640,
    optionType: 'put',
    contracts: 5,
    openCredit: 1.45,
    closeDebit: 0.72,
    pnl: 365,
    pnlPercent: 50.3,
    status: 'closed',
    closeReason: 'profit_target',
    expiryDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  },
  {
    id: 2,
    openedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    strategy: '90_PERCENT_FRAMEWORK',
    tradeType: 'iron_condor',
    shortStrike: 5600,
    longStrike: 5590,
    shortStrike2: 5900,
    longStrike2: 5910,
    optionType: 'iron_condor',
    contracts: 3,
    openCredit: 2.10,
    pnl: null,
    status: 'open',
    expiryDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  },
];

interface DemoTrade {
  id: number;
  openedAt: string;
  closedAt?: string;
  strategy: string;
  tradeType: string;
  shortStrike: number;
  longStrike: number;
  shortStrike2?: number;
  longStrike2?: number;
  optionType: string;
  contracts: number;
  openCredit: number;
  closeDebit?: number;
  pnl: number | null;
  pnlPercent?: number;
  status: string;
  closeReason?: string;
  expiryDate: string;
  notes?: string;
}

const TradeSchema = z.object({
  strategy: z.string(),
  tradeType: z.string(),
  shortStrike: z.number(),
  longStrike: z.number(),
  shortStrike2: z.number().optional(),
  longStrike2: z.number().optional(),
  optionType: z.string(),
  contracts: z.number().int().positive().default(1),
  openCredit: z.number().positive(),
  expiryDate: z.string(),
  notes: z.string().optional(),
});

export async function GET() {
  const openTrades = demoTrades.filter(t => t.status === 'open');
  const closedTrades = demoTrades.filter(t => t.status === 'closed');

  const totalPnl = closedTrades.reduce((a, t) => a + (t.pnl || 0), 0);
  const winRate = closedTrades.length > 0
    ? closedTrades.filter(t => (t.pnl || 0) > 0).length / closedTrades.length
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      trades: demoTrades.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()),
      summary: {
        openTrades: openTrades.length,
        closedTrades: closedTrades.length,
        totalPnl,
        winRate,
        openExposure: openTrades.reduce((a, t) => a + t.openCredit * t.contracts * 100, 0),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = TradeSchema.parse(body);

    const trade: DemoTrade = {
      id: demoTrades.length + 1,
      openedAt: new Date().toISOString(),
      ...input,
      pnl: null,
      status: 'open',
    };

    demoTrades.push(trade);

    return NextResponse.json({ success: true, data: trade }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
