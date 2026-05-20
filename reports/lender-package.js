// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.6.1 - Lender Package Report (5-page consolidated)
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
// PAGES (mode-aware, 5 pages)
//   1  Cover + Executive Summary + Loan Request + Debt Metrics
//   2  S&U + Capital Stack + Sponsor Skin + Initial Debt Terms
//   3  BRRRR: Refi Takeout + Bridge Payoff + Refi Position
//      F&F:   ARV Defense + Disposition + Exit Velocity
//   4  BRRRR: Unit Mix + Operating Build + Stress Scenarios
//      F&F:   Reno Scope + Comp Set + Stress Scenarios
//   5  Sponsor + Asset + Market + Disclosures
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

  // Per-door helpers (Path C UX). Returns just the per-unit figure for
  // dropping into a "$/Door" table column. Returns empty string when
  // units = 0 so column cells stay clean.
  function _perDoorOnly(value, units) {
    if (!units || units <= 0 || value == null || !isFinite(value) || value === 0) return '';
    return '$' + Math.round(Number(value) / units).toLocaleString() + '/door';
  }


  // ── HEADER + FOOTER ───────────────────────────────────────────
  function _header(h, pageLabel, mode) {
    // Defensive logo resolution. See brrrr-package.js _header for rationale.
    let co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    if (co && !co.logo_base64 && typeof CP === 'object' && CP && Array.isArray(CP.list)) {
      const withLogo = CP.list.find(c => c && c.logo_base64);
      if (withLogo) co = withLogo;
    }
    if (!co && typeof CP === 'object' && CP && Array.isArray(CP.list) && CP.list.length) {
      co = CP.list.find(c => c && c.logo_base64) || CP.list[0];
    }
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


  // ── PAGE 1: COVER + EXEC SUMMARY + LOAN REQUEST + DEBT METRICS
  function _page1(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);
    const showAddrSub = addrLine && !_normForCmp(dealName).includes(_normForCmp(addrLine));
    const modeLbl = _modeLabel(mode);

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

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Executive Summary</div>
        ${_execSummary(deal, R, inputs, mode, market, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Loan Request</div>
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


  function _execSummary(deal, R, inputs, mode, market, h) {
    const units = R.total_unit_count || 0;
    const city = inputs.city || '';
    const state = inputs.state || '';
    const grade = market && market.derived ? market.derived.market_strength_grade : null;

    let para;
    if (mode === 'brrrr') {
      para = `${h.fmtMoneyK(R.initial_loan_amt)} bridge facility against a ${units}-unit ${_assetTypeLabel(inputs.asset_type).toLowerCase()} acquisition in ${_esc(city)}${state ? ', ' + _esc(state) : ''} (${h.fmtMoneyK(R.total_project_cost)} TPC). Takeout strategy: agency refinance in month ${inputs.target_refi_months || 9} at ${h.fmtPct(inputs.target_refi_ltv, 0)} LTV (${h.fmtMoneyK(R.refi_loan_amount)} sized to ${h.fmtX(R.dscr, 2)} DSCR), retiring the bridge in full${R.dscr >= 1.20 ? ' with coverage cushion above the agency 1.20x floor' : '; coverage runs thin and may require a rate buydown or extended IO period at the bridge level'}.${grade ? ' Submarket grade: ' + _esc(grade) + '.' : ''}`;
    } else {
      const ltv = (R.initial_loan_amt > 0 && R.arv > 0) ? R.initial_loan_amt / R.arv : null;
      para = `${h.fmtMoneyK(R.initial_loan_amt)} acquisition + reno bridge against a ${_assetTypeLabel(inputs.asset_type).toLowerCase()} in ${_esc(city)}${state ? ', ' + _esc(state) : ''}${R.subject_area_sf > 0 ? ' (' + Number(R.subject_area_sf).toLocaleString() + ' SF)' : ''}. Exit strategy: sale at ${h.fmtMoneyK(R.arv)} ARV${R.arv_source === 'override' ? ' (manual override)' : ' (' + (R.comp_count_sales || 0) + '-comp set)'} over a ${inputs.target_hold_months || 0}-month hold, generating ${h.fmtMoneyK(R.gross_proceeds)} in gross proceeds against ${h.fmtPct(ltv)} LTV at origination.${grade ? ' Submarket grade: ' + _esc(grade) + '.' : ''}`;
    }

    return `<div class="bp-narrative pb-avoid"><p>${para}</p></div>`;
  }


  function _loanRequest(R, inputs, mode, h) {
    const rows = [];
    if (mode === 'brrrr') {
      const acqTranche = R.acquisition_tranche || 0;
      const conTranche = R.construction_tranche || 0;
      const capexDur = R.capex_duration_months_resolved || 6;
      rows.push(['Loan Type',          'Bridge (with refi takeout)']);
      rows.push(['Requested Amount',   h.fmtMoney(R.initial_loan_amt)]);
      rows.push(['Acquisition Tranche', `${h.fmtMoney(acqTranche)} (${h.fmtPct(inputs.initial_loan_ltv)} of purchase)`]);
      rows.push(['Construction Tranche', `${h.fmtMoney(conTranche)} (${h.fmtPct(inputs.initial_loan_ltc_capex)} of capex, draws over ${capexDur} mo)`]);
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


  // ── PAGE 2: S&U + CAP STACK + SKIN + INITIAL DEBT TERMS ───────
  function _page2(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    const initialLoan = R.initial_loan_amt || 0;
    const investorEquity = mode === 'brrrr' ? (R.initial_investor_equity || 0) : (R.investor_equity || 0);
    const totalSources = initialLoan + investorEquity;

    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const closing = R.closing_costs || 0;
    const consulting = R.consulting || 0;
    const carry = mode === 'brrrr' ? (R.debt_service_pre_refi || 0) : (R.debt_service_pre_sale || 0);
    const contingency = inputs.gc_contingency || 0;
    const totalUses = purchase + capex + closing + consulting + carry + contingency;

    // GC contingency held-back disclosure: surface as a Source when contingency
    // exists but is not funded by equity at closing.
    const eqMobIfEq = R.equity_gc_contingency_if_equity || 0;
    const gcHeldBack = contingency > 0 && eqMobIfEq === 0;
    const heldBackAmt = gcHeldBack ? contingency : 0;
    const totalSourcesWithHeldBack = totalSources + heldBackAmt;

    const sponsorPct = totalSourcesWithHeldBack > 0 ? investorEquity / totalSourcesWithHeldBack : 0;
    const loanPct = totalSourcesWithHeldBack > 0 ? initialLoan / totalSourcesWithHeldBack : 0;

    // M0.2 BRRRR: surface the two bridge tranches in Sources.
    const acqTranche = R.acquisition_tranche || 0;
    const conTranche = R.construction_tranche || 0;
    const acqPct = totalSourcesWithHeldBack > 0 ? acqTranche / totalSourcesWithHeldBack : 0;
    const conPct = totalSourcesWithHeldBack > 0 ? conTranche / totalSourcesWithHeldBack : 0;

    const sourcesBlock = mode === 'brrrr' ? `
      <table class="print-table pb-avoid">
        <thead><tr><th>Sources</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">%</th></tr></thead>
        <tbody>
          <tr><td>Senior Debt: Acquisition Tranche</td><td class="num">${h.fmtMoney(acqTranche)}</td><td class="num">${_pd(acqTranche)}</td><td class="num">${h.fmtPct(acqPct)}</td></tr>
          <tr><td>Senior Debt: Construction Tranche</td><td class="num">${h.fmtMoney(conTranche)}</td><td class="num">${_pd(conTranche)}</td><td class="num">${h.fmtPct(conPct)}</td></tr>
          <tr><td style="padding-left:1.5em">Total Bridge</td><td class="num">${h.fmtMoney(initialLoan)}</td><td class="num">${_pd(initialLoan)}</td><td class="num">${h.fmtPct(loanPct)}</td></tr>
          <tr><td>Investor Equity</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${_pd(investorEquity)}</td><td class="num">${h.fmtPct(sponsorPct)}</td></tr>
          ${gcHeldBack ? `<tr><td>GC Contingency (held back, not at closing)</td><td class="num">${h.fmtMoney(heldBackAmt)}</td><td class="num">${_pd(heldBackAmt)}</td><td class="num">${h.fmtPct(heldBackAmt / Math.max(1, totalSourcesWithHeldBack))}</td></tr>` : ''}
          <tr class="totals"><td>Total Sources</td><td class="num">${h.fmtMoney(totalSourcesWithHeldBack)}</td><td class="num">${_pd(totalSourcesWithHeldBack)}</td><td class="num">100.0%</td></tr>
        </tbody>
      </table>
    ` : `
      <table class="print-table pb-avoid">
        <thead><tr><th>Sources</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">%</th></tr></thead>
        <tbody>
          <tr><td>Requested Loan</td><td class="num">${h.fmtMoney(initialLoan)}</td><td class="num">${_pd(initialLoan)}</td><td class="num">${h.fmtPct(loanPct)}</td></tr>
          <tr><td>Investor Equity</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${_pd(investorEquity)}</td><td class="num">${h.fmtPct(sponsorPct)}</td></tr>
          ${gcHeldBack ? `<tr><td>GC Contingency (held back, not at closing)</td><td class="num">${h.fmtMoney(heldBackAmt)}</td><td class="num">${_pd(heldBackAmt)}</td><td class="num">${h.fmtPct(heldBackAmt / Math.max(1, totalSourcesWithHeldBack))}</td></tr>` : ''}
          <tr class="totals"><td>Total Sources</td><td class="num">${h.fmtMoney(totalSourcesWithHeldBack)}</td><td class="num">${_pd(totalSourcesWithHeldBack)}</td><td class="num">100.0%</td></tr>
        </tbody>
      </table>
    `;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sources & Uses · Capital Stack · Initial Debt', mode)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sources & Uses</div>
        <div class="bp-su-grid">
          ${sourcesBlock}

          <table class="print-table pb-avoid">
            <thead><tr><th>Uses</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Purchase Price</td><td class="num">${h.fmtMoney(purchase)}</td><td class="num">${_pd(purchase)}</td><td class="num">${h.fmtPct(purchase / Math.max(1, totalUses))}</td></tr>
              <tr><td>Capex Budget</td><td class="num">${h.fmtMoney(capex)}</td><td class="num">${_pd(capex)}</td><td class="num">${h.fmtPct(capex / Math.max(1, totalUses))}</td></tr>
              <tr><td>Closing Costs</td><td class="num">${h.fmtMoney(closing)}</td><td class="num">${_pd(closing)}</td><td class="num">${h.fmtPct(closing / Math.max(1, totalUses))}</td></tr>
              <tr><td>Consulting</td><td class="num">${h.fmtMoney(consulting)}</td><td class="num">${_pd(consulting)}</td><td class="num">${h.fmtPct(consulting / Math.max(1, totalUses))}</td></tr>
              <tr><td>Carry (DS through ${mode === 'brrrr' ? 'Refi' : 'Sale'})</td><td class="num">${h.fmtMoney(carry)}</td><td class="num">${_pd(carry)}</td><td class="num">${h.fmtPct(carry / Math.max(1, totalUses))}</td></tr>
              <tr><td>GC Contingency Reserve</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${_pd(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, totalUses))}</td></tr>
              <tr class="totals"><td>Total Uses</td><td class="num">${h.fmtMoney(totalUses)}</td><td class="num">${_pd(totalUses)}</td><td class="num">100.0%</td></tr>
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
              <span class="bp-seg-lbl">Investor Equity</span>
              <span class="bp-seg-val">${h.fmtPct(sponsorPct, 0)}</span>
            </div>
          </div>
        </div>

        <div class="lender-twocol pb-avoid">
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Equity at Risk</div>
            <table class="print-table">
              <thead><tr><th>Component</th><th class="num">Amount</th><th class="num">% TPC</th></tr></thead>
              <tbody>
                <tr><td>Investor Cash Equity at Closing</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${h.fmtPct(investorEquity / Math.max(1, R.total_project_cost))}</td></tr>
                <tr><td>GC Contingency${gcHeldBack ? ' (held back, drawn only on overrun)' : ' (funded at closing)'}</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, R.total_project_cost))}</td></tr>
                <tr class="totals"><td>Total Capital at Risk</td><td class="num">${h.fmtMoney(investorEquity + contingency)}</td><td class="num">${h.fmtPct((investorEquity + contingency) / Math.max(1, R.total_project_cost))}</td></tr>
              </tbody>
            </table>
            <div style="font-size:8.5pt;color:var(--print-muted);margin-top:6pt;line-height:1.4">
              Investor funds 100% of cash equity in exchange for pro-rata ownership in the deal LLC. Sponsor contributes operational execution (acquisition, capex, asset management, refinance, disposition) and assumes recourse exposure on the bridge loan.
            </div>
          </div>

          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Initial Debt Terms</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              ${mode === 'brrrr' ? `
              <div class="pl-row"><span class="pl-lbl">Acquisition Tranche</span><span class="pl-val">${h.fmtMoney(R.acquisition_tranche || 0)} (${h.fmtPct(inputs.initial_loan_ltv)} of purchase)</span></div>
              <div class="pl-row"><span class="pl-lbl">Construction Tranche</span><span class="pl-val">${h.fmtMoney(R.construction_tranche || 0)} (${h.fmtPct(inputs.initial_loan_ltc_capex)} of capex)</span></div>
              <div class="pl-row"><span class="pl-lbl">Total Bridge</span><span class="pl-val">${h.fmtMoney(R.initial_loan_amt)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Rate / Type</span><span class="pl-val">${h.fmtPct(inputs.initial_rate, 2)} ${_esc(inputs.initial_interest_type || 'IO')}</span></div>
              <div class="pl-row"><span class="pl-lbl">Monthly DS (full balance)</span><span class="pl-val">${h.fmtMoney(R.initial_monthly_ds)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Capex Execution Window</span><span class="pl-val">${R.capex_duration_months_resolved || 6} months</span></div>
              <div class="pl-row"><span class="pl-lbl">Term to Refi</span><span class="pl-val">${inputs.target_refi_months || 9} months</span></div>
              <div class="pl-row"><span class="pl-lbl">Total Carry to Refi</span><span class="pl-val">${h.fmtMoney(R.debt_service_pre_refi)}</span></div>
              ` : `
              <div class="pl-row"><span class="pl-lbl">Loan Amount</span><span class="pl-val">${h.fmtMoney(R.initial_loan_amt)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Rate / Type</span><span class="pl-val">${h.fmtPct(inputs.initial_rate, 2)} ${_esc(inputs.initial_interest_type || 'IO')}</span></div>
              <div class="pl-row"><span class="pl-lbl">LTV (Purchase)</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltv)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Monthly DS</span><span class="pl-val">${h.fmtMoney(R.initial_monthly_ds)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Term</span><span class="pl-val">${(inputs.target_hold_months || 0) + ' mo to sale'}</span></div>
              <div class="pl-row"><span class="pl-lbl">Total DS Through Sale</span><span class="pl-val">${h.fmtMoney(R.debt_service_pre_sale)}</span></div>
              `}
            </div>
          </div>
        </div>

        ${/* Ownership & Distribution Structure block intentionally
            omitted from Lender Package. It was producing two issues:
            (1) the block was overflowing page 2, orphaning to page 3
            with only a footer and ~75% blank space, and (2) the block
            exposed equity-partner content (Capital Partner ownership
            split, Sponsor Closing Contribution $0, waterfall absence)
            that is strategically inappropriate for a debt audience.
            Lenders care about borrowing entity, recourse exposure, and
            capital at risk against the loan -- those are already
            covered on this page in the "Equity at Risk" block which
            correctly frames the same underlying numbers from a lender
            perspective ($162K capital at risk, recourse exposure noted).
            The Ownership & Distribution block remains on the BRRRR
            Package where equity partners actually need to see it. */ ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── OWNERSHIP & DISTRIBUTION STRUCTURE ────────────────────────
  // Discloses the actual deal LLC ownership structure for the lender.
  // In Foundry's deal-by-deal model, the Capital Partner funds 100% of
  // equity at closing in exchange for pro-rata ownership in the deal
  // LLC. The Sponsor (ASJP) contributes operational execution in lieu
  // of cash equity. Cash flow and disposition proceeds split pro-rata
  // to ownership. Material for the lender to understand who is on the
  // hook and how returns flow.
  function _ownershipDistributionBlock(R, inputs, h) {
    const ownPct = Number(inputs.investor_ownership) || 0;
    const equityIn = Number(R.initial_investor_equity) || 0;
    if (ownPct <= 0 || equityIn <= 0) return '';

    const sponsorOwn = 1 - ownPct;
    const fmtP = (p) => (Math.round(p * 1000) / 10).toFixed(1) + '%';

    return `
      <div class="print-section pb-avoid"><span class="ps-accent"></span>Ownership &amp; Distribution Structure</div>
      <table class="print-table pb-avoid">
        <tbody>
          <tr><td>Deal LLC</td><td class="num">ASJP / Capital Partner Joint Venture</td></tr>
          <tr><td>Capital Partner Ownership</td><td class="num">${fmtP(ownPct)}</td></tr>
          <tr><td>Sponsor (ASJP) Ownership</td><td class="num">${fmtP(sponsorOwn)}</td></tr>
          <tr><td>Capital Partner Closing Contribution</td><td class="num">${h.fmtMoney(equityIn)} (100%)</td></tr>
          <tr><td>Sponsor Closing Contribution</td><td class="num">$0</td></tr>
          <tr><td>Sponsor Contribution-in-Kind</td><td class="num">Acquisition, capex execution, asset management, refinance, disposition</td></tr>
          <tr><td>Cash Flow Distribution</td><td class="num">Pro-rata to ownership (${fmtP(ownPct)} / ${fmtP(sponsorOwn)})</td></tr>
          <tr><td>Disposition Proceeds Distribution</td><td class="num">Pro-rata to ownership (${fmtP(ownPct)} / ${fmtP(sponsorOwn)})</td></tr>
          <tr><td>Promote / Waterfall</td><td class="num">None - straight pro-rata</td></tr>
          <tr><td>Preferred Return</td><td class="num">None</td></tr>
        </tbody>
      </table>`;
  }


  // ── PAGE 3: REFI TAKEOUT (BRRRR) or ARV DEFENSE (F&F) ─────────
  function _page3(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    if (mode === 'brrrr') return _page3Brrrr(deal, R, inputs, market, h, pageNum, totalPages);
    return _page3Ff(deal, R, inputs, market, h, pageNum, totalPages);
  }


  function _page3Brrrr(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0) ? R.refi_loan_amount / R.stabilized_arv : null;
    const debt_yield = (R.stabilized_noi > 0 && R.refi_loan_amount > 0) ? R.stabilized_noi / R.refi_loan_amount : null;
    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Refinance Takeout', 'brrrr')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Refinance Takeout Sizing</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Value</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>Stabilized NOI</td><td class="num">${h.fmtMoney(R.stabilized_noi)}</td><td class="num">${_pd(R.stabilized_noi)}</td></tr>
            <tr><td>Exit Cap Rate</td><td class="num">${h.fmtPct(inputs.exit_cap, 2)}</td><td class="num"></td></tr>
            <tr class="totals"><td>Stabilized ARV (NOI / Exit Cap)</td><td class="num">${h.fmtMoney(R.stabilized_arv)}</td><td class="num">${_pd(R.stabilized_arv)}</td></tr>
            <tr><td>Target Refi LTV</td><td class="num">${h.fmtPct(inputs.target_refi_ltv)}</td><td class="num"></td></tr>
            <tr class="totals"><td>Refi Loan Amount</td><td class="num">${h.fmtMoney(R.refi_loan_amount)}</td><td class="num">${_pd(R.refi_loan_amount)}</td></tr>
            <tr><td>Effective Refi LTV</td><td class="num">${h.fmtPct(refi_ltv)}</td><td class="num"></td></tr>
            <tr><td>Refi Rate / Type</td><td class="num">${h.fmtPct(inputs.refi_rate, 2)} ${_esc(inputs.refi_interest_type || 'PI')}</td><td class="num"></td></tr>
            <tr><td>Refi Monthly DS</td><td class="num">${h.fmtMoney(R.refi_monthly_ds)}</td><td class="num"></td></tr>
            <tr><td>Refi Annual DS</td><td class="num">${h.fmtMoney(R.refi_annual_ds)}</td><td class="num">${_pd(R.refi_annual_ds)}</td></tr>
            <tr class="totals"><td>DSCR (NOI / Refi DS)</td><td class="num">${h.fmtX(R.dscr, 2)}</td><td class="num"></td></tr>
            <tr class="totals"><td>Debt Yield (NOI / Refi Loan)</td><td class="num">${h.fmtPct(debt_yield)}</td><td class="num"></td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Bridge Payoff at Refi</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Step</th><th class="num">Amount</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>New Refi Loan Proceeds</td><td class="num">${h.fmtMoney(R.refi_loan_amount)}</td><td class="num">${_pd(R.refi_loan_amount)}</td></tr>
            <tr><td>Less: Bridge Loan Payoff</td><td class="num">(${h.fmtMoney(R.payoff_existing_debt || R.initial_loan_amt)})</td><td class="num">${_pd(R.payoff_existing_debt || R.initial_loan_amt)}</td></tr>
            <tr><td>Less: Refi Closing Costs (${h.fmtPct(inputs.refi_closing_cost_pct || 0, 1)})</td><td class="num">(${h.fmtMoney(R.refi_closing_costs)})</td><td class="num">${_pd(R.refi_closing_costs)}</td></tr>
            <tr class="totals"><td>Net Cash Out to Sponsor</td><td class="num">${h.fmtMoney(R.net_cash_out)}</td><td class="num">${_pd(R.net_cash_out)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Refi Position Indicators</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Post-Refi In-Basis</span><span class="pl-val">${h.fmtPct(_pctNorm(R.post_refi_in_basis_pct))}</span></div>
          <div class="pl-row"><span class="pl-lbl">Capital Recapture</span><span class="pl-val">${h.fmtPct(_pctNorm(R.capital_recaptured_pct))}</span></div>
          <div class="pl-row"><span class="pl-lbl">Refi Price per Unit</span><span class="pl-val">${h.fmtMoney(R.refi_price_per_unit)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Investor Equity Remaining</span><span class="pl-val">${h.fmtMoney(R.investor_equity_remaining)}</span></div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _page3Ff(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    const sqft = R.subject_area_sf || 0;
    const compARV = R.comp_derived_arv || 0;
    const finalARV = R.arv || 0;
    const override_diff = (compARV > 0 && R.arv_source === 'override')
      ? (finalARV - compARV) / compARV : null;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'ARV Defense · Disposition', 'fix_and_flip')}

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
          <thead><tr><th>Step</th><th class="num">Amount</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>Disposition Value (Final ARV)</td><td class="num">${h.fmtMoney(R.disposition_value)}</td><td class="num">${_pd(R.disposition_value)}</td></tr>
            <tr><td>Less: Sale Cost (${h.fmtPct(inputs.sale_cost_pct)})</td><td class="num">(${h.fmtMoney(R.sale_cost)})</td><td class="num">${_pd(R.sale_cost)}</td></tr>
            <tr><td>Less: Loan Payoff</td><td class="num">(${h.fmtMoney(R.remaining_loan_balance)})</td><td class="num">${_pd(R.remaining_loan_balance)}</td></tr>
            <tr class="totals"><td>Gross Proceeds to Sponsor</td><td class="num">${h.fmtMoney(R.gross_proceeds)}</td><td class="num">${_pd(R.gross_proceeds)}</td></tr>
          </tbody>
        </table>

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


  // ── PAGE 4: OPERATING + STRESS (BRRRR) or RENO + COMPS + STRESS (F&F)
  function _page4(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    if (mode === 'brrrr') return _page4Brrrr(deal, R, inputs, market, h, pageNum, totalPages);
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

    const baseNOI = R.stabilized_noi || 0;
    const baseRefiLoan = R.refi_loan_amount || 0;
    const baseRate = inputs.refi_rate || 0;
    const baseExitCap = inputs.exit_cap || 0;
    const refiIsPI = (inputs.refi_interest_type || 'PI') === 'PI';
    const baseEGI = R.egi || 0;
    const baseVac = inputs.vacancy_pct || 0;
    const baseExpRatio = (baseEGI > 0) ? (R.total_operating_expenses / baseEGI) : 0;
    const baseGpr = R.gpr_annual || 0;

    function _amortDS(loan, annualRate, months) {
      if (!refiIsPI || annualRate <= 0 || months <= 0) return loan * annualRate;
      const m = annualRate / 12;
      const monthly = loan * (m * Math.pow(1 + m, months)) / (Math.pow(1 + m, months) - 1);
      return monthly * 12;
    }

    const baseDS = R.refi_annual_ds || _amortDS(baseRefiLoan, baseRate, 360);
    const baseDY = baseRefiLoan > 0 ? baseNOI / baseRefiLoan : null;
    const baseDSCR = baseDS > 0 ? baseNOI / baseDS : null;

    const scenarios = [];
    scenarios.push((function() {
      const ds = _amortDS(baseRefiLoan, baseRate + 0.005, 360);
      return { label: 'Refi Rate +50bp', noi: baseNOI, ds, dscr: ds > 0 ? baseNOI / ds : null, dy: baseDY };
    })());
    scenarios.push((function() {
      const ds = _amortDS(baseRefiLoan, baseRate + 0.01, 360);
      return { label: 'Refi Rate +100bp', noi: baseNOI, ds, dscr: ds > 0 ? baseNOI / ds : null, dy: baseDY };
    })());
    scenarios.push((function() {
      const vacRate = Math.min(0.95, baseVac + 0.05);
      const egi2 = baseGpr * (1 - vacRate);
      const noi = egi2 - egi2 * baseExpRatio;
      return { label: 'Vacancy +5pp', noi, ds: baseDS, dscr: baseDS > 0 ? noi / baseDS : null, dy: baseRefiLoan > 0 ? noi / baseRefiLoan : null };
    })());
    scenarios.push((function() {
      const noi = baseNOI * 0.9;
      return { label: 'NOI -10%', noi, ds: baseDS, dscr: baseDS > 0 ? noi / baseDS : null, dy: baseRefiLoan > 0 ? noi / baseRefiLoan : null };
    })());
    scenarios.push((function() {
      const newArv = baseNOI / (baseExitCap + 0.005);
      const newLoan = newArv * (inputs.target_refi_ltv || 0.7);
      const ds = _amortDS(newLoan, baseRate, 360);
      return { label: `Exit Cap +50bp (Loan→${h.fmtMoneyK(newLoan)})`, noi: baseNOI, ds, dscr: ds > 0 ? baseNOI / ds : null, dy: newLoan > 0 ? baseNOI / newLoan : null };
    })());

    function _toneDSCR(d) { if (d == null) return 'neutral'; if (d >= 1.25) return 'good'; if (d >= 1.10) return 'warn'; return 'bad'; }
    function _toneDY(d)   { if (d == null) return 'neutral'; if (d >= 0.10) return 'good'; if (d >= 0.085) return 'warn'; return 'bad'; }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'NOI Build · Stress Scenarios', 'brrrr')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Unit Mix & Stabilized Operations</div>
        <div class="lender-twocol pb-avoid">
          <table class="print-table">
            <thead><tr><th>Bed</th><th class="num">Units</th><th class="num">Rent</th><th class="num">Annual GPR</th></tr></thead>
            <tbody>
              ${um.map(u => `
                <tr>
                  <td>${_esc((u.bed_type || '').toUpperCase())}</td>
                  <td class="num">${u.count || 0}</td>
                  <td class="num">${h.fmtMoney(u.rent)}</td>
                  <td class="num">${h.fmtMoney((u.count || 0) * (u.rent || 0) * 12)}</td>
                </tr>`).join('')}
              <tr class="totals"><td>Total</td><td class="num">${units}</td><td></td><td class="num">${h.fmtMoney(R.gpr_annual)}</td></tr>
            </tbody>
          </table>

          <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
            <div class="pl-row"><span class="pl-lbl">Stabilized NOI</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi)}</span></div>
            <div class="pl-row"><span class="pl-lbl">NOI Margin</span><span class="pl-val">${h.fmtPct(R.noi_margin)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Expense Ratio</span><span class="pl-val">${h.fmtPct(R.expense_ratio)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Breakeven Occupancy</span><span class="pl-val">${h.fmtPct(R.breakeven_occupancy)}</span></div>
            <div class="pl-row"><span class="pl-lbl">NOI per Unit</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi / Math.max(1, units))}</span></div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Operating Expense Detail</div>
        <table class="print-table pb-avoid lender-opex-compact">
          <thead><tr><th>Line Item</th><th>Basis</th><th class="num">Amount</th><th class="num">% of EGI</th></tr></thead>
          <tbody>
            <tr><td>GPR</td><td>-</td><td class="num">${h.fmtMoney(R.gpr_annual)}</td><td class="num">${h.fmtPct(R.gpr_annual / Math.max(1, egi))}</td></tr>
            <tr><td>Vacancy Loss</td><td>${h.fmtPct(inputs.vacancy_pct)}</td><td class="num">(${h.fmtMoney(R.vacancy_loss)})</td><td class="num">-${h.fmtPct(R.vacancy_loss / Math.max(1, egi))}</td></tr>
            <tr class="totals"><td>EGI</td><td></td><td class="num">${h.fmtMoney(egi)}</td><td class="num">100.0%</td></tr>
            ${opex.map(([lbl, amt, pct, note]) => `
              <tr>
                <td>${_esc(lbl)}</td>
                <td>${pct != null ? h.fmtPct(pct) + ' ' + _esc(note) : _esc(note)}</td>
                <td class="num">(${h.fmtMoney(amt)})</td>
                <td class="num">${h.fmtPct((amt || 0) / Math.max(1, egi))}</td>
              </tr>`).join('')}
            <tr class="totals"><td>Total OpEx</td><td></td><td class="num">(${h.fmtMoney(R.total_operating_expenses)})</td><td class="num">${h.fmtPct(R.expense_ratio)}</td></tr>
            <tr class="totals"><td>NOI</td><td></td><td class="num">${h.fmtMoney(R.stabilized_noi)}</td><td class="num">${h.fmtPct(R.noi_margin)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stress Scenarios (Base: ${h.fmtX(baseDSCR, 2)} DSCR · ${h.fmtPct(baseDY)} DY)</div>
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
          <caption>Red &lt; 1.10x DSCR or &lt; 8.5% DY · amber 1.10-1.25x or 8.5-10% · green ≥ 1.25x or ≥ 10%.</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _page4Ff(deal, R, inputs, market, h, pageNum, totalPages) {
    const cs = (typeof comps === 'object' && Array.isArray(comps)) ? comps : [];
    const sales = cs.filter(c => c && (c.comp_type || 'sales') === 'sales');
    const sqft = R.subject_area_sf || 0;

    const baseARV = R.arv || 0;
    const saleCostPct = inputs.sale_cost_pct || 0;
    const remLoan = R.remaining_loan_balance || 0;
    const initEq = R.investor_equity || 1;
    const baseHold = inputs.target_hold_months || 7;
    const annualRate = inputs.initial_rate || 0;
    const baseLoan = R.initial_loan_amt || 0;
    const baseMonthlyCarry = (baseLoan * annualRate) / 12;

    function _scenario(label, arvAdj, holdAdj, renoAdj) {
      const adjARV = baseARV * (1 + arvAdj);
      const adjReno = (inputs.capex_budget || 0) * (1 + renoAdj);
      const adjSaleCost = adjARV * saleCostPct;
      const extraReno = adjReno - (inputs.capex_budget || 0);
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
      if (g >= initEq) return 'good';
      if (g >= 0) return 'warn';
      return 'bad';
    }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Renovation · Comps · Stress', 'fix_and_flip')}

        <div class="lender-twocol pb-avoid">
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Renovation Scope</div>
            <table class="print-table">
              <thead><tr><th>Line</th><th class="num">Amount</th><th class="num">$/SF</th></tr></thead>
              <tbody>
                <tr><td>Capex Budget</td><td class="num">${h.fmtMoney(inputs.capex_budget)}</td><td class="num">${(sqft > 0 && inputs.capex_budget > 0) ? h.fmtMoney(inputs.capex_budget / sqft) : '-'}</td></tr>
                <tr><td>GC Contingency Reserve</td><td class="num">${h.fmtMoney(inputs.gc_contingency)}</td><td class="num">${(sqft > 0 && inputs.gc_contingency > 0) ? h.fmtMoney(inputs.gc_contingency / sqft) : '-'}</td></tr>
                <tr><td>Consulting</td><td class="num">${h.fmtMoney(R.consulting)}</td><td class="num">${(sqft > 0 && R.consulting > 0) ? h.fmtMoney(R.consulting / sqft) : '-'}</td></tr>
                <tr class="totals"><td>Total Envelope</td><td class="num">${h.fmtMoney((inputs.capex_budget || 0) + (inputs.gc_contingency || 0) + (R.consulting || 0))}</td><td class="num">${(sqft > 0) ? h.fmtMoney(((inputs.capex_budget || 0) + (inputs.gc_contingency || 0) + (R.consulting || 0)) / sqft) : '-'}</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Exit Velocity</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">Avg Comp DOM</span><span class="pl-val">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) + ' days' : '-'}</span></div>
              <div class="pl-row"><span class="pl-lbl">Sale Window</span><span class="pl-val">${Math.max(1, baseHold - Math.round(baseHold * 0.7))} months</span></div>
              <div class="pl-row"><span class="pl-lbl">Sale Cost %</span><span class="pl-val">${h.fmtPct(inputs.sale_cost_pct)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Subject $/SF Target</span><span class="pl-val">${(sqft > 0 && R.arv > 0) ? h.fmtMoney(R.arv / sqft) : '-'}</span></div>
            </div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Top Sales Comps</div>
        ${sales.length === 0 ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">No Sales Comps</div>
            ARV is sourced from manual override without comp support. Lender appraiser will derive their own value.
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

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stress Scenarios (Base: ${h.fmtPct(R.investor_roi)} ROI)</div>
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
          <caption>Sale-price scenarios hold reno and carry constant; DOM scenarios add carry at the underwritten rate; reno overrun holds sale price constant. ROI: red &lt; 5% · amber 5-15% · green ≥ 15%.</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 5: SPONSOR + ASSET + MARKET + DISCLOSURES ────────────
  function _page5(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    const coSub = co && co.subtitle ? co.subtitle : '';
    const contact = (co && co.contact_info) || {};
    const addrLine = _addressLine(deal, inputs);

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sponsor · Asset · Notices and Disclaimers', mode)}

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

        <div class="lender-twocol pb-avoid">
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Asset Summary</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">Property Address</span><span class="pl-val">${_esc(addrLine || 'Not specified')}</span></div>
              <div class="pl-row"><span class="pl-lbl">Asset Type</span><span class="pl-val">${_esc(_assetTypeLabel(inputs.asset_type))}</span></div>
              ${R.total_unit_count > 0 ? `<div class="pl-row"><span class="pl-lbl">Unit Count</span><span class="pl-val">${R.total_unit_count}</span></div>` : ''}
              ${R.subject_area_sf > 0 ? `<div class="pl-row"><span class="pl-lbl">Building Area</span><span class="pl-val">${Number(R.subject_area_sf).toLocaleString()} SF</span></div>` : ''}
              ${mode === 'brrrr' ? `
                <div class="pl-row"><span class="pl-lbl">Purchase / Unit</span><span class="pl-val">${h.fmtMoney((inputs.purchase_price || 0) / Math.max(1, R.total_unit_count))}</span></div>
                <div class="pl-row"><span class="pl-lbl">ARV / Unit</span><span class="pl-val">${h.fmtMoney(R.arv_per_unit)}</span></div>
              ` : `
                <div class="pl-row"><span class="pl-lbl">Acquisition $/SF</span><span class="pl-val">${(R.subject_area_sf > 0 && inputs.purchase_price > 0) ? h.fmtMoney(inputs.purchase_price / R.subject_area_sf) : '-'}</span></div>
                <div class="pl-row"><span class="pl-lbl">Exit $/SF (ARV)</span><span class="pl-val">${(R.subject_area_sf > 0 && R.arv > 0) ? h.fmtMoney(R.arv / R.subject_area_sf) : '-'}</span></div>
              `}
            </div>
          </div>

          ${market && market.cbsa_name ? `
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Market Context</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">MSA</span><span class="pl-val">${_esc(market.cbsa_name)}</span></div>
              ${market.derived && market.derived.market_strength_grade ? `<div class="pl-row"><span class="pl-lbl">Market Strength</span><span class="pl-val">Grade ${_esc(market.derived.market_strength_grade)} (${Math.round(market.derived.market_strength_score)}/100)</span></div>` : ''}
              ${market.census && market.census.rental_vacancy_rate != null ? `<div class="pl-row"><span class="pl-lbl">Rental Vacancy</span><span class="pl-val">${h.fmtPct(market.census.rental_vacancy_rate)}</span></div>` : ''}
              ${market.census && market.census.unemployment_rate != null ? `<div class="pl-row"><span class="pl-lbl">Unemployment</span><span class="pl-val">${h.fmtPct(market.census.unemployment_rate)}</span></div>` : ''}
              ${market.census && market.census.median_household_income != null ? `<div class="pl-row"><span class="pl-lbl">Median HH Income</span><span class="pl-val">${h.fmtMoney(market.census.median_household_income)}</span></div>` : ''}
              ${market.census && market.census.poverty_rate != null ? `<div class="pl-row"><span class="pl-lbl">Poverty Rate</span><span class="pl-val">${h.fmtPct(market.census.poverty_rate)}</span></div>` : ''}
            </div>
          </div>
          ` : '<div></div>'}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Notices and Disclaimers</div>
        <div class="bp-disclaimer">
          ${typeof disclaimersForLenderPackage === 'function' ? disclaimersForLenderPackage() : ''}
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


  // ── PAGE: METHODOLOGY (Path A Pass 3 - compact lender variant) ─
  // Single-page methodology summary for lender audiences. Replaces the
  // prior _pageModelAssumptionsLender which natural-flowed across 3
  // actual pages with poor density. Lender debt underwriters need
  // to know the valuation/debt/opex/method conventions used to produce
  // the numbers earlier in the package, but they don't need the full
  // 4-section enumeration that was producing 3 pages of half-empty text.
  // Equivalent rigor in 1/3 the space, with full-disclosure note that
  // longer-form documentation is available on request.
  function _pageMethodologyLender(deal, R, inputs, market, h, mode, pageNum, totalPages) {
    const engineV = (typeof FOUNDRY_ENGINE_VERSION === 'string' && FOUNDRY_ENGINE_VERSION) ? FOUNDRY_ENGINE_VERSION : 'unversioned';
    const engineDate = (typeof FOUNDRY_ENGINE_VERSION_DATE === 'string' && FOUNDRY_ENGINE_VERSION_DATE) ? FOUNDRY_ENGINE_VERSION_DATE : '';
    const arvSource = R.arv_source_resolved === 'manual_override' ? 'Sponsor manual override'
                    : R.arv_source_resolved === 'comp_derived' ? 'Comp-derived ($/SF × subject SF)'
                    : 'Income approach (NOI / Exit Cap)';
    const taxModeLabel = (inputs.tax_basis_mode || 'stabilized_arv') === 'stabilized_arv'
      ? 'Stabilized ARV (institutional default)'
      : 'Purchase Price (legacy spreadsheet parity)';
    const taxDistrict = (inputs.tax_district || '').trim() || 'Not specified';
    const taxDollars = (R.taxes != null && isFinite(R.taxes)) ? h.fmtMoney(R.taxes) : 'pending district resolution';
    const arvIncome = R.stabilized_arv_income_approach != null ? h.fmtMoney(R.stabilized_arv_income_approach) : 'pending';
    const arvUsed = R.stabilized_arv != null ? h.fmtMoney(R.stabilized_arv) : 'pending';
    const impliedCap = R.implied_cap_rate != null ? h.fmtPct(R.implied_cap_rate) : 'n/a';

    // Compact 2-column key/value spread for the dense data points.
    // Pre-built so the render doesn't get inline-cluttered.
    const valuationRows = `
      <div class="pl-row"><span class="pl-lbl">Stabilized ARV (in use)</span><span class="pl-val">${arvUsed}</span></div>
      <div class="pl-row"><span class="pl-lbl">ARV source</span><span class="pl-val">${_esc(arvSource)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Income-approach reference</span><span class="pl-val">${arvIncome}</span></div>
      <div class="pl-row"><span class="pl-lbl">Implied cap rate at ARV in use</span><span class="pl-val">${impliedCap}</span></div>
      <div class="pl-row"><span class="pl-lbl">Stabilized NOI</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Exit cap (refi valuation)</span><span class="pl-val">${h.fmtPct(inputs.exit_cap || 0, 2)}</span></div>`;

    const capitalRows = mode === 'brrrr' ? `
      <div class="pl-row"><span class="pl-lbl">Purchase / Capex</span><span class="pl-val">${h.fmtMoney(inputs.purchase_price || 0)} / ${h.fmtMoney(inputs.capex_budget || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">LTV / LTC</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltv || 0)} / ${h.fmtPct(inputs.initial_loan_ltc_capex || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Bridge rate / type</span><span class="pl-val">${h.fmtPct(inputs.initial_rate || 0, 2)} ${_esc(inputs.initial_interest_type || 'IO')}</span></div>
      <div class="pl-row"><span class="pl-lbl">Bridge DS method</span><span class="pl-val">Month-by-month draw accrual</span></div>
      <div class="pl-row"><span class="pl-lbl">Capex execution / Refi target</span><span class="pl-val">${inputs.capex_duration_months || 6} mo / Month ${inputs.target_refi_months || 9}</span></div>
      <div class="pl-row"><span class="pl-lbl">Refi LTV / rate / type</span><span class="pl-val">${h.fmtPct(inputs.target_refi_ltv || 0)} / ${h.fmtPct(inputs.refi_rate || 0, 2)} ${_esc(inputs.refi_interest_type || 'PI')}</span></div>
      <div class="pl-row"><span class="pl-lbl">Total closing costs</span><span class="pl-val">${h.fmtMoney(R.closing_costs || 0)} (itemized detail available on request)</span></div>` : `
      <div class="pl-row"><span class="pl-lbl">Purchase / Rehab</span><span class="pl-val">${h.fmtMoney(inputs.purchase_price || 0)} / ${h.fmtMoney(inputs.rehab_budget || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">LTV / LTC</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltv || 0)} / ${h.fmtPct(inputs.initial_loan_ltc_capex || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Bridge rate / type</span><span class="pl-val">${h.fmtPct(inputs.initial_rate || 0, 2)} ${_esc(inputs.initial_interest_type || 'IO')}</span></div>
      <div class="pl-row"><span class="pl-lbl">Hold target</span><span class="pl-val">${inputs.target_hold_months || 6} months</span></div>
      <div class="pl-row"><span class="pl-lbl">Total closing costs</span><span class="pl-val">${h.fmtMoney(R.closing_costs || 0)}</span></div>`;

    const opexRows = mode === 'brrrr' ? `
      <div class="pl-row"><span class="pl-lbl">Property Management</span><span class="pl-val">${h.fmtPct(inputs.pm_pct || 0)} of EGI</span></div>
      <div class="pl-row"><span class="pl-lbl">Maintenance & Turnover</span><span class="pl-val">${h.fmtPct(inputs.maint_pct_of_egi || 0)} of EGI</span></div>
      <div class="pl-row"><span class="pl-lbl">Insurance</span><span class="pl-val">${h.fmtPct(inputs.insurance_pct_of_egi || 0)} of EGI</span></div>
      <div class="pl-row"><span class="pl-lbl">Utilities</span><span class="pl-val">${h.fmtPct(inputs.utilities_pct_of_egi || 0)} of EGI</span></div>
      <div class="pl-row"><span class="pl-lbl">Reserves</span><span class="pl-val">$${inputs.reserves_per_unit_year || 0}/unit/year</span></div>
      <div class="pl-row"><span class="pl-lbl">Vacancy</span><span class="pl-val">${h.fmtPct(inputs.vacancy_pct || 0)} of GPR</span></div>
      <div class="pl-row"><span class="pl-lbl">Tax basis mode</span><span class="pl-val">${_esc(taxModeLabel)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Property taxes (annual)</span><span class="pl-val">${taxDollars} (district: ${_esc(taxDistrict)})</span></div>` : `
      <div class="pl-row"><span class="pl-lbl">Property taxes (during hold)</span><span class="pl-val">${taxDollars}</span></div>
      <div class="pl-row"><span class="pl-lbl">Tax basis mode</span><span class="pl-val">${_esc(taxModeLabel)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Insurance during hold</span><span class="pl-val">${h.fmtMoney(R.insurance_during_hold || 0)}</span></div>
      <div class="pl-row"><span class="pl-lbl">Utilities during hold</span><span class="pl-val">${h.fmtMoney(R.utilities_during_hold || 0)}</span></div>`;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Methodology', mode)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Underwriting Methodology</div>
        <div style="font-size:9pt;color:#333;line-height:1.5;margin-bottom:10pt">
          Standard institutional value-add multifamily underwriting conventions. Stabilized NOI computed from sponsor-input vacancy and operating expense ratios applied to unit-mix-derived GPR. Stabilized ARV resolved via ${_esc(arvSource.toLowerCase())}; property taxes computed against ${_esc(taxModeLabel.toLowerCase())} using the tax district's effective rate. Initial debt sized at sponsor-input LTV/LTC with month-by-month draw accrual on the construction tranche; refi sized to sponsor-input LTV against stabilized ARV. DSCR computed as Stabilized NOI / Refi annual DS. Debt yield computed as Stabilized NOI / Refi loan amount. Stress scenarios shift one input at a time against the base proforma and re-derive DSCR and debt yield. Engine version ${_esc(engineV)} (${_esc(engineDate)}). Full inventory of all inputs, derived values, and methodological choices available on request.
        </div>

        <div class="lender-twocol pb-avoid" style="margin-top:6pt">
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Valuation</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              ${valuationRows}
            </div>
          </div>
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Structure</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              ${capitalRows}
            </div>
          </div>
        </div>

        <div class="lender-twocol pb-avoid" style="margin-top:10pt">
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Operating Expense Conventions</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              ${opexRows}
            </div>
          </div>
          <div>
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Methodological Disclosures</div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">Engine version</span><span class="pl-val">${_esc(engineV)} (${_esc(engineDate)})</span></div>
              <div class="pl-row"><span class="pl-lbl">Bridge DS method</span><span class="pl-val">Month-by-month draw accrual</span></div>
              <div class="pl-row"><span class="pl-lbl">Comp validation</span><span class="pl-val">Sales comp $/SF, min 3 comps (10/20% bands)</span></div>
              <div class="pl-row"><span class="pl-lbl">DSCR convention</span><span class="pl-val">Stabilized NOI / Refi annual DS</span></div>
              <div class="pl-row"><span class="pl-lbl">Debt yield convention</span><span class="pl-val">Stabilized NOI / Refi loan amount</span></div>
              ${market && market.derived && market.derived.market_strength_grade ? `<div class="pl-row"><span class="pl-lbl">Market grade</span><span class="pl-val">Grade ${_esc(market.derived.market_strength_grade)} (${Math.round(market.derived.market_strength_score)}/100)</span></div>` : ''}
              ${market && market.cbsa_name ? `<div class="pl-row"><span class="pl-lbl">MSA</span><span class="pl-val">${_esc(market.cbsa_name)}</span></div>` : ''}
            </div>
          </div>
        </div>

        ${(inputs.tax_basis_mode || 'stabilized_arv') === 'stabilized_arv' ? `
          <div style="font-size:8pt;color:#666;line-height:1.4;margin-top:10pt;padding-top:6pt;border-top:1px solid #eee">
            <strong>Tax basis footnote.</strong> Property taxes are computed against the iteratively-solved stabilized ARV using the tax district's effective rate. This treatment assumes the County will reassess the property at the new stabilized value following the transfer of ownership and capex completion, which is the conservative institutional assumption. If the County's reassessment cycle is delayed or the post-transfer assessment is lower than the stabilized ARV, the tax line will be lower than projected and NOI / ARV will be correspondingly higher.
          </div>
        ` : `
          <div style="font-size:8pt;color:#666;line-height:1.4;margin-top:10pt;padding-top:6pt;border-top:1px solid #eee">
            <strong>Tax basis footnote.</strong> Property taxes are computed against the purchase price using the tax district's effective rate. This treatment matches the sponsor's legacy spreadsheet methodology and assumes the County will not reassess the property at a materially higher value following the transfer. The institutional default is to assess taxes against stabilized ARV; the sponsor has selected purchase-price basis for this deal. If the County reassesses at stabilized ARV, the tax line will be higher than projected and NOI / ARV will be lower.
          </div>
        `}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function renderReport_lender_package(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const mode = (deal && deal.deal_mode) || 'brrrr';
    const totalPages = 6;

    const pages = [
      _page1(deal, R, inputs, market, h, mode, 1, totalPages),
      _page2(deal, R, inputs, market, h, mode, 2, totalPages),
      _page3(deal, R, inputs, market, h, mode, 3, totalPages),
      _page4(deal, R, inputs, market, h, mode, 4, totalPages),
      _pageMethodologyLender(deal, R, inputs, market, h, mode, 5, totalPages),
      _page5(deal, R, inputs, market, h, mode, 6, totalPages)
    ];

    return pages.join('\n');
  }

  window.renderReport_lender_package = renderReport_lender_package;

})();
