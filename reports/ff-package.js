// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.4 - F&F Package Report
// ════════════════════════════════════════════════════════════════
// Single-equity-LP deliverable for Fix & Flip deals. 6-7 pages.
// Comp grid is the centerpiece because for a flip, the ARV defense
// IS the deal thesis.
//
// CONTRACT
//   window.renderReport_ff_package(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES
//   1  Cover + Executive Summary + Narrative + Highlights
//   2  Sources & Uses + Capital Stack + Initial Debt
//   3  Comp Grid (the most important page)
//   4  ARV Derivation + Capex Budget
//   5  Returns + Disposition + Timeline (visual bar)
//   6  Risk Register
//   7  Market Strength (if data fetched)
//   8  Sponsor (if CP.active has subtitle/contact)
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
    if (t === 'single_family') return 'Single Family';
    if (t === 'residential_multifamily') return 'Residential Multifamily (2-4 units)';
    if (t === 'commercial_multifamily') return 'Commercial Multifamily (5+ units)';
    return t || 'Single Family';
  }

  // Per-door helpers (Path C UX). For F&F: typically single-family
  // or 2-4 unit residential; engine sets total_unit_count to 1 minimum
  // (from inputs.total_units_ff). When units=1 the /door figure equals
  // the headline value, so we suppress the per-door line for SF assets
  // by skipping when units <= 1 (it's redundant).
  function _perDoorOnly(value, units) {
    if (!units || units <= 1 || value == null || !isFinite(value) || value === 0) return '';
    return '$' + Math.round(Number(value) / units).toLocaleString() + '/door';
  }
  function _withPerDoor(formattedValue, rawValue, units) {
    if (!units || units <= 1 || rawValue == null || !isFinite(rawValue) || rawValue === 0) return formattedValue;
    return formattedValue + ' | $' + Math.round(Number(rawValue) / units).toLocaleString() + '/door';
  }


  // ── HEADER + FOOTER ───────────────────────────────────────────
  function _header(h, pageLabel) {
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
          <div><strong>F&amp;F Package</strong></div>
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


  // ── PAGE 1: COVER + EXECUTIVE SUMMARY ─────────────────────────
  function _page1(deal, R, inputs, market, h, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);
    const showAddrSub = addrLine && !_normForCmp(dealName).includes(_normForCmp(addrLine));
    const sqftLine = R.subject_area_sf > 0 ? ` · ${Number(R.subject_area_sf).toLocaleString()} SF` : '';

    const tiles = [
      { lbl: 'ARV',                val: h.fmtMoneyK(R.arv),                     sub: R.arv_source === 'override' ? 'Manual override' : 'Comp-derived',
        tone: 'neutral' },
      { lbl: 'Total Project',      val: h.fmtMoneyK(R.total_project_cost),      sub: 'Purchase + reno + carry',
        tone: 'neutral' },
      { lbl: 'Investor Equity',    val: h.fmtMoneyK(R.investor_equity),         sub: _equityMethodLabel(inputs),
        tone: 'neutral' },
      { lbl: 'Investor ROI',       val: h.fmtPct(R.investor_roi),               sub: 'Net proceeds / equity in',
        tone: _toneAbove(R.investor_roi, 0.10, 0.20) },
      { lbl: 'Annualized Return',  val: h.fmtPct(R.annualized_return),          sub: 'ROI scaled to annual',
        tone: _toneAbove(R.annualized_return, 0.20, 0.35) },
      { lbl: 'Hold Period',        val: (inputs.target_hold_months ? inputs.target_hold_months + ' mo' : '-'),     sub: 'Acquisition to sale',
        tone: 'neutral' }
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Cover · Executive Summary')}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Fix &amp; Flip Investment Package</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">
            ${showAddrSub ? _esc(addrLine) + ' · ' : ''}${_esc(_assetTypeLabel(inputs.asset_type))}${sqftLine} · <span class="ds-mode-pill">Fix &amp; Flip</span>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Headline Metrics</div>
        <div class="print-kpis cols-3">
          ${tiles.map(t => `
            <div class="pk-tile pb-avoid pk-tone-${t.tone}">
              <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
              <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
              <div class="pk-tile-sub">${_esc(t.sub)}</div>
            </div>`).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Deal Narrative <span class="bp-draft-tag">DRAFT</span></div>
        ${_narrative(deal, R, inputs, market, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Investment Highlights</div>
        ${_highlights(R, inputs, h, market)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _equityMethodLabel(inputs) {
    const m = inputs && inputs.equity_method_ff;
    if (m === 'institutional') return 'Institutional method';
    return 'Spreadsheet method';
  }


  // ── NARRATIVE (auto-generated, DRAFT-tagged) ──────────────────
  function _narrative(deal, R, inputs, market, h) {
    const sqft = R.subject_area_sf || 0;
    const purchase = inputs.purchase_price || 0;
    const reno = inputs.capex_budget || 0;
    const tpc = R.total_project_cost || 0;
    const arv = R.arv || 0;
    const roi = R.investor_roi;
    const annual = R.annualized_return;
    const hold = inputs.target_hold_months || 0;
    const city = inputs.city || '';
    const state = inputs.state || '';
    const compCount = R.comp_count_sales || 0;
    const compPSF = R.comp_avg_psf;
    const market_grade = market && market.derived ? market.derived.market_strength_grade : null;
    const ppsf_target = (sqft > 0 && arv > 0) ? (arv / sqft) : null;

    const p1 = `The opportunity is a ${_assetTypeLabel(inputs.asset_type).toLowerCase()} acquisition${sqft ? ' (' + Number(sqft).toLocaleString() + ' SF)' : ''} in ${_esc(city)}${state ? ', ' + _esc(state) : ''} at a ${h.fmtMoney(purchase)} purchase price. The business plan calls for ${h.fmtMoney(reno)} in renovation capex over a ${hold}-month hold, taking total project cost to ${h.fmtMoney(tpc)}.`;

    const p2 = `Stabilized ARV is underwritten at ${h.fmtMoney(arv)}${ppsf_target ? ' (' + h.fmtMoney(ppsf_target) + '/SF)' : ''}${R.arv_source === 'override' ? ' via manual override' : ''}. Comp set: ${compCount} sales comp${compCount === 1 ? '' : 's'}${compPSF != null ? ' at ' + h.fmtMoney(compPSF) + '/SF average' : ''}${R.comp_avg_dom != null ? ', ' + Math.round(R.comp_avg_dom) + ' days average DOM' : ''}.`;

    const p3 = `Projected investor returns: ${h.fmtPct(roi)} ROI (${h.fmtPct(annual)} annualized) on ${h.fmtMoney(R.investor_equity)} of equity${market_grade ? ' in a Grade ' + _esc(market_grade) + ' submarket' : ''}. Primary execution risks are renovation scope and schedule discipline, achievability of the underwritten sale price relative to the comp set, and the marketing-to-close timeline.`;

    return `
      <div class="bp-narrative pb-avoid">
        <p>${p1}</p>
        <p>${p2}</p>
        <p>${p3}</p>
      </div>`;
  }


  // ── HIGHLIGHTS (2-tier: strong + filler) ──────────────────────
  function _highlights(R, inputs, h, market) {
    const strong = [];
    const filler = [];
    const vc = _pctNorm(R.value_creation_pct);

    if (R.investor_roi >= 0.25) strong.push(`<strong>Strong projected ROI.</strong> ${h.fmtPct(R.investor_roi)} return on equity in a ${inputs.target_hold_months || 0}-month hold.`);
    if (R.annualized_return >= 0.35) strong.push(`<strong>Premium annualized return.</strong> ${h.fmtPct(R.annualized_return)} annualized return reflects deal velocity.`);
    if (vc >= 0.30) strong.push(`<strong>Significant value creation.</strong> ${h.fmtPct(vc)} value creation (ARV minus TPC over TPC).`);
    if (R.comp_count_sales >= 5) strong.push(`<strong>Deep comp coverage.</strong> ${R.comp_count_sales} valid sales comps support the ARV.`);
    if (R.arv_source !== 'override') strong.push(`<strong>Comp-derived ARV.</strong> Stabilized valuation derived directly from comp average $/SF, not a manual override.`);

    const sqft = R.subject_area_sf || 0;
    const ppsf_target = (sqft > 0 && R.arv > 0) ? (R.arv / sqft) : null;
    filler.push(`<strong>Acquisition basis.</strong> ${h.fmtMoney(inputs.purchase_price)} purchase${sqft ? ' on ' + Number(sqft).toLocaleString() + ' SF' : ''}.`);
    filler.push(`<strong>Renovation scope.</strong> ${h.fmtMoney(inputs.capex_budget)} renovation budget.`);
    if (ppsf_target) filler.push(`<strong>Target $/SF.</strong> Underwritten exit at ${h.fmtMoney(ppsf_target)}/SF${R.comp_avg_psf ? ' vs ' + h.fmtMoney(R.comp_avg_psf) + '/SF comp average' : ''}.`);
    if (market && market.derived && market.derived.market_strength_grade) {
      filler.push(`<strong>Submarket grade.</strong> Grade ${market.derived.market_strength_grade} composite in the ${market.cbsa_name || 'subject MSA'}.`);
    }
    filler.push(`<strong>Hold profile.</strong> ${inputs.target_hold_months || 0}-month total hold from acquisition through sale.`);

    const out = strong.slice(0, 4);
    for (const f of filler) {
      if (out.length >= 4) break;
      out.push(f);
    }

    return `
      <ul class="bp-highlights pb-avoid">
        ${out.map(b => `<li><span class="bp-bullet">▸</span> ${b}</li>`).join('')}
      </ul>`;
  }


  // ── PAGE 2: SOURCES & USES + CAPITAL STACK + INITIAL DEBT ─────
  function _page2(deal, R, inputs, market, h, pageNum, totalPages) {
    const initialLoan = R.initial_loan_amt || 0;
    const investorEquity = R.investor_equity || 0;
    const totalSources = initialLoan + investorEquity;

    const purchase = inputs.purchase_price || 0;
    const reno = inputs.capex_budget || 0;
    const closing = R.closing_costs || 0;
    const consulting = R.consulting || 0;
    const carry = R.debt_service_pre_sale || 0;
    const contingency = inputs.gc_contingency || 0;
    const totalUses = purchase + reno + closing + consulting + carry + contingency;

    // GC contingency held-back disclosure: surface as a Source when contingency
    // exists but is not funded by equity at closing (engine equity_gc_contingency_if_equity = 0).
    const eqMobIfEq = R.equity_gc_contingency_if_equity || 0;
    const gcHeldBack = contingency > 0 && eqMobIfEq === 0;
    const heldBackAmt = gcHeldBack ? contingency : 0;
    const totalSourcesWithHeldBack = totalSources + heldBackAmt;

    const ccBaseline   = R.cc_baseline || 0;
    const ccInsurance  = R.cc_insurance || 0;
    const ccAppraisal  = R.cc_appraisal || 0;
    const ccOrig       = R.cc_origination || 0;
    const ccLenderPts  = R.cc_lender_points || 0;
    const ccBrokerPts  = R.cc_broker_points || 0;
    const ccFlatFees   = R.cc_lender_flat_fees || 0;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sources & Uses · Capital Stack')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sources & Uses</div>
        <div class="bp-su-grid">
          <table class="print-table pb-avoid">
            <thead><tr><th>Sources</th><th class="num">Amount</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Senior Debt</td><td class="num">${h.fmtMoney(initialLoan)}</td><td class="num">${h.fmtPct(initialLoan / Math.max(1, totalSourcesWithHeldBack))}</td></tr>
              <tr><td>Investor Equity</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${h.fmtPct(investorEquity / Math.max(1, totalSourcesWithHeldBack))}</td></tr>
              ${gcHeldBack ? `<tr><td>GC Contingency (held back, not at closing)</td><td class="num">${h.fmtMoney(heldBackAmt)}</td><td class="num">${h.fmtPct(heldBackAmt / Math.max(1, totalSourcesWithHeldBack))}</td></tr>` : ''}
              <tr class="totals"><td>Total Sources</td><td class="num">${h.fmtMoney(totalSourcesWithHeldBack)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>

          <table class="print-table pb-avoid">
            <thead><tr><th>Uses</th><th class="num">Amount</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Purchase Price</td><td class="num">${h.fmtMoney(purchase)}</td><td class="num">${h.fmtPct(purchase / Math.max(1, totalUses))}</td></tr>
              <tr><td>Renovation</td><td class="num">${h.fmtMoney(reno)}</td><td class="num">${h.fmtPct(reno / Math.max(1, totalUses))}</td></tr>
              <tr><td>Closing Costs</td><td class="num">${h.fmtMoney(closing)}</td><td class="num">${h.fmtPct(closing / Math.max(1, totalUses))}</td></tr>
              <tr><td>Consulting</td><td class="num">${h.fmtMoney(consulting)}</td><td class="num">${h.fmtPct(consulting / Math.max(1, totalUses))}</td></tr>
              <tr><td>Carry (DS to Sale)</td><td class="num">${h.fmtMoney(carry)}</td><td class="num">${h.fmtPct(carry / Math.max(1, totalUses))}</td></tr>
              <tr><td>GC Contingency Reserve</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, totalUses))}</td></tr>
              <tr class="totals"><td>Total Uses</td><td class="num">${h.fmtMoney(totalUses)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Structure</div>
        <div class="bp-capstack pb-avoid">
          <div class="bp-capstack-bar">
            <div class="bp-capstack-seg bp-seg-debt" style="width:${(initialLoan / Math.max(1, totalSources) * 100).toFixed(1)}%">
              <span class="bp-seg-lbl">Debt</span>
              <span class="bp-seg-val">${h.fmtPct(initialLoan / Math.max(1, totalSources), 0)}</span>
            </div>
            <div class="bp-capstack-seg bp-seg-sponsor" style="width:${(investorEquity / Math.max(1, totalSources) * 100).toFixed(1)}%">
              <span class="bp-seg-lbl">Equity</span>
              <span class="bp-seg-val">${h.fmtPct(investorEquity / Math.max(1, totalSources), 0)}</span>
            </div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Closing Cost Detail</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Basis</th><th class="num">Amount</th></tr></thead>
          <tbody>
            <tr><td>Title / Escrow / Recording (Baseline)</td><td class="num">Flat</td><td class="num">${h.fmtMoney(ccBaseline)}</td></tr>
            <tr><td>Insurance (First-Year Premium)</td><td class="num">Flat</td><td class="num">${h.fmtMoney(ccInsurance)}</td></tr>
            <tr><td>Appraisal</td><td class="num">Flat</td><td class="num">${h.fmtMoney(ccAppraisal)}</td></tr>
            <tr><td>Origination Fee</td><td class="num">${h.fmtPct(inputs.origination_pct || 0, 2)} of Loan</td><td class="num">${h.fmtMoney(ccOrig)}</td></tr>
            <tr><td>Lender Points</td><td class="num">${h.fmtPct(inputs.lender_points_pct || 0, 2)} of Loan</td><td class="num">${h.fmtMoney(ccLenderPts)}</td></tr>
            <tr><td>Broker Points</td><td class="num">${h.fmtPct(inputs.broker_points_pct || 0, 2)} of Loan</td><td class="num">${h.fmtMoney(ccBrokerPts)}</td></tr>
            <tr><td>Lender Flat Fees (legal, environmental, processing)</td><td class="num">Flat</td><td class="num">${h.fmtMoney(ccFlatFees)}</td></tr>
            <tr class="totals"><td>Total Closing Costs</td><td></td><td class="num">${h.fmtMoney(closing)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Initial Debt Terms</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Loan Amount</span><span class="pl-val">${h.fmtMoney(initialLoan)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Rate</span><span class="pl-val">${h.fmtPct(inputs.initial_rate, 2)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Interest Type</span><span class="pl-val">${_esc(inputs.initial_interest_type || 'IO')}</span></div>
          <div class="pl-row"><span class="pl-lbl">LTV</span><span class="pl-val">${h.fmtPct(inputs.initial_loan_ltv)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Monthly DS</span><span class="pl-val">${h.fmtMoney(R.initial_monthly_ds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">DS Through Sale</span><span class="pl-val">${h.fmtMoney(R.debt_service_pre_sale)}</span></div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 3: COMP GRID (the most important page) ───────────────
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
    const cs = (typeof comps === 'object' && Array.isArray(comps)) ? comps : [];
    const sales = cs.filter(c => c && (c.comp_type || 'sales') === 'sales');

    // Coefficient of variation for $/SF
    const psfs = sales.map(c => {
      const p = +c.sales_price, sf = +c.area_sf;
      return (p > 0 && sf > 0) ? (p / sf) : null;
    }).filter(v => v != null);
    const mean = psfs.length > 0 ? psfs.reduce((a, b) => a + b, 0) / psfs.length : 0;
    let cv = null;
    if (psfs.length >= 2 && mean > 0) {
      const variance = psfs.reduce((a, b) => a + (b - mean) ** 2, 0) / (psfs.length - 1);
      cv = Math.sqrt(variance) / mean;
    }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Comparable Sales')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sales Comp Grid</div>
        ${sales.length === 0 ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">No Sales Comps</div>
            No sales comparables have been entered for this deal. ARV is sourced from manual override only and lacks comp support.
          </div>` : `
          <table class="print-table ff-comp-table pb-avoid">
            <thead>
              <tr>
                <th>Address</th>
                <th class="num">Sale Price</th>
                <th class="num">Area (SF)</th>
                <th class="num">$/SF</th>
                <th class="num">DOM</th>
                <th>Renov.</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              ${sales.map(c => {
                const psf = (c.sales_price > 0 && c.area_sf > 0) ? c.sales_price / c.area_sf : null;
                return `
                  <tr>
                    <td>${_esc(c.address || '-')}</td>
                    <td class="num">${h.fmtMoney(c.sales_price)}</td>
                    <td class="num">${c.area_sf ? Number(c.area_sf).toLocaleString() : '-'}</td>
                    <td class="num">${psf ? h.fmtMoney(psf) : '-'}</td>
                    <td class="num">${c.dom != null ? Math.round(c.dom) : '-'}</td>
                    <td>${c.renovated ? 'Yes' : 'No'}</td>
                    <td>${_esc(c.source || '-')}</td>
                  </tr>`;
              }).join('')}
              <tr class="totals">
                <td>Average / Total</td>
                <td class="num">-</td>
                <td class="num">-</td>
                <td class="num">${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-'}</td>
                <td class="num">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) : '-'}</td>
                <td>-</td>
                <td>${R.comp_count_sales || 0} comps</td>
              </tr>
            </tbody>
          </table>
        `}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Comp Set Statistics</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Sales Comp Count</span><span class="pl-val">${R.comp_count_sales || 0}</span></div>
          <div class="pl-row"><span class="pl-lbl">Renovated-Only Count</span><span class="pl-val">${R.comp_count_sales_renovated || 0}</span></div>
          <div class="pl-row"><span class="pl-lbl">Avg $/SF (Institutional)</span><span class="pl-val">${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Avg $/SF (Spreadsheet)</span><span class="pl-val">${R.comp_avg_psf_spreadsheet ? h.fmtMoney(R.comp_avg_psf_spreadsheet) : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Avg DOM</span><span class="pl-val">${R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) + ' days' : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Coefficient of Variation</span><span class="pl-val">${cv != null ? h.fmtPct(cv) : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Subject Area</span><span class="pl-val">${R.subject_area_sf ? Number(R.subject_area_sf).toLocaleString() + ' SF' : '-'}</span></div>
          <div class="pl-row"><span class="pl-lbl">Comp Min Met (≥3)</span><span class="pl-val">${R.comp_min_required_met ? 'Yes' : 'No'}</span></div>
        </div>

        ${cv != null && cv > 0.25 ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">Elevated Comp Dispersion</div>
            Coefficient of variation in comp $/SF is ${h.fmtPct(cv)}, above the 25% institutional threshold. Comp set may benefit from tighter screening (e.g. renovated-only, narrower radius, sale date band) or splitting into renovated vs unrenovated tranches.
          </div>` : ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 4: ARV DERIVATION + RENOVATION ───────────────────────
  function _page4(deal, R, inputs, market, h, pageNum, totalPages) {
    const sqft = R.subject_area_sf || 0;
    const compARV = R.comp_derived_arv || 0;
    const finalARV = R.arv || 0;
    const override_diff = (compARV > 0 && R.arv_source === 'override')
      ? (finalARV - compARV) / compARV : null;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'ARV Derivation · Renovation')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>ARV Derivation</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Value</th></tr></thead>
          <tbody>
            <tr><td>Subject Area</td><td class="num">${sqft ? Number(sqft).toLocaleString() + ' SF' : '-'}</td></tr>
            <tr><td>Comp Average $/SF (Institutional)</td><td class="num">${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-'}</td></tr>
            <tr><td>Comp Average $/SF (Renovated Only)</td><td class="num">${R.comp_avg_psf_renovated_only ? h.fmtMoney(R.comp_avg_psf_renovated_only) : '-'}</td></tr>
            <tr class="totals"><td>Comp-Derived ARV (Avg $/SF × Subject SF)</td><td class="num">${h.fmtMoney(compARV)}</td></tr>
            <tr><td>ARV Source</td><td class="num">${_esc((R.arv_source || 'comps').charAt(0).toUpperCase() + (R.arv_source || 'comps').slice(1))}</td></tr>
            <tr class="totals"><td>Final ARV (Used in Underwriting)</td><td class="num">${h.fmtMoney(finalARV)}</td></tr>
            ${override_diff != null ? `
              <tr><td>Override vs Comp-Derived</td><td class="num">${override_diff >= 0 ? '+' : ''}${h.fmtPct(override_diff)}</td></tr>
            ` : ''}
            <tr><td>Target $/SF (Final ARV / Subject SF)</td><td class="num">${(sqft > 0 && finalARV > 0) ? h.fmtMoney(finalARV / sqft) : '-'}</td></tr>
          </tbody>
        </table>

        ${override_diff != null && Math.abs(override_diff) > 0.10 ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">ARV Override Above Comp-Derived</div>
            Manual ARV is ${h.fmtPct(override_diff)} above the comp-derived value. Override beyond 10% requires explicit rationale (premium location, recent renovation tier, or comparable-set staleness). Document the basis before circulating externally.
          </div>` : ''}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Value Creation</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Value</th></tr></thead>
          <tbody>
            <tr><td>Final ARV</td><td class="num">${h.fmtMoney(finalARV)}</td></tr>
            <tr><td>Total Project Cost</td><td class="num">${h.fmtMoney(R.total_project_cost)}</td></tr>
            <tr class="totals"><td>Value Creation (ARV − TPC)</td><td class="num">${h.fmtMoney(R.value_creation)} (${h.fmtPct(_pctNorm(R.value_creation_pct))})</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Renovation Scope</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Line</th><th class="num">Amount</th><th class="num">$/SF</th></tr></thead>
          <tbody>
            <tr><td>Capex Budget</td><td class="num">${h.fmtMoney(inputs.capex_budget)}</td><td class="num">${(sqft > 0 && inputs.capex_budget > 0) ? h.fmtMoney(inputs.capex_budget / sqft) : '-'}</td></tr>
            <tr><td>GC Contingency Reserve</td><td class="num">${h.fmtMoney(inputs.gc_contingency)}</td><td class="num">${(sqft > 0 && inputs.gc_contingency > 0) ? h.fmtMoney(inputs.gc_contingency / sqft) : '-'}</td></tr>
            <tr><td>Consulting</td><td class="num">${h.fmtMoney(R.consulting)}</td><td class="num">${(sqft > 0 && R.consulting > 0) ? h.fmtMoney(R.consulting / sqft) : '-'}</td></tr>
            <tr class="totals"><td>Total Renovation Envelope</td><td class="num">${h.fmtMoney((inputs.capex_budget || 0) + (inputs.gc_contingency || 0) + (R.consulting || 0))}</td><td class="num">${(sqft > 0) ? h.fmtMoney(((inputs.capex_budget || 0) + (inputs.gc_contingency || 0) + (R.consulting || 0)) / sqft) : '-'}</td></tr>
          </tbody>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 5: RETURNS + DISPOSITION + TIMELINE ──────────────────
  function _page5(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);
    const showDoorCol = _units > 1;

    const holdMonths = inputs.target_hold_months || 0;
    // Default phase split: ~70% renovation, ~30% marketing/sale.
    // Tunable per-deal via inputs.ff_reno_months / inputs.ff_sale_months if set.
    const renoMonths = inputs.ff_reno_months || Math.round(holdMonths * 0.7);
    const saleMonths = inputs.ff_sale_months || Math.max(1, holdMonths - renoMonths);
    const acqMonth = 0;
    const renoEnd = acqMonth + renoMonths;

    // Build a bar visualization: total width = holdMonths
    const renoPct = holdMonths > 0 ? (renoMonths / holdMonths) * 100 : 70;
    const salePct = holdMonths > 0 ? (saleMonths / holdMonths) * 100 : 30;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Returns · Disposition · Timeline')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Returns Summary</div>
        <div class="print-kpis cols-3">
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">Investor ROI</div><div class="pk-tile-val">${h.fmtPct(R.investor_roi)}</div><div class="pk-tile-sub">${_equityMethodLabel(inputs)}</div></div>
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">Annualized Return</div><div class="pk-tile-val">${h.fmtPct(R.annualized_return)}</div><div class="pk-tile-sub">ROI / hold years</div></div>
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">IRR (Annualized)</div><div class="pk-tile-val">${h.fmtPct(R.annualized_irr)}</div><div class="pk-tile-sub">Compounding</div></div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Equity Methods</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Method</th><th class="num">Investor Equity</th><th>Definition</th></tr></thead>
          <tbody>
            <tr ${inputs.equity_method_ff === 'spreadsheet' || !inputs.equity_method_ff ? 'class="totals"' : ''}><td>Spreadsheet${inputs.equity_method_ff === 'spreadsheet' || !inputs.equity_method_ff ? ' (in use)' : ''}</td><td class="num">${h.fmtMoney(R.investor_equity_spreadsheet)}</td><td>Purchase × 7% + closing + consulting + DS to sale</td></tr>
            <tr ${inputs.equity_method_ff === 'institutional' ? 'class="totals"' : ''}><td>Institutional${inputs.equity_method_ff === 'institutional' ? ' (in use)' : ''}</td><td class="num">${h.fmtMoney(R.investor_equity_institutional)}</td><td>TPC − Initial Loan (correct equity definition)</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Disposition Mechanics</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Step</th><th class="num">Amount</th>${showDoorCol ? '<th class="num">$/Door</th>' : ''}</tr></thead>
          <tbody>
            <tr><td>Disposition Value (ARV)</td><td class="num">${h.fmtMoney(R.disposition_value)}</td>${showDoorCol ? `<td class="num">${_pd(R.disposition_value)}</td>` : ''}</tr>
            <tr><td>Less: Sale Cost (${h.fmtPct(inputs.sale_cost_pct)})</td><td class="num">(${h.fmtMoney(R.sale_cost)})</td>${showDoorCol ? `<td class="num">${_pd(R.sale_cost)}</td>` : ''}</tr>
            <tr><td>Less: Remaining Loan Balance</td><td class="num">(${h.fmtMoney(R.remaining_loan_balance)})</td>${showDoorCol ? `<td class="num">${_pd(R.remaining_loan_balance)}</td>` : ''}</tr>
            <tr class="totals"><td>Gross Proceeds to Investor</td><td class="num">${h.fmtMoney(R.gross_proceeds)}</td>${showDoorCol ? `<td class="num">${_pd(R.gross_proceeds)}</td>` : ''}</tr>
            <tr><td>LP/GP Split (${h.fmtPct(inputs.lp_gp_split_ff || 0)} to LP)</td><td class="num"></td>${showDoorCol ? '<td class="num"></td>' : ''}</tr>
            <tr class="totals"><td>Net Investor Proceeds</td><td class="num">${h.fmtMoney(R.net_investor_proceeds)}</td>${showDoorCol ? `<td class="num">${_pd(R.net_investor_proceeds)}</td>` : ''}</tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Hold Timeline</div>
        <div class="ff-timeline pb-avoid">
          <div class="ff-timeline-bar">
            <div class="ff-timeline-phase ff-phase-reno" style="width:${renoPct.toFixed(1)}%">
              <div class="ff-phase-lbl">Renovation</div>
              <div class="ff-phase-months">M0 - M${renoEnd}</div>
            </div>
            <div class="ff-timeline-phase ff-phase-sale" style="width:${salePct.toFixed(1)}%">
              <div class="ff-phase-lbl">Marketing &amp; Sale</div>
              <div class="ff-phase-months">M${renoEnd} - M${holdMonths}</div>
            </div>
          </div>
          <div class="ff-timeline-markers">
            <div class="ff-marker">
              <div class="ff-marker-dot"></div>
              <div class="ff-marker-lbl">Acquisition</div>
              <div class="ff-marker-sub">Month 0</div>
            </div>
            <div class="ff-marker" style="left:${renoPct.toFixed(1)}%">
              <div class="ff-marker-dot"></div>
              <div class="ff-marker-lbl">Reno Complete</div>
              <div class="ff-marker-sub">Month ${renoEnd}</div>
            </div>
            <div class="ff-marker ff-marker-right">
              <div class="ff-marker-dot"></div>
              <div class="ff-marker-lbl">Sale Close</div>
              <div class="ff-marker-sub">Month ${holdMonths}</div>
            </div>
          </div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 6: RISK REGISTER ─────────────────────────────────────
  function _page6(deal, R, inputs, market, h, pageNum, totalPages) {
    let risks = [];
    if (typeof assembleRisks === 'function') {
      risks = assembleRisks();
    }
    const high = risks.filter(r => r.severity === 'high' && !r.resolved);
    const medium = risks.filter(r => r.severity === 'medium' && !r.resolved);
    const low = risks.filter(r => r.severity === 'low' && !r.resolved);
    const resolved = risks.filter(r => r.resolved);

    const renderRow = (r) => `
      <div class="print-risk-row risk-${_esc(r.severity || 'medium')}">
        <div class="print-risk-row-meta">
          <span>${_esc((r.severity || 'medium').toUpperCase())}</span>
          <span> · </span>
          <span>${_esc(r.source || 'engine')}</span>
          <span> · </span>
          <span>${_esc(r.category || '-')}</span>
        </div>
        <div class="print-risk-row-title">${_esc(r.title || 'Untitled risk')}</div>
        <div class="ds-risk-detail">${_esc(r.detail || '')}</div>
        ${r.mitigation ? `<div class="bp-mit"><span class="bp-mit-lbl">Mitigation:</span> ${_esc(r.mitigation)}</div>` : ''}
      </div>`;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Risk Register')}

        ${high.length > 0 ? `
          <div class="print-section pb-avoid"><span class="ps-accent"></span>High Severity (${high.length})</div>
          <div class="ds-risks-list">${high.map(renderRow).join('')}</div>
        ` : ''}

        ${medium.length > 0 ? `
          <div class="print-section pb-avoid"><span class="ps-accent"></span>Medium Severity (${medium.length})</div>
          <div class="ds-risks-list">${medium.map(renderRow).join('')}</div>
        ` : ''}

        ${low.length > 0 ? `
          <div class="print-section pb-avoid"><span class="ps-accent"></span>Low Severity (${low.length})</div>
          <div class="ds-risks-list">${low.map(renderRow).join('')}</div>
        ` : ''}

        ${resolved.length > 0 ? `
          <div class="print-section pb-avoid"><span class="ps-accent"></span>Resolved (${resolved.length})</div>
          <div class="ds-risks-list">${resolved.map(renderRow).join('')}</div>
        ` : ''}

        ${risks.length === 0 ? `
          <div class="ds-risks-clear pb-avoid">
            <span class="ds-risks-clear-icon">✓</span>
            <span class="ds-risks-clear-text">No risks flagged. Engine and market modules ran clean.</span>
          </div>` : ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 7: MARKET STRENGTH ───────────────────────────────────
  function _page7(deal, R, inputs, market, h, pageNum, totalPages) {
    const d = market && market.derived;
    const c = market && market.census;
    const fmr = market && market.fmr;

    if (!d || d.market_strength_score == null) {
      return `
        <div class="print-page print-page-compact">
          ${_header(h, 'Market Strength')}
          <div class="print-section pb-avoid"><span class="ps-accent"></span>Market Analysis</div>
          <div class="print-callout pb-avoid">
            <div class="pc-title">No market data fetched</div>
            Market analysis was not run for this deal. Open the Market panel in the app, enter the subject ZIP, and fetch census + FMR data to populate this section.
          </div>
          ${_footer(pageNum, totalPages)}
        </div>`;
    }

    const cs = d.component_scores || {};

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Market Strength')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Composite Score</div>
        <div class="ds-market-strip pb-avoid">
          <div class="ds-market-cell">
            <div class="ds-market-lbl">Grade</div>
            <div class="ds-market-val ${_gradeClass(d.market_strength_grade)}">${_esc(d.market_strength_grade || '-')}</div>
          </div>
          <div class="ds-market-cell">
            <div class="ds-market-lbl">Composite Score</div>
            <div class="ds-market-val">${Math.round(d.market_strength_score)} <span class="ds-out-of">/ 100</span></div>
          </div>
          <div class="ds-market-cell">
            <div class="ds-market-lbl">Rent-to-Income</div>
            <div class="ds-market-val">${h.fmtPct(d.rent_to_income_ratio)}</div>
          </div>
          <div class="ds-market-cell">
            <div class="ds-market-lbl">MSA</div>
            <div class="ds-market-val ds-market-msa">${_esc(market.cbsa_name || 'Unknown')}</div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Component Scores & Demographics</div>
        <div class="bp-market-grid pb-avoid">
          <table class="print-table">
            <thead><tr><th>Component</th><th>Wt.</th><th class="num">Score</th></tr></thead>
            <tbody>
              <tr><td>Vacancy</td><td>20%</td><td class="num">${Math.round(cs.vacancy || 0)}</td></tr>
              <tr><td>Unemployment</td><td>18%</td><td class="num">${Math.round(cs.unemployment || 0)}</td></tr>
              <tr><td>Median Income</td><td>15%</td><td class="num">${Math.round(cs.income || 0)}</td></tr>
              <tr><td>Rent-to-Income</td><td>15%</td><td class="num">${Math.round(cs.rent_to_income || 0)}</td></tr>
              <tr><td>Education</td><td>12%</td><td class="num">${Math.round(cs.education || 0)}</td></tr>
              <tr><td>Poverty</td><td>10%</td><td class="num">${Math.round(cs.poverty || 0)}</td></tr>
              <tr><td>Owner Balance</td><td>10%</td><td class="num">${Math.round(cs.owner_balance || 0)}</td></tr>
              <tr class="totals"><td>Composite</td><td>100%</td><td class="num">${Math.round(d.market_strength_score)}</td></tr>
            </tbody>
          </table>

          ${c ? `
          <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
            <div class="pl-row"><span class="pl-lbl">Median HH Income</span><span class="pl-val">${h.fmtMoney(c.median_household_income)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Median Rent</span><span class="pl-val">${h.fmtMoney(c.median_rent)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Rental Vacancy</span><span class="pl-val">${h.fmtPct(c.rental_vacancy_rate)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Unemployment</span><span class="pl-val">${h.fmtPct(c.unemployment_rate)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Poverty Rate</span><span class="pl-val">${h.fmtPct(c.poverty_rate)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Bachelors+</span><span class="pl-val">${h.fmtPct(c.bachelors_or_higher_pct)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Owner-Occupied</span><span class="pl-val">${h.fmtPct(c.owner_occupied_pct)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Median Home Value</span><span class="pl-val">${h.fmtMoney(c.median_home_value)}</span></div>
          </div>
          ` : ''}
        </div>

        ${fmr ? `
        <div class="print-section pb-avoid"><span class="ps-accent"></span>HUD Fair Market Rents</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Studio</th><th class="num">1BR</th><th class="num">2BR</th><th class="num">3BR</th><th class="num">4BR</th></tr></thead>
          <tbody>
            <tr>
              <td class="num">${h.fmtMoney(fmr.studio)}</td>
              <td class="num">${h.fmtMoney(fmr.br1)}</td>
              <td class="num">${h.fmtMoney(fmr.br2)}</td>
              <td class="num">${h.fmtMoney(fmr.br3)}</td>
              <td class="num">${h.fmtMoney(fmr.br4)}</td>
            </tr>
          </tbody>
        </table>
        ` : ''}

        <div class="bp-source-footnote">
          Source: U.S. Census Bureau ACS 5-Year Estimates · HUD Fair Market Rents FY2025
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 8: SPONSOR (conditional) ─────────────────────────────
  function _page8(deal, R, inputs, market, h, pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    if (!co) return null;
    const hasSub = !!co.subtitle;
    const contact = co.contact_info || {};
    const hasContact = contact.email || contact.phone || contact.website || contact.address;
    if (!hasSub && !hasContact) return null;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sponsor')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sponsor</div>
        <div class="bp-sponsor pb-avoid">
          <div class="bp-sponsor-name">${_esc(co.name || '')}</div>
          ${hasSub ? `<div class="bp-sponsor-sub">${_esc(co.subtitle)}</div>` : ''}
          ${hasContact ? `
            <div class="bp-sponsor-contact">
              ${contact.email ? `<div><span class="bp-sponsor-lbl">Email</span> ${_esc(contact.email)}</div>` : ''}
              ${contact.phone ? `<div><span class="bp-sponsor-lbl">Phone</span> ${_esc(contact.phone)}</div>` : ''}
              ${contact.website ? `<div><span class="bp-sponsor-lbl">Web</span> ${_esc(contact.website)}</div>` : ''}
              ${contact.address ? `<div><span class="bp-sponsor-lbl">Office</span> ${_esc(contact.address)}</div>` : ''}
            </div>
          ` : ''}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  // ── PAGE 9: NOTICES AND DISCLAIMERS (Path A - always renders) ──
  function _pageDisclaimers(deal, R, inputs, market, h, pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Notices and Disclaimers')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Notices and Disclaimers</div>
        <div class="bp-disclaimer">
          ${typeof disclaimersForEquityPackage === 'function' ? disclaimersForEquityPackage(coName, { isFF: true }) : ''}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  // ── PAGE: MODEL ASSUMPTIONS AND METHODOLOGY (Path A Pass 3) ──
  function _pageModelAssumptions(deal, R, inputs, market, h, pageNum, totalPages) {
    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Model Assumptions and Methodology')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Model Assumptions and Methodology</div>
        <div style="font-size:9pt;color:var(--print-muted);margin-bottom:6pt;line-height:1.45">
          The following inventory of inputs, derived values, and methodological choices was used to produce the figures elsewhere in this report. Where a value is labeled "sponsor input", the sponsor selected the value; where labeled "engine", "derived", or "data source", the value follows from sponsor inputs via the underwriting engine or third-party data.
        </div>

        ${typeof modelAssumptionsForEquityPackage === 'function' ? modelAssumptionsForEquityPackage(R, inputs, market, 'fix_and_flip') : ''}

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
  function _gradeClass(grade) {
    if (!grade) return '';
    if (grade.startsWith('A')) return 'ds-grade-a';
    if (grade.startsWith('B')) return 'ds-grade-b';
    if (grade.startsWith('C')) return 'ds-grade-c';
    if (grade === 'D') return 'ds-grade-d';
    return 'ds-grade-f';
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_ff_package(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const pages = [];

    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const hasSponsorPage = !!(co && (co.subtitle || (co.contact_info && (co.contact_info.email || co.contact_info.phone || co.contact_info.website || co.contact_info.address))));
    const totalPages = 7 + (hasSponsorPage ? 1 : 0) + 2;  // +1 Model Assumptions, +1 Notices and Disclaimers

    pages.push(_page1(deal, R, inputs, market, h, 1, totalPages));
    pages.push(_page2(deal, R, inputs, market, h, 2, totalPages));
    pages.push(_page3(deal, R, inputs, market, h, 3, totalPages));
    pages.push(_page4(deal, R, inputs, market, h, 4, totalPages));
    pages.push(_page5(deal, R, inputs, market, h, 5, totalPages));
    pages.push(_page6(deal, R, inputs, market, h, 6, totalPages));
    pages.push(_page7(deal, R, inputs, market, h, 7, totalPages));
    let nextPage = 8;
    if (hasSponsorPage) {
      const p8 = _page8(deal, R, inputs, market, h, nextPage, totalPages);
      if (p8) { pages.push(p8); nextPage++; }
    }
    pages.push(_pageModelAssumptions(deal, R, inputs, market, h, nextPage, totalPages));
    nextPage++;
    pages.push(_pageDisclaimers(deal, R, inputs, market, h, nextPage, totalPages));

    return pages.join('\n');
  }

  // Expose globally so print.js can dispatch into it.
  window.renderReport_ff_package = renderReport_ff_package;

})();
