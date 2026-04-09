import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a senior SPX options risk manager using a Signal Stacking framework. Analyze the provided macro and flow indicators, score them against the defined thresholds, and deliver a concise institutional-grade trade recommendation. Be direct, specific, and actionable. No disclaimers.

Format your response exactly as:

[SIGNAL SUMMARY] — one sentence macro read

[ACTIVE TRIGGERS]
• list each fired signal with its current value vs threshold

[COMPOSITE SIGNAL] — tier label and brief rationale

[RECOMMENDED ACTION]
• specific options structure with DTE guidance
• position sizing guidance based on Kelly/portfolio vol status
• entry criteria if market not yet at ideal level

[RISK CAVEAT] — one sentence on what would invalidate this thesis

[0DTE VERDICT] — assess 0DTE credit spread viability based on the regime data provided:
- If Crown macro score ≤ 2 AND GEX is positive AND VIX < 25: output "HIGH PROBABILITY — [name the best-fit strategy: Breakeven Iron Condor if entry time is 1 PM+, Late-Entry IC if near close, or Afternoon Peg IC if 1–2:45 PM range]"
- If Crown macro score 3–4 AND GEX is positive: output "MODERATE — reduce size, favor Late-Entry IC (3:55 PM) or Breakeven IC"
- If Crown macro score ≥ 5 OR GEX is negative AND macro score ≥ 3: output "AVOID 0DTE — Crown score elevated, macro risk not supportive of premium selling"
- If VIX > 25 AND macro score ≤ 4: output "CAUTION — VIX elevated; only consider GEX-Anchored or Schwartz Dollar Rule IC post-volatility spike"
Be concise. One sentence verdict plus one sentence rationale.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const snapshot = await req.json();
  const client = new Anthropic({ apiKey });

  const userMessage = `Analyze this Signal Stack snapshot:

RAW MARKET DATA:
- WTI Crude: $${snapshot.wti_price} (4-week change: ${snapshot.wti_4week_change_pct}%)
- SPX: ${snapshot.spx_price} | 200 SMA: ${snapshot.spx_200sma} | Deviation: ${(((snapshot.spx_price - snapshot.spx_200sma) / snapshot.spx_200sma) * 100).toFixed(2)}%
- Market Breadth (% above 200 SMA): ${snapshot.breadth_pct_above_200sma}%
- HY Spread: ${snapshot.hy_spread_bps} bps (2-week change: +${snapshot.hy_spread_2week_change} bps)
- DXY: ${snapshot.dxy_level}
- VIX: ${snapshot.vix_level}
- Gold: $${snapshot.gold_price} (weekly change: ${snapshot.gold_weekly_change_pct}%)
- Portfolio Volatility (annualized): ${snapshot.portfolio_vol_annualized}%

FLOW SIGNALS:
- GEX: ${snapshot.gex_value}B (${snapshot.gex_value < 0 ? 'NEGATIVE — trending regime' : 'positive — pinning regime'})
- VVIX: ${snapshot.vvix_level}
- Put/Call Ratio: ${snapshot.pcr_value}

SCORING RESULTS:
- Macro Score: ${snapshot.macro_score}/8${snapshot.feedback_bonus_active ? ' (includes WTI+DXY feedback loop bonus)' : ''}
- Flow Score: ${snapshot.flow_score}/3
- Portfolio Vol Status: ${snapshot.portfolio_vol_status}
- Composite Signal: ${snapshot.composite_signal}

FIRED SIGNALS (${snapshot.fired_signals?.length ?? 0} active):
${snapshot.fired_signals?.map((s: string) => `• ${s}`).join('\n') ?? 'None'}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: userMessage }],
      system: SYSTEM_PROMPT,
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    return NextResponse.json({ success: true, recommendation: text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
