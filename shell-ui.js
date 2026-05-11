// ════════════════════════════════════════════════════════════════
// FOUNDRY - Shell UI (deal list, dashboard, company picker)
// ════════════════════════════════════════════════════════════════
// Matches Cadence/Tranche shell-ui exactly: deal-item rows include
// a trash icon at 45% opacity that goes red on hover. Click trash
// opens confirmation modal. Dashboard shows mode-aware KPI tiles.
// ════════════════════════════════════════════════════════════════


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
    const active = currentDeal && currentDeal.id === d.id;
    const modeTag = d.deal_mode === 'fix_and_flip'
      ? '<span class="dm-tag">F&amp;F</span>'
      : '<span class="dm-tag">BRRRR</span>';
    const meta = [d.city, d.state].filter(Boolean).join(', ');
    const safeName = (d.name || 'Untitled').replace(/'/g, String.fromCharCode(39));
    return `
      <div class="deal-item${active ? ' active' : ''}">
        <div class="deal-item-row">
          <div class="deal-item-body" onclick="loadDeal('${d.id}')" style="cursor:pointer">
            <div class="di-name">${escapeHtml(d.name || 'Untitled')} ${modeTag}</div>
            ${meta ? `<div class="di-meta">${escapeHtml(meta)}</div>` : ''}
          </div>
          <button class="deal-item-del" onclick="confirmDeleteDeal('${d.id}','${escapeHtml(safeName)}')" title="Delete deal">🗑</button>
        </div>
      </div>`;
  }).join('');
}


// ── DASHBOARD ─────────────────────────────────────────────────
function updateDashboard() {
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
  if ($('dash-deal-title')) $('dash-deal-title').textContent = d.name || 'Untitled Deal';
  const sub = [
    d.address || inputs.property_address,
    [inputs.city, inputs.state, inputs.zip].filter(Boolean).join(', '),
    formatAssetType(inputs.asset_type),
    mode === 'brrrr' ? 'BRRRR' : 'Fix & Flip'
  ].filter(Boolean).join('  ·  ');
  if ($('dash-deal-sub')) $('dash-deal-sub').textContent = sub || 'Set up deal details to begin underwriting.';

  // KPI tiles
  const k = $('dash-kpis');
  if (k) k.innerHTML = mode === 'brrrr' ? renderBRRRRKpis() : renderFFKpis();

  // Status banner area
  const st = $('dash-status');
  if (st) st.innerHTML = renderStatusBanners(mode);
}

function renderBRRRRKpis() {
  const tpc  = R.total_project_cost;
  const arv  = R.stabilized_arv;
  const vc   = R.value_creation;
  const vcP  = R.value_creation_pct;
  const eq   = R.initial_investor_equity;
  const dscr = R.dscr;
  const irr  = R.investor_irr;
  const em   = R.equity_multiple;

  const irrColor = irr == null || !isFinite(irr) ? 'var(--text3)'
    : irr >= 0.15 ? 'var(--ok)'
    : irr >= 0.08 ? 'var(--gold-lt)'
    : 'var(--bad)';
  const dscrColor = dscr == null || !isFinite(dscr) ? 'var(--text3)'
    : dscr >= 1.25 ? 'var(--ok)'
    : dscr >= 1.15 ? 'var(--gold-lt)'
    : 'var(--bad)';

  return `
    <div class="kpi-card kpi-gold">
      <div class="kpi-label">Value Creation</div>
      <div class="kpi-val">${vc != null ? f$(vc) : '-'}</div>
      <div class="kpi-sub">${vcP != null ? fP(vcP) + ' of total cost' : 'Pending stabilized ARV'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Stabilized ARV</div>
      <div class="kpi-val">${arv != null ? f$(arv) : '-'}</div>
      <div class="kpi-sub">${tpc != null ? 'Total cost: ' + f$(tpc) : 'Pending project cost'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Investor IRR (Yr ${inputs.target_hold_years || 10})</div>
      <div class="kpi-val" style="color:${irrColor}">${irr != null && isFinite(irr) ? fP(irr) : '-'}</div>
      <div class="kpi-sub">${em != null ? 'EM: ' + fX(em) : 'Pending exit modeling'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Post-Refi DSCR</div>
      <div class="kpi-val" style="color:${dscrColor}">${dscr != null && isFinite(dscr) ? fX(dscr) : '-'}</div>
      <div class="kpi-sub">${eq != null ? 'Equity in: ' + f$(eq) : 'Pending equity'}</div>
    </div>`;
}

function renderFFKpis() {
  const tpc = R.total_project_cost;
  const arv = R.arv;
  const vc  = R.value_creation;
  const vcP = R.value_creation_pct;
  const eq  = R.investor_equity;
  const net = R.net_investor_proceeds;
  const roi = R.investor_roi;
  const ann = R.annualized_return;

  const roiColor = roi == null || !isFinite(roi) ? 'var(--text3)'
    : roi >= 0.40 ? 'var(--ok)'
    : roi >= 0.20 ? 'var(--gold-lt)'
    : 'var(--bad)';

  return `
    <div class="kpi-card kpi-gold">
      <div class="kpi-label">Value Creation</div>
      <div class="kpi-val">${vc != null ? f$(vc) : '-'}</div>
      <div class="kpi-sub">${vcP != null ? fP(vcP) + ' of total cost' : 'Pending ARV'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ARV</div>
      <div class="kpi-val">${arv != null ? f$(arv) : '-'}</div>
      <div class="kpi-sub">${tpc != null ? 'Total cost: ' + f$(tpc) : 'Pending project cost'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Investor ROI</div>
      <div class="kpi-val" style="color:${roiColor}">${roi != null && isFinite(roi) ? fP(roi) : '-'}</div>
      <div class="kpi-sub">${ann != null ? 'Annualized: ' + fP(ann) : 'Pending hold period'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Net Investor Proceeds</div>
      <div class="kpi-val">${net != null ? f$(net) : '-'}</div>
      <div class="kpi-sub">${eq != null ? 'Equity in: ' + f$(eq) : 'Pending equity'}</div>
    </div>`;
}

function renderStatusBanners(mode) {
  const out = [];

  if (mode === 'brrrr') {
    if (!unitMix.length) {
      out.push(`<div class="sbar s-muted">Unit mix not yet entered. Go to Unit Mix to begin.</div>`);
    } else {
      const totalUnits = unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0);
      out.push(`<div class="sbar s-ok">Unit mix: ${totalUnits} unit${totalUnits === 1 ? '' : 's'} across ${unitMix.length} type${unitMix.length === 1 ? '' : 's'}</div>`);
    }
  } else {
    if (!comps.length) {
      out.push(`<div class="sbar s-muted">Comps not yet entered. Go to Comps to begin.</div>`);
    } else {
      out.push(`<div class="sbar s-ok">${comps.length} comp${comps.length === 1 ? '' : 's'} entered</div>`);
    }
  }

  if (!inputs.purchase_price || inputs.purchase_price === 0) {
    out.push(`<div class="sbar s-muted" style="margin-top:8px">Purchase price not yet entered. Go to Capital Structure.</div>`);
  }

  return out.join('');
}

function formatAssetType(t) {
  const map = {
    'single_family':          'Single Family',
    'multifamily_2_4':        'Multifamily (2-4)',
    'commercial_multifamily': 'Commercial Multifamily',
    'commercial':             'Commercial'
  };
  return map[t] || '';
}


// ── MODE SELECTOR HANDLER ─────────────────────────────────────
function onModeSelChange() {
  const sel = $('mode-sel');
  if (!sel) return;
  switchDealMode(sel.value);
}


// ── COMPANY PICKER ────────────────────────────────────────────
function renderCompanyPicker() {
  const wrap = $('cp-picker');
  if (!wrap) return;
  if (!CP.list.length) {
    wrap.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:1rem;text-align:center">No company profiles yet. Create one to brand your reports.</div>`;
    return;
  }
  wrap.innerHTML = CP.list.map(c => {
    const active = CP.active && CP.active.id === c.id;
    const initial = (c.name || '?')[0];
    return `
      <div onclick="setActiveCompany('${c.id}')" style="padding:10px 12px;border:1px solid ${active ? 'var(--gold-bd)' : 'var(--border)'};border-radius:var(--r-sm);cursor:pointer;background:${active ? 'var(--gold-bg)' : 'transparent'};margin-bottom:6px;display:flex;align-items:center;gap:10px">
        ${c.logo_base64 ? `<img src="${c.logo_base64}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;background:#fff"/>` : '<div style="width:32px;height:32px;background:var(--gold-bg);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--gold-lt);font-family:var(--fm);font-weight:700">' + initial + '</div>'}
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${escapeHtml(c.name || 'Unnamed')}</div>
          ${c.subtitle ? `<div style="font-size:10px;color:var(--text2);margin-top:2px">${escapeHtml(c.subtitle)}</div>` : ''}
        </div>
        ${active ? '<div style="font-size:10px;color:var(--gold-lt);font-family:var(--fm)">ACTIVE</div>' : ''}
      </div>`;
  }).join('');
}
