import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { optionsFlowAlerts } from '@/database/schema';
import { desc, gte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days  = Math.min(parseInt(searchParams.get('days') ?? '7'), 30);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const alerts = await db
      .select()
      .from(optionsFlowAlerts)
      .where(gte(optionsFlowAlerts.detectedAt, since))
      .orderBy(desc(optionsFlowAlerts.detectedAt))
      .limit(limit)
      .execute();

    return NextResponse.json({ ok: true, data: { alerts, count: alerts.length } });
  } catch {
    return NextResponse.json({
      ok: true,
      data: {
        alerts: getMockFlowAlerts(),
        count: 5,
        _mock: true,
      },
    });
  }
}

function getMockFlowAlerts() {
  const now = new Date().toISOString();
  return [
    { id: 1, symbol: 'NVDA', alertType: 'unusual_call', strike: '900',  expiry: '2025-08-15', premium: '85000', volume: '12500', openInterest: '4200', volumeOiRatio: '2.98', impliedVolatility: '0.42', sentiment: 'bullish', detectedAt: now },
    { id: 2, symbol: 'CRWD', alertType: 'unusual_call', strike: '400',  expiry: '2025-07-19', premium: '52000', volume: '8300',  openInterest: '3100', volumeOiRatio: '2.68', impliedVolatility: '0.38', sentiment: 'bullish', detectedAt: now },
    { id: 3, symbol: 'TSLA', alertType: 'unusual_put',  strike: '200',  expiry: '2025-07-12', premium: '71000', volume: '9800',  openInterest: '5200', volumeOiRatio: '1.88', impliedVolatility: '0.55', sentiment: 'bearish', detectedAt: now },
    { id: 4, symbol: 'META', alertType: 'unusual_call', strike: '580',  expiry: '2025-08-01', premium: '48000', volume: '7200',  openInterest: '2900', volumeOiRatio: '2.48', impliedVolatility: '0.31', sentiment: 'bullish', detectedAt: now },
    { id: 5, symbol: 'AXON', alertType: 'unusual_call', strike: '340',  expiry: '2025-09-20', premium: '61000', volume: '5400',  openInterest: '1800', volumeOiRatio: '3.00', impliedVolatility: '0.45', sentiment: 'bullish', detectedAt: now },
  ];
}
