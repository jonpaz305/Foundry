// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.6 - Lender Package Report
// ════════════════════════════════════════════════════════════════
// Mode-aware debt-sizing-focused deliverable for bridge or agency
// lenders. BRRRR mode emphasizes refi takeout + stabilized DSCR;
// F&F mode emphasizes ARV defense + sale-velocity stress.
//
// Audience: hard money lender (F&F bridge), bridge lender (BRRRR
// acquisition phase), or agency lender (BRRRR takeout). Less prose,
// more institutional tables. No "investment thesis" narrative since
// lenders don't care about the equity story.
//
// CONTRACT
//   window.renderReport_lender_package(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES (mode-aware)
//   1  Cover + Loan Request + Debt Metrics
//   2  Sources & Uses + Capital Stack + Sponsor Skin-in-the-Game
//   3  BRRRR: Initial Debt + Refi Takeout · F&F: Initial Debt + ARV Defense
//   4  BRRRR: NOI Build + Stabilized CF · F&F: Renovation Scope + Comp Summary
//   5  Stress Scenarios (mode-specific)
//   6  Sponsor Profile + Asset Summary + Disclosures
// ════════════════════════════════════════════════════════════════

(function () {

  // ── UTILITIES ─────────────────────────────────────────────────
  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _addressLine(deal, inputs) {
    const addr = (inputs && inputs.property_address) || (deal && deal.address) || '';
    const city = (inputs && inputs.city) || (deal && deal.city) || '';
    const st   = (inputs && inputs.state) || (deal && deal.state) || '';
    const zip  = (inputs && inputs.zip) || (deal && deal.zip) || '';
    const parts = [];
    if (addr) parts.push(addr);
    if (city || st || zip) parts.push([city, st].filter(Boolean).join(', ') + (zip ? ' ' + zip : ''));
    return parts.join(' · ');
  }

  function _normForCmp(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function _assetTypeLabel(t) {
    if (t === 'commercial_multifamily') return 'Commercial Multifamily (5+ units)';
    if (t === 'residential_multifamily') return 'Residential Multifamily (2-4 units)';
    if (t === 'single_family') return 'Single Family';
    return t || 'Multifamily';
  }

  function _modeLabel(mode) {
    if (mode === 'brrrr') return 'BRRRR Bridge / Agency';
    if (mode === 'fix_and_flip') return 'Fix & Flip Bridge';
    return 'Loan';
  }


  // ── HEADER + FOOTER ───────────────────────────────────────────
  function _header(h, pageLabel, mode) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    const coSub = co && co.subtitle ? co.subtitle : '';
    const coLogo = co && co.logo_base64 ? co.logo_base64 : null;
    const left = coLogo
      ? `<img src="${coLogo}" class="ph-co-logo" alt="${_esc(coName)}"/>`
      : `<div class="ph-co-name">${_esc(coName)}</div>`;
    return `
      <div class="print-header pb-avoid">
        <div class="ph-co-block">
          ${left}
          ${coSub ? `<div class="ph-co-sub">${_esc(coSub)}</div>` : ''}
        </div>
        <div class="ph-meta">
          <div><strong>Lender Package</strong> · ${_esc(_modeLabel(mode))}</div>
          <div>${_esc(pageLabel || '')}</div>
          <div>${_esc(h.todayLong())}</div>
        </div>
      </div>`;
  }

  function _footer(pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    return `
      <div class="print-footer pb-avoid">
        <div class="pf-conf">Confidential · ${_esc(coName)}</div>
        <div class="pf-page">${pageNum} of ${totalPages}</div>
      </div>`;
  }


  // ── PAGE 1: COVER + LOAN REQUEST + DEBT METRICS ───────────────
  function _page1(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);
    const showAddrSub = addrLine && !_normForCmp(dealName).includes(_normForCmp(addrLine));
    const modeLbl = _modeLabel(mode);

    // Mode-aware debt tile selection
    const tiles = [];
    if (mode === 'brrrr') {
      const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0) ? R.refi_loan_amount / R.stabilized_arv : null;
      const debt_yield_initial = (R.stabilized_noi > 0 && R.initial_loan_amt > 0) ? R.stabilized_noi / R.initial_loan_amt : null;
      const debt_yield_refi = (R.stabilized_noi > 0 && R.refi_loan_amount > 0) ? R.stabilized_noi / R.refi_loan_amount : null;
      const initial_ltc = (R.initial_loan_amt > 0 && R.total_project_cost > 0) ? R.initial_loan_amt / R.total_project_cost : null;

      tiles.push({ lbl: 'Loan Amount',          val: h.fmtMoneyK(R.initial_loan_amt),     sub: 'Bridge (Acquisition + Reno)', tone: 'neutral' });
      tiles.push({ lbl: 'Refi DSCR',            val: h.fmtX(R.dscr, 2),                   sub: 'Stabilized NOI / Refi DS',    tone: _toneAbove(R.dscr, 1.05, 1.20) });
      tiles.push({ lbl: 'Refi Debt Yield',      val: h.fmtPct(debt_yield_refi),           sub: 'NOI / Refi Loan',             tone: _toneAbove(debt_yield_refi, 0.085, 0.10) });
      tiles.push({ lbl: 'Refi LTV',             val: h.fmtPct(refi_ltv),                  sub: 'Refi Loan / ARV',             tone: _toneBelow(refi_ltv, 0.80, 0.75) });
      tiles.push({ lbl: 'Initial LTC',          val: h.fmtPct(initial_ltc),               sub: 'Bridge / TPC',                tone: _toneBelow(initial_ltc, 0.85, 0.75) });
      tiles.push({ lbl: 'Initial Debt Yield',   val: h.fmtPct(debt_yield_initial),        sub: 'NOI / Bridge Loan',           tone: _toneAbove(debt_yield_initial, 0.085, 0.10) });
    } else {
      const ltv = (R.initial_loan_amt > 0 && R.arv > 0) ? R.initial_loan_amt / R.arv : null;
      const ltc = (R.initial_loan_amt > 0 && R.total_project_cost > 0) ? R.initial_loan_amt / R.total_project_cost : null;
      const in_basis = (R.total_project_cost > 0 && R.arv > 0) ? R.total_project_cost / R.arv : null;

      tiles.push({ lbl: 'Loan Amount',          val: h.fmtMoneyK(R.initial_loan_amt),     sub: 'Acquisition + Reno Bridge',   tone: 'neutral' });
      tiles.push({ lbl: 'LTV (vs ARV)',         val: h.fmtPct(ltv),                       sub: 'Loan / Final ARV',            tone: _toneBelow(ltv, 0.75, 0.65) });
      tiles.push({ lbl: 'LTC',                  val: h.fmtPct(ltc),                       sub: 'Loan / TPC',                  tone: _toneBelow(ltc, 0.85, 0.75) });
      tiles.push({ lbl: 'In-Basis',             val: h.fmtPct(in_basis),                  sub: 'TPC / ARV',                   tone: _toneBelow(in_basis, 0.80, 0.70) });
      tiles.push({ lbl: 'Sponsor Equity',       val: h.fmtMoneyK(R.investor_equity),      sub: 'Cash at risk',                tone: 'neutral' });
      tiles.push({ lbl: 'Hold Period',          val: (inputs.target_hold_months || 0) + ' mo', sub: 'Acquisition to sale',     tone: 'neutral' });
    }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Cover · Loan Request', mode)}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Lender Package · ${_esc(modeLbl)}</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">
            ${showAddrSub ? _esc(addrLine) + ' · ' : ''}${_esc(_assetTypeLabel(inputs.asset_type))}${R.total_unit_count > 0 ? ' · ' + R.total_unit_count + ' units' : ''} · <span class="ds-mode-pill">${mode === 'brrrr' ? 'BRRRR' : 'Fix &amp; Flip'}</span>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Loan Request Summary</div>
        ${_loanRequest(R, inputs, mode, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Debt Metrics</div>
        <div class="print-kpis cols-3">
          ${tiles.map(t => `
            <div class="pk-tile pb-avoid pk-tone-${t.tone}">
              <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
              <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
              <div class="pk-tile-sub">${_esc(t.sub)}</div>
            </div>`).join('')}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _loanRequest(R, inputs, mode, h) {
    const rows = [];
    if (mode === 'brrrr') {
      rows.push(['Loan Type',          'Bridge (with refi takeout)']);
      rows.push(['Requested Amount',   h.fmtMoney(R.initial_loan_amt)]);
      rows.push(['LTV (Purchase)',     h.fmtPct(inputs.initial_loan_ltv)]);
      rows.push(['LTC + Reno',         h.fmtPct(inputs.initial_loan_ltc_reno)]);
      rows.push(['Rate',               h.fmtPct(inputs.initial_rate, 2)]);
      rows.push(['Interest Type',      _esc(inputs.initial_interest_type || 'IO')]);
      rows.push(['Term to Refi',       (inputs.target_refi_months || 9) + ' months']);
      rows.push(['Takeout Strategy',   `${h.fmtPct(inputs.target_refi_ltv)} agency at ${h.fmtPct(inputs.refi_rate, 2)} ${_esc(inputs.refi_interest_type || 'PI')}`]);
    } else {
      rows.push(['Loan Type',          'Acquisition + Reno Bridge']);
      rows.push(['Requested Amount',   h.fmtMoney(R.initial_loan_amt)]);
      rows.push(['LTV',                h.fmtPct(inputs.initial_loan_ltv) + ' of Purchase']);
      rows.push(['Rate',               h.fmtPct(inputs.initial_rate, 2)]);
      rows.push(['Interest Type',      _esc(inputs.initial_interest_type || 'IO')]);
      rows.push(['Term',               (inputs.target_hold_months || 0) + ' months']);
      rows.push(['Exit Strategy',      `Sale at ARV ${h.fmtMoney(R.arv)}${R.arv_source === 'override' ? ' (manual)' : ' (comp-derived)'}`]);
      rows.push(['Sale Costs',         h.fmtPct(inputs.sale_cost_pct) + ' of disposition']);
    }

    return `
      <div class="print-list pb-avoid">
        ${rows.map(([lbl, val]) => `<div class="pl-row"><span class="pl-lbl">${_esc(lbl)}</span><span class="pl-val">${val}</span></div>`).join('')}
      </div>`;
  }


  // ── PAGE 2: SOURCES & USES + SPONSOR SKIN ─────────────────────
  function _page2(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const initialLoan = R.initial_loan_amt || 0;
    const investorEquity = mode === 'brrrr' ? (R.initial_investor_equity || 0) : (R.investor_equity || 0);
    const totalSources = initialLoan + investorEquity;

    const purchase = inputs.purchase_price || 0;
    const reno = inputs.reno_budget || 0;
    const closing = R.closing_costs || 0;
    const consulting = R.consulting || 0;
    const carry = mode === 'brrrr' ? (R.debt_service_pre_refi || 0) : (R.debt_service_pre_sale || 0);
    const contingency = inputs.mobilization_contingency || 0;
    const totalUses = purchase + reno + closing + consulting + carry + contingency;

    const sponsorPct = totalSources > 0 ? investorEquity / totalSources : 0;
    const loanPct = totalSources > 0 ? initialLoan / totalSources : 0;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sources & Uses · Capital Stack', mode)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sources & Uses</div>
        <div class="bp-su-grid">
          <table class="print-table pb-avoid">
            <thead><tr><th>Sources</th><th class="num">Amount</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Requested Loan</td><td class="num">${h.fmtMoney(initialLoan)}</td><td class="num">${h.fmtPct(loanPct)}</td></tr>
              <tr><td>Sponsor / Investor Equity</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${h.fmtPct(sponsorPct)}</td></tr>
              <tr class="totals"><td>Total Sources</td><td class="num">${h.fmtMoney(totalSources)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>

          <table class="print-table pb-avoid">
            <thead><tr><th>Uses</th><th class="num">Amount</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Purchase Price</td><td class="num">${h.fmtMoney(purchase)}</td><td class="num">${h.fmtPct(purchase / Math.max(1, totalUses))}</td></tr>
              <tr><td>Renovation Budget</td><td class="num">${h.fmtMoney(reno)}</td><td class="num">${h.fmtPct(reno / Math.max(1, totalUses))}</td></tr>
              <tr><td>Closing Costs</td><td class="num">${h.fmtMoney(closing)}</td><td class="num">${h.fmtPct(closing / Math.max(1, totalUses))}</td></tr>
              <tr><td>Consulting</td><td class="num">${h.fmtMoney(consulting)}</td><td class="num">${h.fmtPct(consulting / Math.max(1, totalUses))}</td></tr>
              <tr><td>Carry (DS through ${mode === 'brrrr' ? 'Refi' : 'Sale'})</td><td class="num">${h.fmtMoney(carry)}</td><td class="num">${h.fmtPct(carry / Math.max(1, totalUses))}</td></tr>
              <tr><td>Mobilization Contingency</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, totalUses))}</td></tr>
              <tr class="totals"><td>Total Uses</td><td class="num">${h.fmtMoney(totalUses)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Structure</div>
        <div class="bp-capstack pb-avoid">
          <div class="bp-capstack-bar">
            <div class="bp-capstack-seg bp-seg-debt" style="width:${(loanPct * 100).toFixed(1)}%">
              <span class="bp-seg-lbl">Requested Loan</span>
              <span class="bp-seg-val">${h.fmtPct(loanPct, 0)}</span>
            </div>
            <div class="bp-capstack-seg bp-seg-sponsor" style="width:${(sponsorPct * 100).toFixed(1)}%">
              <span class="bp-seg-lbl">Sponsor Equity</span>
              <span class="bp-seg-val">${h.fmtPct(sponsorPct, 0)}</span>
            </div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sponsor Skin-in-the-Game</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Amount</th><th class="num">% of TPC</th></tr></thead>
          <tbody>
            <tr><td>Cash Equity at Closing</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${h.fmtPct(investorEquity / Math.max(1, R.total_project_cost))}</td></tr>
            <tr><td>Mobilization Contingency (sponsor-funded)</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, R.total_project_cost))}</td></tr>
            <tr class="totals"><td>Total Sponsor Capital at Risk</td><td class="num">${h.fmtMoney(investorEquity + contingency)}</td><td class="num">${h.fmtPct((investorEquity + contingency) / Math.max(1, R.total_project_cost))}</td></tr>
          </tbody>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 3: INITIAL DEBT + (BRRRR: Refi Takeout · F&F: ARV Defense)
  function _page3(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    return `
      <div class="print-page print-page-compact">
        ${_header(h, mode === 'brrrr' ? 'Initial Debt · Refi Takeout' : 'Initial Debt · ARV Defense', mode)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Initial Debt Terms</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Loan Amount</span><span class="pl-val">${h.fmtMoney(R.initial_loan_amt)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Rate</span><span class="pl-val">${h.fmtPct(inputs.initial_rate, 2)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Interest Type</span><span class="pl-val">${_esc(inputs.initial_interest_type || 'IO')}</span></div>
          <div class="pl-row"><span class="pl-lbl">LTV (Purchase)</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltv)}</span></div>
          ${mode === 'brrrr' ? `<div class="pl-row"><span class="pl-lbl">LTC + Reno</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltc_reno)}</span></div>` : ''}
          <div class="pl-row"><span class="pl-lbl">Monthly Debt Service</span><span class="pl-val">${h.fmtMoney(R.initial_monthly_ds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Term</span><span class="pl-val">${mode === 'brrrr' ? (inputs.target_refi_months || 9) + ' months to refi' : (inputs.target_hold_months || 0) + ' months to sale'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Total DS Through ${mode === 'brrrr' ? 'Refi' : 'Sale'}</span><span class="pl-val">${h.fmtMoney(mode === 'brrrr' ? R.debt_service_pre_refi : R.debt_service_pre_sale)}</span></div>
        </div>

        ${mode === 'brrrr' ? _brrrrRefiTakeout(R, inputs, h) : _ffArvDefense(R, inputs, h)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _brrrrRefiTakeout(R, inputs, h) {
    const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0) ? R.refi_loan_amount / R.stabilized_arv : null;
    const debt_yield = (R.stabilized_noi > 0 && R.refi_loan_amount > 0) ? R.stabilized_noi / R.refi_loan_amount : null;
    return `
      <div class="print-section pb-avoid"><span class="ps-accent"></span>Refinance Takeout Sizing</div>
      <table class="print-table pb-avoid">
        <thead><tr><th>Component</th><th class="num">Value</th></tr></thead>
        <tbody>
          <tr><td>Stabilized NOI</td><td class="num">${h.fmtMoney(R.stabilized_noi)}</td></tr>
          <tr><td>Exit Cap Rate</td><td class="num">${h.fmtPct(inputs.exit_cap, 2)}</td></tr>
          <tr class="totals"><td>Stabilized ARV</td><td class="num">${h.fmtMoney(R.stabilized_arv)}</td></tr>
          <tr><td>Target Refi LTV</td><td class="num">${h.fmtPct(inputs.target_refi_ltv)}</td></tr>
          <tr class="totals"><td>Refi Loan Amount (Target LTV × ARV)</td><td class="num">${h.fmtMoney(R.refi_loan_amount)}</td></tr>
          <tr><td>Effective Refi LTV</td><td class="num">${h.fmtPct(refi_ltv)}</td></tr>
          <tr><td>Refi Rate</td><td class="num">${h.fmtPct(inputs.refi_rate, 2)} ${_esc(inputs.refi_interest_type || 'PI')}</td></tr>
          <tr><td>Refi Monthly DS</td><td class="num">${h.fmtMoney(R.refi_monthly_ds)}</td></tr>
          <tr><td>Refi Annual DS</td><td class="num">${h.fmtMoney(R.refi_annual_ds)}</td></tr>
          <tr class="totals"><td>DSCR (NOI / Refi DS)</td><td class="num">${h.fmtX(R.dscr, 2)}</td></tr>
          <tr class="totals"><td>Debt Yield (NOI / Refi Loan)</td><td class="num">${h.fmtPct(debt_yield)}</td></tr>
        </tbody>
      </table>

      <div class="print-section pb-avoid"><span class="ps-accent"></span>Bridge Payoff at Refi</div>
      <table class="print-table pb-avoid">
        <thead><tr><th>Step</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td>New Refi Loan Proceeds</td><td class="num">${h.fmtMoney(R.refi_loan_amount)}</td></tr>
          <tr><td>Less: Bridge Loan Payoff</td><td class="num">(${h.fmtMoney(R.payoff_existing_debt || R.initial_loan_amt)})</td></tr>
          <tr><td>Less: Refi Closing Costs (${h.fmtPct(inputs.refi_closing_cost_pct || 0, 1)})</td><td class="num">(${h.fmtMoney(R.refi_closing_costs)})</td></tr>
          <tr class="totals"><td>Net Cash Out to Sponsor</td><td class="num">${h.fmtMoney(R.net_cash_out)}</td></tr>
        </tbody>
      </table>`;
  }


  function _ffArvDefense(R, inputs, h) {
    const sqft = R.subject_area_sf || 0;
    const compARV = R.comp_derived_arv || 0;
    const finalARV = R.arv || 0;
    const override_diff = (compARV > 0 && R.arv_source === 'override')
      ? (finalARV - compARV) / compARV : null;

    return `
      <div class="print-section pb-avoid"><span class="ps-accent"></span>ARV Defense</div>
      <table class="print-table pb-avoid">
        <thead><tr><th>Component</th><th class="num">Value</th></tr></thead>
        <tbody>
          <tr><td>Subject Area</td><td class="num">${sqft ? Number(sqft).toLocaleString() + ' SF' : '-'}</td></tr>
          <tr><td>Sales Comp Count</td><td class="num">${R.comp_count_sales || 0}</td></tr>
          <tr><td>Renovated-Only Comps</td><td class="num">${R.comp_count_sales_renovated || 0}</td></tr>
          <tr><td>Comp Avg $/SF (Institutional)</td><td class="num">${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-'}</td></tr>
          <tr><td>Comp Avg DOM</td><td class="num">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) + ' days' : '-'}</td></tr>
          <tr class="totals"><td>Comp-Derived ARV</td><td class="num">${h.fmtMoney(compARV)}</td></tr>
          <tr><td>ARV Source</td><td class="num">${_esc((R.arv_source || 'comps').charAt(0).toUpperCase() + (R.arv_source || 'comps').slice(1))}</td></tr>
          <tr class="totals"><td>Final ARV (Used in Loan Sizing)</td><td class="num">${h.fmtMoney(finalARV)}</td></tr>
          ${override_diff != null ? `<tr><td>Override Premium vs Comp-Derived</td><td class="num">${override_diff >= 0 ? '+' : ''}${h.fmtPct(override_diff)}</td></tr>` : ''}
          <tr><td>Target $/SF</td><td class="num">${(sqft > 0 && finalARV > 0) ? h.fmtMoney(finalARV / sqft) : '-'}</td></tr>
        </tbody>
      </table>

      ${override_diff != null && Math.abs(override_diff) > 0.10 ? `
        <div class="print-callout pb-avoid">
          <div class="pc-title">ARV Override Above Comp-Derived</div>
          Manual ARV is ${h.fmtPct(override_diff)} above the comp-derived value. Lender appraiser may default to the comp-derived figure; sponsor should be prepared to accept loan sizing against the lower of the two.
        </div>` : ''}

      <div class="print-section pb-avoid"><span class="ps-accent"></span>Disposition Mechanics</div>
      <table class="print-table pb-avoid">
        <thead><tr><th>Step</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td>Disposition Value (Final ARV)</td><td class="num">${h.fmtMoney(R.disposition_value)}</td></tr>
          <tr><td>Less: Sale Cost (${h.fmtPct(inputs.sale_cost_pct)})</td><td class="num">(${h.fmtMoney(R.sale_cost)})</td></tr>
          <tr><td>Less: Loan Payoff</td><td class="num">(${h.fmtMoney(R.remaining_loan_balance)})</td></tr>
          <tr class="totals"><td>Gross Proceeds to Sponsor</td><td class="num">${h.fmtMoney(R.gross_proceeds)}</td></tr>
        </tbody>
      </table>`;
  }


  // ── PAGE 4: NOI BUILD (BRRRR) or RENOVATION + COMP SUMMARY (F&F)
  function _page4(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    if (mode === 'brrrr') {
      return _page4Brrrr(deal, R, inputs, market, h, pageNum, totalPages);
    }
    return _page4Ff(deal, R, inputs, market, h, pageNum, totalPages);
  }


  function _page4Brrrr(deal, R, inputs, market, h, pageNum, totalPages) {
    const um = (typeof unitMix === 'object' && Array.isArray(unitMix)) ? unitMix : [];
    const units = R.total_unit_count || 0;
    const egi = R.egi || 0;

    const opex = [
      ['Property Management', R.pm_dollars, inputs.pm_pct, 'of EGI'],
      ['Maintenance & Turnover', R.maint_turnover, inputs.maint_pct_of_egi, 'of EGI'],
      ['Real Estate Taxes', R.taxes, null, 'Tax-roll resolved'],
      ['Insurance', R.insurance, inputs.insurance_pct_of_egi, 'of EGI'],
      ['Utilities', R.utilities, inputs.utilities_pct_of_egi, 'of EGI'],
      ['Reserves', R.reserves, null, `$${inputs.reserves_per_unit_year || 0}/unit/yr`]
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Stabilized NOI · Cash Flow', 'brrrr')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Unit Mix & Stabilized Rents</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Bed Type</th><th class="num">Units</th><th class="num">Mo. Rent</th><th class="num">Monthly GPR</th><th class="num">Annual GPR</th></tr></thead>
          <tbody>
            ${um.map(u => `
              <tr>
                <td>${_esc((u.bed_type || '').toUpperCase())}</td>
                <td class="num">${u.count || 0}</td>
                <td class="num">${h.fmtMoney(u.rent)}</td>
                <td class="num">${h.fmtMoney((u.count || 0) * (u.rent || 0))}</td>
                <td class="num">${h.fmtMoney((u.count || 0) * (u.rent || 0) * 12)}</td>
              </tr>`).join('')}
            <tr class="totals"><td>Total</td><td class="num">${units}</td><td></td><td class="num">${h.fmtMoney(R.gpr_monthly)}</td><td class="num">${h.fmtMoney(R.gpr_annual)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Operating Build</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Line Item</th><th>Basis</th><th class="num">Amount</th><th class="num">% of EGI</th></tr></thead>
          <tbody>
            <tr><td>Gross Potential Rent</td><td>-</td><td class="num">${h.fmtMoney(R.gpr_annual)}</td><td class="num">${h.fmtPct(R.gpr_annual / Math.max(1, egi))}</td></tr>
            <tr><td>Vacancy Loss</td><td>${h.fmtPct(inputs.vacancy_pct)}</td><td class="num">(${h.fmtMoney(R.vacancy_loss)})</td><td class="num">${h.fmtPct(-R.vacancy_loss / Math.max(1, egi))}</td></tr>
            <tr class="totals"><td>Effective Gross Income</td><td></td><td class="num">${h.fmtMoney(egi)}</td><td class="num">100.0%</td></tr>
            ${opex.map(([lbl, amt, pct, note]) => `
              <tr>
                <td>${_esc(lbl)}</td>
                <td>${pct != null ? h.fmtPct(pct) + ' ' + _esc(note) : _esc(note)}</td>
                <td class="num">(${h.fmtMoney(amt)})</td>
                <td class="num">${h.fmtPct((amt || 0) / Math.max(1, egi))}</td>
              </tr>`).join('')}
            <tr class="totals"><td>Total Operating Expenses</td><td></td><td class="num">(${h.fmtMoney(R.total_operating_expenses)})</td><td class="num">${h.fmtPct(R.expense_ratio)}</td></tr>
            <tr class="totals"><td>Net Operating Income</td><td></td><td class="num">${h.fmtMoney(R.stabilized_noi)}</td><td class="num">${h.fmtPct(R.noi_margin)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>NOI Cushion Indicators</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Breakeven Occupancy</span><span class="pl-val">${h.fmtPct(R.breakeven_occupancy)}</span></div>
          <div class="pl-row"><span class="pl-lbl">NOI per Unit</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi / Math.max(1, units))}</span></div>
          <div class="pl-row"><span class="pl-lbl">Expense Ratio</span><span class="pl-val">${h.fmtPct(R.expense_ratio)}</span></div>
          <div class="pl-row"><span class="pl-lbl">NOI Margin</span><span class="pl-val">${h.fmtPct(R.noi_margin)}</span></div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _page4Ff(deal, R, inputs, market, h, pageNum, totalPages) {
    const cs = (typeof comps === 'object' && Array.isArray(comps)) ? comps : [];
    const sales = cs.filter(c => c && (c.comp_type || 'sales') === 'sales');
    const sqft = R.subject_area_sf || 0;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Renovation Scope · Comp Summary', 'fix_and_flip')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Renovation Scope</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Line</th><th class="num">Amount</th><th class="num">$/SF</th></tr></thead>
          <tbody>
            <tr><td>Renovation Budget</td><td class="num">${h.fmtMoney(inputs.reno_budget)}</td><td class="num">${(sqft > 0 && inputs.reno_budget > 0) ? h.fmtMoney(inputs.reno_budget / sqft) : '-'}</td></tr>
            <tr><td>Mobilization Contingency</td><td class="num">${h.fmtMoney(inputs.mobilization_contingency)}</td><td class="num">${(sqft > 0 && inputs.mobilization_contingency > 0) ? h.fmtMoney(inputs.mobilization_contingency / sqft) : '-'}</td></tr>
            <tr><td>Consulting</td><td class="num">${h.fmtMoney(R.consulting)}</td><td class="num">${(sqft > 0 && R.consulting > 0) ? h.fmtMoney(R.consulting / sqft) : '-'}</td></tr>
            <tr class="totals"><td>Total Renovation Envelope</td><td class="num">${h.fmtMoney((inputs.reno_budget || 0) + (inputs.mobilization_contingency || 0) + (R.consulting || 0))}</td><td class="num">${(sqft > 0) ? h.fmtMoney(((inputs.reno_budget || 0) + (inputs.mobilization_contingency || 0) + (R.consulting || 0)) / sqft) : '-'}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Comparable Sales (Top ${Math.min(sales.length, 5)})</div>
        ${sales.length === 0 ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">No Sales Comps</div>
            ARV is sourced from manual override without comp support. Lender appraiser will derive their own value; sponsor should expect loan sizing based on appraiser's independent assessment.
          </div>
        ` : `
          <table class="print-table ff-comp-table pb-avoid">
            <thead>
              <tr>
                <th>Address</th>
                <th class="num">Sale Price</th>
                <th class="num">SF</th>
                <th class="num">$/SF</th>
                <th class="num">DOM</th>
                <th>Renov.</th>
              </tr>
            </thead>
            <tbody>
              ${sales.slice(0, 5).map(c => {
                const psf = (c.sales_price > 0 && c.area_sf > 0) ? c.sales_price / c.area_sf : null;
                return `
                  <tr>
                    <td>${_esc(c.address || '-')}</td>
                    <td class="num">${h.fmtMoney(c.sales_price)}</td>
                    <td class="num">${c.area_sf ? Number(c.area_sf).toLocaleString() : '-'}</td>
                    <td class="num">${psf ? h.fmtMoney(psf) : '-'}</td>
                    <td class="num">${c.dom != null ? Math.round(c.dom) : '-'}</td>
                    <td>${c.renovated ? 'Yes' : 'No'}</td>
                  </tr>`;
              }).join('')}
              <tr class="totals">
                <td>Average</td>
                <td class="num">-</td>
                <td class="num">-</td>
                <td class="num">${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-'}</td>
                <td class="num">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) : '-'}</td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
        `}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Exit Velocity Indicators</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Average Comp DOM</span><span class="pl-val">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) + ' days' : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Planned Sale Window</span><span class="pl-val">${Math.max(1, (inputs.target_hold_months || 7) - Math.round((inputs.target_hold_months || 7) * 0.7))} months</span></div>
          <div class="pl-row"><span class="pl-lbl">Sale Cost %</span><span class="pl-val">${h.fmtPct(inputs.sale_cost_pct)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Subject $/SF Target</span><span class="pl-val">${(sqft > 0 && R.arv > 0) ? h.fmtMoney(R.arv / sqft) : '-'}</span></div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 5: STRESS SCENARIOS (mode-specific) ──────────────────
  function _page5(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    if (mode === 'brrrr') {
      return _page5Brrrr(deal, R, inputs, market, h, pageNum, totalPages);
    }
    return _page5Ff(deal, R, inputs, market, h, pageNum, totalPages);
  }


  function _page5Brrrr(deal, R, inputs, market, h, pageNum, totalPages) {
    // BRRRR stress: DSCR at +50bp, +100bp on refi rate; +5pp vacancy;
    // -50bp exit cap (softer); 90% of underwritten NOI.

    const baseNOI = R.stabilized_noi || 0;
    const baseRefiLoan = R.refi_loan_amount || 0;
    const baseRate = inputs.refi_rate || 0;
    const baseExitCap = inputs.exit_cap || 0;
    const refiTermMonths = 360;
    const refiIsPI = (inputs.refi_interest_type || 'PI') === 'PI';
    const baseEGI = R.egi || 0;
    const baseVac = inputs.vacancy_pct || 0;
    const baseExpRatio = (baseEGI > 0) ? (R.total_operating_expenses / baseEGI) : 0;
    const baseGpr = R.gpr_annual || 0;

    // Compute amortizing DS for an arbitrary rate/loan
    function _amortDS(loan, annualRate, months) {
      if (!refiIsPI || annualRate <= 0 || months <= 0) return loan * annualRate;
      const m = annualRate / 12;
      const monthly = loan * (m * Math.pow(1 + m, months)) / (Math.pow(1 + m, months) - 1);
      return monthly * 12;
    }

    // Scenario rows: each shows the resulting DSCR + debt yield against
    // the base loan amount (since the loan is what the lender is sizing).
    const baseDS = R.refi_annual_ds || _amortDS(baseRefiLoan, baseRate, refiTermMonths);
    const baseDY = baseRefiLoan > 0 ? baseNOI / baseRefiLoan : null;
    const baseDSCR = baseDS > 0 ? baseNOI / baseDS : null;

    const scenarios = [];
    // Scenario 1: +50bp refi rate
    {
      const ds = _amortDS(baseRefiLoan, baseRate + 0.005, refiTermMonths);
      const dscr = ds > 0 ? baseNOI / ds : null;
      scenarios.push({ label: 'Refi Rate +50bp', dscr, dy: baseDY, noi: baseNOI, ds });
    }
    // Scenario 2: +100bp refi rate
    {
      const ds = _amortDS(baseRefiLoan, baseRate + 0.01, refiTermMonths);
      const dscr = ds > 0 ? baseNOI / ds : null;
      scenarios.push({ label: 'Refi Rate +100bp', dscr, dy: baseDY, noi: baseNOI, ds });
    }
    // Scenario 3: Vacancy +5pp
    {
      const vacRate = Math.min(0.95, baseVac + 0.05);
      const egi = baseGpr * (1 - vacRate);
      const opex = egi * baseExpRatio;
      const noi = egi - opex;
      const dy = baseRefiLoan > 0 ? noi / baseRefiLoan : null;
      const dscr = baseDS > 0 ? noi / baseDS : null;
      scenarios.push({ label: 'Vacancy +5pp', dscr, dy, noi, ds: baseDS });
    }
    // Scenario 4: NOI -10%
    {
      const noi = baseNOI * 0.9;
      const dy = baseRefiLoan > 0 ? noi / baseRefiLoan : null;
      const dscr = baseDS > 0 ? noi / baseDS : null;
      scenarios.push({ label: 'Stabilized NOI -10%', dscr, dy, noi, ds: baseDS });
    }
    // Scenario 5: Exit cap +50bp (softer; reduces ARV → tighter LTV → loan resized)
    {
      const newArv = baseNOI / (baseExitCap + 0.005);
      const newLoan = newArv * (inputs.target_refi_ltv || 0.7);
      const ds = _amortDS(newLoan, baseRate, refiTermMonths);
      const dscr = ds > 0 ? baseNOI / ds : null;
      const dy = newLoan > 0 ? baseNOI / newLoan : null;
      scenarios.push({ label: `Exit Cap +50bp (Loan resizes to ${h.fmtMoneyK(newLoan)})`, dscr, dy, noi: baseNOI, ds });
    }

    function _toneDSCR(d) { if (d == null) return 'neutral'; if (d >= 1.25) return 'good'; if (d >= 1.10) return 'warn'; return 'bad'; }
    function _toneDY(d)   { if (d == null) return 'neutral'; if (d >= 0.10) return 'good'; if (d >= 0.085) return 'warn'; return 'bad'; }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Stress Scenarios', 'brrrr')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Base Case (Underwritten)</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Stabilized NOI</span><span class="pl-val">${h.fmtMoney(baseNOI)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Refi Annual DS</span><span class="pl-val">${h.fmtMoney(baseDS)}</span></div>
          <div class="pl-row"><span class="pl-lbl">DSCR</span><span class="pl-val">${h.fmtX(baseDSCR, 2)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Debt Yield</span><span class="pl-val">${h.fmtPct(baseDY)}</span></div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stress Scenarios</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Scenario</th><th class="num">NOI</th><th class="num">Annual DS</th><th class="num">DSCR</th><th class="num">Debt Yield</th></tr></thead>
          <tbody>
            ${scenarios.map(s => `
              <tr>
                <td>${_esc(s.label)}</td>
                <td class="num">${h.fmtMoney(s.noi)}</td>
                <td class="num">${h.fmtMoney(s.ds)}</td>
                <td class="num lender-stress-${_toneDSCR(s.dscr)}">${h.fmtX(s.dscr, 2)}</td>
                <td class="num lender-stress-${_toneDY(s.dy)}">${h.fmtPct(s.dy)}</td>
              </tr>`).join('')}
          </tbody>
          <caption>Cells colored: red &lt; 1.10x DSCR or &lt; 8.5% DY · amber 1.10-1.25x DSCR or 8.5-10% DY · green ≥ 1.25x DSCR or ≥ 10% DY.</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _page5Ff(deal, R, inputs, market, h, pageNum, totalPages) {
    const baseARV = R.arv || 0;
    const saleCostPct = inputs.sale_cost_pct || 0;
    const remLoan = R.remaining_loan_balance || 0;
    const initEq = R.investor_equity || 1;
    const baseHold = inputs.target_hold_months || 7;
    const annualRate = inputs.initial_rate || 0;
    const baseLoan = R.initial_loan_amt || 0;
    const baseMonthlyCarry = (baseLoan * annualRate) / 12;

    // Scenarios:
    //   1. Sale -5%
    //   2. Sale -10%
    //   3. DOM +60 (more carry)
    //   4. DOM +90 (more carry)
    //   5. Reno overrun +10% (eats into equity)
    function _scenario(label, arvAdj, holdAdj, renoAdj) {
      const adjARV = baseARV * (1 + arvAdj);
      const adjHold = baseHold + holdAdj;
      const adjReno = (inputs.reno_budget || 0) * (1 + renoAdj);
      const adjCarry = baseMonthlyCarry * adjHold;
      // Approximation: sale - sale cost - rem loan - extra carry - extra reno
      const adjSaleCost = adjARV * saleCostPct;
      const extraReno = adjReno - (inputs.reno_budget || 0);
      const extraCarry = baseMonthlyCarry * holdAdj;
      const adjGross = adjARV - adjSaleCost - remLoan - extraReno - extraCarry;
      const adjROI = initEq > 0 ? (adjGross - initEq) / initEq : null;
      return { label, arv: adjARV, gross: adjGross, roi: adjROI };
    }

    const scenarios = [
      _scenario('Sale Price -5%', -0.05, 0, 0),
      _scenario('Sale Price -10%', -0.10, 0, 0),
      _scenario('DOM +60 days', 0, 2, 0),
      _scenario('DOM +90 days', 0, 3, 0),
      _scenario('Reno Overrun +10%', 0, 0, 0.10),
      _scenario('Combined: Sale -5% + DOM +60', -0.05, 2, 0)
    ];

    function _toneROI(r) { if (r == null) return 'neutral'; if (r >= 0.15) return 'good'; if (r >= 0.05) return 'warn'; return 'bad'; }
    function _toneCoverage(g) {
      if (g == null) return 'neutral';
      const coverage = g / Math.max(1, initEq + remLoan);
      // Loan coverage: how much of the loan + equity is recovered from sale
      if (g >= initEq) return 'good';  // recoups equity
      if (g >= 0) return 'warn';        // breaks even on loan only
      return 'bad';                     // underwater
    }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Stress Scenarios', 'fix_and_flip')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Base Case (Underwritten)</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">ARV</span><span class="pl-val">${h.fmtMoney(baseARV)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Hold Period</span><span class="pl-val">${baseHold} months</span></div>
          <div class="pl-row"><span class="pl-lbl">Gross Proceeds</span><span class="pl-val">${h.fmtMoney(R.gross_proceeds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Investor ROI</span><span class="pl-val">${h.fmtPct(R.investor_roi)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Loan Recovery Margin</span><span class="pl-val">${h.fmtMoney((R.gross_proceeds || 0) - (R.remaining_loan_balance || 0))}</span></div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stress Scenarios</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Scenario</th><th class="num">Adj. ARV</th><th class="num">Net Gross</th><th class="num">ROI</th><th class="num">Loan Recovery</th></tr></thead>
          <tbody>
            ${scenarios.map(s => `
              <tr>
                <td>${_esc(s.label)}</td>
                <td class="num">${h.fmtMoney(s.arv)}</td>
                <td class="num">${h.fmtMoney(s.gross)}</td>
                <td class="num lender-stress-${_toneROI(s.roi)}">${h.fmtPct(s.roi)}</td>
                <td class="num lender-stress-${_toneCoverage(s.gross)}">${s.gross >= initEq ? 'Full' : (s.gross >= 0 ? 'Loan only' : 'Underwater')}</td>
              </tr>`).join('')}
          </tbody>
          <caption>Approximations: sale price adjustments hold reno and carry constant; DOM scenarios add carry months at the underwritten rate; reno overrun scenarios hold sale price constant. ROI thresholds: red &lt; 5% · amber 5-15% · green ≥ 15%.</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 6: SPONSOR PROFILE + ASSET SUMMARY + DISCLOSURES ─────
  function _page6(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    const coSub = co && co.subtitle ? co.subtitle : '';
    const contact = (co && co.contact_info) || {};
    const addrLine = _addressLine(deal, inputs);

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sponsor · Asset · Disclosures', mode)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sponsor Profile</div>
        <div class="bp-sponsor pb-avoid">
          <div class="bp-sponsor-name">${_esc(coName)}</div>
          ${coSub ? `<div class="bp-sponsor-sub">${_esc(coSub)}</div>` : ''}
          ${(contact.email || contact.phone || contact.website || contact.address) ? `
            <div class="bp-sponsor-contact">
              ${contact.email ? `<div><span class="bp-sponsor-lbl">Email</span> ${_esc(contact.email)}</div>` : ''}
              ${contact.phone ? `<div><span class="bp-sponsor-lbl">Phone</span> ${_esc(contact.phone)}</div>` : ''}
              ${contact.website ? `<div><span class="bp-sponsor-lbl">Web</span> ${_esc(contact.website)}</div>` : ''}
              ${contact.address ? `<div><span class="bp-sponsor-lbl">Office</span> ${_esc(contact.address)}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Asset Summary</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Property Address</span><span class="pl-val">${_esc(addrLine || 'Not specified')}</span></div>
          <div class="pl-row"><span class="pl-lbl">Asset Type</span><span class="pl-val">${_esc(_assetTypeLabel(inputs.asset_type))}</span></div>
          ${R.total_unit_count > 0 ? `<div class="pl-row"><span class="pl-lbl">Unit Count</span><span class="pl-val">${R.total_unit_count}</span></div>` : ''}
          ${R.subject_area_sf > 0 ? `<div class="pl-row"><span class="pl-lbl">Building Area</span><span class="pl-val">${Number(R.subject_area_sf).toLocaleString()} SF</span></div>` : ''}
          ${mode === 'brrrr' ? `
            <div class="pl-row"><span class="pl-lbl">Purchase Price / Unit</span><span class="pl-val">${h.fmtMoney((inputs.purchase_price || 0) / Math.max(1, R.total_unit_count))}</span></div>
            <div class="pl-row"><span class="pl-lbl">ARV / Unit (Stabilized)</span><span class="pl-val">${h.fmtMoney(R.arv_per_unit)}</span></div>
          ` : `
            <div class="pl-row"><span class="pl-lbl">Acquisition $/SF</span><span class="pl-val">${(R.subject_area_sf > 0 && inputs.purchase_price > 0) ? h.fmtMoney(inputs.purchase_price / R.subject_area_sf) : '-'}</span></div>
            <div class="pl-row"><span class="pl-lbl">Exit $/SF (ARV)</span><span class="pl-val">${(R.subject_area_sf > 0 && R.arv > 0) ? h.fmtMoney(R.arv / R.subject_area_sf) : '-'}</span></div>
          `}
        </div>

        ${market && market.cbsa_name ? `
        <div class="print-section pb-avoid"><span class="ps-accent"></span>Market Context</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">MSA</span><span class="pl-val">${_esc(market.cbsa_name)}</span></div>
          ${market.derived && market.derived.market_strength_grade ? `<div class="pl-row"><span class="pl-lbl">Market Strength</span><span class="pl-val">Grade ${_esc(market.derived.market_strength_grade)} (${Math.round(market.derived.market_strength_score)}/100)</span></div>` : ''}
          ${market.census && market.census.rental_vacancy_rate != null ? `<div class="pl-row"><span class="pl-lbl">Rental Vacancy</span><span class="pl-val">${h.fmtPct(market.census.rental_vacancy_rate)}</span></div>` : ''}
          ${market.census && market.census.unemployment_rate != null ? `<div class="pl-row"><span class="pl-lbl">Unemployment</span><span class="pl-val">${h.fmtPct(market.census.unemployment_rate)}</span></div>` : ''}
        </div>
        ` : ''}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Disclosures</div>
        <div class="bp-disclaimer">
          <p>This package is provided to facilitate the lender's underwriting review and does not constitute an offer of credit or a commitment to lend. All loan terms, including but not limited to amount, rate, term, and covenants, are subject to lender's independent diligence, third-party reports, and credit committee approval.</p>
          <p>Financial projections, including stabilized rent, NOI, ARV, and disposition assumptions, reflect the sponsor's good-faith underwriting based on currently available market data. Actual outcomes may differ materially. Stress scenarios are illustrative and do not represent the full distribution of possible outcomes.</p>
          <p>Sponsor represents that the information herein is accurate to the best of its knowledge as of the date stated. Material changes to deal economics or property condition discovered during diligence will be disclosed promptly.</p>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── TONE HELPERS ──────────────────────────────────────────────
  function _toneAbove(v, highWarn, goodFloor) {
    if (v == null || !isFinite(v)) return 'neutral';
    if (v >= goodFloor) return 'good';
    if (v >= highWarn) return 'warn';
    return 'bad';
  }
  function _toneBelow(v, highWarn, goodCeil) {
    // For ratios where LOWER is BETTER (LTV, LTC, in-basis)
    if (v == null || !isFinite(v)) return 'neutral';
    if (v <= goodCeil) return 'good';
    if (v <= highWarn) return 'warn';
    return 'bad';
  }
  function _pctNorm(x) {
    if (x == null || !isFinite(x)) return null;
    return x > 1.5 ? x / 100 : x;
  }
  function _toneGlyph(tone) {
    if (tone === 'bad')  return '<span class="pk-glyph pk-glyph-bad">▼ </span>';
    if (tone === 'warn') return '<span class="pk-glyph pk-glyph-warn">◆ </span>';
    if (tone === 'good') return '<span class="pk-glyph pk-glyph-good">▲ </span>';
    return '';
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_lender_package(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const mode = (deal && deal.deal_mode) || 'brrrr';
    const totalPages = 6;

    const pages = [
      _page1(deal, R, inputs, market, h, mode, 1, totalPages),
      _page2(deal, R, inputs, market, h, mode, 2, totalPages),
      _page3(deal, R, inputs, market, h, mode, 3, totalPages),
      _page4(deal, R, inputs, market, h, mode, 4, totalPages),
      _page5(deal, R, inputs, market, h, mode, 5, totalPages),
      _page6(deal, R, inputs, market, h, mode, 6, totalPages)
    ];

    return pages.join('\n');
  }

  window.renderReport_lender_package = renderReport_lender_package;

})();
