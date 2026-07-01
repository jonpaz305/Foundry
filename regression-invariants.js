// ════════════════════════════════════════════════════════════════
// Foundry ENGINE INVARIANTS - accounting-identity guardrail
// ════════════════════════════════════════════════════════════════
// Complements regression-all.js. Where regression-all.js pins specific
// deals to known-good numbers ("does 2048 E 79th still score 428/428?"),
// this file asserts that the engine's outputs are INTERNALLY CONSISTENT
// for EVERY combination of inputs across a fuzz grid - regardless of the
// specific values. It encodes the accounting identities that must always
// hold, so a future change that decouples a derived figure from the
// input it depends on fails here instead of shipping silently.
//
// This is the guardrail that caught the ARV/tax decoupling: when the ARV
// was overridden, taxes stayed frozen on the income-approach value, so
// `taxes = ARV_in_use * rate` was violated for every stabilized-ARV deal
// with an override. Run this on every change to the engine.
//
// Run:  node regression-invariants.js
// Exit: 0 if all identities hold, 1 if any is violated.
// Place next to engine.js / market.js / risk.js (loads them from __dirname).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const sb = { console, Math, JSON, Number, String, Boolean, Array, Object,
  isFinite, isNaN, parseFloat, parseInt, Date,
  alert: () => {}, confirm: () => true, setTimeout: () => null };
sb.globalThis = sb;
const ctx = vm.createContext(sb);
const loadJS = n => vm.runInContext(fs.readFileSync(path.join(DIR, n), 'utf8'), ctx, { filename: n });

vm.runInContext(`
  let currentDeal=null, inputs={}, unitMix=[], comps=[], marketAnalysis={}, R={};
  var DEAL_PHOTOS=[];
  function getDealMode(){ return currentDeal && currentDeal.deal_mode ? currentDeal.deal_mode : 'brrrr'; }
  function updateDashboard(){} function navTo(){} function saveDeal(){}
`, ctx);
loadJS('market.js');
loadJS('engine.js');
loadJS('risk.js');

const SEED = { id:'inv', deal_mode:'brrrr', asset_type:'commercial_multifamily', name:'inv', risks:[] };
const BASE = {
  city:'Cleveland', state:'OH', zip:'44103', asset_type:'commercial_multifamily', tax_district:'Cleveland',
  target_refi_months:9, target_hold_years:10, target_refi_ltv:0.70, vacancy_pct:0.05, pm_pct:0.07,
  maint_pct_of_egi:0.055, insurance_pct_of_egi:0.08, utilities_pct_of_egi:0.02, reserves_per_unit_year:1000,
  rent_growth_pct:0.03, appreciation_pct:0.05, sale_cost_pct:0.07, capex_budget:616000, gc_contingency:50000,
  consulting_fees_override:30000, closing_cost_baseline:2444, origination_pct:0.025, lender_points_pct:0.020,
  closing_cost_transfer_addon:2400, initial_loan_ltv:0.70, initial_loan_ltc_capex:0.91, initial_rate:0.11,
  initial_interest_type:'IO', refi_rate:0.07, refi_interest_type:'PI', refi_closing_cost_pct:0.04,
  investor_ownership:0.5, subject_area_sf:8000
};
const UM = [ { bed_type:'1br', count:2, rent:900 }, { bed_type:'2br', count:14, rent:1100 } ];
const COMPS = [
  { comp_type:'sales', sales_price:1400000, area_sf:8000, renovated:true },
  { comp_type:'sales', sales_price:1500000, area_sf:8200, renovated:true },
  { comp_type:'sales', sales_price:1350000, area_sf:7800, renovated:true }
];

function run(extra) {
  const inp = Object.assign({}, BASE, extra);
  const comps = extra.__comps || [];
  return vm.runInContext(`
    currentDeal=${JSON.stringify(SEED)}; inputs=${JSON.stringify(inp)}; unitMix=${JSON.stringify(UM)};
    comps=${JSON.stringify(comps)}; marketAnalysis={}; R={}; recompute(); R;
  `, ctx);
}

const rel = (a, b) => { if (b === 0) return Math.abs(a) < 1e-6 ? 0 : 1; return Math.abs(a - b) / Math.abs(b); };
let checks = 0;
const viol = [];
function inv(cond, label, c) { checks++; if (!cond) viol.push({ label, c }); }

const PP  = [180000, 240000, 320000];
const EC  = [0.07, 0.0875, 0.10];
const TB  = ['stabilized_arv', 'purchase_price'];
const SRC = ['income_approach', 'manual_override', 'comp_derived'];
const OVR = [900000, 1300000, 1800000];

for (const pp of PP) for (const ec of EC) for (const tb of TB) for (const src of SRC) {
  // Reference income-approach run recovers the effective tax rate for this config.
  const ref = run({ purchase_price:pp, exit_cap:ec, tax_basis_mode:tb, arv_source:'income_approach', __comps:[] });
  const arvRate = ref.stabilized_arv > 0 ? ref.taxes / ref.stabilized_arv : 0;
  const ppRate  = pp > 0 ? ref.taxes / pp : 0;
  const ovrList = src === 'income_approach' ? [null] : OVR;
  const comps   = src === 'comp_derived' ? COMPS : [];
  for (const ov of ovrList) {
    const extra = { purchase_price:pp, exit_cap:ec, tax_basis_mode:tb, arv_source:src, __comps:comps };
    if (src === 'manual_override') extra.arv_override_brrrr = ov;
    const R = run(extra);
    const c = { pp, ec, tb, src, ov };
    inv(rel(R.stabilized_noi, R.egi - R.total_operating_expenses) < 1e-6, 'NOI = EGI - OPEX', c);
    inv(R.egi <= 0 || rel(R.expense_ratio, R.total_operating_expenses / R.egi) < 1e-6, 'expense_ratio = OPEX/EGI', c);
    if (R.stabilized_arv > 0) inv(rel(R.implied_cap_rate, R.stabilized_noi / R.stabilized_arv) < 1e-4, 'implied_cap = NOI/ARV', c);
    inv(rel(R.refi_loan_amount, R.stabilized_arv * BASE.target_refi_ltv) < 1e-6, 'refi_loan = ARV * refi_ltv', c);
    if (R.refi_annual_ds > 0) inv(rel(R.dscr, R.stabilized_noi / R.refi_annual_ds) < 1e-4, 'dscr = NOI/refi_ds', c);
    // Tax basis consistency - the identity that catches ARV/tax decoupling.
    if (tb === 'purchase_price') inv(rel(R.taxes, pp * ppRate) < 1e-4, 'taxes = purchase_price * rate', c);
    else if (R.stabilized_arv > 0) inv(rel(R.taxes, R.stabilized_arv * arvRate) < 1e-4, 'taxes = ARV_in_use * rate', c);
  }
}

console.log('Foundry engine invariants');
console.log('checks: ' + checks + '   violations: ' + viol.length);
if (viol.length) {
  const byLabel = {};
  viol.forEach(v => { byLabel[v.label] = (byLabel[v.label] || 0) + 1; });
  console.log('violations by identity: ' + JSON.stringify(byLabel));
  viol.slice(0, 8).forEach(v => console.log('  ' + v.label + '  ' + JSON.stringify(v.c)));
  process.exit(1);
} else {
  console.log('ALL IDENTITIES HOLD');
  process.exit(0);
}
