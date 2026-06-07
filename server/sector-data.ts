/**
 * Market-Wide Sector & Macro Data
 * FMP /stable/ endpoints — one call covers all sectors/markets
 * Falls back to mock data when FMP_API_KEY is not configured.
 */

import axios from 'axios';
import { fmpConfigured } from './fundamentals';

const FMP_STABLE = 'https://financialmodelingprep.com/stable';

function fmpStable<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  return axios.get<T>(`${FMP_STABLE}/${endpoint}`, {
    params: { ...params, apikey: process.env.FMP_API_KEY },
    timeout: 12000,
  }).then(r => r.data);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectorPerformance {
  sector: string;
  changesPercentage: number;
}

export interface SectorPE {
  sector: string;
  pe: number;
  date: string;
}

export interface Gainer {
  symbol: string;
  name: string;
  change: number;
  changesPercentage: number;
  price: number;
  volume: number;
}

export interface MostActive {
  symbol: string;
  name: string;
  change: number;
  changesPercentage: number;
  price: number;
  volume: number;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimated: number;
  revenueActual: number | null;
  revenueEstimated: number;
  updatedFromDate?: string;
  fiscalDateEnding?: string;
}

export interface MADeal {
  companyName: string;
  targetedCompanyName: string;
  transactionDate: string;
  acceptedDate: string;
  url: string;
}

export interface CongressTradeLatest {
  disclosureDate: string;
  transactionDate: string;
  name: string;
  asset: string;
  type: string;
  amount: string;
  chamber: 'senate' | 'house';
  symbol?: string;
}

export interface MarketContext {
  sectorPerformance: SectorPerformance[];
  sectorPE: SectorPE[];
  biggestGainers: Gainer[];
  mostActives: MostActive[];
  earningsCalendar: EarningsEvent[];
  maActivity: MADeal[];
  congressLatest: CongressTradeLatest[];
  fetchedAt: string;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchSectorPerformance(): Promise<SectorPerformance[]> {
  if (!fmpConfigured()) return getMockSectorPerformance();
  try {
    const data = await fmpStable<SectorPerformance[]>('sector-performance-snapshot');
    return Array.isArray(data) ? data : getMockSectorPerformance();
  } catch {
    return getMockSectorPerformance();
  }
}

export async function fetchSectorPE(): Promise<SectorPE[]> {
  if (!fmpConfigured()) return getMockSectorPE();
  try {
    const data = await fmpStable<SectorPE[]>('sector-pe-snapshot');
    return Array.isArray(data) ? data : getMockSectorPE();
  } catch {
    return getMockSectorPE();
  }
}

export async function fetchBiggestGainers(): Promise<Gainer[]> {
  if (!fmpConfigured()) return getMockGainers();
  try {
    const data = await fmpStable<Gainer[]>('biggest-gainers');
    return Array.isArray(data) ? data.slice(0, 20) : getMockGainers();
  } catch {
    return getMockGainers();
  }
}

export async function fetchMostActives(): Promise<MostActive[]> {
  if (!fmpConfigured()) return getMockActives();
  try {
    const data = await fmpStable<MostActive[]>('most-actives');
    return Array.isArray(data) ? data.slice(0, 20) : getMockActives();
  } catch {
    return getMockActives();
  }
}

export async function fetchEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]> {
  if (!fmpConfigured()) return getMockEarningsCalendar();
  try {
    const data = await fmpStable<EarningsEvent[]>('earnings-calendar', { from, to });
    return Array.isArray(data) ? data : getMockEarningsCalendar();
  } catch {
    return getMockEarningsCalendar();
  }
}

export async function fetchLatestMAActivity(): Promise<MADeal[]> {
  if (!fmpConfigured()) return [];
  try {
    const data = await fmpStable<MADeal[]>('mergers-acquisitions-latest');
    return Array.isArray(data) ? data.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export async function fetchCongressLatest(): Promise<CongressTradeLatest[]> {
  if (!fmpConfigured()) return [];
  try {
    const [senateData, houseData] = await Promise.allSettled([
      fmpStable<Record<string, unknown>[]>('senate-latest'),
      fmpStable<Record<string, unknown>[]>('house-latest'),
    ]);

    const trades: CongressTradeLatest[] = [];
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (senateData.status === 'fulfilled' && Array.isArray(senateData.value)) {
      for (const t of senateData.value) {
        if (String(t.transactionDate ?? '') >= cutoff) {
          trades.push({
            disclosureDate:  String(t.disclosureDate ?? ''),
            transactionDate: String(t.transactionDate ?? ''),
            name:            String(t.name ?? ''),
            asset:           String(t.asset ?? ''),
            type:            String(t.type ?? '').toLowerCase().includes('purchase') ? 'purchase' : 'sale',
            amount:          String(t.amount ?? ''),
            chamber:         'senate',
            symbol:          String(t.ticker ?? t.symbol ?? ''),
          });
        }
      }
    }

    if (houseData.status === 'fulfilled' && Array.isArray(houseData.value)) {
      for (const t of houseData.value) {
        if (String(t.transactionDate ?? '') >= cutoff) {
          trades.push({
            disclosureDate:  String(t.disclosureDate ?? ''),
            transactionDate: String(t.transactionDate ?? ''),
            name:            String(t.name ?? ''),
            asset:           String(t.asset ?? ''),
            type:            String(t.type ?? '').toLowerCase().includes('purchase') ? 'purchase' : 'sale',
            amount:          String(t.amount ?? ''),
            chamber:         'house',
            symbol:          String(t.ticker ?? t.symbol ?? ''),
          });
        }
      }
    }

    return trades.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  } catch {
    return [];
  }
}

export async function fetchMarketContext(): Promise<MarketContext> {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [sectorPerf, sectorPE, gainers, actives, earnings, ma, congress] = await Promise.allSettled([
    fetchSectorPerformance(),
    fetchSectorPE(),
    fetchBiggestGainers(),
    fetchMostActives(),
    fetchEarningsCalendar(today, sevenDaysOut),
    fetchLatestMAActivity(),
    fetchCongressLatest(),
  ]);

  return {
    sectorPerformance: sectorPerf.status === 'fulfilled' ? sectorPerf.value : getMockSectorPerformance(),
    sectorPE:          sectorPE.status === 'fulfilled' ? sectorPE.value : getMockSectorPE(),
    biggestGainers:    gainers.status === 'fulfilled' ? gainers.value : getMockGainers(),
    mostActives:       actives.status === 'fulfilled' ? actives.value : getMockActives(),
    earningsCalendar:  earnings.status === 'fulfilled' ? earnings.value : getMockEarningsCalendar(),
    maActivity:        ma.status === 'fulfilled' ? ma.value : [],
    congressLatest:    congress.status === 'fulfilled' ? congress.value : [],
    fetchedAt:         new Date().toISOString(),
  };
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

function getMockSectorPerformance(): SectorPerformance[] {
  return [
    { sector: 'Technology',                changesPercentage:  1.42 },
    { sector: 'Healthcare',                changesPercentage:  0.87 },
    { sector: 'Communication Services',    changesPercentage:  0.63 },
    { sector: 'Consumer Discretionary',    changesPercentage:  0.31 },
    { sector: 'Industrials',               changesPercentage:  0.15 },
    { sector: 'Financials',                changesPercentage: -0.12 },
    { sector: 'Consumer Staples',          changesPercentage: -0.28 },
    { sector: 'Energy',                    changesPercentage: -0.54 },
    { sector: 'Materials',                 changesPercentage: -0.61 },
    { sector: 'Utilities',                 changesPercentage: -0.74 },
    { sector: 'Real Estate',               changesPercentage: -0.89 },
  ];
}

function getMockSectorPE(): SectorPE[] {
  const date = new Date().toISOString().split('T')[0];
  return [
    { sector: 'Technology',             pe: 32.5, date },
    { sector: 'Healthcare',             pe: 22.1, date },
    { sector: 'Communication Services', pe: 27.3, date },
    { sector: 'Consumer Discretionary', pe: 28.7, date },
    { sector: 'Industrials',            pe: 21.4, date },
    { sector: 'Financials',             pe: 14.8, date },
    { sector: 'Consumer Staples',       pe: 19.6, date },
    { sector: 'Energy',                 pe: 11.2, date },
    { sector: 'Materials',              pe: 16.8, date },
    { sector: 'Utilities',              pe: 18.3, date },
    { sector: 'Real Estate',            pe: 24.1, date },
  ];
}

function getMockGainers(): Gainer[] {
  return [
    { symbol: 'NVDA', name: 'NVIDIA Corp',         change: 5.1,  changesPercentage: 3.9,  price: 134,  volume: 45e6 },
    { symbol: 'CRWD', name: 'CrowdStrike',          change: 8.7,  changesPercentage: 3.8,  price: 380,  volume: 8e6  },
    { symbol: 'DDOG', name: 'Datadog',              change: 6.4,  changesPercentage: 3.1,  price: 195,  volume: 5e6  },
    { symbol: 'AXON', name: 'Axon Enterprise',      change: 9.2,  changesPercentage: 3.5,  price: 310,  volume: 3e6  },
    { symbol: 'TTD',  name: 'Trade Desk',           change: 5.8,  changesPercentage: 2.9,  price: 220,  volume: 6e6  },
  ];
}

function getMockActives(): MostActive[] {
  return [
    { symbol: 'AAPL',  name: 'Apple Inc',           change:  2.1, changesPercentage: 1.1,  price: 213, volume: 85e6 },
    { symbol: 'TSLA',  name: 'Tesla Inc',            change: -3.4, changesPercentage: -1.5, price: 255, volume: 78e6 },
    { symbol: 'NVDA',  name: 'NVIDIA Corp',          change: 5.1,  changesPercentage: 3.9,  price: 134, volume: 45e6 },
    { symbol: 'AMZN',  name: 'Amazon',               change:  4.5, changesPercentage: 2.3,  price: 195, volume: 38e6 },
    { symbol: 'MSFT',  name: 'Microsoft',            change:  1.8, changesPercentage: 0.4,  price: 435, volume: 25e6 },
  ];
}

function getMockEarningsCalendar(): EarningsEvent[] {
  const base = Date.now();
  return [
    { symbol: 'AAPL', date: new Date(base + 3 * 86400000).toISOString().split('T')[0],  epsActual: null, epsEstimated: 1.55, revenueActual: null, revenueEstimated: 94e9  },
    { symbol: 'MSFT', date: new Date(base + 5 * 86400000).toISOString().split('T')[0],  epsActual: null, epsEstimated: 2.91, revenueActual: null, revenueEstimated: 64e9  },
    { symbol: 'NVDA', date: new Date(base + 12 * 86400000).toISOString().split('T')[0], epsActual: null, epsEstimated: 5.58, revenueActual: null, revenueEstimated: 24e9  },
    { symbol: 'GOOGL', date: new Date(base + 8 * 86400000).toISOString().split('T')[0], epsActual: null, epsEstimated: 1.88, revenueActual: null, revenueEstimated: 86e9  },
  ];
}
