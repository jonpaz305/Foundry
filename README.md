# Foundry

BRRRR + Fix-and-Flip underwriting platform. Third app in the ASJP suite (Cadence → Tranche → Foundry). Built to replace the `ASJP Analysis Template - Bridge Value Add` and `ASJP Analysis Template - Fix and Flip` spreadsheets with a web app that produces institutional-grade output for lenders, equity partners, and IC.

## Architecture

Same modular pattern as Cadence and Tranche. Single-page app, no build step.

| File | Purpose |
|---|---|
| `index.html`              | App shell, all section markup, mode-aware nav, modals |
| `styles.css`              | Design tokens inherited from Tranche, Foundry-specific UI (mode toggle, deal mode badges, KPI cards, comp grid) |
| `logos.js`                | Foundry brand marks — transformation rectangles (raw → refined, gold-accented upper rect) |
| `core.js`                 | Supabase init, auth, deal CRUD, autosave, dual-mode state model, mode toggle |
| `shell-ui.js`             | Sidebar deal list, dashboard with mode-aware KPI tiles, company picker, section switcher |
| `data-entry.js`           | Deal Setup form, Unit Mix (BRRRR), Comps (F&F), Operating Assumptions (BRRRR), Capital Structure (both modes) |
| `seed-regression.js`      | One-click seed of the two canonical regression deals |
| `supabase-schema.sql`     | Schema setup — companies, deals, census cache, HUD FMR cache |
| `engine.js`               | *(M2 BRRRR / M3 F&F)* Engine math |
| `market.js`               | *(M4)* Census ACS + HUD FMR API integration |
| `risk.js`                 | *(M5)* Risk Register |
| `reports.js`              | *(M6)* Six report types with PDF export |
| `parser.js`               | *(M7)* Comp parser + rent roll parser |

## Backend

Foundry shares the **same Supabase project** as Cadence and Tranche but uses fully-namespaced tables:

- `foundry_deals` — one row per BRRRR or Fix-and-Flip underwriting model
- `foundry_companies` — branding profiles for report customization
- `foundry_census_cache` — shared cache of Census ACS demographic + vacancy + absorption-proxy lookups
- `foundry_hud_fmr_cache` — shared cache of HUD FMR / SAFMR lookups

This means: same auth (Cadence / Tranche credentials work in Foundry), same company-profile system, zero data collision.

## Data Sources

| Field | Source | Notes |
|---|---|---|
| Demographics (median income, rent, renter%, owner%, unemployment, household size) | Census ACS 5-Year API | Server-side proxy, cache by (zip, year) |
| Studio / 1BR / 2BR / 3BR FMR by zip | HUD FMR API (SAFMR) | Bearer token (the one already in use for Tranche), cache by (cbsa_code, year) |
| 12mo rent growth | HUD FMR API × 2 vintages | Computed on the fly from current + prior year |
| Market inventory | Census ACS DP04_0001E | Total housing units at ZCTA level |
| Market vacancy rate | Census ACS DP04_0005PE | Rental vacancy rate at ZCTA level |
| Absorption (proxy) | Census ACS ΔDP04_0046E | Year-over-year change in renter-occupied units, labeled "ACS-derived (5-yr smoothed)" with manual override |
| Cuyahoga tax rates | Static JSON | Small reference table, ships with the app |

Zero static SAFMR or absorption JSON files. Everything is live + cached. Refreshes itself when HUD/Census publish new vintages.

## Deployment

### Step 1 — Run the schema
Open Supabase SQL editor for the existing project (`nkczxoggmbllcmbksmrn`) and run `supabase-schema.sql`. It's idempotent — safe to re-run.

### Step 2 — Set the Supabase anon key in core.js
Open `core.js` and replace `REPLACE_ME_WITH_ANON_KEY` with the project's anon key (same key you used in Cadence and Tranche). This is a public-safe key — RLS policies do the actual access control.

### Step 3 — Deploy to Vercel
Same pattern as Cadence and Tranche:
1. Create a new Vercel project pointing at this repo
2. No build command needed (static site)
3. Assign a custom domain (e.g. `foundry.kpicapital.com` or `foundry.asjpgroup.com`)

### Step 4 — Sign in and seed regression deals
1. Open the deployed Foundry URL
2. Sign in with your existing Cadence / Tranche credentials (`jonathan@asjpgroup.com`)
3. Go to **Settings → Seed regression deals**
4. Both 2048 E 79th (BRRRR) and 2455 W 7 ST (F&F) appear in the sidebar

### Step 5 — (Coming in M4) HUD + Census API tokens
- HUD bearer token: paste once in Settings, stored in localStorage. Same token you use for Tranche.
- Census API: a free API key from https://api.census.gov/data/key_signup.html. Optional for low-volume use.

## Milestone Roadmap

**M1 — Foundation (THIS BUILD) ✓**
- [x] Auth (shared with Cadence/Tranche)
- [x] Schema deployed
- [x] Dual-mode deal CRUD (BRRRR vs Fix and Flip), autosave plumbing
- [x] Brand system, transformation rectangles logo
- [x] Deal Setup form (mode-aware)
- [x] Unit Mix builder (BRRRR), Comps grid (F&F)
- [x] Operating Assumptions inputs (BRRRR)
- [x] Capital Structure inputs (both modes)
- [x] Dashboard with mode-aware KPI placeholders
- [x] Tax basis toggle (stabilized ARV vs purchase price, default ARV)
- [x] Regression seed data: 2048 E 79th (BRRRR) and 2455 W 7th (F&F)

**M2 — Engine: BRRRR**
- Full BRRRR engine ported to JS, regression against 2048 E 79th Street
- 21 metrics must match audit document targets to the dollar
- Y10 cash-flow bug fixed (the spreadsheet's H17 reference)
- Equity multiple uses institutional definition (sum of positive distributions / equity)
- Tax reassessment toggle wired (default: stabilized ARV basis)
- All 10-year proforma assumptions surfaced as user inputs

**M3 — Engine: Fix and Flip**
- F&F engine ported, regression against 2455 W 7th
- 14 metrics must match audit document targets
- LP/GP split surfaced as user input (no more hardcoded 50/50)
- Annualized return calc: simple (ROI × 12 / months) and money-weighted IRR

**M4 — Market Analysis**
- Census ACS API integration with server-side proxy + caching
- HUD FMR / SAFMR API integration (uses existing Tranche bearer token)
- Census-derived absorption proxy labeled clearly with manual override
- Cuyahoga tax-rate dropdown wired
- Tax-district lookup drives tax line calculation
- Market strength score reproduced from spreadsheet methodology

**M5 — Risk Register**
- Mode-aware auto-flagged risks
  - BRRRR: low post-refi DSCR, negative cash flow, breakeven occupancy > market, in-basis > 70% of ARV, refi LTV >75% on a Class C asset
  - F&F: comp scatter (high std dev of $/SF), DOM > 90 days, contingency < 5%, value creation < 25%, ARV override > comp-implied by >10%
- Severity-coded, mitigation guidance
- Risk banner integration on dashboard

**M6 — Reports**
- Deal Snapshot (1-page internal)
- BRRRR Underwriting Package (lender/equity partner)
- Fix and Flip Underwriting Package (single equity partner)
- Internal Deal Memo (mode-aware)
- IC Memo
- Lender Package
- PDF export with company branding (reuses Tranche's print pipeline)

**M7 — Parser**
- Comp parser: paste MLS PDF or screenshot → comp grid auto-populates
- Rent roll parser (BRRRR mode): reuses the existing Cloudflare worker at `kpi-parser.jonpaz305.workers.dev` with a new `foundry_rentroll` branch

**Future**
- Berea pipeline integration: when Berea exists, wire `source_pipeline = 'berea'` import endpoint. Zero migration — the schema column is already reserved.

## Conventions

- **No em dashes** in any output, ever (ASJP document standard)
- **Numerical accuracy is non-negotiable** — every figure goes to institutional recipients
- **Per-section autosave** — never lose work
- **Tabular numerals** everywhere numbers are stacked
- **Brand colors**: gold `#C9A84C`, black `#0a0a0b`, white `#e8e8f0`
- **Mode-aware UI**: `data-mode="brrrr"` or `data-mode="fix_and_flip"` on any element auto-hides it when the deal's mode doesn't match
- **Engine `R` object**: read-only from UI code, written only by `engine.js`. Mirrors Cadence/Tranche pattern.
- **Cell-level overrides**: the spreadsheet examples showed underwriters routinely override engine outputs (closing costs, ARV, etc.). The `overrides` jsonb column captures these per-deal.

## Regression Test Targets

**Foundry-BRRRR-001: 2048 E 79th Street.** When the engine ships in M2, the dashboard must show:
- Stabilized ARV: $1,490,765.71
- Stabilized NOI: $130,442
- Value Creation: $457,030.31 (44.21%)
- Post-Refi DSCR: 1.566
- Investor IRR: ~44.20% (will differ slightly because of the Y10 bug fix — document the deviation)
- Institutional Equity Multiple: 4.64x (replaces spreadsheet's 3.64x "net multiple")
- Annual cash flow: $47,129.95

**Foundry-FF-001: 2455 W 7 ST.** When the engine ships in M3:
- ARV: $550,000 (override)
- Value Creation: $141,116.50 (34.51%)
- Investor Equity: $65,683.50
- Net Investor Proceeds: $69,908.25
- Investor ROI: 106.43%
- Annualized: ~182% (new metric: simple annualization of ROI × 12 / 7 months)

If any of these break, the engine has a regression.
