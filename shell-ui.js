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

  // M5: Risk banner (renders after KPIs, above status banners)
  const rb = $('dash-risk-banner');
  if (rb) {
    if (typeof renderRiskBannerHTML === 'function') rb.innerHTML = renderRiskBannerHTML();
    else rb.innerHTML = '';
  }

  // Status banner area
  const st = $('dash-status');
  if (st) st.innerHTML = renderStatusBanners(mode);

  // M0.3c: Deal Economics panel (mode-aware, mirrors Deal Snapshot report)
  const ec = $('dash-economics');
  if (ec) ec.innerHTML = renderDealEconomicsPanel(mode);

  // M0.3c: Equity Required Breakdown panel (BRRRR only -- F&F has no
  // refinance and no two-tranche structure, so the BRRRR-specific
  // breakdown doesn't apply)
  const eq = $('dash-equity-breakdown');
  if (eq) eq.innerHTML = mode === 'brrrr' ? renderEquityBreakdownPanel() : '';

  // M0.3c: Market Context strip (Market Grade, Composite Score, Rent-to-Income, MSA)
  const ms = $('dash-market-strip');
  if (ms) ms.innerHTML = renderMarketContextStrip();

  // Comp validation panel (mode-specific)
  const cv = $('dash-comp-validation');
  if (cv) {
    if (mode === 'brrrr') cv.innerHTML = renderCompValidationPanel();
    else if (mode === 'fix_and_flip') cv.innerHTML = renderCompValidationPanelFF();
    else cv.innerHTML = '';
  }
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
    </div>
    ${renderMarketKpiTile()}`;
}

function renderFFKpis() {
  const tpc = R.total_project_cost;
  const arv = R.arv;
  const vc  = R.value_creation;
  const vcP = R.value_creation_pct;
  const eq  = R.investor_equity;
  const net = R.net_investor_proceeds;
  const roi = R.investor_roi;
  const ann = R.annualized_irr;
  const months = inputs.target_hold_months;
  const arvSrc = R.arv_source;

  const roiColor = roi == null || !isFinite(roi) ? 'var(--text3)'
    : roi >= 0.40 ? 'var(--ok)'
    : roi >= 0.20 ? 'var(--gold-lt)'
    : 'var(--bad)';

  const arvLabel = arvSrc === 'override' ? 'manual override'
    : arvSrc === 'comps' ? 'from comps'
    : 'not set';

  return `
    <div class="kpi-card kpi-gold">
      <div class="kpi-label">Value Creation</div>
      <div class="kpi-val">${vc != null ? f$(vc) : '-'}</div>
      <div class="kpi-sub">${vcP != null ? fP(vcP) + ' of total cost' : 'Pending ARV'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ARV (${arvLabel})</div>
      <div class="kpi-val">${arv != null && arv > 0 ? f$(arv) : '-'}</div>
      <div class="kpi-sub">${tpc != null ? 'Total cost: ' + f$(tpc) : 'Pending project cost'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Investor ROI${months ? ' (' + months + 'mo)' : ''}</div>
      <div class="kpi-val" style="color:${roiColor}">${roi != null && isFinite(roi) ? fP(roi) : '-'}</div>
      <div class="kpi-sub">${ann != null && isFinite(ann) ? 'Annualized IRR: ' + fP(ann) : 'Pending exit modeling'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Net Investor Proceeds</div>
      <div class="kpi-val">${net != null ? f$(net) : '-'}</div>
      <div class="kpi-sub">${eq != null ? 'Equity in: ' + f$(eq) : 'Pending equity'}</div>
    </div>
    ${renderMarketKpiTile()}`;
}

// Shared 5th KPI tile - renders only when market data is fetched.
// Same look on both BRRRR and F&F dashboards.
function renderMarketKpiTile() {
  if (R.market_score == null) return '';
  const score = R.market_score;
  const grade = R.market_grade || '-';
  const color = score >= 75 ? 'var(--ok)'
              : score >= 55 ? 'var(--gold-lt)'
              : score >= 35 ? 'var(--gold)'
              : 'var(--bad)';
  return `
    <div class="kpi-card">
      <div class="kpi-label">Market Strength</div>
      <div class="kpi-val" style="color:${color}">${grade} <span style="font-size:14px;color:var(--text2);font-weight:400">${score}/100</span></div>
      <div class="kpi-sub">${R.market_cbsa_name || R.market_zip || 'Census + HUD composite'}</div>
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


// ── COMP VALIDATION PANEL (BRRRR dashboard) ───────────────────
// Compares Income-approach ARV (NOI / exit cap) against Sales-approach
// ARV (avg $/SF × subject area). Variance bands: ≤10% green, ≤20% gold,
// >20% red. Renders only when sales comps and subject area are present.
function renderCompValidationPanel() {
  const incomeArv = R.stabilized_arv;
  const salesArv  = R.comp_derived_arv;
  const variance  = R.comp_variance_pct;
  const flag      = R.comp_validation_flag;
  const count     = R.comp_count_sales || 0;
  const renoCount = R.comp_count_sales_renovated || 0;
  const minMet    = R.comp_min_required_met;
  const avgPsf    = R.comp_avg_psf;
  const subjSf    = inputs.subject_area_sf;

  // Determine light state
  let lightHtml;
  let varianceLine = '';
  if (count === 0) {
    lightHtml = `<span class="cvp-light cvp-na">No sales comps</span>`;
  } else if (!minMet) {
    lightHtml = `<span class="cvp-light cvp-red">Below minimum (${count}/3 comps)</span>`;
  } else if (!subjSf) {
    lightHtml = `<span class="cvp-light cvp-na">Subject SF required</span>`;
  } else if (flag === 'green') {
    lightHtml = `<span class="cvp-light cvp-green">Validated</span>`;
  } else if (flag === 'gold') {
    lightHtml = `<span class="cvp-light cvp-gold">Caution</span>`;
  } else if (flag === 'red') {
    lightHtml = `<span class="cvp-light cvp-red">Divergent</span>`;
  } else {
    lightHtml = `<span class="cvp-light cvp-na">Pending</span>`;
  }

  if (variance != null && isFinite(variance)) {
    const varColor = flag === 'green' ? '#3fb950' : flag === 'gold' ? 'var(--gold)' : '#f85e5e';
    varianceLine = `
      <div class="cvp-variance-row">
        <span class="cvp-variance-label">Variance (sales vs income)</span>
        <span class="cvp-variance-value" style="color:${varColor}">${fP(variance)}</span>
      </div>`;
  }

  const subjSfDetail = subjSf ? fN(subjSf) + ' SF' : 'Subject SF not entered';
  const compsDetail = count > 0
    ? `${count} sales comp${count === 1 ? '' : 's'}${renoCount > 0 ? ' · ' + renoCount + ' renovated' : ''}`
    : 'No sales comps entered';

  return `
    <div class="comp-validation-panel">
      <div class="comp-validation-header">
        <div>
          <div class="comp-validation-title">Refi ARV Validation</div>
          <div class="comp-validation-subtitle">Two-method valuation cross-check</div>
        </div>
        ${lightHtml}
      </div>
      <div class="cvp-cols">
        <div class="cvp-col">
          <div class="cvp-col-label">Income Approach</div>
          <div class="cvp-col-value">${incomeArv != null && isFinite(incomeArv) ? f$(incomeArv) : '-'}</div>
          <div class="cvp-col-detail">NOI ÷ exit cap${inputs.exit_cap ? ' · cap ' + fP(inputs.exit_cap) : ''}</div>
        </div>
        <div class="cvp-vs">vs</div>
        <div class="cvp-col">
          <div class="cvp-col-label">Sales Approach</div>
          <div class="cvp-col-value">${salesArv != null && isFinite(salesArv) && salesArv > 0 ? f$(salesArv) : '-'}</div>
          <div class="cvp-col-detail">${avgPsf ? '$' + avgPsf.toFixed(2) + '/SF × ' + subjSfDetail : compsDetail}</div>
        </div>
      </div>
      ${varianceLine}
      ${count > 0 && count < 3 ? `<div class="cvp-note">Add ${3 - count} more sales comp${3 - count === 1 ? '' : 's'} to meet minimum.</div>` : ''}
      ${flag === 'red' ? `<div class="cvp-note">Variance exceeds 20%. Review cap rate assumption or comp set.</div>` : ''}
      ${flag === 'gold' ? `<div class="cvp-note">Variance is acceptable but flagged for review.</div>` : ''}
    </div>
  `;
}


// ── F&F COMP VALIDATION PANEL (DASHBOARD) ─────────────────────
// Different shape from BRRRR: there's no Income Approach for F&F since
// the deal doesn't model stabilized operations. The panel compares the
// manual ARV override against the comp-derived ARV (institutional method)
// and shows the spreadsheet-method comp ARV as a parity reference.
function renderCompValidationPanelFF() {
  const arv         = R.arv;
  const arvSrc      = R.arv_source;
  const compArv     = R.comp_derived_arv;
  const overrideArv = _num(inputs.arv_override);
  const count       = R.comp_count_sales || 0;
  const minMet      = R.comp_min_required_met;
  const avgPsf      = R.comp_avg_psf;
  const avgPsfSS    = R.comp_avg_psf_spreadsheet;
  const subjSf      = inputs.subject_area_sf;

  // Variance: only meaningful when both override and comp-derived exist
  let variance = null, flag = null;
  if (overrideArv > 0 && compArv > 0) {
    variance = Math.abs(overrideArv - compArv) / overrideArv;
    if (variance <= 0.10)      flag = 'green';
    else if (variance <= 0.20) flag = 'gold';
    else                       flag = 'red';
  }

  // Light state
  let lightHtml;
  if (count === 0) {
    lightHtml = `<span class="cvp-light cvp-na">No sales comps</span>`;
  } else if (!minMet) {
    lightHtml = `<span class="cvp-light cvp-red">Below minimum (${count}/3 comps)</span>`;
  } else if (!subjSf) {
    lightHtml = `<span class="cvp-light cvp-na">Subject SF required</span>`;
  } else if (arvSrc === 'override' && !flag) {
    lightHtml = `<span class="cvp-light cvp-na">Override in use</span>`;
  } else if (flag === 'green') {
    lightHtml = `<span class="cvp-light cvp-green">Validated</span>`;
  } else if (flag === 'gold') {
    lightHtml = `<span class="cvp-light cvp-gold">Caution</span>`;
  } else if (flag === 'red') {
    lightHtml = `<span class="cvp-light cvp-red">Divergent</span>`;
  } else if (arvSrc === 'comps') {
    lightHtml = `<span class="cvp-light cvp-green">Comp-derived</span>`;
  } else {
    lightHtml = `<span class="cvp-light cvp-na">Pending</span>`;
  }

  let varianceLine = '';
  if (variance != null && isFinite(variance)) {
    const varColor = flag === 'green' ? '#3fb950' : flag === 'gold' ? 'var(--gold)' : '#f85e5e';
    varianceLine = `
      <div class="cvp-variance-row">
        <span class="cvp-variance-label">Variance (override vs comps)</span>
        <span class="cvp-variance-value" style="color:${varColor}">${fP(variance)}</span>
      </div>`;
  }

  const subjSfDetail = subjSf ? fN(subjSf) + ' SF' : 'Subject SF not entered';
  const psfDetail = avgPsf
    ? '$' + avgPsf.toFixed(2) + '/SF × ' + subjSfDetail
    : (count > 0 ? `${count} sales comp${count === 1 ? '' : 's'}` : 'No sales comps entered');

  // Left column: ARV in use. Right column: comp-derived (or override if comps in use)
  const leftLabel  = arvSrc === 'override' ? 'Manual ARV Override' : 'Comp-Derived ARV';
  const rightLabel = arvSrc === 'override' ? 'Comp-Derived ARV' : 'Manual ARV';
  const leftValue  = arv;
  const rightValue = arvSrc === 'override' ? compArv : overrideArv;
  const leftDetail = arvSrc === 'override' ? 'User-entered' : psfDetail;
  const rightDetail= arvSrc === 'override'
    ? (compArv > 0 ? psfDetail : 'No comps available')
    : (overrideArv > 0 ? 'User-entered' : 'No override entered');

  // Spreadsheet-method footnote (institutional improvement)
  const psfFootnote = (avgPsf != null && avgPsfSS != null && Math.abs(avgPsf - avgPsfSS) > 0.01)
    ? `<div class="cvp-note">Foundry $/SF: ${avgPsf.toFixed(2)} (avg of per-comp $/SF) vs spreadsheet method ${avgPsfSS.toFixed(2)} (sum-price ÷ sum-SF). Institutional method shown.</div>`
    : '';

  return `
    <div class="comp-validation-panel">
      <div class="comp-validation-header">
        <div>
          <div class="comp-validation-title">ARV Validation</div>
          <div class="comp-validation-subtitle">Override vs comp-derived cross-check</div>
        </div>
        ${lightHtml}
      </div>
      <div class="cvp-cols">
        <div class="cvp-col">
          <div class="cvp-col-label">${leftLabel}</div>
          <div class="cvp-col-value">${leftValue != null && isFinite(leftValue) && leftValue > 0 ? f$(leftValue) : '-'}</div>
          <div class="cvp-col-detail">${leftDetail}</div>
        </div>
        <div class="cvp-vs">vs</div>
        <div class="cvp-col">
          <div class="cvp-col-label">${rightLabel}</div>
          <div class="cvp-col-value">${rightValue != null && isFinite(rightValue) && rightValue > 0 ? f$(rightValue) : '-'}</div>
          <div class="cvp-col-detail">${rightDetail}</div>
        </div>
      </div>
      ${varianceLine}
      ${count > 0 && count < 3 ? `<div class="cvp-note">Add ${3 - count} more sales comp${3 - count === 1 ? '' : 's'} to meet minimum.</div>` : ''}
      ${flag === 'red' ? `<div class="cvp-note">Override exceeds comp-derived by more than 20%. Justify in the risk register.</div>` : ''}
      ${psfFootnote}
    </div>
  `;
}


// ════════════════════════════════════════════════════════════════
// M0.3c - NEW DASHBOARD PANELS
// ════════════════════════════════════════════════════════════════
// Three panels added in M0.3c so the dashboard becomes a live snapshot
// of the deal rather than just five KPI tiles. Mirrors the Deal Snapshot
// report sections: Deal Economics, Equity Required Breakdown, Market
// Context. All three reuse the .comp-validation-panel CSS container so
// they inherit the existing dashboard panel visual treatment without
// requiring new style rules.

// Deal Economics panel -- mode-aware data list.
function renderDealEconomicsPanel(mode) {
  if (!R || typeof R !== 'object') return '';

  let rows;
  if (mode === 'brrrr') {
    const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0)
      ? R.refi_loan_amount / R.stabilized_arv : null;
    rows = [
      ['Purchase Price',           inputs.purchase_price != null ? f$(inputs.purchase_price) : '-'],
      ['Capex Budget',             inputs.capex_budget != null ? f$(inputs.capex_budget) : '-'],
      ['Total Project Cost',       R.total_project_cost != null ? f$(R.total_project_cost) : '-'],
      ['Acquisition Tranche',      R.acquisition_tranche != null ? f$(R.acquisition_tranche) : '-'],
      ['Construction Tranche',     R.construction_tranche != null ? f$(R.construction_tranche) : '-'],
      ['Total Bridge Loan',        R.initial_loan_amt != null ? f$(R.initial_loan_amt) : '-'],
      ['Refi Loan',                R.refi_loan_amount != null ? f$(R.refi_loan_amount) : '-'],
      ['Stabilized NOI',           R.stabilized_noi != null ? f$(R.stabilized_noi) : '-'],
      ['Refi LTV',                 refi_ltv != null ? fP(refi_ltv) : '-'],
      ['Post-Refi In-Basis',       R.post_refi_in_basis_pct != null ? fP(R.post_refi_in_basis_pct) : '-'],
      ['Annual Cash Flow',         R.annual_cash_flow != null ? f$(R.annual_cash_flow) : '-'],
      ['Breakeven Occupancy',      R.breakeven_occupancy != null ? fP(R.breakeven_occupancy) : '-']
    ];
  } else {
    rows = [
      ['Purchase Price',           inputs.purchase_price != null ? f$(inputs.purchase_price) : '-'],
      ['Capex Budget',             inputs.capex_budget != null ? f$(inputs.capex_budget) : '-'],
      ['Total Project Cost',       R.total_project_cost != null ? f$(R.total_project_cost) : '-'],
      ['Initial Loan',             R.initial_loan_amt != null ? f$(R.initial_loan_amt) : '-'],
      ['ARV',                      R.arv != null ? f$(R.arv) : '-'],
      ['Sale Cost',                R.sale_cost != null ? f$(R.sale_cost) : '-'],
      ['Net Investor Proceeds',    R.net_investor_proceeds != null ? f$(R.net_investor_proceeds) : '-'],
      ['Investor Equity In',       R.investor_equity != null ? f$(R.investor_equity) : '-'],
      ['Value Creation',           R.value_creation_pct != null ? fP(R.value_creation_pct) : '-'],
      ['Hold Period',              inputs.target_hold_months ? inputs.target_hold_months + ' months' : '-']
    ];
  }

  const rowsHtml = rows.map(([lbl, val]) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
       <span style="color:var(--text2)">${escapeHtml(lbl)}</span>
       <span style="color:var(--text);font-family:var(--fm);font-weight:600">${escapeHtml(val)}</span>
     </div>`).join('');

  return `
    <div class="comp-validation-panel">
      <div class="comp-validation-header">
        <div>
          <div class="comp-validation-title">Deal Economics</div>
          <div class="comp-validation-subtitle">${mode === 'brrrr' ? 'Acquisition through stabilized refi' : 'Acquisition through disposition'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
        <div>${rowsHtml.split('</div>').slice(0, Math.ceil(rows.length / 2)).join('</div>') + '</div>'}</div>
        <div>${rowsHtml.split('</div>').slice(Math.ceil(rows.length / 2)).join('</div>')}</div>
      </div>
    </div>`;
}


// Equity Required Breakdown panel -- BRRRR only. Itemizes the components
// of initial_investor_equity. Reads from the M0.3 R fields exposed by
// the engine (equity_acq_down_payment, equity_capex_gap, etc.). Hides
// zero-dollar lines for UX tightness; printed BRRRR Package shows all
// lines including zeros (audit-grade).
function renderEquityBreakdownPanel() {
  if (!R || typeof R !== 'object') return '';
  const total = R.equity_required_breakdown_total || 0;
  if (total === 0) return '';  // no deal economics yet

  const rows = [
    ['Mortgage down payment (acquisition)',     R.equity_acq_down_payment || 0],
    ['Sponsor capex above lender funding',      R.equity_capex_gap || 0],
    ['Closing costs',                           R.equity_closing_costs || 0],
    ['Consulting / project fee',                R.equity_consulting || 0],
    ['Bridge debt service through refi',        R.equity_bridge_carry || 0],
    ['Sponsor mobilization (counted as equity)', R.equity_gc_contingency_if_equity || 0]
  ];

  // Filter to nonzero rows for dashboard UX. Zero rows still appear in
  // the printed BRRRR Package per the audit-grade rule.
  const nonzero = rows.filter(([, v]) => v > 0);

  const rowsHtml = nonzero.map(([lbl, val]) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
       <span style="color:var(--text2)">${escapeHtml(lbl)}</span>
       <span style="color:var(--text);font-family:var(--fm);font-weight:600">${f$(val)} <span style="color:var(--text3);font-weight:400;margin-left:6px">${fP(val / Math.max(1, total))}</span></span>
     </div>`).join('');

  const toggleNote = R.equity_gc_contingency_if_equity > 0
    ? ''
    : `<div style="font-size:10px;color:var(--text3);margin-top:8px;font-style:italic">Sponsor mobilization not counted as equity (reimbursed via draws before refi). Toggle in Capital panel to include.</div>`;

  return `
    <div class="comp-validation-panel">
      <div class="comp-validation-header">
        <div>
          <div class="comp-validation-title">Equity Required Breakdown</div>
          <div class="comp-validation-subtitle">Components of investor equity at closing</div>
        </div>
        <span style="font-family:var(--fm);font-size:14px;font-weight:700;color:var(--gold-lt)">${f$(total)}</span>
      </div>
      <div>${rowsHtml}</div>
      <div style="display:flex;justify-content:space-between;padding:8px 0 0 0;margin-top:4px;border-top:1px solid var(--gold-bd);font-size:12px;font-weight:700">
        <span style="color:var(--text)">Total Equity Required at Closing</span>
        <span style="color:var(--gold-lt);font-family:var(--fm)">${f$(total)}</span>
      </div>
      ${toggleNote}
    </div>`;
}


// Market Context strip -- Market Grade, Composite Score, Rent-to-Income,
// MSA. Mirrors Deal Snapshot's _marketStrip. Shows empty-state when no
// market analysis has been fetched.
function renderMarketContextStrip() {
  const ma = (typeof marketAnalysis === 'object' && marketAnalysis) ? marketAnalysis : {};
  const d  = ma.derived;

  if (!d || d.market_strength_score == null) {
    return `
      <div class="comp-validation-panel">
        <div class="comp-validation-header">
          <div>
            <div class="comp-validation-title">Market Context</div>
            <div class="comp-validation-subtitle">Census and FMR composite</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);padding:8px 0">
          Market analysis not run for this deal. Fetch census and FMR data on the Market panel for context.
        </div>
      </div>`;
  }

  const grade = d.market_strength_grade || '-';
  const gradeColor = grade.startsWith('A') ? '#3fb950'
                   : grade.startsWith('B') ? 'var(--gold-lt)'
                   : grade.startsWith('C') ? 'var(--gold)'
                   : '#f85e5e';

  const score = d.market_strength_score != null ? Math.round(d.market_strength_score) : '-';
  const rti   = d.rent_to_income_ratio != null ? fP(d.rent_to_income_ratio) : '-';
  const msa   = ma.cbsa_name || 'Unknown';

  return `
    <div class="comp-validation-panel">
      <div class="comp-validation-header">
        <div>
          <div class="comp-validation-title">Market Context</div>
          <div class="comp-validation-subtitle">Census and FMR composite</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;padding:8px 0">
        <div>
          <div style="font-size:10px;text-transform:uppercase;color:var(--text3);letter-spacing:0.05em;margin-bottom:4px">Grade</div>
          <div style="font-size:22px;font-weight:700;color:${gradeColor};font-family:var(--fm)">${escapeHtml(grade)}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;color:var(--text3);letter-spacing:0.05em;margin-bottom:4px">Composite</div>
          <div style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--fm)">${escapeHtml(String(score))} <span style="font-size:11px;color:var(--text3);font-weight:400">/ 100</span></div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;color:var(--text3);letter-spacing:0.05em;margin-bottom:4px">Rent-to-Income</div>
          <div style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--fm)">${escapeHtml(rti)}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;color:var(--text3);letter-spacing:0.05em;margin-bottom:4px">MSA</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.3;padding-top:4px">${escapeHtml(msa)}</div>
        </div>
      </div>
    </div>`;
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


// ── REPORTS PAGE (M6) ──────────────────────────────────────────
// Card grid of the six PDF report types. Clicking a card opens a new
// tab to the print route (openPrintTab in print.js), which renders the
// report and triggers window.print(). Cards disabled when no deal loaded.
function renderReportsPage() {
  const root = $('section-reports');
  if (!root) return;

  if (!currentDeal) {
    root.innerHTML = `
      <div class="panel">
        <div class="panel-title">Reports</div>
        <div class="empty">
          <div class="empty-icon">📄</div>
          <div class="empty-title">No deal loaded</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Open a deal to generate reports.</div>
        </div>
      </div>`;
    return;
  }

  const mode = getDealMode();
  const modeLbl = mode === 'brrrr' ? 'BRRRR' : 'Fix & Flip';

  // Report catalog (slug, label, desc, audience, mode-applicability).
  // Mode-applicability: 'both' = always shown; 'brrrr' = BRRRR only; 'ff' = F&F only.
  const reports = [
    { slug: 'deal-snapshot',    label: 'Deal Snapshot',      desc: 'One-page internal summary. Headline KPIs, mode-aware status, top risks.', audience: 'Internal',          modes: 'both', pages: '1pp' },
    { slug: 'brrrr-package',    label: 'BRRRR Package',      desc: 'Full underwriting package for lender or equity. Income, expenses, refi, exit, returns.', audience: 'Lender / Equity',   modes: 'brrrr', pages: '8-12pp' },
    { slug: 'ff-package',       label: 'F&F Package',        desc: 'Single-equity-LP package. Comp grid, ARV derivation, returns, timeline.', audience: 'Equity LP',         modes: 'ff', pages: '6-8pp' },
    { slug: 'internal-memo',    label: 'Internal Memo',      desc: 'Mode-aware narrative deal memo. Thesis, risks, recommendation.', audience: 'Internal IC',       modes: 'both', pages: '3-5pp' },
    { slug: 'lender-package',   label: 'Lender Package',     desc: 'Bridge or agency lender deliverable. Sources/uses, DSCR, debt yield, sponsor.', audience: 'Lender',            modes: 'brrrr', pages: '4-6pp' },
    { slug: 'hud-vash-package', label: 'HUD-VASH PBV Package', desc: 'Valor Housing Partners deliverable. Voucher uplift, PBV mechanics, federal pathway.', audience: 'HUD / GP',          modes: 'brrrr', pages: '5-7pp' }
  ];

  const cards = reports.map(rep => {
    const applicable = rep.modes === 'both'
      || (rep.modes === 'brrrr' && mode === 'brrrr')
      || (rep.modes === 'ff' && mode === 'fix_and_flip');
    return _reportCard(rep, applicable);
  }).join('');

  root.innerHTML = `
    <div class="panel">
      <div class="panel-title">
        <span>Reports · ${escapeHtml(currentDeal.name || 'Untitled')} · ${modeLbl}</span>
      </div>
      <div class="panel-sub" style="margin-bottom:1rem">
        Each report opens in a new tab and triggers your browser's print dialog. Choose "Save as PDF" to download. Filename auto-fills with deal and report metadata.
      </div>
      <div class="panel-sub" style="margin-bottom:1rem;font-size:10px;color:var(--text3)">
        Print tip: in the print dialog, expand "More settings" and uncheck "Headers and footers" to remove the default URL and timestamp from the PDF margins.
      </div>
      <div class="report-grid">${cards}</div>
    </div>`;
}

function _reportCard(rep, applicable) {
  const disabled = !applicable;
  const generateClick = disabled ? '' : `onclick="openPrintTab('${rep.slug}')"`;
  // Lock buttons stop propagation so they don't trigger the card's
  // Generate action. The button is hidden for disabled (not-applicable)
  // reports.
  return `
    <div class="report-card ${disabled ? 'report-card-disabled' : ''}" ${generateClick}>
      <div class="rc-head">
        <div class="rc-icon">📄</div>
        <div class="rc-meta">
          <div class="rc-audience">${escapeHtml(rep.audience)}</div>
          <div class="rc-pages">${escapeHtml(rep.pages)}</div>
        </div>
      </div>
      <div class="rc-title">${escapeHtml(rep.label)}</div>
      <div class="rc-desc">${escapeHtml(rep.desc)}</div>
      <div class="rc-cta" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        ${disabled
          ? '<span class="rc-na">Not applicable in current mode</span>'
          : `<span class="rc-go">Generate →</span>
             <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();lockSnapshot('${rep.slug}')" title="Save a locked version of this report for the audit trail" style="font-size:10px;padding:4px 10px">Lock snapshot</button>`}
      </div>
    </div>`;
}


// ── SNAPSHOTS PAGE (Path A Pass 4) ────────────────────────────
// Lists all locked snapshots for the currently-loaded deal.
// Snapshots are immutable; only View and Delete actions are exposed.
function renderSnapshotsPage() {
  const root = $('section-snapshots');
  if (!root) return;

  if (!currentDeal) {
    root.innerHTML = `
      <div class="panel">
        <div class="panel-title">Snapshots</div>
        <div class="empty">
          <div class="empty-icon">🔒</div>
          <div class="empty-title">No deal loaded</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Open a deal to view its locked report snapshots.</div>
        </div>
      </div>`;
    return;
  }

  const list = (typeof SNAPSHOTS === 'object' && SNAPSHOTS && Array.isArray(SNAPSHOTS.list)) ? SNAPSHOTS.list : [];

  if (list.length === 0) {
    root.innerHTML = `
      <div class="panel">
        <div class="panel-title">Snapshots
          <span class="panel-sub">${escapeHtml(currentDeal.name || 'Untitled')}</span>
        </div>
        <div class="empty">
          <div class="empty-icon">🔒</div>
          <div class="empty-title">No locked snapshots</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px;max-width:480px;line-height:1.5">
            Lock snapshots from the Reports page to preserve an audit-trail record of the inputs, math, and rendered output at the moment you sent a report to an LP or lender. Snapshots are immutable once created.
          </div>
        </div>
      </div>`;
    return;
  }

  const rows = list.map(_snapshotRow).join('');

  root.innerHTML = `
    <div class="panel">
      <div class="panel-title">Snapshots
        <span class="panel-sub">${escapeHtml(currentDeal.name || 'Untitled')} · ${list.length} locked</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:1rem;line-height:1.5">
        Each row below is an immutable record of a report generated against this deal at a specific point in time. Engine version stamps tie snapshots back to entries in <code style="font-size:10px;background:var(--bg2);padding:1px 5px;border-radius:3px">CHANGELOG.md</code>.
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
    </div>`;
}

function _snapshotRow(snap) {
  const types = (typeof SNAPSHOT_REPORT_TYPES === 'object') ? SNAPSHOT_REPORT_TYPES : {};
  const cfg = types[snap.report_type];
  const label = cfg ? cfg.label : snap.report_type;
  const created = snap.created_at
    ? new Date(snap.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'unknown';
  const note = snap.note ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;font-style:italic">${escapeHtml(snap.note)}</div>` : '';
  return `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:12px 14px;background:var(--bg2);display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--text)">${escapeHtml(label)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px;font-family:var(--fm)">${escapeHtml(created)} · engine ${escapeHtml(snap.engine_version || 'unversioned')}</div>
        ${note}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="viewSnapshot('${snap.id}')" style="font-size:10px;padding:4px 10px">View</button>
        <button class="btn btn-ghost btn-sm" onclick="confirmDeleteSnapshot('${snap.id}')" style="font-size:10px;padding:4px 10px;color:#f85e5e">Delete</button>
      </div>
    </div>`;
}
