# Foundry Engine -- CHANGELOG

This file tracks every change to the Foundry underwriting engine and its
report outputs. The engine version stamp on every external report (and
on every locked snapshot in the `foundry_report_snapshots` table) refers
to entries in this file.

Versioning follows semver:
- **MAJOR** -- breaking math changes; outputs of identical inputs will
  differ between MAJOR versions. Bump when refactoring core formulas,
  changing capitalization conventions, or altering how derived values
  are computed.
- **MINOR** -- new fields, new sections, new report types, expanded
  disclosures. Outputs of identical inputs do not change for existing
  fields between MINOR versions of the same MAJOR.
- **PATCH** -- bug fixes that affect specific edge cases, documentation
  updates, internal refactors with no output change.

Bump discipline: whenever the engine math, the input schema, or a
report's rendered output changes, update the `FOUNDRY_ENGINE_VERSION`
constant at the top of `engine.js` and add an entry here describing
the change.

---

## 1.2.0 -- 2026-05-13

**Cuyahoga tax rate selection fix (engine math).** Corrects a silent string-comparison bug in `lookupCuyahogaTaxRate` that caused all Cuyahoga 5+ unit commercial multifamily deals to be assessed at the residential tax rate (~62% understatement of taxes).

**The bug:** `lookupCuyahogaTaxRate(district, assetType)` tested `assetType === 'commercial'` to decide whether to return the residential rate (column 0) or the commercial rate (column 1) from the Cuyahoga rate table. The actual asset type values stored on deals are `'commercial_multifamily'`, `'residential_multifamily'`, and `'single_family'` -- bare `'commercial'` never appears. The comparison always evaluated false, so every Cuyahoga deal regardless of asset type silently returned the residential rate.

**The fix:** comparison updated to `assetType === 'commercial_multifamily'`. Residential multifamily (2-4 unit) and single family continue to use column 0 (residential rate), which is the correct Cuyahoga assessor convention. Only 5+ unit commercial multifamily moves to column 1.

**Impact on previously-scored deals:**
- **Cuyahoga 5+ unit commercial multifamily:** taxes increase, stabilized NOI/ARV decrease, refi loan and disposition value scale down, IRR/EM decrease, capital recapture % decreases.
- **Cuyahoga residential multifamily (2-4 units) and single family:** unaffected. Residential rate was already being used (correctly, by accident).
- **Non-Cuyahoga deals:** unaffected. Function returns null for unknown districts, falling through to user's manual tax_rate input.

**1615 Ridgefield Road (canonical reference) corrected numbers** (commercial multifamily, University Heights, rate 2.88% → 4.67%):

| Metric | Old (1.0.0/1.1.0) | New (1.2.0) | Delta |
|---|---|---|---|
| Taxes | $19,114 | $30,339 | +$11,225 |
| Stabilized NOI | $65,595 | $56,846 | -$8,749 |
| Stabilized ARV | $749,656 | $649,665 | -$99,991 |
| Refi loan amount | $562,242 | $487,249 | -$74,993 |
| Investor IRR (10-yr) | 7.77% | 5.03% | -2.74pp |
| Equity multiple | 1.85x | 1.54x | -0.31x |
| Value creation | -$18,055 | -$118,046 | -$99,991 |
| Capital recapture | 7.97% | 0.00% | -7.97pp |

Full corrected reference numbers documented in `audit-layer-1-addendum.md`.

**SEED_BRRRR regression deal (Foundry-BRRRR-001, Cleveland, 16 units commercial multifamily):** also corrected. Expected values updated for ~30 assertions in `regression-all.js`. Taxes step from $5,520 to $8,688 (Cleveland commercial rate 3.62% vs old residential 2.30%). Stabilized NOI drops from $130,442 to $127,274. All downstream cascading metrics updated.

**Form changes:**
- Deal Setup: tax_district field hint now resolves dynamically:
  - **Empty district:** red warning "⚠ Empty - taxes will compute to $0. Type to search the Cuyahoga table."
  - **Unknown district:** red warning "⚠ District not found in Cuyahoga table - taxes will compute to $0. Check spelling against autocomplete."
  - **Resolved district:** "Resolved: X.XX% (commercial 5+ unit | residential rate)."
- City input auto-populates tax_district when the city exactly matches a known Cuyahoga district AND tax_district is currently empty. Prevents the silent-$0-tax trap on new deals.
- Inline refresh via `data-tax-hint` selector (no full form re-render; mobile keyboard focus preserved).

**Regression:** all assertions previously calibrated against the residential-rate output recalibrated against the corrected commercial-rate output. SEED_BRRRR regression suite passes 382/396 (same baseline as 1.1.0 -- the 14 failures are pre-existing market-stub regressions unrelated to this fix).

**Audit trail:**
- Original Layer 1 audit (`audit-layer-1.md`) remains in repo as historical record of Engine 1.0.0 numbers.
- New addendum (`audit-layer-1-addendum.md`) provides corrected reference numbers and full reconciliation table for CPA review.

---

## 1.1.0 -- 2026-05-13

**Path C: ARV Source Selector (BRRRR).** Adds explicit user control over the ARV source consumed by refi sizing, value creation, disposition, and all downstream metrics. Pre-1.1 behavior is preserved as the default; this is a MINOR version (no math change for deals that don't opt in).

**Engine changes:**
- New BRRRR input fields: `arv_source` (default `'income_approach'`) and `arv_override_brrrr` (default `null`).
- `arv_source` accepts three values:
  - `'income_approach'` (default) -- `stabilized_arv = NOI / exit_cap`. Identical to pre-1.1 behavior.
  - `'comp_derived'` -- `stabilized_arv = comp_avg_psf × subject_area_sf`. Uses the existing comp validation math.
  - `'manual_override'` -- `stabilized_arv = arv_override_brrrr`. Sponsor judgment.
- New `R` outputs: `stabilized_arv_income_approach` (always the income-approach value, regardless of selected source, for reference and comp variance check), `arv_source_resolved`, `arv_override_brrrr_resolved`, `implied_cap_rate` (NOI / ARV in use).
- Tax solve is unchanged: still iterates against the income-approach ARV, because the assessor uses market valuation, not sponsor judgment.
- Comp variance check is unchanged: still compares comp-derived ARV against income-approach ARV (institutional sanity check that the appraiser/lender will perform).
- Fallback rules: if `manual_override` is selected but `arv_override_brrrr` is null/zero, falls back to income-approach. If `comp_derived` is selected but no usable comps exist, falls back to income-approach.

**Form changes:**
- Capital page: new "ARV Source" subsection with three-mode dropdown.
- Manual override mode shows an editable ARV field.
- Comp-derived mode shows a read-only preview of the comp-derived ARV value, plus a warning if fewer than 3 sales comps are entered (institutional standard).
- When source is not income-approach, the Exit Cap field is disabled (visually dimmed) since it no longer drives ARV.
- Implied cap rate, income-approach reference ARV, and the ARV in use are all surfaced in a small reference block beneath the selector.

**Report changes:**
- Model Assumptions page now discloses ARV source explicitly:
  - `'ARV source: income approach'` (default; current language preserved)
  - `'ARV source: comp-derived ($/SF × subject SF)'`
  - `'ARV source: sponsor manual override'`
- When source is not income-approach, the income-approach ARV is shown as a reference row, and the implied cap rate appears alongside.

**F&F mode:** unaffected. F&F has its own `arv_override` and `arv_source` fields (different schema) that work as before. The new BRRRR-specific `arv_override_brrrr` is namespaced to avoid collision.

**Regression:** 13 new assertions in `M9 Path C ARV Source`. All passing. No regressions on any prior M-group.

---

## 1.0.0 -- 2026-05-13

Initial production-stable release. The first version of Foundry with a
full audit-trail layer (Path A) and persistent company profiles (M1).

**Engine math (carried forward from pre-1.0 development):**
- Dual-mode underwriting: BRRRR (acquisition + capex + refi) and Fix
  and Flip (acquisition + capex + sale)
- Schedule-based bridge debt service with month-by-month draw accrual,
  not flat balance assumption
- Closing cost decomposition across 8 fields: baseline, insurance,
  appraisal, origination %, lender points %, broker points %, lender
  flat fees, transfer tax add-on (BRRRR only)
- Tax basis mode toggle: stabilized ARV (institutional default) vs
  purchase price (legacy spreadsheet parity)
- Equity Multiple computed via institutional method (sum of positive
  distributions / equity in), not spreadsheet method
- Sponsor mobilization field collapses prior `sponsor_mobilization` and
  `capex_funding_gap` into a single input (4-5 draws of GC float,
  reimbursed via construction draws before refi)
- Investor equity breakdown across 6 components (acq down payment,
  capex gap, closing costs, consulting, bridge carry, optional
  mobilization)

**Reports (Path A complete through Pass 3):**
- BRRRR Package: 10 pages (8 content + Model Assumptions + Disclaimers)
- F&F Package: 9 pages (7 content + Model Assumptions + Disclaimers)
- Lender Package: 6 pages (5 content + Model Assumptions, integrated
  on existing Sponsor/Asset/Disclosures page)
- Valor PBV Package: 7 pages (5 content + Model Assumptions + Valor
  PBV Program Assumptions block + Disclaimers)
- Internal Investment Committee Memo: 1 page with Devil's Advocate
  body mark, no Reg D apparatus
- Deal Snapshot: 1 page summary

**Path A audit-trail layer:**
- Pass 2: Reg D disclaimer integration across all external reports
  via central `disclaimers.js` module (currently using engineering
  draft language; pending counsel review per audit doc)
- Pass 3: Model Assumptions and Methodology disclosure page on every
  external report, with full enumeration of inputs, exit cap source,
  tax basis treatment, OPEX assumptions, closing cost decomposition,
  return method, and engine version stamp
- Pass 4: Report snapshot system with locked HTML + data + engine
  version capture; Snapshots page in sidebar nav for view/delete

**M1 Company Profiles:**
- Multi-profile CRUD against `foundry_companies` table
- Per-deal company assignment (foundry_deals.company_id) restored on
  deal load
- Logo upload (PNG/JPG/SVG, 2MB max, base64 storage)
- Per-company subtitle and contact info (email, phone, website,
  address) flow into report headers and footers
- Asking Price field on Capital Acquisition section with live
  negotiation diagnostic (% under/over ask vs purchase price)

**Regression coverage:** 365 assertions across 19 test groups against
the canonical regression deals (Hidden Villas-equivalent, 2048 E 79th
BRRRR, 2455 W 7 ST F&F).
