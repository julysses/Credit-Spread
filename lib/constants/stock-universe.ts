/** Shared stock/ETF universe constants used by both scan and swing routes. */

/** Symbols that Alpaca cannot serve (indices) — always use Yahoo Finance */
export const YAHOO_ONLY_SYMBOLS = new Set(['SPX']);

/** Yahoo Finance ticker overrides for non-standard symbols */
export const YAHOO_SYMBOL_MAP: Record<string, string> = { 'SPX': '^GSPC' };
