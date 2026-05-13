// ════════════════════════════════════════════════════════════════
// FOUNDRY M5 - Risk Register
// ════════════════════════════════════════════════════════════════
//
// Assembles risks from three sources:
//   1. Engine risks  (R.engine_risks, populated by engine.js)
//   2. Market risks  (R.market_risks, populated when market data is fetched)
//   3. Custom risks  (currentDeal.risks[].custom === true)
//
// Persists user state (mitigation text, resolved flag, custom risks) to
// currentDeal.risks[]. Engine and market risks are recomputed every
// render; their persisted state is matched by id. Custom risks live
// only in currentDeal.risks[] and survive across sessions via the
// standard deal autosave.
//
// ── Risk object shape ──
// {
//   id:         'eng_dscr_low' | 'mkt_<key>' | 'cust_<uuid>'
//   source:     'engine' | 'market' | 'custom'
//   severity:   'high' | 'medium' | 'low'
//   category:   'Coverage' | 'Capital' | 'Operations' | 'Returns'
//               | 'Budget' | 'Assumptions' | 'Comps' | <user-entered>
//   title:      string
//   detail:     string
//   value:      number | null    (measured value, engine/market only)
//   threshold:  number | null    (institutional threshold)
//   mitigation: string           (user-entered, persisted)
//   resolved:   boolean          (user-flagged, persisted)
//   custom:     boolean
// }
// ════════════════════════════════════════════════════════════════

// Stable map keys from market.js risk titles -> ids, so persisted state
// (mitigation, resolved) tracks across renders even though market.js
// doesn't currently emit ids.
const MARKET_RISK_ID_MAP = {
  'Elevated rental vacancy':            'mkt_vacancy_high',
  'Moderate rental vacancy':            'mkt_vacancy_mid',
  'Elevated unemployment':              'mkt_unemployment_high',
  'Elevated poverty rate':              'mkt_poverty_high',
  'Cost-burdened tenant base':          'mkt_rent_burden',
  'Median income below institutional floor': 'mkt_income_low',
  'Weak composite market score':        'mkt_score_weak'
};

// Severity sort weight (high first).
const SEV_WEIGHT = { high: 0, medium: 1, low: 2 };


// Convert market-risk objects (no id) to risk.js shape with stable id.
function _normalizeMarketRisks() {
  const raw = (typeof R === 'object' && R && Array.isArray(R.market_risks)) ? R.market_risks : [];
  return raw.map((r, idx) => ({
    id:         MARKET_RISK_ID_MAP[r.title] || ('mkt_' + idx),
    source:     'market',
    severity:   r.severity || 'medium',
    category:   r.category === 'market' ? 'Market' : (r.category || 'Market'),
    title:      r.title || 'Market risk',
    detail:     r.detail || '',
    value:      r.value != null ? r.value : null,
    threshold:  r.threshold != null ? r.threshold : null
  }));
}

// Engine risks already carry id, source, severity, category, title,
// detail, value, threshold from engine.js. Pass through.
function _normalizeEngineRisks() {
  const raw = (typeof R === 'object' && R && Array.isArray(R.engine_risks)) ? R.engine_risks : [];
  return raw.slice();
}

// Custom risks live on currentDeal.risks[] with custom:true.
function _getCustomRisks() {
  if (typeof currentDeal !== 'object' || !currentDeal) return [];
  const arr = Array.isArray(currentDeal.risks) ? currentDeal.risks : [];
  return arr.filter(r => r && r.custom === true);
}

// User state (mitigation, resolved) for a given risk id, if present on
// currentDeal.risks[].
function _getUserState(id) {
  if (typeof currentDeal !== 'object' || !currentDeal) return null;
  const arr = Array.isArray(currentDeal.risks) ? currentDeal.risks : [];
  const found = arr.find(r => r && r.id === id);
  if (!found) return null;
  return {
    mitigation: typeof found.mitigation === 'string' ? found.mitigation : '',
    resolved:   found.resolved === true
  };
}

// Assemble the unified risk list: engine + market + custom, with persisted
// user state merged in.
function assembleRisks() {
  const out = [];

  // Engine + market (auto-flagged)
  const auto = _normalizeEngineRisks().concat(_normalizeMarketRisks());
  for (const r of auto) {
    const us = _getUserState(r.id);
    out.push(Object.assign({
      mitigation: '',
      resolved:   false,
      custom:     false
    }, r, us || {}));
  }

  // Custom (already has full shape on currentDeal.risks)
  for (const r of _getCustomRisks()) {
    out.push(Object.assign({
      mitigation: '',
      resolved:   false,
      custom:     true,
      severity:   'medium',
      category:   'Custom',
      detail:     '',
      value:      null,
      threshold:  null
    }, r));
  }

  // Sort: unresolved first, then high → medium → low, then by source
  // (engine before market before custom), then by title.
  const srcWeight = { engine: 0, market: 1, custom: 2 };
  out.sort((a, b) => {
    if ((a.resolved ? 1 : 0) !== (b.resolved ? 1 : 0)) return (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0);
    if (SEV_WEIGHT[a.severity] !== SEV_WEIGHT[b.severity]) return SEV_WEIGHT[a.severity] - SEV_WEIGHT[b.severity];
    if (srcWeight[a.source] !== srcWeight[b.source]) return srcWeight[a.source] - srcWeight[b.source];
    return (a.title || '').localeCompare(b.title || '');
  });

  return out;
}


// Counts for the dashboard banner. Resolved risks are excluded.
function getRiskBannerCounts() {
  const all = assembleRisks();
  let high = 0, medium = 0, low = 0;
  for (const r of all) {
    if (r.resolved) continue;
    if (r.severity === 'high') high++;
    else if (r.severity === 'medium') medium++;
    else low++;
  }
  return { high, medium, low, total: high + medium + low };
}


// ── PERSISTENCE ───────────────────────────────────────────────
// User state for engine/market risks is stored as a stub object on
// currentDeal.risks[] (id + mitigation + resolved + source). Custom
// risks store the full object. Saves via the standard saveDeal()
// debounce in core.js.
function _persistUserState(id, patch, sourceForStub) {
  if (typeof currentDeal !== 'object' || !currentDeal) return;
  if (!Array.isArray(currentDeal.risks)) currentDeal.risks = [];
  let row = currentDeal.risks.find(r => r && r.id === id);
  if (!row) {
    row = { id, source: sourceForStub, mitigation: '', resolved: false };
    currentDeal.risks.push(row);
  }
  Object.assign(row, patch);
  if (typeof saveDeal === 'function') saveDeal();
}

function setRiskMitigation(id, source, text) {
  _persistUserState(id, { mitigation: text || '' }, source);
}
function setRiskResolved(id, source, resolved) {
  _persistUserState(id, { resolved: !!resolved }, source);
  renderRiskPage();
  if (typeof updateDashboard === 'function') updateDashboard();
}

function addCustomRisk(payload) {
  if (typeof currentDeal !== 'object' || !currentDeal) return;
  if (!Array.isArray(currentDeal.risks)) currentDeal.risks = [];
  const id = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const row = {
    id,
    source:     'custom',
    custom:     true,
    severity:   payload.severity || 'medium',
    category:   payload.category || 'Custom',
    title:      payload.title || 'Custom risk',
    detail:     payload.detail || '',
    mitigation: payload.mitigation || '',
    resolved:   false,
    value:      null,
    threshold:  null
  };
  currentDeal.risks.push(row);
  if (typeof saveDeal === 'function') saveDeal();
  renderRiskPage();
  if (typeof updateDashboard === 'function') updateDashboard();
}

function deleteCustomRisk(id) {
  if (typeof currentDeal !== 'object' || !currentDeal) return;
  if (!Array.isArray(currentDeal.risks)) return;
  if (!confirm('Delete this custom risk?')) return;
  currentDeal.risks = currentDeal.risks.filter(r => !(r && r.id === id && r.custom === true));
  if (typeof saveDeal === 'function') saveDeal();
  renderRiskPage();
  if (typeof updateDashboard === 'function') updateDashboard();
}


// ── RENDER ─────────────────────────────────────────────────────
function renderRiskPage() {
  const root = document.getElementById('section-risk');
  if (!root) return;

  if (typeof currentDeal !== 'object' || !currentDeal) {
    root.innerHTML = `
      <div class="panel">
        <div class="panel-title">Risk Register</div>
        <div class="empty">
          <div class="empty-icon">⚠</div>
          <div class="empty-title">No deal loaded</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Open or seed a deal to view risks.</div>
        </div>
      </div>`;
    return;
  }

  // Ensure engine_risks is fresh for the current state.
  if (typeof recompute === 'function') recompute();

  const risks   = assembleRisks();
  const counts  = getRiskBannerCounts();
  const mode    = (typeof getDealMode === 'function') ? getDealMode() : 'brrrr';
  const modeLbl = mode === 'brrrr' ? 'BRRRR' : 'Fix & Flip';

  const summaryHtml = `
    <div class="risk-summary">
      <div class="risk-summary-tile risk-sev-high">
        <div class="rst-num">${counts.high}</div>
        <div class="rst-lbl">High</div>
      </div>
      <div class="risk-summary-tile risk-sev-medium">
        <div class="rst-num">${counts.medium}</div>
        <div class="rst-lbl">Medium</div>
      </div>
      <div class="risk-summary-tile risk-sev-low">
        <div class="rst-num">${counts.low}</div>
        <div class="rst-lbl">Low</div>
      </div>
      <div class="risk-summary-tile risk-sev-resolved">
        <div class="rst-num">${risks.filter(r => r.resolved).length}</div>
        <div class="rst-lbl">Resolved</div>
      </div>
    </div>`;

  let rowsHtml;
  if (risks.length === 0) {
    rowsHtml = `
      <div class="empty">
        <div class="empty-icon">✓</div>
        <div class="empty-title">No risks flagged</div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.7">
          The engine has not auto-flagged any institutional thresholds. Add a custom risk for anything the model does not capture.
        </div>
      </div>`;
  } else {
    rowsHtml = risks.map(_renderRiskRow).join('');
  }

  root.innerHTML = `
    <div class="panel">
      <div class="panel-title">
        <span>Risk Register · ${modeLbl}</span>
        <button class="btn btn-sm btn-gold" onclick="openAddRiskDialog()">+ Add custom risk</button>
      </div>
      <div class="panel-sub" style="margin-bottom:1rem">
        Auto-flagged by engine and market modules; underwriter adds custom risks. Mitigation and resolved state autosave.
      </div>
      ${summaryHtml}
      <div class="risk-list">${rowsHtml}</div>
    </div>`;
}

function _renderRiskRow(r) {
  const sevLbl = r.severity ? r.severity.charAt(0).toUpperCase() + r.severity.slice(1) : 'Medium';
  const srcLbl = r.source === 'engine' ? 'Engine'
              : r.source === 'market' ? 'Market'
              : 'Custom';
  const resolvedCls = r.resolved ? 'risk-row-resolved' : '';
  const idEsc = (r.id || '').replace(/'/g, "\\'");
  const srcEsc = (r.source || '').replace(/'/g, "\\'");
  const mitId = 'rmit-' + (r.id || '').replace(/[^a-z0-9_]/gi, '_');

  return `
    <div class="risk-row risk-sev-${r.severity || 'medium'} ${resolvedCls}" data-risk-id="${r.id}">
      <div class="risk-row-head">
        <div class="risk-row-head-l">
          <span class="risk-pill risk-pill-sev-${r.severity || 'medium'}">${sevLbl}</span>
          <span class="risk-pill risk-pill-src">${srcLbl}</span>
          <span class="risk-pill risk-pill-cat">${r.category || '-'}</span>
        </div>
        <div class="risk-row-head-r">
          <label class="risk-resolved-toggle">
            <input type="checkbox" ${r.resolved ? 'checked' : ''}
                   onchange="setRiskResolved('${idEsc}','${srcEsc}', this.checked)">
            <span>Resolved</span>
          </label>
          ${r.custom ? `<button class="btn btn-sm btn-bad" onclick="deleteCustomRisk('${idEsc}')" title="Delete custom risk">×</button>` : ''}
        </div>
      </div>
      <div class="risk-row-title">${_esc(r.title)}</div>
      <div class="risk-row-detail">${_esc(r.detail)}</div>
      <div class="risk-row-mit">
        <label for="${mitId}">Mitigation</label>
        <textarea id="${mitId}" class="risk-mit-input" rows="2"
                  placeholder="How will this be mitigated, monitored, or accepted?"
                  onblur="setRiskMitigation('${idEsc}','${srcEsc}', this.value)"
        >${_esc(r.mitigation || '')}</textarea>
      </div>
    </div>`;
}

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// ── ADD CUSTOM RISK DIALOG ─────────────────────────────────────
function openAddRiskDialog() {
  closeAddRiskDialog();
  const dlg = document.createElement('div');
  dlg.id = 'risk-add-dialog-bg';
  dlg.className = 'risk-add-dialog-bg';
  dlg.innerHTML = `
    <div class="risk-add-dialog">
      <div class="risk-add-title">Add Custom Risk</div>
      <div class="field" style="margin-bottom:.6rem">
        <label>Title</label>
        <input type="text" id="ra-title" placeholder="Short headline (e.g. Roof age uncertain)">
      </div>
      <div class="row-2" style="gap:.6rem;margin-bottom:.6rem">
        <div class="field">
          <label>Severity</label>
          <select id="ra-severity">
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div class="field">
          <label>Category</label>
          <input type="text" id="ra-category" placeholder="e.g. Diligence, Title, Environmental" value="Custom">
        </div>
      </div>
      <div class="field" style="margin-bottom:.6rem">
        <label>Detail</label>
        <textarea id="ra-detail" rows="3" placeholder="What is the risk? Why does it matter? What is the magnitude?"></textarea>
      </div>
      <div class="field" style="margin-bottom:1rem">
        <label>Mitigation (optional)</label>
        <textarea id="ra-mitigation" rows="2" placeholder="Initial mitigation plan, if any."></textarea>
      </div>
      <div class="risk-add-actions">
        <button class="btn btn-ghost" onclick="closeAddRiskDialog()">Cancel</button>
        <button class="btn btn-gold" onclick="submitAddRiskDialog()">Add Risk</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  setTimeout(() => {
    const el = document.getElementById('ra-title');
    if (el) el.focus();
  }, 50);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeAddRiskDialog();
  });
}

function closeAddRiskDialog() {
  const dlg = document.getElementById('risk-add-dialog-bg');
  if (dlg) dlg.remove();
}

function submitAddRiskDialog() {
  const title = (document.getElementById('ra-title').value || '').trim();
  if (!title) {
    alert('Title is required.');
    return;
  }
  const sev = document.getElementById('ra-severity').value || 'medium';
  const cat = (document.getElementById('ra-category').value || 'Custom').trim() || 'Custom';
  const det = (document.getElementById('ra-detail').value || '').trim();
  const mit = (document.getElementById('ra-mitigation').value || '').trim();
  closeAddRiskDialog();
  addCustomRisk({ title, severity: sev, category: cat, detail: det, mitigation: mit });
}


// ── DASHBOARD BANNER ──────────────────────────────────────────
// Rendered into #dash-risk-banner by shell-ui.js updateDashboard().
function renderRiskBannerHTML() {
  if (typeof currentDeal !== 'object' || !currentDeal) return '';
  const counts = getRiskBannerCounts();
  if (counts.high > 0) {
    return `
      <div class="risk-banner risk-banner-high" onclick="navTo('risk', document.querySelector('[data-section=risk]'))">
        <span class="risk-banner-icon">⚠</span>
        <span class="risk-banner-text"><strong>${counts.high}</strong> high-severity risk${counts.high === 1 ? '' : 's'} unresolved</span>
        <span class="risk-banner-cta">Review →</span>
      </div>`;
  }
  if (counts.medium > 0) {
    return `
      <div class="risk-banner risk-banner-medium" onclick="navTo('risk', document.querySelector('[data-section=risk]'))">
        <span class="risk-banner-icon">●</span>
        <span class="risk-banner-text"><strong>${counts.medium}</strong> medium-severity risk${counts.medium === 1 ? '' : 's'} flagged</span>
        <span class="risk-banner-cta">Review →</span>
      </div>`;
  }
  return `
    <div class="risk-banner risk-banner-clear">
      <span class="risk-banner-icon">✓</span>
      <span class="risk-banner-text">No unresolved risks flagged</span>
    </div>`;
}
