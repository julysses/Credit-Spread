# Free Live Data Migration Plan — Alpaca + Yahoo + Existing Free APIs

## 2026-06-09 Stock Card Live Data / Branch Operational Review

### Objective
Make the Growth stock cards show live provider-backed prices instead of stale scan/mock prices, confirm the stock-card pricing branch is represented safely, and verify the app can build and serve the relevant APIs.

### Checklist
- [x] Pull latest remote updates before editing.
- [x] Review remote branches and identify stock-card pricing work.
- [x] Confirm `/api/growth/screener` no longer returns mock candidates on DB errors.
- [x] Confirm current API enriches persisted scan rows with live Alpaca/Yahoo quote data.
- [x] Update remaining Growth stock card panels to render `currentPrice`/provider status instead of raw persisted `price`.
- [x] Verify production API response source/status for Growth screener.
- [x] Run local type/build verification.
- [ ] Review diff for only relevant changes.
- [ ] Commit and push completed update.

### Verification Notes
- Production `https://credit-spread.vercel.app/api/growth/screener` still returns `_mock: true` and stale NVDA/CRWD prices as of 2026-06-09 17:24 UTC.
- Local build passes with the live-data code path and no Growth screener mock fallback.
- `rg "getMock|_mock|mock data|hardcoded fallback|demo position|missing fallback|silently fall back" app components server lib workers -n` returns no matches.
- Build emitted expected network lookup warnings during static generation in the sandbox because external Yahoo access is restricted locally.

### Branch Review Notes
- `origin/claude/stock-card-pricing-fix-jy3bjz` contains the targeted pricing fix branch.
- `origin/claude/dashboards-vercel-deploy-axsrs4` already contains that branch via merge commit `175303d`.
- The current branch `claude/spx-signal-desk-oEOla` does not contain that merge commit, but the working tree already has a stricter version of the screener route that removes the mock fallback entirely and enriches database candidates with live quotes.
- Do not blindly merge the old pricing branch because its route still includes a last-resort mock candidate fallback.
- Remaining unmerged remote branches were reviewed with `git log --cherry-pick --right-only HEAD...branch`; several are older feature branches with unique commits, but merging them directly would risk reintroducing stale/mock fallbacks or unrelated dashboard scope. The operational fix is to push the current integrated branch after verification.

## Objective
Migrate the Credit Spread app away from paid/fragile SPX MarketData dependency for tradeable recommendations by adding a free-data mode built on:

- Alpaca for SPY/equity quotes and historical bars.
- Yahoo Finance unofficial endpoints for SPY option chains, SPX/VIX reference quotes, and SPY option expirations.
- Alpha Vantage as backup for quotes/news/technicals where useful.
- GNews for news/macro.
- FMP for fundamentals/growth data, already supplied by user.
- Database for persisted trades, growth scans, signal snapshots, journals, and defense positions.

Core product rule:

- SPX mode remains preferred when a working SPX options provider exists.
- SPY mode becomes the free live-tradeable fallback.
- If neither SPX nor SPY option chain is available, the app returns `NO_TRADE` / `DATA_UNAVAILABLE`.

---

## Current Confirmation

### Alpaca variables
Confirmed from the codebase and user-provided Vercel screenshot/context:

- [x] `ALPACA_API_KEY` is the correct app variable name.
- [x] `ALPACA_API_SECRET` is the correct app variable name.
- [x] The screenshot showed both `ALPACA_API_KEY` and `ALPACA_API_SECRET` set in Vercel.
- [x] Local `.env.local` does not contain Alpaca keys, but Vercel production environment does.

### Code references
Current code expects:

- `server/alpaca.ts`
  - `process.env.ALPACA_API_KEY`
  - `process.env.ALPACA_API_SECRET`
- `workers/daily-growth-screener.ts`
  - now uses `ALPACA_API_KEY`
  - now uses `ALPACA_API_SECRET`, with compatibility fallback for old `ALPACA_SECRET_KEY`
- `workers/label-returns.ts`
  - still references `ALPACA_SECRET_KEY`; needs update to `ALPACA_API_SECRET` with backward compatibility.

---

## Free Provider Coverage Matrix

| Data Need | Free Provider | Use In App | Tradeable? | Notes |
|---|---|---|---:|---|
| SPY quote | Alpaca | primary tradeable quote | Yes | Already wired through `server/alpaca.ts` |
| SPY daily/intraday bars | Alpaca | realized vol, trend, scanner | Yes | Free IEX feed acceptable for app mode |
| SPY option chain | Yahoo Finance unofficial | free tradeable fallback pricing | Caution | Delayed/unofficial. Must label source and timestamp |
| SPY option expirations | Yahoo Finance unofficial | expiry selection | Caution | Needed before chain fetch |
| SPX quote | Yahoo Finance `^GSPC` | regime/reference | No by itself | Context only unless SPX chain exists |
| VIX quote | Yahoo Finance `^VIX` | vol regime | No by itself | Context only |
| SPX option chain | none free reliable | preferred pro mode only if paid provider works | No | Keep blocked if MarketData fails |
| News/macro | GNews, Alpha Vantage | risk/briefing | Support only | No fake news fallback |
| Fundamentals/growth | FMP | growth scanner | Yes for analytics | User says FMP supplied |
| Persistence | Postgres/Supabase URL | trades/scans/journal | Yes | Required for defense and historical state |

---

## Product Modes

### Mode 1 — SPX Pro Mode
Use when a paid/reliable SPX option chain provider is working.

- Underlying: SPX
- Chain: SPX options
- Quote: SPX / VIX live or delayed accepted source
- Tax label: Section 1256 likely applies
- Assignment label: cash-settled, European-style
- Status: preferred

### Mode 2 — SPY Free Live Mode
Use when SPX option chain is unavailable but Alpaca SPY quote and Yahoo SPY chain are available.

- Signal context: SPX + VIX from Yahoo/Alpha where available
- Trade underlying: SPY
- Chain: Yahoo SPY options
- Quote: Alpaca SPY
- Tax label: regular equity option treatment, not Section 1256
- Assignment label: American-style, physical-settled, assignment risk exists
- Status: free tradeable fallback with warnings

### Mode 3 — Analytics Only / No Trade
Use when SPY chain or SPY quote is missing.

- No spread recommendation
- Show market context only
- Return `NO_TRADE` with missing source diagnostics

---

## Implementation Plan

### Phase 1 — Normalize provider/env handling
- [ ] Update `workers/label-returns.ts` to use `ALPACA_API_SECRET`, with fallback to `ALPACA_SECRET_KEY` for compatibility.
- [ ] Add env diagnostic checks for:
  - [ ] `ALPACA_API_KEY`
  - [ ] `ALPACA_API_SECRET`
  - [ ] `GNEWS_API_KEY`
  - [ ] `ALPHA_VANTAGE_API_KEY`
  - [ ] `FMP_API_KEY`
  - [ ] `DATABASE_URL`
- [ ] Update `/api/debug` to report provider availability without exposing secrets.
- [ ] Add explicit `providerMode` field to relevant API responses:
  - `spx_pro`
  - `spy_free`
  - `analytics_only`

### Phase 2 — Add Yahoo Finance SPY options adapter
Create a new server adapter, likely:

- [ ] `server/yahoo-options.ts`

Required functions:

- [ ] `fetchYahooOptionExpirations(symbol: 'SPY')`
- [ ] `fetchYahooOptionChain(symbol: 'SPY', expiration: number | string)`
- [ ] Normalize Yahoo calls/puts into existing `OptionChainEntry` shape.
- [ ] Include source metadata:
  - provider: `Yahoo Finance`
  - delayed/unofficial flag
  - fetchedAt
  - underlying
  - expiration
  - raw contract count
- [ ] Add failure behavior:
  - no generated fallback chain
  - return empty/unavailable diagnostics

### Phase 3 — Add free market snapshot mode
Update:

- [ ] `server/market-data.ts`

New behavior:

- [ ] Try SPX Pro Mode first if `MARKETDATA_API_KEY` works and SPX option chain exists.
- [ ] If SPX chain missing/failing, try SPY Free Mode:
  - Alpaca SPY quote required
  - Yahoo SPY option chain required
  - Yahoo SPX/VIX context optional but labeled
- [ ] Return source metadata:
  - `underlyingMode: 'SPX' | 'SPY'`
  - `providerMode: 'spx_pro' | 'spy_free' | 'analytics_only'`
  - `tradeable: boolean`
  - `assignmentRisk: boolean`
  - `taxTreatment: 'section_1256' | 'equity_option' | 'unknown'`
- [ ] Never infer option prices from Black-Scholes for tradeable output.
- [ ] Never use hardcoded SPX/VIX/SPY defaults.

### Phase 4 — Strategy engine instrument awareness
Update:

- [ ] `lib/models/strategy-engine.ts`
- [ ] `app/api/strategy/route.ts`
- [ ] `app/api/strategies/route.ts`
- [ ] `app/api/briefing/route.ts`

Required changes:

- [ ] Add `tradeInstrument: 'SPX' | 'SPY' | null` to strategy output.
- [ ] If SPY mode, calculate strikes from actual SPY chain, not `SPX / 10` approximation.
- [ ] Use SPY option bid/ask for credit.
- [ ] Scale spread widths appropriately for SPY.
- [ ] Add SPY-specific risk warnings:
  - [ ] not Section 1256
  - [ ] American-style assignment risk
  - [ ] physical settlement
  - [ ] close before expiration
- [ ] Continue using SPX/VIX as signal context where useful.
- [ ] If no chain, keep hard block.

### Phase 5 — Trade card and UI labeling
Update:

- [ ] `components/dashboard/TradeCard.tsx`
- [ ] `components/dashboard/MarketHeader.tsx`
- [ ] relevant strategy/briefing panels

UI requirements:

- [ ] Show current mode:
  - `SPX Pro`
  - `SPY Free Live`
  - `Analytics Only`
- [ ] Show option chain source:
  - `MarketData SPX chain`
  - `Yahoo SPY chain, delayed/unofficial`
- [ ] If SPY mode, show visible disclosure:
  - `SPY fallback: equity option tax treatment, assignment risk, close before expiry.`
- [ ] Do not show `LIVE` badge unless provider mode is tradeable and source checks pass.
- [ ] Show `NO TRADE` if chain unavailable.

### Phase 6 — Defense/positions support SPY vs SPX
Update:

- [ ] `app/api/defense/status/route.ts`
- [ ] trade schema usage / trade creation paths if needed

Requirements:

- [ ] Store or infer `underlyingSymbol` for each trade: `SPX` or `SPY`.
- [ ] For SPY trades, defense logic must account for assignment risk.
- [ ] For SPX trades, keep cash-settlement assumptions.
- [ ] If current position lacks `underlyingSymbol`, infer from strategy/trade type or default to existing SPX only after user review.

### Phase 7 — Workers and scanner alignment
Update:

- [ ] `workers/market-scanner.ts`
- [ ] `workers/morning-briefing.ts`
- [ ] `workers/daily-growth-screener.ts`
- [ ] `workers/label-returns.ts`

Requirements:

- [ ] Market scanner can generate alerts in SPY Free Mode if SPY chain passes checks.
- [ ] Morning briefing clearly says whether setup is SPX Pro, SPY Free, or analytics only.
- [ ] Growth scanner uses Alpaca/FMP only, no generated bars.
- [ ] Label-return worker uses Alpaca env names correctly.

### Phase 8 — Verification

Static checks:

- [ ] `grep`/scan for production mock fallback terms:
  - `getMock`
  - `_mock`
  - `mock data`
  - `hardcoded fallback`
  - `demo position`
  - `missing fallback`
  - `silently fall back`

Build checks:

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`

Runtime API checks:

- [ ] `/api/debug`
  - Alpaca present/working
  - Yahoo SPY chain reachable
  - FMP present/working
  - DB present/working
- [ ] `/api/market`
  - returns `providerMode`
  - returns `tradeable`
  - no fake data
- [ ] `/api/strategy`
  - if MarketData fails but Yahoo SPY chain works, returns SPY Free Mode tradeable setup
  - if Yahoo SPY chain fails, returns `NO_TRADE`
- [ ] `/api/briefing`
  - mode and source labels correct
- [ ] main deployed app
  - no console errors
  - no failed critical requests
  - visible mode/source labels

---

## Acceptance Criteria
- [ ] Alpaca is the primary free source for SPY quotes/bars.
- [ ] Yahoo is the free source for SPY option chain.
- [ ] SPX option chain remains blocked unless paid provider works.
- [ ] Strategy can produce tradeable SPY spreads when SPX options provider fails.
- [ ] Strategy never produces a tradeable setup without a real option chain.
- [ ] SPY mode is visibly labeled with tax/assignment tradeoffs.
- [ ] All tests/build checks pass.
- [ ] Production deploy smoke tests confirm correct provider mode.

---

## Recommendation
Implement SPY Free Mode as the practical free fallback:

1. Keep SPX/VIX as the signal/regime layer.
2. Use Alpaca SPY quote and Yahoo SPY option chain for actual spread pricing.
3. Label SPY-specific risks clearly.
4. Keep SPX Pro Mode available for the future if MarketData/Tradier/Polygon/ThetaData is added.
