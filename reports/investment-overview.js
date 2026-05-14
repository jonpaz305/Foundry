// ════════════════════════════════════════════════════════════════
// FOUNDRY M3 - Investment Overview Report
// ════════════════════════════════════════════════════════════════
// Middle-tier package sitting between Deal Snapshot (1pp) and the
// BRRRR Package (8-9pp). 4 pages, professional third-person voice,
// plain language, acronyms expanded on first use, glossary block
// on page 2. Designed for investors who are new to value-add
// multifamily but capable of evaluating a deal once vocabulary is
// established. Same underlying engine data as the BRRRR Package;
// no separate calculation paths.
//
// CONTRACT
//   window.renderReport_investment_overview(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES
//   1  Cover · Opportunity Summary (hero photo, plain-language pitch, key metrics with one-sentence context)
//   2  The Plan · Capital Timeline · Glossary
//   3  The Numbers · Annual Cash Flow · Sensitivity
//   4  Risks · Sponsor · Disclaimers
//
// READS
//   R                  engine output (read-only)
//   inputs             user-entered fields
//   market             marketAnalysis (may be empty {} if not fetched)
//   helpers            formatters and brand tokens from print.js
//   currentDeal        deal record (name/address/mode)
//   CP.active          active company profile (for header/footer)
//   DEAL_PHOTOS        property photos (M2)
//   assembleRisks()    M5 risk register (sorted)
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

  // Asset type label - plain English. Avoids the institutional shorthand
  // (commercial_multifamily, residential_multifamily) used elsewhere
  // in the engine.
  function _assetTypeLabelPlain(t, units) {
    const u = units || 0;
    if (t === 'commercial_multifamily') return u + '-unit apartment building';
    if (t === 'residential_multifamily') return u + '-unit multifamily property';
    if (t === 'single_family') return 'single-family home';
    if (t === 'multifamily_2_4') return u + '-unit small multifamily';
    return u > 1 ? (u + '-unit property') : 'investment property';
  }

  function _pctNorm(x) {
    if (x == null || !isFinite(x)) return null;
    return x > 1.5 ? x / 100 : x;
  }


  // ── HEADER + FOOTER (shared across pages) ─────────────────────
  // Same defensive logo resolution pattern as the BRRRR Package -
  // prefer CP.active, fall back to any profile with a logo, fall back
  // to first profile, fall back to text. Print tab gets CP.active set
  // by startPrintMode() in print.js.
  function _header(h, pageLabel) {
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
          <div><strong>Investment Overview</strong></div>
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


  // ── HERO PHOTO HELPER ─────────────────────────────────────────
  // Picks the best photo for the cover hero slot. Preference order:
  //   1. First exterior photo
  //   2. Photo at sort_order 0 (whatever it is)
  //   3. null (no photo block rendered)
  function _heroPhoto() {
    if (typeof DEAL_PHOTOS === 'undefined' || !Array.isArray(DEAL_PHOTOS) || DEAL_PHOTOS.length === 0) return null;
    const ext = DEAL_PHOTOS.find(p => p && p.photo_type === 'exterior');
    if (ext) return ext;
    return DEAL_PHOTOS[0] || null;
  }

  // Picks 2-3 supporting photos for the inner page. Skips the hero
  // (so we don't repeat it) and prefers a mix of interior types.
  function _supportingPhotos(hero) {
    if (typeof DEAL_PHOTOS === 'undefined' || !Array.isArray(DEAL_PHOTOS) || DEAL_PHOTOS.length === 0) return [];
    const heroId = hero ? hero.id : null;
    const remaining = DEAL_PHOTOS.filter(p => p && p.id !== heroId);
    return remaining.slice(0, 3);
  }


  // ── PAGE 1: COVER · OPPORTUNITY SUMMARY ───────────────────────
  function _page1(deal, R, inputs, market, h, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Investment Opportunity';
    const addrLine = _addressLine(deal, inputs);
    const units = R.total_unit_count || 0;
    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const tpc = R.total_project_cost || 0;
    const arv = R.stabilized_arv || 0;
    const noi = R.stabilized_noi || 0;
    const refi = R.refi_loan_amount || 0;
    const initEq = R.initial_investor_equity || 0;
    const recap = _pctNorm(R.capital_recaptured_pct) || 0;
    const recapDollars = initEq * recap;
    const irr = R.investor_irr;
    const em = R.equity_multiple;
    const refiMonth = inputs.target_refi_months || 7;
    const holdYears = inputs.target_hold_years || 10;
    const exitCap = inputs.exit_cap || 0;
    const assetLabel = _assetTypeLabelPlain(inputs.asset_type, units);
    const cityState = [(inputs.city || ''), (inputs.state || '')].filter(Boolean).join(', ');

    const hero = _heroPhoto();

    // Plain-language opening paragraph. Third person, professional voice.
    // Names every number rather than using shorthand.
    const opening = `${_esc(dealName.replace(/[,.]?\s*(Cleveland|Ohio|OH).*$/i, '').trim() || 'This property')} is ${_esc(/^[aeiou]/i.test(assetLabel) ? 'an' : 'a')} ${_esc(assetLabel)} in ${_esc(cityState || 'a target submarket')}, acquired for ${h.fmtMoney(purchase)}. The plan calls for ${h.fmtMoney(capex)} in renovations over a ${refiMonth}-month execution window, bringing the property to institutional quality and full market rents. Total project cost is ${h.fmtMoney(tpc)}, funded with ${h.fmtMoney(R.initial_loan_amount || 0)} of bridge debt and ${h.fmtMoney(initEq)} of investor equity.`;

    const stabilized = `Once renovations are complete and the property is stabilized at market rents, projected annual net operating income (NOI) is ${h.fmtMoney(noi)}. Applied against a market exit cap rate of ${h.fmtPct(exitCap, 2)}, this supports a stabilized value of approximately ${h.fmtMoneyK(arv)}. A long-term refinance at ${h.fmtPct(inputs.target_refi_ltv || 0.7)} loan-to-value retires the bridge loan in full and returns approximately ${h.fmtPct(recap, 0)} of investor equity, while ownership stake is retained for the duration of the ${holdYears}-year hold.`;

    // Metric callouts - one tight sentence each, no jargon untranslated
    const metrics = [
      {
        label: 'Capital returned at refinance',
        value: h.fmtPct(recap, 0),
        context: `Approximately ${h.fmtMoneyK(recapDollars)} of the initial ${h.fmtMoneyK(initEq)} investment is returned at refinance around month ${refiMonth}. The remaining capital stays deployed in the property for the duration of the hold and is recovered, with appreciation, at sale.`
      },
      {
        label: '10-year equity multiple',
        value: (em != null && isFinite(em)) ? em.toFixed(2) + 'x' : '-',
        context: `Over the ${holdYears}-year hold, total investor distributions are projected to equal approximately ${(em != null && isFinite(em)) ? em.toFixed(2) : '-'}x the initial investment. For every dollar invested, the projection returns ${(em != null && isFinite(em)) ? '$' + em.toFixed(2) : '-'} across refinance proceeds, annual cash flow, and sale proceeds.`
      },
      {
        label: 'Annualized return (IRR)',
        value: h.fmtPct(irr, 1),
        context: `The internal rate of return (IRR) is the annualized return on the investment, accounting for the timing of all cash flows. An IRR of ${h.fmtPct(irr, 1)} means the projected returns are equivalent to earning ${h.fmtPct(irr, 1)} per year, compounded annually, over the hold period.`
      }
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Cover · Opportunity Summary')}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Investment Overview</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          ${addrLine && !_esc(dealName).includes(_esc(addrLine.split(' · ')[0])) ? `<div class="print-title-sub">${_esc(addrLine)}</div>` : ''}
        </div>

        ${hero ? `
          <div class="iov-hero pb-avoid" style="margin-bottom:12pt;text-align:center">
            <img src="${hero.image_base64}" alt="Property exterior" style="max-width:100%;max-height:200pt;width:auto;height:auto;border-radius:4pt;border:1px solid #ddd"/>
          </div>
        ` : ''}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>The Opportunity</div>
        <div style="font-size:10pt;line-height:1.55;color:#222;margin-bottom:10pt">
          <p style="margin:0 0 8pt 0">${opening}</p>
          <p style="margin:0 0 8pt 0">${stabilized}</p>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Key Metrics</div>
        <div class="iov-metrics pb-avoid" style="display:flex;flex-direction:column;gap:6pt;margin-bottom:8pt">
          ${metrics.map(m => `
            <div style="border-left:3pt solid #C9A84C;padding:6pt 10pt;background:#fafaf6">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3pt">
                <div style="font-size:9pt;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#333">${_esc(m.label)}</div>
                <div style="font-size:14pt;font-weight:700;color:#0a0a0b">${_esc(m.value)}</div>
              </div>
              <div style="font-size:9pt;line-height:1.45;color:#555">${_esc(m.context)}</div>
            </div>
          `).join('')}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 2: THE PLAN · CAPITAL TIMELINE · GLOSSARY ────────────
  function _page2(deal, R, inputs, market, h, pageNum, totalPages) {
    const units = R.total_unit_count || 0;
    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const refi = R.refi_loan_amount || 0;
    const noi = R.stabilized_noi || 0;
    const initEq = R.initial_investor_equity || 0;
    const recap = _pctNorm(R.capital_recaptured_pct) || 0;
    const recapDollars = initEq * recap;
    const refiMonth = inputs.target_refi_months || 7;
    const holdYears = inputs.target_hold_years || 10;
    const cityState = [(inputs.city || ''), (inputs.state || '')].filter(Boolean).join(', ');
    const arv = R.stabilized_arv || 0;
    const dispValue = (R.net_sale_proceeds != null) ? R.net_sale_proceeds : 0;

    // 5-step business plan walkthrough. Plain-language, third-person,
    // specific to this deal's numbers.
    const steps = [
      {
        n: 1,
        title: 'Acquire',
        body: `Purchase the ${units}-unit property at ${h.fmtMoney(purchase)} using a bridge loan combined with investor equity. Bridge loans are short-term loans used during the renovation phase, paid off when the property is refinanced into permanent debt.`
      },
      {
        n: 2,
        title: 'Renovate',
        body: `Execute the ${h.fmtMoney(capex)} renovation budget over approximately ${refiMonth} months. Renovations bring the property up to institutional quality, allowing the rent roll to reach full market rates.`
      },
      {
        n: 3,
        title: 'Stabilize',
        body: `Lease the renovated units at market rents. Once occupancy and rental income stabilize, the property generates approximately ${h.fmtMoney(noi)} in annual NOI.`
      },
      {
        n: 4,
        title: 'Refinance',
        body: `Refinance the property with a long-term agency loan of approximately ${h.fmtMoney(refi)}, retiring the bridge loan and returning approximately ${h.fmtMoneyK(recapDollars)} (${h.fmtPct(recap, 0)}) of the initial investment to investors. Ownership stake is retained.`
      },
      {
        n: 5,
        title: 'Hold and dispose',
        body: `Operate the stabilized property for the remainder of the ${holdYears}-year hold, generating annual cash distributions to investors. At the end of the hold, the property is sold and the remaining equity, plus appreciation, is returned to investors.`
      }
    ];

    // Capital timeline - what happens to investor capital and when
    const timeline = [
      { phase: 'Month 0 (closing)', event: 'Investor equity contributed', amount: '(' + h.fmtMoneyK(initEq) + ')', tone: 'out' },
      { phase: `Month ${refiMonth} (refinance)`, event: 'Capital returned at refinance', amount: '+' + h.fmtMoneyK(recapDollars), tone: 'in' },
      { phase: `Years 2-${holdYears - 1} (operating)`, event: 'Annual cash distributions', amount: '+ varies', tone: 'in' },
      { phase: `Year ${holdYears} (sale)`, event: 'Net sale proceeds returned', amount: '+' + h.fmtMoneyK(dispValue), tone: 'in' }
    ];

    // Glossary - 10 terms, one tight sentence each. Alphabetical.
    const glossary = [
      { term: 'Bridge loan', def: 'Short-term financing used during the renovation phase, paid off when the property is refinanced into permanent debt.' },
      { term: 'Cap rate', def: 'A property\'s annual net operating income divided by its value, used as a benchmark for valuation. A higher cap rate means a higher yield relative to price.' },
      { term: 'Capital recapture', def: 'The portion of an investor\'s original investment returned at refinance, before the long-term hold begins.' },
      { term: 'DSCR (debt service coverage ratio)', def: 'A property\'s annual income divided by its annual loan payment. A DSCR above 1.0 means the property generates more income than is needed to pay the loan.' },
      { term: 'Equity multiple', def: 'Total dollars an investor receives over the life of the deal, divided by the dollars they initially invested. A 3.0x equity multiple means receiving $3 for every $1 invested.' },
      { term: 'Exit cap rate', def: 'The cap rate used to estimate what the property is worth when sold or refinanced.' },
      { term: 'IRR (internal rate of return)', def: 'The annualized rate of return on an investment, accounting for the timing of all cash flows in and out.' },
      { term: 'NOI (net operating income)', def: 'A property\'s annual income after operating expenses, but before debt service. The core measure of a property\'s profitability.' },
      { term: 'TPC (total project cost)', def: 'Purchase price plus renovation budget, plus closing costs and carrying costs through stabilization.' },
      { term: 'Value-add', def: 'A real estate strategy of acquiring an underperforming property, improving it, and increasing its rents and value before refinancing or selling.' }
    ];

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'The Plan · Glossary')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>The Plan</div>
        <div class="iov-steps pb-avoid" style="display:flex;flex-direction:column;gap:5pt;margin-bottom:10pt">
          ${steps.map(s => `
            <div style="display:grid;grid-template-columns:24pt 1fr;gap:8pt;align-items:start">
              <div style="background:#C9A84C;color:#fff;border-radius:50%;width:20pt;height:20pt;display:flex;align-items:center;justify-content:center;font-size:10pt;font-weight:700;margin-top:1pt">${s.n}</div>
              <div>
                <div style="font-size:10pt;font-weight:700;color:#0a0a0b;margin-bottom:1pt">${_esc(s.title)}</div>
                <div style="font-size:9pt;line-height:1.5;color:#444">${_esc(s.body)}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Timeline</div>
        <table class="print-table pb-avoid" style="margin-bottom:10pt">
          <thead>
            <tr><th>When</th><th>Event</th><th class="num">Investor cash flow</th></tr>
          </thead>
          <tbody>
            ${timeline.map(t => `
              <tr>
                <td>${_esc(t.phase)}</td>
                <td>${_esc(t.event)}</td>
                <td class="num" style="color:${t.tone === 'in' ? '#1f7a3c' : '#a00'};font-weight:600">${_esc(t.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Glossary of Terms</div>
        <div class="iov-glossary pb-avoid" style="display:grid;grid-template-columns:1fr 1fr;gap:6pt 14pt;font-size:8.5pt;line-height:1.4">
          ${glossary.map(g => `
            <div>
              <strong style="color:#0a0a0b">${_esc(g.term)}.</strong>
              <span style="color:#555"> ${_esc(g.def)}</span>
            </div>
          `).join('')}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 3: THE NUMBERS · CASH FLOW · SENSITIVITY ─────────────
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
    const initEq = R.initial_investor_equity || 0;
    const dist = Array.isArray(R.distribution) ? R.distribution : [];
    const holdYears = inputs.target_hold_years || 10;
    const em = R.equity_multiple;
    const irr = R.investor_irr;
    const totalDistributed = dist.reduce((s, d, i) => i === 0 ? 0 : s + (d || 0), 0);

    // Cash flow table - same data as the BRRRR Package distributions
    // table, but trimmed to just the year/distribution columns and
    // notes column with plainer notes (no engine-disposition-fix talk)
    const cfRows = [];
    for (let y = 0; y <= Math.min(holdYears, dist.length - 1); y++) {
      const v = dist[y] || 0;
      let note = '';
      if (y === 0) note = 'Initial investment';
      else if (y === 1) note = 'Refinance proceeds plus first-year operating cash flow';
      else if (y === holdYears) note = 'Final-year operating cash flow plus net sale proceeds';
      else note = 'Operating cash flow distribution';
      cfRows.push({ year: y, value: v, note: note });
    }

    // Supporting photos - 3 across in a tight row
    const hero = _heroPhoto();
    const supporting = _supportingPhotos(hero);

    // Pull base sensitivity values for a tighter 3x3 "what if" view.
    // Same closed-form approximation logic as BRRRR Package but trimmed
    // to just 3 scenarios users can intuit (base, downside, upside).
    const baseEC = inputs.exit_cap || 0.07;
    const baseRG = inputs.rent_growth_pct || 0.05;
    const baseSCP = inputs.sale_cost_pct || 0.07;
    const remLoan = R.remaining_loan_balance || 0;
    const baseNOI = R.stabilized_noi || 0;
    const baseVac = inputs.vacancy_pct || 0;
    const baseGpr = R.gpr_annual || 0;
    const baseExpRatio = (R.egi > 0) ? (R.total_operating_expenses / R.egi) : 0;
    const sumOpDist = (function () {
      let s = 0;
      for (let i = 2; i <= Math.min(9, dist.length - 1); i++) s += dist[i] || 0;
      return s;
    })();
    const y1 = dist[1] || 0;

    function _scenarioEM(ec, rg) {
      const gpr10 = baseGpr * Math.pow(1 + rg, holdYears - 1);
      const egi10 = gpr10 * (1 - baseVac);
      const opex10 = egi10 * baseExpRatio;
      const noi10 = egi10 - opex10;
      const dispVal = ec > 0 ? noi10 / ec : 0;
      const netSale = dispVal * (1 - baseSCP) - remLoan;
      const y10Op = (dist[holdYears] || 0) - ((dist[holdYears] - (R.net_sale_proceeds || 0)) > 0 ? 0 : 0); // approximation: use stabilized last-year op CF
      const y10Approx = noi10 * 0.4; // rough operating CF estimate at Y10 (NOI minus refi DS rough)
      const sumPositive = y1 + sumOpDist + Math.max(0, netSale) + Math.max(0, y10Approx);
      return initEq > 0 ? sumPositive / initEq : 0;
    }

    const baseEM = (em != null && isFinite(em)) ? em : _scenarioEM(baseEC, baseRG);
    const downsideEM = _scenarioEM(baseEC + 0.005, Math.max(0, baseRG - 0.01));
    const upsideEM = _scenarioEM(Math.max(0.04, baseEC - 0.005), baseRG + 0.01);

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'The Numbers')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Annual Investor Cash Flow</div>
        <table class="print-table pb-avoid" style="margin-bottom:10pt">
          <thead>
            <tr><th>Year</th><th class="num">Distribution</th><th>Notes</th></tr>
          </thead>
          <tbody>
            ${cfRows.map(r => `
              <tr>
                <td>Y${r.year}</td>
                <td class="num" style="color:${r.value < 0 ? '#a00' : (r.value > 0 ? '#1f7a3c' : '#555')};font-weight:${r.value !== 0 ? '600' : '400'}">${r.value < 0 ? '(' + h.fmtMoney(Math.abs(r.value)) + ')' : h.fmtMoney(r.value)}</td>
                <td style="font-size:9pt;color:#555">${_esc(r.note)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td>Total return</td>
              <td class="num">${h.fmtMoney(totalDistributed)}</td>
              <td style="font-size:9pt;color:#555">Sum of all distributions Y1 through Y${holdYears}</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Return Summary</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-bottom:10pt">
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:8pt;text-align:center">
            <div style="font-size:8pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:3pt">Annualized return (IRR)</div>
            <div style="font-size:16pt;font-weight:700;color:#0a0a0b">${h.fmtPct(irr, 1)}</div>
            <div style="font-size:8pt;color:#666;margin-top:2pt">Return per year, compounded</div>
          </div>
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:8pt;text-align:center">
            <div style="font-size:8pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:3pt">Equity multiple</div>
            <div style="font-size:16pt;font-weight:700;color:#0a0a0b">${(em != null && isFinite(em)) ? em.toFixed(2) + 'x' : '-'}</div>
            <div style="font-size:8pt;color:#666;margin-top:2pt">Total returned per dollar invested</div>
          </div>
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:8pt;text-align:center">
            <div style="font-size:8pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:3pt">Total distributions</div>
            <div style="font-size:16pt;font-weight:700;color:#0a0a0b">${h.fmtMoneyK(totalDistributed)}</div>
            <div style="font-size:8pt;color:#666;margin-top:2pt">On ${h.fmtMoneyK(initEq)} invested</div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>What If the Market Moves</div>
        <table class="print-table pb-avoid" style="margin-bottom:10pt">
          <thead>
            <tr><th>Scenario</th><th>Description</th><th class="num">Equity Multiple</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Downside</strong></td>
              <td style="font-size:9pt;color:#555">Rent growth comes in 1 percentage point lower than projected, and the property sells at a cap rate 50 basis points higher (lower price).</td>
              <td class="num">${downsideEM.toFixed(2)}x</td>
            </tr>
            <tr class="totals">
              <td><strong>Base case</strong></td>
              <td style="font-size:9pt;color:#555">Underwriting assumptions are met. ${h.fmtPct(baseRG)} annual rent growth, ${h.fmtPct(baseEC, 2)} exit cap rate.</td>
              <td class="num">${baseEM.toFixed(2)}x</td>
            </tr>
            <tr>
              <td><strong>Upside</strong></td>
              <td style="font-size:9pt;color:#555">Rent growth comes in 1 percentage point higher than projected, and the property sells at a cap rate 50 basis points lower (higher price).</td>
              <td class="num">${upsideEM.toFixed(2)}x</td>
            </tr>
          </tbody>
          <caption style="font-size:8pt;color:#777;margin-top:4pt;text-align:left">Sensitivity uses a simplified projection based on the underwriting assumptions, illustrating how rent growth and cap rate movements affect total returns. A full 25-cell sensitivity grid is available in the BRRRR Package on request.</caption>
        </table>

        ${supporting.length > 0 ? `
          <div class="iov-supporting pb-avoid" style="display:grid;grid-template-columns:repeat(${supporting.length},1fr);gap:6pt;margin-top:6pt">
            ${supporting.map(p => {
              const label = p.caption && p.caption.trim() ? p.caption : _photoTypeLabel(p.photo_type);
              return `
                <div style="border:1px solid #eee;border-radius:3pt;overflow:hidden">
                  <img src="${p.image_base64}" alt="${_esc(label)}" style="width:100%;height:90pt;object-fit:cover;display:block"/>
                  <div style="font-size:7.5pt;color:#666;padding:2pt 4pt;background:#fafafa">${_esc(label)}</div>
                </div>`;
            }).join('')}
          </div>
        ` : ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }

  function _photoTypeLabel(t) {
    const map = {
      exterior: 'Exterior', interior: 'Interior', kitchen: 'Kitchen',
      bathroom: 'Bathroom', living_room: 'Living Room',
      bedroom: 'Bedroom', common_area: 'Common Area', other: 'Other'
    };
    return map[t] || 'Photo';
  }


  // ── PAGE 4: RISKS · SPONSOR · DISCLAIMERS ─────────────────────
  function _page4(deal, R, inputs, market, h, pageNum, totalPages) {
    // Top 3 risks with plain-language translation + cushion
    let risks = [];
    if (typeof assembleRisks === 'function') {
      risks = assembleRisks().filter(r => !r.resolved);
    }
    const sevOrder = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => (sevOrder[a.severity || 'medium'] || 1) - (sevOrder[b.severity || 'medium'] || 1));
    const topRisks = risks.slice(0, 3);

    // Sponsor block
    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const contact = (co && co.contact_info) ? co.contact_info : {};
    const sponsorName = (co && co.name) || 'ASJP';
    const sponsorSub = co && co.subtitle ? co.subtitle : '';

    return `
      <div class="print-page print-page-compact">
        ${_header(h, 'Risks · Sponsor · Disclaimers')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Key Risks</div>
        ${topRisks.length === 0 ? `
          <div style="font-size:9pt;color:#555;line-height:1.5;margin-bottom:10pt;padding:8pt;border-left:3pt solid #1f7a3c;background:#f5faf6">
            No risks have been flagged by the underwriting engine or market analysis modules against the assumptions in this report. The standard disclaimers below still apply, and prospective investors should conduct their own independent diligence.
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:6pt;margin-bottom:10pt">
            ${topRisks.map(r => {
              const sev = (r.severity || 'medium').toLowerCase();
              const sevColor = sev === 'high' ? '#c0392b' : (sev === 'medium' ? '#b8860b' : '#666');
              const sevBg = sev === 'high' ? '#fdf3f1' : (sev === 'medium' ? '#fdf9ee' : '#f7f7f7');
              return `
                <div style="border-left:3pt solid ${sevColor};padding:6pt 10pt;background:${sevBg}">
                  <div style="font-size:9pt;font-weight:700;color:${sevColor};letter-spacing:0.04em;text-transform:uppercase;margin-bottom:2pt">${_esc(sev)} severity</div>
                  <div style="font-size:10pt;font-weight:600;color:#0a0a0b;margin-bottom:3pt">${_esc(r.title || 'Risk')}</div>
                  <div style="font-size:9pt;color:#444;line-height:1.5">${_esc(_truncate(r.detail || '', 220))}</div>
                  ${r.mitigation ? `<div style="font-size:8.5pt;color:#555;line-height:1.45;margin-top:4pt;padding-top:4pt;border-top:1px dashed #ddd"><strong>Mitigation.</strong> ${_esc(r.mitigation)}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
        `}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Sponsor</div>
        <div class="iov-sponsor pb-avoid" style="margin-bottom:14pt;padding:8pt 0;border-bottom:1px solid #eee">
          <div style="font-size:13pt;font-weight:700;color:#0a0a0b;margin-bottom:2pt">${_esc(sponsorName)}</div>
          ${sponsorSub ? `<div style="font-size:9pt;color:#666;margin-bottom:6pt">${_esc(sponsorSub)}</div>` : ''}
          <div style="font-size:9pt;color:#333;line-height:1.6">
            ${contact.email ? `<span style="margin-right:14pt"><strong style="color:#777;font-size:8pt;letter-spacing:0.04em;text-transform:uppercase">Email</strong> ${_esc(contact.email)}</span>` : ''}
            ${contact.phone ? `<span style="margin-right:14pt"><strong style="color:#777;font-size:8pt;letter-spacing:0.04em;text-transform:uppercase">Phone</strong> ${_esc(contact.phone)}</span>` : ''}
            ${contact.website ? `<span style="margin-right:14pt"><strong style="color:#777;font-size:8pt;letter-spacing:0.04em;text-transform:uppercase">Web</strong> ${_esc(contact.website)}</span>` : ''}
            ${contact.address ? `<span style="margin-right:14pt"><strong style="color:#777;font-size:8pt;letter-spacing:0.04em;text-transform:uppercase">Office</strong> ${_esc(contact.address)}</span>` : ''}
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Disclaimers</div>
        <div style="font-size:8pt;line-height:1.45;color:#555">
          <p style="margin:0 0 6pt 0"><strong>No offer.</strong> This document is informational only and is not an offer to sell or a solicitation of an offer to buy any securities. Any offer or solicitation will be made solely through a confidential Private Placement Memorandum and related subscription documents furnished to qualified prospective investors.</p>
          <p style="margin:0 0 6pt 0"><strong>Projections, not guarantees.</strong> Projections of returns (IRR, equity multiple, capital recapture, cash distributions, sale proceeds) are based on assumptions believed reasonable as of the date of this document. Actual results may differ materially due to changes in market conditions, interest rates, construction costs, lease-up timing, and other factors outside the sponsor's control.</p>
          <p style="margin:0 0 6pt 0"><strong>Past performance.</strong> Past performance is not a guarantee of future results.</p>
          <p style="margin:0 0 6pt 0"><strong>Risk and independent diligence.</strong> Real estate investments involve substantial risk, including the possible loss of all invested capital. Prospective investors must conduct their own independent investigation and consult their own legal, tax, and financial advisors before making any investment decision.</p>
          <p style="margin:0 0 0 0"><strong>Confidentiality.</strong> This document is confidential and furnished solely to the named recipient for evaluation of a potential investment. The recipient agrees to maintain confidentiality and not to disclose or distribute without the sponsor's prior written consent.</p>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_investment_overview(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const totalPages = 4;
    const pages = [
      _page1(deal, R, inputs, market, h, 1, totalPages),
      _page2(deal, R, inputs, market, h, 2, totalPages),
      _page3(deal, R, inputs, market, h, 3, totalPages),
      _page4(deal, R, inputs, market, h, 4, totalPages)
    ];
    return pages.join('\n');
  }

  // Expose globally so print.js can dispatch into it.
  window.renderReport_investment_overview = renderReport_investment_overview;

})();
