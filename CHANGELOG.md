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
