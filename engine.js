// ════════════════════════════════════════════════════════════════
// FOUNDRY - Engine (BRRRR + F&F pricing math)
// ════════════════════════════════════════════════════════════════
//
// This module is a faithful port of the two spreadsheet engines
// in the ASJP analysis templates, with two documented corrections:
//
//   1. Y10 cash-flow recovery (BRRRR)
//      The spreadsheet's E65 formula references H17 which is blank,
//      silently dropping the Y10 operating cash flow. Foundry sets
//      Y10 to the correctly grown Y9 cash flow plus net disposition
//      proceeds. Footnoted in reports as a documented deviation.
//
//   2. Equity multiple definition (BRRRR)
//      The spreadsheet's E73 formula sums Y0 through Y10 including
//      the negative Y0 (initial equity), yielding a non-standard
//      EM ~ 1.0 less than the institutional definition. Foundry
//      computes EM as (sum of Y1..Y10 distributions) / initial
//      equity, which is the institutional standard.
//
// All other formulas mirror the spreadsheet exactly (closing cost
// formula, initial loan amount, debt service IO/PI, refi mechanics,
// distribution waterfall, disposition value, sale cost, remaining
// loan balance, EM, IRR).
//
// PUBLIC INTERFACE
//   recompute()       - called from core.js after any input change.
//                       Reads inputs, unitMix, comps, marketAnalysis,
//                       writes the canonical engine output to R.
//
// All writes target R; no other module mutates R. Read-only from UI.
// ════════════════════════════════════════════════════════════════


// ── CUYAHOGA TAX RATES (residential / commercial as % of market) ──
// Extracted from the spreadsheet's TaxRates_Cuyahoga sheet.
// Static reference data, ships with the app.
const CUYAHOGA_TAX_RATES = {
  'Bay Village': [0.0238, 0.0352],
  'Beachwood': [0.0176, 0.0259],
  'Beachwood / Warrensville': [0.0185, 0.0292],
  'Bedford': [0.0249, 0.0346],
  'Bedford Heights': [0.0249, 0.0347],
  'Bedford Heights / Orange': [0.0232, 0.033],
  'Bentleyville': [0.0214, 0.0294],
  'Berea': [0.0197, 0.0304],
  'Berea / Olmsted Falls': [0.0226, 0.0305],
  'Bratenahl': [0.0226, 0.0367],
  'Brecksville': [0.0186, 0.0274],
  'Broadview Heights': [0.0191, 0.0281],
  'Broadview Heights / North Royalton': [0.0203, 0.0248],
  'Brooklyn': [0.023, 0.03],
  'Brooklyn Heights': [0.0165, 0.0254],
  'Brooklyn Heights / Parma': [0.017, 0.0244],
  'Brook Park': [0.0175, 0.0275],
  'Brook Park / Cleveland': [0.0205, 0.0334],
  'Chagrin Falls Township': [0.0197, 0.028],
  'Chagrin Falls Village': [0.0213, 0.0302],
  'Cleveland': [0.023, 0.0362],
  'Cleveland / Berea': [0.02, 0.0303],
  'Cleveland / Shaker Heights': [0.0358, 0.0508],
  'Cleveland Heights': [0.0286, 0.0464],
  'Cleveland Heights / East Cleveland': [0.0208, 0.0347],
  'Cuyahoga Heights': [0.0165, 0.0254],
  'East Cleveland': [0.0209, 0.0348],
  'Euclid': [0.0218, 0.0338],
  'Fairview Park': [0.0231, 0.0348],
  'Fairview Park / Berea': [0.0201, 0.0304],
  'Fairview Park / Rocky River': [0.0202, 0.0337],
  'Garfield Heights': [0.0261, 0.0315],
  'Garfield Heights / Cleveland': [0.027, 0.0406],
  'Gates Mills': [0.0225, 0.0334],
  'Glenwillow': [0.0191, 0.0301],
  'Highland Heights': [0.0225, 0.0324],
  'Highland Hills Village': [0.0219, 0.0332],
  'Hunting Valley': [0.0214, 0.0307],
  'Independence': [0.0162, 0.0207],
  'Lakewood': [0.0224, 0.0345],
  'Linndale': [0.0199, 0.0327],
  'Lyndhurst': [0.0263, 0.04],
  'Maple Heights': [0.0247, 0.0318],
  'Mayfield Heights': [0.0222, 0.0325],
  'Mayfield Village': [0.0203, 0.0303],
  'Middleburg Heights': [0.0175, 0.0276],
  'Moreland Hills / Chargin Fall': [0.0227, 0.0312],
  'Moreland Hills / Orange': [0.0198, 0.0289],
  'Newburgh Heights': [0.025, 0.0421],
  'North Olmsted': [0.0237, 0.0375],
  'North Oldmsted / Olmstead Falls': [0.0228, 0.0303],
  'North Randall': [0.0191, 0.0298],
  'North Royalton': [0.0191, 0.0236],
  'North Royalton / Brecksville': [0.0179, 0.0268],
  'Oakwood': [0.0194, 0.0283],
  'Olmsted Falls': [0.0215, 0.0293],
  'Olmsted Falls / Berea': [0.0183, 0.0288],
  'Olmsted Township': [0.024, 0.0327],
  'Orange': [0.0186, 0.0278],
  'Orange / Warrensville': [0.0202, 0.031],
  'Parma': [0.0177, 0.0255],
  'Parma Heights': [0.0191, 0.0267],
  'Pepper Pike': [0.019, 0.0285],
  'Pepper Pike / Beachwood': [0.0197, 0.0286],
  'Pichmond Heights': [0.0241, 0.033],
  'Richmond Heights / South Euclid': [0.0271, 0.0412],
  'Rocky River': [0.0193, 0.0326],
  'Seven Hills': [0.0191, 0.0271],
  'Shaker Heights': [0.035, 0.0499],
  'Solon': [0.0192, 0.0302],
  'Solon / Orange': [0.0176, 0.0266],
  'South Euclid': [0.0276, 0.0424],
  'South Euclid / Cleveland Heights': [0.0296, 0.0486],
  'Strongsville': [0.0164, 0.0254],
  'University Heights': [0.0288, 0.0467],
  'Valley View': [0.017, 0.0262],
  'Walton Hills': [0.0192, 0.0282],
  'Warrensville Heights': [0.0196, 0.0308],
  'Warrensville / Orange': [0.018, 0.0275],
  'Westlake': [0.0164, 0.0232],
  'Woodmere': [0.0178, 0.0268]
};

function lookupCuyahogaTaxRate(district, assetType) {
  if (!district) return null;
  const row = CUYAHOGA_TAX_RATES[district];
  if (!row) return null;
  // Column 1 (residential) for everything except 'commercial' asset type
  const useCommercial = assetType === 'commercial';
  return useCommercial ? row[1] : row[0];
}


// ── HELPERS ────────────────────────────────────────────────────
function _num(x) {
  if (x == null) return 0;
  const n = Number(x);
  return isFinite(n) ? n : 0;
}

// PMT: equivalent to Excel's PMT(rate, nper, pv) - returns the
// monthly payment for a fully-amortizing loan. Positive value.
function PMT(rate, nper, pv) {
  if (rate === 0) return pv / nper;
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
}

// FV: equivalent to Excel's FV(rate, nper, pmt, pv) - future value
// after `nper` periods at `rate`, with periodic payment `pmt` and
// starting principal `pv`. Mirrors Excel's sign conventions: payment
// is negative if outflow. Returns the loan balance after payments
// have been made. Used for remaining-loan-balance projection.
function FV(rate, nper, pmt, pv) {
  if (rate === 0) return -(pv + pmt * nper);
  const f = Math.pow(1 + rate, nper);
  return -(pv * f + pmt * (f - 1) / rate);
}

// IRR via bisection. Returns null if no root found in [-0.99, 10].
// `cashflows[0]` is Y0 (negative for outflow), `cashflows[t]` is Y_t.
function IRR(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;
  // Need at least one negative and one positive cash flow
  const hasNeg = cashflows.some(c => c < 0);
  const hasPos = cashflows.some(c => c > 0);
  if (!hasNeg || !hasPos) return null;

  function npv(rate) {
    let s = 0;
    for (let t = 0; t < cashflows.length; t++) {
      s += cashflows[t] / Math.pow(1 + rate, t);
    }
    return s;
  }

  let lo = -0.99, hi = 10;
  let nLo = npv(lo), nHi = npv(hi);
  // If signs don't bracket, search outward
  if (nLo * nHi > 0) {
    for (let attempts = 0; attempts < 5; attempts++) {
      hi *= 2;
      nHi = npv(hi);
      if (nLo * nHi <= 0) break;
    }
    if (nLo * nHi > 0) return null;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const nMid = npv(mid);
    if (Math.abs(nMid) < 1e-9 || (hi - lo) < 1e-9) return mid;
    if (nLo * nMid < 0) { hi = mid; nHi = nMid; }
    else { lo = mid; nLo = nMid; }
  }
  return (lo + hi) / 2;
}


// ════════════════════════════════════════════════════════════════
// BRRRR ENGINE
// ════════════════════════════════════════════════════════════════
//
// Inputs read from the global `inputs` object (see core.js for the
// full schema). Unit mix read from `unitMix` array.
//
// Output: a flat R object with these keys (all numeric unless noted):
//
//   --- Inputs surfaced for KPIs ---
//   total_unit_count
//   gpr_monthly, gpr_annual, vacancy_loss, egi
//
//   --- Opex breakdown ---
//   pm_dollars, maint_turnover, taxes, insurance, utilities,
//   reserves, total_operating_expenses, expense_ratio
//
//   --- NOI and cash flow ---
//   stabilized_noi, annual_cash_flow, monthly_cash_flow, cf_per_unit
//
//   --- Project costs ---
//   closing_costs, total_project_cost, total_project_cost_per_unit
//
//   --- Initial debt ---
//   initial_loan_amt, initial_monthly_ds, initial_annual_ds,
//   debt_service_pre_refi
//
//   --- Stabilized valuation ---
//   stabilized_arv, arv_per_unit, value_creation, value_creation_pct
//
//   --- Refinance ---
//   refi_loan_amount, refi_monthly_ds, refi_annual_ds,
//   payoff_existing_debt, refi_closing_costs, net_cash_out,
//   excess_refi_proceeds, initial_investor_equity,
//   capital_returned_at_refi, investor_equity_remaining,
//   capital_recaptured_pct, post_refi_in_basis_pct,
//   refi_price_per_unit
//
//   --- Coverage ---
//   dscr, breakeven_occupancy, noi_margin
//
//   --- Disposition (year of hold = target_hold_years) ---
//   disposition_value, sale_cost, remaining_loan_balance,
//   net_sale_proceeds
//
//   --- Distribution projection (Y0..Y10) ---
//   distribution[0..target_hold_years]   (array)
//
//   --- Returns ---
//   investor_irr, equity_multiple (institutional), em_spreadsheet
//
//   --- Comp validation (only present if comps with sales_price > 0) ---
//   comp_avg_psf, comp_avg_psf_renovated_only,
//   comp_derived_arv, comp_variance_pct, comp_validation_flag
//   ('green'|'gold'|'red'|null)
//

function computeBRRRR() {
  const i = inputs;
  const mode = getDealMode();
  if (mode !== 'brrrr') return {};

  // ── INPUTS ──────────────────────────────────────────────────
  const purchase_price = _num(i.purchase_price);
  const reno_budget    = _num(i.reno_budget);
  const consulting_in  = _num(i.consulting_fees_override);
  const mob_contingency= _num(i.mobilization_contingency);
  const treat_mob_eq   = !!i.treat_mob_as_equity;

  const initial_ltv    = _num(i.initial_loan_ltv);
  const initial_ltc_re = _num(i.initial_loan_ltc_reno);
  const initial_rate   = _num(i.initial_rate);
  const initial_ITyp   = i.initial_interest_type || 'IO';

  const target_refi_m  = _num(i.target_refi_months);
  const target_hold_y  = Math.max(1, Math.round(_num(i.target_hold_years) || 10));
  const target_refi_ltv= _num(i.target_refi_ltv);
  const exit_cap       = _num(i.exit_cap);

  const refi_rate      = _num(i.refi_rate);
  const refi_ITyp      = i.refi_interest_type || 'PI';
  const refi_cc_pct    = _num(i.refi_closing_cost_pct);
  const investor_own   = _num(i.investor_ownership);

  const vacancy_pct    = _num(i.vacancy_pct);
  const pm_pct         = _num(i.pm_pct);
  const maint_pct      = _num(i.maint_pct_of_egi);
  const ins_pct        = _num(i.insurance_pct_of_egi);
  const util_pct       = _num(i.utilities_pct_of_egi);
  const reserves_per_u = _num(i.reserves_per_unit_year);

  const rent_growth    = _num(i.rent_growth_pct);
  const appreciation   = _num(i.appreciation_pct);
  const sale_cost_pct  = _num(i.sale_cost_pct);

  const tax_basis_mode = i.tax_basis_mode || 'stabilized_arv';
  const tax_district   = i.tax_district;
  const asset_type     = i.asset_type;


  // ── UNIT MIX → GPR ──────────────────────────────────────────
  const totalUnits = unitMix.reduce((a, u) => a + _num(u.count), 0);
  const gpr_monthly = unitMix.reduce((a, u) => a + _num(u.count) * _num(u.rent), 0);
  const gpr_annual = gpr_monthly * 12;


  // ── INITIAL LOAN AMOUNT ─────────────────────────────────────
  // Spreadsheet: E5 = purchase * LTV + reno * LTC_reno
  const initial_loan_amt = purchase_price * initial_ltv + reno_budget * initial_ltc_re;


  // ── CLOSING COSTS ───────────────────────────────────────────
  // Spreadsheet B24: $4,844 fixed + 4.5% of initial loan
  // (1395+250+150+299+350) + (loan*0.025) + (loan*0.02) + 2400
  // = 2444 + 4.5%*loan + 2400 = 4844 + 4.5%*loan
  // The fixed baseline ($2,444 title/escrow) and the loan-percentage
  // bundle (origination 2.5% + points 2% = 4.5%) are both editable.
  // The $2,400 transfer-tax add-on is BRRRR-specific (assumed by the
  // spreadsheet for multifamily transactions).
  const cc_baseline = i.closing_cost_baseline != null ? _num(i.closing_cost_baseline) : 2444;
  const cc_loan_pct = i.closing_cost_loan_pct != null ? _num(i.closing_cost_loan_pct) : 0.045;
  const cc_transfer_addon = i.closing_cost_transfer_addon != null ? _num(i.closing_cost_transfer_addon) : 2400;
  const closing_costs = cc_baseline + cc_transfer_addon + initial_loan_amt * cc_loan_pct;


  // ── CONSULTING ──────────────────────────────────────────────
  // Spreadsheet hardcodes consulting at $30,000 (deal-specific).
  // We default to max($10k, 3% of acq+reno) and allow override.
  const consulting = consulting_in > 0
    ? consulting_in
    : Math.max(10000, 0.03 * (purchase_price + reno_budget));


  // ── TOTAL PROJECT COST ──────────────────────────────────────
  // Spreadsheet B12: purchase + closing_costs + reno + consulting +
  //                  mobilization + debt_service_pre_refi
  // Debt service pre-refi = monthly_ds * target_refi_months
  let initial_monthly_ds;
  if (initial_ITyp === 'IO') {
    initial_monthly_ds = initial_loan_amt * initial_rate / 12;
  } else {
    initial_monthly_ds = PMT(initial_rate / 12, 30 * 12, initial_loan_amt);
  }
  const debt_service_pre_refi = initial_monthly_ds * target_refi_m;
  const initial_annual_ds = initial_monthly_ds * 12;

  const total_project_cost = purchase_price + closing_costs + reno_budget
    + consulting + mob_contingency + debt_service_pre_refi;
  const total_project_cost_per_unit = totalUnits > 0 ? total_project_cost / totalUnits : 0;


  // ── EGI ─────────────────────────────────────────────────────
  const vacancy_loss = gpr_annual * vacancy_pct;
  const egi = gpr_annual - vacancy_loss;


  // ── OPEX ────────────────────────────────────────────────────
  const pm_dollars = egi * pm_pct;
  const maint_turnover = egi * maint_pct;
  const insurance = egi * ins_pct;
  const utilities = egi * util_pct;
  const reserves = reserves_per_u * totalUnits;

  // Taxes: post-stabilization, charged on tax basis (ARV or purchase
  // price depending on mode). We compute stabilized NOI first as a
  // function of ALL expenses *including* taxes, but taxes depend on
  // ARV which depends on stabilized NOI. Resolve by 2-pass:
  //
  //   pass 1: assume taxes = 0, compute provisional NOI -> provisional ARV
  //   pass 2: compute taxes off the provisional ARV, recompute NOI, ARV
  //   (this converges in one pass since taxes are linear in ARV)
  //
  // For tax_basis_mode='purchase_price' (legacy spreadsheet parity),
  // taxes = purchase_price * rate, no iteration needed.
  const tax_rate = lookupCuyahogaTaxRate(tax_district, asset_type);
  let taxes;
  let stabilized_arv;
  let stabilized_noi;

  if (tax_basis_mode === 'purchase_price') {
    // Spreadsheet parity: taxes computed off purchase price
    taxes = tax_rate != null ? purchase_price * tax_rate : 0;
    const opex_ex_taxes_p1 = pm_dollars + maint_turnover + insurance + utilities + reserves;
    stabilized_noi = egi - opex_ex_taxes_p1 - taxes;
    stabilized_arv = exit_cap > 0 ? stabilized_noi / exit_cap : 0;
  } else {
    // Institutional default: taxes assessed against stabilized ARV
    if (tax_rate == null || exit_cap <= 0) {
      taxes = 0;
      const opex_ex_taxes_p1 = pm_dollars + maint_turnover + insurance + utilities + reserves;
      stabilized_noi = egi - opex_ex_taxes_p1 - taxes;
      stabilized_arv = exit_cap > 0 ? stabilized_noi / exit_cap : 0;
    } else {
      // Solve: stabilized_arv = (egi - opex_ex_taxes - tax_rate * stabilized_arv) / exit_cap
      //        stabilized_arv * exit_cap = egi - opex_ex_taxes - tax_rate * stabilized_arv
      //        stabilized_arv * (exit_cap + tax_rate) = egi - opex_ex_taxes
      //        stabilized_arv = (egi - opex_ex_taxes) / (exit_cap + tax_rate)
      const opex_ex_taxes = pm_dollars + maint_turnover + insurance + utilities + reserves;
      stabilized_arv = (egi - opex_ex_taxes) / (exit_cap + tax_rate);
      taxes = stabilized_arv * tax_rate;
      stabilized_noi = egi - opex_ex_taxes - taxes;
    }
  }

  const total_operating_expenses = pm_dollars + maint_turnover + taxes + insurance + utilities + reserves;
  const expense_ratio = egi > 0 ? total_operating_expenses / egi : 0;
  const noi_margin = egi > 0 ? stabilized_noi / egi : 0;
  const arv_per_unit = totalUnits > 0 ? stabilized_arv / totalUnits : 0;


  // ── VALUE CREATION ──────────────────────────────────────────
  const value_creation = stabilized_arv - total_project_cost;
  const value_creation_pct = total_project_cost > 0 ? value_creation / total_project_cost : 0;


  // ── REFINANCE ───────────────────────────────────────────────
  const refi_loan_amount = stabilized_arv * target_refi_ltv;
  let refi_monthly_ds;
  if (refi_ITyp === 'IO') {
    refi_monthly_ds = refi_loan_amount * refi_rate / 12;
  } else {
    refi_monthly_ds = PMT(refi_rate / 12, 30 * 12, refi_loan_amount);
  }
  const refi_annual_ds = refi_monthly_ds * 12;
  const refi_price_per_unit = totalUnits > 0 ? refi_loan_amount / totalUnits : 0;
  const payoff_existing_debt = initial_loan_amt;
  const refi_closing_costs = refi_loan_amount * refi_cc_pct;
  const net_cash_out = refi_loan_amount - payoff_existing_debt - refi_closing_costs;


  // ── INVESTOR EQUITY ─────────────────────────────────────────
  // Spreadsheet E32: (total_project_cost - initial_loan_amt) - mobilization
  // Per Phase 0 audit, the spreadsheet excludes mob/contingency from
  // initial equity (assumes it gets drawn back). We expose this as
  // a toggle: treat_mob_as_equity (default false = match spreadsheet).
  const initial_investor_equity = treat_mob_eq
    ? (total_project_cost - initial_loan_amt)
    : (total_project_cost - initial_loan_amt - mob_contingency);

  const capital_returned_at_refi = Math.max(0, Math.min(initial_investor_equity, net_cash_out));
  const investor_equity_remaining = initial_investor_equity - capital_returned_at_refi;
  const excess_refi_proceeds = Math.max(0, net_cash_out - capital_returned_at_refi);
  const capital_recaptured_pct = initial_investor_equity > 0
    ? capital_returned_at_refi / initial_investor_equity
    : 0;
  // Spreadsheet B19: MAX(0, (total_project_cost - net_cash_out) / stabilized_arv)
  // (Subtracts FULL refi proceeds extracted, not just recouped equity)
  const post_refi_in_basis_pct = stabilized_arv > 0
    ? Math.max(0, (total_project_cost - net_cash_out) / stabilized_arv)
    : 0;


  // ── CASH FLOW & DSCR ────────────────────────────────────────
  const annual_cash_flow = stabilized_noi - refi_annual_ds;
  const monthly_cash_flow = annual_cash_flow / 12;
  const cf_per_unit = totalUnits > 0 ? annual_cash_flow / totalUnits : 0;
  const dscr = refi_annual_ds > 0 ? stabilized_noi / refi_annual_ds : 0;
  const breakeven_occupancy = gpr_annual > 0
    ? (total_operating_expenses + refi_annual_ds) / gpr_annual
    : 0;


  // ── DISPOSITION (Y_hold) ────────────────────────────────────
  // Spreadsheet E69: stabilized_arv * (1 + appreciation)^hold
  const disposition_value = stabilized_arv * Math.pow(1 + appreciation, target_hold_y);
  const sale_cost = disposition_value * sale_cost_pct;
  // Remaining loan balance: FV of the refi loan after hold years.
  // Spreadsheet uses E22/12, B9*12, refi_monthly_debt_service, -E20.
  // For PI: this returns the principal remaining at end of hold.
  // For IO: balance stays = refi_loan_amount.
  let remaining_loan_balance;
  if (refi_ITyp === 'IO') {
    remaining_loan_balance = refi_loan_amount;
  } else {
    // Excel: FV(rate/12, nper, -pmt, -pv) with pmt and pv as negative
    // outflows for loan amortization. Our FV() mirrors Excel's signs.
    // ABS(FV(rate/12, hold*12, refi_monthly_ds, -refi_loan_amount))
    remaining_loan_balance = Math.abs(FV(refi_rate / 12, target_hold_y * 12, refi_monthly_ds, -refi_loan_amount));
    // Floor at 0 - PI amortizes down; in 10-yr hold of 30-yr amort, ~85-90% remains
    if (!isFinite(remaining_loan_balance) || remaining_loan_balance < 0) remaining_loan_balance = 0;
  }
  const net_sale_proceeds = disposition_value - sale_cost - remaining_loan_balance;


  // ── DISTRIBUTION PROJECTION ─────────────────────────────────
  // Y0  = -(initial_investor_equity)
  // Y1  = ACF*ownership + capital_returned_at_refi + excess_refi*ownership
  // Y2  = (ACF * (1 + rent_growth)) * ownership
  // Y_n for n in 3..hold-1: previous Y * (1 + rent_growth)
  // Y_hold = (Y_{hold-1} * (1 + rent_growth)) + net_sale_proceeds * ownership
  //          ── FIX: spreadsheet drops Y_hold operating CF (H17 blank);
  //          we restore it. See header comment.
  const distribution = new Array(target_hold_y + 1).fill(0);
  distribution[0] = -initial_investor_equity;
  distribution[1] = annual_cash_flow * investor_own
                  + capital_returned_at_refi
                  + excess_refi_proceeds * investor_own;
  if (target_hold_y >= 2) {
    distribution[2] = annual_cash_flow * (1 + rent_growth) * investor_own;
    for (let t = 3; t <= target_hold_y - 1; t++) {
      distribution[t] = distribution[t - 1] * (1 + rent_growth);
    }
    // Y_hold (Y10 for a 10-yr hold): operating CF + net sale proceeds * ownership
    // operating CF = Y_{hold-1} * (1 + rent_growth)
    const yHoldOpCf = target_hold_y >= 3
      ? distribution[target_hold_y - 1] * (1 + rent_growth)
      : distribution[1] * (1 + rent_growth);  // fall-through for very short holds
    distribution[target_hold_y] = yHoldOpCf + net_sale_proceeds * investor_own;
  }


  // ── RETURNS ─────────────────────────────────────────────────
  const investor_irr = IRR(distribution);

  // Institutional EM: sum of positive distributions / initial equity
  let sumPositive = 0;
  for (let t = 1; t <= target_hold_y; t++) sumPositive += distribution[t];
  const equity_multiple = initial_investor_equity > 0
    ? sumPositive / initial_investor_equity
    : null;

  // Spreadsheet EM (kept for parity reference only):
  // (Y0 + Y1 + ... + Y10) / initial_equity. Includes negative Y0.
  let sumAll = 0;
  for (let t = 0; t <= target_hold_y; t++) sumAll += distribution[t];
  const em_spreadsheet = initial_investor_equity > 0
    ? sumAll / initial_investor_equity
    : null;


  // ── COMP VALIDATION ─────────────────────────────────────────
  // BRRRR refi underwriter requires sales comps. Compute comp-derived
  // ARV via avg $/SF * subject area. Default to renovated-only.
  // Phase 0 audit: 3+ sales comps required; variance bands 10/20%.
  const subject_area_sf = _num(i.subject_area_sf);
  const includeUnren = !!i.comp_avg_include_unrenovated;  // default false
  const compType = (c) => c.comp_type || 'sales';
  const salesComps = (comps || []).filter(c => compType(c) === 'sales' && _num(c.sales_price) > 0 && _num(c.area_sf) > 0);
  let comp_avg_psf = null;
  let comp_avg_psf_renovated_only = null;
  let comp_derived_arv = null;
  let comp_variance_pct = null;
  let comp_validation_flag = null;
  let comp_count_sales = salesComps.length;
  let comp_count_sales_renovated = salesComps.filter(c => !!c.renovated).length;

  if (salesComps.length > 0) {
    const renovated = salesComps.filter(c => !!c.renovated);
    if (renovated.length > 0) {
      const sumPsf = renovated.reduce((a, c) => a + _num(c.sales_price) / _num(c.area_sf), 0);
      comp_avg_psf_renovated_only = sumPsf / renovated.length;
    }
    const useForAvg = includeUnren ? salesComps : (renovated.length > 0 ? renovated : salesComps);
    const sumPsf2 = useForAvg.reduce((a, c) => a + _num(c.sales_price) / _num(c.area_sf), 0);
    comp_avg_psf = sumPsf2 / useForAvg.length;
    if (subject_area_sf > 0) {
      comp_derived_arv = comp_avg_psf * subject_area_sf;
      if (stabilized_arv > 0) {
        comp_variance_pct = Math.abs(stabilized_arv - comp_derived_arv) / stabilized_arv;
        if (comp_variance_pct <= 0.10) comp_validation_flag = 'green';
        else if (comp_variance_pct <= 0.20) comp_validation_flag = 'gold';
        else comp_validation_flag = 'red';
      }
    }
  }


  // ── OUTPUT ──────────────────────────────────────────────────
  return {
    // Inputs surfaced
    total_unit_count: totalUnits,
    gpr_monthly, gpr_annual, vacancy_loss, egi,

    // Opex breakdown
    pm_dollars, maint_turnover, taxes, insurance, utilities,
    reserves, total_operating_expenses, expense_ratio,

    // NOI & cash flow
    stabilized_noi, annual_cash_flow, monthly_cash_flow, cf_per_unit,

    // Project costs
    closing_costs, consulting,
    total_project_cost, total_project_cost_per_unit,

    // Initial debt
    initial_loan_amt, initial_monthly_ds, initial_annual_ds,
    debt_service_pre_refi,

    // Stabilized valuation
    stabilized_arv, arv_per_unit, value_creation, value_creation_pct,

    // Refinance
    refi_loan_amount, refi_monthly_ds, refi_annual_ds,
    refi_price_per_unit, payoff_existing_debt, refi_closing_costs,
    net_cash_out, excess_refi_proceeds,
    initial_investor_equity, capital_returned_at_refi,
    investor_equity_remaining, capital_recaptured_pct,
    post_refi_in_basis_pct,

    // Coverage
    dscr, breakeven_occupancy, noi_margin,
    // Backwards-compat alias for shell-ui (KPI tile reads `dscr` already)
    initial_investor_equity_kpi: initial_investor_equity,

    // Disposition
    disposition_value, sale_cost, remaining_loan_balance, net_sale_proceeds,

    // Distribution projection
    distribution,

    // Returns
    investor_irr, equity_multiple, em_spreadsheet,

    // Comp validation
    comp_count_sales, comp_count_sales_renovated,
    comp_avg_psf, comp_avg_psf_renovated_only,
    comp_derived_arv, comp_variance_pct, comp_validation_flag,

    // Required-for-BRRRR flag
    comp_min_required_met: comp_count_sales >= 3,
    tax_rate_resolved: tax_rate
  };
}


// ════════════════════════════════════════════════════════════════
// F&F ENGINE (M3 - full port of the Fix and Flip spreadsheet)
// ════════════════════════════════════════════════════════════════
//
// Port of the ASJP Fix and Flip analysis template, validated against
// the 2455 W 7 ST regression deal. Three documented institutional
// deviations from the spreadsheet, each toggleable for parity:
//
//   1. Investor equity definition
//      The spreadsheet computes equity as
//        purchase × 0.07 + closing + consulting + DS_pre_sale
//      which hardcodes a 7% down payment regardless of the stated LTV
//      and excludes mobilization/contingency. The institutional engine
//      can use TPC − initial_loan, which is the right way.
//      Toggle: equity_method = 'spreadsheet' (default) | 'institutional'
//
//   2. Comp average $/SF method
//      The spreadsheet computes (sum_prices / n) / (sum_sf / n) which
//      is mathematically NOT the average $/SF. Foundry computes
//      avg(price_i / sf_i) which is the institutional standard.
//      Toggle: comp_avg_method = 'institutional' (default) | 'spreadsheet'
//
//   3. Comp average DOM
//      The spreadsheet divides by 3 even when a comp has no DOM,
//      treating null as 0 and depressing the average. Foundry divides
//      by the count of comps with valid DOM. Not toggleable; the
//      spreadsheet behavior is unambiguously wrong.
//
// Differences from the BRRRR engine:
//   - No refinance phase (single-period model: acquire → reno → sell)
//   - No operating phase (no NOI, no stabilized valuation)
//   - Disposition value is a manual input (or comp-derived), NOT
//     stabilized_arv × (1 + appreciation)^hold
//   - Hold is measured in months, not years
//   - Closing cost formula uses 4.5% loan pct but NO $2,400 transfer
//     add-on (the BRRRR template has that add-on; the F&F doesn't)
//
// Output keys on R:
//
//   --- Inputs surfaced ---
//   total_unit_count, subject_area_sf
//
//   --- Comp-derived ARV ---
//   comp_avg_psf, comp_avg_psf_renovated_only,
//   comp_avg_psf_spreadsheet (parity method), comp_avg_dom,
//   comp_count_sales, comp_count_sales_renovated,
//   comp_derived_arv, comp_min_required_met
//
//   --- ARV in use (manual override or comp-derived) ---
//   arv, arv_per_unit, arv_source ('override' | 'comps' | 'none')
//
//   --- Project costs ---
//   closing_costs, consulting, debt_service_pre_sale,
//   total_project_cost, total_project_cost_per_unit, price_per_unit
//
//   --- Initial debt ---
//   initial_loan_amt, initial_monthly_ds
//
//   --- Disposition ---
//   disposition_value, sale_cost, remaining_loan_balance
//
//   --- Investor returns ---
//   investor_equity, investor_equity_spreadsheet (always shown),
//   investor_equity_institutional (always shown),
//   gross_proceeds, net_investor_proceeds, investor_roi,
//   annualized_return, annualized_irr,
//   value_creation, value_creation_pct
//

function computeFF() {
  const i = inputs;
  const mode = getDealMode();
  if (mode !== 'fix_and_flip') return {};

  // ── INPUTS ──────────────────────────────────────────────────
  const purchase_price = _num(i.purchase_price);
  const reno_budget    = _num(i.reno_budget);
  const mob_contingency= _num(i.mobilization_contingency);
  const consulting_in  = _num(i.consulting_fees_override);
  const subject_area_sf= _num(i.subject_area_sf);
  const arv_override   = _num(i.arv_override);
  const total_units    = _num(i.total_units_ff) || 1;
  const target_hold_m  = _num(i.target_hold_months) || 7;

  const initial_ltv    = i.initial_loan_ltv != null ? _num(i.initial_loan_ltv) : 0.90;
  const initial_rate   = i.initial_rate != null ? _num(i.initial_rate) : 0.127;
  const initial_ITyp   = i.initial_interest_type || 'IO';

  const sale_cost_pct  = i.sale_cost_pct != null ? _num(i.sale_cost_pct) : 0.07;
  const lp_split       = i.lp_gp_split_ff != null ? _num(i.lp_gp_split_ff) : 0.5;

  const equity_method  = i.equity_method_ff || 'spreadsheet';
  const comp_avg_method= i.comp_avg_method || 'institutional';


  // ── INITIAL LOAN AMOUNT ─────────────────────────────────────
  // Spreadsheet F&F: B18 × 0.9 + B21 (purchase × LTV + reno_full)
  // The reno is funded 100% via draws, regardless of any "LTC" input.
  const initial_loan_amt = purchase_price * initial_ltv + reno_budget;


  // ── CLOSING COSTS ───────────────────────────────────────────
  // F&F spreadsheet: 2444 + 0.015×loan + 0.03×loan = 2444 + 4.5%×loan
  // (No $2,400 transfer add-on; that's a BRRRR-only line item.)
  // Both the baseline and loan pct are editable; defaults match the
  // F&F template exactly.
  const cc_baseline = i.closing_cost_baseline != null ? _num(i.closing_cost_baseline) : 2444;
  const cc_loan_pct = i.closing_cost_loan_pct != null ? _num(i.closing_cost_loan_pct) : 0.045;
  const closing_costs = cc_baseline + initial_loan_amt * cc_loan_pct;


  // ── CONSULTING ──────────────────────────────────────────────
  // Spreadsheet: MAX(10000, (purchase + reno) × 0.03)
  const consulting = consulting_in > 0
    ? consulting_in
    : Math.max(10000, 0.03 * (purchase_price + reno_budget));


  // ── DEBT SERVICE PRE-SALE ───────────────────────────────────
  let initial_monthly_ds;
  if (initial_ITyp === 'IO') {
    initial_monthly_ds = initial_loan_amt * initial_rate / 12;
  } else {
    initial_monthly_ds = PMT(initial_rate / 12, 30 * 12, initial_loan_amt);
  }
  const debt_service_pre_sale = initial_monthly_ds * target_hold_m;


  // ── TOTAL PROJECT COST ──────────────────────────────────────
  // Spreadsheet B12: SUM(purchase, closing, reno, consulting, mob, DS)
  const total_project_cost = purchase_price + closing_costs + reno_budget
    + consulting + mob_contingency + debt_service_pre_sale;
  const total_project_cost_per_unit = total_units > 0 ? total_project_cost / total_units : 0;
  const price_per_unit = total_units > 0 ? purchase_price / total_units : 0;


  // ── COMPS ──────────────────────────────────────────────────
  // Two avg $/SF methods:
  //   institutional (default): avg(price_i / sf_i)
  //   spreadsheet (parity):    (sum_price / n) / (sum_sf / n)
  // Both methods exclude unrenovated comps unless toggle is on.
  const salesComps = (comps || []).filter(c =>
    (c.comp_type || 'sales') === 'sales' && _num(c.sales_price) > 0 && _num(c.area_sf) > 0);
  const renovated = salesComps.filter(c => !!c.renovated);
  const includeUnren = !!i.comp_avg_include_unrenovated;
  const useForAvg = includeUnren ? salesComps : (renovated.length > 0 ? renovated : salesComps);

  let comp_avg_psf = null;
  let comp_avg_psf_spreadsheet = null;
  let comp_avg_psf_renovated_only = null;
  let comp_count_sales = salesComps.length;
  let comp_count_sales_renovated = renovated.length;
  let comp_avg_dom = null;
  let comp_derived_arv = 0;
  let comp_min_required_met = comp_count_sales >= 3;

  if (useForAvg.length > 0) {
    // Institutional method
    const sumPerCompPsf = useForAvg.reduce((a, c) =>
      a + _num(c.sales_price) / _num(c.area_sf), 0);
    const inst_psf = sumPerCompPsf / useForAvg.length;

    // Spreadsheet method
    const sumPrice = useForAvg.reduce((a, c) => a + _num(c.sales_price), 0);
    const sumSf    = useForAvg.reduce((a, c) => a + _num(c.area_sf), 0);
    const ss_psf   = sumSf > 0 ? sumPrice / sumSf : null;

    comp_avg_psf_spreadsheet = ss_psf;
    comp_avg_psf = comp_avg_method === 'spreadsheet' ? ss_psf : inst_psf;

    if (renovated.length > 0) {
      const sumRenoPsf = renovated.reduce((a, c) => a + _num(c.sales_price) / _num(c.area_sf), 0);
      comp_avg_psf_renovated_only = sumRenoPsf / renovated.length;
    }

    // DOM: institutional method (divide by valid count, not total)
    const validDom = useForAvg.filter(c => _num(c.dom) > 0);
    if (validDom.length > 0) {
      comp_avg_dom = validDom.reduce((a, c) => a + _num(c.dom), 0) / validDom.length;
    }

    if (subject_area_sf > 0 && comp_avg_psf != null) {
      comp_derived_arv = comp_avg_psf * subject_area_sf;
    }
  }


  // ── ARV IN USE ──────────────────────────────────────────────
  let arv, arv_source;
  if (arv_override > 0) {
    arv = arv_override;
    arv_source = 'override';
  } else if (comp_derived_arv > 0) {
    arv = comp_derived_arv;
    arv_source = 'comps';
  } else {
    arv = 0;
    arv_source = 'none';
  }
  const arv_per_unit = total_units > 0 ? arv / total_units : 0;


  // ── VALUE CREATION ──────────────────────────────────────────
  const value_creation = arv - total_project_cost;
  const value_creation_pct = total_project_cost > 0 ? value_creation / total_project_cost : 0;


  // ── DISPOSITION ─────────────────────────────────────────────
  // F&F: no appreciation period. Disposition = ARV directly.
  const disposition_value = arv;
  const sale_cost = disposition_value * sale_cost_pct;
  // IO bridge over short hold: full principal remains.
  const remaining_loan_balance = initial_ITyp === 'IO'
    ? initial_loan_amt
    : initial_loan_amt;  // For PI we'd amortize; but F&F is always IO in practice


  // ── INVESTOR EQUITY ─────────────────────────────────────────
  // Spreadsheet (parity): purchase × 0.07 + closing + consulting + DS_pre_sale
  // The 7% appears hardcoded regardless of LTV; we replicate it for parity.
  // Note that this excludes mob/contingency and uses 7% even when LTV is 90%.
  const investor_equity_spreadsheet = purchase_price * 0.07
    + closing_costs + consulting + debt_service_pre_sale;

  // Institutional: TPC − initial_loan (the actual cash investor outlays
  // assuming reno is funded via draws on the loan).
  const investor_equity_institutional = total_project_cost - initial_loan_amt;

  const investor_equity = equity_method === 'institutional'
    ? investor_equity_institutional
    : investor_equity_spreadsheet;


  // ── PROCEEDS WATERFALL ──────────────────────────────────────
  // Spreadsheet B34: ARV − sale_cost − remaining_loan − investor_equity
  // (Treats investor equity as a return-of-capital before the promote.)
  // B35: gross_proceeds / 2 → 50/50 promote on remaining proceeds
  const gross_proceeds = disposition_value - sale_cost - remaining_loan_balance - investor_equity;
  const net_investor_proceeds = gross_proceeds * lp_split;

  const investor_roi = investor_equity > 0
    ? net_investor_proceeds / investor_equity
    : 0;
  // Annualized: ROI × (12 / months)
  const annualized_return = target_hold_m > 0
    ? investor_roi * (12 / target_hold_m)
    : 0;
  // Compounded annualized IRR: ((equity + net_proceeds) / equity)^(12/m) − 1
  const annualized_irr = investor_equity > 0 && target_hold_m > 0
    ? Math.pow((investor_equity + net_investor_proceeds) / investor_equity, 12 / target_hold_m) - 1
    : null;


  // ── OUTPUT ──────────────────────────────────────────────────
  return {
    // Inputs surfaced
    total_unit_count: total_units,
    subject_area_sf,

    // Comp-derived ARV
    comp_avg_psf,
    comp_avg_psf_spreadsheet,
    comp_avg_psf_renovated_only,
    comp_avg_dom,
    comp_count_sales,
    comp_count_sales_renovated,
    comp_derived_arv,
    comp_min_required_met,

    // ARV in use
    arv, arv_per_unit, arv_source,

    // Project costs
    closing_costs, consulting, debt_service_pre_sale,
    total_project_cost, total_project_cost_per_unit, price_per_unit,

    // Initial debt
    initial_loan_amt, initial_monthly_ds,

    // Disposition
    disposition_value, sale_cost, remaining_loan_balance,

    // Investor returns
    investor_equity,
    investor_equity_spreadsheet,
    investor_equity_institutional,
    gross_proceeds, net_investor_proceeds,
    investor_roi, annualized_return, annualized_irr,
    value_creation, value_creation_pct
  };
}


// ════════════════════════════════════════════════════════════════
// M5 - ENGINE RISK CATALOG
// ════════════════════════════════════════════════════════════════
//
// Auto-flagged risks derived from engine outputs. Mode-aware: BRRRR
// risks read R for refi/coverage/in-basis/recapture metrics; F&F
// risks read R for comp scatter, DOM, value creation, ARV override.
//
// Two-tier severity per rule:
//   medium -> rule trips at threshold
//   high   -> rule trips beyond high-band threshold (typically ~1.5x
//             below the medium threshold for "below" rules, or ~1.5x
//             above for "above" rules)
//
// Each rule emits at most one risk per recompute. The risk object
// shape is documented in risk.js. Engine risks carry source='engine'
// and ids prefixed 'eng_'.
//
// Thresholds are exported so the regression harness and the risk UI
// (mitigation guidance) can reference identical numbers.
// ════════════════════════════════════════════════════════════════

const ENGINE_RISK_THRESHOLDS = {
  // BRRRR
  dscr_min:                 1.20,    // refi DSCR below this is a risk
  refi_ltv_max:             0.75,    // refi LTV above this is a risk
  breakeven_occ_max:        0.75,    // breakeven occupancy above this
  contingency_pct_min:      0.05,    // contingency below 5% of TPC
  capital_recapture_min:    0.80,    // less than 80% capital recapture
  exit_cap_compression_bps: 50,      // exit cap compressed >50 bps below entry
  value_creation_min_brrrr: 0.20,    // BRRRR value creation below 20%
  in_basis_pct_max:         0.80,    // post-refi in-basis >80% of ARV

  // F&F
  comp_cv_max:              0.25,    // CoV of comp $/SF above 25%
  comp_count_min:           3,       // fewer than 3 valid comps
  dom_max:                  75,      // avg DOM above 75 days
  value_creation_min_ff:    0.15,    // F&F value creation below 15%
  arv_override_max_pct:     0.10,    // ARV override >10% above comp-derived
  ff_contingency_pct_min:   0.05     // F&F contingency below 5% of TPC
};

// High-tier multipliers (severity escalation thresholds).
// For "above" rules: high tier = medium * HIGH_ABOVE_MULT (or fixed delta).
// For "below" rules: high tier = medium * HIGH_BELOW_MULT (or fixed delta).
const HIGH_TIER = {
  dscr_min_high:            1.05,    // DSCR below 1.05 is high severity
  refi_ltv_max_high:        0.80,    // refi LTV above 80% is high
  breakeven_occ_max_high:   0.85,    // breakeven occ above 85% is high
  contingency_pct_min_high: 0.03,    // contingency below 3% is high
  capital_recapture_min_high: 0.60,  // <60% recapture is high
  exit_cap_compression_bps_high: 100,
  value_creation_min_brrrr_high: 0.10,
  in_basis_pct_max_high:    0.90,    // >90% in-basis is high
  comp_cv_max_high:         0.40,
  comp_count_min_high:      2,
  dom_max_high:             120,
  value_creation_min_ff_high: 0.05,
  arv_override_max_pct_high: 0.20,
  ff_contingency_pct_min_high: 0.03
};

function _pctStr(x, dec) {
  if (x == null || !isFinite(x)) return '-';
  return (x * 100).toFixed(dec == null ? 1 : dec) + '%';
}
function _xStr(x, dec) {
  if (x == null || !isFinite(x)) return '-';
  return x.toFixed(dec == null ? 2 : dec) + 'x';
}
function _dollarStr(x) {
  if (x == null || !isFinite(x)) return '-';
  return '$' + Math.round(x).toLocaleString();
}

// Coefficient of variation of comp $/SF (sample-stddev / mean).
// Returns null if there are fewer than 2 valid comps.
function _compCV(compsArr) {
  if (!Array.isArray(compsArr)) return null;
  const psfs = compsArr
    .filter(c => c && c.comp_type === 'sales')
    .map(c => {
      const p = +c.sales_price, sf = +c.area_sf;
      return (p > 0 && sf > 0) ? (p / sf) : null;
    })
    .filter(v => v != null);
  if (psfs.length < 2) return null;
  const mean = psfs.reduce((a, b) => a + b, 0) / psfs.length;
  if (mean === 0) return null;
  const variance = psfs.reduce((a, b) => a + (b - mean) ** 2, 0) / (psfs.length - 1);
  return Math.sqrt(variance) / mean;
}

// Mode-aware engine risk computation. Returns array of risk objects.
// Reads inputs from globals (inputs, comps) by default; harnesses can
// pass overrides for deterministic regression.
function computeEngineRisks(mode, R_in, inputs_in, comps_in) {
  const R_ = R_in || (typeof R === 'object' ? R : {});
  const i_ = inputs_in || (typeof inputs === 'object' ? inputs : {});
  const c_ = comps_in || (typeof comps === 'object' ? comps : []);
  const T = ENGINE_RISK_THRESHOLDS;
  const H = HIGH_TIER;
  const risks = [];

  if (mode === 'brrrr') {
    // --- DSCR ---
    if (R_.dscr != null && isFinite(R_.dscr)) {
      if (R_.dscr < H.dscr_min_high) {
        risks.push({
          id: 'eng_dscr_low', source: 'engine', severity: 'high',
          category: 'Coverage',
          title: 'Refi DSCR below high-risk threshold',
          detail: `Post-refi DSCR ${_xStr(R_.dscr)} is below the ${_xStr(H.dscr_min_high)} high-severity floor. Most agency takeout lenders require 1.20x minimum; below 1.05x is uninsurable.`,
          value: R_.dscr, threshold: H.dscr_min_high
        });
      } else if (R_.dscr < T.dscr_min) {
        risks.push({
          id: 'eng_dscr_low', source: 'engine', severity: 'medium',
          category: 'Coverage',
          title: 'Refi DSCR below institutional threshold',
          detail: `Post-refi DSCR ${_xStr(R_.dscr)} is below the ${_xStr(T.dscr_min)} institutional minimum. Re-test NOI build and refi loan sizing.`,
          value: R_.dscr, threshold: T.dscr_min
        });
      }
    }

    // --- Refi LTV (refi loan / ARV) ---
    if (R_.refi_loan_amount != null && R_.stabilized_arv > 0) {
      const refi_ltv = R_.refi_loan_amount / R_.stabilized_arv;
      if (refi_ltv > H.refi_ltv_max_high) {
        risks.push({
          id: 'eng_refi_ltv_high', source: 'engine', severity: 'high',
          category: 'Capital',
          title: 'Refi LTV exceeds high-risk threshold',
          detail: `Refi LTV ${_pctStr(refi_ltv)} exceeds the ${_pctStr(H.refi_ltv_max_high, 0)} high-severity ceiling. Agency takeout unlikely; bridge extension or equity infusion may be required.`,
          value: refi_ltv, threshold: H.refi_ltv_max_high
        });
      } else if (refi_ltv > T.refi_ltv_max) {
        risks.push({
          id: 'eng_refi_ltv_high', source: 'engine', severity: 'medium',
          category: 'Capital',
          title: 'Refi LTV above institutional threshold',
          detail: `Refi LTV ${_pctStr(refi_ltv)} exceeds the ${_pctStr(T.refi_ltv_max, 0)} institutional ceiling. Tighten refi sizing or revisit exit cap.`,
          value: refi_ltv, threshold: T.refi_ltv_max
        });
      }
    }

    // --- Breakeven occupancy ---
    if (R_.breakeven_occupancy != null && isFinite(R_.breakeven_occupancy)) {
      if (R_.breakeven_occupancy > H.breakeven_occ_max_high) {
        risks.push({
          id: 'eng_breakeven_high', source: 'engine', severity: 'high',
          category: 'Operations',
          title: 'Breakeven occupancy unsustainable',
          detail: `Breakeven occupancy ${_pctStr(R_.breakeven_occupancy)} exceeds the ${_pctStr(H.breakeven_occ_max_high, 0)} high-severity threshold. The asset would need near-full lease-up just to cover debt service plus opex.`,
          value: R_.breakeven_occupancy, threshold: H.breakeven_occ_max_high
        });
      } else if (R_.breakeven_occupancy > T.breakeven_occ_max) {
        risks.push({
          id: 'eng_breakeven_high', source: 'engine', severity: 'medium',
          category: 'Operations',
          title: 'Breakeven occupancy elevated',
          detail: `Breakeven occupancy ${_pctStr(R_.breakeven_occupancy)} exceeds the ${_pctStr(T.breakeven_occ_max, 0)} comfort threshold. Limited cushion against vacancy spikes.`,
          value: R_.breakeven_occupancy, threshold: T.breakeven_occ_max
        });
      }
    }

    // --- Capital recapture (capital returned / initial equity) ---
    if (R_.capital_recaptured_pct != null && isFinite(R_.capital_recaptured_pct)) {
      const cr = R_.capital_recaptured_pct > 1 ? R_.capital_recaptured_pct / 100 : R_.capital_recaptured_pct;
      if (cr < H.capital_recapture_min_high) {
        risks.push({
          id: 'eng_capital_recapture_low', source: 'engine', severity: 'high',
          category: 'Capital',
          title: 'Capital recapture far below target',
          detail: `Refi returns only ${_pctStr(cr)} of initial equity, below the ${_pctStr(H.capital_recapture_min_high, 0)} high-severity floor. Significant equity remains trapped, weakening the recycle thesis.`,
          value: cr, threshold: H.capital_recapture_min_high
        });
      } else if (cr < T.capital_recapture_min) {
        risks.push({
          id: 'eng_capital_recapture_low', source: 'engine', severity: 'medium',
          category: 'Capital',
          title: 'Capital recapture below target',
          detail: `Refi returns ${_pctStr(cr)} of initial equity, below the ${_pctStr(T.capital_recapture_min, 0)} institutional target. Equity recycle thesis weakened.`,
          value: cr, threshold: T.capital_recapture_min
        });
      }
    }

    // --- In-basis after refi ---
    if (R_.post_refi_in_basis_pct != null && isFinite(R_.post_refi_in_basis_pct)) {
      // Field may be stored as percent (e.g. 51) or decimal (0.51); normalize.
      const ib = R_.post_refi_in_basis_pct > 1 ? R_.post_refi_in_basis_pct / 100 : R_.post_refi_in_basis_pct;
      if (ib > H.in_basis_pct_max_high) {
        risks.push({
          id: 'eng_in_basis_high', source: 'engine', severity: 'high',
          category: 'Capital',
          title: 'Post-refi in-basis dangerously high',
          detail: `Post-refi in-basis ${_pctStr(ib)} exceeds the ${_pctStr(H.in_basis_pct_max_high, 0)} high-severity ceiling. Minimal cushion if exit cap softens.`,
          value: ib, threshold: H.in_basis_pct_max_high
        });
      } else if (ib > T.in_basis_pct_max) {
        risks.push({
          id: 'eng_in_basis_high', source: 'engine', severity: 'medium',
          category: 'Capital',
          title: 'Post-refi in-basis elevated',
          detail: `Post-refi in-basis ${_pctStr(ib)} is above the ${_pctStr(T.in_basis_pct_max, 0)} threshold. Limited margin for value erosion.`,
          value: ib, threshold: T.in_basis_pct_max
        });
      }
    }

    // --- Contingency as pct of TPC (BRRRR) ---
    if (R_.total_project_cost > 0) {
      const cont = +i_.mobilization_contingency || 0;
      const cPct = cont / R_.total_project_cost;
      if (cPct < H.contingency_pct_min_high) {
        risks.push({
          id: 'eng_contingency_low', source: 'engine', severity: 'high',
          category: 'Budget',
          title: 'Contingency below high-risk floor',
          detail: `Contingency ${_pctStr(cPct)} of TPC is below the ${_pctStr(H.contingency_pct_min_high, 0)} high-severity floor. Cost overruns will hit equity directly.`,
          value: cPct, threshold: H.contingency_pct_min_high
        });
      } else if (cPct < T.contingency_pct_min) {
        risks.push({
          id: 'eng_contingency_low', source: 'engine', severity: 'medium',
          category: 'Budget',
          title: 'Contingency below institutional minimum',
          detail: `Contingency ${_pctStr(cPct)} of TPC is below the ${_pctStr(T.contingency_pct_min, 0)} minimum. Recommend reserving at least 5%.`,
          value: cPct, threshold: T.contingency_pct_min
        });
      }
    }

    // --- Exit cap compression (disabled in M5) ---
    // Originally compared exit_cap to (NOI / purchase_price), but on a
    // value-add deal the purchase price is well below stabilized ARV,
    // so that "entry cap" is really yield-on-cost and the comparison
    // is uncalibrated. Reintroduce in M6 with a market-cap input.

    // --- Value creation (BRRRR) ---
    if (R_.value_creation_pct != null && isFinite(R_.value_creation_pct)) {
      const vc = R_.value_creation_pct > 1 ? R_.value_creation_pct / 100 : R_.value_creation_pct;
      if (vc < H.value_creation_min_brrrr_high) {
        risks.push({
          id: 'eng_value_creation_thin_brrrr', source: 'engine', severity: 'high',
          category: 'Returns',
          title: 'Value creation below high-risk floor',
          detail: `Value creation ${_pctStr(vc)} is below the ${_pctStr(H.value_creation_min_brrrr_high, 0)} high-severity floor. Thin margin makes refi takeout fragile.`,
          value: vc, threshold: H.value_creation_min_brrrr_high
        });
      } else if (vc < T.value_creation_min_brrrr) {
        risks.push({
          id: 'eng_value_creation_thin_brrrr', source: 'engine', severity: 'medium',
          category: 'Returns',
          title: 'Value creation below BRRRR target',
          detail: `Value creation ${_pctStr(vc)} is below the ${_pctStr(T.value_creation_min_brrrr, 0)} BRRRR target. Recycle thesis weakened.`,
          value: vc, threshold: T.value_creation_min_brrrr
        });
      }
    }
  }

  if (mode === 'fix_and_flip') {
    // --- Comp count ---
    const compCount = R_.comp_count_sales != null
      ? R_.comp_count_sales
      : (Array.isArray(c_) ? c_.filter(c => c && c.comp_type === 'sales').length : 0);
    if (compCount < H.comp_count_min_high) {
      risks.push({
        id: 'eng_comp_count_low', source: 'engine', severity: 'high',
        category: 'Comps',
        title: 'Insufficient comp coverage',
        detail: `Only ${compCount} valid sales comp(s). Below the ${H.comp_count_min_high}-comp high-severity floor; ARV derivation is unreliable.`,
        value: compCount, threshold: H.comp_count_min_high
      });
    } else if (compCount < T.comp_count_min) {
      risks.push({
        id: 'eng_comp_count_low', source: 'engine', severity: 'medium',
        category: 'Comps',
        title: 'Comp count below institutional minimum',
        detail: `Only ${compCount} valid sales comps. Institutional standard requires ${T.comp_count_min}; expand search radius or relax filters.`,
        value: compCount, threshold: T.comp_count_min
      });
    }

    // --- Comp CV ($/SF dispersion) ---
    const cv = _compCV(c_);
    if (cv != null) {
      if (cv > H.comp_cv_max_high) {
        risks.push({
          id: 'eng_comp_cv_high', source: 'engine', severity: 'high',
          category: 'Comps',
          title: 'Comp dispersion severe',
          detail: `Coefficient of variation in comp $/SF is ${_pctStr(cv)}, above the ${_pctStr(H.comp_cv_max_high, 0)} high-severity ceiling. Comp set is internally inconsistent; ARV is not defensible.`,
          value: cv, threshold: H.comp_cv_max_high
        });
      } else if (cv > T.comp_cv_max) {
        risks.push({
          id: 'eng_comp_cv_high', source: 'engine', severity: 'medium',
          category: 'Comps',
          title: 'Comp dispersion elevated',
          detail: `Coefficient of variation in comp $/SF is ${_pctStr(cv)}, above the ${_pctStr(T.comp_cv_max, 0)} threshold. Tighten the comp set or split into renovated vs unrenovated bands.`,
          value: cv, threshold: T.comp_cv_max
        });
      }
    }

    // --- DOM ---
    if (R_.comp_avg_dom != null && isFinite(R_.comp_avg_dom)) {
      if (R_.comp_avg_dom > H.dom_max_high) {
        risks.push({
          id: 'eng_dom_high', source: 'engine', severity: 'high',
          category: 'Comps',
          title: 'Days on market severely elevated',
          detail: `Average DOM ${Math.round(R_.comp_avg_dom)} days exceeds the ${H.dom_max_high}-day high-severity threshold. Market liquidity poor; price expectations may need to drop.`,
          value: R_.comp_avg_dom, threshold: H.dom_max_high
        });
      } else if (R_.comp_avg_dom > T.dom_max) {
        risks.push({
          id: 'eng_dom_high', source: 'engine', severity: 'medium',
          category: 'Comps',
          title: 'Days on market elevated',
          detail: `Average DOM ${Math.round(R_.comp_avg_dom)} days exceeds the ${T.dom_max}-day comfort threshold. Build a longer hold cushion into the timeline.`,
          value: R_.comp_avg_dom, threshold: T.dom_max
        });
      }
    }

    // --- Value creation (F&F) ---
    if (R_.value_creation_pct != null && isFinite(R_.value_creation_pct)) {
      const vc = R_.value_creation_pct > 1 ? R_.value_creation_pct / 100 : R_.value_creation_pct;
      if (vc < H.value_creation_min_ff_high) {
        risks.push({
          id: 'eng_value_creation_thin_ff', source: 'engine', severity: 'high',
          category: 'Returns',
          title: 'Value creation below high-risk floor',
          detail: `Value creation ${_pctStr(vc)} is below the ${_pctStr(H.value_creation_min_ff_high, 0)} high-severity floor. Minimal margin for execution slippage.`,
          value: vc, threshold: H.value_creation_min_ff_high
        });
      } else if (vc < T.value_creation_min_ff) {
        risks.push({
          id: 'eng_value_creation_thin_ff', source: 'engine', severity: 'medium',
          category: 'Returns',
          title: 'Value creation below F&F target',
          detail: `Value creation ${_pctStr(vc)} is below the ${_pctStr(T.value_creation_min_ff, 0)} F&F target. ROI vulnerable to schedule or cost slippage.`,
          value: vc, threshold: T.value_creation_min_ff
        });
      }
    }

    // --- ARV override vs comp-derived ---
    if (R_.arv > 0 && R_.comp_derived_arv > 0 && R_.arv_source === 'override') {
      const diff = (R_.arv - R_.comp_derived_arv) / R_.comp_derived_arv;
      if (diff > H.arv_override_max_pct_high) {
        risks.push({
          id: 'eng_arv_override_high', source: 'engine', severity: 'high',
          category: 'Assumptions',
          title: 'ARV override far above comp-derived',
          detail: `Manual ARV ${_dollarStr(R_.arv)} is ${_pctStr(diff)} above comp-derived ${_dollarStr(R_.comp_derived_arv)}. Override exceeds the ${_pctStr(H.arv_override_max_pct_high, 0)} high-severity ceiling.`,
          value: diff, threshold: H.arv_override_max_pct_high
        });
      } else if (diff > T.arv_override_max_pct) {
        risks.push({
          id: 'eng_arv_override_high', source: 'engine', severity: 'medium',
          category: 'Assumptions',
          title: 'ARV override above comp-derived',
          detail: `Manual ARV ${_dollarStr(R_.arv)} is ${_pctStr(diff)} above comp-derived ${_dollarStr(R_.comp_derived_arv)}. Override above ${_pctStr(T.arv_override_max_pct, 0)} requires rationale.`,
          value: diff, threshold: T.arv_override_max_pct
        });
      }
    }

    // --- F&F contingency ---
    if (R_.total_project_cost > 0) {
      const cont = +i_.mobilization_contingency || 0;
      const cPct = cont / R_.total_project_cost;
      if (cPct < H.ff_contingency_pct_min_high) {
        risks.push({
          id: 'eng_ff_contingency_low', source: 'engine', severity: 'high',
          category: 'Budget',
          title: 'Contingency below high-risk floor',
          detail: `Contingency ${_pctStr(cPct)} of TPC is below the ${_pctStr(H.ff_contingency_pct_min_high, 0)} high-severity floor. Cost overruns will hit equity directly.`,
          value: cPct, threshold: H.ff_contingency_pct_min_high
        });
      } else if (cPct < T.ff_contingency_pct_min) {
        risks.push({
          id: 'eng_ff_contingency_low', source: 'engine', severity: 'medium',
          category: 'Budget',
          title: 'Contingency below institutional minimum',
          detail: `Contingency ${_pctStr(cPct)} of TPC is below the ${_pctStr(T.ff_contingency_pct_min, 0)} minimum.`,
          value: cPct, threshold: T.ff_contingency_pct_min
        });
      }
    }
  }

  return risks;
}


// ════════════════════════════════════════════════════════════════
// PUBLIC: recompute()
// ════════════════════════════════════════════════════════════════
// Called from core.js after any input change. Reads global state,
// writes to R. Dispatch by mode.
function recompute() {
  if (!currentDeal) { R = {}; return; }
  const mode = getDealMode();
  if (mode === 'brrrr')        R = computeBRRRR();
  else if (mode === 'fix_and_flip') R = computeFF();
  else R = {};

  // Inject market analysis output (if fetched) into R, regardless of mode.
  // The Market Strength Score, grade, and risks are independent of deal type.
  if (typeof marketAnalysis === 'object' && marketAnalysis && marketAnalysis.census) {
    R.market_score     = marketAnalysis.derived ? marketAnalysis.derived.market_strength_score : null;
    R.market_grade     = marketAnalysis.derived ? marketAnalysis.derived.market_strength_grade : null;
    R.market_cbsa_name = marketAnalysis.cbsa_name || null;
    R.market_zip       = marketAnalysis.zip || null;
    R.market_fetched_at= marketAnalysis.fetched_at || null;
    if (typeof computeMarketRisks === 'function') {
      R.market_risks = computeMarketRisks(marketAnalysis.census, marketAnalysis.derived);
    }
  }

  // M5: engine risks (mode-aware, derived from R + inputs + comps).
  R.engine_risks = computeEngineRisks(mode, R, inputs, comps);
}
