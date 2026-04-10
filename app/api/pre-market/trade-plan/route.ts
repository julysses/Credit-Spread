import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { InstitutionalSignals } from '@/server/institutional-signals';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are an institutional options trader operating on the SPX and SPY.

Given the following market structure inputs — GEX regime and Flip level, VIX term structure shape, VVIX level, overnight ES/NQ futures action and gap, dark pool flow bias, catalyst risk for the session, Signal Stack tier score, and SPX vs. 200-day SMA position — output a structured trade plan for the next session.

Your output must include exactly these 6 labeled sections:

1. REGIME CLASSIFICATION
Tier 1–5 with one-line rationale tied directly to the signal inputs provided.

2. RECOMMENDED STRATEGY
Specific structure (iron condor, bull put spread, debit spread, etc.) with rationale tied to the signal inputs. Never recommend naked short options — all structures must be defined risk or spread-based.

3. STRIKE SELECTION
Specific SPX or SPY strikes and DTE based on GEX walls and vol regime. Reference the gamma flip, call wall, and put wall levels provided.

4. POSITION SIZING
As a percentage of account, scaled to tier risk level. Apply any overrides noted in the input (catalyst = 50% reduction, Tier 4+ = no short vol).

5. ENTRY CONDITIONS
Exact price or time-based triggers. Be specific.

6. EXIT RULES
Profit target percentage, stop loss trigger, and time stop.

Be precise and actionable. No filler. No disclaimers. Format each section with its number and title on a single line, followed by the content.`;

function buildUserMessage(signals: InstitutionalSignals, appliedRules: string[]): string {
  const spxAboveSMA = (signals.spxVs200smaPct ?? 0) > 0;
  const spxVsSMAStr = signals.spxVs200smaPct != null
    ? `${spxAboveSMA ? '+' : ''}${signals.spxVs200smaPct.toFixed(2)}% ${spxAboveSMA ? 'ABOVE' : 'BELOW'} 200-SMA`
    : 'N/A';

  return `INSTITUTIONAL PRE-MARKET SIGNAL STACK — TRADE PLAN REQUEST

EDGE 01 — GEX / DEALER GAMMA
- Net GEX: ${signals.gexNet != null ? `$${(signals.gexNet / 1e6).toFixed(1)}B` : 'N/A'} (${signals.gexRegime?.toUpperCase() ?? 'UNKNOWN'} regime)
- Gamma Flip Level: ${signals.gammaFlipLevel ?? 'N/A'}
- Call Wall: ${signals.callWall ?? 'N/A'}
- Put Wall: ${signals.putWall ?? 'N/A'}

EDGE 02 — VIX TERM STRUCTURE
- VIX Spot: ${signals.vixSpot ?? 'N/A'}
- VVIX: ${signals.vvixClose ?? 'N/A'}
- VIX9D: ${signals.vix9d ?? 'N/A'} | VIX3M: ${signals.vix3m ?? 'N/A'}
- Term Structure: ${signals.vixTermStructure?.replace(/_/g, ' ').toUpperCase() ?? 'N/A'}
- VIX9D vs VIX3M Spread: ${signals.vix9dVsVix30Spread != null ? `${signals.vix9dVsVix30Spread > 0 ? '+' : ''}${signals.vix9dVsVix30Spread}` : 'N/A'} (${(signals.vix9dVsVix30Spread ?? 0) < 0 ? 'VIX9D < VIX3M = bullish normal' : 'VIX9D > VIX3M = fear premium elevated'})

EDGE 03 — OVERNIGHT FUTURES
- ES High: ${signals.esOvernightHigh ?? 'N/A'} | Low: ${signals.esOvernightLow ?? 'N/A'} | Current: ${signals.esCurrentPrice ?? 'N/A'}
- NQ High: ${signals.nqOvernightHigh ?? 'N/A'} | Low: ${signals.nqOvernightLow ?? 'N/A'}
- Gap vs. Prior Close: ${signals.gapVsPriorClose != null ? `${signals.gapVsPriorClose > 0 ? '+' : ''}${signals.gapVsPriorClose} (${signals.gapPct != null ? `${signals.gapPct > 0 ? '+' : ''}${signals.gapPct}%` : 'N/A'})` : 'N/A'}
- Overnight Type: ${signals.overnightType?.replace(/_/g, ' ').toUpperCase() ?? 'N/A'}

EDGE 04 — DARK POOL & OPTIONS FLOW
- Flow Bias: ${signals.darkPoolBias.toUpperCase()} (${signals.darkPoolIsManual ? 'manually entered' : 'auto-fetched'})
- Call Sweep %: ${signals.darkPoolCallPct}% | Put Sweep %: ${(100 - signals.darkPoolCallPct).toFixed(0)}%

EDGE 05 — CATALYST RISK
- Catalyst Risk: ${signals.catalystRisk ? 'YES — HIGH IMPACT EVENT(S) PRESENT' : 'No high-impact events'}
- Detail: ${signals.catalystDetail || 'None'}
- Next Session Events: ${signals.nextSessionEvents.length > 0 ? signals.nextSessionEvents.map(e => `${e.type} at ${e.time} (${e.importance})`).join(', ') : 'None scheduled'}

EDGE 06 — MARKET BREADTH
- NYSE A/D Ratio: ${signals.adRatio ?? 'N/A'} (${signals.adRatio != null ? (signals.adRatio > 1.5 ? 'BULLISH' : signals.adRatio < 0.8 ? 'BEARISH' : 'NEUTRAL') : 'N/A'})
- % SPX above 200-SMA: ${signals.pctAbove200sma != null ? `${signals.pctAbove200sma.toFixed(1)}%` : 'N/A'} (${signals.pctAbove200sma != null ? (signals.pctAbove200sma > 60 ? 'BROAD PARTICIPATION' : signals.pctAbove200sma < 40 ? 'NARROW/DETERIORATING' : 'MIXED') : 'N/A'})

EDGE 07 — SPX vs. 200-DAY SMA & MACRO REGIME
- SPX: ${signals.spxClose ?? 'N/A'} | 200-SMA: ${signals.spx200sma ?? 'N/A'} | Deviation: ${spxVsSMAStr}
- HY Spread: ${signals.hySpreadBps != null ? `${signals.hySpreadBps} bps (2wk change: ${signals.hySpread2wkChange != null ? `${signals.hySpread2wkChange > 0 ? '+' : ''}${signals.hySpread2wkChange} bps` : 'N/A'})` : 'N/A'}
- DXY: ${signals.dxyLevel ?? 'N/A'} (${signals.dxyLevel != null ? (signals.dxyLevel > 100 ? 'STRONG — risk-off signal' : 'Normal') : 'N/A'})

COMPOSITE SIGNAL STACK TIER: ${signals.tierScore} — ${signals.tierRationale}

APPLIED OVERRIDE RULES:
${appliedRules.length > 0 ? appliedRules.map(r => `• ${r}`).join('\n') : '• None — standard tier rules apply'}

Generate the trade plan for the next session using this data.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const signals: InstitutionalSignals = await req.json();

  // Collect applied hard rules
  const appliedRules: string[] = [...(signals.tierRules ?? [])];

  // Enforce hard rules — inject into system context
  let systemOverride = '';
  if (signals.catalystRisk) {
    systemOverride += '\nCATALYST OVERRIDE ACTIVE: Reduce all position sizing to 50% of normal. Minimum 21 DTE required. No same-day expiry structures.';
    appliedRules.push('Catalyst override: 50% position size max, min 21 DTE');
  }
  if ((signals.tierScore ?? 0) >= 4) {
    systemOverride += '\nREGIME OVERRIDE ACTIVE: Tier 4+ — ALL short-vol structures are PROHIBITED. Only recommend debit spreads, long options, or cash/hedge structures.';
    appliedRules.push('Tier 4+ override: short-vol structures blocked');
  }
  if ((signals.vvixClose ?? 0) > 110) {
    systemOverride += '\nEXTREME VOL OVERRIDE ACTIVE: VVIX above 110 — Tier 5 only. Recommend cash, LEAPS puts, or VIX calls only. No premium selling of any kind.';
    appliedRules.push('VVIX > 110 override: defensive only, no premium selling');
  }
  if ((signals.darkPoolCallPct ?? 50) > 75 && (signals.tierScore ?? 3) <= 2) {
    appliedRules.push(`Dark pool call sweep ${signals.darkPoolCallPct}% — flag aggressive bullish confirmation in plan`);
  }

  const client = new Anthropic({ apiKey });
  const userMessage = buildUserMessage(signals, appliedRules);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: SYSTEM_PROMPT + systemOverride,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawOutput = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse the 6 sections from raw output
    const sections: Record<string, string> = {};
    const sectionNames = [
      'REGIME CLASSIFICATION',
      'RECOMMENDED STRATEGY',
      'STRIKE SELECTION',
      'POSITION SIZING',
      'ENTRY CONDITIONS',
      'EXIT RULES',
    ];
    for (let i = 0; i < sectionNames.length; i++) {
      const name = sectionNames[i];
      const startMarker = new RegExp(`${i + 1}\\.\\s*${name}`, 'i');
      const nextMarker = i < sectionNames.length - 1
        ? new RegExp(`${i + 2}\\.\\s*${sectionNames[i + 1]}`, 'i')
        : null;
      const startMatch = rawOutput.search(startMarker);
      if (startMatch === -1) continue;
      const contentStart = rawOutput.indexOf('\n', startMatch) + 1;
      const contentEnd = nextMarker ? rawOutput.search(nextMarker) : rawOutput.length;
      sections[name] = rawOutput.slice(contentStart, contentEnd !== -1 ? contentEnd : undefined).trim();
    }

    return NextResponse.json({
      success: true,
      tradePlan: sections,
      rawOutput,
      appliedRules,
      tierScore: signals.tierScore,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
