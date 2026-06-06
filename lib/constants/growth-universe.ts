/**
 * Growth & Momentum Stock Universe
 * 300+ tickers organized by sector for daily screening.
 * Covers S&P 500 growth leaders, Nasdaq 100, and high-growth mid-caps.
 */

export interface SectorGroup {
  sector: string;
  etf: string; // sector ETF for rotation analysis
  symbols: string[];
}

export const GROWTH_SECTORS: SectorGroup[] = [
  {
    sector: 'Technology',
    etf: 'XLK',
    symbols: [
      'AAPL','MSFT','NVDA','AMD','AVGO','QCOM','MU','AMAT','LRCX','KLAC',
      'INTC','TXN','ADI','MCHP','SWKS','QRVO','NXPI','ON','MRVL','SMCI',
      'PLTR','SNOW','DDOG','NET','CRWD','PANW','FTNT','OKTA','ZS','CYBR',
      'NOW','CRM','ADBE','ORCL','INTU','WDAY','TEAM','MDB','CFLT','GTLB',
      'SHOP','UBER','ABNB','DASH','LYFT','RBLX','U','PINS','SNAP',
    ],
  },
  {
    sector: 'Semiconductors',
    etf: 'SMH',
    symbols: [
      'NVDA','AMD','AVGO','QCOM','INTC','MU','AMAT','LRCX','KLAC','ASML',
      'TSM','SMCI','MRVL','ON','NXPI','ADI','TXN','MCHP','SWKS','QRVO',
      'ARM','WOLF','ALGM','AMBA','SLAB',
    ],
  },
  {
    sector: 'Communication Services',
    etf: 'XLC',
    symbols: [
      'META','GOOGL','NFLX','SNAP','PINS','RBLX','TTWO','EA','MTCH',
      'PARA','WBD','DIS','CHTR','TMUS','T','VZ',
    ],
  },
  {
    sector: 'Consumer Discretionary',
    etf: 'XLY',
    symbols: [
      'AMZN','TSLA','HD','MCD','NKE','SBUX','TJX','BKNG','LOW','ROST',
      'LULU','ULTA','DECK','TPR','RL','PVH','VFC','WHR','ETSY','W',
      'ABNB','DASH','LYFT','CVNA','KMX',
    ],
  },
  {
    sector: 'Healthcare',
    etf: 'XLV',
    symbols: [
      'LLY','UNH','JNJ','ABBV','MRK','PFE','AMGN','GILD','REGN','VRTX',
      'BIIB','BMY','MDT','ABT','BSX','SYK','ISRG','ZBH','EW','ALGN',
      'DXCM','PODD','TNDM','INMD','RXRX','NVAX','MRNA',
    ],
  },
  {
    sector: 'Financials',
    etf: 'XLF',
    symbols: [
      'JPM','BAC','WFC','GS','MS','BLK','SCHW','COF','AXP','V','MA',
      'PYPL','SQ','SOFI','NU','AFRM','LC','UPST',
    ],
  },
  {
    sector: 'Energy',
    etf: 'XLE',
    symbols: [
      'XOM','CVX','COP','EOG','PXD','SLB','HAL','BKR','MPC','VLO',
      'PSX','DVN','FANG','OXY','HES',
    ],
  },
  {
    sector: 'Industrials',
    etf: 'XLI',
    symbols: [
      'CAT','DE','HON','GE','RTX','LMT','BA','NOC','GD','TDG',
      'AXON','LDOS','CACI','SAIC','KTOS','HII','MOOG',
      'UBER','DASH','LYFT','GRAB','CPRT','ODFL','SAIA','XPO','JBHT',
    ],
  },
  {
    sector: 'Consumer Staples',
    etf: 'XLP',
    symbols: [
      'WMT','COST','PG','KO','PEP','PM','MO','MDLZ','GIS','CPB',
      'HSY','KHC','STZ','EL','COTY',
    ],
  },
  {
    sector: 'Real Estate & REITs',
    etf: 'XLRE',
    symbols: [
      'AMT','PLD','EQIX','CCI','DLR','SPG','O','PSA','EXR','AVB',
      'EQR','VTR','WELL','ARE','SBAC',
    ],
  },
  {
    sector: 'AI & Cloud',
    etf: 'QQQ',
    symbols: [
      'NVDA','MSFT','META','GOOGL','AMZN','ORCL','CRM','NOW','SNOW',
      'DDOG','CFLT','MDB','NET','PLTR','AI','BBAI','SOUN','TOST','IONQ',
      'ARWR','RXRX','SDGR','CERT','NTRA',
    ],
  },
  {
    sector: 'High-Growth Mid-Cap',
    etf: 'IWM',
    symbols: [
      'CELH','MNST','DUOL','GLBE','BILL','TTD','PUBM','MGNI','IAS',
      'BRZE','ASAN','CWAN','WEAV','PAYC','FOUR','GXO','XPO','SAIA','KNSL',
      'INSP','TMDX','ITRI','ACLS','AEHR','FORM','RMBS','IMOS',
      'APP','RDDT','IOT','RXRX','SDGR','NTRA','VEEV','HIMS','WW',
    ],
  },
];

// Flat list of all unique symbols
export const ALL_GROWTH_SYMBOLS: string[] = [
  ...new Set(GROWTH_SECTORS.flatMap(s => s.symbols)),
];

// Sector ETFs used for rotation analysis
export const SECTOR_ETFS: string[] = [
  ...new Set(GROWTH_SECTORS.map(s => s.etf)),
  'SPY','QQQ','IWM', // benchmark ETFs
];

// Map symbol → sector for enrichment
export const SYMBOL_SECTOR_MAP: Record<string, string> = Object.fromEntries(
  GROWTH_SECTORS.flatMap(sg =>
    sg.symbols.map(sym => [sym, sg.sector])
  )
);

// Map symbol → sector ETF
export const SYMBOL_ETF_MAP: Record<string, string> = Object.fromEntries(
  GROWTH_SECTORS.flatMap(sg =>
    sg.symbols.map(sym => [sym, sg.etf])
  )
);
