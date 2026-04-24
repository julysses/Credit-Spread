import { NextRequest, NextResponse } from 'next/server';
import {
  classifyDefenseRegime,
  calcSpreadPnL,
  getRecoveryPlays,
  calcPositionSize,
  type SpreadPosition,
} from '@/lib/models/defense-engine';

export const dynamic = 'force-dynamic';

// Default demo position used when no real position data is available
const DEMO_POSITION: SpreadPosition = {
  entryCredit: 1.75,
  shortStrike: 5650,
  longStrike: 5640,
  optionType: 'put',
  dteAtEntry: 7,
  contracts: 2,
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Accept query params to override demo position
    const entryCredit  = parseFloat(url.searchParams.get('entryCredit')  ?? '');
    const shortStrike  = parseFloat(url.searchParams.get('shortStrike')  ?? '');
    const longStrike   = parseFloat(url.searchParams.get('longStrike')   ?? '');
    const optionType   = (url.searchParams.get('optionType')  ?? 'put') as 'put' | 'call';
    const dteAtEntry   = parseFloat(url.searchParams.get('dteAtEntry')   ?? '');
    const contracts    = parseInt(url.searchParams.get('contracts')      ?? '');
    const currentSpx   = parseFloat(url.searchParams.get('spx')          ?? '5800');
    const currentVix   = parseFloat(url.searchParams.get('vix')          ?? '18');
    const currentDte   = parseFloat(url.searchParams.get('dte')          ?? '3');
    const currentIv    = parseFloat(url.searchParams.get('iv')           ?? '0.18');
    const accountSize  = parseFloat(url.searchParams.get('accountSize')  ?? '100000');
    const riskPct      = parseFloat(url.searchParams.get('riskPct')      ?? '0.02');

    const position: SpreadPosition = {
      entryCredit:  isNaN(entryCredit) ? DEMO_POSITION.entryCredit  : entryCredit,
      shortStrike:  isNaN(shortStrike) ? DEMO_POSITION.shortStrike  : shortStrike,
      longStrike:   isNaN(longStrike)  ? DEMO_POSITION.longStrike   : longStrike,
      optionType,
      dteAtEntry:   isNaN(dteAtEntry)  ? DEMO_POSITION.dteAtEntry   : dteAtEntry,
      contracts:    isNaN(contracts)   ? DEMO_POSITION.contracts     : contracts,
    };

    const pnl = calcSpreadPnL(position, currentSpx, currentIv, currentDte);
    const regime = classifyDefenseRegime(currentVix, pnl.pnlPct, currentDte);
    const plays = getRecoveryPlays(regime.level, pnl.pnlPct, currentDte);
    const sizing = calcPositionSize(accountSize, riskPct, pnl.maxLoss / position.contracts);

    return NextResponse.json({
      success: true,
      data: {
        regime,
        position,
        pnl,
        plays,
        sizing,
        marketSnapshot: {
          spx: currentSpx,
          vix: currentVix,
          dte: currentDte,
          iv: currentIv,
        },
        lastUpdated: new Date().toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }) + ' ET',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
