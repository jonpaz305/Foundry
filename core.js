// ════════════════════════════════════════════════════════════════
// FOUNDRY - Core (auth, Supabase, deal CRUD, autosave, state)
// ════════════════════════════════════════════════════════════════
//
// Pattern inherited from Cadence/Tranche. The R object is the
// canonical engine-output store - read-only from UI code, written
// only by engine.js (which doesn't exist yet in M1 - placeholders
// only). Deal CRUD persists to Supabase with per-section autosave.
//
// Mode toggle: every deal has a deal_mode of 'brrrr' or 'fix_and_flip'.
// Mode drives which sections render and which engine runs. State
// shape is unified - only the engine dispatch and the UI gating
// differ.
// ════════════════════════════════════════════════════════════════


// ── SUPABASE CONFIG ─────────────────────────────────────────────
// Shared Supabase project across Cadence / Tranche / Foundry.
// Foundry uses the foundry_* namespaced tables; auth is shared.
const SUPABASE_URL  = 'https://nkczxoggmbllcmbksmrn.supabase.co';
const SUPABASE_ANON = 'sb_publishable_V2ixyLYaYBlqRfkTAu9tOA_3LwBwB7z';

let sb = null;
let currentUser = null;
let currentDeal = null;
let deals = [];


// ── CANONICAL DEAL STATE ────────────────────────────────────────
// Read by all UI / engine code. Reset on deal switch.
// All field names use snake_case to match jsonb column conventions.

let inputs = {
  // Property
  property_address:        '',
  city:                    '',
  state:                   '',
  zip:                     '',
  asset_type:              'multifamily_2_4', // 'single_family' | 'multifamily_2_4' | 'commercial_multifamily' | 'commercial'

  // BRRRR-only
  subject_area_sf:         null,              // also used in F&F
  target_refi_months:      null,
  target_hold_years:       10,
  target_refi_ltv:         0.75,
  vacancy_pct:             0.05,
  pm_pct:                  0.07,
  maint_pct_of_egi:        0.055,
  insurance_pct_of_egi:    0.08,
  utilities_pct_of_egi:    0.02,
  reserves_per_unit_year:  1000,
  rent_growth_pct:         0.03,
  appreciation_pct:        0.05,
  exit_cap:                0.0895,
  sale_cost_pct:           0.07,

  // F&F-only
  target_hold_months:      null,
  arv_override:            null,              // optional manual ARV (otherwise comp-derived)

  // Acquisition / debt - both modes
  purchase_price:          0,
  reno_budget:             0,
  mobilization_contingency: 0,
  treat_mob_as_equity:     false,             // BRRRR: whether mob/conting counts toward initial equity
  consulting_fees_override: null,             // null = use formula default (max($10k, 3% of acq+reno))
  closing_cost_baseline:   2444,              // the Cuyahoga title/escrow stack
  closing_cost_loan_pct:   0.05,              // 2% origination + 3% points = 5% of loan
  initial_loan_ltv:        0.93,              // hard-money LTV on purchase
  initial_loan_ltc_reno:   1.00,              // hard-money LTC on reno (100% funded)
  initial_rate:            0.127,
  initial_interest_type:   'IO',              // 'IO' | 'PI'

  // Refi - BRRRR only
  refi_rate:               0.075,
  refi_interest_type:      'PI',
  refi_closing_cost_pct:   0.04,
  investor_ownership:      0.5,               // LP/GP split - investor share of post-refi cash flow
  lp_gp_split_ff:          0.5,               // F&F LP share of gross proceeds (replaces hardcoded 50/50)

  // Tax behavior (Foundry-new - spreadsheet uses purchase price; we offer the toggle)
  tax_basis_mode:          'stabilized_arv',  // 'purchase_price' | 'stabilized_arv'
  tax_district:            '',                // Cuyahoga municipality pick

  // Equity multiple definition (Foundry-new - fixes the spreadsheet bug)
  // Kept here for engine reference; always uses 'institutional' definition.
  equity_multiple_method:  'institutional'
};

let unitMix = [];          // BRRRR mode: [{ bed_type, count, rent }, ...]
let comps = [];            // F&F mode: [{ address, sales_price, area_sf, dom }, ...]
let marketAnalysis = {};   // populated by market.js (M4)
let overrides = {};        // per-field engine-output overrides
let riskRegister = [];     // populated by risk.js (M5)

// Engine outputs - R is written by engine.js (M2/M3). M1 stub:
let R = {};


// ── COMPANY PROFILES (branded reports) ──────────────────────────
let CP = { list: [], active: null };


// ── AUTOSAVE TIMERS ─────────────────────────────────────────────
// One debounce timer per logical section. 700ms after the last
// keystroke, that section commits to Supabase. Matches the
// Cadence/Tranche pattern exactly.
let autosaveTimers = {};


// ── HELPERS ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Number formatters - shared across UI
const f$ = (n) => {
  if (n == null || !isFinite(n)) return '-';
  const v = Math.round(n);
  return '$' + v.toLocaleString();
};
const fP = (n) => {
  if (n == null || !isFinite(n)) return '-';
  return (n * 100).toFixed(2) + '%';
};
const fX = (n) => {
  if (n == null || !isFinite(n)) return '-';
  return n.toFixed(2) + 'x';
};
const fN = (n) => {
  if (n == null || !isFinite(n)) return '-';
  return Math.round(n).toLocaleString();
};


// ── AUTH ────────────────────────────────────────────────────────
async function initSupabase() {
  if (!window.supabase) {
    console.error('[Foundry] Supabase JS library not loaded');
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // Check session
  const { data: sessionData } = await sb.auth.getSession();
  if (sessionData && sessionData.session) {
    currentUser = sessionData.session.user;
    onAuthReady();
  } else {
    showAuthScreen();
  }

  // Subscribe to auth changes
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      onAuthReady();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  const auth = $('auth-screen');
  const app  = $('app-shell');
  if (auth) auth.style.display = 'flex';
  if (app)  app.style.display  = 'none';
}

function showAppShell() {
  const auth = $('auth-screen');
  const app  = $('app-shell');
  if (auth) auth.style.display = 'none';
  if (app)  app.style.display  = 'flex';
}

async function signIn() {
  const email = ($('auth-email') || {}).value;
  const pass  = ($('auth-password') || {}).value;
  const errEl = $('auth-error');
  if (errEl) errEl.textContent = '';
  if (!email || !pass) {
    if (errEl) errEl.textContent = 'Email and password required.';
    return;
  }
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) throw error;
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Sign-in failed.';
  }
}

async function signUp() {
  const email = ($('auth-email') || {}).value;
  const pass  = ($('auth-password') || {}).value;
  const errEl = $('auth-error');
  if (errEl) errEl.textContent = '';
  if (!email || !pass) {
    if (errEl) errEl.textContent = 'Email and password required.';
    return;
  }
  try {
    const { error } = await sb.auth.signUp({ email: email.trim(), password: pass });
    if (error) throw error;
    if (errEl) errEl.textContent = 'Check email to confirm. Then sign in.';
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Sign-up failed.';
  }
}

async function signOut() {
  await sb.auth.signOut();
}


// ── BOOT SEQUENCE ───────────────────────────────────────────────
async function onAuthReady() {
  showAppShell();
  await loadCompanies();
  await loadDeals();
  // Surface the user email in the top bar
  const ue = $('user-email');
  if (ue) ue.textContent = currentUser.email || '';
  renderDealList();
  renderCompanyPicker();
  renderDashboard();
}


// ── COMPANIES ──────────────────────────────────────────────────
async function loadCompanies() {
  const { data, error } = await sb
    .from('foundry_companies')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[Foundry] load companies failed:', error);
    return;
  }
  CP.list = data || [];
  // Restore last-active company from localStorage
  const lastId = localStorage.getItem('foundry_active_company');
  if (lastId) {
    CP.active = CP.list.find(c => c.id === lastId) || null;
  }
  if (!CP.active && CP.list.length > 0) {
    CP.active = CP.list[0];
    localStorage.setItem('foundry_active_company', CP.active.id);
  }
}

function setActiveCompany(id) {
  const found = CP.list.find(c => c.id === id);
  if (!found) return;
  CP.active = found;
  localStorage.setItem('foundry_active_company', id);
  renderCompanyPicker();
}


// ── DEALS ───────────────────────────────────────────────────────
async function loadDeals() {
  const { data, error } = await sb
    .from('foundry_deals')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[Foundry] load deals failed:', error);
    deals = [];
    return;
  }
  deals = data || [];
}

async function loadDeal(id) {
  const d = deals.find(x => x.id === id);
  if (!d) return;
  currentDeal = d;

  // Reset state and hydrate from row
  resetState();
  hydrateFromDeal(d);

  // Render mode-aware UI
  applyModeToUI();
  renderDealList();
  renderDashboard();
  if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
}

function resetState() {
  inputs = {
    property_address: '', city: '', state: '', zip: '',
    asset_type: 'multifamily_2_4',
    subject_area_sf: null,
    target_refi_months: null,
    target_hold_years: 10,
    target_refi_ltv: 0.75,
    vacancy_pct: 0.05,
    pm_pct: 0.07,
    maint_pct_of_egi: 0.055,
    insurance_pct_of_egi: 0.08,
    utilities_pct_of_egi: 0.02,
    reserves_per_unit_year: 1000,
    rent_growth_pct: 0.03,
    appreciation_pct: 0.05,
    exit_cap: 0.0895,
    sale_cost_pct: 0.07,
    target_hold_months: null,
    arv_override: null,
    purchase_price: 0,
    reno_budget: 0,
    mobilization_contingency: 0,
    treat_mob_as_equity: false,
    consulting_fees_override: null,
    closing_cost_baseline: 2444,
    closing_cost_loan_pct: 0.05,
    initial_loan_ltv: 0.93,
    initial_loan_ltc_reno: 1.00,
    initial_rate: 0.127,
    initial_interest_type: 'IO',
    refi_rate: 0.075,
    refi_interest_type: 'PI',
    refi_closing_cost_pct: 0.04,
    investor_ownership: 0.5,
    lp_gp_split_ff: 0.5,
    tax_basis_mode: 'stabilized_arv',
    tax_district: '',
    equity_multiple_method: 'institutional'
  };
  unitMix = [];
  comps = [];
  marketAnalysis = {};
  overrides = {};
  riskRegister = [];
  R = {};
}

function hydrateFromDeal(d) {
  // Merge stored inputs onto defaults (so fields added after row was
  // created still get a sensible default)
  if (d.inputs && typeof d.inputs === 'object') {
    Object.assign(inputs, d.inputs);
  }
  // Pull denormalized header fields back into inputs for the form
  if (d.address) inputs.property_address = d.address;
  if (d.city)    inputs.city = d.city;
  if (d.state)   inputs.state = d.state;
  if (d.zip)     inputs.zip = d.zip;
  if (d.asset_type) inputs.asset_type = d.asset_type;

  unitMix         = Array.isArray(d.unit_mix) ? d.unit_mix : [];
  comps           = Array.isArray(d.comps) ? d.comps : [];
  marketAnalysis  = d.market_analysis || {};
  overrides       = d.overrides || {};
  riskRegister    = Array.isArray(d.risks) ? d.risks : [];
}


// ── MODE TOGGLE ─────────────────────────────────────────────────
// Drives which sections show. Used by data-entry.js and shell-ui.js.
function getDealMode() {
  return currentDeal && currentDeal.deal_mode ? currentDeal.deal_mode : 'brrrr';
}

function applyModeToUI() {
  const mode = getDealMode();
  // Sections tagged with data-mode get hidden when their mode doesn't match
  document.querySelectorAll('[data-mode]').forEach(el => {
    const elModes = (el.getAttribute('data-mode') || '').split(',').map(s => s.trim());
    el.style.display = elModes.includes(mode) ? '' : 'none';
  });
  // Also tag the body so CSS can branch on mode
  document.body.setAttribute('data-deal-mode', mode);
}

async function switchDealMode(newMode) {
  if (!currentDeal) return;
  if (newMode !== 'brrrr' && newMode !== 'fix_and_flip') return;
  if (currentDeal.deal_mode === newMode) return;

  const ok = confirm(
    `Switch this deal to ${newMode === 'brrrr' ? 'BRRRR' : 'Fix and Flip'} mode?\n\n` +
    'Mode-specific fields not shared between modes will be hidden but preserved. ' +
    'You can switch back without losing data.'
  );
  if (!ok) return;

  currentDeal.deal_mode = newMode;
  try {
    const { error } = await sb
      .from('foundry_deals')
      .update({ deal_mode: newMode, updated_at: new Date().toISOString() })
      .eq('id', currentDeal.id);
    if (error) throw error;
    applyModeToUI();
    renderDashboard();
    if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
  } catch (e) {
    alert('Could not switch mode: ' + e.message);
  }
}


// ── NEW DEAL ────────────────────────────────────────────────────
function openNewDeal() {
  const m = $('new-deal-modal');
  if (m) m.style.display = 'flex';
}

function closeNewDeal() {
  const m = $('new-deal-modal');
  if (m) m.style.display = 'none';
}

async function createDeal() {
  const name = ($('nd-name') || {}).value;
  const mode = ($('nd-mode') || {}).value || 'brrrr';
  if (!name || !name.trim()) {
    alert('Deal name required.');
    return;
  }
  try {
    const row = {
      user_id: currentUser.id,
      company_id: CP.active ? CP.active.id : null,
      name: name.trim(),
      deal_mode: mode,
      inputs: {},
      unit_mix: [],
      comps: [],
      market_analysis: {},
      overrides: {},
      risks: []
    };
    const { data, error } = await sb
      .from('foundry_deals')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    deals.unshift(data);
    closeNewDeal();
    await loadDeal(data.id);
  } catch (e) {
    alert('Could not create deal: ' + e.message);
  }
}

async function deleteDeal(id) {
  const d = deals.find(x => x.id === id);
  if (!d) return;
  if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
  try {
    const { error } = await sb.from('foundry_deals').delete().eq('id', id);
    if (error) throw error;
    deals = deals.filter(x => x.id !== id);
    if (currentDeal && currentDeal.id === id) {
      currentDeal = null;
      resetState();
    }
    renderDealList();
    renderDashboard();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}


// ── AUTOSAVE ────────────────────────────────────────────────────
// Per-section commit. Section keys: 'inputs', 'unit_mix', 'comps',
// 'market_analysis', 'overrides', 'risks', 'header'. Each section
// has its own debounce timer so they don't compete.
function autosave(section) {
  if (!currentDeal) return;
  if (autosaveTimers[section]) clearTimeout(autosaveTimers[section]);
  autosaveTimers[section] = setTimeout(() => commitSection(section), 700);
}

async function commitSection(section) {
  if (!currentDeal) return;

  const patch = { updated_at: new Date().toISOString() };

  if (section === 'inputs') {
    patch.inputs = Object.assign({}, inputs);
    // Mirror denormalized header fields
    patch.address    = inputs.property_address || null;
    patch.city       = inputs.city || null;
    patch.state      = inputs.state || null;
    patch.zip        = inputs.zip || null;
    patch.asset_type = inputs.asset_type || null;
  } else if (section === 'unit_mix')        { patch.unit_mix = unitMix; }
  else if (section === 'comps')             { patch.comps = comps; }
  else if (section === 'market_analysis')   { patch.market_analysis = marketAnalysis; }
  else if (section === 'overrides')         { patch.overrides = overrides; }
  else if (section === 'risks')             { patch.risks = riskRegister; }
  else if (section === 'header')            {
    patch.name = currentDeal.name;
  } else {
    console.warn('[Foundry] unknown autosave section:', section);
    return;
  }

  try {
    const { error } = await sb
      .from('foundry_deals')
      .update(patch)
      .eq('id', currentDeal.id);
    if (error) throw error;

    // Local mirror - keep `deals` array fresh so sidebar reflects edits
    Object.assign(currentDeal, patch);
    const localIdx = deals.findIndex(x => x.id === currentDeal.id);
    if (localIdx >= 0) {
      Object.assign(deals[localIdx], patch);
      // Re-sort by updated_at desc to bring this deal to the top
      deals.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      renderDealList();
    }

    const ind = $('save-status');
    if (ind) {
      ind.textContent = '● Saved';
      ind.style.color = 'var(--ok)';
      setTimeout(() => { if (ind) ind.textContent = ''; }, 1500);
    }
  } catch (e) {
    console.error('[Foundry] save FAILED:', section, e);
    const ind = $('save-status');
    if (ind) {
      ind.textContent = '● Save failed';
      ind.style.color = 'var(--bad)';
    }
  }
}


// ── INPUT HANDLERS (called from data-entry.js form bindings) ────
function onInputChange(field, value) {
  // Coerce numeric fields
  const numericFields = new Set([
    'subject_area_sf','target_refi_months','target_hold_years','target_refi_ltv',
    'vacancy_pct','pm_pct','maint_pct_of_egi','insurance_pct_of_egi',
    'utilities_pct_of_egi','reserves_per_unit_year','rent_growth_pct',
    'appreciation_pct','exit_cap','sale_cost_pct','target_hold_months',
    'arv_override','purchase_price','reno_budget','mobilization_contingency',
    'consulting_fees_override','closing_cost_baseline','closing_cost_loan_pct',
    'initial_loan_ltv','initial_loan_ltc_reno','initial_rate','refi_rate',
    'refi_closing_cost_pct','investor_ownership','lp_gp_split_ff'
  ]);
  if (numericFields.has(field)) {
    if (value === '' || value === null || value === undefined) {
      inputs[field] = null;
    } else {
      const n = Number(value);
      inputs[field] = isFinite(n) ? n : null;
    }
  } else if (field === 'treat_mob_as_equity') {
    inputs[field] = !!value;
  } else {
    inputs[field] = value;
  }

  autosave('inputs');
  // Engine recomputes (M2/M3 will wire this); dashboard re-renders
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}


// ── STUB recompute() - replaced by engine.js in M2/M3 ───────────
// M1 has no engine. This stub exists so dashboard/UI calls don't
// throw. M2 (BRRRR engine) and M3 (F&F engine) will replace this
// with the real dispatch:
//
//   function recompute() {
//     const mode = getDealMode();
//     if (mode === 'brrrr')         computeBRRRR();
//     else if (mode === 'fix_and_flip') computeFixAndFlip();
//   }
function recompute() {
  R = {}; // empty until M2/M3
}


// ── BOOT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
