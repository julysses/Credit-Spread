# Credit Spread App Review + Revamp Implementation

## Current Request
- [x] Review and plan approved by user
- [x] Pull latest from GitHub before implementation
- [x] Implement Sprint 1 safety/mechanical fixes
  - [x] Configure non-interactive ESLint
  - [x] Add data-confidence metadata
  - [x] Make 0DTE Monte Carlo accept fractional DTE
  - [x] Fix open exposure to use max-loss exposure instead of credit received
  - [x] Store recommendation snapshot on trade log payload
- [x] Implement Sprint 2 strategy engine upgrades
  - [x] Add data-quality and IV/RV no-trade gates
  - [x] Replace rough strike placement with target-delta plus expected-move clearance
  - [x] Add credit/width quality checks
  - [x] Fix iron condor touch probability to combined two-sided touch risk
  - [x] Add generated exit plan
- [x] Implement Sprint 3 UI revamp
  - [x] Add decision-first badges: TRADE APPROVED / WATCH ONLY / DATA INVALID / NO TRADE
  - [x] Add data-confidence badges in header and trade card
  - [x] Replace Kelly headline metric with credit/width and breakeven
  - [x] Show probability of touch beside POP
  - [x] Add richer exit rules and invalidation text
- [x] Implement Sprint 4 audit/learning loop basics
  - [x] Add recommendation audit record builder
  - [x] Attach audit payload to strategy decision
  - [x] Send audit snapshot when logging trades
- [x] Run build/typecheck/lint
- [ ] Review diff, commit, push

## Verification Results
- `npm run build`: passed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed with one pre-existing warning in `components/dashboard/growth/StockDossierModal.tsx` about a missing React hook dependency

## Notes
- Added `@typescript-eslint/parser@7.2.0` and `@typescript-eslint/eslint-plugin@7.2.0` so existing `/* eslint-disable @typescript-eslint/no-explicit-any */` comments resolve under Next lint.
- `npm install` reported existing dependency vulnerabilities: 9 moderate, 14 high, 1 critical. Not fixed in this pass because forced audit fixes may introduce breaking upgrades.
- Codex CLI was not installed, so true external Codex review could not run locally.
