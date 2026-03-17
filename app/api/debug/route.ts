/**
 * /api/debug — live data-source diagnostics
 * Returns what each upstream API returns so we can pinpoint failures.
 */
import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

async function probe(name: string, fn: () => Promise<unknown>) {
  const start = Date.now();
  try {
    const data = await fn();
    return { name, ok: true, ms: Date.now() - start, data };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - start, error: (err as Error).message };
  }
}

export async function GET() {
  const MD_KEY = process.env.MARKETDATA_API_KEY;
  const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  const checks = await Promise.all([
    // MarketData.app — SPX
    probe('marketdata_spx', async () => {
      if (!MD_KEY) throw new Error('MARKETDATA_API_KEY not set');
      const r = await axios.get('https://api.marketdata.app/v1/indices/quotes/SPX/', {
        headers: { Authorization: `Token ${MD_KEY}` }, timeout: 6000,
      });
      return { s: r.data?.s, last: r.data?.last?.[0], change: r.data?.change?.[0], changepct: r.data?.changepct?.[0] };
    }),

    // MarketData.app — VIX
    probe('marketdata_vix', async () => {
      if (!MD_KEY) throw new Error('MARKETDATA_API_KEY not set');
      const r = await axios.get('https://api.marketdata.app/v1/indices/quotes/VIX/', {
        headers: { Authorization: `Token ${MD_KEY}` }, timeout: 6000,
      });
      return { s: r.data?.s, last: r.data?.last?.[0], change: r.data?.change?.[0], changepct: r.data?.changepct?.[0] };
    }),

    // MarketData.app — SPY (stock)
    probe('marketdata_spy', async () => {
      if (!MD_KEY) throw new Error('MARKETDATA_API_KEY not set');
      const r = await axios.get('https://api.marketdata.app/v1/stocks/quotes/SPY/', {
        headers: { Authorization: `Token ${MD_KEY}` }, timeout: 6000,
      });
      return { s: r.data?.s, last: r.data?.last?.[0], change: r.data?.change?.[0] };
    }),

    // Yahoo Finance v8 chart — ^GSPC (SPX)
    probe('yahoo_spx', async () => {
      const r = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC', {
        params: { range: '1d', interval: '1m', includePrePost: 'false' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        timeout: 7000,
      });
      const meta = r.data?.chart?.result?.[0]?.meta;
      return { price: meta?.regularMarketPrice, prev: meta?.chartPreviousClose, time: meta?.regularMarketTime };
    }),

    // Yahoo Finance v8 chart — ^VIX
    probe('yahoo_vix', async () => {
      const r = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX', {
        params: { range: '1d', interval: '1m', includePrePost: 'false' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        timeout: 7000,
      });
      const meta = r.data?.chart?.result?.[0]?.meta;
      return { price: meta?.regularMarketPrice, prev: meta?.chartPreviousClose, time: meta?.regularMarketTime };
    }),

    // Alpha Vantage — SPY
    probe('alphavantage_spy', async () => {
      if (!AV_KEY) throw new Error('ALPHA_VANTAGE_API_KEY not set');
      const r = await axios.get('https://www.alphavantage.co/query', {
        params: { function: 'GLOBAL_QUOTE', symbol: 'SPY', apikey: AV_KEY }, timeout: 6000,
      });
      const q = r.data?.['Global Quote'];
      return { price: q?.['05. price'], change: q?.['09. change'], changePct: q?.['10. change percent'] };
    }),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: {
      MARKETDATA_API_KEY: MD_KEY ? `set (${MD_KEY.slice(0, 8)}...)` : 'NOT SET',
      ALPHA_VANTAGE_API_KEY: AV_KEY ? `set (${AV_KEY.slice(0, 6)}...)` : 'NOT SET',
      GNEWS_API_KEY: process.env.GNEWS_API_KEY ? 'set' : 'NOT SET',
    },
    checks,
  });
}
