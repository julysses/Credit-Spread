import { NextRequest, NextResponse } from 'next/server';
import {
  runMonteCarloWithPaths,
  calculateSpreadProbabilities,
  buildPriceHistogram,
} from '@/lib/models/monte-carlo';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const MCSchema = z.object({
  spotPrice: z.number().positive(),
  impliedVolatility: z.number().positive(),
  drift: z.number().default(0),
  daysToExpiry: z.number().int().positive(),
  numSimulations: z.number().int().min(1000).max(50000).default(10000),
  shortStrike: z.number().optional(),
  longStrike: z.number().optional(),
  spreadType: z.enum(['call', 'put']).optional(),
  creditReceived: z.number().optional(),
  numPaths: z.number().int().min(10).max(200).default(50),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = MCSchema.parse(body);

    const { results, paths } = runMonteCarloWithPaths(
      {
        spotPrice: input.spotPrice,
        impliedVolatility: input.impliedVolatility,
        drift: input.drift,
        daysToExpiry: input.daysToExpiry,
        numSimulations: input.numSimulations,
      },
      input.numPaths
    );

    const histogram = buildPriceHistogram(results.terminalPrices, 40);

    let spreadProbabilities = null;
    if (input.shortStrike && input.longStrike && input.spreadType && input.creditReceived !== undefined) {
      spreadProbabilities = calculateSpreadProbabilities(
        results,
        input.shortStrike,
        input.longStrike,
        input.spreadType,
        input.creditReceived
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          meanPrice: results.meanPrice,
          stdDev: results.stdDev,
          percentile5: results.percentile5,
          percentile10: results.percentile10,
          percentile25: results.percentile25,
          percentile50: results.percentile50,
          percentile75: results.percentile75,
          percentile90: results.percentile90,
          percentile95: results.percentile95,
        },
        histogram,
        paths,
        spreadProbabilities,
        inputs: input,
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const spotPrice = parseFloat(url.searchParams.get('spot') || '5800');
  const iv = parseFloat(url.searchParams.get('iv') || '0.18');
  const dte = parseInt(url.searchParams.get('dte') || '7');

  const { results, paths } = runMonteCarloWithPaths(
    { spotPrice, impliedVolatility: iv, drift: 0, daysToExpiry: dte, numSimulations: 5000 },
    30
  );

  const histogram = buildPriceHistogram(results.terminalPrices, 30);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        meanPrice: results.meanPrice,
        stdDev: results.stdDev,
        percentile5: results.percentile5,
        percentile95: results.percentile95,
      },
      histogram,
      paths: paths.slice(0, 20),
    },
  });
}
