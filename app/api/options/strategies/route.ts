import { NextResponse } from 'next/server';
import { fetchSignalStackInputs } from '@/server/signal-stack-inputs';
import { computeCompositeScore } from '@/lib/models/regime-engine';
import { selectOptionsStrategies, getStructureMatrix } from '@/lib/models/options-strategy-selector';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const inputs = await fetchSignalStackInputs();

    const regimeResult = computeCompositeScore({
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

    const vix = inputs.vixLevel ?? 18;
    const ivr = Math.max(0, Math.min(100, Math.round(((vix - 10) / 30) * 100)));

    const selectionResult = selectOptionsStrategies(
      regimeResult.regime,
      regimeResult.compositeScore,
      ivr
    );

    const structureMatrix = getStructureMatrix(ivr, regimeResult.regime);

    return NextResponse.json({
      success: true,
      data: {
        regime:           regimeResult.regime,
        compositeScore:   regimeResult.compositeScore,
        confidence:       regimeResult.confidence,
        ivr,
        ...selectionResult,
        structureMatrix,
        fetchedAt:        inputs.fetchedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
