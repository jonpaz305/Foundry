// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.3 - BRRRR Package Report
// ════════════════════════════════════════════════════════════════
// Institutional underwriting deliverable for lender or equity partner.
// 8-10 pages. Income build, expense detail, sources & uses, debt
// structure (initial + refi), stabilized valuation, refi mechanics,
// 10-year cash flow, returns + sensitivity grid, risk register,
// market context, sponsor section.
//
// CONTRACT
//   window.renderReport_brrrr_package(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES
//   1  Cover + Executive Summary + Narrative (DRAFT-tagged)
//   2  Sources & Uses + Capital Stack + Closing Costs
//   3  Income & Operating Expenses
//   4  Stabilized Valuation + Refi Mechanics
//   5  10-Year Cash Flow Projection + Distributions
//   6  Returns + Disposition + Sensitivity Grid
//   7  Risk Register (full M5 output)
//   8  Market Strength (if data fetched)
//   9  Sponsor (if CP.active has subtitle/contact)
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

  function _truncate(s, n) {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...';
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

  // ── PER-DOOR FORMATTER ────────────────────────────────────────
  // Formats a dollar value with a per-unit suffix for institutional
  // reports. Example: _withPerDoor(550000, 10, h) -> "$550,000 | $55,000/door"
  // When units is 0 or value is null, returns just the dollar value
  // without the per-door suffix (avoids "$0/door" or "$NaN/door" noise).
  function _withPerDoor(value, units, h) {
    const main = h && typeof h.fmtMoney === 'function'
      ? h.fmtMoney(value)
      : (value == null || !isFinite(value) ? '-' : '$' + Math.round(Number(value)).toLocaleString());
    if (!units || units <= 0 || value == null || !isFinite(value) || value === 0) return main;
    const pd = Math.round(Number(value) / units);
    return main + ' <span style="color:#5f5f5f;font-weight:400;font-size:0.85em;margin-left:6px">| $' + pd.toLocaleString() + '/door</span>';
  }

  // Compact variant for KPI tile subtitle slots (no separator pipe, just
  // the per-door figure on its own line - so it doesn't compete with the
  // headline value in the tile).
  function _perDoorOnly(value, units) {
    if (!units || units <= 0 || value == null || !isFinite(value) || value === 0) return '';
    return '$' + Math.round(Number(value) / units).toLocaleString() + '/door';
  }


  // ── HEADER + FOOTER (shared across pages) ─────────────────────
  function _header(h, pageLabel) {
    // Resolve active company. Prefer CP.active. If CP.active exists but
    // has no logo, AND another profile in CP.list does have one, fall
    // back to that profile's branding for the report. This is defensive
    // for the case where a user has multiple profiles and the wrong one
    // is set active. The deal-linked company (CP.active set via loadDeal)
    // takes priority, but if it lacks a logo we use the first profile
    // that has one.
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
          <div><strong>BRRRR Package</strong></div>
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

    const yieldOnCost = (R.stabilized_noi > 0 && R.total_project_cost > 0)
      ? R.stabilized_noi / R.total_project_cost : null;

    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    const tiles = [
      { lbl: 'Refi DSCR',         val: h.fmtX(R.dscr, 2),                  sub: 'Stabilized NOI / Refi DS',
        tone: _toneAbove(R.dscr, 1.05, 1.20) },
      { lbl: 'Stabilized ARV',    val: h.fmtMoneyK(R.stabilized_arv),      sub: 'NOI / Exit Cap', pdSub: _pd(R.stabilized_arv),
        tone: 'neutral' },
      { lbl: 'Yield on Cost',     val: h.fmtPct(yieldOnCost),              sub: 'Stabilized NOI / TPC',
        tone: _toneAbove(yieldOnCost, 0.07, 0.09) },
      { lbl: 'Capital Recapture', val: h.fmtPct(R.capital_recaptured_pct), sub: 'Refi proceeds / equity in',
        tone: _toneAbove(_pctNorm(R.capital_recaptured_pct), 0.60, 0.80) },
      { lbl: 'Investor IRR',      val: h.fmtPct(R.investor_irr),           sub: '10-year levered',
        tone: _toneAbove(R.investor_irr, 0.12, 0.18) },
      { lbl: 'Equity Multiple',   val: h.fmtX(R.equity_multiple, 2),       sub: 'Institutional (Y1-Y10)',
        tone: _toneAbove(R.equity_multiple, 1.5, 2.0) }
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Cover · Executive Summary')}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">BRRRR Underwriting Package</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">
            ${showAddrSub ? _esc(addrLine) + ' · ' : ''}${_esc(_assetTypeLabel(inputs.asset_type))} · ${R.total_unit_count || 0} units · <span class="ds-mode-pill">BRRRR</span>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Headline Metrics</div>
        <div class="print-kpis cols-3">
          ${tiles.map(t => `
            <div class="pk-tile pb-avoid pk-tone-${t.tone}">
              <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
              <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
              <div class="pk-tile-sub">${_esc(t.sub)}${t.pdSub ? ' · ' + _esc(t.pdSub) : ''}</div>
            </div>`).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Deal Narrative <span class="bp-draft-tag">DRAFT</span></div>
        ${_narrative(deal, R, inputs, market, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Investment Highlights</div>
        ${_highlights(R, inputs, h, market)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Top Risks</div>
        ${_topRisks(R, inputs)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── NARRATIVE (auto-generated, draft) ─────────────────────────
  // Three short paragraphs assembled from engine outputs and inputs.
  // Marked DRAFT so the underwriter knows to edit before sending.
  function _narrative(deal, R, inputs, market, h) {
    const units = R.total_unit_count || 0;
    const purchase = inputs.purchase_price || 0;
    const reno = inputs.capex_budget || 0;
    const tpc = R.total_project_cost || 0;
    const arv = R.stabilized_arv || 0;
    const noi = R.stabilized_noi || 0;
    const refi = R.refi_loan_amount || 0;
    const recap = _pctNorm(R.capital_recaptured_pct);
    const em = R.equity_multiple;
    const irr = R.investor_irr;
    const refi_months = inputs.target_refi_months || 9;
    const hold_years = inputs.target_hold_years || 10;
    const city = inputs.city || '';
    const state = inputs.state || '';
    const market_grade = market && market.derived ? market.derived.market_strength_grade : null;

    const p1 = `The opportunity is a ${units}-unit ${_assetTypeLabel(inputs.asset_type).toLowerCase()} acquisition in ${_esc(city)}${state ? ', ' + _esc(state) : ''} at a ${h.fmtMoney(purchase)} purchase price (${h.fmtMoney(purchase / Math.max(1, units))} per unit). The business plan calls for ${h.fmtMoney(reno)} of renovation capex over an approximately ${refi_months}-month value-add hold, taking total project cost to ${h.fmtMoney(tpc)}.`;

    const p2 = `Stabilized underwriting projects ${h.fmtMoney(noi)} in NOI, supporting an ${h.fmtMoneyK(arv)} as-stabilized valuation at the ${h.fmtPct(inputs.exit_cap)} exit cap. The agency takeout sizes to ${h.fmtMoney(refi)} at ${h.fmtPct(inputs.target_refi_ltv)} LTV${R.dscr ? ' and a ' + h.fmtX(R.dscr, 2) + ' DSCR' : ''}. Refi proceeds return ${h.fmtPct(recap)} of initial equity${recap >= 1 ? ' plus excess cash distributions' : ', leaving residual equity in the deal'}.`;

    const p3 = `The 10-year hold projects an institutional equity multiple of ${h.fmtX(em, 2)} and ${h.fmtPct(irr)} IRR${market_grade ? ' against a Grade ' + _esc(market_grade) + ' submarket' : ''}. Key sensitivities are the achieved post-renovation rent, the ${h.fmtPct(inputs.exit_cap)} exit cap holding through the hold period, and execution of the renovation timeline within budget and on schedule.`;

    return `
      <div class="bp-narrative pb-avoid">
        <p>${p1}</p>
        <p>${p2}</p>
        <p>${p3}</p>
      </div>`;
  }


  // ── COMPACT TOP RISKS (for cover, 3-4 line summary) ───────────
  // Replaces the standalone Risk Register page in the equity-partner
  // variant. Shows top 4 unresolved risks (high first, then medium),
  // each on a single line with severity tag + title + brief detail.
  function _topRisks(R, inputs) {
    let risks = [];
    if (typeof assembleRisks === 'function') {
      risks = assembleRisks();
    }
    const unresolved = risks.filter(r => !r.resolved);
    const sev = { high: 0, medium: 1, low: 2 };
    unresolved.sort((a, b) => (sev[a.severity || 'medium'] || 1) - (sev[b.severity || 'medium'] || 1));
    const top = unresolved.slice(0, 4);

    if (top.length === 0) {
      return `
        <ul class="bp-highlights pb-avoid">
          <li><span class="bp-bullet">✓</span> <strong>No flagged risks.</strong> Engine and market modules ran clean against the underwriting assumptions.</li>
        </ul>`;
    }

    const tagColor = (sev) => sev === 'high' ? '#c0392b' : (sev === 'medium' ? '#b8860b' : '#666');

    return `
      <ul class="bp-highlights pb-avoid">
        ${top.map(r => {
          const s = r.severity || 'medium';
          const tag = s.toUpperCase();
          const detail = _truncate(r.detail || '', 130);
          return `<li><span class="bp-bullet" style="color:${tagColor(s)};font-weight:700">${tag}</span> <strong>${_esc(r.title || 'Risk')}.</strong> ${_esc(detail)}</li>`;
        }).join('')}
      </ul>`;
  }


  // ── HIGHLIGHTS (3-4 bullets, always emit) ─────────────────────
  // Two-tier selection: first collect any "strong signal" bullets that
  // meet institutional thresholds. Then pad with descriptive bullets
  // (asset class, hold timing, exit cap, location) so the section never
  // looks empty on a stressed deal. Glyph rendered inline so it always
  // prints (CSS pseudo-elements don't always survive browser print).
  function _highlights(R, inputs, h, market) {
    const strong = [];
    const filler = [];
    const recap = _pctNorm(R.capital_recaptured_pct);
    const vc = _pctNorm(R.value_creation_pct);
    const ib = _pctNorm(R.post_refi_in_basis_pct);

    // Strong-signal bullets (institutional thresholds met)
    if (recap >= 0.80) strong.push(`<strong>Full capital recapture.</strong> Refi proceeds return ${h.fmtPct(recap)} of initial equity, enabling recycle into the next acquisition.`);
    if (R.dscr >= 1.20) strong.push(`<strong>Coverage cushion at refi.</strong> ${h.fmtX(R.dscr, 2)} DSCR provides ${(R.dscr - 1.20).toFixed(2)}x of headroom above the agency 1.20x minimum.`);
    if (vc >= 0.20) strong.push(`<strong>Strong value creation.</strong> ${h.fmtPct(vc)} value creation reflects deep acquisition basis relative to stabilized valuation.`);
    if (R.equity_multiple >= 2.0) strong.push(`<strong>Institutional return profile.</strong> ${h.fmtX(R.equity_multiple, 2)} 10-year equity multiple at ${h.fmtPct(R.investor_irr)} IRR.`);
    if (ib != null && ib <= 0.75) strong.push(`<strong>Conservative post-refi basis.</strong> ${h.fmtPct(ib)} in-basis leaves ample valuation cushion against exit cap softening.`);

    // Descriptive filler bullets (always available)
    const units = R.total_unit_count || 0;
    const ppu = units > 0 ? (inputs.purchase_price || 0) / units : 0;
    filler.push(`<strong>Acquisition basis.</strong> ${h.fmtMoney(inputs.purchase_price)} purchase price (${h.fmtMoney(ppu)} per unit) on a ${units}-unit asset.`);
    filler.push(`<strong>Renovation scope.</strong> ${h.fmtMoney(inputs.capex_budget)} renovation budget over ${inputs.target_refi_months || 9}-month value-add hold.`);
    filler.push(`<strong>Exit assumptions.</strong> ${h.fmtPct(inputs.exit_cap, 2)} exit cap supports ${h.fmtMoneyK(R.stabilized_arv)} stabilized valuation.`);
    if (market && market.derived && market.derived.market_strength_grade) {
      filler.push(`<strong>Submarket grade.</strong> Grade ${market.derived.market_strength_grade} composite score in the ${market.cbsa_name || 'subject MSA'}.`);
    }
    filler.push(`<strong>Hold profile.</strong> ${inputs.target_hold_years || 10}-year hold at ${h.fmtPct(inputs.rent_growth_pct, 1)} rent growth and ${h.fmtPct(inputs.appreciation_pct, 1)} appreciation.`);

    // Combine: strong bullets first, fill to 4 with filler.
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


  // ── PAGE 2: SOURCES & USES + CAPITAL STACK + CLOSING COSTS ────
  function _page2(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    const initialLoan = R.initial_loan_amt || 0;
    // M0.2: surface the two bridge tranches separately.
    const acqTranche = R.acquisition_tranche || 0;
    const conTranche = R.construction_tranche || 0;
    const capexDur = R.capex_duration_months_resolved || 6;

    // Equity attribution: in Foundry's deal-by-deal structure, the
    // Capital Partner funds 100% of equity at closing in exchange for
    // their pro-rata ownership in the deal LLC. The Sponsor (ASJP)
    // contributes operational execution in lieu of cash. There is no
    // institutional GP/LP split at closing - that is a fund-vehicle
    // convention that does not apply here.
    const investorEquity = R.initial_investor_equity || 0;
    const totalSources = initialLoan + investorEquity;

    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const closing = R.closing_costs || 0;
    const consulting = R.consulting || 0;
    const carry = R.debt_service_pre_refi || 0;
    const contingency = inputs.gc_contingency || 0;
    const totalUses = purchase + capex + closing + consulting + carry + contingency;

    // M0.3: closing cost components for the itemized detail table.
    // Pull from engine R fields so the breakdown ties exactly to closing_costs.
    const ccBaseline   = R.cc_baseline || 0;
    const ccInsurance  = R.cc_insurance || 0;
    const ccAppraisal  = R.cc_appraisal || 0;
    const ccOrig       = R.cc_origination || 0;
    const ccLenderPts  = R.cc_lender_points || 0;
    const ccBrokerPts  = R.cc_broker_points || 0;
    const ccFlatFees   = R.cc_lender_flat_fees || 0;
    const ccTransfer   = R.cc_transfer_addon || 0;

    // M0.3: equity required breakdown components (sum to R.initial_investor_equity).
    const eqAcqDown    = R.equity_acq_down_payment || 0;
    const eqCapexGap   = R.equity_capex_gap || 0;
    const eqClosing    = R.equity_closing_costs || 0;
    const eqConsulting = R.equity_consulting || 0;
    const eqCarry      = R.equity_bridge_carry || 0;
    const eqMobIfEq    = R.equity_gc_contingency_if_equity || 0;
    const eqTotal      = R.equity_required_breakdown_total || 0;

    // Capital Stack segment widths. Three segments: acquisition tranche,
    // construction tranche, and investor equity. No GP/LP split at the
    // closing-day stack level - that is a returns-split question handled
    // in the Ownership & Distribution disclosure block below.
    const acqPct = (acqTranche / Math.max(1, totalSources)) * 100;
    const conPct = (conTranche / Math.max(1, totalSources)) * 100;
    const eqPct  = (investorEquity / Math.max(1, totalSources)) * 100;
    const debtPct = (initialLoan / Math.max(1, totalSources));

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Sources & Uses · Capital Stack')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sources & Uses</div>
        <div class="bp-su-grid">
          <table class="print-table pb-avoid">
            <thead><tr><th>Sources</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Senior Debt: Acquisition Tranche</td><td class="num">${h.fmtMoney(acqTranche)}</td><td class="num">${_pd(acqTranche)}</td><td class="num">${h.fmtPct(acqTranche / Math.max(1, totalSources))}</td></tr>
              <tr><td>Senior Debt: Construction Tranche</td><td class="num">${h.fmtMoney(conTranche)}</td><td class="num">${_pd(conTranche)}</td><td class="num">${h.fmtPct(conTranche / Math.max(1, totalSources))}</td></tr>
              <tr><td style="padding-left:1.5em">Total Bridge</td><td class="num">${h.fmtMoney(initialLoan)}</td><td class="num">${_pd(initialLoan)}</td><td class="num">${h.fmtPct(debtPct)}</td></tr>
              <tr><td>Investor Equity</td><td class="num">${h.fmtMoney(investorEquity)}</td><td class="num">${_pd(investorEquity)}</td><td class="num">${h.fmtPct(investorEquity / Math.max(1, totalSources))}</td></tr>
              <tr class="totals"><td>Total Sources</td><td class="num">${h.fmtMoney(totalSources)}</td><td class="num">${_pd(totalSources)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>

          <table class="print-table pb-avoid">
            <thead><tr><th>Uses</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr><td>Purchase Price</td><td class="num">${h.fmtMoney(purchase)}</td><td class="num">${_pd(purchase)}</td><td class="num">${h.fmtPct(purchase / Math.max(1, totalUses))}</td></tr>
              <tr><td>Capex Budget</td><td class="num">${h.fmtMoney(capex)}</td><td class="num">${_pd(capex)}</td><td class="num">${h.fmtPct(capex / Math.max(1, totalUses))}</td></tr>
              <tr><td>Closing Costs</td><td class="num">${h.fmtMoney(closing)}</td><td class="num">${_pd(closing)}</td><td class="num">${h.fmtPct(closing / Math.max(1, totalUses))}</td></tr>
              <tr><td>Consulting</td><td class="num">${h.fmtMoney(consulting)}</td><td class="num">${_pd(consulting)}</td><td class="num">${h.fmtPct(consulting / Math.max(1, totalUses))}</td></tr>
              <tr><td>Carry (DS pre-refi)</td><td class="num">${h.fmtMoney(carry)}</td><td class="num">${_pd(carry)}</td><td class="num">${h.fmtPct(carry / Math.max(1, totalUses))}</td></tr>
              <tr><td>Sponsor Mobilization</td><td class="num">${h.fmtMoney(contingency)}</td><td class="num">${_pd(contingency)}</td><td class="num">${h.fmtPct(contingency / Math.max(1, totalUses))}</td></tr>
              <tr class="totals"><td>Total Uses</td><td class="num">${h.fmtMoney(totalUses)}</td><td class="num">${_pd(totalUses)}</td><td class="num">100.0%</td></tr>
            </tbody>
          </table>
        </div>

        <div class="bp-capex-note pb-avoid" style="font-size:9pt;color:var(--print-muted);margin-top:6pt;line-height:1.4">
          Sponsor mobilization (capex float): <strong>${h.fmtMoney(contingency)}</strong>.
          Construction tranche funds ${h.fmtPct(inputs.initial_loan_ltc_capex)} of capex via draws over a ${capexDur}-month execution window.
          Mobilization covers GC payment cycles before lender reimbursement and is recouped before refi.
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Structure</div>
        <div class="bp-capstack pb-avoid">
          <div class="bp-capstack-bar">
            <div class="bp-capstack-seg bp-seg-debt-acq" style="width:${acqPct.toFixed(1)}%">
              <span class="bp-seg-lbl">Acq</span>
              <span class="bp-seg-val">${h.fmtPct(acqTranche / Math.max(1, totalSources), 0)}</span>
            </div>
            <div class="bp-capstack-seg bp-seg-debt-con" style="width:${conPct.toFixed(1)}%">
              <span class="bp-seg-lbl">Con</span>
              <span class="bp-seg-val">${h.fmtPct(conTranche / Math.max(1, totalSources), 0)}</span>
            </div>
            <div class="bp-capstack-seg bp-seg-sponsor" style="width:${eqPct.toFixed(1)}%">
              <span class="bp-seg-lbl">Equity</span>
              <span class="bp-seg-val">${h.fmtPct(investorEquity / Math.max(1, totalSources), 0)}</span>
            </div>
          </div>
          <div class="bp-capstack-legend" style="display:flex;gap:1.5em;font-size:8.5pt;color:var(--print-muted);margin-top:6pt;flex-wrap:wrap">
            <span><span class="bp-legend-swatch bp-seg-debt-acq"></span> Senior Debt: Acquisition Tranche</span>
            <span><span class="bp-legend-swatch bp-seg-debt-con"></span> Senior Debt: Construction Tranche</span>
            <span><span class="bp-legend-swatch bp-seg-sponsor"></span> Investor Equity</span>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Equity Required Breakdown</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Amount</th><th class="num">$/Door</th><th class="num">% of Equity</th></tr></thead>
          <tbody>
            <tr><td>Mortgage down payment (acquisition)</td><td class="num">${h.fmtMoney(eqAcqDown)}</td><td class="num">${_pd(eqAcqDown)}</td><td class="num">${h.fmtPct(eqAcqDown / Math.max(1, eqTotal))}</td></tr>
            <tr><td>Capex above lender funding</td><td class="num">${h.fmtMoney(eqCapexGap)}</td><td class="num">${_pd(eqCapexGap)}</td><td class="num">${h.fmtPct(eqCapexGap / Math.max(1, eqTotal))}</td></tr>
            <tr><td>Closing costs (full detail below)</td><td class="num">${h.fmtMoney(eqClosing)}</td><td class="num">${_pd(eqClosing)}</td><td class="num">${h.fmtPct(eqClosing / Math.max(1, eqTotal))}</td></tr>
            <tr><td>Consulting / project fee</td><td class="num">${h.fmtMoney(eqConsulting)}</td><td class="num">${_pd(eqConsulting)}</td><td class="num">${h.fmtPct(eqConsulting / Math.max(1, eqTotal))}</td></tr>
            <tr><td>Bridge debt service through refi</td><td class="num">${h.fmtMoney(eqCarry)}</td><td class="num">${_pd(eqCarry)}</td><td class="num">${h.fmtPct(eqCarry / Math.max(1, eqTotal))}</td></tr>
            <tr><td>Mobilization float${eqMobIfEq > 0 ? '' : ' (excluded - reimbursed via draws)'}</td><td class="num">${h.fmtMoney(eqMobIfEq)}</td><td class="num">${_pd(eqMobIfEq)}</td><td class="num">${h.fmtPct(eqMobIfEq / Math.max(1, eqTotal))}</td></tr>
            <tr class="totals"><td>Total Equity Required at Closing</td><td class="num">${h.fmtMoney(eqTotal)}</td><td class="num">${_pd(eqTotal)}</td><td class="num">100.0%</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Initial Debt Terms (Bridge)</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Acquisition Tranche</span><span class="pl-val">${h.fmtMoney(acqTranche)} (${h.fmtPct(inputs.initial_loan_ltv)} of purchase)</span></div>
          <div class="pl-row"><span class="pl-lbl">Construction Tranche</span><span class="pl-val">${h.fmtMoney(conTranche)} (${h.fmtPct(inputs.initial_loan_ltc_capex)} of capex, draws over ${capexDur} mo)</span></div>
          <div class="pl-row"><span class="pl-lbl">Total Bridge</span><span class="pl-val">${h.fmtMoney(initialLoan)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Rate / Type</span><span class="pl-val">${h.fmtPct(inputs.initial_rate, 2)} ${_esc(inputs.initial_interest_type || 'IO')}</span></div>
          <div class="pl-row"><span class="pl-lbl">Monthly DS (full balance)</span><span class="pl-val">${h.fmtMoney(R.initial_monthly_ds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Total Carry to Refi</span><span class="pl-val">${h.fmtMoney(carry)} (Month ${inputs.target_refi_months || 9} target)</span></div>
          <div class="pl-row"><span class="pl-lbl">Total Closing Costs</span><span class="pl-val">${h.fmtMoney(closing)} (origination, points, title, insurance, transfer; itemized detail available on request)</span></div>
        </div>

        ${_ownershipDistributionBlock(R, inputs, h)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── OWNERSHIP & DISTRIBUTION STRUCTURE ────────────────────────
  // Discloses the actual deal LLC ownership structure. In Foundry's
  // deal-by-deal model, the Capital Partner funds 100% of equity at
  // closing in exchange for their pro-rata ownership in the deal LLC.
  // The Sponsor (ASJP) contributes operational execution in lieu of
  // cash equity. Cash flow and disposition proceeds split pro-rata
  // to ownership - no promote, no preferred return, no waterfall.
  //
  // The block renders only when investor_ownership > 0 and there is
  // a real equity check. Deals where the sponsor self-funds 100%
  // (investor_ownership == 0 or null) suppress the block entirely.
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


  // ── PAGE 3: INCOME & OPERATING EXPENSES ───────────────────────
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
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
        ${_header(h, 'Income & Operating Expenses')}

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
            <tr class="totals">
              <td>Total</td>
              <td class="num">${units}</td>
              <td></td>
              <td class="num">${h.fmtMoney(R.gpr_monthly)}</td>
              <td class="num">${h.fmtMoney(R.gpr_annual)}</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Income Build</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Line</th><th class="num">Amount</th><th class="num">% of GPR</th></tr></thead>
          <tbody>
            <tr><td>Gross Potential Rent (GPR)</td><td class="num">${h.fmtMoney(R.gpr_annual)}</td><td class="num">100.0%</td></tr>
            <tr><td>Less: Vacancy Loss (${h.fmtPct(inputs.vacancy_pct)})</td><td class="num">(${h.fmtMoney(R.vacancy_loss)})</td><td class="num">${h.fmtPct(R.vacancy_loss / Math.max(1, R.gpr_annual))}</td></tr>
            <tr class="totals"><td>Effective Gross Income (EGI)</td><td class="num">${h.fmtMoney(egi)}</td><td class="num">${h.fmtPct(egi / Math.max(1, R.gpr_annual))}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Operating Expenses</div>
        ${(R.taxes === 0 || R.taxes == null) ? `
          <div class="print-callout pb-avoid" style="border-left-color:#c0392b">
            <div class="pc-title" style="color:#c0392b">⚠ Property taxes computed to $0</div>
            ${!(inputs.tax_district || '').trim()
              ? 'No tax district is set for this deal. Property taxes have been excluded from the operating expense build, which materially overstates NOI, ARV, refi sizing, and investor returns. Set the tax district on the Deal Setup page before circulating this report externally.'
              : 'The tax district "' + _esc(inputs.tax_district) + '" was not found in the Cuyahoga rate table. Property taxes have been excluded from the operating expense build. Verify the district spelling against the autocomplete on the Deal Setup page before circulating this report externally.'}
          </div>
        ` : ''}
        <table class="print-table pb-avoid">
          <thead><tr><th>Line Item</th><th>Basis</th><th class="num">Amount</th><th class="num">$/Unit</th><th class="num">% of EGI</th></tr></thead>
          <tbody>
            ${opex.map(([lbl, amt, pct, note]) => `
              <tr>
                <td>${_esc(lbl)}</td>
                <td>${pct != null ? h.fmtPct(pct) + ' ' + _esc(note) : _esc(note)}</td>
                <td class="num">${h.fmtMoney(amt)}</td>
                <td class="num">${h.fmtMoney((amt || 0) / Math.max(1, units))}</td>
                <td class="num">${h.fmtPct((amt || 0) / Math.max(1, egi))}</td>
              </tr>`).join('')}
            <tr class="totals">
              <td>Total Operating Expenses</td>
              <td></td>
              <td class="num">${h.fmtMoney(R.total_operating_expenses)}</td>
              <td class="num">${h.fmtMoney((R.total_operating_expenses || 0) / Math.max(1, units))}</td>
              <td class="num">${h.fmtPct(R.expense_ratio)}</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Net Operating Income</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Stabilized NOI</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi)}</span></div>
          <div class="pl-row"><span class="pl-lbl">NOI Margin</span><span class="pl-val">${h.fmtPct(R.noi_margin)}</span></div>
          <div class="pl-row"><span class="pl-lbl">NOI per Unit</span><span class="pl-val">${h.fmtMoney((R.stabilized_noi || 0) / Math.max(1, units))}</span></div>
          <div class="pl-row"><span class="pl-lbl">Expense Ratio</span><span class="pl-val">${h.fmtPct(R.expense_ratio)}</span></div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 4: STABILIZED VALUATION + REFI MECHANICS ─────────────
  function _page4(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);
    const _pdInline = (v) => _withPerDoor(v, _units, h);

    const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0)
      ? R.refi_loan_amount / R.stabilized_arv : null;

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Stabilized Valuation · Refinance')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stabilized Valuation</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Component</th><th class="num">Value</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>Stabilized NOI</td><td class="num">${h.fmtMoney(R.stabilized_noi)}</td><td class="num">${_pd(R.stabilized_noi)}</td></tr>
            <tr><td>Exit Cap Rate</td><td class="num">${h.fmtPct(inputs.exit_cap, 2)}</td><td class="num"></td></tr>
            <tr class="totals"><td>Stabilized ARV (NOI / Exit Cap)</td><td class="num">${h.fmtMoney(R.stabilized_arv)}</td><td class="num">${_pd(R.stabilized_arv)}</td></tr>
            <tr><td>Total Project Cost</td><td class="num">${h.fmtMoney(R.total_project_cost)}</td><td class="num">${_pd(R.total_project_cost)}</td></tr>
            <tr class="totals"><td>Value Creation (ARV − TPC)</td><td class="num">${h.fmtMoney(R.value_creation)} (${h.fmtPct(_pctNorm(R.value_creation_pct))})</td><td class="num">${_pd(R.value_creation)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Refinance Loan Sizing</div>
        <div class="print-list pb-avoid">
          <div class="pl-row"><span class="pl-lbl">Target Refi LTV</span><span class="pl-val">${h.fmtPct(inputs.target_refi_ltv)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Refi Loan (Target LTV × ARV)</span><span class="pl-val">${h.fmtMoney(R.refi_loan_amount)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Effective Refi LTV</span><span class="pl-val">${h.fmtPct(refi_ltv)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Refi Rate</span><span class="pl-val">${h.fmtPct(inputs.refi_rate, 2)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Interest Type</span><span class="pl-val">${_esc(inputs.refi_interest_type || 'PI')}</span></div>
          <div class="pl-row"><span class="pl-lbl">Monthly DS</span><span class="pl-val">${h.fmtMoney(R.refi_monthly_ds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Annual DS</span><span class="pl-val">${h.fmtMoney(R.refi_annual_ds)}</span></div>
          <div class="pl-row"><span class="pl-lbl">DSCR</span><span class="pl-val">${h.fmtX(R.dscr, 2)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Post-Refi In-Basis</span><span class="pl-val">${h.fmtPct(_pctNorm(R.post_refi_in_basis_pct))}</span></div>
          <div class="pl-row"><span class="pl-lbl">Breakeven Occupancy</span><span class="pl-val">${h.fmtPct(R.breakeven_occupancy)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Refi Price per Unit</span><span class="pl-val">${h.fmtMoney(R.refi_price_per_unit)}</span></div>
          <div class="pl-row"><span class="pl-lbl">Investor Equity Remaining</span><span class="pl-val">${h.fmtMoney(R.investor_equity_remaining)}</span></div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Refi Proceeds Waterfall</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Step</th><th class="num">Amount</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>New Refi Loan</td><td class="num">${h.fmtMoney(R.refi_loan_amount)}</td><td class="num">${_pd(R.refi_loan_amount)}</td></tr>
            <tr><td>Less: Payoff of Initial Loan</td><td class="num">(${h.fmtMoney(R.payoff_existing_debt || R.initial_loan_amt)})</td><td class="num">${_pd(R.payoff_existing_debt || R.initial_loan_amt)}</td></tr>
            <tr><td>Less: Refi Closing Costs (${h.fmtPct(inputs.refi_closing_cost_pct || 0, 1)})</td><td class="num">(${h.fmtMoney(R.refi_closing_costs)})</td><td class="num">${_pd(R.refi_closing_costs)}</td></tr>
            <tr class="totals"><td>Net Cash Out</td><td class="num">${h.fmtMoney(R.net_cash_out)}</td><td class="num">${_pd(R.net_cash_out)}</td></tr>
            <tr><td>Initial Investor Equity</td><td class="num">${h.fmtMoney(R.initial_investor_equity)}</td><td class="num">${_pd(R.initial_investor_equity)}</td></tr>
            <tr><td>Capital Returned at Refi</td><td class="num">${h.fmtMoney(R.capital_returned_at_refi)}</td><td class="num">${_pd(R.capital_returned_at_refi)}</td></tr>
            <tr><td>Capital Recapture %</td><td class="num">${h.fmtPct(_pctNorm(R.capital_recaptured_pct))}</td><td class="num"></td></tr>
            <tr><td>Excess Distribution (if any)</td><td class="num">${h.fmtMoney(R.excess_refi_proceeds)}</td><td class="num">${_pd(R.excess_refi_proceeds)}</td></tr>
          </tbody>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 5: 10-YEAR CASH FLOW PROJECTION ──────────────────────
  function _page5(deal, R, inputs, market, h, pageNum, totalPages) {
    const dist = R.distribution || [];
    const hold = inputs.target_hold_years || 10;
    const rg = inputs.rent_growth_pct || 0;

    // Build year-by-year approximation: GPR grows at rent_growth_pct,
    // vacancy/opex ratios held constant, NOI grows accordingly,
    // DS is the refi annual DS (stable for amortizing loan).
    const years = [];
    const baseGpr = R.gpr_annual || 0;
    const baseVacRate = inputs.vacancy_pct || 0;
    const baseOpex = R.total_operating_expenses || 0;
    const baseEgi = R.egi || 0;
    const baseExpRatio = baseEgi > 0 ? baseOpex / baseEgi : 0;
    const refiDS = R.refi_annual_ds || 0;
    const initialDS = R.debt_service_pre_refi || 0;
    const refiMonth = inputs.target_refi_months || 9;

    for (let y = 1; y <= hold; y++) {
      const gpr = baseGpr * Math.pow(1 + rg, y - 1);
      const vac = gpr * baseVacRate;
      const egi = gpr - vac;
      const opex = egi * baseExpRatio;
      const noi = egi - opex;
      // Y1: blended DS (pre-refi portion + post-refi portion)
      let ds;
      if (y === 1) {
        ds = initialDS + (refiDS * (12 - refiMonth) / 12);
      } else {
        ds = refiDS;
      }
      const cf = noi - ds;
      years.push({ y, gpr, vac, egi, opex, noi, ds, cf });
    }

    return `
      <div class="print-page print-page-compact">
        ${_header(h, '10-Year Cash Flow Projection')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Annual Cash Flow Build</div>
        <table class="print-table bp-cf-table pb-avoid">
          <thead>
            <tr>
              <th>Yr</th>
              <th class="num">GPR</th>
              <th class="num">Vacancy</th>
              <th class="num">EGI</th>
              <th class="num">OpEx</th>
              <th class="num">NOI</th>
              <th class="num">DS</th>
              <th class="num">Cash Flow</th>
            </tr>
          </thead>
          <tbody>
            ${years.map(y => `
              <tr>
                <td>Y${y.y}</td>
                <td class="num">${h.fmtMoney(y.gpr)}</td>
                <td class="num">(${h.fmtMoney(y.vac)})</td>
                <td class="num">${h.fmtMoney(y.egi)}</td>
                <td class="num">(${h.fmtMoney(y.opex)})</td>
                <td class="num">${h.fmtMoney(y.noi)}</td>
                <td class="num">(${h.fmtMoney(y.ds)})</td>
                <td class="num">${h.fmtMoney(y.cf)}</td>
              </tr>`).join('')}
          </tbody>
          <caption>Assumes ${h.fmtPct(rg, 1)} annual rent growth; expense ratio and vacancy held constant. Y1 reflects ${refiMonth} months of bridge-rate carry plus ${12 - refiMonth} months of refi-rate DS (this differs from the Dashboard's Stabilized Annual Cash Flow figure, which shows the stabilized run-rate after refi).</caption>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Distributions to Investor</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Year</th><th class="num">Distribution</th><th>Notes</th></tr></thead>
          <tbody>
            ${dist.slice(0, hold + 1).map((d, i) => `
              <tr>
                <td>Y${i}</td>
                <td class="num">${i === 0 ? '(' + h.fmtMoney(Math.abs(d)) + ')' : h.fmtMoney(d)}</td>
                <td>${i === 0 ? 'Initial equity contribution' : (i === 1 ? 'Refi proceeds + Y1 operating cash flow' : (i === hold ? 'Net sale proceeds + Y' + hold + ' operating' : 'Operating cash flow'))}</td>
              </tr>`).join('')}
          </tbody>
          <caption>Y10 reflects engine's corrected disposition (spreadsheet's E65 blank-reference bug fixed).</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 6: RETURNS + DISPOSITION + SENSITIVITY ───────────────
  function _page6(deal, R, inputs, market, h, pageNum, totalPages) {
    const _units = R.total_unit_count || 0;
    const _pd = (v) => _perDoorOnly(v, _units);

    // Sensitivity grid: exit cap × rent growth → equity multiple.
    // We can't call recompute() recursively (it would mutate R) but we
    // can build a closed-form approximation: ARV scales linearly with NOI
    // (which scales with rent growth) divided by the alt exit cap.
    // For institutional purposes this approximation is more than adequate
    // and clearly documented in the caption.
    const sens = _buildSensitivityGrid(R, inputs);

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Returns · Disposition · Sensitivity')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Returns Summary</div>
        <div class="print-kpis cols-3">
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">Investor IRR</div><div class="pk-tile-val">${h.fmtPct(R.investor_irr)}</div><div class="pk-tile-sub">10-year levered</div></div>
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">Equity Multiple</div><div class="pk-tile-val">${h.fmtX(R.equity_multiple, 2)}</div><div class="pk-tile-sub">Institutional (Y1-Y10)</div></div>
          <div class="pk-tile pb-avoid"><div class="pk-tile-lbl">Total Distributions</div><div class="pk-tile-val">${h.fmtMoneyK(_sumDistributions(R))}</div><div class="pk-tile-sub">Y1 through Y${inputs.target_hold_years || 10}</div></div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Disposition Mechanics (Year ${inputs.target_hold_years || 10})</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Step</th><th class="num">Amount</th><th class="num">$/Door</th></tr></thead>
          <tbody>
            <tr><td>Year-${inputs.target_hold_years || 10} NOI (grown at ${h.fmtPct(inputs.rent_growth_pct, 1)})</td><td class="num">${h.fmtMoney(R.stabilized_noi * Math.pow(1 + (inputs.rent_growth_pct || 0), (inputs.target_hold_years || 10) - 1))}</td><td class="num">${_pd(R.stabilized_noi * Math.pow(1 + (inputs.rent_growth_pct || 0), (inputs.target_hold_years || 10) - 1))}</td></tr>
            <tr><td>Exit Cap</td><td class="num">${h.fmtPct(inputs.exit_cap, 2)}</td><td class="num"></td></tr>
            <tr class="totals"><td>Disposition Value</td><td class="num">${h.fmtMoney(R.disposition_value)}</td><td class="num">${_pd(R.disposition_value)}</td></tr>
            <tr><td>Less: Sale Cost (${h.fmtPct(inputs.sale_cost_pct)})</td><td class="num">(${h.fmtMoney(R.sale_cost)})</td><td class="num">${_pd(R.sale_cost)}</td></tr>
            <tr><td>Less: Remaining Loan Balance</td><td class="num">(${h.fmtMoney(R.remaining_loan_balance)})</td><td class="num">${_pd(R.remaining_loan_balance)}</td></tr>
            <tr class="totals"><td>Net Sale Proceeds</td><td class="num">${h.fmtMoney(R.net_sale_proceeds)}</td><td class="num">${_pd(R.net_sale_proceeds)}</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sensitivity: Equity Multiple</div>
        <table class="print-table bp-sens-table pb-avoid">
          <thead>
            <tr>
              <th></th>
              ${sens.exitCaps.map(ec => `<th class="num">${h.fmtPct(ec, 2)}</th>`).join('')}
            </tr>
            <tr>
              <th>Rent Growth ↓ / Exit Cap →</th>
              <td colspan="${sens.exitCaps.length}" class="bp-sens-head">Exit Cap Rate</td>
            </tr>
          </thead>
          <tbody>
            ${sens.rows.map(row => `
              <tr>
                <td class="bp-sens-lbl">${h.fmtPct(row.rentGrowth, 1)}</td>
                ${row.cells.map(c => `<td class="num ${c.tone ? 'bp-sens-' + c.tone : ''}">${h.fmtX(c.em, 2)}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
          <caption>Sensitivity uses a closed-form approximation: disposition value scales with Y10 NOI (rent-growth driven) divided by the alternate exit cap; net proceeds adjusted accordingly. Sponsor base case in bold. Cells shaded by EM threshold (red &lt; 1.5x, amber 1.5-2.0x, green ≥ 2.0x).</caption>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── SENSITIVITY HELPER ────────────────────────────────────────
  // Builds a 5×5 grid of equity multiples across exit cap and rent
  // growth perturbations. Uses a closed-form approximation rather than
  // calling recompute() (which would mutate the live R object).
  //
  // Method:
  //   1. For each (exit_cap, rent_growth) pair, recompute Y10 NOI:
  //        noi_y10 = stabilized_noi × (1 + rent_growth)^(hold - 1)
  //   2. Disposition value = noi_y10 / exit_cap
  //   3. Sale cost and remaining loan balance held to live values
  //      (rent growth doesn't affect amortization; sale cost is a pct
  //      of disposition).
  //   4. Net sale proceeds = disposition × (1 - sale_cost_pct) - rem_loan
  //   5. Y10 distribution = sum(Y2..Y9 cash flow) [held constant for
  //      tractability] + net_sale_proceeds + grown Y10 op cash flow.
  //   6. EM = (Y1..Y10 distributions) / initial equity.
  //
  // The approximation matters for understanding deal sensitivity, not
  // for primary underwriting; clearly captioned.
  function _buildSensitivityGrid(R, inputs) {
    const baseEC = inputs.exit_cap || 0.07;
    const baseRG = inputs.rent_growth_pct || 0;
    const baseSCP = inputs.sale_cost_pct || 0.07;
    const hold = inputs.target_hold_years || 10;
    const remLoan = R.remaining_loan_balance || 0;
    const initEq = R.initial_investor_equity || 1;
    const baseNOI = R.stabilized_noi || 0;
    const refiDS = R.refi_annual_ds || 0;
    const baseVac = inputs.vacancy_pct || 0;
    const baseGpr = R.gpr_annual || 0;
    const baseExpRatio = (R.egi > 0) ? (R.total_operating_expenses / R.egi) : 0;
    const dist = R.distribution || [];

    // Sum operating distributions Y2 through Y9 (between refi and sale)
    let sumOpDist = 0;
    for (let i = 2; i <= Math.min(9, dist.length - 1); i++) {
      sumOpDist += dist[i] || 0;
    }
    // Y1 (refi proceeds + Y1 operating) is held constant
    const y1 = dist[1] || 0;

    // Build 3 exit cap perturbations: -50bp, base, +50bp (compressed
    // for equity-partner audience; full 5×5 grid available in dashboard
    // or by request).
    const exitCaps = [baseEC - 0.005, baseEC, baseEC + 0.005];
    // Rent growth: -1%, base, +1%
    const rgs = [baseRG - 0.01, baseRG, baseRG + 0.01];

    const rows = rgs.map(rg => {
      const cells = exitCaps.map(ec => {
        // Y10 NOI
        const gpr10 = baseGpr * Math.pow(1 + rg, hold - 1);
        const egi10 = gpr10 * (1 - baseVac);
        const opex10 = egi10 * baseExpRatio;
        const noi10 = egi10 - opex10;
        const cf10 = noi10 - refiDS;
        // Disposition
        const dispo = noi10 / Math.max(0.001, ec);
        const sc = dispo * baseSCP;
        const netSale = dispo - sc - remLoan;
        // Y10 distribution = operating + net sale
        const y10 = cf10 + netSale;
        // EM
        const total = y1 + sumOpDist + y10;
        const em = total / initEq;
        let tone = '';
        if (em >= 2.0) tone = 'good';
        else if (em >= 1.5) tone = 'warn';
        else tone = 'bad';
        // Mark base case
        const isBase = Math.abs(ec - baseEC) < 1e-6 && Math.abs(rg - baseRG) < 1e-6;
        if (isBase) tone += ' base';
        return { em, tone, isBase };
      });
      return { rentGrowth: rg, cells };
    });

    return { exitCaps, rgs, rows };
  }


  // ── PAGE 7: RISK REGISTER ─────────────────────────────────────
  function _page7(deal, R, inputs, market, h, pageNum, totalPages) {
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


  // ── PAGE 8: MARKET STRENGTH ───────────────────────────────────
  function _page8(deal, R, inputs, market, h, pageNum, totalPages) {
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


  // ── PAGE 9: SPONSOR (only if CP.active has subtitle or contact)
  function _page9(deal, R, inputs, market, h, pageNum, totalPages) {
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

  // ── PAGE: NOTICES AND DISCLAIMERS (Path A - always renders) ──
  function _pageDisclaimers(deal, R, inputs, market, h, pageNum, totalPages) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Notices and Disclaimers')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Notices and Disclaimers</div>
        <div class="bp-disclaimer">
          ${typeof disclaimersForEquityPackage === 'function' ? disclaimersForEquityPackage(coName, { isFF: false }) : ''}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  // ── PAGE: MODEL ASSUMPTIONS AND METHODOLOGY (Path A Pass 3) ──
  // Placed before Notices and Disclaimers. Itemizes every input that
  // drove the report's outputs so the reader can audit any conclusion.
  function _pageModelAssumptions(deal, R, inputs, market, h, pageNum, totalPages) {
    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Model Assumptions and Methodology')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Model Assumptions and Methodology</div>
        <div style="font-size:9pt;color:var(--print-muted);margin-bottom:6pt;line-height:1.45">
          The following inventory of inputs, derived values, and methodological choices was used to produce the figures elsewhere in this report. Where a value is labeled "sponsor input", the sponsor selected the value; where labeled "engine", "derived", or "data source", the value follows from sponsor inputs via the underwriting engine or third-party data.
        </div>

        ${typeof modelAssumptionsForEquityPackage === 'function' ? modelAssumptionsForEquityPackage(R, inputs, market, 'brrrr') : ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── TONE HELPERS (shared with Deal Snapshot pattern) ──────────
  function _sumDistributions(R) {
    if (!R || !Array.isArray(R.distribution)) return null;
    let sum = 0;
    for (let i = 1; i < R.distribution.length; i++) sum += R.distribution[i] || 0;
    return sum;
  }
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


  // ── COMBINED METHODOLOGY & DISCLOSURES (replaces 2 standalone pages)
  // Compact final page: short methodology footnote + condensed legal
  // disclaimers. Strips the equity-partner package from 2 pages to 1
  // while preserving the institutional disclosure standard. Full
  // methodology available on request (Internal Memo and Lender Package
  // retain the full Model Assumptions disclosure for IC and lender
  // audiences).
  function _pageMethodologyAndDisclosures(deal, R, inputs, market, h, pageNum, totalPages) {
    const engineV = (typeof FOUNDRY_ENGINE_VERSION === 'string' && FOUNDRY_ENGINE_VERSION) ? FOUNDRY_ENGINE_VERSION : 'unversioned';
    const engineDate = (typeof FOUNDRY_ENGINE_VERSION_DATE === 'string' && FOUNDRY_ENGINE_VERSION_DATE) ? FOUNDRY_ENGINE_VERSION_DATE : '';
    const arvSource = R.arv_source_resolved === 'manual_override' ? 'Sponsor manual override'
                    : R.arv_source_resolved === 'comp_derived' ? 'Comp-derived ($/SF × subject SF)'
                    : 'Income approach (NOI / Exit Cap)';
    const taxMode = (inputs.tax_basis_mode || 'stabilized_arv') === 'stabilized_arv'
      ? 'Stabilized ARV (institutional default)'
      : 'Purchase Price (legacy spreadsheet parity)';

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Methodology & Disclosures')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Underwriting Methodology</div>
        <div class="bp-method-summary pb-avoid" style="font-size:9pt;line-height:1.5;color:#333;margin-bottom:14pt">
          Standard institutional value-add multifamily underwriting conventions. Stabilized NOI computed from sponsor-input vacancy and operating expense ratios applied to unit-mix-derived GPR. Stabilized ARV resolved via ${_esc(arvSource.toLowerCase())}; property taxes computed against ${_esc(taxMode.toLowerCase())} using the tax district's effective rate. Initial debt sized at sponsor-input LTV/LTC; refi sized to sponsor-input LTV against stabilized ARV. 10-year cash flow projects rent growth and expense ratio held constant; Y10 disposition value at sponsor-input exit cap. IRR computed via Newton-Raphson on Y0 outflow + Y1-Y_hold inflows. Equity multiple per institutional convention (sum of positive distributions / equity in). Engine version ${_esc(engineV)} (${_esc(engineDate)}). Full methodology and assumption inventory available on request.
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Notices &amp; Disclaimers</div>
        <div class="bp-disclaimer-compact pb-avoid" style="font-size:8pt;line-height:1.4;color:#555">
          <p style="margin:0 0 6pt 0"><strong>No Offer.</strong> This document is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any securities. Any offer or solicitation will be made solely by means of a confidential Private Placement Memorandum and related subscription documents furnished to qualified prospective investors. In the event of any inconsistency between this document and the PPM, the PPM shall control.</p>
          <p style="margin:0 0 6pt 0"><strong>Exemption from Registration.</strong> Any securities described will be offered in reliance upon Rule 506(b) of Regulation D, limited to accredited investors (Rule 501(a)) with a pre-existing substantive relationship with the sponsor. No public advertising or general solicitation will be employed.</p>
          <p style="margin:0 0 6pt 0"><strong>Forward-Looking Statements.</strong> Projections of investment returns (IRR, equity multiple, capital recapture, DSCR, stabilized ARV, NOI, distributions, disposition proceeds) and sensitivity analyses are based on assumptions believed reasonable as of the date hereof. Actual results may differ materially due to changes in market conditions, capital availability, interest rates, construction costs, lease-up velocity, tax assessment outcomes, regulatory changes, and other factors outside the sponsor's control. No representation or warranty, express or implied, is made as to the accuracy or completeness of the forward-looking statements.</p>
          <p style="margin:0 0 6pt 0"><strong>Past Performance.</strong> Past performance is not a guarantee or reliable indicator of future results.</p>
          <p style="margin:0 0 6pt 0"><strong>Risk and Independent Diligence.</strong> Real estate investments involve substantial risk, including the possible loss of all invested capital. Prospective investors must conduct their own independent investigation and should consult their own legal, tax, accounting, and financial advisors. The sponsor and its affiliates make no representation or warranty as to the accuracy or completeness of this document and disclaim any liability based on reliance hereon.</p>
          <p style="margin:0 0 0 0"><strong>Confidentiality.</strong> This document is confidential and furnished solely to the named recipient for evaluation of a potential investment. The recipient agrees to maintain confidentiality and not to disclose or distribute without the sponsor's prior written consent.</p>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_brrrr_package(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const pages = [];

    // Equity-partner-optimized layout (Milestone 1 trim):
    //   - Top risks moved into Cover page (Investment Highlights area)
    //   - Standalone Risk Register page removed
    //   - Full Model Assumptions + Notices pages collapsed into one
    //     compact "Methodology & Disclosures" page at the end
    // Net: ~10 pages → 7 pages with all material info preserved.
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const hasSponsorPage = !!(co && (co.subtitle || (co.contact_info && (co.contact_info.email || co.contact_info.phone || co.contact_info.website || co.contact_info.address))));
    // Pages: Cover, S&U, Income/OPEX, Stab/Refi, 10-yr CF, Returns, Market, [Sponsor], Methodology+Disclosures
    const totalPages = 7 + (hasSponsorPage ? 1 : 0) + 1;

    pages.push(_page1(deal, R, inputs, market, h, 1, totalPages));
    pages.push(_page2(deal, R, inputs, market, h, 2, totalPages));
    pages.push(_page3(deal, R, inputs, market, h, 3, totalPages));
    pages.push(_page4(deal, R, inputs, market, h, 4, totalPages));
    pages.push(_page5(deal, R, inputs, market, h, 5, totalPages));
    pages.push(_page6(deal, R, inputs, market, h, 6, totalPages));
    // _page7 (Risk Register) intentionally omitted - moved to Cover
    pages.push(_page8(deal, R, inputs, market, h, 7, totalPages));
    let nextPage = 8;
    if (hasSponsorPage) {
      const p9 = _page9(deal, R, inputs, market, h, nextPage, totalPages);
      if (p9) { pages.push(p9); nextPage++; }
    }
    pages.push(_pageMethodologyAndDisclosures(deal, R, inputs, market, h, nextPage, totalPages));

    return pages.join('\n');
  }

  // Expose globally so print.js can dispatch into it.
  window.renderReport_brrrr_package = renderReport_brrrr_package;

})();
