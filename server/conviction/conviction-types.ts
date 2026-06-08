export interface ConvictionPick {
  ticker: string;
  companyName: string;
  sector?: string;
  rank: number;
  convictionScore: number;
  classification: 'Elite Conviction' | 'High Conviction' | 'Watchlist' | 'Interesting' | 'Low Priority';
  timeHorizon: string;
  signalBreakdown: {
    fundamentals: number;
    sec: number;
    politician: number;
    news: number;
    technical: number;
    institutional: number;
  };
  bullCase: string[];
  bearCase: string[];
  catalysts: string[];
  risks: string[];
  sourceSummary: {
    latestSecFiling?: string;
    latestPoliticianTrade?: string;
    dataFreshness: string;
  };
  raw?: Record<string, unknown>;
}
