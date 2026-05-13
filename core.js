// ════════════════════════════════════════════════════════════════
// FOUNDRY - Core (auth, Supabase, deal CRUD, autosave, navigation)
// ════════════════════════════════════════════════════════════════
// Pattern inherited directly from Cadence/Tranche. State model is
// dual-mode (BRRRR + Fix and Flip) but auth, CRUD, autosave, and
// navigation are identical to the other apps.
// ════════════════════════════════════════════════════════════════


// ── SUPABASE CONFIG ────────────────────────────────────────────
// Shared Supabase project across Cadence / Tranche / Foundry.
const SUPABASE_URL  = 'https://nkczxoggmbllcmbksmrn.supabase.co';
const SUPABASE_ANON = 'sb_publishable_V2ixyLYaYBlqRfkTAu9tOA_3LwBwB7z';

let sb = null;
let currentUser = null;
let currentDeal = null;
let deals = [];


// ── CANONICAL DEAL STATE ───────────────────────────────────────
let inputs = makeDefaultInputs();
let unitMix = [];
let comps = [];
let marketAnalysis = {};
let overrides = {};
let riskRegister = [];

// Engine outputs - written by engine.js (M2/M3). M1 stub: empty.
let R = {};

// Company profiles
let CP = { list: [], active: null };

// Autosave timers (per-section debouncing, same pattern as Cadence/Tranche)
let autosaveTimers = {};

// Internal flag to suppress autosave during loadDeal hydration
let _loadingDeal = false;


function makeDefaultInputs() {
  return {
    // Property
    property_address:        '',
    city:                    '',
    state:                   '',
    zip:                     '',
    asset_type:              'multifamily_2_4',
    subject_area_sf:         null,

    // BRRRR strategy
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

    // F&F strategy
    target_hold_months:      null,
    arv_override:            null,

    // Acquisition / debt (both modes)
    purchase_price:          0,
    reno_budget:             0,
    mobilization_contingency: 0,
    treat_mob_as_equity:     false,
    consulting_fees_override: null,
    closing_cost_baseline:   2444,
    closing_cost_loan_pct:   0.05,
    initial_loan_ltv:        0.93,
    initial_loan_ltc_reno:   1.00,
    initial_rate:            0.127,
    initial_interest_type:   'IO',

    // Refi (BRRRR only)
    refi_rate:               0.075,
    refi_interest_type:      'PI',
    refi_closing_cost_pct:   0.04,
    investor_ownership:      0.5,

    // F&F LP/GP
    lp_gp_split_ff:          0.5,

    // Tax behavior
    tax_basis_mode:          'stabilized_arv',
    tax_district:            '',

    // Equity multiple definition (institutional only - see audit doc)
    equity_multiple_method:  'institutional'
  };
}


// ── HELPERS ────────────────────────────────────────────────────
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

const f$ = (n) => {
  if (n == null || !isFinite(n)) return '-';
  return '$' + Math.round(n).toLocaleString();
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


// ── AUTH ───────────────────────────────────────────────────────
async function initSupabase() {
  if (!window.supabase) {
    console.error('[Foundry] Supabase JS library not loaded');
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  await checkSession();
}

async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data && data.session) {
    currentUser = data.session.user;
    await initApp();
  } else {
    $('auth-screen').style.display = 'flex';
    $('app-screen').style.display = 'none';
  }
}

let _authMode = 'signin';  // 'signin' | 'signup'
function toggleAuth() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const btn = $('auth-submit-btn');
  const lbl = $('auth-toggle-lbl');
  const tbtn = $('auth-toggle-btn');
  if (btn) btn.textContent = _authMode === 'signin' ? 'Sign in' : 'Sign up';
  if (lbl) lbl.textContent = _authMode === 'signin' ? "Don't have an account?" : 'Already have an account?';
  if (tbtn) tbtn.textContent = _authMode === 'signin' ? 'Sign up' : 'Sign in';
}

async function authSubmit() {
  const email = ($('a-email') || {}).value;
  const pass  = ($('a-pass')  || {}).value;
  const err   = $('a-err');
  if (err) err.style.display = 'none';

  if (!email || !pass) {
    if (err) { err.textContent = 'Email and password required.'; err.style.display = 'flex'; }
    return;
  }

  try {
    if (_authMode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.signUp({ email: email.trim(), password: pass });
      if (error) throw error;
      if (err) { err.textContent = 'Check your email to confirm, then sign in.'; err.className = 'sbar s-ok'; err.style.display = 'flex'; }
      _authMode = 'signin';
      return;
    }
  } catch (e) {
    if (err) { err.textContent = e.message || 'Auth failed.'; err.className = 'sbar s-bad'; err.style.display = 'flex'; }
  }
}

async function signOut() {
  await sb.auth.signOut();
  _clearAllAutosaveTimers();
  _loadingDeal = true;
  try { resetDealState(); } finally { _loadingDeal = false; }
  currentUser = null; currentDeal = null;
  $('auth-screen').style.display = 'flex';
  $('app-screen').style.display = 'none';
}

function toggleUserMenu() {
  const menu = $('tb-user-menu');
  if (!menu) return;
  const open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'block';
  if (!open) {
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!$('tb-user-menu-wrap') || !$('tb-user-menu-wrap').contains(e.target)) {
          if (menu) menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }
}

function openChangePassword() {
  const menu = $('tb-user-menu');
  if (menu) menu.style.display = 'none';
  const err = $('cp-pw-err'); const ok = $('cp-pw-ok');
  const p1 = $('cp-pw1'); const p2 = $('cp-pw2');
  if (err) err.style.display = 'none';
  if (ok)  ok.style.display = 'none';
  if (p1)  p1.value = '';
  if (p2)  p2.value = '';
  $('change-pw-modal').style.display = 'flex';
}

async function changePassword() {
  const p1 = ($('cp-pw1') || {}).value || '';
  const p2 = ($('cp-pw2') || {}).value || '';
  const err = $('cp-pw-err'); const ok = $('cp-pw-ok');
  if (err) err.style.display = 'none';
  if (ok)  ok.style.display = 'none';
  if (p1.length < 8) {
    if (err) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = 'flex'; }
    return;
  }
  if (p1 !== p2) {
    if (err) { err.textContent = 'Passwords do not match.'; err.style.display = 'flex'; }
    return;
  }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) {
    if (err) { err.textContent = error.message || 'Error updating password.'; err.style.display = 'flex'; }
    return;
  }
  if (ok) ok.style.display = 'flex';
  setTimeout(() => closeModal('change-pw-modal'), 1800);
}


// ── APP INIT ──────────────────────────────────────────────────
async function initApp() {
  $('auth-screen').style.display = 'none';
  $('app-screen').style.display  = 'block';
  await loadCompanies();
  await loadDeals();
  if ($('tb-user-email')) $('tb-user-email').textContent = currentUser.email || '';
  renderDealList();
  renderCompanyPicker();
  updateDashboard();
}


// ── COMPANIES ─────────────────────────────────────────────────
async function loadCompanies() {
  const { data, error } = await sb
    .from('foundry_companies')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('[Foundry] load companies:', error); return; }
  CP.list = data || [];
  const lastId = localStorage.getItem('foundry_active_company');
  if (lastId) CP.active = CP.list.find(c => c.id === lastId) || null;
  if (!CP.active && CP.list.length) {
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

async function createCompanyProfile() {
  const name = prompt('Company name (e.g. "ASJP Group", "KPI Capital Partners"):');
  if (!name) return;
  try {
    const { data, error } = await sb
      .from('foundry_companies')
      .insert({
        user_id: currentUser.id,
        name: name.trim(), subtitle: '',
        logo_base64: null, primary_color: '#C9A84C',
        contact_info: {}
      })
      .select().single();
    if (error) throw error;
    CP.list.push(data);
    CP.active = data;
    localStorage.setItem('foundry_active_company', data.id);
    renderCompanyPicker();
  } catch (e) {
    alert('Could not create company: ' + e.message);
  }
}


// ── DEALS ─────────────────────────────────────────────────────
async function loadDeals() {
  const { data, error } = await sb
    .from('foundry_deals')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) { console.error('[Foundry] load deals:', error); deals = []; return; }
  deals = data || [];

  // Mobile selector mirror
  const sel = $('tb-mobile-deal-sel');
  if (sel) {
    sel.innerHTML = '<option value="">- Select deal -</option>' +
      deals.map(d => `<option value="${d.id}"${currentDeal && currentDeal.id === d.id ? ' selected' : ''}>${escapeHtml(d.name)}</option>`).join('');
  }
}

async function loadDeal(id) {
  const d = deals.find(x => x.id === id);
  if (!d) return;

  _loadingDeal = true;
  try {
    currentDeal = d;
    resetDealState();
    hydrateFromDeal(d);
  } finally {
    _loadingDeal = false;
  }

  // Surface deal name in topbar subtitle
  if ($('tb-deal-name')) $('tb-deal-name').textContent = d.name;

  // Surface mode selector
  if ($('mode-sel')) $('mode-sel').value = d.deal_mode || 'brrrr';

  renderDealList();
  if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
  if (typeof renderUnitMixBlock === 'function') renderUnitMixBlock();
  if (typeof renderCompsBlock === 'function') renderCompsBlock();
  if (typeof renderCapitalBlock === 'function') renderCapitalBlock();
  if (typeof renderOperatingBlock === 'function') renderOperatingBlock();
  if (typeof recompute === 'function') recompute();
  updateDashboard();
  closeSidebar();
}

function resetDealState() {
  inputs = makeDefaultInputs();
  unitMix = [];
  comps = [];
  marketAnalysis = {};
  overrides = {};
  riskRegister = [];
  R = {};
}

function hydrateFromDeal(d) {
  if (d.inputs && typeof d.inputs === 'object') {
    Object.assign(inputs, d.inputs);
  }
  // Pull denormalized header fields into inputs (so the Setup form reflects them)
  if (d.address)    inputs.property_address = d.address;
  if (d.city)       inputs.city = d.city;
  if (d.state)      inputs.state = d.state;
  if (d.zip)        inputs.zip = d.zip;
  if (d.asset_type) inputs.asset_type = d.asset_type;

  unitMix        = Array.isArray(d.unit_mix) ? d.unit_mix : [];
  comps          = Array.isArray(d.comps) ? d.comps : [];
  marketAnalysis = d.market_analysis || {};
  overrides      = d.overrides || {};
  riskRegister   = Array.isArray(d.risks) ? d.risks : [];
}


function getDealMode() {
  return currentDeal && currentDeal.deal_mode ? currentDeal.deal_mode : 'brrrr';
}

async function switchDealMode(newMode) {
  if (!currentDeal) return;
  if (newMode !== 'brrrr' && newMode !== 'fix_and_flip') return;
  if (currentDeal.deal_mode === newMode) return;

  currentDeal.deal_mode = newMode;
  try {
    const { error } = await sb
      .from('foundry_deals')
      .update({ deal_mode: newMode, updated_at: new Date().toISOString() })
      .eq('id', currentDeal.id);
    if (error) throw error;

    // Mirror locally
    const localIdx = deals.findIndex(x => x.id === currentDeal.id);
    if (localIdx >= 0) deals[localIdx].deal_mode = newMode;

    // Re-render any open page
    if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
    if (typeof renderCapitalBlock === 'function') renderCapitalBlock();
    renderDealList();
    updateDashboard();
  } catch (e) {
    alert('Could not switch mode: ' + e.message);
  }
}


// ── NEW / DELETE DEAL ─────────────────────────────────────────
function openNewDeal() {
  ['nd-name','nd-addr','nd-city','nd-state','nd-zip'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  const errBox = $('nd-err');
  if (errBox) errBox.style.display = 'none';
  $('new-deal-modal').style.display = 'flex';
  setTimeout(() => { if ($('nd-name')) $('nd-name').focus(); }, 50);
}

function closeModal(id) {
  if ($(id)) $(id).style.display = 'none';
}

async function createDeal() {
  const name = ($('nd-name') || {}).value;
  if (!name || !name.trim()) {
    const err = $('nd-err');
    if (err) { err.textContent = 'Deal name required.'; err.style.display = 'flex'; }
    return;
  }
  const mode = ($('nd-mode') || {}).value || 'brrrr';
  const addr = ($('nd-addr')  || {}).value || '';
  const city = ($('nd-city')  || {}).value || '';
  const state= ($('nd-state') || {}).value || '';
  const zip  = ($('nd-zip')   || {}).value || '';

  try {
    const { data, error } = await sb
      .from('foundry_deals')
      .insert({
        user_id: currentUser.id,
        company_id: CP.active ? CP.active.id : null,
        name: name.trim(),
        address: addr.trim() || null,
        city: city.trim() || null,
        state: state.trim().toUpperCase() || null,
        zip: zip.trim() || null,
        deal_mode: mode,
        inputs: {}, unit_mix: [], comps: [],
        market_analysis: {}, overrides: {}, risks: []
      })
      .select().single();
    if (error) throw error;
    deals.unshift(data);
    closeModal('new-deal-modal');
    await loadDeal(data.id);
  } catch (e) {
    const err = $('nd-err');
    if (err) { err.textContent = e.message || 'Could not create deal.'; err.style.display = 'flex'; }
  }
}

function confirmDeleteDeal(id, name) {
  const modal = $('delete-deal-modal');
  const label = $('delete-deal-name');
  if (!modal) return;
  if (label) label.textContent = name;
  modal.setAttribute('data-pending-id', id);
  modal.style.display = 'flex';
}

async function deleteDeal(confirmed) {
  const modal = $('delete-deal-modal');
  if (!modal) return;
  modal.style.display = 'none';
  if (!confirmed) return;
  const id = modal.getAttribute('data-pending-id');
  if (!id) return;

  const { error } = await sb.from('foundry_deals').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { console.error('[Foundry] delete deal:', error); return; }

  if (currentDeal && currentDeal.id === id) {
    currentDeal = null;
    resetDealState();
    if ($('tb-deal-name')) $('tb-deal-name').textContent = 'No deal selected';
    navTo('dashboard', document.querySelector('[data-section=dashboard]'));
  }
  deals = deals.filter(d => d.id !== id);
  renderDealList();
  updateDashboard();
}


// ── AUTOSAVE ──────────────────────────────────────────────────
function autosave(section) {
  if (_loadingDeal) return;
  if (!currentDeal) return;
  if (autosaveTimers[section]) clearTimeout(autosaveTimers[section]);
  autosaveTimers[section] = setTimeout(() => commitSection(section), 700);
}

function _clearAllAutosaveTimers() {
  Object.keys(autosaveTimers).forEach(k => clearTimeout(autosaveTimers[k]));
  autosaveTimers = {};
}

async function commitSection(section) {
  if (!currentDeal) return;
  const patch = { updated_at: new Date().toISOString() };

  if (section === 'inputs') {
    patch.inputs     = Object.assign({}, inputs);
    patch.address    = inputs.property_address || null;
    patch.city       = inputs.city  || null;
    patch.state      = inputs.state || null;
    patch.zip        = inputs.zip   || null;
    patch.asset_type = inputs.asset_type || null;
  }
  else if (section === 'unit_mix')       { patch.unit_mix = unitMix; }
  else if (section === 'comps')          { patch.comps    = comps; }
  else if (section === 'market_analysis'){ patch.market_analysis = marketAnalysis; }
  else if (section === 'overrides')      { patch.overrides = overrides; }
  else if (section === 'risks')          { patch.risks = riskRegister; }
  else if (section === 'header')         { patch.name = currentDeal.name; }
  else { console.warn('[Foundry] unknown autosave section:', section); return; }

  try {
    const { error } = await sb
      .from('foundry_deals')
      .update(patch)
      .eq('id', currentDeal.id);
    if (error) throw error;

    Object.assign(currentDeal, patch);
    const localIdx = deals.findIndex(x => x.id === currentDeal.id);
    if (localIdx >= 0) {
      Object.assign(deals[localIdx], patch);
      deals.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      renderDealList();
    }

    flashSaveStatus('Saved', 'var(--ok)');
  } catch (e) {
    console.error('[Foundry] save FAILED:', section, e);
    flashSaveStatus('Save failed', 'var(--bad)');
  }
}

function flashSaveStatus(msg, color) {
  const ind = $('tb-save-ind');
  if (!ind) return;
  ind.textContent = '· ' + msg;
  ind.style.color = color || '';
  setTimeout(() => {
    if (ind.textContent === '· ' + msg) ind.textContent = '';
  }, 1500);
}

async function manualSave() {
  if (!currentDeal) {
    flashSaveStatus('No deal loaded', 'var(--text3)');
    return;
  }
  // Commit every section right now (skip the debounce)
  _clearAllAutosaveTimers();
  await commitSection('inputs');
  await commitSection('unit_mix');
  await commitSection('comps');
  await commitSection('overrides');
}


// ── INPUT CHANGE HANDLER ──────────────────────────────────────
function onInputChange(field, value) {
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
    if (value === '' || value == null) inputs[field] = null;
    else {
      const n = Number(value);
      inputs[field] = isFinite(n) ? n : null;
    }
  } else if (field === 'treat_mob_as_equity') {
    inputs[field] = !!value;
  } else {
    inputs[field] = value;
  }
  autosave('inputs');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}


// ── NAVIGATION ────────────────────────────────────────────────
function navTo(section, btn) {
  ['dashboard','setup','unitmix','comps','operating','capital','market','risk','reports','company'].forEach(s => {
    const el = $('section-' + s);
    if (el) el.style.display = 'none';
  });
  const el = $('section-' + section);
  if (el) el.style.display = 'block';
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Re-render the section that just became visible (so freshly loaded
  // deals see their data without an extra click)
  if (section === 'setup'    && typeof renderDealSetupForm === 'function') renderDealSetupForm();
  if (section === 'unitmix'  && typeof renderUnitMixBlock === 'function') renderUnitMixBlock();
  if (section === 'comps'    && typeof renderCompsBlock === 'function') renderCompsBlock();
  if (section === 'operating'&& typeof renderOperatingBlock === 'function') renderOperatingBlock();
  if (section === 'capital'  && typeof renderCapitalBlock === 'function') renderCapitalBlock();
  if (section === 'market'   && typeof renderMarketPage === 'function') renderMarketPage();
  if (section === 'risk'     && typeof renderRiskPage === 'function') renderRiskPage();
  if (section === 'company'  && typeof renderCompanyPicker === 'function') renderCompanyPicker();
  closeSidebar();
}

function toggleSidebar() {
  const sbEl = $('sidebar'), ov = $('sidebar-overlay');
  if (!sbEl) return;
  const isOpen = sbEl.classList.contains('open');
  if (isOpen) { sbEl.classList.remove('open'); if (ov) ov.classList.remove('open'); }
  else { sbEl.classList.add('open'); if (ov) ov.classList.add('open'); }
}

function closeSidebar() {
  const sbEl = $('sidebar'), ov = $('sidebar-overlay');
  if (sbEl) sbEl.classList.remove('open');
  if (ov)   ov.classList.remove('open');
}


// ── recompute() is defined in engine.js ───────────────────────


// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
