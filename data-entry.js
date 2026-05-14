// ════════════════════════════════════════════════════════════════
// FOUNDRY - Data Entry (Setup, Unit Mix, Comps, Operating, Capital)
// ════════════════════════════════════════════════════════════════
// Uses Cadence/Tranche field markup: .field, .g2, .g3, .ssub.
// Comp grid renders as a table on desktop, stacked cards on mobile.
// ════════════════════════════════════════════════════════════════


// Path C: ARV source selector. Renders dropdown + override field +
// comp count warning + implied cap display. Reads inputs and R for
// state, comps array for the <3-comp warning. Pure renderer; all
// side effects flow through onInputChange like every other field.
function _renderArvSourceSection(i, R, compsArr) {
  const src = i.arv_source || 'income_approach';
  const f$ = (x) => x == null || !isFinite(x) ? '-' : '$' + Math.round(Number(x)).toLocaleString();
  const fPct = (x, dec) => x == null || !isFinite(x) ? '-' : (Number(x) * 100).toFixed(dec == null ? 2 : dec) + '%';

  // Comp count for the warning
  const salesComps = (compsArr || []).filter(c =>
    (c.comp_type || 'sales') === 'sales' &&
    Number(c.sales_price) > 0 && Number(c.area_sf) > 0);
  const compCount = salesComps.length;
  const compsBelowMin = compCount < 3;

  // Compute the comp-derived ARV preview ($/SF * subject SF). Mirror the
  // engine's logic so the user sees the same number that will be applied.
  const subjSf = Number(i.subject_area_sf) || 0;
  const renovated = salesComps.filter(c => !!c.renovated);
  const useForAvg = i.comp_avg_include_unrenovated
    ? salesComps
    : (renovated.length > 0 ? renovated : salesComps);
  let compAvgPsf = null;
  if (useForAvg.length > 0) {
    const sumPsf = useForAvg.reduce((a, c) => a + Number(c.sales_price) / Number(c.area_sf), 0);
    compAvgPsf = sumPsf / useForAvg.length;
  }
  const compDerivedArv = (compAvgPsf != null && subjSf > 0) ? compAvgPsf * subjSf : null;

  // Values to surface in the display row beneath the selector
  const arvInUse = R.stabilized_arv;
  const incomeArv = R.stabilized_arv_income_approach;
  const impliedCap = R.implied_cap_rate;
  const overrideVal = i.arv_override_brrrr;

  // Source-specific helper text
  let sourceHint = '';
  if (src === 'income_approach') {
    sourceHint = 'Default. ARV = stabilized NOI ÷ exit cap. The institutional standard for stabilized income-producing assets.';
  } else if (src === 'comp_derived') {
    sourceHint = `ARV = average $/SF from your sales comps × subject area (${subjSf > 0 ? subjSf.toLocaleString() + ' SF' : 'subject area not set'}). Currently using ${useForAvg.length} of ${compCount} sales comps.`;
  } else if (src === 'manual_override') {
    sourceHint = 'ARV is set manually based on sponsor judgment. The implied cap rate is shown below for institutional defensibility.';
  }

  // Implied cap line (only when source != income_approach)
  const showImplied = (src !== 'income_approach');

  return `
    <div class="ssub" style="margin-top:0.5rem">ARV Source</div>
    <div class="g3" style="margin-bottom:0.5rem">
      <div class="field"><label>ARV source</label>
        <select onchange="onInputChange('arv_source', this.value)">
          <option value="income_approach"  ${src === 'income_approach' ? 'selected' : ''}>Income approach (NOI ÷ cap)</option>
          <option value="comp_derived"     ${src === 'comp_derived' ? 'selected' : ''}>Comp-derived ($/SF × subject SF)</option>
          <option value="manual_override"  ${src === 'manual_override' ? 'selected' : ''}>Manual override (sponsor judgment)</option>
        </select>
        <div class="hint">${sourceHint}</div>
      </div>
      ${src === 'manual_override' ? `
        <div class="field"><label>Manual ARV ($)</label>
          <input type="number" class="num" value="${overrideVal ?? ''}"
                 placeholder="Enter ARV"
                 oninput="onInputChange('arv_override_brrrr', this.value)"/>
          <div class="hint">Enter the stabilized ARV based on your underwriting judgment. Reports will disclose the override.</div>
        </div>
      ` : src === 'comp_derived' ? `
        <div class="field"><label>Comp-derived ARV (preview)</label>
          <input type="text" class="num" value="${compDerivedArv != null ? f$(compDerivedArv) : 'No comps / no subject SF'}" disabled style="opacity:0.7"/>
          <div class="hint">${compAvgPsf != null ? '$' + compAvgPsf.toFixed(2) + '/SF average from ' + useForAvg.length + ' comp(s)' : 'Enter sales comps with prices and areas on the Comps page.'}</div>
        </div>
      ` : `<div></div>`}
      <div></div>
    </div>

    ${compsBelowMin && src === 'comp_derived' ? `
      <div style="background:rgba(220,50,50,0.10);border:1px solid rgba(220,50,50,0.55);border-radius:6px;padding:0.6rem 0.85rem;margin-bottom:0.75rem;color:#ff9a9a;font-size:12px">
        <strong style="color:#ff6b6b">⚠ Below institutional standard:</strong>
        Only ${compCount} sales comp${compCount === 1 ? '' : 's'} entered. Institutional underwriting requires 3+ sales comps for a defensible comp-derived ARV. Add more on the Comps page or switch to a different ARV source.
      </div>
    ` : ''}

    ${showImplied ? `
      <div style="background:rgba(201,168,76,0.06);border-left:3px solid var(--gold);border-radius:4px;padding:0.5rem 0.85rem;margin-bottom:1rem;font-size:12px;color:var(--text2)">
        <div><strong style="color:var(--text)">ARV in use:</strong> <span style="color:var(--gold-lt)" data-arv-cell="arv-in-use">${f$(arvInUse)}</span></div>
        <div style="margin-top:2px"><strong style="color:var(--text)">Income-approach ARV:</strong> ${f$(incomeArv)} (at ${fPct(i.exit_cap, 2)} input cap)</div>
        <div style="margin-top:2px"><strong style="color:var(--text)">Implied cap rate at this ARV:</strong> <span style="color:var(--gold-lt)" data-arv-cell="implied-cap">${fPct(impliedCap, 2)}</span></div>
      </div>
    ` : ''}
  `;
}


// Inline refresh of Operating page dollar-amount hints. Called from
// onInputChange when any of the operating % fields or rent inputs
// change. Updates only the hint text via data-op-hint selectors;
// does NOT re-render the form inputs (which would kill focus and
// dismiss the mobile keyboard, same antipattern fixed on Unit Mix).
function _refreshOperatingHints() {
  const i = inputs;
  const totalUnits = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0)
    : 0;
  const gprMonthly = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0) * (Number(u.rent) || 0), 0)
    : 0;
  const gprAnnual = gprMonthly * 12;
  const vacancyPct = Number(i.vacancy_pct) || 0;
  const egi = gprAnnual * (1 - vacancyPct);
  const f$ = (x) => x == null || !isFinite(x) ? '-' : '$' + Math.round(Number(x)).toLocaleString();
  const hasGpr = gprAnnual > 0;
  const hasUnits = totalUnits > 0;

  const setHint = (key, text) => {
    const el = document.querySelector(`[data-op-hint="${key}"]`);
    if (el) el.innerHTML = text;
  };

  setHint('vacancy', hasGpr
    ? '= ' + f$(gprAnnual * vacancyPct) + ' vacancy loss on ' + f$(gprAnnual) + ' GPR'
    : 'Default 0.05 (5%). Enter unit mix to see dollar amount.');
  setHint('opex-header', hasGpr
    ? 'Operating Expenses <span style="color:var(--text3);font-weight:400;font-size:11px;margin-left:8px">at EGI of ' + f$(egi) + '</span>'
    : 'Operating Expenses');
  setHint('pm', hasGpr
    ? '= ' + f$(egi * (Number(i.pm_pct) || 0)) + '/year'
    : 'Default 7% of EGI.');
  setHint('maint', hasGpr
    ? '= ' + f$(egi * (Number(i.maint_pct_of_egi) || 0)) + '/year'
    : 'Default 5.5% of EGI.');
  setHint('ins', hasGpr
    ? '= ' + f$(egi * (Number(i.insurance_pct_of_egi) || 0)) + '/year'
    : 'Default 8% of EGI.');
  setHint('util', hasGpr
    ? '= ' + f$(egi * (Number(i.utilities_pct_of_egi) || 0)) + '/year'
    : 'Default 2% of EGI.');
  setHint('reserves', hasUnits
    ? '= ' + f$((Number(i.reserves_per_unit_year) || 0) * totalUnits) + '/year (' + totalUnits + ' units)'
    : 'Default $1,000/unit/year.');
}


// A-smart consulting fee helper: returns the engine's auto-computed
// consulting value for a given inputs object. Mirrors the engine's
// fallback formula (max $10K, 3% of purchase + capex). Used by the
// Capital form to pre-fill the consulting field when the user has
// not locked the value.
// Per-door (per-unit) hint helper. Returns a small muted hint
// showing the value divided by total unit count, like "$25,000/door".
// Returns empty string when there are no units, so the field shows
// nothing extra (no clutter, no "$0/unit" placeholder). The data-
// perdoor attribute lets the inline refresher target each field
// without re-rendering the input.
function _renderPerDoor(value, key) {
  const units = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0)
    : 0;
  if (units <= 0) return '';
  const v = Number(value);
  if (!isFinite(v) || v === 0) {
    return `<div class="hint" data-perdoor="${key}" style="color:var(--text3)"></div>`;
  }
  const perUnit = v / units;
  return `<div class="hint" data-perdoor="${key}" style="color:var(--text3)">$${Math.round(perUnit).toLocaleString()}/door</div>`;
}

// Inline refresh of per-door hints. Called from onInputChange when
// purchase_price, asking_price, or capex_budget changes (so the
// /door figure stays current as the user types). Surgical update
// of the hint elements; does NOT re-render the form.
function _refreshPerDoorHints() {
  const units = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0)
    : 0;
  const fields = [
    { key: 'asking',   value: inputs.asking_price },
    { key: 'purchase', value: inputs.purchase_price },
    { key: 'capex',    value: inputs.capex_budget }
  ];
  for (const { key, value } of fields) {
    const el = document.querySelector(`[data-perdoor="${key}"]`);
    if (!el) continue;
    if (units <= 0) { el.textContent = ''; continue; }
    const v = Number(value);
    if (!isFinite(v) || v === 0) { el.textContent = ''; continue; }
    el.textContent = '$' + Math.round(v / units).toLocaleString() + '/door';
  }
}

function _autoConsulting(i) {
  const purchase = Number(i && i.purchase_price) || 0;
  const capex = Number(i && i.capex_budget) || 0;
  return Math.round(Math.max(10000, 0.03 * (purchase + capex)));
}


// M1: Negotiation diagnostic helper. Renders the "% under ask" hint
// under the Asking Price field on the Capital panel. Asking price is
// purely informational (Version B per spec) - does NOT drive engine
// math, only surfaces as a deal-quality signal.
function _renderNegotiationHint(askingPrice, purchasePrice) {
  const ask = Number(askingPrice) || 0;
  const buy = Number(purchasePrice) || 0;
  if (ask <= 0 || buy <= 0) {
    return 'Optional: seller&rsquo;s ask. Not used in any underwriting math.';
  }
  const delta = ask - buy;
  const pct = (delta / ask) * 100;
  const fmt = (n) => '$' + Math.abs(Math.round(n)).toLocaleString();
  if (delta > 0) {
    return `Negotiated <strong style="color:#3fb950">${fmt(delta)} (${pct.toFixed(1)}%) under ask</strong>.`;
  } else if (delta < 0) {
    return `Bid <strong style="color:#f85e5e">${fmt(delta)} (${Math.abs(pct).toFixed(1)}%) over ask</strong>.`;
  } else {
    return 'At-ask transaction.';
  }
}


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

      <div class="ssub">Company Assigned to This Deal</div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Active company profile</label>
          <select id="deal-company-id" onchange="onDealCompanyChange(this.value)">
            <option value="">-- No company (default Foundry branding) --</option>
            ${(typeof CP !== 'undefined' && CP.list ? CP.list : []).map(c =>
              `<option value="${c.id}" ${currentDeal && currentDeal.company_id === c.id ? 'selected' : ''}>${escapeHtml(c.name || 'Unnamed')}</option>`
            ).join('')}
          </select>
          <div class="hint">Reports and the top-bar logo use this profile's branding while this deal is loaded. Change on the Company Profiles page.</div></div>
        <div></div>
      </div>

      <div class="ssub">Strategy</div>
      ${mode === 'brrrr' ? `
        <div class="g3" style="margin-bottom:1rem">
          <div class="field"><label>Target refi timeline (months)</label>
            <input type="number" value="${i.target_refi_months ?? ''}" oninput="onInputChange('target_refi_months', this.value)"/></div>
          <div class="field"><label>Target hold period (years)</label>
            <input type="number" value="${i.target_hold_years ?? 10}" oninput="onInputChange('target_hold_years', this.value)"/></div>
          <div class="field"><label>Exit cap (refi valuation)</label>
            <input type="number" step="0.0001" value="${i.exit_cap ?? 0.0895}" oninput="onInputChange('exit_cap', this.value)"
                   ${(i.arv_source && i.arv_source !== 'income_approach') ? 'disabled style="opacity:0.55"' : ''}/>
            <div class="hint">${(i.arv_source && i.arv_source !== 'income_approach')
              ? 'Disabled: ARV source override is active. Change ARV source on the Capital tab to re-enable.'
              : 'Stabilized ARV = NOI / exit cap.'}</div></div>
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
            <div class="hint" data-tax-hint>${(() => {
              const d = (i.tax_district || '').trim();
              if (!d) return '<span style="color:var(--bad)">⚠ Empty - taxes will compute to $0. Type to search the Cuyahoga table.</span>';
              if (typeof CUYAHOGA_TAX_RATES !== 'undefined' && !CUYAHOGA_TAX_RATES[d]) return '<span style="color:var(--bad)">⚠ District not found in Cuyahoga table - taxes will compute to $0. Check spelling against autocomplete.</span>';
              if (typeof CUYAHOGA_TAX_RATES !== 'undefined' && CUYAHOGA_TAX_RATES[d]) {
                const isCom = i.asset_type === 'commercial_multifamily';
                const rate = isCom ? CUYAHOGA_TAX_RATES[d][1] : CUYAHOGA_TAX_RATES[d][0];
                return 'Resolved: ' + (rate * 100).toFixed(2) + '% (' + (isCom ? 'commercial 5+ unit' : 'residential') + ' rate).';
              }
              return 'Type to search; autocompletes from the Cuyahoga tax table.';
            })()}</div>
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
      <table class="data" id="um-table">
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
            <tr data-um-row="${idx}">
              <td>
                <select onchange="updateUnitRowBedType(${idx},this.value)">
                  <option value="studio" ${u.bed_type === 'studio' ? 'selected' : ''}>Studio</option>
                  <option value="1br" ${u.bed_type === '1br' ? 'selected' : ''}>1 Bedroom</option>
                  <option value="2br" ${u.bed_type === '2br' ? 'selected' : ''}>2 Bedroom</option>
                  <option value="3br" ${u.bed_type === '3br' ? 'selected' : ''}>3 Bedroom</option>
                  <option value="4br" ${u.bed_type === '4br' ? 'selected' : ''}>4 Bedroom</option>
                </select>
              </td>
              <td><input type="number" inputmode="numeric" class="num" value="${u.count ?? 0}" oninput="updateUnitRowField(${idx},'count',this.value)"/></td>
              <td><input type="number" inputmode="decimal" class="num" value="${u.rent ?? 0}" oninput="updateUnitRowField(${idx},'rent',this.value)"/></td>
              <td class="num" data-um-cell="gpr-${idx}">${(u.count && u.rent) ? f$(Number(u.count) * Number(u.rent)) : '-'}</td>
              <td><button class="btn btn-sm btn-bad" onclick="removeUnitRow(${idx})" title="Remove">×</button></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td class="num" data-um-cell="total-units"><strong>${totalUnits}</strong></td>
            <td></td>
            <td class="num" data-um-cell="total-gpr-monthly"><strong>${f$(totalGpr)}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="3" style="color:var(--text2);font-size:11px">Annual GPR (× 12)</td>
            <td class="num" style="color:var(--gold-lt)" data-um-cell="total-gpr-annual"><strong>${f$(totalGpr * 12)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// Debounce timer for unit_mix autosave so we don't spam Supabase
// on every keystroke. Re-armed on each keystroke; fires 700ms after
// the user stops typing. Matches the autosave debounce pattern used
// in commitSection.
let _umAutosaveTimer = null;

function addUnitRow() {
  unitMix.push({ bed_type: '2br', count: 0, rent: 0 });
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

// Numeric field update (count or rent). Updates the underlying data,
// recomputes ONLY the dependent cells (row GPR + footer totals)
// without re-rendering the table. This preserves keyboard focus and
// cursor position in the input the user is typing into -- critical
// on mobile where re-rendering mid-keystroke kills the soft keyboard.
function updateUnitRowField(idx, field, value) {
  if (!unitMix[idx]) return;
  const n = Number(value);
  unitMix[idx][field] = isFinite(n) ? n : 0;

  // Update the dependent display cells in-place (do not re-render)
  _refreshUnitMixDerived();

  // Debounce autosave + recompute + dashboard so they don't fire
  // on every keystroke. Fires once 700ms after the user stops typing.
  if (_umAutosaveTimer) clearTimeout(_umAutosaveTimer);
  _umAutosaveTimer = setTimeout(() => {
    autosave('unit_mix');
    if (typeof recompute === 'function') recompute();
    updateDashboard();
  }, 700);
}

// Bed type change. Structural enough that a full re-render is fine
// (the user is interacting with a select, not a text input, so focus
// loss is not a concern).
function updateUnitRowBedType(idx, value) {
  if (!unitMix[idx]) return;
  unitMix[idx].bed_type = value;
  renderUnitMixBlock();
  autosave('unit_mix');
  if (typeof recompute === 'function') recompute();
  updateDashboard();
}

// Refresh the GPR cell on each row and the footer totals without
// re-rendering the inputs. Called by updateUnitRowField.
function _refreshUnitMixDerived() {
  let totalUnits = 0;
  let totalGpr = 0;
  for (let i = 0; i < unitMix.length; i++) {
    const u = unitMix[i];
    const c = Number(u.count) || 0;
    const r = Number(u.rent) || 0;
    const gpr = c * r;
    totalUnits += c;
    totalGpr += gpr;
    const cell = document.querySelector(`[data-um-cell="gpr-${i}"]`);
    if (cell) cell.textContent = (c && r) ? f$(gpr) : '-';
  }
  const tUnits = document.querySelector('[data-um-cell="total-units"]');
  if (tUnits) tUnits.innerHTML = `<strong>${totalUnits}</strong>`;
  const tGprM = document.querySelector('[data-um-cell="total-gpr-monthly"]');
  if (tGprM) tGprM.innerHTML = `<strong>${f$(totalGpr)}</strong>`;
  const tGprA = document.querySelector('[data-um-cell="total-gpr-annual"]');
  if (tGprA) tGprA.innerHTML = `<strong>${f$(totalGpr * 12)}</strong>`;
}

// Backward-compat shim: anything that still calls the old
// updateUnitRow(idx, field, value) entry point gets routed to the
// new pair. Kept defensively for any HTML/code I might have missed.
function updateUnitRow(idx, field, value) {
  if (field === 'bed_type') {
    updateUnitRowBedType(idx, value);
  } else {
    updateUnitRowField(idx, field, value);
  }
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

  // Compute dollar-amount previews so the user can see what each %
  // translates to in real dollars at the current EGI / unit count.
  // These mirror the engine's math (engine.js computeBRRRR) but use
  // safe fallbacks when GPR/EGI are zero. Live numbers come from R
  // when present; otherwise compute from inputs + unit mix directly.
  const totalUnits = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0), 0)
    : 0;
  const gprMonthly = (typeof unitMix !== 'undefined' && unitMix)
    ? unitMix.reduce((a, u) => a + (Number(u.count) || 0) * (Number(u.rent) || 0), 0)
    : 0;
  const gprAnnual = gprMonthly * 12;
  const vacancyPct = Number(i.vacancy_pct) || 0;
  const egi = gprAnnual * (1 - vacancyPct);

  const vacancyLoss = gprAnnual * vacancyPct;
  const pmDollars = egi * (Number(i.pm_pct) || 0);
  const maintDollars = egi * (Number(i.maint_pct_of_egi) || 0);
  const insDollars = egi * (Number(i.insurance_pct_of_egi) || 0);
  const utilDollars = egi * (Number(i.utilities_pct_of_egi) || 0);
  const reservesDollars = (Number(i.reserves_per_unit_year) || 0) * totalUnits;

  const f$ = (x) => x == null || !isFinite(x) ? '-' : '$' + Math.round(Number(x)).toLocaleString();
  const hasGpr = gprAnnual > 0;
  const hasUnits = totalUnits > 0;

  // Tax warning: surface when taxes are $0 due to missing/unknown tax
  // district. Loud banner because this silently overstates NOI/ARV/IRR
  // across the whole report stack. Engine 1.2.0.
  const taxesAreZero = (typeof R === 'object' && R && (R.taxes === 0 || R.taxes == null));
  const districtSet = (i.tax_district || '').trim();
  const districtKnown = districtSet && typeof CUYAHOGA_TAX_RATES !== 'undefined' && CUYAHOGA_TAX_RATES[districtSet];
  const showTaxWarning = taxesAreZero && !districtKnown && hasGpr;
  const taxWarningHtml = showTaxWarning ? `
    <div style="background:rgba(192,57,43,0.08);border:1px solid #c0392b;border-radius:6px;padding:12px 14px;margin-bottom:1rem;color:var(--text);font-size:13px;line-height:1.5">
      <div style="font-weight:600;color:#e74c3c;margin-bottom:4px">⚠ Property taxes computing to $0</div>
      ${!districtSet
        ? 'No tax district is set. Set it on the Deal Setup page so taxes flow through to NOI, ARV, and refi sizing.'
        : 'Tax district "' + escapeHtml(districtSet) + '" is not in the Cuyahoga rate table. Check spelling against autocomplete on the Deal Setup page.'}
    </div>
  ` : '';

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-title">Operating Assumptions
        <span class="panel-sub">Vacancy and opex - applied to stabilized EGI.</span>
      </div>

      ${taxWarningHtml}

      <div class="ssub">Income</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Vacancy %</label>
          <input type="number" step="0.001" class="num" value="${i.vacancy_pct ?? 0.05}" inputmode="decimal" oninput="onInputChange('vacancy_pct', this.value)"/>
          <div class="hint" data-op-hint="vacancy">${hasGpr ? '= ' + f$(vacancyLoss) + ' vacancy loss on ' + f$(gprAnnual) + ' GPR' : 'Default 0.05 (5%). Enter unit mix to see dollar amount.'}</div></div>
        <div class="field"><label>Annual rent growth</label>
          <input type="number" step="0.001" class="num" value="${i.rent_growth_pct ?? 0.03}" inputmode="decimal" oninput="onInputChange('rent_growth_pct', this.value)"/>
          <div class="hint">Default 3% - applied Y2 through hold.</div></div>
        <div></div>
      </div>

      <div class="ssub" data-op-hint="opex-header">Operating Expenses ${hasGpr ? '<span style="color:var(--text3);font-weight:400;font-size:11px;margin-left:8px">at EGI of ' + f$(egi) + '</span>' : ''}</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Property management %</label>
          <input type="number" step="0.001" class="num" value="${i.pm_pct ?? 0.07}" inputmode="decimal" oninput="onInputChange('pm_pct', this.value)"/>
          <div class="hint" data-op-hint="pm">${hasGpr ? '= ' + f$(pmDollars) + '/year' : 'Default 7% of EGI.'}</div></div>
        <div class="field"><label>Maintenance &amp; turnover %</label>
          <input type="number" step="0.001" class="num" value="${i.maint_pct_of_egi ?? 0.055}" inputmode="decimal" oninput="onInputChange('maint_pct_of_egi', this.value)"/>
          <div class="hint" data-op-hint="maint">${hasGpr ? '= ' + f$(maintDollars) + '/year' : 'Default 5.5% of EGI.'}</div></div>
        <div class="field"><label>Insurance %</label>
          <input type="number" step="0.001" class="num" value="${i.insurance_pct_of_egi ?? 0.08}" inputmode="decimal" oninput="onInputChange('insurance_pct_of_egi', this.value)"/>
          <div class="hint" data-op-hint="ins">${hasGpr ? '= ' + f$(insDollars) + '/year' : 'Default 8% of EGI.'}</div></div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Utilities %</label>
          <input type="number" step="0.001" class="num" value="${i.utilities_pct_of_egi ?? 0.02}" inputmode="decimal" oninput="onInputChange('utilities_pct_of_egi', this.value)"/>
          <div class="hint" data-op-hint="util">${hasGpr ? '= ' + f$(utilDollars) + '/year' : 'Default 2% of EGI.'}</div></div>
        <div class="field"><label>Reserves ($/unit/year)</label>
          <input type="number" class="num" value="${i.reserves_per_unit_year ?? 1000}" inputmode="numeric" oninput="onInputChange('reserves_per_unit_year', this.value)"/>
          <div class="hint" data-op-hint="reserves">${hasUnits ? '= ' + f$(reservesDollars) + '/year (' + totalUnits + ' units)' : 'Default $1,000/unit/year.'}</div></div>
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

      <div class="ssub">Acquisition${(typeof unitMix !== 'undefined' && unitMix && unitMix.reduce((a,u)=>a+(Number(u.count)||0),0) > 0) ? ' <span style="color:var(--text3);font-weight:400;font-size:11px;margin-left:8px">' + unitMix.reduce((a,u)=>a+(Number(u.count)||0),0) + ' units</span>' : ''}</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Asking price</label>
          <input type="number" class="num" value="${i.asking_price ?? ''}" placeholder="Seller's ask (not used in math)" oninput="onInputChange('asking_price', this.value)"/>
          <div class="hint" id="asking-vs-purchase-hint">${_renderNegotiationHint(i.asking_price, i.purchase_price)}</div>
          ${_renderPerDoor(i.asking_price, 'asking')}</div>
        <div class="field"><label>Purchase price</label>
          <input type="number" class="num" value="${i.purchase_price ?? 0}" oninput="onInputChange('purchase_price', this.value)"/>
          ${_renderPerDoor(i.purchase_price, 'purchase')}</div>
        <div class="field"><label>Capex budget</label>
          <input type="number" class="num" value="${i.capex_budget ?? 0}" oninput="onInputChange('capex_budget', this.value)"/>
          ${_renderPerDoor(i.capex_budget, 'capex')}</div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Sponsor mobilization</label>
          <input type="number" class="num" value="${i.gc_contingency ?? 0}" placeholder="Approx 4-5 draws of capex float" oninput="onInputChange('gc_contingency', this.value)"/>
          <div class="hint">Float to cover GC mobilization and draw-cycle lag before lender reimbursement. Reimbursed via construction draws before refi.</div></div>
      </div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Consulting / project fee${i.consulting_fees_user_locked ? ' <span style="color:var(--gold-lt);font-size:10px;font-weight:600;margin-left:6px">OVERRIDDEN</span>' : ' <span style="color:var(--text3);font-size:10px;margin-left:6px">auto</span>'}</label>
          <input type="number" class="num" value="${i.consulting_fees_override ?? _autoConsulting(i)}" placeholder="Auto: max($10k, 3% of purchase + capex)" oninput="onInputChange('consulting_fees_override', this.value)"/>
          <div class="hint">${i.consulting_fees_user_locked ? 'Manually set. Clear the field to return to auto mode (3% of purchase + capex, $10K minimum).' : 'Auto-recomputes from 3% of (purchase + capex) as those change. Type a value to override.'}</div>
          </div>
        ${mode === 'brrrr' ? `
          <label class="field-cb" style="margin-top:1.4rem">
            <input type="checkbox" ${i.treat_mob_as_equity ? 'checked' : ''} onchange="onInputChange('treat_mob_as_equity', this.checked)"/>
            Count sponsor mobilization as initial investor equity
          </label>
        ` : '<div></div>'}
      </div>

      <div class="ssub">Initial Debt (Acquisition + Rehab Phase)</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>LTV on purchase</label>
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltv ?? (mode === 'brrrr' ? 0.93 : 0.90)}" oninput="onInputChange('initial_loan_ltv', this.value)"/>
          <div class="hint">Default ${mode === 'brrrr' ? '0.93 (93%) for BRRRR HML' : '0.90 (90%) for F&F HML'}.</div></div>
        ${mode === 'brrrr' ? `
        <div class="field"><label>LTC on capex</label>
          <input type="number" step="0.01" class="num" value="${i.initial_loan_ltc_capex ?? 1.00}" oninput="onInputChange('initial_loan_ltc_capex', this.value)"/>
          <div class="hint">Default 1.00 (100% capex funded via draws).</div></div>
        ` : `
        <div class="field"><label>Capex funding</label>
          <div style="padding:8px 11px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);border-radius:var(--r-sm);font-size:12px">100% via lender draws</div>
          <div class="hint">F&F template assumes full capex funding by HML.</div></div>
        `}
        <div class="field"><label>Interest rate</label>
          <input type="number" step="0.001" class="num" value="${i.initial_rate ?? 0.127}" oninput="onInputChange('initial_rate', this.value)"/></div>
      </div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Interest type</label>
          <select onchange="onInputChange('initial_interest_type', this.value)">
            <option value="IO" ${i.initial_interest_type === 'IO' ? 'selected' : ''}>IO</option>
            <option value="PI" ${i.initial_interest_type === 'PI' ? 'selected' : ''}>PI (30yr amort)</option>
          </select></div>
        <div></div>
      </div>

      <div class="ssub">Closing Costs</div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Closing cost baseline ($)</label>
          <input type="number" class="num" value="${i.closing_cost_baseline ?? 2444}" oninput="onInputChange('closing_cost_baseline', this.value)"/>
          <div class="hint">Title/escrow/recording. Default $2,444.</div></div>
        <div class="field"><label>Insurance ($)</label>
          <input type="number" class="num" value="${i.closing_cost_insurance ?? 0}" placeholder="First-year premium at close" oninput="onInputChange('closing_cost_insurance', this.value)"/>
          <div class="hint">First-year property insurance premium paid at closing.</div></div>
        <div class="field"><label>Appraisal ($)</label>
          <input type="number" class="num" value="${i.closing_cost_appraisal ?? 0}" placeholder="Lender-ordered appraisal" oninput="onInputChange('closing_cost_appraisal', this.value)"/>
          <div class="hint">Appraisal fee invoiced by the lender or appraisal firm.</div></div>
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="field"><label>Origination fee (%)</label>
          <input type="number" step="0.001" class="num" value="${i.origination_pct ?? 0.025}" oninput="onInputChange('origination_pct', this.value)"/>
          <div class="hint">Lender origination as % of loan. Default 2.5%.</div></div>
        <div class="field"><label>Lender points (%)</label>
          <input type="number" step="0.001" class="num" value="${i.lender_points_pct ?? 0.020}" oninput="onInputChange('lender_points_pct', this.value)"/>
          <div class="hint">Lender points as % of loan. Default 2.0%.</div></div>
        <div class="field"><label>Broker points (%)</label>
          <input type="number" step="0.001" class="num" value="${i.broker_points_pct ?? 0}" oninput="onInputChange('broker_points_pct', this.value)"/>
          <div class="hint">Mortgage broker points as % of loan, if any.</div></div>
      </div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Lender flat fees ($)</label>
          <input type="number" class="num" value="${i.lender_flat_fees ?? 0}" placeholder="Legal, environmental, processing" oninput="onInputChange('lender_flat_fees', this.value)"/>
          <div class="hint">Residual flat-dollar lender fees beyond origination, points, and appraisal.</div></div>
        ${mode === 'brrrr' ? `
        <div class="field"><label>Transfer tax add-on ($)</label>
          <input type="number" class="num" value="${i.closing_cost_transfer_addon ?? 2400}" oninput="onInputChange('closing_cost_transfer_addon', this.value)"/>
          <div class="hint">Cuyahoga multifamily transfer fees. Default $2,400.</div></div>
        ` : '<div></div>'}
      </div>

      ${mode === 'brrrr' ? `
      <div class="ssub">Capex Execution Window</div>
      <div class="g2" style="margin-bottom:1rem">
        <div class="field"><label>Capex duration (months)</label>
          <input type="number" step="1" min="1" class="num" value="${i.capex_duration_months ?? ''}" placeholder="Default: 6" oninput="onInputChange('capex_duration_months', this.value)"/>
          <div class="hint">Months over which the construction tranche draws fund (straight-line). Drives month-by-month bridge carry.</div></div>
        <div></div>
      </div>
      ` : ''}

      ${mode === 'brrrr' ? `
      ${_renderArvSourceSection(i, typeof R === 'object' && R ? R : {}, typeof comps === 'object' && comps ? comps : [])}

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
