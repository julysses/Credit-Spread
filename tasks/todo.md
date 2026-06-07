# Credit Spread Handoff Notes

Last updated: 2026-06-07

## Current State

- Branch: `claude/spx-signal-desk-oEOla`.
- Remote: `origin` -> `https://github.com/julysses/Credit-Spread.git`.
- Production: `https://credit-spread.vercel.app`.
- Last verified deployment commit: `b8dbf36 docs: record growth stats verification`.
- Vercel reported deployment success for that commit.
- Working tree was clean after the last push.

## What Was Added

- Defense dashboard:
  - New Defense tab components for hedge status, move log, decision tree, recovery playbook, PnL monitor, position sizing, and regime classification.
  - API routes: `/api/defense/status`, `/api/defense/events`, `/api/defense/tree`.
- Options and 0DTE expansion:
  - New options regime, strategies, trade-plan, 0DTE regime, 0DTE suggestions, and 0DTE trades routes.
  - Added 0DTE library/performance UI and richer options trade cards.
  - Added migration `database/migrations/0002_zero_dte_trades.sql`.
- Stock day-trading and swing modules:
  - New stock scanner, daytrade, swing watchlist, and stock trade-plan UI.
  - API routes: `/api/stocks/scan`, `/api/stocks/regime`, `/api/stocks/swing`.
- Signal Stack and market data improvements:
  - Added market technicals, market inputs, SPX chart, directional bias bar, regime banner, and live-number/bar-gauge UI helpers.
  - Added Alpaca and technical-analysis server helpers.
- Growth & Momentum stock screener:
  - Merged `origin/claude/growth-stock-strategy-app-UmfxE`.
  - Added Growth tab UI, screener panels, dossier modal, score ring, signal badge, growth universe constants, growth models, and daily/labeling workers.
  - API routes: `/api/growth/screener`, `/api/growth/flow`, `/api/growth/dossier/[ticker]`, `/api/growth/training-data`.
  - Server helpers for fundamentals, institutional data, options flow, sector data, and intelligence dossiers.

## Fixes Applied

- Build stabilization commit: `d3a5cde fix: stabilize growth feature build`.
  - Fixed Drizzle timestamp comparisons/inserts to use `Date` values.
  - Replaced direct `Set`/`Map` iterator usage with `Array.from(...)` for this repo's TypeScript target.
  - Corrected Axios helper generics to return `response.data`.
  - Fixed worker numeric conversion for return labeling.
  - Added `.vercel` to `.gitignore`.
- Growth dossier stats commit: `995e975 fix: populate growth dossier stats`.
  - Root cause: modal expected flat DB keys like `valuationData`, but API/mock dossier returned layered keys like `layer2_valuation`.
  - Fixed `components/dashboard/growth/StockDossierModal.tsx` to support both shapes:
    - `fundamentalsData` or `layer1_fundamentals`
    - `valuationData` or `layer2_valuation`
    - `newsData` or `layer3_news`
    - `institutionalData` or `layer4_institutional`
    - `optionsData` or `layer5_options`
    - `technicalsData` or `layer6_technicals`
    - `sectorData` or `layer7_sector`
    - flat AI fields or `layer8_aiMemo`
  - Result: Growth dossier cards should populate values instead of `--`.

## Verification Completed

- `npm run build` passes.
- Local production checks returned `200 OK` for:
  - `/api/growth/screener`
  - `/api/growth/flow`
  - `/api/growth/dossier/NVDA`
  - `/api/options/regime`
  - `/api/stocks/scan`
  - `/api/defense/status`
  - `/api/zero-dte-regime`
  - `/api/market`
  - `/api/signal-stack/market-inputs`
  - `/api/zero-dte-suggestions`
- Hosted production checks returned `200 OK` for:
  - `https://credit-spread.vercel.app`
  - `https://credit-spread.vercel.app/api/market`
  - `https://credit-spread.vercel.app/api/growth/screener`
  - `https://credit-spread.vercel.app/api/growth/dossier/NVDA`
- Vercel deployment statuses were checked through GitHub commit statuses and completed successfully.

## Known Constraints

- gstack `/browse` could not be used because the local resolver reports `browse binary not found`; direct HTTP checks were used instead.
- Some API routes intentionally return mock/fallback data when production secrets or database rows are unavailable.
- Static generation logs DNS failures for Yahoo Finance in sandboxed builds, then falls back without crashing.
- The Growth dossier modal now supports both old DB-backed flat records and new layered API/mock records.

## Where We Left Off

- The requested stats-population bug is fixed, built, pushed, and deployed.
- Production should now show NVDA dossier stat cards with values like:
  - P/E Ratio `38.0`
  - Forward P/E `28.0`
  - P/S Ratio `8.0`
  - EV/EBITDA `32.0`
  - Analyst Target `$320`
  - Implied Upside `22.0%`
- Next useful check: open `https://credit-spread.vercel.app` on mobile, open the Growth tab, tap NVDA, and visually confirm every dossier tab has populated stats.
- If continuing development, start by running:
  - `git pull --ff-only`
  - `git status --short --branch`
  - `npm run build`
