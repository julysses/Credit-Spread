import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/database/db';
import { trades } from '@/database/schema';
import { desc, eq } from 'drizzle-orm';
import {
  classifyDefenseRegime,
  calcSpreadPnL,
  getRecoveryPlays,
  calcPositionSize,
  type SpreadPosition,
} from '@/lib/models/defense-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const activeTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.status, 'open'))
      .orderBy(desc(trades.openedAt))
      .limit(1)
      .execute();

    const activeTrade = activeTrades[0];
    if (!activeTrade) {
      return NextResponse.json({
        success: true,
        data: {
          hasActivePosition: false,
          position: null,
          message: 'No active position',
          lastUpdated: formatEtTime(),
        },
      });
    }

    const currentSpx = parseFloat(url.searchParams.get('spx') ?? '');
    const currentVix = parseFloat(url.searchParams.get('vix') ?? '');
    const currentDte = parseFloat(url.searchParams.get('dte') ?? '');
    const currentIv  = parseFloat(url.searchParams.get('iv')  ?? '');
    const accountSize = parseFloat(url.searchParams.get('accountSize') ?? '100000');
    const riskPct = parseFloat(url.searchParams.get('riskPct') ?? '0.02');

    const missingMarketInputs = [];
    if (!Number.isFinite(currentSpx)) missingMarketInputs.push('spx');
    if (!Number.isFinite(currentVix)) missingMarketInputs.push('vix');
    if (!Number.isFinite(currentDte)) missingMarketInputs.push('dte');
    if (!Number.isFinite(currentIv)) missingMarketInputs.push('iv');

    if (missingMarketInputs.length > 0) {
      return NextResponse.json({
        success: false,
        code: 'DATA_UNAVAILABLE',
        feature: 'defense-status',
        message: `Defense status requires live market inputs: ${missingMarketInputs.join(', ')}`,
        missingSources: missingMarketInputs,
        data: {
          hasActivePosition: true,
          position: activeTrade,
        },
      }, { status: 503 });
    }

    const position: SpreadPosition = {
      entryCredit: activeTrade.openCredit,
      shortStrike: activeTrade.shortStrike,
      longStrike: activeTrade.longStrike,
      optionType: (activeTrade.optionType === 'call' ? 'call' : 'put'),
      dteAtEntry: activeTrade.expiryDate
        ? Math.max(0, Math.round((new Date(activeTrade.expiryDate).getTime() - new Date(activeTrade.openedAt ?? Date.now()).getTime()) / 86400000))
        : Math.max(0, currentDte),
      contracts: activeTrade.contracts ?? 1,
    };

    const pnl = calcSpreadPnL(position, currentSpx, currentIv, currentDte);
    const regime = classifyDefenseRegime(currentVix, pnl.pnlPct, currentDte);
    const plays = getRecoveryPlays(regime.level, pnl.pnlPct, currentDte);
    const sizing = calcPositionSize(accountSize, riskPct, pnl.maxLoss / position.contracts);

    return NextResponse.json({
      success: true,
      data: {
        hasActivePosition: true,
        regime,
        position,
        trade: activeTrade,
        pnl,
        plays,
        sizing,
        marketSnapshot: {
          spx: currentSpx,
          vix: currentVix,
          dte: currentDte,
          iv: currentIv,
        },
        lastUpdated: formatEtTime(),
      },
    });
  } catch (err) {
    console.error('Defense status error:', err);
    return NextResponse.json(
      { success: false, code: 'DATA_UNAVAILABLE', error: String(err) },
      { status: 503 },
    );
  }
}

function formatEtTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ' ET';
}
