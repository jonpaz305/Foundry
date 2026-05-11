// ════════════════════════════════════════════════════════════════
// FOUNDRY — Shell UI (sidebar deal list, dashboard, company picker)
// ════════════════════════════════════════════════════════════════
//
// Mirrors Tranche's shell-ui.js pattern. Mode-aware: BRRRR deals
// show post-refi DSCR, IRR, equity multiple, etc.; F&F deals show
// ROI, gross proceeds, value creation. The engine isn't wired in
// M1 so KPI tiles render as "—" placeholders.


// ── DEAL LIST IN SIDEBAR ─────────────────────────────────────────
function renderDealList() {
  const wrap = $('deal-list');
  if (!wrap) return;

  if (!deals.length) {
    wrap.innerHTML = `
      <div style="padding:14px 12px;font-size:11px;color:var(--text3);text-align:center;line-height:1.6">
        No deals yet.<br>
        <span style="color:var(--gold-lt);cursor:pointer" onclick="openNewDeal()">+ Create your first deal</span>
      </div>`;
    return;
  }

  wrap.innerHTML = deals.map(d => {
    const isActive = currentDeal && currentDeal.id === d.id;
    const modeBadge = d.deal_mode === 'fix_and_flip'
      ? '<span class="deal-mode-badge mode-ff">F&amp;F</span>'
      : '<span class="deal-mode-badge mode-brrrr">BRRRR</span>';
    const meta = [
      d.city,
      d.state,
      d.deal_mode === 'brrrr' && d.inputs && d.inputs.purchase_price
        ? '$' + Math.round(d.inputs.purchase_price / 1000) + 'k'
        : null
    ].filter(Boolean).join(' · ');

    return `
      <div class="deal-item${isActive ? ' active' : ''}" onclick="loadDeal('${d.id}')">
        <div class="di-row">
          <div class="di-name">${escapeHtml(d.name || 'Untitled')}</div>
          ${modeBadge}
        </div>
        ${meta ? `<div class="di-meta">${escapeHtml(meta)}</div>` : ''}
      </div>`;
  }).join('');
}


// ── DASHBOARD ────────────────────────────────────────────────────
function renderDashboard() {
  const noDeal = $('no-deal-state');
  const dash   = $('dashboard-content');

  if (!currentDeal) {
    if (noDeal) noDeal.style.display = 'block';
    if (dash)   dash.style.display = 'none';
    return;
  }

  if (noDeal) noDeal.style.display = 'none';
  if (dash)   dash.style.display = 'block';

  const d = currentDeal;
  const mode = getDealMode();

  // Header
  const titleEl = $('dash-deal-title');
  const subEl   = $('dash-deal-sub');
  const modeEl  = $('dash-deal-mode');

  if (titleEl) titleEl.textContent = d.name || 'Untitled Deal';
  if (modeEl) {
    modeEl.textContent = mode === 'brrrr' ? 'BRRRR' : 'Fix & Flip';
    modeEl.className = 'dash-mode-tag ' + (mode === 'brrrr' ? 'mode-brrrr' : 'mode-ff');
  }
  const sub = [
    d.address,
    [d.city, d.state, d.zip].filter(Boolean).join(', '),
    formatAssetType(inputs.asset_type)
  ].filter(Boolean).join('  ·  ');
  if (subEl) subEl.textContent = sub || 'Set up deal details to begin underwriting';

  // KPI tiles
  const k = $('dash-kpis');
  if (k) {
    if (mode === 'brrrr') {
      k.innerHTML = renderBRRRRKpis();
    } else {
      k.innerHTML = renderFFKpis();
    }
  }

  // Status banners
  const status = $('dash-status');
  if (status) {
    status.innerHTML = renderStatusBanners(mode);
  }
}

// BRRRR KPI block — empty placeholders until M2 wires the engine.
function renderBRRRRKpis() {
  const tpc          = R.total_project_cost;
  const arv          = R.stabilized_arv;
  const vc           = R.value_creation;
  const vcPct        = R.value_creation_pct;
  const equityIn     = R.initial_investor_equity;
  const dscr         = R.dscr;
  const irr          = R.investor_irr;
  const em           = R.equity_multiple;

  const irrColor = irr == null || !isFinite(irr) ? 'var(--text3)'
                 : irr >= 0.15 ? 'var(--ok)'
                 : irr >= 0.08 ? 'var(--gold-lt)'
                 : 'var(--bad)';

  const dscrColor = dscr == null || !isFinite(dscr) ? 'var(--text3)'
                  : dscr >= 1.25 ? 'var(--ok)'
                  : dscr >= 1.15 ? 'var(--gold-lt)'
                  : 'var(--bad)';

  return `
    <div class="kpi-card kpi-card-gold">
      <div class="kpi-label">Value Creation</div>
      <div class="kpi-val">${vc != null ? f$(vc) : '—'}</div>
      <div class="kpi-sub">${vcPct != null ? fP(vcPct) + ' of total cost' : 'Pending stabilized ARV'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Stabilized ARV</div>
      <div class="kpi-val">${arv != null ? f$(arv) : '—'}</div>
      <div class="kpi-sub">${tpc != null ? 'Total cost: ' + f$(tpc) : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Investor IRR (Yr ${inputs.target_hold_years || 10})</div>
      <div class="kpi-val" style="color:${irrColor}">${irr != null && isFinite(irr) ? fP(irr) : '—'}</div>
      <div class="kpi-sub">${em != null ? 'EM: ' + fX(em) : 'Pending exit modeling'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Post-Refi DSCR</div>
      <div class="kpi-val" style="color:${dscrColor}">${dscr != null && isFinite(dscr) ? fX(dscr) : '—'}</div>
      <div class="kpi-sub">${equityIn != null ? 'Equity in: ' + f$(equityIn) : '—'}</div>
    </div>`;
}

// Fix and Flip KPI block — empty placeholders until M3 wires the engine.
function renderFFKpis() {
  const tpc         = R.total_project_cost;
  const arv         = R.arv;
  const vc          = R.value_creation;
  const vcPct       = R.value_creation_pct;
  const equityIn    = R.investor_equity;
  const netProceeds = R.net_investor_proceeds;
  const roi         = R.investor_roi;
  const annualized  = R.annualized_return;

  const roiColor = roi == null || !isFinite(roi) ? 'var(--text3)'
                 : roi >= 0.40 ? 'var(--ok)'
                 : roi >= 0.20 ? 'var(--gold-lt)'
                 : 'var(--bad)';

  return `
    <div class="kpi-card kpi-card-gold">
      <div class="kpi-label">Value Creation</div>
      <div class="kpi-val">${vc != null ? f$(vc) : '—'}</div>
      <div class="kpi-sub">${vcPct != null ? fP(vcPct) + ' of total cost' : 'Pending ARV'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ARV</div>
      <div class="kpi-val">${arv != null ? f$(arv) : '—'}</div>
      <div class="kpi-sub">${tpc != null ? 'Total cost: ' + f$(tpc) : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Investor ROI</div>
      <div class="kpi-val" style="color:${roiColor}">${roi != null && isFinite(roi) ? fP(roi) : '—'}</div>
      <div class="kpi-sub">${annualized != null ? 'Annualized: ' + fP(annualized) : 'Pending hold period'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Net Investor Proceeds</div>
      <div class="kpi-val">${netProceeds != null ? f$(netProceeds) : '—'}</div>
      <div class="kpi-sub">${equityIn != null ? 'Equity in: ' + f$(equityIn) : '—'}</div>
    </div>`;
}

function renderStatusBanners(mode) {
  // M1: surface basic data-entry status. M2+ adds engine-driven banners
  // (DSCR warnings, value-creation guardrails, comp scatter, etc.).
  const banners = [];

  if (mode === 'brrrr') {
    if (!unitMix.length) {
      banners.push(`<div class="su-status" style="background:var(--bg2);color:var(--text3);border:1px solid var(--border)">⊝ Unit mix not yet entered</div>`);
    } else {
      const totalUnits = unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0);
      banners.push(`<div class="su-status su-balanced">✓ Unit mix: ${totalUnits} unit${totalUnits === 1 ? '' : 's'} across ${unitMix.length} type${unitMix.length === 1 ? '' : 's'}</div>`);
    }
  } else {
    if (!comps.length) {
      banners.push(`<div class="su-status" style="background:var(--bg2);color:var(--text3);border:1px solid var(--border)">⊝ Comps not yet entered</div>`);
    } else {
      banners.push(`<div class="su-status su-balanced">✓ ${comps.length} comp${comps.length === 1 ? '' : 's'} entered</div>`);
    }
  }

  if (!inputs.purchase_price || inputs.purchase_price === 0) {
    banners.push(`<div class="su-status" style="background:var(--bg2);color:var(--text3);border:1px solid var(--border);margin-top:.5rem">⊝ Purchase price not entered</div>`);
  }

  return banners.join('');
}

function formatAssetType(t) {
  const map = {
    'single_family':          'Single Family',
    'multifamily_2_4':        'Multifamily (2-4)',
    'commercial_multifamily': 'Commercial Multifamily',
    'commercial':             'Commercial'
  };
  return map[t] || t || '';
}


// ── COMPANY PROFILE PICKER (Settings) ───────────────────────────
function renderCompanyPicker() {
  const wrap = $('cp-picker');
  if (!wrap) return;
  if (!CP.list.length) {
    wrap.innerHTML = `<div style="font-size:11px;color:var(--text3)">No company profiles yet. Create one to brand your reports.</div>`;
    return;
  }
  wrap.innerHTML = CP.list.map(c => `
    <div onclick="setActiveCompany('${c.id}')" style="padding:10px 12px;border:1px solid ${CP.active && CP.active.id === c.id ? 'var(--gold-bd)' : 'var(--border)'};border-radius:7px;cursor:pointer;background:${CP.active && CP.active.id === c.id ? 'var(--gold-bg)' : 'transparent'};margin-bottom:6px;display:flex;align-items:center;gap:10px">
      ${c.logo_base64 ? `<img src="${c.logo_base64}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;background:#fff"/>` : '<div style="width:32px;height:32px;background:var(--gold-bg);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--gold-lt);font-family:var(--fm);font-weight:700">' + (c.name || '?')[0] + '</div>'}
      <div style="flex:1">
        <div style="font-size:12px;font-weight:600;color:var(--text)">${escapeHtml(c.name || 'Unnamed')}</div>
        ${c.subtitle ? `<div style="font-size:10px;color:var(--text2);margin-top:2px">${escapeHtml(c.subtitle)}</div>` : ''}
      </div>
      ${CP.active && CP.active.id === c.id ? '<div style="font-size:10px;color:var(--gold-lt);font-family:var(--fm)">ACTIVE</div>' : ''}
    </div>
  `).join('');
}

async function createCompanyProfile() {
  const name = prompt('Company name (e.g. "ASJP Group", "KPI Capital Partners"):');
  if (!name) return;
  try {
    const { data, error } = await sb
      .from('foundry_companies')
      .insert({
        user_id: currentUser.id,
        name: name.trim(),
        subtitle: '',
        logo_base64: null,
        primary_color: '#C9A84C',
        contact_info: {}
      })
      .select()
      .single();
    if (error) throw error;
    CP.list.push(data);
    CP.active = data;
    localStorage.setItem('foundry_active_company', data.id);
    renderCompanyPicker();
  } catch (e) {
    alert('Could not create company: ' + e.message);
  }
}


// ── SECTION SWITCHER ────────────────────────────────────────────
// Top-nav button activates a section (Dashboard, Setup, Unit Mix /
// Comps, Operating, Capital, Market, Risk, Reports). Mode toggle in
// core.js's applyModeToUI() hides sections not applicable to the
// current deal mode.
function showSection(name) {
  document.querySelectorAll('[data-section]').forEach(el => {
    el.style.display = el.getAttribute('data-section') === name ? '' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-target="${name}"]`);
  if (btn) btn.classList.add('active');
  // Re-apply mode-based hiding INSIDE the visible section
  if (typeof applyModeToUI === 'function') applyModeToUI();
}
