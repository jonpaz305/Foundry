// ════════════════════════════════════════════════════════════════
// FOUNDRY - Data Entry (Setup, Unit Mix, Comps, Operating, Capital)
// ════════════════════════════════════════════════════════════════
// Uses Cadence/Tranche field markup: .field, .g2, .g3, .ssub.
// Comp grid renders as a table on desktop, stacked cards on mobile.
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
        <div class="field"><label>Subject area (SF) <span style="color:var(--bad)">*</span></label>
          <input type="number" value="${i.subject_area_sf ?? ''}" oninput="onInputChange('subject_area_sf', this.value)"/>
          <div class="hint">Required for comp-based valuation (avg $/SF × subject area).</div>
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
            <input list="cuyahoga-districts" value="${escapeHtml(i.tax_district || '')}" placeholder="e.g. Cleveland, Garfield Heights"
                   oninput="onInputChange('tax_district', this.value)"/>
            <datalist id="cuyahoga-districts">
              ${getCuyahogaDistrictList().map(d => `<option value="${escapeHtml(d)}"></option>`).join('')}
            </datalist>
            <div class="hint">Type to search; autocompletes from the Cuyahoga tax table.</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function getCuyahogaDistrictList() {
  if (typeof CUYAHOGA_TAX_RATES !== 'undefined') {
    return Object.keys(CUYAHOGA_TAX_RATES).sort();
  }
  return [];
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


// ── COMPS (BOTH MODES) ────────────────────────────────────────
function renderCompsBlock() {
  const wrap = $('section-comps-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">📊</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }

  const mode = getDealMode();
  const requiredCount = 3;

  if (!comps.length) {
    wrap.innerHTML = `
      <div class="panel">
        <div class="panel-title">Comparable Sales
          <button class="btn btn-sm btn-gold" onclick="addCompRow()">+ Add comp</button>
        </div>
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No comps entered</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto">
            ${mode === 'brrrr'
              ? 'BRRRR requires at least 3 sales comps to validate the refinance ARV. The engine computes avg $/SF × subject area as a corroborating value to the income-approach ARV.'
              : 'Fix and Flip requires comps to derive ARV. The engine computes avg $/SF × subject area.'}
          </div>
          <button class="btn btn-gold" onclick="addCompRow()" style="margin-top:1rem">+ Add comp</button>
        </div>
      </div>`;
    return;
  }

  const salesComps = comps.filter(c => (c.comp_type || 'sales') === 'sales' && Number(c.sales_price) > 0 && Number(c.area_sf) > 0);
  const renovated = salesComps.filter(c => !!c.renovated);
  const includeUnren = !!inputs.comp_avg_include_unrenovated;
  const useForAvg = includeUnren ? salesComps : (renovated.length > 0 ? renovated : salesComps);
  const avgPrice = useForAvg.length ? useForAvg.reduce((a, c) => a + Number(c.sales_price), 0) / useForAvg.length : 0;
  const avgArea  = useForAvg.length ? useForAvg.reduce((a, c) => a + Number(c.area_sf), 0) / useForAvg.length : 0;
  const avgPsf   = avgArea > 0 ? avgPrice / avgArea : 0;
  const validDom = useForAvg.filter(c => Number(c.dom) > 0);
  const avgDom   = validDom.length ? validDom.reduce((a, c) => a + Number(c.dom), 0) / validDom.length : 0;
  const compArv  = avgPsf && inputs.subject_area_sf ? avgPsf * inputs.subject_area_sf : 0;

  const countWarning = (mode === 'brrrr' && salesComps.length < requiredCount)
    ? `<div class="sbar s-warn" style="margin-bottom:1rem">BRRRR requires at least ${requiredCount} sales comps for refi validation. You have ${salesComps.length}.</div>`
    : '';

  const renovatedToggle = `
    <label class="field-cb" style="margin-bottom:1rem">
      <input type="checkbox" ${includeUnren ? 'checked' : ''} onchange="onInputChange('comp_avg_include_unrenovated', this.checked)"/>
      Include unrenovated comps in average ${renovated.length === 0 && salesComps.length > 0 ? '(no renovated comps; defaulting to all)' : ''}
    </label>
  `;

  const psfMethodToggle = mode === 'fix_and_flip' ? `
    <div class="field" style="margin-bottom:1rem;max-width:480px">
      <label>Avg $/SF calculation method</label>
      <select onchange="onInputChange('comp_avg_method', this.value)">
        <option value="institutional" ${(inputs.comp_avg_method || 'institutional') === 'institutional' ? 'selected' : ''}>Institutional: average of (price ÷ SF) per comp</option>
        <option value="spreadsheet"   ${inputs.comp_avg_method === 'spreadsheet' ? 'selected' : ''}>Spreadsheet parity: (Σ price) ÷ (Σ SF)</option>
      </select>
      <div class="hint">The spreadsheet's method understates $/SF when comp prices and sizes are uncorrelated. Default to institutional.</div>
    </div>
  ` : '';

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Comparable Sales
        <button class="btn btn-sm btn-gold" onclick="addCompRow()">+ Add comp</button>
      </div>
      ${countWarning}
      ${renovatedToggle}
      ${psfMethodToggle}

      <div class="comp-table-wrap">
        <table class="data comp-table-desktop">
          <thead>
            <tr>
              <th>Address</th>
              <th>Sale Date</th>
              <th class="num">Price</th>
              <th class="num">SF</th>
              <th class="num">$/SF</th>
              <th class="num">Bd</th>
              <th class="num">Ba</th>
              <th class="num">DOM</th>
              <th class="num">Dist</th>
              <th>Reno</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${comps.map((c, idx) => renderCompRowDesktop(c, idx)).join('')}
          </tbody>
          <tfoot>
            <tr class="comp-totals">
              <td><strong>Average</strong></td>
              <td></td>
              <td class="num"><strong>${avgPrice ? f$(avgPrice) : '-'}</strong></td>
              <td class="num"><strong>${avgArea ? fN(avgArea) : '-'}</strong></td>
              <td class="num"><strong>${avgPsf ? '$' + avgPsf.toFixed(2) : '-'}</strong></td>
              <td></td><td></td>
              <td class="num"><strong>${avgDom ? avgDom.toFixed(0) : '-'}</strong></td>
              <td></td><td></td><td></td><td></td>
            </tr>
            <tr>
              <td colspan="3" style="color:var(--text2);font-size:11px">Comp-derived ARV (avg $/SF × subject area)</td>
              <td colspan="9" class="num" style="color:var(--gold-lt)"><strong>${compArv ? f$(compArv) : '-'}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="comp-cards-mobile">
        ${comps.map((c, idx) => renderCompCardMobile(c, idx)).join('')}
        <div class="comp-summary-card">
          <div class="comp-summary-title">Average across ${useForAvg.length} comp${useForAvg.length === 1 ? '' : 's'}</div>
          <div class="comp-summary-row"><span>Avg price</span><strong>${avgPrice ? f$(avgPrice) : '-'}</strong></div>
          <div class="comp-summary-row"><span>Avg SF</span><strong>${avgArea ? fN(avgArea) : '-'}</strong></div>
          <div class="comp-summary-row"><span>Avg $/SF</span><strong>${avgPsf ? '$' + avgPsf.toFixed(2) : '-'}</strong></div>
          <div class="comp-summary-row"><span>Avg DOM</span><strong>${avgDom ? avgDom.toFixed(0) : '-'}</strong></div>
          <div class="comp-summary-row comp-summary-arv"><span>Comp ARV</span><strong>${compArv ? f$(compArv) : '-'}</strong></div>
        </div>
      </div>

      ${mode === 'brrrr' ? '' : `
        <div class="ssub" style="margin-top:1.5rem">ARV Override</div>
        <div class="field" style="max-width:320px">
          <label>Manual ARV (optional)</label>
          <input type="number" class="num" value="${inputs.arv_override ?? ''}"
                 placeholder="${compArv ? 'Comp-derived: ' + f$(compArv) : 'Comp-derived ARV unavailable'}"
                 oninput="onInputChange('arv_override', this.value)"/>
          <div class="hint">Leave blank to use comp-derived ARV.</div>
        </div>
      `}
    </div>
  `;
}

function renderCompRowDesktop(c, idx) {
  const psf = (c.sales_price && c.area_sf) ? (Number(c.sales_price) / Number(c.area_sf)) : null;
  const ageStale = compIsStale(c);
  const stalePill = ageStale ? ' <span class="comp-flag-pill" title="Sale older than 12 months">stale</span>' : '';
  return `
    <tr>
      <td><input value="${escapeHtml(c.address || '')}" oninput="updateCompRow(${idx},'address',this.value)" placeholder="123 Main St"/></td>
      <td><input type="date" value="${escapeHtml(c.sale_date || '')}" oninput="updateCompRow(${idx},'sale_date',this.value)"/>${stalePill}</td>
      <td><input type="number" class="num" value="${c.sales_price ?? 0}" oninput="updateCompRow(${idx},'sales_price',this.value)"/></td>
      <td><input type="number" class="num" value="${c.area_sf ?? 0}" oninput="updateCompRow(${idx},'area_sf',this.value)"/></td>
      <td class="num">${psf ? '$' + psf.toFixed(2) : '-'}</td>
      <td><input type="number" class="num" value="${c.bedrooms ?? ''}" oninput="updateCompRow(${idx},'bedrooms',this.value)"/></td>
      <td><input type="number" step="0.5" class="num" value="${c.bathrooms ?? ''}" oninput="updateCompRow(${idx},'bathrooms',this.value)"/></td>
      <td><input type="number" class="num" value="${c.dom ?? ''}" oninput="updateCompRow(${idx},'dom',this.value)"/></td>
      <td><input type="number" step="0.1" class="num" value="${c.distance_mi ?? ''}" oninput="updateCompRow(${idx},'distance_mi',this.value)"/></td>
      <td><input type="checkbox" ${c.renovated ? 'checked' : ''} onchange="updateCompRow(${idx},'renovated',this.checked)"/></td>
      <td>
        <select onchange="updateCompRow(${idx},'source',this.value)">
          <option value=""        ${!c.source ? 'selected' : ''}>-</option>
          <option value="MLS"     ${c.source === 'MLS' ? 'selected' : ''}>MLS</option>
          <option value="Zillow"  ${c.source === 'Zillow' ? 'selected' : ''}>Zillow</option>
          <option value="Redfin"  ${c.source === 'Redfin' ? 'selected' : ''}>Redfin</option>
          <option value="Broker"  ${c.source === 'Broker' ? 'selected' : ''}>Broker</option>
          <option value="Berea"   ${c.source === 'Berea' ? 'selected' : ''}>Berea</option>
          <option value="Other"   ${c.source === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </td>
      <td><button class="btn btn-sm btn-bad" onclick="removeCompRow(${idx})" title="Remove">×</button></td>
    </tr>
  `;
}

function renderCompCardMobile(c, idx) {
  const psf = (c.sales_price && c.area_sf) ? (Number(c.sales_price) / Number(c.area_sf)).toFixed(2) : null;
  const ageStale = compIsStale(c);
  const ageMonths = compAgeMonths(c);
  return `
    <div class="comp-card">
      <div class="comp-card-header">
        <div class="comp-card-num">Comp ${idx + 1}</div>
        <div style="display:flex;gap:6px;align-items:center">
          ${c.renovated ? '<span class="comp-flag-pill comp-flag-reno">renovated</span>' : ''}
          ${ageStale ? '<span class="comp-flag-pill">stale</span>' : ''}
          <button class="btn btn-sm btn-bad" onclick="removeCompRow(${idx})" title="Remove">×</button>
        </div>
      </div>
      <div class="field" style="margin-bottom:8px">
        <label>Address</label>
        <input value="${escapeHtml(c.address || '')}" oninput="updateCompRow(${idx},'address',this.value)" placeholder="123 Main St"/>
      </div>
      <div class="g2" style="margin-bottom:8px">
        <div class="field"><label>Sale date${ageMonths != null ? ` <span style="color:var(--text3);font-weight:400">(${ageMonths}mo ago)</span>` : ''}</label>
          <input type="date" value="${escapeHtml(c.sale_date || '')}" oninput="updateCompRow(${idx},'sale_date',this.value)"/></div>
        <div class="field"><label>Source</label>
          <select onchange="updateCompRow(${idx},'source',this.value)">
            <option value=""        ${!c.source ? 'selected' : ''}>-</option>
            <option value="MLS"     ${c.source === 'MLS' ? 'selected' : ''}>MLS</option>
            <option value="Zillow"  ${c.source === 'Zillow' ? 'selected' : ''}>Zillow</option>
            <option value="Redfin"  ${c.source === 'Redfin' ? 'selected' : ''}>Redfin</option>
            <option value="Broker"  ${c.source === 'Broker' ? 'selected' : ''}>Broker</option>
            <option value="Berea"   ${c.source === 'Berea' ? 'selected' : ''}>Berea</option>
            <option value="Other"   ${c.source === 'Other' ? 'selected' : ''}>Other</option>
          </select></div>
      </div>
      <div class="g2" style="margin-bottom:8px">
        <div class="field"><label>Sales price</label>
          <input type="number" class="num" value="${c.sales_price ?? 0}" oninput="updateCompRow(${idx},'sales_price',this.value)"/></div>
        <div class="field"><label>Area (SF)</label>
          <input type="number" class="num" value="${c.area_sf ?? 0}" oninput="updateCompRow(${idx},'area_sf',this.value)"/></div>
      </div>
      <div class="g3" style="margin-bottom:8px">
        <div class="field"><label>Bd</label>
          <input type="number" class="num" value="${c.bedrooms ?? ''}" oninput="updateCompRow(${idx},'bedrooms',this.value)"/></div>
        <div class="field"><label>Ba</label>
          <input type="number" step="0.5" class="num" value="${c.bathrooms ?? ''}" oninput="updateCompRow(${idx},'bathrooms',this.value)"/></div>
        <div class="field"><label>$/SF</label>
          <div style="padding:8px 11px;border:1px solid var(--border);background:var(--bg2);color:var(--gold-lt);border-radius:var(--r-sm);font-family:var(--fm);text-align:right">${psf ? '$' + psf : '-'}</div></div>
      </div>
      <div class="g3" style="margin-bottom:8px">
        <div class="field"><label>DOM</label>
          <input type="number" class="num" value="${c.dom ?? ''}" oninput="updateCompRow(${idx},'dom',this.value)"/></div>
        <div class="field"><label>Distance (mi)</label>
          <input type="number" step="0.1" class="num" value="${c.distance_mi ?? ''}" oninput="updateCompRow(${idx},'distance_mi',this.value)"/></div>
        <label class="field-cb" style="align-self:end">
          <input type="checkbox" ${c.renovated ? 'checked' : ''} onchange="updateCompRow(${idx},'renovated',this.checked)"/>
          Renovated
        </label>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Notes</label>
        <input value="${escapeHtml(c.notes || '')}" placeholder="One-line adjustments, condition, etc."
               oninput="updateCompRow(${idx},'notes',this.value)"/>
      </div>
    </div>
  `;
}

function compAgeMonths(c) {
  if (!c.sale_date) return null;
  const d = new Date(c.sale_date);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24 * 30.44));
}

function compIsStale(c) {
  const m = compAgeMonths(c);
  return m != null && m > 12;
}

function addCompRow() {
  comps.push({
    comp_type: 'sales',
    address: '',
    sale_date: '',
    sales_price: 0,
    area_sf: 0,
    bedrooms: null,
    bathrooms: null,
    dom: null,
    distance_mi: null,
    renovated: false,
    source: '',
    notes: ''
  });
  renderCompsBlock();
  autosave('comps');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

function updateCompRow(idx, field, value) {
  if (!comps[idx]) return;
  const numericFields = new Set(['sales_price','area_sf','dom','bedrooms','bathrooms','distance_mi']);
  if (numericFields.has(field)) {
    if (value === '' || value == null) {
      comps[idx][field] = (field === 'sales_price' || field === 'area_sf') ? 0 : null;
    } else {
      const n = Number(value);
      comps[idx][field] = isFinite(n) ? n : 0;
    }
  } else if (field === 'renovated') {
    comps[idx][field] = !!value;
  } else {
    comps[idx][field] = value;
  }
  if (numericFields.has(field) || field === 'renovated' || field === 'sale_date') {
    renderCompsBlock();
  }
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
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">↔</div><div class="empty-title">Operating assumptions are BRRRR-only</div><div style="font-size:11px;color:var(--text3);margin-top:6px">Fix and Flip doesn't model stabilized operations.</div></div></div>`;
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
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltv ?? (mode === 'brrrr' ? 0.93 : 0.90)}" oninput="onInputChange('initial_loan_ltv', this.value)"/>
          <div class="hint">Default ${mode === 'brrrr' ? '0.93 (93%) for BRRRR HML' : '0.90 (90%) for F&F HML'}.</div></div>
        ${mode === 'brrrr' ? `
        <div class="field"><label>LTC on reno</label>
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltc_reno ?? 1.00}" oninput="onInputChange('initial_loan_ltc_reno', this.value)"/>
          <div class="hint">Default 1.00 (100% reno funded via draws).</div></div>
        ` : `
        <div class="field"><label>Reno funding</label>
          <div style="padding:8px 11px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);border-radius:var(--r-sm);font-size:12px">100% via lender draws</div>
          <div class="hint">F&F template assumes full reno funding by HML.</div></div>
        `}
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
          <input type="number" step="0.001" class="num" value="${i.closing_cost_loan_pct ?? 0.045}" oninput="onInputChange('closing_cost_loan_pct', this.value)"/>
          <div class="hint">Origination 2.5% + points 2%. Default 4.5%.</div></div>
      </div>
      ${mode === 'brrrr' ? `
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Transfer tax add-on ($)</label>
          <input type="number" class="num" value="${i.closing_cost_transfer_addon ?? 2400}" oninput="onInputChange('closing_cost_transfer_addon', this.value)"/>
          <div class="hint">Cuyahoga multifamily transfer fees. Default $2,400.</div></div>
        <div></div>
      </div>
      ` : ''}

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
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Total units</label>
          <input type="number" class="num" value="${i.total_units_ff ?? 1}" oninput="onInputChange('total_units_ff', this.value)"/>
          <div class="hint">Most F&F deals are single-unit (1).</div></div>
        <div class="field"><label>Sale cost %</label>
          <input type="number" step="0.001" class="num" value="${i.sale_cost_pct ?? 0.07}" oninput="onInputChange('sale_cost_pct', this.value)"/>
          <div class="hint">Commission + closing. Default 7%.</div></div>
        <div class="field"><label>LP share of gross proceeds</label>
          <input type="number" step="0.01" class="num" value="${i.lp_gp_split_ff ?? 0.5}" oninput="onInputChange('lp_gp_split_ff', this.value)"/>
          <div class="hint">Spreadsheet hardcoded 50/50. Editable here.</div></div>
      </div>
      <div class="g2">
        <div class="field"><label>Investor equity method</label>
          <select onchange="onInputChange('equity_method_ff', this.value)">
            <option value="spreadsheet"     ${(i.equity_method_ff || 'spreadsheet') === 'spreadsheet' ? 'selected' : ''}>Spreadsheet parity (purchase × 7% + closing + consulting + DS)</option>
            <option value="institutional"   ${i.equity_method_ff === 'institutional' ? 'selected' : ''}>Institutional (TPC − initial loan)</option>
          </select>
          <div class="hint">Spreadsheet method hardcodes 7% down regardless of LTV. Institutional method counts actual cash outlay.</div>
        </div>
        <div></div>
      </div>
      `}
    </div>
  `;
}
