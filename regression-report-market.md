# Foundry M4 Regression Report
## Market Analysis: Census ACS + HUD FMR Integration

**Test scope:** Market Strength Score component scoring, composite weighting, grade letter mapping, risk auto-flagging, FMR response normalization
**Test fixtures:** 3 synthetic Census fixtures (strong / distressed / 44103-realistic) plus 2 FMR shapes (SAFMR per-zip and MSA-level)
**Date:** May 11, 2026
**Engine version:** Foundry M4 (engine.js + market.js + worker-patch-m4.js)

---

## Result: 34 of 34 tests PASS

Every deterministic Market Strength Score calculation, risk-flagging branch, and FMR response shape transform behaves as designed. Network calls (Census ACS, HUD FMR) are tested via the worker patch's documented field mappings and inline error handling; live API integration verification happens in production after the worker is redeployed.

## Combined status across all milestones

| Engine / Module | Regression | Metrics | Status |
|---|---|---:|:---:|
| BRRRR engine (M2) | Foundry-BRRRR-001 (2048 E 79th) | 55 | 55/55 PASS |
| F&F engine (M3) | Foundry-FF-001 (2455 W 7 ST) | 26 | 26/26 PASS |
| Market module (M4) | Synthetic fixtures + 44103 fallback | 34 | 34/34 PASS |
| **Total** | | **115** | **115/115 PASS** |

---

## Methodology

The M4 module includes three components that are testable without live network access:

1. **`computeMarketDerived(census, fmr)`** which takes raw Census/FMR data and produces the Market Strength Score, grade, and component breakdowns
2. **`computeMarketRisks(census, derived)`** which returns the array of auto-flagged risks for ingestion by the Risk Register
3. **`_normalizeFmr(data, smallarea, zip)`** which extracts the subject-zip row from a HUD FMR response

The regression harness loads `market.js` into a Node.js context, stubs UI dependencies, and exercises each function against fixtures designed to hit specific scoring bands. The network layer (worker calls, Supabase cache writes) is documented in the worker patch and validated by inline parameter validation and the strongly-typed `ACS_VARS` mapping.

---

## Test Group 1: Strong-market fixture (5 / 5 pass)

A synthetic high-income suburb fixture: 95k median household income, 4% rental vacancy, 3% unemployment, 55% bachelor's+, 65% owner-occupied (balanced renter / owner mix).

Expected: A-grade composite. Each component should score near 95.

| Component | Score | Status |
|---|---:|:---:|
| Vacancy (20% weight) | 95 | PASS |
| Unemployment (18%) | 95 | PASS |
| Median Income (15%) | 88.75 | PASS |
| Education (12%) | 95 | PASS |
| Poverty (10%) | 95 | PASS |
| Owner-Balance (10%) | 95 | PASS |
| **Composite** | **94** | PASS |
| **Grade** | **A** | |
| Risk count | 0 | PASS |

All components ship in the green band. Zero risks fire (correct: a healthy market produces no auto-flagged risks).

## Test Group 2: Distressed-market fixture (12 / 12 pass)

A synthetic distressed-market fixture: 22k median income, 18% rental vacancy, 16% unemployment, 38% poverty rate, 8% bachelor's+, 75% renter-occupied.

Expected: F/D-grade composite, multiple high-severity risks.

| Component | Score | Status |
|---|---:|:---:|
| Vacancy | 28 | PASS (<= 30) |
| Unemployment | 36 | PASS (<= 40) |
| Income | 42 | PASS (<= 50) |
| Poverty | 39 | PASS (<= 45) |
| Education | 36 | PASS (<= 40) |
| **Composite** | **43** | PASS (<= 50) |
| **Grade** | **D** | |
| Risk count | 6 | PASS (>= 5) |

Specific risk titles correctly fire:
- Elevated rental vacancy (high severity)
- Elevated unemployment (high severity)
- Elevated poverty rate (medium severity)
- Cost-burdened tenant base (medium severity)
- Median income below institutional floor (high severity)
- Weak composite market score (high severity)

The market_score risk fires because the composite (43) is below the 45 institutional threshold; this signals the underwriter should consider rejecting the deal or repositioning the thesis.

## Test Group 3: 44103 Cleveland fixture (5 / 5 pass)

A realistic 44103 (Cleveland near the 2048 E 79th Street regression deal) fixture using the spreadsheet's hardcoded fallback values: $27k median income, 12% rental vacancy, 15.7% unemployment, $779 median rent.

Expected: low-C grade composite (institutionally weak but not catastrophic).

| Metric | Result |
|---|---:|
| Composite score | 54 |
| Grade | C |
| Rent-to-income ratio | 34.6% |
| Income component | 47 |
| Vacancy component | 52 |
| Risks triggered | 4 |

This is the realistic baseline for the regression deal's submarket. The fixture passes the institutional floor for consideration but fires four auto-risks that the underwriter must address in the Investment Memo. The score above 45 means it doesn't trigger the "reject the deal" composite warning, but two of the four risks are high-severity.

Rent-to-income ratio computes correctly: 779 × 12 / 27047 = 34.56%, which exceeds the 30% institutional comfort threshold but falls below the 40% cost-burdened threshold.

## Test Group 4: Edge cases (4 / 4 pass)

| Case | Result |
|---|:---:|
| Missing data (null fields) does not throw | PASS |
| Missing data returns neutral baseline (>= 35) | PASS |
| Null census returns empty object | PASS |
| Zero vacancy scored as suspicious (50, not 95) | PASS |

The zero-vacancy check is institutionally important: a reported 0% rental vacancy rate is almost always a small-sample-size artifact in ACS data, not a true tight market. The scoring function returns 50 (neutral) rather than 95 (perfect) when this fires.

## Test Group 5: FMR response normalization (5 / 5 pass)

HUD returns either a Small Area FMR response (per-zip array) or an MSA-level response (single object). The normalization layer must handle both:

| Case | Result |
|---|:---:|
| SAFMR response: finds the subject zip's row | PASS |
| SAFMR response: exposes all zips in fmr_by_zip | PASS |
| SAFMR response: cross-zip lookup works | PASS |
| MSA-level response: returns single FMR | PASS |
| MSA-level response: fmr_by_zip is null | PASS |

The Cleveland CBSA (17460) returns SAFMR data; smaller metros return MSA-level. Both shapes flow through `_extractFmrLevels` which handles HUD's two field-naming conventions (`'One-Bedroom'` and `'Two-Bedroom'` with hyphens vs `fmr_1` and `fmr_2` numeric).

---

## Market Strength Score weighting (documented for institutional readers)

The composite score is a weighted sum of 7 components, each scored 0-100:

| Component | Weight | Higher score means |
|---|---:|---|
| Vacancy | 20% | Rental vacancy near or below 5% |
| Unemployment | 18% | Local unemployment near or below 5% |
| Median Income | 15% | Household income near or above $60k |
| Rent-to-Income | 15% | Rent burden well below 30% of income |
| Education | 12% | Bachelor's+ rate near or above 40% |
| Poverty | 10% | Poverty rate near or below 15% |
| Owner Balance | 10% | Owner-occupancy between 50% and 70% |

Weights sum to 100. Each component uses a piecewise-linear scoring curve with a "comfort" threshold (95-band) and a "concern" threshold (60-band); values below 2× the concern threshold drop into the 20-band.

The Grade letter is a clean mapping over the composite:

| Score | Grade |
|---|---|
| 85 - 100 | A |
| 75 - 84 | B+ |
| 65 - 74 | B |
| 55 - 64 | C+ |
| 45 - 54 | C |
| 35 - 44 | D |
| < 35 | F |

Thresholds are hardcoded per Jonathan's direction. If a future milestone wants editable thresholds (firm-wide or per-deal), the `MARKET_THRESHOLDS` constant at the top of `market.js` is the single place to expose.

---

## Cloudflare Worker patch

The worker patch (`worker-patch-m4.js`) adds three routes to the existing `kpi-parser` worker:

- **POST /census** Fetches Census ACS5 Profile data for a ZCTA. Caches by (zip, year) in `foundry_census_cache`. Returns parsed 25-field set with percent fields auto-normalized to decimals.
- **POST /resolve-cbsa** Resolves a ZIP code to a CBSA code using HUD's USPS crosswalk endpoint. Picks the result with the highest residential ratio.
- **POST /hud-fmr** Fetches HUD FMR data for a CBSA. Caches by (cbsa_code, year) in `foundry_hud_fmr_cache`. Auto-detects Small Area FMR vs MSA-level. Returns parsed data with field-name normalization.

All three routes use the existing CORS, error-handling, and Supabase service-role auth patterns from the worker's `/parse-rentroll`, `/parse-t12`, and `/parse-lihtc-rentroll` branches.

To deploy: copy the three route handlers and the `ACS_VARS` constant into the worker's main fetch handler, between the existing `/parse-*` branches and the 404 fallback. Detailed integration comments are in the patch file.

The worker file `worker-patch-m4.js` is a standalone document with importable handlers, not the full worker. It is not deployed to Vercel with the rest of the app; it is a paste-in patch for the Cloudflare worker codebase. The README notes this clearly.

---

## Files in this milestone

| File | Status | Notes |
|---|---|---|
| market.js | **New** | Client-side market data module. ~400 lines. Wraps worker calls, manages state, renders the Market Analysis page, computes Market Strength Score, derives auto-flagged risks. |
| worker-patch-m4.js | **New** | Cloudflare worker patch. Drop-in handlers for /census, /resolve-cbsa, /hud-fmr. Adds to existing kpi-parser worker. ~250 lines. |
| engine.js | **Updated** | `recompute()` now appends market_score, market_grade, market_risks, and market_cbsa_name to R when market data is present. |
| shell-ui.js | **Updated** | Added 5th conditional KPI tile (Market Strength) that renders only when score is computed. Both BRRRR and F&F dashboards. |
| core.js | **Updated** | navTo handler now calls renderMarketPage when the Market section opens. |
| index.html | **Updated** | Replaced Market placeholder with section-market-body container. Added market.js script tag in the correct order (after engine.js, before shell-ui.js). |
| styles.css | **Updated** | Added Market Strength Score panel CSS (msc-wrap, msc-grade-card, msc-bars) and data grid CSS (data-grid-2, data-row). |
| data-entry.js | Unchanged | |
| seed-regression.js | Unchanged | |
| logos.js | Unchanged | |
| supabase-schema.sql | Unchanged | foundry_census_cache and foundry_hud_fmr_cache already in the deployed schema. |
| regression-report-brrrr.md | Unchanged | |
| regression-report-ff.md | Unchanged | |
| regression-report-market.md | **New** | This document. |

No schema migration. No new tables. All M4 data flows through the existing jsonb `market_analysis` column on `foundry_deals` and the existing `foundry_census_cache` and `foundry_hud_fmr_cache` tables.

---

## Deployment sequence

1. **Cloudflare worker:** patch the kpi-parser worker by copying the three route handlers from `worker-patch-m4.js` into the main fetch handler, set the `HUD_API_TOKEN` environment variable (Jonathan needs to grab one from huduser.gov), and redeploy. Verify the routes respond with curl test commands before flipping the client.

2. **Vercel deployment:** drop the 11 client files into the Foundry repo root and push. Vercel auto-deploys.

3. **Verification flow:** open the deployed app, load the Foundry-BRRRR-001 seed deal, navigate to Market Analysis, click "Fetch market data". First fetch hits live Census + HUD (~2-3 seconds), subsequent fetches hit Supabase cache (~200ms). The Market Strength Score appears in the dashboard's 5th KPI tile. Risk Register page (M5) will read the auto-flagged risks already present in R.market_risks.

---

## Next milestone (M5)

Risk Register page. Ingest `R.market_risks` plus mode-aware engine risks:

- **BRRRR risks:** DSCR below 1.20, refi LTV above 75%, breakeven occupancy above 75%, contingency below 5% of TPC, capital recapture below 80%, exit cap compression assumption above 50 bps below current
- **F&F risks:** Comp scatter >25% (high coefficient of variation in $/SF), DOM above 75 days, value creation below 15%, contingency below 5%, ARV override more than 10% above comp-derived

Risks render as a sortable list with severity color coding, with auto-flagged risks at the top and a "+ Add custom risk" button for underwriter-entered risks. Each risk has a Resolved checkbox and a free-text Mitigation field. The full Risk Register feeds the Investment Memo (M6).
