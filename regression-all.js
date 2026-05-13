// ════════════════════════════════════════════════════════════════
// FOUNDRY - Unified Regression Harness (M2 + M3 + M4 + M5)
// ════════════════════════════════════════════════════════════════
// Loads engine.js and risk.js into a Node sandbox, seeds both
// regression deals plus synthetic market fixtures, and validates
// 146 tests:
//
//   M2 BRRRR engine          55 tests (Foundry-BRRRR-001)
//   M3 F&F engine            26 tests (Foundry-FF-001)
//   M4 Market Strength Score 34 tests (synthetic fixtures + 44103)
//   M5 Engine risks          31 tests (engine + market + assembly)
//
// Run: node regression-all.js
// ════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Sandbox setup ─────────────────────────────────────────────
const sandbox = {
  console,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  isFinite,
  isNaN,
  parseFloat,
  parseInt,
  // Stubs for browser globals
  window: {},
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({}), addEventListener: () => null, body: { appendChild: () => null } },
  alert: () => null,
  confirm: () => true,
  setTimeout: () => null
};
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

function loadJS(name) {
  const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
  vm.runInContext(src, ctx, { filename: name });
}

// Seed the engine globals that core.js would normally manage.
vm.runInContext(`
  let currentDeal = null;
  let inputs = {};
  let unitMix = [];
  let comps = [];
  let marketAnalysis = {};
  let R = {};
  function getDealMode() { return currentDeal && currentDeal.deal_mode ? currentDeal.deal_mode : 'brrrr'; }
  function saveDeal() { /* no-op in tests */ }
  function navTo() {}
  function updateDashboard() {}
  function renderRiskPage() {}
`, ctx);

// Load engine + market + risk (the modules under test)
loadJS('market.js');
loadJS('engine.js');
loadJS('risk.js');

// ── Test counters ─────────────────────────────────────────────
const results = { pass: 0, fail: 0, byGroup: {} };

function group(name) {
  results.byGroup[name] = { pass: 0, fail: 0, failures: [] };
  return name;
}
function check(grp, label, actual, expected, tol) {
  tol = tol == null ? 0.005 : tol;  // 0.5% relative tolerance, or absolute for small
  let ok = false;
  if (typeof expected === 'number') {
    if (expected === 0) ok = Math.abs(actual - expected) < 1e-6;
    else ok = Math.abs(actual - expected) / Math.abs(expected) < tol;
  } else {
    ok = actual === expected;
  }
  if (ok) {
    results.pass++;
    results.byGroup[grp].pass++;
  } else {
    results.fail++;
    results.byGroup[grp].fail++;
    results.byGroup[grp].failures.push({ label, actual, expected });
  }
}
function checkExact(grp, label, actual, expected) {
  const ok = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));
  if (ok) { results.pass++; results.byGroup[grp].pass++; }
  else {
    results.fail++;
    results.byGroup[grp].fail++;
    results.byGroup[grp].failures.push({ label, actual, expected });
  }
}
function checkTruthy(grp, label, actual) {
  if (actual) { results.pass++; results.byGroup[grp].pass++; }
  else {
    results.fail++;
    results.byGroup[grp].fail++;
    results.byGroup[grp].failures.push({ label, actual, expected: 'truthy' });
  }
}

// ── Seed: Foundry-BRRRR-001 (2048 E 79th Street) ─────────────
const SEED_BRRRR = {
  id: 'test-brrrr', deal_mode: 'brrrr', asset_type: 'commercial_multifamily',
  name: 'Foundry-BRRRR-001', risks: []
};
const INPUTS_BRRRR = {
  property_address: '2048 E 79th Street', city: 'Cleveland', state: 'OH', zip: '44103',
  asset_type: 'commercial_multifamily',
  target_refi_months: 9, target_hold_years: 10, target_refi_ltv: 0.70,
  vacancy_pct: 0.05, pm_pct: 0.07, maint_pct_of_egi: 0.055,
  insurance_pct_of_egi: 0.08, utilities_pct_of_egi: 0.02,
  reserves_per_unit_year: 1000, rent_growth_pct: 0.03, appreciation_pct: 0.05,
  exit_cap: 0.0875, sale_cost_pct: 0.07,
  purchase_price: 240000, reno_budget: 616000, mobilization_contingency: 50000,
  treat_mob_as_equity: false, consulting_fees_override: 30000,
  closing_cost_baseline: 2444, closing_cost_loan_pct: 0.045,
  closing_cost_transfer_addon: 2400,
  initial_loan_ltv: 0.70, initial_loan_ltc_reno: 0.91,
  initial_rate: 0.11, initial_interest_type: 'IO',
  refi_rate: 0.07, refi_interest_type: 'PI',
  refi_closing_cost_pct: 0.04,
  investor_ownership: 0.5,
  tax_basis_mode: 'purchase_price', tax_district: 'Cleveland',
  equity_multiple_method: 'institutional'
};
const UNITMIX_BRRRR = [
  { bed_type: '1br', count: 2, rent: 900 },
  { bed_type: '2br', count: 14, rent: 1100 }
];

function loadBRRRR() {
  return vm.runInContext(`
    currentDeal = ${JSON.stringify(SEED_BRRRR)};
    inputs = ${JSON.stringify(INPUTS_BRRRR)};
    unitMix = ${JSON.stringify(UNITMIX_BRRRR)};
    comps = [];
    marketAnalysis = {};
    R = {};
    recompute();
    R;
  `, ctx);
}

// ── Seed: Foundry-FF-001 (2455 W 7 ST) ───────────────────────
const SEED_FF = {
  id: 'test-ff', deal_mode: 'fix_and_flip', asset_type: 'single_family',
  name: 'Foundry-FF-001', risks: []
};
const INPUTS_FF = {
  property_address: '2455 W 7 ST', city: 'Cleveland', state: 'OH', zip: '44113',
  asset_type: 'single_family', subject_area_sf: 2404, total_units_ff: 1,
  target_hold_months: 7, arv_override: 550000,
  purchase_price: 240000, reno_budget: 90000, mobilization_contingency: 30000,
  consulting_fees_override: 10000,
  closing_cost_baseline: 2444, closing_cost_loan_pct: 0.045,
  initial_loan_ltv: 0.90, initial_rate: 0.127, initial_interest_type: 'IO',
  sale_cost_pct: 0.07, lp_gp_split_ff: 0.5,
  equity_method_ff: 'spreadsheet', comp_avg_method: 'institutional',
  tax_district: 'Cleveland'
};
const COMPS_FF = [
  { comp_type: 'sales', address: '2295 Thurman Ave', sales_price: 473500,
    area_sf: 2650, dom: 62, renovated: false, source: 'MLS' },
  { comp_type: 'sales', address: '2164 W 6th St', sales_price: 640000,
    area_sf: 2800, dom: 54, renovated: false, source: 'MLS' },
  { comp_type: 'sales', address: '2475 Tremont St', sales_price: 673000,
    area_sf: 2440, dom: null, renovated: false, source: 'MLS' }
];

function loadFF() {
  return vm.runInContext(`
    currentDeal = ${JSON.stringify(SEED_FF)};
    inputs = ${JSON.stringify(INPUTS_FF)};
    unitMix = [];
    comps = ${JSON.stringify(COMPS_FF)};
    marketAnalysis = {};
    R = {};
    recompute();
    R;
  `, ctx);
}

// ════════════════════════════════════════════════════════════════
// M2 - BRRRR ENGINE (55 tests)
// ════════════════════════════════════════════════════════════════
function runM2() {
  const g = group('M2 BRRRR');
  const R = loadBRRRR();

  // Unit Mix and Income (5)
  check(g, 'total_unit_count', R.total_unit_count, 16);
  check(g, 'gpr_monthly', R.gpr_monthly, 17200);
  check(g, 'gpr_annual', R.gpr_annual, 206400);
  check(g, 'vacancy_loss', R.vacancy_loss, 10320);
  check(g, 'egi', R.egi, 196080);

  // Operating Expenses (8)
  check(g, 'pm_dollars', R.pm_dollars, 13725.60);
  check(g, 'maint_turnover', R.maint_turnover, 10784.40);
  check(g, 'taxes', R.taxes, 5520.00);
  check(g, 'insurance', R.insurance, 15686.40);
  check(g, 'utilities', R.utilities, 3921.60);
  check(g, 'reserves', R.reserves, 16000);
  check(g, 'total_operating_expenses', R.total_operating_expenses, 65638);
  check(g, 'expense_ratio', R.expense_ratio, 0.334751);

  // NOI and Stabilized Valuation (6)
  check(g, 'stabilized_noi', R.stabilized_noi, 130442);
  check(g, 'noi_margin', R.noi_margin, 0.665249);
  check(g, 'stabilized_arv', R.stabilized_arv, 1490765.71);
  check(g, 'arv_per_unit', R.arv_per_unit, 93172.86);
  check(g, 'value_creation', R.value_creation, 457030.31);
  check(g, 'value_creation_pct', R.value_creation_pct, 0.442115);

  // Project Costs and Initial Debt (5)
  check(g, 'closing_costs', R.closing_costs, 37629.20);
  check(g, 'total_project_cost', R.total_project_cost, 1033735.40);
  check(g, 'initial_loan_amt', R.initial_loan_amt, 728560);
  check(g, 'initial_monthly_ds', R.initial_monthly_ds, 6678.47);
  check(g, 'debt_service_pre_refi', R.debt_service_pre_refi, 60106.20);

  // Refinance Mechanics (10)
  check(g, 'refi_loan_amount', R.refi_loan_amount, 1043536);
  check(g, 'refi_monthly_ds', R.refi_monthly_ds, 6942.67);
  check(g, 'refi_annual_ds', R.refi_annual_ds, 83312.05);
  check(g, 'refi_closing_costs', R.refi_closing_costs, 41741.44);
  check(g, 'net_cash_out', R.net_cash_out, 273234.56);
  check(g, 'initial_investor_equity', R.initial_investor_equity, 255175.40);
  check(g, 'capital_returned_at_refi', R.capital_returned_at_refi, 255175.40);
  check(g, 'investor_equity_remaining', R.investor_equity_remaining, 0);
  check(g, 'excess_refi_proceeds', R.excess_refi_proceeds, 18059.16);
  check(g, 'capital_recaptured_pct', R.capital_recaptured_pct, 1.0);

  // Cash Flow and Coverage (5)
  check(g, 'annual_cash_flow', R.annual_cash_flow, 47129.95);
  check(g, 'monthly_cash_flow', R.monthly_cash_flow, 3927.50);
  check(g, 'cf_per_unit', R.cf_per_unit, 2945.62);
  check(g, 'dscr', R.dscr, 1.5657);
  check(g, 'breakeven_occupancy', R.breakeven_occupancy, 0.721657);

  // Disposition (3)
  check(g, 'disposition_value', R.disposition_value, 2428300.26);
  check(g, 'sale_cost', R.sale_cost, 169981.02);
  check(g, 'remaining_loan_balance', R.remaining_loan_balance, 895483.11);

  // Distributions Y0..Y9 (10)
  const d = R.distribution || [];
  check(g, 'Y0', d[0], -255175.40);
  check(g, 'Y1', d[1], 287769.95);
  check(g, 'Y2', d[2], 24271.92);
  check(g, 'Y3', d[3], 25000.08);
  check(g, 'Y4', d[4], 25750.08);
  check(g, 'Y5', d[5], 26522.59);
  check(g, 'Y6', d[6], 27318.26);
  check(g, 'Y7', d[7], 28137.81);
  check(g, 'Y8', d[8], 28981.95);
  check(g, 'Y9', d[9], 29851.40);

  // Y10 + EM/IRR (3)
  check(g, 'Y10 (corrected)', d[10], 712165.01, 0.01);
  check(g, 'equity_multiple (institutional)', R.equity_multiple, 4.7644, 0.01);
  // em_spreadsheet uses corrected Y10 (Y1..Y10 includes recovered cash flow),
  // so it ships at 3.7644 vs the legacy spreadsheet's 3.6440. This is a
  // pre-existing engine design choice; documented in regression-report-m5.md.
  check(g, 'em_spreadsheet (Y0..Y10 sum / equity)', R.em_spreadsheet, 3.7644, 0.01);
}

// ════════════════════════════════════════════════════════════════
// M3 - F&F ENGINE (26 tests)
// ════════════════════════════════════════════════════════════════
function runM3() {
  const g = group('M3 F&F');
  const R = loadFF();

  // Inputs (2)
  check(g, 'total_unit_count', R.total_unit_count, 1);
  check(g, 'subject_area_sf', R.subject_area_sf, 2404);

  // Project Costs (6)
  check(g, 'closing_costs', R.closing_costs, 16214.00);
  check(g, 'consulting', R.consulting, 10000);
  check(g, 'debt_service_pre_sale', R.debt_service_pre_sale, 22669.50);
  check(g, 'total_project_cost', R.total_project_cost, 408883.50);
  check(g, 'total_project_cost_per_unit', R.total_project_cost_per_unit, 408883.50);
  check(g, 'price_per_unit', R.price_per_unit, 240000);

  // Initial Debt (2)
  check(g, 'initial_loan_amt', R.initial_loan_amt, 306000);
  check(g, 'initial_monthly_ds', R.initial_monthly_ds, 3238.50);

  // Comps (2)
  check(g, 'comp_count_sales', R.comp_count_sales, 3);
  check(g, 'comp_avg_psf_spreadsheet', R.comp_avg_psf_spreadsheet, 226.43, 0.01);

  // ARV (5)
  check(g, 'arv', R.arv, 550000);
  check(g, 'arv_per_unit', R.arv_per_unit, 550000);
  check(g, 'disposition_value', R.disposition_value, 550000);
  check(g, 'value_creation', R.value_creation, 141116.50);
  check(g, 'value_creation_pct', R.value_creation_pct, 0.345126);

  // Investor Returns (6)
  check(g, 'sale_cost', R.sale_cost, 38500);
  check(g, 'remaining_loan_balance', R.remaining_loan_balance, 306000);
  check(g, 'investor_equity (spreadsheet method)', R.investor_equity, 65683.50);
  check(g, 'gross_proceeds', R.gross_proceeds, 139816.50);
  check(g, 'net_investor_proceeds', R.net_investor_proceeds, 69908.25);
  check(g, 'investor_roi', R.investor_roi, 1.064320);

  // Documented improvements (3)
  check(g, 'comp_avg_psf (institutional)', R.comp_avg_psf, 227.69, 0.01);
  check(g, 'comp_avg_dom (institutional, n=2)', R.comp_avg_dom, 58.00);
  check(g, 'investor_equity_institutional', R.investor_equity_institutional, 102883.50);
}

// ════════════════════════════════════════════════════════════════
// M4 - MARKET STRENGTH SCORE (34 tests)
// ════════════════════════════════════════════════════════════════
function runM4() {
  const g = group('M4 Market');

  // Strong-market fixture (5)
  const strong = vm.runInContext(`
    computeMarketDerived(
      {
        median_household_income: 95000, rental_vacancy_rate: 0.04,
        unemployment_rate: 0.03, bachelors_or_higher_pct: 0.55, poverty_rate: 0.05,
        renter_pct: 0.35, owner_occupied_pct: 0.65, median_rent: 1800
      },
      null
    );
  `, ctx);
  check(g, 'strong: composite >= 75 (A or B+)', strong.market_strength_score >= 75 ? 1 : 0, 1);
  check(g, 'strong: vacancy component >= 90', (strong.component_scores && strong.component_scores.vacancy >= 90) ? 1 : 0, 1);
  check(g, 'strong: unemployment >= 90', (strong.component_scores && strong.component_scores.unemployment >= 90) ? 1 : 0, 1);
  check(g, 'strong: grade A or B+', ['A', 'B+'].includes(strong.market_strength_grade) ? 1 : 0, 1);
  const strongRisks = vm.runInContext(`
    computeMarketRisks(
      { median_household_income: 95000, rental_vacancy_rate: 0.04,
        unemployment_rate: 0.03, poverty_rate: 0.05 },
      { market_strength_score: ${strong.market_strength_score}, market_strength_grade: '${strong.market_strength_grade}', rent_to_income_ratio: 0.23 }
    );
  `, ctx);
  check(g, 'strong: 0 risks fire', strongRisks.length, 0);

  // Distressed-market fixture (12)
  const distressed = vm.runInContext(`
    computeMarketDerived(
      { median_household_income: 22000, rental_vacancy_rate: 0.18,
        unemployment_rate: 0.16, bachelors_or_higher_pct: 0.08, poverty_rate: 0.38,
        renter_pct: 0.75, owner_occupied_pct: 0.25, median_rent: 700 },
      null
    );
  `, ctx);
  const dc = distressed.component_scores || {};
  check(g, 'distressed: composite <= 55', distressed.market_strength_score <= 55 ? 1 : 0, 1);
  check(g, 'distressed: vacancy <= 35', dc.vacancy <= 35 ? 1 : 0, 1);
  check(g, 'distressed: unemployment <= 45', dc.unemployment <= 45 ? 1 : 0, 1);
  check(g, 'distressed: income <= 55', dc.income <= 55 ? 1 : 0, 1);
  check(g, 'distressed: poverty <= 50', dc.poverty <= 50 ? 1 : 0, 1);
  check(g, 'distressed: education <= 45', dc.education <= 45 ? 1 : 0, 1);
  check(g, 'distressed: grade is D or F', ['D', 'F'].includes(distressed.market_strength_grade) ? 1 : 0, 1);

  const distRisks = vm.runInContext(`
    computeMarketRisks(
      { median_household_income: 22000, rental_vacancy_rate: 0.18,
        unemployment_rate: 0.16, poverty_rate: 0.38 },
      { market_strength_score: ${distressed.market_strength_score}, market_strength_grade: '${distressed.market_strength_grade}', rent_to_income_ratio: 0.42 }
    );
  `, ctx);
  check(g, 'distressed: >= 5 risks fire', distRisks.length >= 5 ? 1 : 0, 1);
  check(g, 'distressed: vacancy-high risk fires', distRisks.some(r => r.title === 'Elevated rental vacancy') ? 1 : 0, 1);
  check(g, 'distressed: unemployment-high risk fires', distRisks.some(r => r.title === 'Elevated unemployment') ? 1 : 0, 1);
  check(g, 'distressed: income-low risk fires', distRisks.some(r => r.title === 'Median income below institutional floor') ? 1 : 0, 1);
  check(g, 'distressed: composite-weak risk fires', distRisks.some(r => r.title === 'Weak composite market score') ? 1 : 0, 1);

  // 44103 Cleveland fixture (5)
  const cle = vm.runInContext(`
    computeMarketDerived(
      { median_household_income: 27047, rental_vacancy_rate: 0.12,
        unemployment_rate: 0.157, bachelors_or_higher_pct: 0.15, poverty_rate: 0.30,
        renter_pct: 0.60, owner_occupied_pct: 0.40, median_rent: 779 },
      null
    );
  `, ctx);
  const cc = cle.component_scores || {};
  check(g, '44103: composite 40-65 range', (cle.market_strength_score >= 40 && cle.market_strength_score <= 65) ? 1 : 0, 1);
  check(g, '44103: grade C/C+/D', ['C', 'C+', 'D'].includes(cle.market_strength_grade) ? 1 : 0, 1);
  check(g, '44103: rent_to_income 30-40% band', (cle.rent_to_income_ratio > 0.30 && cle.rent_to_income_ratio < 0.40) ? 1 : 0, 1);
  check(g, '44103: vacancy score in penalty zone', cc.vacancy <= 70 ? 1 : 0, 1);
  check(g, '44103: income score below threshold', cc.income <= 60 ? 1 : 0, 1);

  // Edge cases (4)
  let noThrow = true;
  try {
    vm.runInContext(`computeMarketDerived(null, null);`, ctx);
  } catch (e) { noThrow = false; }
  check(g, 'edge: null census does not throw', noThrow ? 1 : 0, 1);

  const partial = vm.runInContext(`
    computeMarketDerived(
      { median_household_income: null, rental_vacancy_rate: null,
        unemployment_rate: null },
      null
    );
  `, ctx);
  check(g, 'edge: partial returns neutral baseline', (partial.market_strength_score >= 30 && partial.market_strength_score <= 75) ? 1 : 0, 1);

  const zeroVac = vm.runInContext(`
    _scoreVacancy(0);
  `, ctx);
  check(g, 'edge: zero vacancy scored as suspicious (<= 60)', zeroVac <= 60 ? 1 : 0, 1);

  const emptyRisks = vm.runInContext(`computeMarketRisks(null, null);`, ctx);
  check(g, 'edge: null inputs returns empty risks array', emptyRisks.length, 0);

  // FMR normalization (5)
  // Actual signature: _normalizeFmr(data, smallarea, zip). When smallarea
  // is true, data is an array of per-zip rows. Returns {fmr, fmr_by_zip, fmr_source}.
  const safmrArray = [
    { zip_code: '44103', 'Efficiency': 700, 'One-Bedroom': 800, 'Two-Bedroom': 950, 'Three-Bedroom': 1200, 'Four-Bedroom': 1400 },
    { zip_code: '44113', 'Efficiency': 720, 'One-Bedroom': 820, 'Two-Bedroom': 975, 'Three-Bedroom': 1250, 'Four-Bedroom': 1450 }
  ];
  const safmrA = vm.runInContext(`_normalizeFmr(${JSON.stringify(safmrArray)}, true, '44103');`, ctx);
  check(g, 'SAFMR: finds subject zip row', safmrA.fmr && safmrA.fmr.br2, 950);
  check(g, 'SAFMR: source = subject_zip', safmrA.fmr_source === 'subject_zip' ? 1 : 0, 1);
  check(g, 'SAFMR: exposes other zips', (safmrA.fmr_by_zip && safmrA.fmr_by_zip['44113'] && safmrA.fmr_by_zip['44113'].br2 === 975) ? 1 : 0, 1);

  const msaObj = { 'Efficiency': 650, 'One-Bedroom': 750, 'Two-Bedroom': 900, 'Three-Bedroom': 1100, 'Four-Bedroom': 1300 };
  const msa = vm.runInContext(`_normalizeFmr(${JSON.stringify(msaObj)}, false, '11111');`, ctx);
  check(g, 'MSA: returns single FMR', msa.fmr && msa.fmr.br2, 900);
  check(g, 'MSA: fmr_by_zip is null', msa.fmr_by_zip == null ? 1 : 0, 1);
}

// ════════════════════════════════════════════════════════════════
// M5 - ENGINE RISKS + ASSEMBLY (31 tests)
// ════════════════════════════════════════════════════════════════
function runM5() {
  const g = group('M5 Risks');

  // ── BRRRR engine-risks against clean 2048 deal (5)
  // The "clean" 2048 deal trips exactly one medium-severity risk: contingency.
  // $50,000 mobilization / $1,033,735 TPC = 4.84%, just under the 5% threshold.
  // DSCR 1.566, capital recapture 100%, in-basis 51%, value creation 44%,
  // refi LTV 70% all pass. Documented in regression-report-m5.md.
  loadBRRRR();
  const cleanBrrrrRisks = vm.runInContext('R.engine_risks || [];', ctx);
  check(g, 'BRRRR-001 clean: engine_risks defined', Array.isArray(cleanBrrrrRisks) ? 1 : 0, 1);
  check(g, 'BRRRR-001 clean: no DSCR risk', cleanBrrrrRisks.some(r => r.id === 'eng_dscr_low') ? 1 : 0, 0);
  check(g, 'BRRRR-001 clean: no recapture risk', cleanBrrrrRisks.some(r => r.id === 'eng_capital_recapture_low') ? 1 : 0, 0);
  check(g, 'BRRRR-001 clean: no in-basis risk', cleanBrrrrRisks.some(r => r.id === 'eng_in_basis_high') ? 1 : 0, 0);
  check(g, 'BRRRR-001 clean: contingency medium risk fires (4.84% < 5%)',
    cleanBrrrrRisks.find(r => r.id === 'eng_contingency_low' && r.severity === 'medium') ? 1 : 0, 1);

  // ── BRRRR engine-risks against stressed inputs (6)
  // Stress: drop refi rate-quality so DSCR collapses; raise refi LTV; lower contingency.
  const stressedInputs = Object.assign({}, INPUTS_BRRRR, {
    refi_rate: 0.12,                  // brutal rate -> DSCR will drop
    target_refi_ltv: 0.82,            // > 80% refi LTV (high tier)
    exit_cap: 0.06,                   // aggressive compression
    mobilization_contingency: 5000    // <3% of TPC
  });
  const stressedRisks = vm.runInContext(`
    currentDeal = ${JSON.stringify(SEED_BRRRR)};
    inputs = ${JSON.stringify(stressedInputs)};
    unitMix = ${JSON.stringify(UNITMIX_BRRRR)};
    comps = []; marketAnalysis = {}; R = {};
    recompute();
    R.engine_risks || [];
  `, ctx);
  check(g, 'BRRRR stressed: DSCR risk fires', stressedRisks.some(r => r.id === 'eng_dscr_low') ? 1 : 0, 1);
  check(g, 'BRRRR stressed: refi LTV risk fires', stressedRisks.some(r => r.id === 'eng_refi_ltv_high') ? 1 : 0, 1);
  check(g, 'BRRRR stressed: refi LTV high-severity', stressedRisks.find(r => r.id === 'eng_refi_ltv_high' && r.severity === 'high') ? 1 : 0, 1);
  check(g, 'BRRRR stressed: contingency risk fires', stressedRisks.some(r => r.id === 'eng_contingency_low') ? 1 : 0, 1);
  check(g, 'BRRRR stressed: contingency is high-severity', stressedRisks.find(r => r.id === 'eng_contingency_low' && r.severity === 'high') ? 1 : 0, 1);
  check(g, 'BRRRR stressed: breakeven elevated fires', stressedRisks.some(r => r.id === 'eng_breakeven_high') ? 1 : 0, 1);

  // ── F&F engine-risks against 2455 deal (3)
  loadFF();
  const cleanFFRisks = vm.runInContext('R.engine_risks || [];', ctx);
  // 2455: 3 valid comps (pass count), ARV override 550k vs comp-derived ~547k (within 10%),
  // value creation 34.5% (well above 15%), but DOM avg is 58 (below 75), contingency 7.3% of TPC (above 5%).
  // Expected: no engine risks fire on the clean F&F seed.
  check(g, 'FF-001 clean: comp_count_low does not fire (3 comps)', cleanFFRisks.some(r => r.id === 'eng_comp_count_low') ? 1 : 0, 0);
  check(g, 'FF-001 clean: dom_high does not fire (58 days)', cleanFFRisks.some(r => r.id === 'eng_dom_high') ? 1 : 0, 0);
  check(g, 'FF-001 clean: ff_value_creation does not fire (34.5%)', cleanFFRisks.some(r => r.id === 'eng_value_creation_thin_ff') ? 1 : 0, 0);

  // ── F&F engine-risks against stressed inputs (5)
  // Stress: only 1 comp, huge ARV override, no contingency.
  const stressedFFInputs = Object.assign({}, INPUTS_FF, {
    arv_override: 800000,
    mobilization_contingency: 1000   // <3% of TPC
  });
  const stressedFFComps = [
    { comp_type: 'sales', address: 'A', sales_price: 400000, area_sf: 1500, dom: 130, renovated: false, source: 'MLS' }
  ];
  const stressedFFRisks = vm.runInContext(`
    currentDeal = ${JSON.stringify(SEED_FF)};
    inputs = ${JSON.stringify(stressedFFInputs)};
    unitMix = [];
    comps = ${JSON.stringify(stressedFFComps)};
    marketAnalysis = {}; R = {};
    recompute();
    R.engine_risks || [];
  `, ctx);
  check(g, 'FF stressed: comp count risk fires', stressedFFRisks.some(r => r.id === 'eng_comp_count_low') ? 1 : 0, 1);
  check(g, 'FF stressed: comp count is high-severity', stressedFFRisks.find(r => r.id === 'eng_comp_count_low' && r.severity === 'high') ? 1 : 0, 1);
  check(g, 'FF stressed: DOM risk fires', stressedFFRisks.some(r => r.id === 'eng_dom_high') ? 1 : 0, 1);
  check(g, 'FF stressed: ARV override risk fires', stressedFFRisks.some(r => r.id === 'eng_arv_override_high') ? 1 : 0, 1);
  check(g, 'FF stressed: contingency risk fires', stressedFFRisks.some(r => r.id === 'eng_ff_contingency_low') ? 1 : 0, 1);

  // ── Severity tiering: medium vs high (4)
  // DSCR just below 1.20 (medium), DSCR just below 1.05 (high).
  // Use F&F-clean-style isolation: directly call computeEngineRisks with synthetic R.
  const sevMedDscr = vm.runInContext(`
    computeEngineRisks('brrrr',
      { dscr: 1.10, stabilized_arv: 1000000, refi_loan_amount: 700000, breakeven_occupancy: 0.6, capital_recaptured_pct: 0.95, post_refi_in_basis_pct: 0.5, total_project_cost: 1000000, value_creation_pct: 0.30 },
      { mobilization_contingency: 100000 },
      []
    );
  `, ctx);
  check(g, 'severity: DSCR 1.10 fires medium', sevMedDscr.find(r => r.id === 'eng_dscr_low' && r.severity === 'medium') ? 1 : 0, 1);

  const sevHighDscr = vm.runInContext(`
    computeEngineRisks('brrrr',
      { dscr: 0.95, stabilized_arv: 1000000, refi_loan_amount: 700000, breakeven_occupancy: 0.6, capital_recaptured_pct: 0.95, post_refi_in_basis_pct: 0.5, total_project_cost: 1000000, value_creation_pct: 0.30 },
      { mobilization_contingency: 100000 },
      []
    );
  `, ctx);
  check(g, 'severity: DSCR 0.95 fires high', sevHighDscr.find(r => r.id === 'eng_dscr_low' && r.severity === 'high') ? 1 : 0, 1);

  const sevMedRecapture = vm.runInContext(`
    computeEngineRisks('brrrr',
      { dscr: 1.5, stabilized_arv: 1000000, refi_loan_amount: 700000, breakeven_occupancy: 0.6, capital_recaptured_pct: 0.70, post_refi_in_basis_pct: 0.5, total_project_cost: 1000000, value_creation_pct: 0.30 },
      { mobilization_contingency: 100000 },
      []
    );
  `, ctx);
  check(g, 'severity: recapture 70% fires medium', sevMedRecapture.find(r => r.id === 'eng_capital_recapture_low' && r.severity === 'medium') ? 1 : 0, 1);

  const sevHighRecapture = vm.runInContext(`
    computeEngineRisks('brrrr',
      { dscr: 1.5, stabilized_arv: 1000000, refi_loan_amount: 700000, breakeven_occupancy: 0.6, capital_recaptured_pct: 0.50, post_refi_in_basis_pct: 0.5, total_project_cost: 1000000, value_creation_pct: 0.30 },
      { mobilization_contingency: 100000 },
      []
    );
  `, ctx);
  check(g, 'severity: recapture 50% fires high', sevHighRecapture.find(r => r.id === 'eng_capital_recapture_low' && r.severity === 'high') ? 1 : 0, 1);

  // ── Comp CV detection (2)
  const cvHigh = vm.runInContext(`
    computeEngineRisks('fix_and_flip',
      { value_creation_pct: 0.30, comp_count_sales: 4, arv: 500000, comp_derived_arv: 500000, arv_source: 'comp', total_project_cost: 400000, comp_avg_dom: 50 },
      { mobilization_contingency: 25000 },
      [
        { comp_type: 'sales', sales_price: 200000, area_sf: 1000, dom: 50 },
        { comp_type: 'sales', sales_price: 300000, area_sf: 1000, dom: 50 },
        { comp_type: 'sales', sales_price: 500000, area_sf: 1000, dom: 50 },
        { comp_type: 'sales', sales_price: 700000, area_sf: 1000, dom: 50 }
      ]
    );
  `, ctx);
  check(g, 'CV: high dispersion fires comp_cv risk', cvHigh.some(r => r.id === 'eng_comp_cv_high') ? 1 : 0, 1);

  const cvLow = vm.runInContext(`
    computeEngineRisks('fix_and_flip',
      { value_creation_pct: 0.30, comp_count_sales: 3, arv: 500000, comp_derived_arv: 500000, arv_source: 'comp', total_project_cost: 400000, comp_avg_dom: 50 },
      { mobilization_contingency: 25000 },
      [
        { comp_type: 'sales', sales_price: 500000, area_sf: 2500, dom: 50 },
        { comp_type: 'sales', sales_price: 510000, area_sf: 2550, dom: 50 },
        { comp_type: 'sales', sales_price: 520000, area_sf: 2600, dom: 50 }
      ]
    );
  `, ctx);
  check(g, 'CV: tight dispersion does not fire', cvLow.some(r => r.id === 'eng_comp_cv_high') ? 1 : 0, 0);

  // ── Assembly + persistence + sort (6)
  loadBRRRR();
  // Inject a fake market risk and a custom risk via currentDeal.risks.
  vm.runInContext(`
    R.market_risks = [
      { severity: 'high', category: 'market', title: 'Elevated rental vacancy', detail: 'Test market risk.' }
    ];
    currentDeal.risks = [
      { id: 'cust_test1', source: 'custom', custom: true, severity: 'medium', category: 'Diligence', title: 'Roof age uncertain', detail: 'Pending inspection.', mitigation: '', resolved: false },
      { id: 'mkt_vacancy_high', source: 'market', mitigation: 'PBV path may bypass vacancy.', resolved: false }
    ];
  `, ctx);

  const assembled = vm.runInContext(`assembleRisks();`, ctx);
  check(g, 'assembly: includes market risk', assembled.some(r => r.source === 'market') ? 1 : 0, 1);
  check(g, 'assembly: includes custom risk', assembled.some(r => r.source === 'custom') ? 1 : 0, 1);
  check(g, 'assembly: market risk picks up persisted mitigation', assembled.find(r => r.id === 'mkt_vacancy_high' && r.mitigation === 'PBV path may bypass vacancy.') ? 1 : 0, 1);

  // Mark the high market risk as resolved, confirm it sinks to bottom.
  vm.runInContext(`setRiskResolved('mkt_vacancy_high', 'market', true);`, ctx);
  const sorted = vm.runInContext(`assembleRisks();`, ctx);
  check(g, 'sort: resolved sinks to bottom', sorted[sorted.length - 1].id === 'mkt_vacancy_high' ? 1 : 0, 1);

  const counts = vm.runInContext(`getRiskBannerCounts();`, ctx);
  check(g, 'banner counts: resolved excluded from high', counts.high === 0 ? 1 : 0, 1);

  // Banner HTML output (clear case)
  const cleanBanner = vm.runInContext(`renderRiskBannerHTML();`, ctx);
  check(g, 'banner: clear text when no unresolved high', cleanBanner.includes('No unresolved risks') || cleanBanner.includes('medium-severity') ? 1 : 0, 1);
}

// ════════════════════════════════════════════════════════════════
// M6 - PRINT PIPELINE FOUNDATION (8 tests)
// ════════════════════════════════════════════════════════════════
function runM6() {
  const g = group('M6 Print');

  // Load print.js into its own sandbox with a stub window so we can
  // inspect parsePrintHash / PRINT_REPORTS / openPrintTab plumbing.
  const printCtx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON,
    isFinite, isNaN, parseFloat, parseInt,
    window: { location: { hash: '', pathname: '/index.html' }, open: () => null },
    document: { createElement: () => ({ id: '', rel: '', href: '' }), getElementById: () => null, head: { appendChild: () => null }, body: { appendChild: () => null }, title: '' },
    alert: () => null,
    setTimeout: (fn, ms) => null
  });
  printCtx.globalThis = printCtx;
  vm.runInContext(`let sb, currentDeal, inputs, unitMix, comps, marketAnalysis, overrides, riskRegister, R;`, printCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'print.js'), 'utf8'), printCtx, { filename: 'print.js' });

  // Route parser: positive case
  printCtx.window.location.hash = '#/print/deal-snapshot/abc-123-def';
  const parsed = vm.runInContext('parsePrintHash();', printCtx);
  check(g, 'parsePrintHash: extracts reportType', parsed && parsed.reportType === 'deal-snapshot' ? 1 : 0, 1);
  check(g, 'parsePrintHash: extracts dealId', parsed && parsed.dealId === 'abc-123-def' ? 1 : 0, 1);

  // Route parser: negative cases
  printCtx.window.location.hash = '#dashboard';
  check(g, 'parsePrintHash: rejects non-print hash', vm.runInContext('parsePrintHash();', printCtx) == null ? 1 : 0, 1);
  printCtx.window.location.hash = '';
  check(g, 'isPrintHash: false on empty hash', vm.runInContext('isPrintHash();', printCtx) === false ? 1 : 0, 1);

  // PRINT_REPORTS catalog
  const reports = vm.runInContext('Object.keys(PRINT_REPORTS);', printCtx);
  check(g, 'PRINT_REPORTS: 6 report types registered', reports.length, 6);
  checkExact(g, 'PRINT_REPORTS: contains deal-snapshot', reports.includes('deal-snapshot'), true);
  checkExact(g, 'PRINT_REPORTS: contains hud-vash-package', reports.includes('hud-vash-package'), true);

  // Filename safety: strip path separators, collapse whitespace
  const filenameTest = vm.runInContext(`_safeFilename('Hidden Villas / Decatur (4%)');`, printCtx);
  check(g, '_safeFilename: strips slashes and parens', filenameTest, 'Hidden_Villas_Decatur_4');
}

// ════════════════════════════════════════════════════════════════
// Run
// ════════════════════════════════════════════════════════════════
runM2();
runM3();
runM4();
runM5();
runM6();

// ── Report ────────────────────────────────────────────────────
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('FOUNDRY REGRESSION RESULTS');
console.log('════════════════════════════════════════════════════════');
for (const gName of Object.keys(results.byGroup)) {
  const g = results.byGroup[gName];
  const total = g.pass + g.fail;
  const status = g.fail === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${gName.padEnd(20)} ${String(g.pass).padStart(3)}/${String(total).padStart(3)}  ${status}`);
  if (g.fail > 0) {
    for (const f of g.failures) {
      console.log(`     × ${f.label}: got ${f.actual} expected ${f.expected}`);
    }
  }
}
console.log('────────────────────────────────────────────────────────');
const total = results.pass + results.fail;
const overall = results.fail === 0 ? 'PASS' : 'FAIL';
console.log(`  TOTAL                ${String(results.pass).padStart(3)}/${String(total).padStart(3)}  ${overall}`);
console.log('════════════════════════════════════════════════════════');
process.exit(results.fail === 0 ? 0 : 1);
