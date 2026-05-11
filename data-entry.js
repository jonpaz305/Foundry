// ════════════════════════════════════════════════════════════════
// FOUNDRY - Data Entry (Setup, Unit Mix, Comps, Operating, Capital)
// ════════════════════════════════════════════════════════════════
// Uses Cadence/Tranche field markup: .field, .g2, .g3, .ssub.
// Each page render function reads from `inputs`, `unitMix`, `comps`
// and re-renders fully on any change. Autosave is debounced via
// onInputChange in core.js.
// ════════════════════════════════════════════════════════════════


// ── DEAL SETUP ────────────────────────────────────────────────
function renderDealSetupForm() {
  const wrap = $('section-setup-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">◈</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }
  const i = inputs;
  const mode = getDealMode();

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Deal Setup
        <span class="panel-sub">Property identity and strategy. Sets which engine runs.</span>
      </div>

      <div class="ssub">Property Identity</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Street address</label>
          <input value="${escapeHtml(i.property_address || '')}" oninput="onInputChange('property_address', this.value)"/></div>
        <div class="field"><label>City</label>
          <input value="${escapeHtml(i.city || '')}" oninput="onInputChange('city', this.value)"/></div>
        <div class="field"><label>State</label>
          <input maxlength="2" value="${escapeHtml(i.state || '')}" oninput="onInputChange('state', this.value.toUpperCase())"/></div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Zip code</label>
          <input maxlength="5" value="${escapeHtml(i.zip || '')}" oninput="onInputChange('zip', this.value)"/></div>
        <div class="field"><label>Asset type</label>
          <select onchange="onInputChange('asset_type', this.value)">
            <option value="single_family"          ${i.asset_type === 'single_family' ? 'selected' : ''}>Single Family</option>
            <option value="multifamily_2_4"        ${i.asset_type === 'multifamily_2_4' ? 'selected' : ''}>Multifamily (2-4)</option>
            <option value="commercial_multifamily" ${i.asset_type === 'commercial_multifamily' ? 'selected' : ''}>Commercial Multifamily (5+)</option>
            <option value="commercial"             ${i.asset_type === 'commercial' ? 'selected' : ''}>Commercial</option>
          </select>
          <div class="hint">Commercial uses col 3 of Cuyahoga tax table; others use col 2.</div>
        </div>
        <div class="field"><label>Subject area (SF)${mode === 'fix_and_flip' ? ' <span style="color:var(--bad)">*</span>' : ''}</label>
          <input type="number" value="${i.subject_area_sf ?? ''}" oninput="onInputChange('subject_area_sf', this.value)"/>
          ${mode === 'fix_and_flip' ? '<div class="hint">Required for F&amp;F: drives comp-based ARV.</div>' : ''}
        </div>
      </div>

      <div class="ssub">Strategy</div>
      ${mode === 'brrrr' ? `
        <div class="g3" style="margin-bottom:1rem">
          <div class="field"><label>Target refi timeline (months)</label>
            <input type="number" value="${i.target_refi_months ?? ''}" oninput="onInputChange('target_refi_months', this.value)"/></div>
          <div class="field"><label>Target hold period (years)</label>
            <input type="number" value="${i.target_hold_years ?? 10}" oninput="onInputChange('target_hold_years', this.value)"/></div>
          <div class="field"><label>Exit cap (refi valuation)</label>
            <input type="number" step="0.0001" value="${i.exit_cap ?? 0.0895}" oninput="onInputChange('exit_cap', this.value)"/>
            <div class="hint">Stabilized ARV = NOI / exit cap.</div></div>
        </div>
      ` : `
        <div class="g3" style="margin-bottom:1rem">
          <div class="field"><label>Target hold period (months)</label>
            <input type="number" value="${i.target_hold_months ?? ''}" oninput="onInputChange('target_hold_months', this.value)"/></div>
          <div class="field"><label>ARV override</label>
            <input type="number" value="${i.arv_override ?? ''}" oninput="onInputChange('arv_override', this.value)"
                   placeholder="Leave blank to use comps"/></div>
          <div></div>
        </div>
      `}

      ${mode === 'brrrr' ? `
        <div class="ssub">Tax Basis</div>
        <div class="g2" style="margin-bottom:1rem">
          <div class="field"><label>Property tax basis</label>
            <select onchange="onInputChange('tax_basis_mode', this.value)">
              <option value="stabilized_arv"  ${i.tax_basis_mode === 'stabilized_arv' ? 'selected' : ''}>Stabilized ARV (post-reassessment)</option>
              <option value="purchase_price"  ${i.tax_basis_mode === 'purchase_price' ? 'selected' : ''}>Purchase Price (legacy spreadsheet parity)</option>
            </select>
            <div class="hint">Default ARV is institutionally correct (county will reassess). Use Purchase Price only for parity with the legacy spreadsheet.</div>
          </div>
          <div class="field"><label>Tax district (Cuyahoga)</label>
            <input value="${escapeHtml(i.tax_district || '')}" placeholder="e.g. Cleveland, Garfield Heights"
                   oninput="onInputChange('tax_district', this.value)"/>
            <div class="hint">M4 will surface a dropdown.</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}


// ── UNIT MIX (BRRRR ONLY) ─────────────────────────────────────
function renderUnitMixBlock() {
  const wrap = $('section-unitmix-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">🏢</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }

  if (getDealMode() !== 'brrrr') {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">↔</div><div class="empty-title">Unit Mix is BRRRR-only</div><div style="font-size:11px;color:var(--text3);margin-top:6px">This deal is a Fix and Flip. Use the Comps page instead, or switch the deal to BRRRR mode in the top bar.</div></div></div>`;
    return;
  }

  if (!unitMix.length) {
    wrap.innerHTML = `
      <div class="panel">
        <div class="panel-title">Unit Mix &amp; Rent Roll
          <button class="btn btn-sm btn-gold" onclick="addUnitRow()">+ Add unit type</button>
        </div>
        <div class="empty">
          <div class="empty-icon">🏢</div>
          <div class="empty-title">No unit types entered</div>
          <button class="btn btn-gold" onclick="addUnitRow()" style="margin-top:1rem">+ Add unit type</button>
        </div>
      </div>`;
    return;
  }

  const totalUnits = unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0);
  const totalGpr   = unitMix.reduce((a, u) => a + (Number(u.count) || 0) * (Number(u.rent) || 0), 0);

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Unit Mix &amp; Rent Roll
        <button class="btn btn-sm btn-gold" onclick="addUnitRow()">+ Add unit type</button>
      </div>
      <table class="data">
        <thead>
          <tr>
            <th>Bed Type</th>
            <th class="num">Count</th>
            <th class="num">Monthly Rent</th>
            <th class="num">Monthly GPR</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${unitMix.map((u, idx) => `
            <tr>
              <td>
                <select onchange="updateUnitRow(${idx},'bed_type',this.value)">
                  <option value="studio" ${u.bed_type === 'studio' ? 'selected' : ''}>Studio</option>
                  <option value="1br" ${u.bed_type === '1br' ? 'selected' : ''}>1 Bedroom</option>
                  <option value="2br" ${u.bed_type === '2br' ? 'selected' : ''}>2 Bedroom</option>
                  <option value="3br" ${u.bed_type === '3br' ? 'selected' : ''}>3 Bedroom</option>
                  <option value="4br" ${u.bed_type === '4br' ? 'selected' : ''}>4 Bedroom</option>
                </select>
              </td>
              <td><input type="number" class="num" value="${u.count ?? 0}" oninput="updateUnitRow(${idx},'count',this.value)"/></td>
              <td><input type="number" class="num" value="${u.rent ?? 0}" oninput="updateUnitRow(${idx},'rent',this.value)"/></td>
              <td class="num">${(u.count && u.rent) ? f$(Number(u.count) * Number(u.rent)) : '-'}</td>
              <td><button class="btn btn-sm btn-bad" onclick="removeUnitRow(${idx})" title="Remove">×</button></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td class="num"><strong>${totalUnits}</strong></td>
            <td></td>
            <td class="num"><strong>${f$(totalGpr)}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="3" style="color:var(--text2);font-size:11px">Annual GPR (× 12)</td>
            <td class="num" style="color:var(--gold-lt)"><strong>${f$(totalGpr * 12)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function addUnitRow() {
  unitMix.push({ bed_type: '2br', count: 0, rent: 0 });
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

function updateUnitRow(idx, field, value) {
  if (!unitMix[idx]) return;
  if (field === 'count' || field === 'rent') {
    const n = Number(value);
    unitMix[idx][field] = isFinite(n) ? n : 0;
  } else {
    unitMix[idx][field] = value;
  }
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

function removeUnitRow(idx) {
  unitMix.splice(idx, 1);
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}


// ── COMPS (F&F ONLY) ──────────────────────────────────────────
function renderCompsBlock() {
  const wrap = $('section-comps-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">📊</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }

  if (getDealMode() !== 'fix_and_flip') {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">↔</div><div class="empty-title">Comps are Fix and Flip-only</div><div style="font-size:11px;color:var(--text3);margin-top:6px">This deal is a BRRRR. Use the Unit Mix page instead, or switch the deal to Fix &amp; Flip mode in the top bar.</div></div></div>`;
    return;
  }

  if (!comps.length) {
    wrap.innerHTML = `
      <div class="panel">
        <div class="panel-title">Comparable Sales
          <button class="btn btn-sm btn-gold" onclick="addCompRow()">+ Add comp</button>
        </div>
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No comps entered</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto">ARV will need a manual override until comps are added. The engine computes avg $/SF × subject area.</div>
          <button class="btn btn-gold" onclick="addCompRow()" style="margin-top:1rem">+ Add comp</button>
        </div>
      </div>`;
    return;
  }

  const validPrice = comps.filter(c => Number(c.sales_price) > 0);
  const validPsf   = comps.filter(c => Number(c.sales_price) > 0 && Number(c.area_sf) > 0);
  const validDom   = comps.filter(c => Number(c.dom) > 0);
  const avgPrice = validPrice.length ? validPrice.reduce((a, c) => a + Number(c.sales_price), 0) / validPrice.length : 0;
  const avgArea  = validPsf.length   ? validPsf.reduce((a, c) => a + Number(c.area_sf), 0)   / validPsf.length   : 0;
  const avgPsf   = avgArea > 0 ? avgPrice / avgArea : 0;
  const avgDom   = validDom.length ? validDom.reduce((a, c) => a + Number(c.dom), 0) / validDom.length : 0;
  const compArv  = avgPsf && inputs.subject_area_sf ? avgPsf * inputs.subject_area_sf : 0;

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Comparable Sales
        <button class="btn btn-sm btn-gold" onclick="addCompRow()">+ Add comp</button>
      </div>
      <table class="data">
        <thead>
          <tr>
            <th>Address</th>
            <th class="num">Sales Price</th>
            <th class="num">Area (SF)</th>
            <th class="num">$/SF</th>
            <th class="num">DOM</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${comps.map((c, idx) => `
            <tr>
              <td><input value="${escapeHtml(c.address || '')}" oninput="updateCompRow(${idx},'address',this.value)" placeholder="123 Main St"/></td>
              <td><input type="number" class="num" value="${c.sales_price ?? 0}" oninput="updateCompRow(${idx},'sales_price',this.value)"/></td>
              <td><input type="number" class="num" value="${c.area_sf ?? 0}" oninput="updateCompRow(${idx},'area_sf',this.value)"/></td>
              <td class="num">${(c.sales_price && c.area_sf) ? '$' + (Number(c.sales_price) / Number(c.area_sf)).toFixed(2) : '-'}</td>
              <td><input type="number" class="num" value="${c.dom ?? ''}" oninput="updateCompRow(${idx},'dom',this.value)"/></td>
              <td><button class="btn btn-sm btn-bad" onclick="removeCompRow(${idx})" title="Remove">×</button></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="comp-totals">
            <td><strong>Average</strong></td>
            <td class="num"><strong>${avgPrice ? f$(avgPrice) : '-'}</strong></td>
            <td class="num"><strong>${avgArea ? fN(avgArea) : '-'}</strong></td>
            <td class="num"><strong>${avgPsf ? '$' + avgPsf.toFixed(2) : '-'}</strong></td>
            <td class="num"><strong>${avgDom ? avgDom.toFixed(0) : '-'}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="3" style="color:var(--text2);font-size:11px">Comp-derived ARV (avg $/SF × subject area)</td>
            <td colspan="2" class="num" style="color:var(--gold-lt)"><strong>${compArv ? f$(compArv) : '-'}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div class="ssub" style="margin-top:1.5rem">ARV Override</div>
      <div class="field" style="max-width:320px">
        <label>Manual ARV (optional)</label>
        <input type="number" class="num" value="${inputs.arv_override ?? ''}"
               placeholder="${compArv ? 'Comp-derived: ' + f$(compArv) : 'Comp-derived ARV unavailable'}"
               oninput="onInputChange('arv_override', this.value)"/>
        <div class="hint">Leave blank to use comp-derived ARV.</div>
      </div>
    </div>
  `;
}

function addCompRow() {
  comps.push({ address: '', sales_price: 0, area_sf: 0, dom: null });
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

function updateCompRow(idx, field, value) {
  if (!comps[idx]) return;
  if (field === 'sales_price' || field === 'area_sf' || field === 'dom') {
    if (value === '' || value == null) {
      comps[idx][field] = field === 'dom' ? null : 0;
    } else {
      const n = Number(value);
      comps[idx][field] = isFinite(n) ? n : 0;
    }
  } else {
    comps[idx][field] = value;
  }
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

function removeCompRow(idx) {
  comps.splice(idx, 1);
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}


// ── OPERATING ASSUMPTIONS (BRRRR ONLY) ────────────────────────
function renderOperatingBlock() {
  const wrap = $('section-operating-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }
  if (getDealMode() !== 'brrrr') {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">↔</div><div class="empty-title">Operating assumptions are BRRRR-only</div><div style="font-size:11px;color:var(--text3);margin-top:6px">Fix &amp; Flip doesn't model stabilized operations.</div></div></div>`;
    return;
  }

  const i = inputs;
  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Operating Assumptions
        <span class="panel-sub">Vacancy and opex - applied to stabilized EGI.</span>
      </div>

      <div class="ssub">Income</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Vacancy %</label>
          <input type="number" step="0.001" class="num" value="${i.vacancy_pct ?? 0.05}" oninput="onInputChange('vacancy_pct', this.value)"/>
          <div class="hint">Default 0.05 (5%).</div></div>
        <div class="field"><label>Annual rent growth</label>
          <input type="number" step="0.001" class="num" value="${i.rent_growth_pct ?? 0.03}" oninput="onInputChange('rent_growth_pct', this.value)"/>
          <div class="hint">Default 3% - applied Y2 through hold.</div></div>
        <div></div>
      </div>

      <div class="ssub">Operating Expenses</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Property management %</label>
          <input type="number" step="0.001" class="num" value="${i.pm_pct ?? 0.07}" oninput="onInputChange('pm_pct', this.value)"/>
          <div class="hint">Default 7% of EGI.</div></div>
        <div class="field"><label>Maintenance &amp; turnover %</label>
          <input type="number" step="0.001" class="num" value="${i.maint_pct_of_egi ?? 0.055}" oninput="onInputChange('maint_pct_of_egi', this.value)"/>
          <div class="hint">Default 5.5% of EGI.</div></div>
        <div class="field"><label>Insurance %</label>
          <input type="number" step="0.001" class="num" value="${i.insurance_pct_of_egi ?? 0.08}" oninput="onInputChange('insurance_pct_of_egi', this.value)"/>
          <div class="hint">Default 8% of EGI.</div></div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Utilities %</label>
          <input type="number" step="0.001" class="num" value="${i.utilities_pct_of_egi ?? 0.02}" oninput="onInputChange('utilities_pct_of_egi', this.value)"/>
          <div class="hint">Default 2% of EGI.</div></div>
        <div class="field"><label>Reserves ($/unit/year)</label>
          <input type="number" class="num" value="${i.reserves_per_unit_year ?? 1000}" oninput="onInputChange('reserves_per_unit_year', this.value)"/>
          <div class="hint">Default $1,000/unit/year.</div></div>
        <div></div>
      </div>
    </div>
  `;
}


// ── CAPITAL STRUCTURE (BOTH MODES) ────────────────────────────
function renderCapitalBlock() {
  const wrap = $('section-capital-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">💰</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }
  const i = inputs;
  const mode = getDealMode();

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Capital Structure
        <span class="panel-sub">Acquisition, initial debt${mode === 'brrrr' ? ', refinance terms, exit' : ', disposition'}.</span>
      </div>

      <div class="ssub">Acquisition</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Purchase price</label>
          <input type="number" class="num" value="${i.purchase_price ?? 0}" oninput="onInputChange('purchase_price', this.value)"/></div>
        <div class="field"><label>Renovation budget</label>
          <input type="number" class="num" value="${i.reno_budget ?? 0}" oninput="onInputChange('reno_budget', this.value)"/></div>
        <div class="field"><label>Mobilization / contingency</label>
          <input type="number" class="num" value="${i.mobilization_contingency ?? 0}" oninput="onInputChange('mobilization_contingency', this.value)"/></div>
      </div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Consulting fees override</label>
          <input type="number" class="num" value="${i.consulting_fees_override ?? ''}" placeholder="Default: max($10k, 3% of acq+reno)" oninput="onInputChange('consulting_fees_override', this.value)"/></div>
        ${mode === 'brrrr' ? `
          <label class="field-cb" style="margin-top:1.4rem">
            <input type="checkbox" ${i.treat_mob_as_equity ? 'checked' : ''} onchange="onInputChange('treat_mob_as_equity', this.checked)"/>
            Count mobilization/contingency as initial investor equity
          </label>
        ` : '<div></div>'}
      </div>

      <div class="ssub">Initial Debt (Acquisition + Rehab Phase)</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>LTV on purchase</label>
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltv ?? 0.93}" oninput="onInputChange('initial_loan_ltv', this.value)"/>
          <div class="hint">Default 0.93 (93%).</div></div>
        <div class="field"><label>LTC on reno</label>
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltc_reno ?? 1.00}" oninput="onInputChange('initial_loan_ltc_reno', this.value)"/>
          <div class="hint">Default 1.00 (100%).</div></div>
        <div class="field"><label>Interest rate</label>
          <input type="number" step="0.001" class="num" value="${i.initial_rate ?? 0.127}" oninput="onInputChange('initial_rate', this.value)"/></div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Interest type</label>
          <select onchange="onInputChange('initial_interest_type', this.value)">
            <option value="IO" ${i.initial_interest_type === 'IO' ? 'selected' : ''}>IO</option>
            <option value="PI" ${i.initial_interest_type === 'PI' ? 'selected' : ''}>PI (30yr amort)</option>
          </select></div>
        <div class="field"><label>Closing cost baseline ($)</label>
          <input type="number" class="num" value="${i.closing_cost_baseline ?? 2444}" oninput="onInputChange('closing_cost_baseline', this.value)"/>
          <div class="hint">Cuyahoga title/escrow default $2,444.</div></div>
        <div class="field"><label>Closing cost % of loan</label>
          <input type="number" step="0.001" class="num" value="${i.closing_cost_loan_pct ?? 0.05}" oninput="onInputChange('closing_cost_loan_pct', this.value)"/>
          <div class="hint">Origination + points. Default 5%.</div></div>
      </div>

      ${mode === 'brrrr' ? `
      <div class="ssub">Refinance (Takeout)</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Target refi LTV</label>
          <input type="number" step="0.01" class="num" value="${i.target_refi_ltv ?? 0.75}" oninput="onInputChange('target_refi_ltv', this.value)"/></div>
        <div class="field"><label>Refi rate</label>
          <input type="number" step="0.001" class="num" value="${i.refi_rate ?? 0.075}" oninput="onInputChange('refi_rate', this.value)"/></div>
        <div class="field"><label>Refi interest type</label>
          <select onchange="onInputChange('refi_interest_type', this.value)">
            <option value="PI" ${i.refi_interest_type === 'PI' ? 'selected' : ''}>PI (30yr amort)</option>
            <option value="IO" ${i.refi_interest_type === 'IO' ? 'selected' : ''}>IO</option>
          </select></div>
      </div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Refi closing cost % of loan</label>
          <input type="number" step="0.001" class="num" value="${i.refi_closing_cost_pct ?? 0.04}" oninput="onInputChange('refi_closing_cost_pct', this.value)"/></div>
        <div class="field"><label>Investor ownership retained (%)</label>
          <input type="number" step="0.01" class="num" value="${i.investor_ownership ?? 0.5}" oninput="onInputChange('investor_ownership', this.value)"/>
          <div class="hint">LP share of post-refi cash flow.</div></div>
      </div>

      <div class="ssub">Exit (Year-${i.target_hold_years || 10} Disposition)</div>
      <div class="g2">
        <div class="field"><label>Annual appreciation</label>
          <input type="number" step="0.001" class="num" value="${i.appreciation_pct ?? 0.05}" oninput="onInputChange('appreciation_pct', this.value)"/>
          <div class="hint">Default 5% - applied to stabilized ARV through hold.</div></div>
        <div class="field"><label>Sale cost %</label>
          <input type="number" step="0.001" class="num" value="${i.sale_cost_pct ?? 0.07}" oninput="onInputChange('sale_cost_pct', this.value)"/>
          <div class="hint">Commission + closing. Default 7%.</div></div>
      </div>
      ` : `
      <div class="ssub">Disposition</div>
      <div class="g2">
        <div class="field"><label>Sale cost %</label>
          <input type="number" step="0.001" class="num" value="${i.sale_cost_pct ?? 0.07}" oninput="onInputChange('sale_cost_pct', this.value)"/>
          <div class="hint">Commission + closing. Default 7%.</div></div>
        <div class="field"><label>LP share of gross proceeds</label>
          <input type="number" step="0.01" class="num" value="${i.lp_gp_split_ff ?? 0.5}" oninput="onInputChange('lp_gp_split_ff', this.value)"/>
          <div class="hint">Spreadsheet hardcoded 50/50. Editable here.</div></div>
      </div>
      `}
    </div>
  `;
}
