// ════════════════════════════════════════════════════════════════
// FOUNDRY — Data Entry (Deal Setup, Unit Mix, Comps, Inputs)
// ════════════════════════════════════════════════════════════════
//
// Renders mode-aware input forms. Sections wired in M1:
//   - Deal Setup (mode-aware property + strategy fields)
//   - Unit Mix (BRRRR only)
//   - Comps (F&F only)
//   - Operating Assumptions (BRRRR only — opex %, vacancy, reserves)
//   - Capital Structure (both modes — purchase, reno, loan terms,
//     refi terms for BRRRR, hold for F&F)
//
// Pattern: each input wires to onInputChange(field, value) which
// commits state, debounces autosave, and triggers recompute().
// ════════════════════════════════════════════════════════════════


// ── DEAL SETUP FORM ─────────────────────────────────────────────
function renderDealSetupForm() {
  const wrap = $('section-setup-body');
  if (!wrap || !currentDeal) return;

  const mode = getDealMode();
  const i = inputs;

  wrap.innerHTML = `
    <div class="form-grid">
      <!-- ── PROPERTY ── -->
      <div class="form-group form-group-wide">
        <div class="form-group-title">Property</div>
        <div class="form-row">
          <label>Property Address</label>
          <input type="text" value="${escapeHtml(i.property_address || '')}"
                 oninput="onInputChange('property_address', this.value)" />
        </div>
        <div class="form-row form-row-3col">
          <div>
            <label>City</label>
            <input type="text" value="${escapeHtml(i.city || '')}"
                   oninput="onInputChange('city', this.value)" />
          </div>
          <div>
            <label>State</label>
            <input type="text" value="${escapeHtml(i.state || '')}" maxlength="2"
                   oninput="onInputChange('state', this.value.toUpperCase())" />
          </div>
          <div>
            <label>Zip</label>
            <input type="text" value="${escapeHtml(i.zip || '')}" maxlength="5"
                   oninput="onInputChange('zip', this.value)" />
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Asset Type</label>
            <select onchange="onInputChange('asset_type', this.value)">
              <option value="single_family"          ${i.asset_type === 'single_family' ? 'selected' : ''}>Single Family</option>
              <option value="multifamily_2_4"        ${i.asset_type === 'multifamily_2_4' ? 'selected' : ''}>Multifamily (2-4)</option>
              <option value="commercial_multifamily" ${i.asset_type === 'commercial_multifamily' ? 'selected' : ''}>Commercial Multifamily (5+)</option>
              <option value="commercial"             ${i.asset_type === 'commercial' ? 'selected' : ''}>Commercial</option>
            </select>
            <div class="form-hint">Commercial uses col 3 of Cuyahoga tax table; others use col 2.</div>
          </div>
          <div>
            <label>Subject Area (SF) ${mode === 'fix_and_flip' ? '<span class="req">*</span>' : ''}</label>
            <input type="number" step="1" value="${i.subject_area_sf ?? ''}"
                   oninput="onInputChange('subject_area_sf', this.value)" />
            ${mode === 'fix_and_flip' ? '<div class="form-hint">Required — drives comp-based ARV.</div>' : ''}
          </div>
        </div>
      </div>

      <!-- ── STRATEGY ── -->
      <div class="form-group">
        <div class="form-group-title">Strategy</div>
        <div class="form-row">
          <label>Deal Mode</label>
          <div class="mode-switch">
            <button class="mode-switch-btn ${mode === 'brrrr' ? 'active' : ''}"
                    onclick="switchDealMode('brrrr')">BRRRR</button>
            <button class="mode-switch-btn ${mode === 'fix_and_flip' ? 'active' : ''}"
                    onclick="switchDealMode('fix_and_flip')">Fix &amp; Flip</button>
          </div>
        </div>

        ${mode === 'brrrr' ? `
          <div class="form-row form-row-2col">
            <div>
              <label>Target Refi Timeline (Months)</label>
              <input type="number" step="1" value="${i.target_refi_months ?? ''}"
                     oninput="onInputChange('target_refi_months', this.value)" />
            </div>
            <div>
              <label>Target Hold Period (Years)</label>
              <input type="number" step="1" value="${i.target_hold_years ?? 10}"
                     oninput="onInputChange('target_hold_years', this.value)" />
            </div>
          </div>
        ` : `
          <div class="form-row">
            <label>Target Hold Period (Months)</label>
            <input type="number" step="1" value="${i.target_hold_months ?? ''}"
                   oninput="onInputChange('target_hold_months', this.value)" />
          </div>
        `}
      </div>

      <!-- ── TAX BASIS TOGGLE (BRRRR-relevant; preserve override) ── -->
      <div class="form-group" data-mode="brrrr">
        <div class="form-group-title">Tax Basis</div>
        <div class="form-row">
          <label>Property Tax Basis</label>
          <select onchange="onInputChange('tax_basis_mode', this.value)">
            <option value="stabilized_arv"  ${i.tax_basis_mode === 'stabilized_arv' ? 'selected' : ''}>Stabilized ARV (post-reassessment)</option>
            <option value="purchase_price"  ${i.tax_basis_mode === 'purchase_price' ? 'selected' : ''}>Purchase Price (legacy parity)</option>
          </select>
          <div class="form-hint">
            Default: ARV — the institutionally-correct assumption (county will reassess).
            Switch to "Purchase Price" only for parity with legacy spreadsheet output.
          </div>
        </div>
        <div class="form-row">
          <label>Tax District (Cuyahoga)</label>
          <input type="text" value="${escapeHtml(i.tax_district || '')}"
                 placeholder="e.g. Cleveland, Garfield Heights, Shaker Heights"
                 oninput="onInputChange('tax_district', this.value)" />
          <div class="form-hint">Drives the Cuyahoga millage lookup. M4 will surface a dropdown.</div>
        </div>
      </div>
    </div>
  `;

  renderUnitMixBlock();
  renderCompsBlock();
  renderCapitalBlock();
  renderOperatingBlock();

  // Apply current mode visibility to whatever data-mode tagged elements
  // just rendered inside the section.
  applyModeToUI();
}


// ── UNIT MIX (BRRRR ONLY) ───────────────────────────────────────
function renderUnitMixBlock() {
  const wrap = $('section-unit-mix-body');
  if (!wrap) return;

  if (!unitMix.length) {
    wrap.innerHTML = `
      <div class="empty-block">
        <div class="empty-msg">No unit types entered yet.</div>
        <button class="btn-primary" onclick="addUnitRow()">+ Add unit type</button>
      </div>
    `;
    return;
  }

  const rows = unitMix.map((u, idx) => `
    <tr>
      <td>
        <select onchange="updateUnitRow(${idx}, 'bed_type', this.value)">
          <option value="studio"   ${u.bed_type === 'studio' ? 'selected' : ''}>Studio</option>
          <option value="1br"      ${u.bed_type === '1br'    ? 'selected' : ''}>1 Bedroom</option>
          <option value="2br"      ${u.bed_type === '2br'    ? 'selected' : ''}>2 Bedroom</option>
          <option value="3br"      ${u.bed_type === '3br'    ? 'selected' : ''}>3 Bedroom</option>
          <option value="4br"      ${u.bed_type === '4br'    ? 'selected' : ''}>4 Bedroom</option>
        </select>
      </td>
      <td><input type="number" step="1" value="${u.count ?? 0}"
                 oninput="updateUnitRow(${idx}, 'count', this.value)" class="num-input" /></td>
      <td><input type="number" step="1" value="${u.rent ?? 0}"
                 oninput="updateUnitRow(${idx}, 'rent', this.value)" class="num-input" /></td>
      <td class="num-cell">${u.count && u.rent ? f$(Number(u.count) * Number(u.rent)) : '—'}</td>
      <td><button class="btn-icon-del" onclick="removeUnitRow(${idx})" title="Remove">×</button></td>
    </tr>
  `).join('');

  const totalUnits = unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0);
  const totalGpr   = unitMix.reduce((a, u) => a + (Number(u.count) || 0) * (Number(u.rent) || 0), 0);

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Bed Type</th>
          <th class="num-cell">Count</th>
          <th class="num-cell">Monthly Rent</th>
          <th class="num-cell">Monthly GPR</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td><strong>Total</strong></td>
          <td class="num-cell"><strong>${totalUnits}</strong></td>
          <td></td>
          <td class="num-cell"><strong>${f$(totalGpr)}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:12px"><button class="btn-primary" onclick="addUnitRow()">+ Add unit type</button></div>
  `;
}

function addUnitRow() {
  unitMix.push({ bed_type: '2br', count: 0, rent: 0 });
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}

function updateUnitRow(idx, field, value) {
  if (!unitMix[idx]) return;
  if (field === 'count' || field === 'rent') {
    const n = Number(value);
    unitMix[idx][field] = isFinite(n) ? n : 0;
  } else {
    unitMix[idx][field] = value;
  }
  // Re-render only the totals row (cheap: redraw the whole block)
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}

function removeUnitRow(idx) {
  unitMix.splice(idx, 1);
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}


// ── COMPS (F&F ONLY) ────────────────────────────────────────────
function renderCompsBlock() {
  const wrap = $('section-comps-body');
  if (!wrap) return;

  if (!comps.length) {
    wrap.innerHTML = `
      <div class="empty-block">
        <div class="empty-msg">No comps entered yet. ARV will need a manual override until comps are added.</div>
        <button class="btn-primary" onclick="addCompRow()">+ Add comp</button>
      </div>
    `;
    return;
  }

  const rows = comps.map((c, idx) => `
    <tr>
      <td><input type="text" value="${escapeHtml(c.address || '')}"
                 oninput="updateCompRow(${idx}, 'address', this.value)" /></td>
      <td><input type="number" step="1" value="${c.sales_price ?? 0}"
                 oninput="updateCompRow(${idx}, 'sales_price', this.value)" class="num-input" /></td>
      <td><input type="number" step="1" value="${c.area_sf ?? 0}"
                 oninput="updateCompRow(${idx}, 'area_sf', this.value)" class="num-input" /></td>
      <td class="num-cell">${c.sales_price && c.area_sf ? '$' + (Number(c.sales_price) / Number(c.area_sf)).toFixed(2) : '—'}</td>
      <td><input type="number" step="1" value="${c.dom ?? ''}"
                 oninput="updateCompRow(${idx}, 'dom', this.value)" class="num-input" /></td>
      <td><button class="btn-icon-del" onclick="removeCompRow(${idx})" title="Remove">×</button></td>
    </tr>
  `).join('');

  // Averages — only over comps with data
  const validForPrice = comps.filter(c => Number(c.sales_price) > 0);
  const validForPsf   = comps.filter(c => Number(c.sales_price) > 0 && Number(c.area_sf) > 0);
  const validForDom   = comps.filter(c => Number(c.dom) > 0);
  const avgPrice  = validForPrice.length ? validForPrice.reduce((a, c) => a + Number(c.sales_price), 0) / validForPrice.length : 0;
  const avgArea   = validForPsf.length   ? validForPsf.reduce((a, c) => a + Number(c.area_sf), 0)   / validForPsf.length : 0;
  const avgPsf    = avgArea > 0 ? avgPrice / avgArea : 0;
  const avgDom    = validForDom.length ? validForDom.reduce((a, c) => a + Number(c.dom), 0) / validForDom.length : 0;

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Address</th>
          <th class="num-cell">Sales Price</th>
          <th class="num-cell">Area (SF)</th>
          <th class="num-cell">$/SF</th>
          <th class="num-cell">DOM</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td><strong>Average</strong></td>
          <td class="num-cell"><strong>${avgPrice ? f$(avgPrice) : '—'}</strong></td>
          <td class="num-cell"><strong>${avgArea ? fN(avgArea) : '—'}</strong></td>
          <td class="num-cell"><strong>${avgPsf ? '$' + avgPsf.toFixed(2) : '—'}</strong></td>
          <td class="num-cell"><strong>${avgDom ? avgDom.toFixed(0) : '—'}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:12px">
      <button class="btn-primary" onclick="addCompRow()">+ Add comp</button>
    </div>
    <div class="form-row" style="margin-top:18px">
      <label>ARV Override (optional)</label>
      <input type="number" step="1" value="${inputs.arv_override ?? ''}"
             placeholder="${avgPsf && inputs.subject_area_sf ? 'Comp-derived: ' + f$(avgPsf * inputs.subject_area_sf) : 'Enter $/SF and subject area for default'}"
             oninput="onInputChange('arv_override', this.value)" />
      <div class="form-hint">Leave blank to use comp-derived ARV (avg $/SF × subject area).</div>
    </div>
  `;
}

function addCompRow() {
  comps.push({ address: '', sales_price: 0, area_sf: 0, dom: null });
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}

function updateCompRow(idx, field, value) {
  if (!comps[idx]) return;
  if (field === 'sales_price' || field === 'area_sf' || field === 'dom') {
    if (value === '' || value === null) {
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
  renderDashboard();
}

function removeCompRow(idx) {
  comps.splice(idx, 1);
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  renderDashboard();
}


// ── CAPITAL STRUCTURE BLOCK (both modes) ───────────────────────
function renderCapitalBlock() {
  const wrap = $('section-capital-body');
  if (!wrap) return;
  const i = inputs;
  const mode = getDealMode();

  wrap.innerHTML = `
    <div class="form-grid">

      <!-- ── ACQUISITION ── -->
      <div class="form-group">
        <div class="form-group-title">Acquisition</div>
        <div class="form-row"><label>Purchase Price</label>
          <input type="number" step="1" value="${i.purchase_price ?? 0}"
                 oninput="onInputChange('purchase_price', this.value)" />
        </div>
        <div class="form-row"><label>Renovation Budget</label>
          <input type="number" step="1" value="${i.reno_budget ?? 0}"
                 oninput="onInputChange('reno_budget', this.value)" />
        </div>
        <div class="form-row"><label>Mobilization / Contingency</label>
          <input type="number" step="1" value="${i.mobilization_contingency ?? 0}"
                 oninput="onInputChange('mobilization_contingency', this.value)" />
        </div>
        <div class="form-row" data-mode="brrrr"><label class="cb-label">
          <input type="checkbox" ${i.treat_mob_as_equity ? 'checked' : ''}
                 onchange="onInputChange('treat_mob_as_equity', this.checked)" />
          Count mobilization/contingency toward initial investor equity
        </label>
          <div class="form-hint">Default off — spreadsheet excludes mob/conting from initial equity (assumed drawn back).</div>
        </div>
        <div class="form-row"><label>Consulting Fees Override</label>
          <input type="number" step="1" value="${i.consulting_fees_override ?? ''}"
                 placeholder="Default: max($10k, 3% of acq+reno)"
                 oninput="onInputChange('consulting_fees_override', this.value)" />
        </div>
      </div>

      <!-- ── INITIAL DEBT ── -->
      <div class="form-group">
        <div class="form-group-title">Initial Debt (Acq + Rehab Phase)</div>
        <div class="form-row form-row-2col">
          <div>
            <label>LTV on Purchase</label>
            <input type="number" step="0.01" value="${i.initial_loan_ltv ?? 0.93}"
                   oninput="onInputChange('initial_loan_ltv', this.value)" />
            <div class="form-hint">Default 0.93 (93%)</div>
          </div>
          <div>
            <label>LTC on Reno</label>
            <input type="number" step="0.01" value="${i.initial_loan_ltc_reno ?? 1.00}"
                   oninput="onInputChange('initial_loan_ltc_reno', this.value)" />
            <div class="form-hint">Default 1.00 (100%)</div>
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Interest Rate</label>
            <input type="number" step="0.001" value="${i.initial_rate ?? 0.127}"
                   oninput="onInputChange('initial_rate', this.value)" />
          </div>
          <div>
            <label>Interest Type</label>
            <select onchange="onInputChange('initial_interest_type', this.value)">
              <option value="IO" ${i.initial_interest_type === 'IO' ? 'selected' : ''}>IO</option>
              <option value="PI" ${i.initial_interest_type === 'PI' ? 'selected' : ''}>PI (30yr amort)</option>
            </select>
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Closing Cost Baseline ($)</label>
            <input type="number" step="1" value="${i.closing_cost_baseline ?? 2444}"
                   oninput="onInputChange('closing_cost_baseline', this.value)" />
            <div class="form-hint">Title, escrow, etc. Cuyahoga default $2,444.</div>
          </div>
          <div>
            <label>Closing Cost % of Loan</label>
            <input type="number" step="0.001" value="${i.closing_cost_loan_pct ?? 0.05}"
                   oninput="onInputChange('closing_cost_loan_pct', this.value)" />
            <div class="form-hint">Origination + points. Default 0.05 (5%).</div>
          </div>
        </div>
      </div>

      ${mode === 'brrrr' ? `
      <!-- ── REFINANCE (BRRRR only) ── -->
      <div class="form-group" data-mode="brrrr">
        <div class="form-group-title">Refinance (Takeout)</div>
        <div class="form-row form-row-2col">
          <div>
            <label>Target Refi LTV</label>
            <input type="number" step="0.01" value="${i.target_refi_ltv ?? 0.75}"
                   oninput="onInputChange('target_refi_ltv', this.value)" />
          </div>
          <div>
            <label>Refi Closing Cost % of Loan</label>
            <input type="number" step="0.01" value="${i.refi_closing_cost_pct ?? 0.04}"
                   oninput="onInputChange('refi_closing_cost_pct', this.value)" />
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Refi Rate</label>
            <input type="number" step="0.001" value="${i.refi_rate ?? 0.075}"
                   oninput="onInputChange('refi_rate', this.value)" />
          </div>
          <div>
            <label>Refi Interest Type</label>
            <select onchange="onInputChange('refi_interest_type', this.value)">
              <option value="PI" ${i.refi_interest_type === 'PI' ? 'selected' : ''}>PI (30yr amort)</option>
              <option value="IO" ${i.refi_interest_type === 'IO' ? 'selected' : ''}>IO</option>
            </select>
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Exit Cap (Refi Valuation)</label>
            <input type="number" step="0.0001" value="${i.exit_cap ?? 0.0895}"
                   oninput="onInputChange('exit_cap', this.value)" />
            <div class="form-hint">Drives stabilized ARV = NOI / exit_cap.</div>
          </div>
          <div>
            <label>Investor Ownership Retained (%)</label>
            <input type="number" step="0.01" value="${i.investor_ownership ?? 0.5}"
                   oninput="onInputChange('investor_ownership', this.value)" />
            <div class="form-hint">LP share of post-refi cash flow.</div>
          </div>
        </div>
      </div>

      <!-- ── EXIT (BRRRR — Year-10 disposition) ── -->
      <div class="form-group" data-mode="brrrr">
        <div class="form-group-title">Exit (Year-${i.target_hold_years || 10} Disposition)</div>
        <div class="form-row form-row-2col">
          <div>
            <label>Annual Appreciation</label>
            <input type="number" step="0.001" value="${i.appreciation_pct ?? 0.05}"
                   oninput="onInputChange('appreciation_pct', this.value)" />
            <div class="form-hint">Default 5% — applied to stabilized ARV through hold.</div>
          </div>
          <div>
            <label>Sale Cost %</label>
            <input type="number" step="0.001" value="${i.sale_cost_pct ?? 0.07}"
                   oninput="onInputChange('sale_cost_pct', this.value)" />
            <div class="form-hint">Default 7% — commission + closing.</div>
          </div>
        </div>
        <div class="form-row">
          <label>Annual Rent Growth (Proforma)</label>
          <input type="number" step="0.001" value="${i.rent_growth_pct ?? 0.03}"
                 oninput="onInputChange('rent_growth_pct', this.value)" />
          <div class="form-hint">Default 3% — applied to cash flow Y2-Y${i.target_hold_years || 10}.</div>
        </div>
      </div>
      ` : `
      <!-- ── EXIT (F&F — disposition split) ── -->
      <div class="form-group" data-mode="fix_and_flip">
        <div class="form-group-title">Disposition</div>
        <div class="form-row">
          <label>Sale Cost %</label>
          <input type="number" step="0.001" value="${i.sale_cost_pct ?? 0.07}"
                 oninput="onInputChange('sale_cost_pct', this.value)" />
          <div class="form-hint">Default 7% — commission + closing.</div>
        </div>
        <div class="form-row">
          <label>LP Share of Gross Proceeds</label>
          <input type="number" step="0.01" value="${i.lp_gp_split_ff ?? 0.5}"
                 oninput="onInputChange('lp_gp_split_ff', this.value)" />
          <div class="form-hint">Spreadsheet hardcoded 50/50. Adjust as needed.</div>
        </div>
      </div>
      `}
    </div>
  `;
}


// ── OPERATING ASSUMPTIONS (BRRRR ONLY) ─────────────────────────
function renderOperatingBlock() {
  const wrap = $('section-operating-body');
  if (!wrap) return;
  const i = inputs;

  wrap.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <div class="form-group-title">Income</div>
        <div class="form-row">
          <label>Vacancy %</label>
          <input type="number" step="0.001" value="${i.vacancy_pct ?? 0.05}"
                 oninput="onInputChange('vacancy_pct', this.value)" />
          <div class="form-hint">Default 5%.</div>
        </div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Operating Expenses (as % of EGI unless noted)</div>
        <div class="form-row form-row-2col">
          <div>
            <label>Property Management</label>
            <input type="number" step="0.001" value="${i.pm_pct ?? 0.07}"
                   oninput="onInputChange('pm_pct', this.value)" />
            <div class="form-hint">Default 7%.</div>
          </div>
          <div>
            <label>Maintenance &amp; Turnover</label>
            <input type="number" step="0.001" value="${i.maint_pct_of_egi ?? 0.055}"
                   oninput="onInputChange('maint_pct_of_egi', this.value)" />
            <div class="form-hint">Default 5.5%.</div>
          </div>
        </div>
        <div class="form-row form-row-2col">
          <div>
            <label>Insurance</label>
            <input type="number" step="0.001" value="${i.insurance_pct_of_egi ?? 0.08}"
                   oninput="onInputChange('insurance_pct_of_egi', this.value)" />
            <div class="form-hint">Default 8% of EGI.</div>
          </div>
          <div>
            <label>Utilities</label>
            <input type="number" step="0.001" value="${i.utilities_pct_of_egi ?? 0.02}"
                   oninput="onInputChange('utilities_pct_of_egi', this.value)" />
            <div class="form-hint">Default 2% of EGI.</div>
          </div>
        </div>
        <div class="form-row">
          <label>Reserves ($/unit/year)</label>
          <input type="number" step="1" value="${i.reserves_per_unit_year ?? 1000}"
                 oninput="onInputChange('reserves_per_unit_year', this.value)" />
          <div class="form-hint">Default $1,000/unit/year.</div>
        </div>
      </div>
    </div>
  `;
}
