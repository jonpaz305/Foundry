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

// Company profiles. CP.list = all loaded profiles. CP.active = the
// profile currently used for reports (persisted to localStorage).
// CP.editing = the profile loaded in the Company Profiles editor
// (may differ from CP.active while user is editing a different profile).
// CP.dirty = unsaved edits in the editor.
let CP = { list: [], active: null, editing: null, dirty: false };

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
    asking_price:            null,  // M1: optional negotiation diagnostic
    capex_budget:            0,
    gc_contingency:          0,
    treat_mob_as_equity:     false,
    consulting_fees_override: null,
    consulting_fees_user_locked: false,  // A-smart: false = auto-recompute from 3% of (purchase+capex); true = user has overridden, freeze the value

    // BRRRR ARV source selector (Path C).
    //   'income_approach' (default): stabilized_arv = NOI / exit_cap. Engine behavior pre-Path-C.
    //   'comp_derived':   stabilized_arv = comp_avg_psf × subject_area_sf (uses existing comp_derived_arv math).
    //   'manual_override': stabilized_arv = arv_override_brrrr (sponsor judgment).
    // The displayed cap rate becomes implied (NOI / ARV) when source is comp_derived or manual_override.
    // arv_override_brrrr is BRRRR-only; F&F already has its own arv_override field (kept separate).
    arv_source:              'income_approach',
    arv_override_brrrr:      null,
    closing_cost_baseline:   2444,
    // M0.3: closing cost decomposition. The legacy single
    // closing_cost_loan_pct (0.045) was an aggregate of origination
    // (2.5%) + lender points (2.0%). Split into separately editable
    // components, plus new flat-dollar items: insurance, appraisal,
    // and a residual lender flat fees bucket.
    origination_pct:         0.025,
    lender_points_pct:       0.020,
    broker_points_pct:       0,
    lender_flat_fees:        0,
    closing_cost_insurance:  0,
    closing_cost_appraisal:  0,
    initial_loan_ltv:        0.93,
    initial_loan_ltc_capex:  1.00,
    initial_rate:            0.127,
    initial_interest_type:   'IO',

    // M0.2 (kept): Capex execution window drives the month-by-month
    // construction draw accrual carry model. Default 6 months when
    // not set.
    capex_duration_months:   null,
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
    // M6: if URL is a print route, take over the page before booting the app.
    if (typeof isPrintHash === 'function' && isPrintHash()) {
      await startPrintMode();
      return;
    }
    await initApp();
  } else {
    // Not signed in. If a print route was requested, surface a clear message
    // instead of silently dropping the user on the sign-in screen (which
    // would discard the hash on auth flow).
    if (typeof isPrintHash === 'function' && isPrintHash()) {
      document.body.innerHTML = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:6in;margin:2in auto;padding:1in;border:1px solid #ddd"><div style="font-size:14pt;font-weight:700;margin-bottom:12pt;color:#a00">Sign in required</div><div style="font-size:10pt;color:#666;line-height:1.6">Open the main app in another tab and sign in, then refresh this tab.</div></div>';
      return;
    }
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
// M1: Full CRUD for foundry_companies. Schema:
//   id (uuid), user_id (uuid), name, subtitle, logo_base64 (text),
//   primary_color (text), contact_info (jsonb), created_at, updated_at
//
// CP.active is the currently-selected profile (used by reports for
// header logo, company name, and contact info). CP.editing is the
// profile currently loaded in the editor (may differ from CP.active
// when user clicks a non-active profile in the picker). CP.dirty
// tracks unsaved edits in the editor.
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
  applyTopbarLogo();
}

// Update the top-bar logo image to the active company's logo, falling
// back to the Foundry default wordmark when no company is active or
// the active company has no logo uploaded.
function applyTopbarLogo() {
  const el = $('tb-logo-img');
  if (!el) return;
  const companyLogo = CP.active && CP.active.logo_base64;
  if (companyLogo) {
    el.src = companyLogo;
    el.alt = CP.active.name || 'Company';
  } else if (typeof FOUNDRY_LOGO_DARK !== 'undefined') {
    el.src = FOUNDRY_LOGO_DARK;
    el.alt = 'Foundry';
  }
}

// User clicked a profile in the picker. Set it active, persist to
// localStorage, refresh the picker visual state, and load the profile
// into the editor.
function setActiveCompany(id) {
  const found = CP.list.find(c => c.id === id);
  if (!found) return;
  CP.active = found;
  localStorage.setItem('foundry_active_company', id);
  applyTopbarLogo();
  renderCompanyPicker();
  loadProfileIntoEditor(id);
}

// User clicked "+ New profile". Open the editor with a blank form.
// Profile is NOT created in the DB until the user clicks Save (so
// abandoned-new-profile flows leave no DB rows).
function newCompanyProfile() {
  CP.editing = {
    id: null,
    name: '',
    subtitle: '',
    primary_color: '#C9A84C',
    logo_base64: null,
    contact_info: {}
  };
  CP.dirty = false;
  showEditor();
  populateEditorFields();
  markCompanyDirty(false);
}

// User clicked a profile in the picker. Load it into the editor.
function loadProfileIntoEditor(id) {
  const found = CP.list.find(c => c.id === id);
  if (!found) return;
  CP.editing = JSON.parse(JSON.stringify(found));  // deep clone so edits don't mutate the picker until save
  CP.dirty = false;
  showEditor();
  populateEditorFields();
  markCompanyDirty(false);
}

function showEditor() {
  const editor = $('cp-editor');
  const empty = $('cp-editor-empty');
  if (editor) editor.style.display = 'block';
  if (empty) empty.style.display = 'none';
}

function hideEditor() {
  const editor = $('cp-editor');
  const empty = $('cp-editor-empty');
  if (editor) editor.style.display = 'none';
  if (empty) empty.style.display = 'block';
}

// Pull values from CP.editing and push them into the editor form fields.
function populateEditorFields() {
  if (!CP.editing) return;
  const c = CP.editing;
  const ci = c.contact_info || {};
  const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
  set('cp-name', c.name);
  set('cp-subtitle', c.subtitle);
  set('cp-primary-color', c.primary_color || '#C9A84C');
  set('cp-email', ci.email);
  set('cp-phone', ci.phone);
  set('cp-website', ci.website);
  set('cp-address', ci.address);
  // Logo preview
  const preview = $('cp-logo-preview');
  const placeholder = $('cp-logo-placeholder');
  const removeBtn = $('cp-logo-remove-btn');
  if (c.logo_base64) {
    if (preview) { preview.src = c.logo_base64; preview.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  // Delete button only visible for existing profiles (those with an id)
  const deleteBtn = $('cp-delete-btn');
  if (deleteBtn) deleteBtn.style.display = c.id ? 'inline-block' : 'none';
}

// Read values from the editor form fields back into CP.editing.
function collectEditorFields() {
  if (!CP.editing) return;
  const gv = id => { const el = $(id); return el ? el.value : ''; };
  CP.editing.name = gv('cp-name').trim();
  CP.editing.subtitle = gv('cp-subtitle').trim();
  CP.editing.primary_color = gv('cp-primary-color') || '#C9A84C';
  CP.editing.contact_info = {
    email: gv('cp-email').trim(),
    phone: gv('cp-phone').trim(),
    website: gv('cp-website').trim(),
    address: gv('cp-address').trim()
  };
  // logo_base64 is set directly by handleCompanyLogoUpload, not from a form field
}

// Mark editor state as dirty so the unsaved-changes indicator shows.
// Called by oninput handlers on every editable field.
function markCompanyDirty(dirty) {
  if (dirty === false) {
    CP.dirty = false;
  } else {
    CP.dirty = true;
  }
  const ind = $('cp-dirty-ind');
  if (ind) ind.style.display = CP.dirty ? 'inline' : 'none';
}

// Logo upload: file → base64 → preview + stage in CP.editing.
// Persisted to DB on next Save.
async function handleCompanyLogoUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('Logo file is larger than 2 MB. Please use a smaller image.');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const b64 = e.target.result;
    if (!CP.editing) CP.editing = { id: null, contact_info: {} };
    CP.editing.logo_base64 = b64;
    const preview = $('cp-logo-preview');
    const placeholder = $('cp-logo-placeholder');
    const removeBtn = $('cp-logo-remove-btn');
    if (preview) { preview.src = b64; preview.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'inline-block';
    markCompanyDirty();
  };
  reader.readAsDataURL(file);
  input.value = '';  // reset so user can re-upload the same file if they want
}

// User clicked Remove logo. Clears the logo in the editor; persisted on Save.
function removeCompanyLogo() {
  if (!CP.editing) return;
  CP.editing.logo_base64 = null;
  const preview = $('cp-logo-preview');
  const placeholder = $('cp-logo-placeholder');
  const removeBtn = $('cp-logo-remove-btn');
  if (preview) preview.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
  if (removeBtn) removeBtn.style.display = 'none';
  markCompanyDirty();
}

// Save the editor state to foundry_companies. Inserts new row if
// CP.editing.id is null, otherwise updates existing row.
async function saveCompanyPanelData() {
  if (!CP.editing) return;
  collectEditorFields();
  if (!CP.editing.name) {
    alert('Company name is required.');
    return;
  }
  try {
    let saved;
    if (CP.editing.id) {
      // Update existing
      const { data, error } = await sb
        .from('foundry_companies')
        .update({
          name: CP.editing.name,
          subtitle: CP.editing.subtitle,
          primary_color: CP.editing.primary_color,
          logo_base64: CP.editing.logo_base64,
          contact_info: CP.editing.contact_info,
          updated_at: new Date().toISOString()
        })
        .eq('id', CP.editing.id)
        .select().single();
      if (error) throw error;
      saved = data;
      // Update the list entry
      const idx = CP.list.findIndex(c => c.id === saved.id);
      if (idx >= 0) CP.list[idx] = saved;
    } else {
      // Insert new
      const { data, error } = await sb
        .from('foundry_companies')
        .insert({
          user_id: currentUser.id,
          name: CP.editing.name,
          subtitle: CP.editing.subtitle,
          primary_color: CP.editing.primary_color,
          logo_base64: CP.editing.logo_base64,
          contact_info: CP.editing.contact_info
        })
        .select().single();
      if (error) throw error;
      saved = data;
      CP.list.push(saved);
    }
    CP.editing = JSON.parse(JSON.stringify(saved));
    // If this is the active profile (or no active profile yet), update CP.active
    if (!CP.active || CP.active.id === saved.id) {
      CP.active = saved;
      localStorage.setItem('foundry_active_company', saved.id);
      applyTopbarLogo();
    }
    markCompanyDirty(false);
    populateEditorFields();
    renderCompanyPicker();
    flashSaveIndicator('Profile saved');
  } catch (e) {
    alert('Could not save profile: ' + (e.message || 'unknown error'));
  }
}

// Show a brief "saved" toast (reuses tb-save-ind element if present).
function flashSaveIndicator(msg) {
  const el = $('tb-save-ind');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'inline-block';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 400);
  }, 1800);
}

// Delete flow: confirm modal first, then actually delete on confirm.
function confirmDeleteCompany() {
  if (!CP.editing || !CP.editing.id) return;
  const nameEl = $('dcm-name');
  if (nameEl) nameEl.textContent = CP.editing.name || 'this profile';
  openModal('delete-company-modal');
}

async function deleteCompanyConfirmed() {
  if (!CP.editing || !CP.editing.id) { closeModal('delete-company-modal'); return; }
  const idToDelete = CP.editing.id;
  try {
    const { error } = await sb
      .from('foundry_companies')
      .delete()
      .eq('id', idToDelete);
    if (error) throw error;
    CP.list = CP.list.filter(c => c.id !== idToDelete);
    // If the deleted profile was active, pick a fallback
    if (CP.active && CP.active.id === idToDelete) {
      CP.active = CP.list.length ? CP.list[0] : null;
      if (CP.active) {
        localStorage.setItem('foundry_active_company', CP.active.id);
      } else {
        localStorage.removeItem('foundry_active_company');
      }
      applyTopbarLogo();
    }
    CP.editing = null;
    hideEditor();
    renderCompanyPicker();
    closeModal('delete-company-modal');
    flashSaveIndicator('Profile deleted');
  } catch (e) {
    closeModal('delete-company-modal');
    alert('Could not delete profile: ' + (e.message || 'unknown error'));
  }
}

// Legacy entry point preserved for backward compat (any HTML that still
// references createCompanyProfile gets routed to the new editor flow).
function createCompanyProfile() {
  newCompanyProfile();
}

// User changed the Active company profile select on Setup form. Updates
// the currentDeal.company_id, swaps CP.active to the new selection, and
// triggers autosave to write the assignment to foundry_deals.
function onDealCompanyChange(newId) {
  if (!currentDeal) return;
  currentDeal.company_id = newId || null;
  if (newId) {
    const found = CP.list.find(c => c.id === newId);
    if (found) {
      CP.active = found;
      localStorage.setItem('foundry_active_company', newId);
    }
  } else {
    // User chose "No company" -- clear active so reports use default branding
    CP.active = null;
    localStorage.removeItem('foundry_active_company');
  }
  applyTopbarLogo();
  autosave('company');
  // Re-render anything that displays the active company
  if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
  if (typeof updateDashboard === 'function') updateDashboard();
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

  // M1: Restore the deal's company assignment. Each deal has a
  // company_id pointing at the foundry_companies row that should be
  // active while this deal is loaded. If the deal's company exists in
  // the loaded list, switch to it; if not (deleted profile, or deal
  // created without a profile), keep current CP.active.
  if (d.company_id) {
    const dealCompany = CP.list.find(c => c.id === d.company_id);
    if (dealCompany) {
      CP.active = dealCompany;
      localStorage.setItem('foundry_active_company', dealCompany.id);
      applyTopbarLogo();
    }
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
  // Pass 4: load snapshots for this deal so the Snapshots page is
  // immediately populated when the user navigates to it.
  loadSnapshotsForCurrentDeal();
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
  // ── M0.1 backward-compat: migrate legacy field names ──
  // Old deals saved before the M0.1 rename used reno_budget,
  // initial_loan_ltc_reno, and mobilization_contingency. If those keys
  // are present on the loaded inputs, copy their values to the new
  // field names (overwriting the default 0), then delete the old keys
  // so they're dropped on the next save. Presence-based, not null-based:
  // capex_budget defaults to 0 from makeDefaultInputs, so a null check
  // would incorrectly skip migration.
  if ('reno_budget' in inputs) {
    inputs.capex_budget = inputs.reno_budget;
    delete inputs.reno_budget;
  }
  if ('initial_loan_ltc_reno' in inputs) {
    inputs.initial_loan_ltc_capex = inputs.initial_loan_ltc_reno;
    delete inputs.initial_loan_ltc_reno;
  }
  if ('mobilization_contingency' in inputs) {
    inputs.gc_contingency = inputs.mobilization_contingency;
    delete inputs.mobilization_contingency;
  }

  // ── M0.3 backward-compat: legacy field migrations ──
  // 1. closing_cost_loan_pct was a single rolled-up bundle of
  //    origination + lender points. Split it: by default the historical
  //    0.045 maps to origination 2.5 + lender points 2.0. Only migrate
  //    when the new fields are absent (defensive against double-load).
  if ('closing_cost_loan_pct' in inputs) {
    if (inputs.origination_pct == null) inputs.origination_pct = 0.025;
    if (inputs.lender_points_pct == null) inputs.lender_points_pct = 0.020;
    if (inputs.broker_points_pct == null) inputs.broker_points_pct = 0;
    delete inputs.closing_cost_loan_pct;
  }
  // 2. M0.2's sponsor_mobilization_override is collapsed into gc_contingency.
  //    If a deal was saved with the override and no gc_contingency value,
  //    promote the override to gc_contingency. Either way, drop the legacy key.
  if ('sponsor_mobilization_override' in inputs) {
    if ((inputs.gc_contingency == null || inputs.gc_contingency === 0)
        && inputs.sponsor_mobilization_override != null
        && inputs.sponsor_mobilization_override !== '') {
      inputs.gc_contingency = Number(inputs.sponsor_mobilization_override);
    }
    delete inputs.sponsor_mobilization_override;
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
  else if (section === 'company')        { patch.company_id = currentDeal.company_id; }
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
    'arv_override','arv_override_brrrr','purchase_price','asking_price','capex_budget','gc_contingency',
    'consulting_fees_override','closing_cost_baseline',
    'origination_pct','lender_points_pct','broker_points_pct',
    'lender_flat_fees','closing_cost_insurance','closing_cost_appraisal',
    'initial_loan_ltv','initial_loan_ltc_capex','initial_rate','refi_rate',
    'refi_closing_cost_pct','investor_ownership','lp_gp_split_ff',
    'capex_duration_months'
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

  // A-smart consulting fee: when the user manually edits the consulting
  // field, flip the lock so the engine stops auto-recomputing. Empty/null
  // value resets the lock (back to auto). Suppressed during loadDeal
  // hydration so restoring a saved deal doesn't flip the lock.
  if (field === 'consulting_fees_override' && !_loadingDeal) {
    inputs.consulting_fees_user_locked = (inputs.consulting_fees_override != null);
  }

  // A-smart consulting fee: when purchase_price or capex_budget changes
  // AND the user has not locked the consulting field, update the
  // displayed value in the form so the user sees the live auto value.
  // We DO NOT write to inputs.consulting_fees_override - it stays null
  // in auto mode, and the engine's fallback formula (in computeBRRRR
  // and computeFF) does the actual math. This avoids accidentally
  // "freezing" the auto value into state when the user is still in
  // auto mode. Suppressed during loadDeal hydration.
  if ((field === 'purchase_price' || field === 'capex_budget') && !_loadingDeal && !inputs.consulting_fees_user_locked) {
    const purchase = Number(inputs.purchase_price) || 0;
    const capex = Number(inputs.capex_budget) || 0;
    const auto = Math.max(10000, 0.03 * (purchase + capex));
    const consEl = document.querySelector('input[oninput*="consulting_fees_override"]');
    if (consEl) consEl.value = Math.round(auto);
    // inputs.consulting_fees_override stays null - engine fallback applies
  }

  autosave('inputs');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
  // M1: Refresh the negotiation hint inline when relevant fields change
  if (field === 'asking_price' || field === 'purchase_price') {
    const hint = $('asking-vs-purchase-hint');
    if (hint && typeof _renderNegotiationHint === 'function') {
      hint.innerHTML = _renderNegotiationHint(inputs.asking_price, inputs.purchase_price);
    }
  }
  // Path C: when ARV source changes, re-render the Capital block so the
  // manual override input appears/disappears and the implied cap rate
  // reference panel updates. Also re-render the Deal Setup block so the
  // Exit Cap field's disabled state stays in sync.
  // (Safe to full re-render here because the trigger is a <select> change,
  // not a text input keystroke - no focus to lose.)
  if (field === 'arv_source') {
    if (typeof renderCapitalBlock === 'function') renderCapitalBlock();
    if (typeof renderDealSetupForm === 'function') renderDealSetupForm();
  }
  // Path C: when the manual ARV value changes mid-typing, update the
  // implied cap rate reference panel inline WITHOUT re-rendering the
  // whole Capital block (which would destroy the input the user is
  // typing into and kill mobile keyboard focus - same pattern as the
  // Unit Mix fix). The reference panel cells are flagged with
  // data-arv-cell attributes for surgical updates.
  if (field === 'arv_override_brrrr' &&
      inputs.arv_source === 'manual_override' &&
      typeof R === 'object' && R) {
    _refreshArvReferencePanel();
  }

  // Operating page dollar-amount hints: when any operating % or
  // reserves field changes, refresh the inline dollar hints without
  // re-rendering the form. Same surgical-update pattern as Unit Mix
  // and the ARV reference panel - protects mobile keyboard focus.
  const operatingHintFields = new Set([
    'vacancy_pct','pm_pct','maint_pct_of_egi','insurance_pct_of_egi',
    'utilities_pct_of_egi','reserves_per_unit_year'
  ]);
  if (operatingHintFields.has(field) && typeof _refreshOperatingHints === 'function') {
    _refreshOperatingHints();
  }

  // Per-door hints on Capital acquisition fields: refresh inline as
  // the user types so /door updates live without losing keyboard focus.
  if ((field === 'asking_price' || field === 'purchase_price' || field === 'capex_budget')
      && typeof _refreshPerDoorHints === 'function') {
    _refreshPerDoorHints();
  }
}

// Helper for Path C: refresh the ARV reference panel cells in-place
// without re-rendering the form. Called by onInputChange when the
// manual ARV value changes mid-typing.
function _refreshArvReferencePanel() {
  const f$ = (x) => x == null || !isFinite(x) ? '-' : '$' + Math.round(Number(x)).toLocaleString();
  const fPct = (x, d) => x == null || !isFinite(x) ? '-' : (Number(x) * 100).toFixed(d == null ? 2 : d) + '%';
  const arvUse = document.querySelector('[data-arv-cell="arv-in-use"]');
  if (arvUse && R) arvUse.textContent = f$(R.stabilized_arv);
  const implied = document.querySelector('[data-arv-cell="implied-cap"]');
  if (implied && R) implied.textContent = fPct(R.implied_cap_rate, 2);
}


// ── NAVIGATION ────────────────────────────────────────────────
function navTo(section, btn) {
  ['dashboard','setup','unitmix','comps','operating','capital','market','risk','reports','snapshots','company'].forEach(s => {
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
  if (section === 'reports'  && typeof renderReportsPage === 'function') renderReportsPage();
  if (section === 'snapshots'&& typeof renderSnapshotsPage === 'function') renderSnapshotsPage();
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


// ════════════════════════════════════════════════════════════════
// PATH A PASS 4 - REPORT SNAPSHOTS
// ════════════════════════════════════════════════════════════════
// A snapshot captures (a) the rendered HTML of a report, (b) the
// underlying data state at lock time (inputs, unit_mix, comps,
// market_analysis, overrides, R), and (c) the engine version stamp.
// Snapshots are immutable once created. They are NOT generated on
// every export - only when the user explicitly clicks "Lock Snapshot"
// on a generated report. The locked record becomes the audit-trail
// answer to "what version did the LP receive on date X?"
// ════════════════════════════════════════════════════════════════

// State: list of snapshots for the currently-loaded deal, and the
// report being staged for a Lock action (set when user clicks Lock,
// cleared when modal closes).
let SNAPSHOTS = { list: [], staging: null };

// Map of report type slug to friendly label and the renderer function
// to call. Slugs match the kebab-case slugs used in shell-ui.js's
// report catalog so the Lock buttons can be wired consistently.
const SNAPSHOT_REPORT_TYPES = {
  'brrrr-package':    { label: 'BRRRR Package',          render: 'renderReport_brrrr_package' },
  'ff-package':       { label: 'Fix and Flip Package',   render: 'renderReport_ff_package' },
  'lender-package':   { label: 'Lender Package',         render: 'renderReport_lender_package' },
  'hud-vash-package': { label: 'Valor PBV Package',      render: 'renderReport_valor_pbv' },
  'internal-memo':    { label: 'Internal Memo',          render: 'renderReport_internal_memo' },
  'deal-snapshot':    { label: 'Deal Snapshot',          render: 'renderReport_deal_snapshot' }
};

// Helpers passed to renderer functions. Mirrors the standard helpers
// object used by the Reports section in shell-ui.
function _snapshotHelpers() {
  return {
    fmtMoney:  (x, dec) => x == null || !isFinite(x) ? '-' : '$' + Number(x).toLocaleString(undefined, { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }),
    fmtMoneyK: (x) => x == null || !isFinite(x) ? '-' : (Math.abs(x) >= 1e6 ? '$' + (x/1e6).toFixed(2) + 'M' : (Math.abs(x) >= 1e3 ? '$' + (x/1e3).toFixed(0) + 'K' : '$' + Math.round(x))),
    fmtPct:    (x, dec) => x == null || !isFinite(x) ? '-' : (x*100).toFixed(dec == null ? 1 : dec) + '%',
    fmtX:      (x, dec) => x == null || !isFinite(x) ? '-' : Number(x).toFixed(dec == null ? 2 : dec) + 'x',
    fmtInt:    (x) => x == null || !isFinite(x) ? '-' : Math.round(x).toLocaleString(),
    todayLong: () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    foundryLogo: () => (typeof FOUNDRY_LOGO_DARK !== 'undefined') ? FOUNDRY_LOGO_DARK : ''
  };
}

// User clicked "Lock Snapshot" on a report. Stage the report type
// and open the confirmation modal so they can add an optional note.
function lockSnapshot(reportType) {
  if (!currentDeal) {
    alert('Open a deal first.');
    return;
  }
  const config = SNAPSHOT_REPORT_TYPES[reportType];
  if (!config) {
    alert('Unknown report type: ' + reportType);
    return;
  }
  if (typeof window[config.render] !== 'function') {
    alert('Renderer not available: ' + config.render);
    return;
  }
  SNAPSHOTS.staging = { reportType: reportType, label: config.label };
  const labelEl = $('lock-snapshot-label');
  if (labelEl) labelEl.textContent = config.label;
  const noteEl = $('lock-snapshot-note');
  if (noteEl) noteEl.value = '';
  openModal('lock-snapshot-modal');
}

// User confirmed the Lock action. Render the report, capture data
// state, write the snapshot row to Supabase, refresh the list.
async function lockSnapshotConfirmed() {
  if (!SNAPSHOTS.staging || !currentDeal) {
    closeModal('lock-snapshot-modal');
    return;
  }
  const { reportType, label } = SNAPSHOTS.staging;
  const config = SNAPSHOT_REPORT_TYPES[reportType];
  const noteEl = $('lock-snapshot-note');
  const note = noteEl ? noteEl.value.trim() : '';

  try {
    // Render the report against current state
    const renderer = window[config.render];
    const helpers = _snapshotHelpers();
    const html = renderer(currentDeal, R, inputs, marketAnalysis, helpers);

    // Capture all underlying data
    const payload = {
      user_id:        currentUser.id,
      deal_id:        currentDeal.id,
      deal_name:      currentDeal.name,
      report_type:    reportType,
      engine_version: (typeof FOUNDRY_ENGINE_VERSION === 'string') ? FOUNDRY_ENGINE_VERSION : 'unversioned',
      snapshot_inputs:          JSON.parse(JSON.stringify(inputs)),
      snapshot_unit_mix:        JSON.parse(JSON.stringify(unitMix)),
      snapshot_comps:           JSON.parse(JSON.stringify(comps)),
      snapshot_market_analysis: JSON.parse(JSON.stringify(marketAnalysis)),
      snapshot_overrides:       JSON.parse(JSON.stringify(overrides)),
      snapshot_R:               JSON.parse(JSON.stringify(R)),
      snapshot_html:            html,
      note:                     note || null
    };

    const { data, error } = await sb
      .from('foundry_report_snapshots')
      .insert(payload)
      .select().single();
    if (error) throw error;

    SNAPSHOTS.list.unshift(data);
    SNAPSHOTS.staging = null;
    closeModal('lock-snapshot-modal');
    flashSaveIndicator('Snapshot locked');
    // If the Snapshots page is currently visible, refresh it
    if (typeof renderSnapshotsPage === 'function') renderSnapshotsPage();
  } catch (e) {
    closeModal('lock-snapshot-modal');
    alert('Could not lock snapshot: ' + (e.message || 'unknown error'));
  }
}

// Load all snapshots for the current deal. Called when user navigates
// to the Snapshots page, and after loadDeal.
async function loadSnapshotsForCurrentDeal() {
  if (!currentDeal || !currentUser) {
    SNAPSHOTS.list = [];
    return;
  }
  try {
    const { data, error } = await sb
      .from('foundry_report_snapshots')
      .select('*')
      .eq('deal_id', currentDeal.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    SNAPSHOTS.list = data || [];
  } catch (e) {
    console.error('[Foundry] load snapshots:', e);
    SNAPSHOTS.list = [];
  }
}

// User clicked View on a snapshot. Open the rendered HTML in a new
// window with a banner above the content identifying it as historical.
function viewSnapshot(snapshotId) {
  const snap = SNAPSHOTS.list.find(s => s.id === snapshotId);
  if (!snap) return;
  const created = snap.created_at ? new Date(snap.created_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : 'unknown date';
  const banner = `
    <div style="background:#fff8e1;border:1px solid #C9A84C;border-radius:4px;padding:14px 18px;margin:16px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.55;color:#3a2f0b">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">Historical snapshot</div>
      <div>This is a locked snapshot from <strong>${escapeHtml(created)}</strong>, rendered against engine version <strong>${escapeHtml(snap.engine_version || 'unversioned')}</strong>. Inputs and outputs may differ from the current state of this deal.</div>
      ${snap.note ? `<div style="margin-top:8px;font-style:italic;color:#5a4a1b">Note at lock time: ${escapeHtml(snap.note)}</div>` : ''}
    </div>
  `;
  // Open in a new window. Include print.css so the rendered report
  // looks correct (same as live print preview).
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups for this site to view snapshots.');
    return;
  }
  win.document.write(`<!doctype html><html><head><title>Snapshot: ${escapeHtml(snap.deal_name || 'deal')} - ${escapeHtml(snap.report_type)}</title>
    <link rel="stylesheet" href="${window.location.origin}/print.css"/>
    <link rel="stylesheet" href="${window.location.origin}/styles.css"/>
    </head><body>${banner}${snap.snapshot_html || '<div style="padding:20px;color:#888">No HTML stored for this snapshot.</div>'}</body></html>`);
  win.document.close();
}

// User clicked Delete on a snapshot. Confirm and delete.
function confirmDeleteSnapshot(snapshotId) {
  const snap = SNAPSHOTS.list.find(s => s.id === snapshotId);
  if (!snap) return;
  SNAPSHOTS.staging = { deleteId: snapshotId, label: SNAPSHOT_REPORT_TYPES[snap.report_type] ? SNAPSHOT_REPORT_TYPES[snap.report_type].label : snap.report_type };
  const labelEl = $('delete-snapshot-label');
  if (labelEl) labelEl.textContent = SNAPSHOTS.staging.label;
  const dateEl = $('delete-snapshot-date');
  if (dateEl) dateEl.textContent = snap.created_at ? new Date(snap.created_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : '';
  openModal('delete-snapshot-modal');
}

async function deleteSnapshotConfirmed() {
  if (!SNAPSHOTS.staging || !SNAPSHOTS.staging.deleteId) {
    closeModal('delete-snapshot-modal');
    return;
  }
  const id = SNAPSHOTS.staging.deleteId;
  try {
    const { error } = await sb
      .from('foundry_report_snapshots')
      .delete()
      .eq('id', id);
    if (error) throw error;
    SNAPSHOTS.list = SNAPSHOTS.list.filter(s => s.id !== id);
    SNAPSHOTS.staging = null;
    closeModal('delete-snapshot-modal');
    flashSaveIndicator('Snapshot deleted');
    if (typeof renderSnapshotsPage === 'function') renderSnapshotsPage();
  } catch (e) {
    closeModal('delete-snapshot-modal');
    alert('Could not delete snapshot: ' + (e.message || 'unknown error'));
  }
}


// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
