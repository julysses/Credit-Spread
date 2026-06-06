/**
 * Institutional & Smart Money Intelligence
 * Sources: SEC EDGAR 13F filings, FMP insider trades, FINRA short interest
 * Falls back to mock data when APIs are unavailable.
 */

import axios from 'axios';

const EDGAR_BASE = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_SUBMISSIONS = 'https://data.sec.gov/submissions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HedgeFundPosition {
  fund: string;
  cik: string;
  shares: number;
  changeShares: number;     // vs prior quarter (positive = buying)
  changePercent: number;
  filingDate: string;
  action: 'added' | 'increased' | 'decreased' | 'sold';
}

export interface InstitutionalData {
  symbol: string;
  institutionalOwnershipPct: number;  // % of float held by institutions
  hfNetShareChangePct: number;        // QoQ % change from 13F
  topHolders: HedgeFundPosition[];
  insiderNetBuyDollars90d: number;
  shortFloatPct: number;
  shortRatioDaysToCover: number;
  shortFloatChangePct: number;        // vs prior period
  institutionalScore: number;         // 0–25
}

// ─── Major Hedge Funds CIKs (tracked from SEC EDGAR) ─────────────────────────

const MAJOR_HF_CIKS: Record<string, string> = {
  'Berkshire Hathaway':   '0001067983',
  'Renaissance Tech':     '0001037389',
  'Citadel Advisors':     '0001423053',
  'Bridgewater':          '0001350694',
  'Two Sigma':            '0001179392',
  'Tiger Global':         '0001167483',
  'Viking Global':        '0001035674',
  'D.E. Shaw':            '0001009207',
};

// ─── SEC EDGAR 13F Search ─────────────────────────────────────────────────────

async function search13FFilings(symbol: string): Promise<HedgeFundPosition[]> {
  try {
    // Search for recent 13F-HR filings mentioning this symbol
    const resp = await axios.get(EDGAR_BASE, {
      params: {
        q: `"${symbol}" 13F-HR`,
        dateRange: 'custom',
        startdt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        forms: '13F-HR',
      },
      headers: {
        'User-Agent': 'SPX Signal Desk research@example.com',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    // EDGAR returns limited data in free search; parse what we can
    const hits = resp.data?.hits?.hits ?? [];
    const positions: HedgeFundPosition[] = [];

    for (const hit of hits.slice(0, 10)) {
      const src = hit._source ?? {};
      const entityName = String(src.entity_name ?? 'Unknown Fund');
      const filingDate = String(src.file_date ?? '');

      positions.push({
        fund:          entityName,
        cik:           String(src.file_num ?? ''),
        shares:        0,        // full parsing requires downloading the XML
        changeShares:  0,
        changePercent: 0,
        filingDate,
        action:        'added',
      });
    }

    return positions;
  } catch {
    return [];
  }
}

// ─── Main Institutional Data Fetcher ─────────────────────────────────────────

export async function fetchInstitutionalData(
  symbol: string,
  insiderNetBuy: number = 0,
  shortFloatPct: number = 0,
): Promise<InstitutionalData> {
  if (!process.env.FMP_API_KEY) return getMockInstitutionalData(symbol);

  try {
    // Fetch institutional holders from FMP
    const [holdersResp, shortResp] = await Promise.allSettled([
      axios.get(`https://financialmodelingprep.com/api/v3/institutional-holder/${symbol}`, {
        params: { apikey: process.env.FMP_API_KEY },
        timeout: 8000,
      }),
      axios.get(`https://financialmodelingprep.com/api/v4/shares_float`, {
        params: { symbol, apikey: process.env.FMP_API_KEY },
        timeout: 8000,
      }),
    ]);

    const holders = holdersResp.status === 'fulfilled' ? holdersResp.value.data : [];
    const shortData = shortResp.status === 'fulfilled' && Array.isArray(shortResp.value.data)
      ? shortResp.value.data[0] ?? {}
      : {};

    // Compute institutional ownership
    let totalInstitutionalShares = 0;
    const topHolders: HedgeFundPosition[] = [];

    if (Array.isArray(holders)) {
      for (const h of holders.slice(0, 20)) {
        const shares     = Number(h.shares ?? 0);
        const changeShares = Number(h.change ?? 0);
        totalInstitutionalShares += shares;

        if (shares > 0) {
          const action: HedgeFundPosition['action'] =
            changeShares > shares * 0.1 ? 'added' :
            changeShares > 0 ? 'increased' :
            changeShares < -shares * 0.5 ? 'sold' : 'decreased';

          topHolders.push({
            fund:          String(h.holder ?? 'Unknown'),
            cik:           '',
            shares,
            changeShares,
            changePercent: shares > 0 ? parseFloat((changeShares / shares * 100).toFixed(1)) : 0,
            filingDate:    String(h.dateReported ?? ''),
            action,
          });
        }
      }
    }

    // Net buying trend: sum of change shares for top holders
    const netChange = topHolders.reduce((s, h) => s + h.changeShares, 0);
    const totalShares = totalInstitutionalShares || 1;
    const hfNetShareChangePct = parseFloat((netChange / totalShares * 100).toFixed(1));

    const resolvedShortFloat = Number(shortData.shortFloat ?? shortFloatPct) * 100 || shortFloatPct;
    const daysToCover = Number(shortData.shortRatio ?? 0);

    const institutionalOwnershipPct = Math.min(100, Math.max(0, totalInstitutionalShares > 0 ? 70 : 50)); // FMP holders don't give float %

    const score = computeInstitutionalScore({
      institutionalOwnershipPct,
      hfNetShareChangePct,
      insiderNetBuyDollars90d: insiderNetBuy,
      shortFloatPct: resolvedShortFloat,
    });

    return {
      symbol,
      institutionalOwnershipPct,
      hfNetShareChangePct,
      topHolders: topHolders.slice(0, 10),
      insiderNetBuyDollars90d: insiderNetBuy,
      shortFloatPct: resolvedShortFloat,
      shortRatioDaysToCover: daysToCover,
      shortFloatChangePct: 0, // would need historical data
      institutionalScore: score,
    };
  } catch (err) {
    console.error(`[institutional] Failed for ${symbol}:`, (err as Error).message);
    return getMockInstitutionalData(symbol);
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function computeInstitutionalScore(data: {
  institutionalOwnershipPct: number;
  hfNetShareChangePct: number;
  insiderNetBuyDollars90d: number;
  shortFloatPct: number;
}): number {
  let score = 0;

  // HF 13F net buying trend (up to 10 pts)
  if (data.hfNetShareChangePct >= 5)       score += 10;
  else if (data.hfNetShareChangePct >= 2)  score += 7;
  else if (data.hfNetShareChangePct >= 0)  score += 4;
  else if (data.hfNetShareChangePct >= -2) score += 2;

  // Insider buying (up to 10 pts)
  if (data.insiderNetBuyDollars90d >= 1_000_000)   score += 10;
  else if (data.insiderNetBuyDollars90d >= 250_000)  score += 7;
  else if (data.insiderNetBuyDollars90d >= 50_000)   score += 4;
  else if (data.insiderNetBuyDollars90d > 0)         score += 2;
  else if (data.insiderNetBuyDollars90d < -500_000)  score -= 3;

  // Institutional ownership > 50% (up to 5 pts)
  if (data.institutionalOwnershipPct >= 70)      score += 5;
  else if (data.institutionalOwnershipPct >= 50) score += 3;
  else if (data.institutionalOwnershipPct >= 30) score += 1;

  return Math.min(25, Math.max(0, score));
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export function getMockInstitutionalData(symbol: string): InstitutionalData {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const ownershipPct  = 50 + (seed % 30);
  const netChangePct  = (seed % 7) - 2; // -2 to +4
  const insiderNet    = (seed % 5) * 250_000 - 100_000;
  const shortFloat    = 2 + (seed % 18);

  const holders: HedgeFundPosition[] = [
    { fund: 'Vanguard Group', cik: '', shares: 5e6 + seed * 1000, changeShares: seed * 500, changePercent: 2.1, filingDate: '2025-03-31', action: 'increased' },
    { fund: 'BlackRock', cik: '', shares: 4e6 + seed * 800, changeShares: -seed * 200, changePercent: -0.8, filingDate: '2025-03-31', action: 'decreased' },
    { fund: 'State Street', cik: '', shares: 2e6 + seed * 500, changeShares: 0, changePercent: 0, filingDate: '2025-03-31', action: 'increased' },
  ];

  const score = computeInstitutionalScore({ institutionalOwnershipPct: ownershipPct, hfNetShareChangePct: netChangePct, insiderNetBuyDollars90d: insiderNet, shortFloatPct: shortFloat });

  return {
    symbol,
    institutionalOwnershipPct: ownershipPct,
    hfNetShareChangePct:       netChangePct,
    topHolders:                holders,
    insiderNetBuyDollars90d:   insiderNet,
    shortFloatPct:             shortFloat,
    shortRatioDaysToCover:     shortFloat / 5,
    shortFloatChangePct:       (seed % 4) - 2,
    institutionalScore:        score,
  };
}
