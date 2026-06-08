const SEC_HEADERS = {
  'User-Agent': process.env.SEC_USER_AGENT ?? 'SPX Signal Desk julio@example.com',
  Accept: 'application/json',
};

export interface SecCompanyMapEntry {
  cik: string;
  ticker: string;
  title: string;
}

export interface SecRecentFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;
  primaryDocument?: string;
  description?: string;
  documentUrl?: string;
}

export interface SecCompanyProfile {
  cik: string;
  ticker: string;
  companyName: string;
  sic?: string;
  sicDescription?: string;
  recentFilings: SecRecentFiling[];
}

export interface SecCompanyFact {
  name: string;
  label?: string;
  description?: string;
  unit: string;
  value: number;
  fy?: number;
  fp?: string;
  filed?: string;
  form?: string;
}

let companyMapCache: { loadedAt: number; byTicker: Map<string, SecCompanyMapEntry> } | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

async function secGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: SEC_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`SEC request failed ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function getSecCompanyMap(): Promise<Map<string, SecCompanyMapEntry>> {
  if (companyMapCache && Date.now() - companyMapCache.loadedAt < CACHE_MS) return companyMapCache.byTicker;

  const raw = await secGet<Record<string, { cik_str: number; ticker: string; title: string }>>('https://www.sec.gov/files/company_tickers.json');
  const byTicker = new Map<string, SecCompanyMapEntry>();
  for (const item of Object.values(raw)) {
    byTicker.set(item.ticker.toUpperCase(), {
      cik: String(item.cik_str).padStart(10, '0'),
      ticker: item.ticker.toUpperCase(),
      title: item.title,
    });
  }
  companyMapCache = { loadedAt: Date.now(), byTicker };
  return byTicker;
}

export async function getCikForTicker(ticker: string): Promise<SecCompanyMapEntry | null> {
  const map = await getSecCompanyMap();
  return map.get(ticker.toUpperCase()) ?? null;
}

export async function fetchSecCompanyProfile(ticker: string): Promise<SecCompanyProfile | null> {
  const entry = await getCikForTicker(ticker);
  if (!entry) return null;

  const data = await secGet<any>(`https://data.sec.gov/submissions/CIK${entry.cik}.json`);
  const recent = data?.filings?.recent ?? {};
  const forms: string[] = recent.form ?? [];
  const accessions: string[] = recent.accessionNumber ?? [];
  const filingDates: string[] = recent.filingDate ?? [];
  const reportDates: string[] = recent.reportDate ?? [];
  const docs: string[] = recent.primaryDocument ?? [];
  const descriptions: string[] = recent.primaryDocDescription ?? [];

  const recentFilings: SecRecentFiling[] = forms.slice(0, 80).map((form, i) => {
    const accessionNumber = accessions[i] ?? '';
    const accessionNoDash = accessionNumber.replace(/-/g, '');
    const primaryDocument = docs[i];
    return {
      accessionNumber,
      filingDate: filingDates[i] ?? '',
      reportDate: reportDates[i],
      form,
      primaryDocument,
      description: descriptions[i],
      documentUrl: primaryDocument ? `https://www.sec.gov/Archives/edgar/data/${Number(entry.cik)}/${accessionNoDash}/${primaryDocument}` : undefined,
    };
  });

  return {
    cik: entry.cik,
    ticker: entry.ticker,
    companyName: data.name ?? entry.title,
    sic: data.sic,
    sicDescription: data.sicDescription,
    recentFilings,
  };
}

export async function fetchSecCompanyFacts(ticker: string): Promise<SecCompanyFact[]> {
  const entry = await getCikForTicker(ticker);
  if (!entry) return [];

  const data = await secGet<any>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`);
  const usGaap = data?.facts?.['us-gaap'] ?? {};
  const keys = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'NetIncomeLoss', 'Assets', 'Liabilities', 'StockholdersEquity', 'OperatingIncomeLoss', 'EarningsPerShareDiluted'];

  const facts: SecCompanyFact[] = [];
  for (const key of keys) {
    const fact = usGaap[key];
    const units = fact?.units ?? {};
    const unit = Object.keys(units)[0];
    const entries = unit ? units[unit] ?? [] : [];
    const latest = entries.filter((e: any) => typeof e.val === 'number').sort((a: any, b: any) => String(b.filed).localeCompare(String(a.filed)))[0];
    if (latest) {
      facts.push({ name: key, label: fact.label, description: fact.description, unit, value: latest.val, fy: latest.fy, fp: latest.fp, filed: latest.filed, form: latest.form });
    }
  }
  return facts;
}

export function scoreSecSignals(profile: SecCompanyProfile | null, facts: SecCompanyFact[]): { score: number; catalysts: string[]; risks: string[] } {
  let score = 50;
  const catalysts: string[] = [];
  const risks: string[] = [];
  const recent = profile?.recentFilings ?? [];
  const within45 = (date?: string) => date ? Date.now() - new Date(date).getTime() <= 45 * 86400000 : false;

  if (recent.some(f => f.form === '8-K' && within45(f.filingDate))) { score += 10; catalysts.push('Recent 8-K material event filing'); }
  if (recent.some(f => f.form === '10-Q' && within45(f.filingDate))) { score += 6; catalysts.push('Fresh quarterly filing available'); }
  if (recent.some(f => f.form === '4' && within45(f.filingDate))) { score += 5; catalysts.push('Recent Form 4 insider activity'); }
  if (recent.some(f => ['S-3', '424B5', '424B2'].includes(f.form) && within45(f.filingDate))) { score -= 10; risks.push('Recent registration/prospectus filing may indicate dilution risk'); }

  const revenue = facts.find(f => f.name.includes('Revenue'));
  const netIncome = facts.find(f => f.name === 'NetIncomeLoss');
  if (revenue && revenue.value > 0) { score += 5; catalysts.push(`Latest SEC revenue fact filed ${revenue.filed}`); }
  if (netIncome && netIncome.value > 0) score += 4;
  if (netIncome && netIncome.value < 0) { score -= 5; risks.push('Latest SEC net income fact is negative'); }

  return { score: Math.max(0, Math.min(100, Math.round(score))), catalysts, risks };
}
