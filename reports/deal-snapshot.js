// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.2 - Deal Snapshot Report
// ════════════════════════════════════════════════════════════════
// One-page internal summary. Headline KPIs, mode-aware deal economics,
// market context strip, top 5 unresolved risks, branded header/footer.
//
// CONTRACT
//   window.renderReport_deal_snapshot(deal, R, inputs, market, helpers)
//     -> HTML string (one .print-page element)
//
// READS
//   R                  engine output (read-only)
//   inputs             user-entered fields
//   market             marketAnalysis (may be empty {} if not fetched)
//   helpers            formatters and brand tokens from print.js
//   currentDeal        deal record (name/address/mode)
//   CP.active          active company profile (for footer)
//   assembleRisks()    M5 risk register (sorted)
// ════════════════════════════════════════════════════════════════

(function () {

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

  function _modeBadge(mode) {
    const lbl = mode === 'brrrr' ? 'BRRRR' : (mode === 'fix_and_flip' ? 'Fix & Flip' : 'Deal');
    return `<span class="ds-mode-pill">${lbl}</span>`;
  }

  // ── Headline KPIs (4 tiles, mode-aware) ──
  // Each tile carries a 'tone' (good/warn/bad/neutral) so the value renders
  // in a color that matches the threshold (M5-aligned). Tone is computed
  // against the same thresholds the Risk Register uses, so the snapshot
  // and the register agree on what counts as a flag. A small glyph (▼ ◆ ✓)
  // is added to bad/warn/good tiles so the signal survives grayscale
  // print and PDFs saved with "Background graphics" toggled off.
  function _kpiTiles(mode, R, h) {
    let tiles;
    if (mode === 'brrrr') {
      tiles = [
        { lbl: 'Refi DSCR',         val: h.fmtX(R.dscr, 2),                  sub: 'Stabilized NOI / Refi DS',
          tone: _toneAbove(R.dscr, 1.05, 1.20) },
        { lbl: 'Stabilized ARV',    val: h.fmtMoneyK(R.stabilized_arv),      sub: 'NOI / Exit Cap',
          tone: 'neutral' },
        { lbl: 'Capital Recapture', val: h.fmtPct(R.capital_recaptured_pct), sub: 'Refi proceeds / equity in',
          tone: _toneAbove(_pctNorm(R.capital_recaptured_pct), 0.60, 0.80) },
        { lbl: 'Equity Multiple',   val: h.fmtX(R.equity_multiple, 2),       sub: 'Institutional (Y1-Y10)',
          tone: _toneAbove(R.equity_multiple, 1.5, 2.0) }
      ];
    } else {
      tiles = [
        { lbl: 'ARV',           val: h.fmtMoneyK(R.arv),                sub: R.arv_source === 'override' ? 'Manual override' : 'Comp-derived',
          tone: 'neutral' },
        { lbl: 'Total Project', val: h.fmtMoneyK(R.total_project_cost), sub: 'Purchase + reno + carry',
          tone: 'neutral' },
        { lbl: 'Investor ROI',  val: h.fmtPct(R.investor_roi),          sub: 'Net proceeds / equity in',
          tone: _toneAbove(R.investor_roi, 0.10, 0.20) },
        { lbl: 'Hold',          val: (inputs && inputs.target_hold_months ? inputs.target_hold_months + ' mo' : '-'), sub: 'Target sale window',
          tone: 'neutral' }
      ];
    }
    return `
      <div class="print-kpis">
        ${tiles.map(t => `
          <div class="pk-tile pb-avoid pk-tone-${t.tone}">
            <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
            <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
            <div class="pk-tile-sub">${_esc(t.sub)}</div>
          </div>`).join('')}
      </div>`;
  }

  function _toneGlyph(tone) {
    if (tone === 'bad')  return '<span class="pk-glyph pk-glyph-bad">▼ </span>';
    if (tone === 'warn') return '<span class="pk-glyph pk-glyph-warn">◆ </span>';
    if (tone === 'good') return '<span class="pk-glyph pk-glyph-good">▲ </span>';
    return '';
  }

  // Tone helpers: classify a value against a (high-warn, good-floor) pair.
  // For "higher is better" metrics: value >= good is good, between is warn,
  // below high-warn is bad.
  function _toneAbove(v, highWarn, goodFloor) {
    if (v == null || !isFinite(v)) return 'neutral';
    if (v >= goodFloor) return 'good';
    if (v >= highWarn) return 'warn';
    return 'bad';
  }
  function _pctNorm(x) {
    // capital_recaptured_pct may be 0..1 or 0..100; normalize to 0..1.
    if (x == null || !isFinite(x)) return null;
    return x > 1.5 ? x / 100 : x;
  }

  // ── Deal economics (2-col data list, mode-aware) ──
  function _economics(mode, R, inputs, h) {
    let rows;
    if (mode === 'brrrr') {
      const refi_ltv = (R.refi_loan_amount > 0 && R.stabilized_arv > 0)
        ? R.refi_loan_amount / R.stabilized_arv : null;
      rows = [
        ['Purchase Price',       h.fmtMoney(inputs.purchase_price)],
        ['Renovation Budget',    h.fmtMoney(inputs.reno_budget)],
        ['Total Project Cost',   h.fmtMoney(R.total_project_cost)],
        ['Initial Loan',         h.fmtMoney(R.initial_loan_amt)],
        ['Refi Loan',            h.fmtMoney(R.refi_loan_amount)],
        ['Stabilized NOI',       h.fmtMoney(R.stabilized_noi)],
        ['Refi LTV',             h.fmtPct(refi_ltv)],
        ['Post-Refi In-Basis',   h.fmtPct(R.post_refi_in_basis_pct)],
        ['Annual Cash Flow',     h.fmtMoney(R.annual_cash_flow)],
        ['Breakeven Occupancy',  h.fmtPct(R.breakeven_occupancy)]
      ];
    } else {
      rows = [
        ['Purchase Price',       h.fmtMoney(inputs.purchase_price)],
        ['Renovation Budget',    h.fmtMoney(inputs.reno_budget)],
        ['Total Project Cost',   h.fmtMoney(R.total_project_cost)],
        ['Initial Loan',         h.fmtMoney(R.initial_loan_amt)],
        ['ARV',                  h.fmtMoney(R.arv)],
        ['Sale Cost',            h.fmtMoney(R.sale_cost)],
        ['Net Investor Proceeds',h.fmtMoney(R.net_investor_proceeds)],
        ['Investor Equity In',   h.fmtMoney(R.investor_equity)],
        ['Value Creation',       h.fmtPct(R.value_creation_pct)],
        ['Hold Period',          (inputs && inputs.target_hold_months ? inputs.target_hold_months + ' months' : '-')]
      ];
    }
    return `
      <div class="print-list pb-avoid">
        ${rows.map(([lbl, val]) => `
          <div class="pl-row">
            <span class="pl-lbl">${_esc(lbl)}</span>
            <span class="pl-val">${_esc(val)}</span>
          </div>`).join('')}
      </div>`;
  }

  // ── Market context strip ──
  function _marketStrip(market, h) {
    const d = market && market.derived;
    if (!d || d.market_strength_score == null) {
      return `
        <div class="ds-market-strip pb-avoid">
          <div class="ds-market-empty">Market analysis not run for this deal. Fetch census and FMR data on the Market panel for context.</div>
        </div>`;
    }
    const gradeClass = _gradeClass(d.market_strength_grade);
    return `
      <div class="ds-market-strip pb-avoid">
        <div class="ds-market-cell">
          <div class="ds-market-lbl">Market Grade</div>
          <div class="ds-market-val ${gradeClass}">${_esc(d.market_strength_grade || '-')}</div>
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
      </div>`;
  }

  function _gradeClass(grade) {
    if (!grade) return '';
    if (grade.startsWith('A')) return 'ds-grade-a';
    if (grade.startsWith('B')) return 'ds-grade-b';
    if (grade.startsWith('C')) return 'ds-grade-c';
    if (grade === 'D') return 'ds-grade-d';
    return 'ds-grade-f';
  }

  // ── Top risks (5 highest-severity unresolved) ──
  function _topRisks() {
    if (typeof assembleRisks !== 'function') {
      return '<div class="print-callout pb-avoid"><div class="pc-title">Risks</div>Risk register unavailable.</div>';
    }
    const all = assembleRisks();
    const unresolved = all.filter(r => !r.resolved);

    if (unresolved.length === 0) {
      return `
        <div class="ds-risks-clear pb-avoid">
          <span class="ds-risks-clear-icon">✓</span>
          <span class="ds-risks-clear-text">No unresolved risks flagged. Engine and market modules ran clean.</span>
        </div>`;
    }

    const top5 = unresolved.slice(0, 5);
    return `
      <div class="ds-risks-list pb-avoid">
        ${top5.map(r => `
          <div class="print-risk-row risk-${_esc(r.severity || 'medium')}">
            <div class="print-risk-row-meta">
              <span>${_esc((r.severity || 'medium').toUpperCase())}</span>
              <span> · </span>
              <span>${_esc(r.source || 'engine')}</span>
              <span> · </span>
              <span>${_esc(r.category || '-')}</span>
            </div>
            <div class="print-risk-row-title">${_esc(r.title || 'Untitled risk')}</div>
            <div class="ds-risk-detail">${_esc(_truncate(r.detail || '', 110))}</div>
          </div>`).join('')}
        ${unresolved.length > 5 ? `<div class="ds-risks-more">+ ${unresolved.length - 5} additional risk${unresolved.length - 5 === 1 ? '' : 's'} on the full register.</div>` : ''}
      </div>`;
  }

  function _truncate(s, n) {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...';
  }

  // ── Header + footer chrome ──
  // Header shows the ACTIVE COMPANY's brand (logo + name) so the report
  // presents as a deliverable from ASJP / KPI / whichever profile is
  // selected. "Foundry" attribution lives in the small footer only.
  function _header(h) {
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
          <div><strong>Deal Snapshot</strong></div>
          <div>${_esc(h.todayLong())}</div>
        </div>
      </div>`;
  }

  function _footer(deal) {
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const coName = co && co.name ? co.name : 'ASJP';
    return `
      <div class="print-footer pb-avoid">
        <div class="pf-conf">Confidential · Internal Use Only · ${_esc(coName)}</div>
        <div class="pf-page"></div>
      </div>`;
  }


  // ── Main entry ──
  function renderReport_deal_snapshot(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const mode = (deal && deal.deal_mode) || 'brrrr';
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);

    // If the deal name already includes the full address (a common pattern
    // for raw acquisitions), don't repeat it as a subtitle.
    const showAddrSub = addrLine && !_normalizeForCompare(dealName).includes(_normalizeForCompare(addrLine));

    return `
      <div class="print-page print-page-compact">

        ${_header(h)}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Internal Deal Snapshot</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">${showAddrSub ? _esc(addrLine) + ' ' : ''}${_modeBadge(mode)}</div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Headline Metrics</div>
        ${_kpiTiles(mode, R, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Deal Economics</div>
        ${_economics(mode, R, inputs, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Market Context</div>
        ${_marketStrip(market, h)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Top Risks</div>
        ${_topRisks()}

        ${_footer(deal)}

      </div>
    `;
  }

  function _normalizeForCompare(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Expose globally so print.js can dispatch into it.
  window.renderReport_deal_snapshot = renderReport_deal_snapshot;

})();
