import { NextResponse } from 'next/server';
import { fetchSignalStackInputs } from '@/server/signal-stack-inputs';
import { computeCompositeScore } from '@/lib/models/regime-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const inputs = await fetchSignalStackInputs();

    const result = computeCompositeScore({
      spxPrice:             inputs.spxPrice,
      spx200sma:            inputs.spx200sma,
      breadthPctAbove200:   inputs.breadthPctAbove200,
      hySpreadBps:          inputs.hySpreadBps,
      vixLevel:             inputs.vixLevel,
      gexValue:             inputs.gexValue,
      pcrValue:             inputs.pcrValue,
      vvixLevel:            inputs.vvixLevel,
      dxyLevel:             inputs.dxyLevel,
      wti4wkChangePct:      inputs.wti4wkChangePct,
      goldWeeklyChangePct:  inputs.goldWeeklyChangePct,
    });

    // Derive a rough IVR from VIX percentile (0-100)
    const vix = inputs.vixLevel ?? 18;
    // Simple IVR proxy: map VIX to a 0-100 range using 10 (low) to 40 (extreme) bounds
    const ivr = Math.max(0, Math.min(100, Math.round(((vix - 10) / 30) * 100)));

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        ivr,
        inputs: {
          spxPrice:           inputs.spxPrice,
          vixLevel:           inputs.vixLevel,
          breadthPctAbove200: inputs.breadthPctAbove200,
          hySpreadBps:        inputs.hySpreadBps,
          gexValue:           inputs.gexValue,
          pcrValue:           inputs.pcrValue,
          vvixLevel:          inputs.vvixLevel,
          dxyLevel:           inputs.dxyLevel,
          wti4wkChangePct:    inputs.wti4wkChangePct,
          goldWeeklyChangePct:inputs.goldWeeklyChangePct,
        },
        fetchedAt: inputs.fetchedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
