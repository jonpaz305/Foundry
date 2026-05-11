// ════════════════════════════════════════════════════════════════
// FOUNDRY - Regression Seed Deals
// ════════════════════════════════════════════════════════════════
//
// One-time seed script. Creates the two canonical regression deals
// used to validate the engine in M2/M3:
//
//   Foundry-BRRRR-001: 2048 E 79th Street, Cleveland OH 44103
//                      16-unit Commercial Multifamily acq-rehab
//   Foundry-FF-001:    2455 W 7 ST, Cleveland OH 44113
//                      Single-family fix and flip
//
// Both deals are loaded with the EXACT input values from the
// filled spreadsheet examples, including manual overrides where
// the underwriter deviated from the spreadsheet defaults. When the
// engine ships in M2/M3, these deals must reproduce the 21 BRRRR
// metrics and 14 F&F metrics from the audit document exactly.
//
// To seed: open Settings → click "Seed regression deals". Idempotent
// in the sense that it checks for existing deals by name before
// inserting, so running it twice doesn't create duplicates.
// ════════════════════════════════════════════════════════════════

const SEED_BRRRR_2048_E_79TH = {
  name: 'Foundry-BRRRR-001 · 2048 E 79th Street',
  deal_mode: 'brrrr',
  asset_type: 'commercial_multifamily',
  address: '2048 E 79th Street',
  city:    'Cleveland',
  state:   'OH',
  zip:     '44103',
  inputs: {
    property_address: '2048 E 79th Street',
    city: 'Cleveland',
    state: 'OH',
    zip: '44103',
    asset_type: 'commercial_multifamily',
    subject_area_sf: null,
    target_refi_months: 9,
    target_hold_years: 10,
    target_refi_ltv: 0.70,            // overrides 0.75 default
    vacancy_pct: 0.05,
    pm_pct: 0.07,
    maint_pct_of_egi: 0.055,
    insurance_pct_of_egi: 0.08,
    utilities_pct_of_egi: 0.02,
    reserves_per_unit_year: 1000,
    rent_growth_pct: 0.03,
    appreciation_pct: 0.05,
    exit_cap: 0.0875,                 // overrides 0.0895 default
    sale_cost_pct: 0.07,
    purchase_price: 240000,
    reno_budget: 616000,
    mobilization_contingency: 50000,
    treat_mob_as_equity: false,
    consulting_fees_override: 30000,  // overrides max($10k, 3%) default
    closing_cost_baseline: 2444,
    closing_cost_loan_pct: 0.05,
    initial_loan_ltv: 0.70,           // overrides 0.93 default - this deal is 70/91
    initial_loan_ltc_reno: 0.91,
    initial_rate: 0.11,               // overrides 0.127 default
    initial_interest_type: 'IO',
    refi_rate: 0.07,                  // overrides 0.075 default
    refi_interest_type: 'PI',
    refi_closing_cost_pct: 0.04,
    investor_ownership: 0.5,
    tax_basis_mode: 'purchase_price', // matches spreadsheet behavior for parity
    tax_district: 'Cleveland',
    equity_multiple_method: 'institutional'
  },
  unit_mix: [
    { bed_type: '1br', count: 2,  rent: 900  },
    { bed_type: '2br', count: 14, rent: 1100 }
  ],
  comps: [],
  market_analysis: {},
  overrides: {
    // The filled spreadsheet shows closing_costs = $37,629.20 even though the
    // formula gives a different value. Seed the override so regression matches.
    closing_costs: 37629.20
  },
  risks: []
};

const SEED_FF_2455_W_7TH = {
  name: 'Foundry-FF-001 · 2455 W 7 ST',
  deal_mode: 'fix_and_flip',
  asset_type: 'single_family',
  address: '2455 W 7 ST',
  city:    'Cleveland',
  state:   'OH',
  zip:     '44113',
  inputs: {
    property_address: '2455 W 7 ST',
    city: 'Cleveland',
    state: 'OH',
    zip: '44113',
    asset_type: 'single_family',
    subject_area_sf: 2404,
    target_hold_months: 7,
    arv_override: 550000,              // override the comp-derived ~$544k
    purchase_price: 240000,
    reno_budget: 90000,
    mobilization_contingency: 30000,
    treat_mob_as_equity: false,
    consulting_fees_override: 10000,
    closing_cost_baseline: 2444,
    closing_cost_loan_pct: 0.05,
    initial_loan_ltv: 0.90,            // overrides 0.93 default - this deal is 90/100
    initial_loan_ltc_reno: 1.00,
    initial_rate: 0.127,
    initial_interest_type: 'IO',
    sale_cost_pct: 0.07,
    lp_gp_split_ff: 0.5,
    tax_district: 'Cleveland'
  },
  unit_mix: [],
  comps: [
    { address: '2295 Thurman Ave, Cleveland, OH 44113', sales_price: 473500, area_sf: 2650, dom: 62 },
    { address: '2164 W 6th St, Cleveland, OH 44113',    sales_price: 640000, area_sf: 2800, dom: 54 },
    { address: '2475 Tremont St, Cleveland, OH 44113',  sales_price: 673000, area_sf: 2440, dom: null }
  ],
  market_analysis: {},
  overrides: {
    // The filled spreadsheet shows closing_costs = $16,214 even though the
    // formula gives a different value. Seed the override so regression matches.
    closing_costs: 16214
  },
  risks: []
};


async function seedRegressionDeals() {
  if (!currentUser) {
    alert('Sign in first.');
    return;
  }

  const ok = confirm(
    'Seed the two regression deals (2048 E 79th BRRRR and 2455 W 7th F&F)?\n\n' +
    'Skips creation if a deal with the same name already exists.'
  );
  if (!ok) return;

  let created = 0;
  let skipped = 0;
  const seeds = [SEED_BRRRR_2048_E_79TH, SEED_FF_2455_W_7TH];

  for (const seed of seeds) {
    // Check if already exists by name
    const existing = deals.find(d => d.name === seed.name);
    if (existing) {
      skipped++;
      continue;
    }

    const row = Object.assign({}, seed, {
      user_id: currentUser.id,
      company_id: CP.active ? CP.active.id : null
    });

    try {
      const { data, error } = await sb
        .from('foundry_deals')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      deals.unshift(data);
      created++;
    } catch (e) {
      alert(`Could not seed ${seed.name}: ${e.message}`);
      return;
    }
  }

  renderDealList();
  alert(`Seed complete.\nCreated: ${created}\nSkipped (already existed): ${skipped}`);
}
