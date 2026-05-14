// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.5 - Internal Deal Memo Report
// ════════════════════════════════════════════════════════════════
// Mode-aware internal IC memo. 3-5 pages. Narrative-heavy, lighter
// on tables than the BRRRR/F&F packages. For internal use only:
// you, Jorge, Vladi, Ruby, Alexei deciding whether to commit capital.
//
// Opens with a recommendation banner auto-derived from M5 risk
// register. Then: thesis, business plan, key risks, Devil's Advocate
// section, what we'd need to believe, IC questions, next steps.
//
// CONTRACT
//   window.renderReport_internal_memo(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES
//   1  Cover + Recommendation + Headline KPIs + Executive Summary
//   2  Investment Thesis + Business Plan + Deal Facts sidebar
//   3  Key Risks + Devil's Advocate + Mitigation Strategy
//   4  What We'd Need to Believe + IC Questions + Next Steps
//   5  Market Strength + Sponsor (combined, conditional)
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
    if (mode === 'brrrr') return 'BRRRR';
    if (mode === 'fix_and_flip') return 'Fix & Flip';
    return 'Deal';
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
          <div><strong>Internal Deal Memo</strong></div>
          <div>${_esc(pageLabel || '')}</div>
          <div>${_esc(h.todayLong())}</div>
        </div>
      </div>`;
  }

  function _footer(pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    // Engine version stamp (Layer 2 audit Finding 1). Even though this
    // is an internal IC document, a snapshot or accidental external
    // forward needs to be traceable back to a specific engine version
    // and its CHANGELOG entry.
    const v = (typeof FOUNDRY_ENGINE_VERSION === 'string' && FOUNDRY_ENGINE_VERSION) ? FOUNDRY_ENGINE_VERSION : 'unversioned';
    const d = (typeof FOUNDRY_ENGINE_VERSION_DATE === 'string' && FOUNDRY_ENGINE_VERSION_DATE) ? FOUNDRY_ENGINE_VERSION_DATE : '';
    const versionStamp = `Engine ${_esc(v)}${d ? ' (' + _esc(d) + ')' : ''}`;
    return `
      <div class="print-footer pb-avoid">
        <div class="pf-conf">Internal Use Only · ${_esc(coName)} IC · <span style="font-style:italic;color:var(--print-muted)">${versionStamp}</span></div>
        <div class="pf-page">${pageNum} of ${totalPages}</div>
      </div>`;
  }


  // ── RECOMMENDATION ENGINE ─────────────────────────────────────
  // Auto-derive an IC recommendation from the M5 risk register + key
  // engine outputs. Three tiers:
  //   PROCEED      - 0 high-severity risks, deal economics within targets
  //   CONDITIONAL  - 0-1 high risks, mitigation required
  //   RECONSIDER   - 2+ high risks or core economics fail (DSCR<1.05,
  //                  recapture<60%, negative value creation, EM<1.5x)
  // The recommendation is a starting point for IC discussion, never
  // a binding call. Marked DRAFT.
  function _computeRecommendation(R, mode, risks) {
    const high = risks.filter(r => r.severity === 'high' && !r.resolved).length;
    const medium = risks.filter(r => r.severity === 'medium' && !r.resolved).length;

    const vc = _pctNorm(R.value_creation_pct);
    const em = R.equity_multiple;
    const roi = R.investor_roi;

    let coreFailed = false;
    let reasons = [];

    if (mode === 'brrrr') {
      if (R.dscr != null && R.dscr < 1.05) { coreFailed = true; reasons.push('DSCR below 1.05'); }
      if (R.capital_recaptured_pct != null && _pctNorm(R.capital_recaptured_pct) < 0.60) { coreFailed = true; reasons.push('capital recapture below 60%'); }
      if (vc != null && vc < 0.05) { coreFailed = true; reasons.push('value creation below 5%'); }
      if (em != null && em < 1.5) { coreFailed = true; reasons.push('equity multiple below 1.5x'); }
    } else {
      if (roi != null && roi < 0.10) { coreFailed = true; reasons.push('ROI below 10%'); }
      if (vc != null && vc < 0.05) { coreFailed = true; reasons.push('value creation below 5%'); }
      if (R.comp_count_sales != null && R.comp_count_sales < 2) { coreFailed = true; reasons.push('insufficient comp coverage'); }
    }

    if (high >= 2 || coreFailed) {
      return {
        tier: 'reconsider',
        label: 'RECONSIDER',
        summary: `${high} high-severity risk${high === 1 ? '' : 's'} flagged${coreFailed ? '; core economics fail (' + reasons.join(', ') + ')' : ''}. Deal as currently structured does not meet institutional underwriting standards. Restructure or pass.`
      };
    }
    if (high === 1 || medium >= 3) {
      return {
        tier: 'conditional',
        label: 'CONDITIONAL',
        summary: `${high} high-severity and ${medium} medium-severity risk${medium === 1 ? '' : 's'} flagged. Proceed subject to documented mitigation on each open item before capital commitment.`
      };
    }
    return {
      tier: 'proceed',
      label: 'PROCEED',
      summary: `Engine and market modules ran ${high === 0 && medium === 0 ? 'clean' : 'with only ' + medium + ' medium-severity flag' + (medium === 1 ? '' : 's')}. Recommend advancing to LOI / acquisition diligence.`
    };
  }


  // ── PAGE 1: COVER + RECOMMENDATION + KPIs + EXEC SUMMARY ──────
  // ── PAGE 1: COVER + RECOMMENDATION + KPIs + EXEC + THESIS ─────
  function _page1(deal, R, inputs, market, h, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);
    const showAddrSub = addrLine && !_normForCmp(dealName).includes(_normForCmp(addrLine));
    const mode = (deal && deal.deal_mode) || 'brrrr';
    const modeLbl = _modeLabel(mode);

    let risks = [];
    if (typeof assembleRisks === 'function') risks = assembleRisks();
    const rec = _computeRecommendation(R, mode, risks);

    const tiles = mode === 'brrrr' ? [
      { lbl: 'Refi DSCR',         val: h.fmtX(R.dscr, 2),                  tone: _toneAbove(R.dscr, 1.05, 1.20) },
      { lbl: 'Capital Recapture', val: h.fmtPct(R.capital_recaptured_pct), tone: _toneAbove(_pctNorm(R.capital_recaptured_pct), 0.60, 0.80) },
      { lbl: 'Equity Multiple',   val: h.fmtX(R.equity_multiple, 2),       tone: _toneAbove(R.equity_multiple, 1.5, 2.0) },
      { lbl: 'Investor IRR',      val: h.fmtPct(R.investor_irr),           tone: _toneAbove(R.investor_irr, 0.12, 0.18) }
    ] : [
      { lbl: 'ARV',               val: h.fmtMoneyK(R.arv),                  tone: 'neutral' },
      { lbl: 'Total Project',     val: h.fmtMoneyK(R.total_project_cost),   tone: 'neutral' },
      { lbl: 'Investor ROI',      val: h.fmtPct(R.investor_roi),            tone: _toneAbove(R.investor_roi, 0.10, 0.20) },
      { lbl: 'Annualized Return', val: h.fmtPct(R.annualized_return),       tone: _toneAbove(R.annualized_return, 0.20, 0.35) }
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Recommendation · Thesis')}

        ${typeof disclaimerInternalMemoMark === 'function' ? disclaimerInternalMemoMark() : ''}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Internal Deal Memo</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">
            ${showAddrSub ? _esc(addrLine) + ' · ' : ''}${_esc(_assetTypeLabel(inputs.asset_type))} · <span class="ds-mode-pill">${modeLbl}</span>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>IC Recommendation <span class="bp-draft-tag">DRAFT</span></div>
        <div class="im-rec im-rec-${rec.tier} pb-avoid">
          <div class="im-rec-label">${rec.label}</div>
          <div class="im-rec-summary">${rec.summary}</div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Headline Metrics</div>
        <div class="print-kpis">
          ${tiles.map(t => `
            <div class="pk-tile pb-avoid pk-tone-${t.tone}">
              <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
              <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
            </div>`).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Executive Summary <span class="bp-draft-tag">DRAFT</span></div>
        ${_executiveSummary(R, inputs, mode, market, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Investment Thesis <span class="bp-draft-tag">DRAFT</span></div>
        ${_thesis(R, inputs, mode, market, h)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  // ── PAGE 2: BUSINESS PLAN + RISKS + DEVIL'S ADVOCATE + DEAL FACTS
  function _page2(deal, R, inputs, market, h, pageNum, totalPages) {
    const mode = (deal && deal.deal_mode) || 'brrrr';
    let risks = [];
    if (typeof assembleRisks === 'function') risks = assembleRisks();
    const top5 = risks.filter(r => !r.resolved).slice(0, 5);

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
      </div>`;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Business Plan · Risks · Devil\'s Advocate')}

        <div class="im-two-col pb-avoid">
          <div class="im-col-main">
            <div class="print-section pb-avoid"><span class="ps-accent"></span>Business Plan <span class="bp-draft-tag">DRAFT</span></div>
            ${_businessPlan(R, inputs, mode, h)}

            <div class="print-section pb-avoid"><span class="ps-accent"></span>Top Risks</div>
            ${top5.length > 0 ? `
              <div class="ds-risks-list">${top5.map(renderRow).join('')}</div>
            ` : `
              <div class="ds-risks-clear pb-avoid">
                <span class="ds-risks-clear-icon">✓</span>
                <span class="ds-risks-clear-text">No unresolved risks flagged. Confirm with diligence findings before final commitment.</span>
              </div>
            `}

            <div class="print-section pb-avoid"><span class="ps-accent"></span>Devil's Advocate <span class="bp-draft-tag">DRAFT</span></div>
            ${_devilsAdvocate(R, inputs, mode, risks, h)}
          </div>

          <div class="im-col-side">
            <div class="im-facts-title">DEAL FACTS</div>
            ${_dealFacts(R, inputs, mode, h)}
          </div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  // ── PAGE 3: WWNTB + IC QUESTIONS + NEXT STEPS + MARKET CONTEXT
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
    const mode = (deal && deal.deal_mode) || 'brrrr';
    const d = market && market.derived;
    const c = market && market.census;
    const hasMarket = d && d.market_strength_score != null;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'IC Action Items')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>What We'd Need to Believe</div>
        ${_wwntb(R, inputs, mode, market, h)}

        <div class="im-two-col pb-avoid">
          <div class="im-col-main">
            <div class="print-section pb-avoid"><span class="ps-accent"></span>IC Questions</div>
            ${_icQuestions(R, inputs, mode, h)}

            <div class="print-section pb-avoid"><span class="ps-accent"></span>Next Steps</div>
            ${_nextSteps(R, inputs, mode, h)}
          </div>

          <div class="im-col-side">
            <div class="im-facts-title">MARKET CONTEXT</div>
            ${hasMarket ? `
              <div class="im-facts-list pb-avoid">
                <div class="im-fact-row"><span class="im-fact-lbl">Grade</span><span class="im-fact-val">${_esc(d.market_strength_grade || '-')}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Score</span><span class="im-fact-val">${Math.round(d.market_strength_score)} / 100</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">MSA</span><span class="im-fact-val">${_esc(market.cbsa_name || 'Unknown')}</span></div>
                ${c ? `
                <div class="im-fact-row"><span class="im-fact-lbl">Median HH Income</span><span class="im-fact-val">${h.fmtMoney(c.median_household_income)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Median Rent</span><span class="im-fact-val">${h.fmtMoney(c.median_rent)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Rental Vacancy</span><span class="im-fact-val">${h.fmtPct(c.rental_vacancy_rate)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Unemployment</span><span class="im-fact-val">${h.fmtPct(c.unemployment_rate)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Poverty Rate</span><span class="im-fact-val">${h.fmtPct(c.poverty_rate)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Bachelors+</span><span class="im-fact-val">${h.fmtPct(c.bachelors_or_higher_pct)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Owner-Occupied</span><span class="im-fact-val">${h.fmtPct(c.owner_occupied_pct)}</span></div>
                <div class="im-fact-row"><span class="im-fact-lbl">Median Home Value</span><span class="im-fact-val">${h.fmtMoney(c.median_home_value)}</span></div>
                ` : ''}
              </div>
            ` : `
              <div style="font-size:8pt;color:#888;font-style:italic;padding:6pt 0">Market data not fetched for this deal.</div>
            `}
          </div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  function _executiveSummary(R, inputs, mode, market, h) {
    const units = R.total_unit_count || 0;
    const purchase = inputs.purchase_price || 0;
    const reno = inputs.capex_budget || 0;
    const tpc = R.total_project_cost || 0;
    const city = inputs.city || '';
    const state = inputs.state || '';
    const grade = market && market.derived ? market.derived.market_strength_grade : null;

    let para;
    if (mode === 'brrrr') {
      para = `${units}-unit ${_assetTypeLabel(inputs.asset_type).toLowerCase()} acquisition in ${_esc(city)}${state ? ', ' + _esc(state) : ''} at ${h.fmtMoney(purchase)} (${h.fmtMoney(purchase / Math.max(1, units))}/unit), with ${h.fmtMoney(reno)} of value-add capex. Project totals ${h.fmtMoney(tpc)}. Stabilized NOI of ${h.fmtMoney(R.stabilized_noi)} supports ${h.fmtMoneyK(R.stabilized_arv)} ARV at the ${h.fmtPct(inputs.exit_cap, 2)} exit cap. Refi sizes to ${h.fmtMoneyK(R.refi_loan_amount)} at ${h.fmtX(R.dscr, 2)} DSCR, returning ${h.fmtPct(_pctNorm(R.capital_recaptured_pct))} of initial equity. ${h.fmtX(R.equity_multiple, 2)} EM and ${h.fmtPct(R.investor_irr)} IRR over a ${inputs.target_hold_years || 10}-year hold${grade ? ' in a Grade ' + _esc(grade) + ' submarket' : ''}.`;
    } else {
      para = `${_assetTypeLabel(inputs.asset_type)} acquisition in ${_esc(city)}${state ? ', ' + _esc(state) : ''} at ${h.fmtMoney(purchase)}, with ${h.fmtMoney(reno)} of renovation budget over a ${inputs.target_hold_months || 0}-month hold. Total project cost ${h.fmtMoney(tpc)} against ${h.fmtMoney(R.arv)} ARV${R.arv_source === 'override' ? ' (manual override)' : ' (' + (R.comp_count_sales || 0) + ' comps)'}. Projected ${h.fmtPct(R.investor_roi)} investor ROI (${h.fmtPct(R.annualized_return)} annualized) on ${h.fmtMoney(R.investor_equity)} of equity${grade ? ' in a Grade ' + _esc(grade) + ' submarket' : ''}.`;
    }

    return `<div class="bp-narrative pb-avoid"><p>${para}</p></div>`;
  }


  function _thesis(R, inputs, mode, market, h) {
    // Auto-derive a 2-paragraph thesis. Real underwriters edit this
    // before circulating; the auto-text is a starting point.
    const city = inputs.city || '';
    const grade = market && market.derived ? market.derived.market_strength_grade : null;
    const submarket = market && market.cbsa_name ? market.cbsa_name : city || 'the subject submarket';

    let p1, p2;

    if (mode === 'brrrr') {
      const vc = _pctNorm(R.value_creation_pct);
      const recap = _pctNorm(R.capital_recaptured_pct);
      p1 = `The acquisition basis of ${h.fmtMoney(inputs.purchase_price)} sits below the stabilized valuation of ${h.fmtMoneyK(R.stabilized_arv)}, creating ${h.fmtPct(vc)} in projected value uplift through the renovation phase. The ${h.fmtPct(inputs.exit_cap, 2)} exit cap reflects ${grade ? 'a Grade ' + _esc(grade) + ' submarket' : 'submarket dynamics'} and is supported by ${submarket} fundamentals.`;
      p2 = `Refinance proceeds return ${h.fmtPct(recap)} of initial equity, ${recap >= 0.80 ? 'enabling capital recycle into the next acquisition' : recap >= 0.50 ? 'partially recycling sponsor capital' : 'leaving substantial equity trapped in the asset'}. The 10-year levered return profile (${h.fmtX(R.equity_multiple, 2)} EM, ${h.fmtPct(R.investor_irr)} IRR) ${R.equity_multiple >= 2.0 ? 'meets institutional thresholds for value-add multifamily' : R.equity_multiple >= 1.5 ? 'is below institutional targets but acceptable given the recapture profile' : 'is below institutional standards and warrants restructuring before commitment'}.`;
    } else {
      const vc = _pctNorm(R.value_creation_pct);
      p1 = `The acquisition basis of ${h.fmtMoney(inputs.purchase_price)} against an underwritten ARV of ${h.fmtMoney(R.arv)} ${R.arv_source === 'override' ? '(manual override)' : 'derived from ' + (R.comp_count_sales || 0) + ' sales comparables'} produces ${h.fmtPct(vc)} value creation gross of execution. ${submarket} provides comparable trading data at ${R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) + '/SF average' : 'limited frequency'}${R.comp_avg_dom != null ? ' and ' + Math.round(R.comp_avg_dom) + '-day average DOM' : ''}.`;
      p2 = `Net of renovation, carry, and disposition costs, projected investor returns are ${h.fmtPct(R.investor_roi)} on a ${inputs.target_hold_months || 0}-month hold (${h.fmtPct(R.annualized_return)} annualized). ${R.investor_roi >= 0.25 ? 'Return profile is strong and warrants execution discipline rather than thesis revision' : R.investor_roi >= 0.15 ? 'Return profile is acceptable but leaves limited cushion for renovation or schedule slippage' : 'Return profile is thin and IC should challenge whether the basis, ARV, or scope is appropriately conservative'}.`;
    }

    return `<div class="bp-narrative pb-avoid"><p>${p1}</p><p>${p2}</p></div>`;
  }


  function _businessPlan(R, inputs, mode, h) {
    if (mode === 'brrrr') {
      return `
        <div class="bp-narrative pb-avoid">
          <p>Acquire at month 0 using ${h.fmtMoney(R.initial_loan_amt)} of bridge debt at ${h.fmtPct(inputs.initial_rate, 2)} ${_esc(inputs.initial_interest_type || 'IO')}. Execute ${h.fmtMoney(inputs.capex_budget)} renovation program over months 0-${(inputs.target_refi_months || 9) - 1}, achieving stabilized rent roll by month ${inputs.target_refi_months || 9}. Refinance into ${h.fmtPct(inputs.target_refi_ltv, 0)} agency takeout at ${h.fmtPct(inputs.refi_rate, 2)} ${_esc(inputs.refi_interest_type || 'PI')}, returning sponsor equity. Hold for ${inputs.target_hold_years || 10}-year operating period at ${h.fmtPct(inputs.rent_growth_pct, 1)} rent growth and ${h.fmtPct(inputs.appreciation_pct, 1)} appreciation. Dispose at year ${inputs.target_hold_years || 10} at ${h.fmtPct(inputs.exit_cap, 2)} exit cap.</p>
        </div>`;
    } else {
      const renoMonths = inputs.ff_reno_months || Math.round((inputs.target_hold_months || 7) * 0.7);
      const saleMonths = inputs.ff_sale_months || Math.max(1, (inputs.target_hold_months || 7) - renoMonths);
      return `
        <div class="bp-narrative pb-avoid">
          <p>Acquire at month 0 using ${h.fmtMoney(R.initial_loan_amt)} of acquisition + reno bridge debt at ${h.fmtPct(inputs.initial_rate, 2)} ${_esc(inputs.initial_interest_type || 'IO')}. Execute ${h.fmtMoney(inputs.capex_budget)} renovation over months 0-${renoMonths}. Market and dispose over months ${renoMonths}-${(inputs.target_hold_months || 7)} at ${h.fmtMoney(R.arv)} target sale price. Distribute net proceeds to investor after ${h.fmtPct(inputs.sale_cost_pct)} sale costs and remaining loan payoff. ${inputs.lp_gp_split_ff ? h.fmtPct(inputs.lp_gp_split_ff, 0) + ' to LP per split.' : ''}</p>
        </div>`;
    }
  }


  function _dealFacts(R, inputs, mode, h) {
    const _units = R.total_unit_count || 0;
    const _withPd = (val, raw) => {
      if (!_units || _units <= 0 || raw == null || !isFinite(raw) || raw === 0) return val;
      return val + ' | $' + Math.round(Number(raw) / _units).toLocaleString() + '/door';
    };
    const ownPct = Number(inputs.investor_ownership) || 0;
    const _fmtP = (p) => (Math.round(p * 1000) / 10).toFixed(1) + '%';

    const facts = [];
    if (mode === 'brrrr') {
      facts.push(['Units', String(R.total_unit_count || 0)]);
      facts.push(['Purchase Price', _withPd(h.fmtMoney(inputs.purchase_price), inputs.purchase_price)]);
      facts.push(['Reno Budget', _withPd(h.fmtMoney(inputs.capex_budget), inputs.capex_budget)]);
      facts.push(['Total Project Cost', _withPd(h.fmtMoney(R.total_project_cost), R.total_project_cost)]);
      facts.push(['Initial Loan', _withPd(h.fmtMoney(R.initial_loan_amt), R.initial_loan_amt)]);
      facts.push(['Refi Loan', _withPd(h.fmtMoney(R.refi_loan_amount), R.refi_loan_amount)]);
      facts.push(['Stabilized NOI', h.fmtMoney(R.stabilized_noi)]);
      facts.push(['Stabilized ARV', _withPd(h.fmtMoneyK(R.stabilized_arv), R.stabilized_arv)]);
      facts.push(['Exit Cap', h.fmtPct(inputs.exit_cap, 2)]);
      facts.push(['Hold Years', String(inputs.target_hold_years || 10)]);
      facts.push(['Initial Equity', _withPd(h.fmtMoney(R.initial_investor_equity), R.initial_investor_equity)]);
      if (ownPct > 0) {
        facts.push(['Capital Partner Ownership', _fmtP(ownPct) + ' (100% of equity)']);
        facts.push(['Sponsor Ownership', _fmtP(1 - ownPct) + ' (operational)']);
      }
      facts.push(['Capital Recapture', h.fmtPct(_pctNorm(R.capital_recaptured_pct))]);
    } else {
      facts.push(['Subject Area', R.subject_area_sf ? Number(R.subject_area_sf).toLocaleString() + ' SF' : '-']);
      facts.push(['Purchase Price', _withPd(h.fmtMoney(inputs.purchase_price), inputs.purchase_price)]);
      facts.push(['Reno Budget', _withPd(h.fmtMoney(inputs.capex_budget), inputs.capex_budget)]);
      facts.push(['Total Project Cost', _withPd(h.fmtMoney(R.total_project_cost), R.total_project_cost)]);
      facts.push(['Initial Loan', _withPd(h.fmtMoney(R.initial_loan_amt), R.initial_loan_amt)]);
      facts.push(['ARV', _withPd(h.fmtMoney(R.arv), R.arv)]);
      facts.push(['ARV Source', _esc((R.arv_source || 'comps').charAt(0).toUpperCase() + (R.arv_source || 'comps').slice(1))]);
      facts.push(['Sales Comps', String(R.comp_count_sales || 0)]);
      facts.push(['Avg Comp $/SF', R.comp_avg_psf ? h.fmtMoney(R.comp_avg_psf) : '-']);
      facts.push(['Avg DOM', R.comp_avg_dom != null ? Math.round(R.comp_avg_dom) + ' days' : '-']);
      facts.push(['Hold Months', String(inputs.target_hold_months || 0)]);
      facts.push(['Investor Equity', _withPd(h.fmtMoney(R.investor_equity), R.investor_equity)]);
      if (ownPct > 0) {
        facts.push(['Capital Partner Ownership', _fmtP(ownPct) + ' (100% of equity)']);
        facts.push(['Sponsor Ownership', _fmtP(1 - ownPct) + ' (operational)']);
      }
    }

    return `
      <div class="im-facts-list pb-avoid">
        ${facts.map(([lbl, val]) => `
          <div class="im-fact-row">
            <span class="im-fact-lbl">${_esc(lbl)}</span>
            <span class="im-fact-val">${_esc(val)}</span>
          </div>`).join('')}
      </div>`;
  }


  function _devilsAdvocate(R, inputs, mode, risks, h) {
    const high = risks.filter(r => r.severity === 'high' && !r.resolved);
    const medium = risks.filter(r => r.severity === 'medium' && !r.resolved);

    let counter;

    // Mode-specific counters, ordered by severity
    if (mode === 'brrrr') {
      // Worst case: refi can't happen / equity trapped
      if (R.capital_recaptured_pct != null && _pctNorm(R.capital_recaptured_pct) < 0.60) {
        counter = `<strong>The recycle thesis fails.</strong> Refi only returns ${h.fmtPct(_pctNorm(R.capital_recaptured_pct))} of initial equity, meaning ${h.fmtMoney((R.initial_investor_equity || 0) * (1 - _pctNorm(R.capital_recaptured_pct)))} of sponsor capital stays trapped in this asset until year-10 disposition. If the next 2-3 acquisitions all show this profile, capital recycle dies and we revert to a hold-and-pray fund rather than a value-add operator. Question: <em>is the ARV/exit cap combination genuinely supportable, or are we underwriting to make the recapture math work?</em>`;
      }
      // High refi LTV → agency takeout risk
      else if (R.refi_loan_amount > 0 && R.stabilized_arv > 0 && (R.refi_loan_amount / R.stabilized_arv) > 0.80) {
        counter = `<strong>Agency takeout is fragile.</strong> Refi LTV of ${h.fmtPct(R.refi_loan_amount / R.stabilized_arv)} pushes against the agency 80% ceiling. A 50bp exit cap softening drops ARV by ~6% and pushes effective LTV through the cap, requiring a bridge extension or equity infusion. Question: <em>what's the contingency plan if appraised ARV at refi comes in 5-10% below underwriting?</em>`;
      }
      // Thin DSCR → coverage risk
      else if (R.dscr != null && R.dscr < 1.20) {
        counter = `<strong>Coverage cushion is thin.</strong> DSCR of ${h.fmtX(R.dscr, 2)} sits below the institutional 1.20x floor. A 5% vacancy spike or modest rate reset on refi makes the loan non-conforming. Question: <em>have we stressed the deal at 10% vacancy and +50bp refi rate to confirm coverage holds under realistic adverse scenarios?</em>`;
      }
      // Value creation thin
      else if (_pctNorm(R.value_creation_pct) != null && _pctNorm(R.value_creation_pct) < 0.20) {
        counter = `<strong>Value creation margin is too thin.</strong> ${h.fmtPct(_pctNorm(R.value_creation_pct))} value creation provides limited cushion for construction overruns or schedule slippage. A 10% reno overrun or 3-month delay erases most of the margin. Question: <em>is the renovation budget institutional-grade or rough-cut, and what's the GC's track record on schedule discipline?</em>`;
      }
      // Default counter when nothing major fires
      else {
        counter = `<strong>The market call is doing a lot of work.</strong> The deal underwrites cleanly at the stated assumptions, but the ${h.fmtPct(inputs.exit_cap, 2)} exit cap and ${h.fmtPct(inputs.rent_growth_pct, 1)} rent growth assumptions are the load-bearing inputs. A 75bp exit cap softening or rent-growth disappointment compresses returns materially. Question: <em>what's our basis for confidence in those two specific numbers, beyond comparable submarket trades?</em>`;
      }
    } else {
      // F&F mode counters
      if (R.comp_count_sales != null && R.comp_count_sales < 3) {
        counter = `<strong>The ARV is unsupported.</strong> Only ${R.comp_count_sales} valid sales comp${R.comp_count_sales === 1 ? '' : 's'} backs the ${h.fmtMoney(R.arv)} ARV. With this comp depth, the ARV is functionally an estimate rather than a defensible underwriting. Question: <em>can we expand the search radius, relax the date band, or accept a lower-confidence ARV with corresponding return haircut?</em>`;
      }
      else if (R.arv_source === 'override' && R.comp_derived_arv > 0) {
        const diff = (R.arv - R.comp_derived_arv) / R.comp_derived_arv;
        if (diff > 0.10) {
          counter = `<strong>The ARV override is a leap.</strong> Manual ARV of ${h.fmtMoney(R.arv)} is ${h.fmtPct(diff)} above the comp-derived ${h.fmtMoney(R.comp_derived_arv)}. If actual sale comes in at the comp-derived level, ROI drops from ${h.fmtPct(R.investor_roi)} to roughly ${h.fmtPct(R.investor_roi * 0.4)}. Question: <em>what's the specific evidence the subject commands a premium to the comp set, and are we willing to take a haircut at sale if buyers disagree?</em>`;
        } else {
          counter = `<strong>The market call is doing a lot of work.</strong> The deal underwrites cleanly, but the ${h.fmtPct(inputs.sale_cost_pct)} sale cost and ${inputs.target_hold_months || 0}-month timeline assumptions are the load-bearing inputs. A 60-day marketing extension and modest price haircut compress returns materially. Question: <em>what's our marketing strategy and our acceptable price-cut threshold if the first 30 days produce no qualified offers?</em>`;
        }
      }
      else if (R.investor_roi != null && R.investor_roi < 0.20) {
        counter = `<strong>Return margin is too thin for a fix-and-flip.</strong> Projected ROI of ${h.fmtPct(R.investor_roi)} provides limited cushion for execution slippage. A 5% reno overrun or 60-day marketing extension can drop returns into single digits. Question: <em>is the basis genuinely a deal, or are we chasing volume at thin returns?</em>`;
      }
      else if (R.comp_avg_dom != null && R.comp_avg_dom > 75) {
        counter = `<strong>Market liquidity is questionable.</strong> Average comp DOM of ${Math.round(R.comp_avg_dom)} days signals slow turn velocity in this submarket. Our ${inputs.target_hold_months || 0}-month hold assumes a tighter window than the data supports. Question: <em>should we extend the carry budget by 60-90 days to reflect realistic marketing timelines, and what does that do to returns?</em>`;
      }
      else {
        counter = `<strong>The basis and ARV are the whole deal.</strong> The arithmetic is clean at stated inputs, but a 5% miss on either side compresses returns disproportionately on a short-hold flip. Question: <em>have we genuinely tested the basis against off-market alternatives, and have we genuinely stressed the ARV against the weakest comp in the set?</em>`;
      }
    }

    return `<div class="bp-narrative pb-avoid"><p>${counter}</p></div>`;
  }


  function _wwntb(R, inputs, mode, market, h) {
    const items = [];
    if (mode === 'brrrr') {
      items.push(`<strong>Stabilized rents</strong> achievable at ${h.fmtMoney(R.gpr_monthly)} monthly GPR (${h.fmtMoney(R.gpr_annual)} annual), supported by submarket comparables and post-reno asset quality.`);
      items.push(`<strong>Exit cap rate</strong> of ${h.fmtPct(inputs.exit_cap, 2)} holds through the ${inputs.target_hold_years || 10}-year hold period, with no material softening even in a higher-rate environment.`);
      items.push(`<strong>Renovation execution</strong> on time and on budget at ${h.fmtMoney(inputs.capex_budget)}, with the asset stabilized by month ${inputs.target_refi_months || 9} for refi qualification.`);
      items.push(`<strong>Operating expense ratio</strong> stabilizes at ${h.fmtPct(R.expense_ratio)} (${h.fmtMoney(R.total_operating_expenses)}/year), with no material tax reassessment, insurance step-function, or utility inflation surprises.`);
      items.push(`<strong>Refinance market</strong> receptive at ${h.fmtPct(inputs.refi_rate, 2)} for ${h.fmtPct(inputs.target_refi_ltv, 0)} agency takeout in month ${inputs.target_refi_months || 9}, with the asset DSCR-qualified.`);
    } else {
      items.push(`<strong>ARV</strong> achievable at ${h.fmtMoney(R.arv)}${R.arv_source === 'override' ? ' (above comp-derived ' + h.fmtMoney(R.comp_derived_arv) + ')' : ''}, with the comp set defensible as we approach listing.`);
      items.push(`<strong>Renovation scope</strong> executed at ${h.fmtMoney(inputs.capex_budget)} budget within the planned ${Math.round((inputs.target_hold_months || 7) * 0.7)}-month renovation window.`);
      items.push(`<strong>Marketing window</strong> closes within the planned ${(inputs.target_hold_months || 7) - Math.round((inputs.target_hold_months || 7) * 0.7)} months, with carry burden manageable if extended.`);
      items.push(`<strong>Sale execution</strong> at full asking price (or near it), with sale costs of ${h.fmtPct(inputs.sale_cost_pct)} reflecting realistic buyer agent + closing splits.`);
    }

    return `
      <ul class="bp-highlights pb-avoid">
        ${items.map(i => `<li><span class="bp-bullet">▸</span> ${i}</li>`).join('')}
      </ul>`;
  }


  function _icQuestions(R, inputs, mode, h) {
    // Auto-curated IC questions based on which thresholds the deal sits
    // near or fails. These are the things the team should challenge,
    // not boilerplate.
    const qs = [];

    if (mode === 'brrrr') {
      const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0) ? R.refi_loan_amount / R.stabilized_arv : null;
      if (refi_ltv != null && refi_ltv > 0.70) qs.push(`Refi LTV is ${h.fmtPct(refi_ltv)}. What's the plan if appraised value at refi comes in below underwriting?`);
      if (_pctNorm(R.capital_recaptured_pct) < 0.80) qs.push(`Capital recapture is ${h.fmtPct(_pctNorm(R.capital_recaptured_pct))}. Is the recycle thesis still intact, or does this asset become a long-term hold?`);
      if (R.dscr < 1.30) qs.push(`DSCR cushion is ${(R.dscr - 1.20).toFixed(2)}x above the 1.20x floor. What stress test makes us comfortable?`);
      if (inputs.target_refi_months && inputs.target_refi_months < 12) qs.push(`Refi target is month ${inputs.target_refi_months}. What's the contingency if stabilization slips by 90-180 days?`);
      qs.push(`What's the property management strategy through stabilization, and who's the operator?`);
      qs.push(`Has the tax basis assumption been validated against the actual post-sale reassessment risk in this jurisdiction?`);
    } else {
      if (R.comp_count_sales < 5) qs.push(`Comp set is ${R.comp_count_sales} sales. What additional comps could be added, and would they change the ARV?`);
      if (R.arv_source === 'override') qs.push(`ARV is a manual override. What specific market evidence supports the override, and would a buyer's appraiser see the same evidence?`);
      if (R.comp_avg_dom > 60) qs.push(`Average DOM is ${Math.round(R.comp_avg_dom)} days. Should the hold budget include a 60-day marketing extension reserve?`);
      qs.push(`Who is the GC, what's the prior track record, and what's the change-order discipline?`);
      qs.push(`Have we walked the most recent renovated comp, and does the subject post-reno match that quality tier?`);
    }

    return `
      <ol class="im-questions pb-avoid">
        ${qs.map(q => `<li>${q}</li>`).join('')}
      </ol>`;
  }


  function _nextSteps(R, inputs, mode, h) {
    const items = [];
    items.push(`Walk the property and surrounding submarket within 7 days; confirm asset condition matches underwriting.`);
    items.push(`Pull comparable sales and rent comps independent of seller package; validate ${mode === 'brrrr' ? 'GPR and stabilized rents' : 'ARV and DOM'} against a refreshed comp set.`);
    if (mode === 'brrrr') {
      items.push(`Engage GC for binding renovation scope and timeline at ${h.fmtMoney(inputs.capex_budget)} budget; identify any scope items requiring add-alternates.`);
      items.push(`Confirm refi market appetite at ${h.fmtPct(inputs.refi_rate, 2)} for ${h.fmtPct(inputs.target_refi_ltv, 0)} LTV; source 2-3 quotes from preferred takeout lenders.`);
    } else {
      items.push(`Engage GC for binding renovation scope at ${h.fmtMoney(inputs.capex_budget)}; lock in start date and substantial-completion milestone.`);
      items.push(`Engage listing agent and confirm marketing strategy; pre-MLS preview and pricing approach.`);
    }
    items.push(`File documented mitigation for each open risk on the register before capital commitment.`);

    return `
      <ol class="im-questions pb-avoid">
        ${items.map(i => `<li>${i}</li>`).join('')}
      </ol>`;
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
  function renderReport_internal_memo(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const totalPages = 3;

    const pages = [
      _page1(deal, R, inputs, market, h, 1, totalPages),
      _page2(deal, R, inputs, market, h, 2, totalPages),
      _page3(deal, R, inputs, market, h, 3, totalPages)
    ];

    return pages.join('\n');
  }

  window.renderReport_internal_memo = renderReport_internal_memo;

})();
