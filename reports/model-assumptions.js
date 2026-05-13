// ════════════════════════════════════════════════════════════════
// FOUNDRY - Model Assumptions Disclosure Module
// ════════════════════════════════════════════════════════════════
// Centralized "Model Assumptions and Methodology" disclosure block
// for all external Foundry-generated reports.
//
// This module is part of Path A Pass 3. Pairs with disclaimers.js
// (Path A Pass 2). When a sophisticated reader (LP, lender, board
// member, regulator) asks "what's behind these numbers?", this is
// the page they read.
//
// The module exposes per-report assembled blocks rather than
// composable modules, because (a) the assumption inventory is
// substantially the same across BRRRR/F&F (with mode-specific
// branching), and (b) the disclosure is most useful when read as
// a single contiguous narrative, not as composed sub-modules.
//
// Engine version is currently a static string. Pass 4 replaces it
// with dynamic version capture (engine module exports a VERSION
// constant, this module reads it).
// ════════════════════════════════════════════════════════════════

// Engine version is read dynamically from the global
// FOUNDRY_ENGINE_VERSION constant exported by engine.js. Pairs with
// CHANGELOG.md entries. The function form (vs a captured constant)
// ensures the value reflects the live engine version even if reports
// are regenerated after an engine update without a page reload.
function _engineVersionStamp() {
  if (typeof FOUNDRY_ENGINE_VERSION === 'string' && FOUNDRY_ENGINE_VERSION) {
    const dateStr = (typeof FOUNDRY_ENGINE_VERSION_DATE === 'string' && FOUNDRY_ENGINE_VERSION_DATE)
      ? ` (${FOUNDRY_ENGINE_VERSION_DATE})`
      : '';
    return FOUNDRY_ENGINE_VERSION + dateStr;
  }
  return 'unversioned';
}


// ── HELPERS ───────────────────────────────────────────────────
function _maEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _maMoney(x) {
  if (x == null || !isFinite(x)) return '-';
  return '$' + Math.round(x).toLocaleString();
}

function _maPct(x, dec) {
  if (x == null || !isFinite(x)) return '-';
  return (x * 100).toFixed(dec == null ? 2 : dec) + '%';
}

function _maNum(x) {
  if (x == null || !isFinite(x)) return '-';
  return Math.round(x).toLocaleString();
}

function _maRow(label, value, sourceNote) {
  const valHtml = value == null || value === '' ? '<span style="color:var(--print-muted)">-</span>' : _maEsc(value);
  const srcHtml = sourceNote ? ` <span style="color:var(--print-muted);font-size:9pt;font-style:italic">(${_maEsc(sourceNote)})</span>` : '';
  return `<tr><td style="padding:3pt 6pt;border-bottom:1px solid #e0e0e0">${_maEsc(label)}</td><td class="num" style="padding:3pt 6pt;border-bottom:1px solid #e0e0e0;font-family:var(--print-mono, 'IBM Plex Mono', monospace)">${valHtml}${srcHtml}</td></tr>`;
}

function _maSection(title) {
  return `<div style="margin-top:10pt;margin-bottom:4pt"><div class="print-section pb-avoid"><span class="ps-accent"></span>${_maEsc(title)}</div></div>`;
}

function _maTable(rowsHtml) {
  return `<table class="print-table pb-avoid" style="width:100%;border-collapse:collapse;margin-bottom:6pt"><tbody>${rowsHtml}</tbody></table>`;
}

function _maNote(text) {
  return `<div style="font-size:9pt;color:var(--print-muted);line-height:1.45;margin:4pt 0 8pt 0;padding:6pt 8pt;background:rgba(0,0,0,0.02);border-left:2pt solid var(--gold, #C9A84C)">${_maEsc(text)}</div>`;
}


// ── TAX BASIS DISCLOSURE (cross-cutting helper) ───────────────
// The tax basis mode is the single largest defensible-methodology
// choice in the engine and is disclosed explicitly with mode label,
// dollar amount, and footnote. Per Path A spec.
function _taxBasisDisclosure(R, inputs) {
  const mode = inputs.tax_basis_mode || 'stabilized_arv';
  const modeLabel = mode === 'stabilized_arv'
    ? 'Stabilized ARV (institutional default)'
    : 'Purchase Price (legacy spreadsheet parity)';
  const taxDollars = R.taxes != null ? _maMoney(R.taxes) : '-';
  const district = inputs.tax_district || 'Not specified';

  const footnote = mode === 'stabilized_arv'
    ? 'Property taxes are computed against the iteratively-solved stabilized ARV using the tax district\'s effective rate. This treatment assumes the County will reassess the property at the new stabilized value following the transfer of ownership and capex completion, which is the conservative institutional assumption. If the County\'s reassessment cycle is delayed or the post-transfer assessment is lower than the stabilized ARV, the tax line will be lower than projected and NOI / ARV will be correspondingly higher.'
    : 'Property taxes are computed against the purchase price using the tax district\'s effective rate. This treatment matches the sponsor\'s legacy spreadsheet methodology and assumes the County will not reassess the property at a materially higher value following the transfer of ownership. The institutional default is to assess taxes against stabilized ARV (the conservative assumption); the sponsor has selected purchase-price basis for this deal. If the County does reassess at stabilized ARV, the tax line will be higher than projected and NOI / ARV will be lower.';

  return {
    modeLabel: modeLabel,
    taxDollars: taxDollars,
    district: district,
    footnote: footnote
  };
}


// ── BRRRR + F&F SHARED VALUATION / REVENUE / OPEX SECTIONS ────
function _valuationSection(R, inputs, mode) {
  const rows = [];

  if (mode === 'brrrr') {
    rows.push(_maRow('Stabilized ARV', _maMoney(R.stabilized_arv), 'engine: NOI / exit cap'));
    rows.push(_maRow('Stabilized NOI', _maMoney(R.stabilized_noi), 'engine: EGI - OPEX'));
    rows.push(_maRow('Exit cap (refi valuation)', _maPct(inputs.exit_cap), 'sponsor input'));
    if (R.arv_per_unit) rows.push(_maRow('ARV per unit', _maMoney(R.arv_per_unit), 'derived'));
  } else {
    const arvSrc = R.arv_source || 'override';
    rows.push(_maRow('ARV (after-repair value)', _maMoney(R.arv), arvSrc === 'override' ? 'sponsor override' : 'comp-derived'));
    if (R.comp_derived_arv != null) rows.push(_maRow('Comp-derived ARV (cross-check)', _maMoney(R.comp_derived_arv), 'engine: avg comp $/SF × subject SF'));
    if (R.comp_avg_psf != null) rows.push(_maRow('Average comp $/SF', _maMoney(R.comp_avg_psf), 'engine: institutional method'));
    if (R.comp_count_sales) rows.push(_maRow('Sales comp count', _maNum(R.comp_count_sales), `minimum 3 required; ${R.comp_count_sales_renovated || 0} renovated`));
  }

  return _maSection('Valuation Methodology') + _maTable(rows.join(''));
}

function _revenueSection(R, inputs, mode) {
  const rows = [];

  if (mode === 'brrrr') {
    rows.push(_maRow('Gross Potential Rent (annual)', _maMoney(R.gpr), 'derived: unit mix × monthly rent × 12'));
    rows.push(_maRow('Effective Gross Income (EGI)', _maMoney(R.egi), 'derived: GPR × (1 - vacancy)'));
    rows.push(_maRow('Vacancy rate', _maPct(inputs.vacancy_pct), 'sponsor input'));
    rows.push(_maRow('Rent growth rate (annual, 10-yr projection)', _maPct(inputs.rent_growth_pct), 'sponsor input'));
    rows.push(_maRow('Appreciation rate (annual)', _maPct(inputs.appreciation_pct), 'sponsor input'));
  } else {
    rows.push(_maRow('Disposition value', _maMoney(R.disposition_value), 'derived: ARV at sale'));
    rows.push(_maRow('Sale cost', _maMoney(R.sale_cost), `${_maPct(inputs.sale_cost_pct)} of disposition value`));
    rows.push(_maRow('Target hold (months)', _maNum(inputs.target_hold_months), 'sponsor input'));
  }

  return _maSection('Revenue and Disposition Assumptions') + _maTable(rows.join(''));
}

function _opexSection(R, inputs, mode) {
  if (mode !== 'brrrr') return '';  // F&F has no stabilized OPEX disclosure (no operating period)

  const tax = _taxBasisDisclosure(R, inputs);

  const rows = [];
  rows.push(_maRow('Property Management', _maPct(inputs.pm_pct), 'of EGI'));
  rows.push(_maRow('Maintenance and Turnover', _maPct(inputs.maint_pct_of_egi), 'of EGI'));
  rows.push(_maRow('Insurance', _maPct(inputs.insurance_pct_of_egi), 'of EGI'));
  rows.push(_maRow('Utilities', _maPct(inputs.utilities_pct_of_egi), 'of EGI'));
  rows.push(_maRow('Reserves', '$' + _maNum(inputs.reserves_per_unit_year) + ' / unit / year', 'sponsor input'));
  rows.push(_maRow('Tax basis mode', tax.modeLabel, 'see footnote'));
  rows.push(_maRow('Property taxes (annual)', tax.taxDollars, 'tax district: ' + tax.district));

  return _maSection('Operating Expense Assumptions') + _maTable(rows.join('')) + _maNote('Tax basis treatment: ' + tax.footnote);
}

function _capitalSection(R, inputs, mode) {
  const rows = [];

  rows.push(_maRow('Purchase price', _maMoney(inputs.purchase_price), 'sponsor input'));
  rows.push(_maRow('Capex budget', _maMoney(inputs.capex_budget), 'sponsor input'));
  rows.push(_maRow('Sponsor mobilization', _maMoney(inputs.gc_contingency), 'sponsor input (capex float)'));

  if (mode === 'brrrr') {
    rows.push(_maRow('LTV on purchase', _maPct(inputs.initial_loan_ltv), 'sponsor input'));
    rows.push(_maRow('LTC on capex', _maPct(inputs.initial_loan_ltc_capex), 'sponsor input'));
    rows.push(_maRow('Acquisition tranche', _maMoney(R.acquisition_tranche), 'derived: purchase × LTV'));
    rows.push(_maRow('Construction tranche', _maMoney(R.construction_tranche), 'derived: capex × LTC'));
    rows.push(_maRow('Total bridge loan', _maMoney(R.initial_loan_amt), 'sum of tranches'));
    rows.push(_maRow('Bridge rate', _maPct(inputs.initial_rate, 3), inputs.initial_interest_type || 'IO'));
    rows.push(_maRow('Capex execution window', _maNum(R.capex_duration_months_resolved) + ' months', 'sponsor input'));
    rows.push(_maRow('Target refi (month)', _maNum(inputs.target_refi_months), 'sponsor input'));
    rows.push(_maRow('Target refi LTV', _maPct(inputs.target_refi_ltv), 'sponsor input'));
    rows.push(_maRow('Refi rate', _maPct(inputs.refi_rate, 3), inputs.refi_interest_type || 'PI'));
  } else {
    rows.push(_maRow('LTV on purchase', _maPct(inputs.initial_loan_ltv), 'sponsor input'));
    rows.push(_maRow('Initial loan amount', _maMoney(R.initial_loan_amt), 'derived: purchase × LTV + capex'));
    rows.push(_maRow('Bridge rate', _maPct(inputs.initial_rate, 3), inputs.initial_interest_type || 'IO'));
  }

  // Closing cost decomposition
  rows.push(_maRow('Closing cost baseline', _maMoney(R.cc_baseline), 'title / escrow / recording'));
  if (R.cc_insurance > 0) rows.push(_maRow('Insurance (closing)', _maMoney(R.cc_insurance), 'first-year premium'));
  if (R.cc_appraisal > 0) rows.push(_maRow('Appraisal', _maMoney(R.cc_appraisal), 'lender-ordered'));
  rows.push(_maRow('Origination fee', _maMoney(R.cc_origination), _maPct(inputs.origination_pct, 2) + ' of loan'));
  rows.push(_maRow('Lender points', _maMoney(R.cc_lender_points), _maPct(inputs.lender_points_pct, 2) + ' of loan'));
  if (R.cc_broker_points > 0) rows.push(_maRow('Broker points', _maMoney(R.cc_broker_points), _maPct(inputs.broker_points_pct, 2) + ' of loan'));
  if (R.cc_lender_flat_fees > 0) rows.push(_maRow('Lender flat fees', _maMoney(R.cc_lender_flat_fees), 'legal / environmental / processing'));
  if (mode === 'brrrr' && R.cc_transfer_addon > 0) rows.push(_maRow('Transfer tax add-on', _maMoney(R.cc_transfer_addon), 'Cuyahoga multifamily default'));
  rows.push(_maRow('Total closing costs', _maMoney(R.closing_costs), 'sum of components above'));

  return _maSection('Capital Structure Assumptions') + _maTable(rows.join(''));
}

function _returnsSection(R, inputs, mode) {
  const rows = [];

  if (mode === 'brrrr') {
    rows.push(_maRow('Target hold (years)', _maNum(inputs.target_hold_years), 'sponsor input'));
    rows.push(_maRow('Investor ownership retained', _maPct(inputs.investor_ownership), 'sponsor input'));
    rows.push(_maRow('Equity Multiple method', 'Institutional (sum of positive distributions / equity in)', 'engine default'));
    rows.push(_maRow('IRR convention', 'Annualized, Y0 outflow + Y1 to Y_hold inflows', 'engine default'));
  } else {
    rows.push(_maRow('LP / GP split', _maPct(inputs.lp_gp_split_ff), 'sponsor input'));
    rows.push(_maRow('Equity method', inputs.equity_method_ff || 'spreadsheet', 'sponsor input'));
  }

  return _maSection('Investment Return Assumptions') + _maTable(rows.join(''));
}

function _methodologySection(R, inputs, mode, market) {
  const rows = [];

  rows.push(_maRow('Engine version', _engineVersionStamp(), 'see CHANGELOG.md'));
  rows.push(_maRow('Report generated', new Date().toISOString().slice(0, 10), 'system date'));

  if (mode === 'brrrr') {
    rows.push(_maRow('Bridge DS method', 'Month-by-month draw accrual', 'engine: construction tranche scaled by capex execution window'));
    rows.push(_maRow('Comp validation method', 'Sales comp $/SF, minimum 3 comps', '10% / 20% variance bands'));
  } else {
    rows.push(_maRow('Comp $/SF method', 'Institutional (average of per-comp $/SF)', 'cross-checked against spreadsheet method'));
  }

  // Market context
  const hasMarket = market && market.derived && market.derived.market_strength_score != null;
  if (hasMarket) {
    rows.push(_maRow('Market grade', market.derived.market_strength_grade || '-', 'engine: 5-factor composite'));
    rows.push(_maRow('Market composite score', Math.round(market.derived.market_strength_score) + ' / 100', 'derived'));
    if (market.cbsa_name) rows.push(_maRow('MSA', market.cbsa_name, 'Census Bureau'));
  } else {
    rows.push(_maRow('Market analysis', 'Not run for this deal', 'fetch on Market panel for grade and composite'));
  }

  return _maSection('Methodological Disclosures') + _maTable(rows.join(''));
}


// ════════════════════════════════════════════════════════════════
// REPORT-SPECIFIC ASSEMBLED BLOCKS
// ════════════════════════════════════════════════════════════════

// BRRRR Package + F&F Package -- full enumeration per Pass 3 spec.
function modelAssumptionsForEquityPackage(R, inputs, market, mode) {
  return `
    ${_valuationSection(R, inputs, mode)}
    ${_revenueSection(R, inputs, mode)}
    ${_opexSection(R, inputs, mode)}
    ${_capitalSection(R, inputs, mode)}
    ${_returnsSection(R, inputs, mode)}
    ${_methodologySection(R, inputs, mode, market)}
  `;
}

// Lender Package -- full enumeration variant focused on the lender's
// underwriting concerns: valuation, debt structure, tax treatment,
// methodology. Less emphasis on investor-return assumptions (lender
// is not an equity investor).
function modelAssumptionsForLenderPackage(R, inputs, market, mode) {
  return `
    ${_valuationSection(R, inputs, mode)}
    ${_capitalSection(R, inputs, mode)}
    ${_opexSection(R, inputs, mode)}
    ${_methodologySection(R, inputs, mode, market)}
  `;
}

// Valor PBV Package -- full enumeration plus an additional Valor-specific
// disclosure block flagging the HUD-VASH program assumptions, FMR
// vintage, and PHA dependency.
function modelAssumptionsForValorPackage(R, inputs, market, mode) {
  const valorSpecific = _maSection('Valor PBV Program Assumptions') + _maTable(
    _maRow('Voucher uplift basis', 'FMR + ACS data as of report date', 'data vintage: current per HUD release cycle') +
    _maRow('Payment standard assumption', 'PHA payment standard at FMR baseline', 'PHA-specific outcomes may vary') +
    _maRow('HAP renewal assumption', 'Annual renewal, indefinite continuation', 'subject to federal appropriations') +
    _maRow('Tenant household composition', 'Modeled at PHA average', 'actual outcomes depend on lease-up household composition') +
    _maRow('PBV allocation timeline', 'Subject to PHA approval and federal appropriations', 'not within sponsor\'s control')
  ) + _maNote('Voucher uplift and HAP-related figures are illustrative of underwriting methodology only. HUD-VASH program parameters (FMR, payment standards, contract terms, renewal mechanics, allocation availability) are subject to regulation by HUD, the VA, and applicable PHAs, and depend on federal appropriations and political and policy factors outside the sponsor\'s control.');

  return `
    ${_valuationSection(R, inputs, mode)}
    ${valorSpecific}
    ${_revenueSection(R, inputs, mode)}
    ${_opexSection(R, inputs, mode)}
    ${_capitalSection(R, inputs, mode)}
    ${_returnsSection(R, inputs, mode)}
    ${_methodologySection(R, inputs, mode, market)}
  `;
}
