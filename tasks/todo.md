# Credit Spread App QA + Follow-up Fixes

## Completed
- [x] Review and implementation completed/pushed
- [x] Run local app QA/build smoke test
- [x] Fix remaining React hook lint warning
- [x] Run controlled dependency audit summary
- [x] Apply safe dependency upgrades
- [x] Re-run verification
- [x] Commit and push follow-up fixes

## Verification Results
- `git pull --ff-only`: passed, branch up to date before work.
- `npm run lint`: passed, no warnings or errors.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed on Next.js 14.2.35.
- Local start smoke test: passed, `GET /` returned HTTP 200.
- Mock strategy API smoke test: passed, `GET /api/strategy?mock=true` returned `success: true`, `dataQuality.confidence: mock`, and `decisionStatus: data_invalid`.

## Follow-up Fixes Applied
- Fixed React hook dependency warning in `components/dashboard/growth/StockDossierModal.tsx` by deriving `candidateSymbol` and using that stable dependency in the dossier fetch effect.
- Upgraded safe/non-major security-related dependencies:
  - `next` / `eslint-config-next`: `14.2.5` -> `14.2.35`
  - `axios`: `^1.7.3` -> `^1.17.0`
  - `@typescript-eslint/parser`: `^7.2.0` -> `^7.18.0`
  - `@typescript-eslint/eslint-plugin`: `^7.2.0` -> `^7.18.0`

## Dependency Audit Summary
- Before safe upgrades: 24 vulnerabilities total, including 1 critical.
- After safe upgrades: 16 vulnerabilities total, 0 critical, 8 moderate, 8 high.
- Remaining direct findings require larger compatibility work:
  - `drizzle-orm` high, fix requires semver-major upgrade to `0.45.2`.
  - `drizzle-kit` moderate, fix requires semver-major upgrade to `0.31.10`.
  - `@anthropic-ai/sdk` moderate, fix requires semver-major upgrade to `0.102.0`.
  - `next` / `eslint-config-next` audit still points to Next 16 for remaining high findings, which is a major framework upgrade and should be planned separately.

## Recommended Next Work
1. ~~Browser QA with screenshots on deployed preview or local dev.~~
2. ~~Open PR from `claude/spx-signal-desk-oEOla`.~~ (branch IS the default branch — N/A)
3. Plan Drizzle major upgrade and migration verification.
4. Plan Anthropic SDK major upgrade and API compatibility testing.
5. ~~Add real realized volatility source and option-chain liquidity filters.~~ ✅ Done (commit `3fd2f16`)

## Completed — 2026-06-07: Real RV + Liquidity Filters (commit `3fd2f16`)
- `server/market-data.ts`:
  - `fetchRealizedVol()`: Yahoo Finance 2-month daily history → 20-day annualized HV (stddev log returns × √252). Live build confirmed: **HV = 13.15%** at SPX 7383.
  - `filterLiquidChain()`: strips entries where both sides fail min OI (10), max bid-ask spread (30%), min mid ($0.05) — applied before volatility surface build.
  - `MarketDataSnapshot.realizedVol?: number` added.
- `app/api/strategy/route.ts`:
  - Replaced synthetic `IV × 0.85` fallback with `snapshot.realizedVol`; fallback preserved with warning if real data unavailable.
  - `checkStrikeLiquidity()`: post-selection spot-check of short/long strikes against live chain — appends OI/spread warnings to trade recommendation.
  - Chain liquidity label (`good` / `thin` / `missing`) surfaces in `dataQuality.warnings`.
  - `snapshot.realizedVol` exposed in API response.
