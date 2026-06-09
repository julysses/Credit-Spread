/**
 * Market-Wide Sector & Macro Data
 * FMP /stable/ endpoints — one call covers all sectors/markets
 * Returns empty data when FMP_API_KEY is not configured.
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
  if (!fmpConfigured()) return getUnavailableSectorPerformance();
  try {
    const data = await fmpStable<SectorPerformance[]>('sector-performance-snapshot');
    return Array.isArray(data) ? data : getUnavailableSectorPerformance();
  } catch {
    return getUnavailableSectorPerformance();
  }
}

export async function fetchSectorPE(): Promise<SectorPE[]> {
  if (!fmpConfigured()) return getUnavailableSectorPE();
  try {
    const data = await fmpStable<SectorPE[]>('sector-pe-snapshot');
    return Array.isArray(data) ? data : getUnavailableSectorPE();
  } catch {
    return getUnavailableSectorPE();
  }
}

export async function fetchBiggestGainers(): Promise<Gainer[]> {
  if (!fmpConfigured()) return getUnavailableGainers();
  try {
    const data = await fmpStable<Gainer[]>('biggest-gainers');
    return Array.isArray(data) ? data.slice(0, 20) : getUnavailableGainers();
  } catch {
    return getUnavailableGainers();
  }
}

export async function fetchMostActives(): Promise<MostActive[]> {
  if (!fmpConfigured()) return getUnavailableActives();
  try {
    const data = await fmpStable<MostActive[]>('most-actives');
    return Array.isArray(data) ? data.slice(0, 20) : getUnavailableActives();
  } catch {
    return getUnavailableActives();
  }
}

export async function fetchEarningsCalendar(from: string, to: string): Promise<EarningsEvent[]> {
  if (!fmpConfigured()) return getUnavailableEarningsCalendar();
  try {
    const data = await fmpStable<EarningsEvent[]>('earnings-calendar', { from, to });
    return Array.isArray(data) ? data : getUnavailableEarningsCalendar();
  } catch {
    return getUnavailableEarningsCalendar();
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
    sectorPerformance: sectorPerf.status === 'fulfilled' ? sectorPerf.value : getUnavailableSectorPerformance(),
    sectorPE:          sectorPE.status === 'fulfilled' ? sectorPE.value : getUnavailableSectorPE(),
    biggestGainers:    gainers.status === 'fulfilled' ? gainers.value : getUnavailableGainers(),
    mostActives:       actives.status === 'fulfilled' ? actives.value : getUnavailableActives(),
    earningsCalendar:  earnings.status === 'fulfilled' ? earnings.value : getUnavailableEarningsCalendar(),
    maActivity:        ma.status === 'fulfilled' ? ma.value : [],
    congressLatest:    congress.status === 'fulfilled' ? congress.value : [],
    fetchedAt:         new Date().toISOString(),
  };
}

// ─── Unavailable Data ────────────────────────────────────────────────────────────────

function getUnavailableSectorPerformance(): SectorPerformance[] {
  return [];
}

function getUnavailableSectorPE(): SectorPE[] {
  return [];
}

function getUnavailableGainers(): Gainer[] {
  return [];
}

function getUnavailableActives(): MostActive[] {
  return [];
}

function getUnavailableEarningsCalendar(): EarningsEvent[] {
  return [];
}
