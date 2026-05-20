// ════════════════════════════════════════════════════════════════
// FOUNDRY M3 - Investment Overview Report (v3: 6-page reordered)
// ════════════════════════════════════════════════════════════════
// Middle-tier equity-LP package between Deal Snapshot (1pp) and the
// BRRRR Package (8-10pp). 6 pages of underwriting depth in plain
// language with a 10-term glossary. Same engine outputs as BRRRR
// Package; no separate calculation paths.
//
// Targeted audience: equity LPs who are new to value-add multifamily.
// Goal: show all the underwriting (unit mix, income, OPEX, S&U,
// ownership, valuation, refi, cash flow, risks) without institutional
// shorthand. Pedagogical ordering: hook -> orient -> substance -> close.
//
// PAGE ORDER (v3 reordered for first-time investor flow)
//   1  Cover · Opportunity · Key Metrics              [HOOK]
//   2  The Plan · Capital Timeline · Glossary         [ORIENT]
//   3  Property · Unit Mix · Income · OPEX · NOI      [SUBSTANCE - income side]
//   4  Sources & Uses · Capital Stack · Ownership     [SUBSTANCE - capital side]
//   5  Valuation · Refinance · 10-Year Cash Flow      [SUBSTANCE - return profile]
//   6  Risks · Sensitivity · FAQ · Sponsor · Disclaim [CLOSE]
//
// CONTRACT
//   window.renderReport_investment_overview(deal, R, inputs, market, helpers)
//     -> HTML string (6 .print-page elements)
//
// READS
//   R                  engine output (read-only)
//   inputs             user-entered fields
//   market             marketAnalysis (may be empty {} if not fetched)
//   helpers            formatters and brand tokens from print.js
//   currentDeal        deal record (name/address/mode + map)
//   unitMix            unit mix array (global)
//   CP.active          active company profile (for header/footer)
//   DEAL_PHOTOS        property photos (M2; used only for cover hero)
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

  function _bedTypeLabel(bt) {
    if (!bt) return '-';
    const norm = String(bt).toLowerCase();
    const map = {
      'studio': 'Studio', 'efficiency': 'Studio',
      '1br': '1 bedroom', '1bd': '1 bedroom', '1bed': '1 bedroom', '1_br': '1 bedroom',
      '2br': '2 bedroom', '2bd': '2 bedroom', '2bed': '2 bedroom', '2_br': '2 bedroom',
      '3br': '3 bedroom', '3bd': '3 bedroom', '3bed': '3 bedroom', '3_br': '3 bedroom',
      '4br': '4 bedroom', '4bd': '4 bedroom', '4bed': '4 bedroom', '4_br': '4 bedroom'
    };
    return map[norm] || bt;
  }


  // ── HEADER + FOOTER ───────────────────────────────────────────
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


  // ── COVER IMAGES (adaptive: photo + map / one / none) ─────────
  function _coverImages(deal) {
    let hero = null;
    if (typeof DEAL_PHOTOS !== 'undefined' && Array.isArray(DEAL_PHOTOS) && DEAL_PHOTOS.length) {
      hero = DEAL_PHOTOS.find(p => p && p.photo_type === 'exterior') || DEAL_PHOTOS[0];
    }
    const mapData = (deal && deal.neighborhood_map_base64)
      || (typeof currentDeal === 'object' && currentDeal && currentDeal.neighborhood_map_base64)
      || null;

    if (!hero && !mapData) return '';

    if (hero && mapData) {
      return `
        <div class="iov-cover-images pb-avoid" style="display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin:6pt 0 8pt 0">
          <div style="text-align:center">
            <img src="${hero.image_base64}" alt="Property" style="width:100%;max-height:130pt;height:auto;object-fit:cover;border-radius:4pt;border:1px solid #ddd"/>
            <div style="font-size:7.5pt;color:#888;margin-top:2pt">Property</div>
          </div>
          <div style="text-align:center">
            <img src="${mapData}" alt="Neighborhood" style="width:100%;max-height:130pt;height:auto;object-fit:cover;border-radius:4pt;border:1px solid #ddd"/>
            <div style="font-size:7.5pt;color:#888;margin-top:2pt">Neighborhood</div>
          </div>
        </div>`;
    }

    const onlyOne = hero || { image_base64: mapData };
    const label = hero ? 'Property' : 'Neighborhood';
    return `
      <div class="iov-cover-images pb-avoid" style="margin:6pt 0 8pt 0;text-align:center">
        <img src="${onlyOne.image_base64}" alt="${label}" style="max-width:60%;max-height:130pt;width:auto;height:auto;object-fit:cover;border-radius:4pt;border:1px solid #ddd"/>
        <div style="font-size:7.5pt;color:#888;margin-top:2pt">${label}</div>
      </div>`;
  }


  // ════════════════════════════════════════════════════════════════
  // PAGE 1: COVER · OPPORTUNITY · KEY METRICS (HOOK)
  // ════════════════════════════════════════════════════════════════
  function _page1(deal, R, inputs, market, h, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Investment Opportunity';
    const addrLine = _addressLine(deal, inputs);
    const units = R.total_unit_count || 0;
    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const tpc = R.total_project_cost || 0;
    const arv = R.stabilized_arv || 0;
    const noi = R.stabilized_noi || 0;
    const initLoan = R.initial_loan_amt || 0;
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
    const msa = market && market.cbsa_name ? market.cbsa_name : '';
    const medianRent = market && market.census && market.census.median_rent ? market.census.median_rent : null;

    const marketContext = msa
      ? ` The property is located in the ${_esc(msa)} metropolitan area${medianRent ? ', a market with a median rent of approximately $' + Number(medianRent).toLocaleString() : ''}.`
      : '';

    const opening = `${_esc(dealName.replace(/[,.]?\s*(Cleveland|Ohio|OH).*$/i, '').trim() || 'This property')} is ${_esc(/^[aeiou]/i.test(assetLabel) ? 'an' : 'a')} ${_esc(assetLabel)} in ${_esc(cityState || 'a target submarket')}, acquired for ${h.fmtMoney(purchase)}. The plan calls for ${h.fmtMoney(capex)} in renovations over a ${refiMonth}-month execution window, bringing the property to institutional quality and full market rents. Total project cost is ${h.fmtMoney(tpc)}, funded with ${h.fmtMoney(initLoan)} of bridge debt and ${h.fmtMoney(initEq)} of investor equity.${marketContext}`;

    const stabilized = `Once renovations are complete and the property is stabilized at market rents, projected annual net operating income (NOI) is ${h.fmtMoney(noi)}. Applied against a market exit cap rate of ${h.fmtPct(exitCap, 2)}, this supports a stabilized value of approximately ${h.fmtMoneyK(arv)}. A long-term refinance at ${h.fmtPct(inputs.target_refi_ltv || 0.7)} loan-to-value retires the bridge loan in full and returns approximately ${h.fmtPct(recap, 0)} of investor equity, while ownership stake is retained for the duration of the ${holdYears}-year hold.`;

    const metrics = [
      {
        label: 'Capital returned at refinance',
        value: h.fmtPct(recap, 0),
        context: `Approximately ${h.fmtMoneyK(recapDollars)} of the initial ${h.fmtMoneyK(initEq)} investment is returned at refinance around month ${refiMonth}. The remaining capital stays deployed for the duration of the hold and is recovered, with appreciation, at sale.`
      },
      {
        label: '10-year equity multiple',
        value: (em != null && isFinite(em)) ? em.toFixed(2) + 'x' : '-',
        context: `Over the ${holdYears}-year hold, total distributions are projected to equal ${(em != null && isFinite(em)) ? em.toFixed(2) : '-'}x the initial investment, including refinance proceeds, annual cash flow, and sale proceeds.`
      },
      {
        label: 'Annualized return (IRR)',
        value: h.fmtPct(irr, 1),
        context: `The internal rate of return (IRR) is the annualized return on the investment, accounting for the timing of all cash flows. An IRR of ${h.fmtPct(irr, 1)} means the projected returns are equivalent to earning ${h.fmtPct(irr, 1)} per year, compounded annually, over the hold period.`
      }
    ];

    return `
      <style>
        .iov-tight .print-table td, .iov-tight .print-table th { padding-top: 2.5pt; padding-bottom: 2.5pt; }
        .iov-tight .print-section { margin-top: 4pt; margin-bottom: 3pt; }
        .iov-tight table { margin-bottom: 4pt !important; }
      </style>
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'Cover · Opportunity')}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow">Investment Overview</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          ${addrLine && !_esc(dealName).includes(_esc(addrLine.split(' · ')[0])) ? `<div class="print-title-sub">${_esc(addrLine)}</div>` : ''}
        </div>

        ${_coverImages(deal)}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>The Opportunity</div>
        <div style="font-size:9pt;line-height:1.5;color:#222;margin-bottom:6pt">
          <p style="margin:0 0 5pt 0">${opening}</p>
          <p style="margin:0 0 5pt 0">${stabilized}</p>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Key Metrics</div>
        <div class="iov-metrics pb-avoid" style="display:flex;flex-direction:column;gap:3pt">
          ${metrics.map(m => `
            <div style="border-left:3pt solid #C9A84C;padding:4pt 9pt;background:#fafaf6">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1pt">
                <div style="font-size:8pt;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#333">${_esc(m.label)}</div>
                <div style="font-size:12pt;font-weight:700;color:#0a0a0b">${_esc(m.value)}</div>
              </div>
              <div style="font-size:8pt;line-height:1.4;color:#555">${_esc(m.context)}</div>
            </div>
          `).join('')}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ════════════════════════════════════════════════════════════════
  // PAGE 2: THE PLAN · CAPITAL TIMELINE · GLOSSARY (ORIENT)
  // ════════════════════════════════════════════════════════════════
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
    const dispValue = (R.net_sale_proceeds != null) ? R.net_sale_proceeds : 0;

    const steps = [
      { n: 1, title: 'Acquire', body: `Purchase the ${units}-unit property at ${h.fmtMoney(purchase)} using a bridge loan combined with investor equity.` },
      { n: 2, title: 'Renovate', body: `Execute the ${h.fmtMoney(capex)} renovation budget over approximately ${refiMonth} months, bringing the property up to institutional quality.` },
      { n: 3, title: 'Stabilize', body: `Lease the renovated units at market rents. Once occupancy and rental income stabilize, the property generates approximately ${h.fmtMoney(noi)} in annual NOI.` },
      { n: 4, title: 'Refinance', body: `Refinance with a long-term agency loan of approximately ${h.fmtMoney(refi)}, retiring the bridge loan and returning approximately ${h.fmtMoneyK(recapDollars)} (${h.fmtPct(recap, 0)}) of the initial investment to investors.` },
      { n: 5, title: 'Hold and dispose', body: `Operate the stabilized property for the remainder of the ${holdYears}-year hold, generating annual cash distributions. At the end of the hold, the property is sold and the remaining equity, plus appreciation, is returned to investors.` }
    ];

    const timeline = [
      { phase: 'Month 0 (closing)', event: 'Investor equity contributed', amount: '(' + h.fmtMoneyK(initEq) + ')', tone: 'out' },
      { phase: `Month ${refiMonth} (refinance)`, event: 'Capital returned at refinance', amount: '+' + h.fmtMoneyK(recapDollars), tone: 'in' },
      { phase: `Years 2-${holdYears - 1} (operating)`, event: 'Annual cash distributions', amount: '+ varies', tone: 'in' },
      { phase: `Year ${holdYears} (sale)`, event: 'Net sale proceeds returned', amount: '+' + h.fmtMoneyK(dispValue), tone: 'in' }
    ];

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
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'The Plan · Glossary')}

        <div class="print-section pb-avoid"><span class="ps-accent"></span>The Plan</div>
        <div class="iov-steps pb-avoid" style="display:flex;flex-direction:column;gap:3pt;margin-bottom:8pt">
          ${steps.map(s => `
            <div style="display:grid;grid-template-columns:22pt 1fr;gap:7pt;align-items:start">
              <div style="background:#C9A84C;color:#fff;border-radius:50%;width:18pt;height:18pt;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;margin-top:1pt">${s.n}</div>
              <div>
                <div style="font-size:9.5pt;font-weight:700;color:#0a0a0b;margin-bottom:1pt">${_esc(s.title)}</div>
                <div style="font-size:8.5pt;line-height:1.45;color:#444">${_esc(s.body)}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Capital Timeline</div>
        <table class="print-table pb-avoid" style="margin-bottom:8pt;font-size:9pt">
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
        <div class="iov-glossary pb-avoid" style="display:grid;grid-template-columns:1fr 1fr;gap:4pt 14pt;font-size:8pt;line-height:1.35">
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


  // ════════════════════════════════════════════════════════════════
  // PAGE 3: PROPERTY · UNIT MIX · INCOME · OPEX · NOI (CONSOLIDATED)
  // ════════════════════════════════════════════════════════════════
  // Consolidates the entire income side of the underwriting onto one
  // dense page: unit mix, income roll-up, operating expenses with
  // "what this covers" explanations, and stabilized NOI summary.
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
    const um = (typeof unitMix === 'object' && Array.isArray(unitMix)) ? unitMix : [];
    const units = R.total_unit_count || 1;
    const gprAnnual = R.gpr_annual || 0;
    const gprMonthly = R.gpr_monthly || (gprAnnual / 12);
    const vacancy = inputs.vacancy_pct || 0;
    const vacancyLoss = R.vacancy_loss || (gprAnnual * vacancy);
    const egi = R.egi || (gprAnnual - vacancyLoss);
    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const pm = R.pm_dollars || 0;
    const maint = R.maint_turnover || 0;
    const taxes = R.taxes || 0;
    const insurance = R.insurance || 0;
    const utilities = R.utilities || 0;
    const reserves = R.reserves || 0;
    const totalOpex = R.total_operating_expenses || 0;
    const noi = R.stabilized_noi || 0;
    const expRatio = (egi > 0) ? totalOpex / egi : 0;
    const noiMargin = (egi > 0) ? noi / egi : 0;
    const pmPct = inputs.pm_pct || 0;
    const maintPct = inputs.maint_pct_of_egi || 0;
    const insPct = inputs.insurance_pct_of_egi || 0;
    const utilPct = inputs.utilities_pct_of_egi || 0;
    const reservesPerUnit = inputs.reserves_per_unit_year || 1000;
    const taxDistrict = (inputs.tax_district || '').trim() || 'the local jurisdiction';
    const assetLabel = _assetTypeLabelPlain(inputs.asset_type, units);

    const umRows = um.filter(u => u && _bedTypeLabel(u.bed_type) !== '-' && (u.count || 0) > 0)
      .map(u => {
        const count = Number(u.count || 0);
        const rent = Number(u.rent || 0);
        const monthly = count * rent;
        const annual = monthly * 12;
        return { type: _bedTypeLabel(u.bed_type), count: count, rent: rent, monthly: monthly, annual: annual };
      });

    const opexLines = [
      { label: 'Property management', amount: pm, explain: `Cost of professional management. Underwritten at ${h.fmtPct(pmPct)} of EGI.` },
      { label: 'Maintenance and turnover', amount: maint, explain: `Routine repairs and unit-readying costs. Underwritten at ${h.fmtPct(maintPct)} of EGI.` },
      { label: 'Real estate taxes', amount: taxes, explain: `Annual property taxes assessed by ${_esc(taxDistrict)} based on the stabilized value.` },
      { label: 'Insurance', amount: insurance, explain: `Property and liability insurance. Underwritten at ${h.fmtPct(insPct)} of EGI.` },
      { label: 'Utilities', amount: utilities, explain: `Utilities paid by the property, not by tenants. Underwritten at ${h.fmtPct(utilPct)} of EGI.` },
      { label: 'Capital reserves', amount: reserves, explain: `Set-aside for future capital improvements. Underwritten at $${reservesPerUnit.toLocaleString()} per unit per year.` }
    ];

    return `
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'Income · Expenses · NOI')}

        <div style="font-size:8.5pt;line-height:1.45;color:#555;margin-bottom:6pt">
          This page shows the income side of the underwriting: the ${units} rental units (${_esc(assetLabel)}, acquired for ${h.fmtMoney(purchase)} with ${h.fmtMoney(capex)} in renovations), the stabilized rent assumptions, the operating expenses, and the resulting stabilized net operating income.
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Unit Mix and Stabilized Rents</div>
        <table class="print-table pb-avoid" style="margin-bottom:6pt;font-size:8.5pt">
          <thead>
            <tr>
              <th>Unit Type</th>
              <th class="num">Units</th>
              <th class="num">Rent / Unit (Monthly)</th>
              <th class="num">Total Monthly Rent</th>
              <th class="num">Annual Rent</th>
            </tr>
          </thead>
          <tbody>
            ${umRows.length === 0 ? `
              <tr><td colspan="5" style="text-align:center;color:#888;padding:6pt">Unit mix has not been entered for this deal.</td></tr>
            ` : umRows.map(r => `
              <tr>
                <td>${_esc(r.type)}</td>
                <td class="num">${r.count}</td>
                <td class="num">${h.fmtMoney(r.rent)}</td>
                <td class="num">${h.fmtMoney(r.monthly)}</td>
                <td class="num">${h.fmtMoney(r.annual)}</td>
              </tr>
            `).join('')}
            ${umRows.length > 0 ? `
              <tr class="totals">
                <td>Total (Gross Potential Rent)</td>
                <td class="num">${units}</td>
                <td class="num"></td>
                <td class="num">${h.fmtMoney(gprMonthly)}</td>
                <td class="num">${h.fmtMoney(gprAnnual)}</td>
              </tr>
              <tr>
                <td>Less: vacancy loss (${h.fmtPct(vacancy)})</td>
                <td class="num"></td>
                <td class="num"></td>
                <td class="num"></td>
                <td class="num" style="color:#a00">(${h.fmtMoney(vacancyLoss)})</td>
              </tr>
              <tr class="totals">
                <td>Effective Gross Income (EGI)</td>
                <td class="num"></td>
                <td class="num"></td>
                <td class="num"></td>
                <td class="num">${h.fmtMoney(egi)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Operating Expenses</div>
        <table class="print-table pb-avoid" style="margin-bottom:6pt;font-size:8.5pt">
          <thead>
            <tr>
              <th>Expense</th>
              <th class="num">Annual</th>
              <th class="num">Per Unit</th>
              <th class="num">% of EGI</th>
              <th style="width:40%">What This Covers</th>
            </tr>
          </thead>
          <tbody>
            ${opexLines.map(l => `
              <tr>
                <td>${_esc(l.label)}</td>
                <td class="num">${h.fmtMoney(l.amount)}</td>
                <td class="num">${units > 0 ? h.fmtMoney(l.amount / units) : '-'}</td>
                <td class="num">${egi > 0 ? h.fmtPct(l.amount / egi, 1) : '-'}</td>
                <td style="font-size:8pt;color:#555;line-height:1.4">${_esc(l.explain)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td>Total operating expenses</td>
              <td class="num">${h.fmtMoney(totalOpex)}</td>
              <td class="num">${units > 0 ? h.fmtMoney(totalOpex / units) : '-'}</td>
              <td class="num">${h.fmtPct(expRatio, 1)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent"></span>Stabilized Net Operating Income</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6pt;margin-bottom:4pt">
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:6pt;text-align:center;background:#fafaf6">
            <div style="font-size:7pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:1pt">Stabilized NOI</div>
            <div style="font-size:13pt;font-weight:700;color:#0a0a0b">${h.fmtMoney(noi)}</div>
            <div style="font-size:7pt;color:#666;margin-top:1pt">Income minus expenses</div>
          </div>
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:6pt;text-align:center">
            <div style="font-size:7pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:1pt">NOI Margin</div>
            <div style="font-size:13pt;font-weight:700;color:#0a0a0b">${h.fmtPct(noiMargin, 1)}</div>
            <div style="font-size:7pt;color:#666;margin-top:1pt">Share of EGI that becomes NOI</div>
          </div>
          <div style="border:1px solid #e6e6e6;border-radius:4pt;padding:6pt;text-align:center">
            <div style="font-size:7pt;letter-spacing:0.04em;text-transform:uppercase;color:#777;margin-bottom:1pt">NOI per Unit</div>
            <div style="font-size:13pt;font-weight:700;color:#0a0a0b">${units > 0 ? h.fmtMoney(noi / units) : '-'}</div>
            <div style="font-size:7pt;color:#666;margin-top:1pt">Annual NOI / unit count</div>
          </div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ════════════════════════════════════════════════════════════════
  // PAGE 4: SOURCES & USES · CAPITAL STACK · OWNERSHIP STRUCTURE
  // ════════════════════════════════════════════════════════════════
  function _page4(deal, R, inputs, market, h, pageNum, totalPages) {
    const tpc = R.total_project_cost || 0;
    const purchase = inputs.purchase_price || 0;
    const capex = inputs.capex_budget || 0;
    const closing = R.closing_costs || 0;
    const consulting = R.consulting || 0;
    const carry = R.debt_service_pre_refi || 0;
    const gcContingency = inputs.gc_contingency || 0;
    const acqTranche = R.acquisition_tranche || 0;
    const conTranche = R.construction_tranche || 0;
    const totalBridge = R.initial_loan_amt || (acqTranche + conTranche);
    const initEq = R.initial_investor_equity || 0;
    const initialLtv = inputs.initial_loan_ltv || 0;
    const initialLtcCapex = inputs.initial_loan_ltc_capex || 0;
    const mobilization = inputs.sponsor_mobilization || 0;

    // GC contingency funded-at-closing check (used to decide whether
    // contingency is a held-back reserve or part of equity at closing)
    const eqGcContingency = R.equity_gc_contingency_if_equity || 0;

    // GC contingency treatment: if treat_mob_as_equity is on, GC contingency
    // is funded by equity at closing. Otherwise it's a held-back reserve that
    // sits outside the closing capital stack (covered by future draws or sponsor).
    const gcHeldBack = gcContingency > 0 && eqGcContingency === 0;

    const totalSources = totalBridge + initEq + (gcHeldBack ? gcContingency : 0);
    const investorOwn = inputs.investor_ownership != null ? inputs.investor_ownership : 0.5;
    const sponsorOwn = 1 - investorOwn;
    const stackTotal = totalBridge + initEq;  // capital stack at closing excludes held-back contingency
    const bridgePct = stackTotal > 0 ? totalBridge / stackTotal : 0;
    const eqPct = stackTotal > 0 ? initEq / stackTotal : 0;

    const useRows = [
      { label: 'Purchase price', amt: purchase, note: 'Cost to acquire the property' },
      { label: 'Renovation budget', amt: capex, note: 'Cost to renovate and bring units to market quality' },
      { label: 'Closing costs', amt: closing, note: 'Title, insurance, lender fees, transfer tax' },
      { label: 'Consulting / project fee', amt: consulting, note: 'Sponsor project management fee' },
      { label: 'Bridge debt service through refinance', amt: carry, note: 'Loan interest paid during renovation period' },
      { label: 'GC contingency reserve', amt: gcContingency, note: gcHeldBack ? 'Held back from closing; funded as needed from cost overruns reserve' : 'Cost overrun reserve, funded at closing' },
      { label: 'Sponsor mobilization (capex float)', amt: mobilization, note: 'Working capital for contractor payments; reimbursed via lender draws' }
    ].filter(r => r.amt > 0);

    // Build source rows. Notes now carry LTV/LTC context. If GC contingency
    // is held back, it appears in Sources as a held-back reserve line so
    // Sources tie to TPC instead of leaving a visible funding gap.
    const purchaseLtvNote = (initialLtv > 0 && purchase > 0)
      ? `${h.fmtPct(initialLtv, 0)} loan-to-value of purchase price`
      : 'Senior debt funding the property purchase';
    const capexLtcNote = (initialLtcCapex > 0 && capex > 0)
      ? `${h.fmtPct(initialLtcCapex, 0)} loan-to-cost of renovation budget, released in draws`
      : 'Senior debt funding the renovation, released in draws';

    const srcRows = [
      { label: 'Bridge loan: acquisition tranche', amt: acqTranche, note: purchaseLtvNote },
      { label: 'Bridge loan: construction tranche', amt: conTranche, note: capexLtcNote },
      { label: 'Investor equity at closing', amt: initEq, note: 'Cash contributed by the equity partner at closing' },
      gcHeldBack ? { label: 'GC contingency (held back, not at closing)', amt: gcContingency, note: 'Reserve held back from the closing capital stack; drawn only if cost overruns occur' } : null
    ].filter(r => r && r.amt > 0);

    return `
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'Capital · Sources & Uses')}

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Uses of Capital</div>
        <table class="print-table" style="margin-bottom:5pt;font-size:8.5pt">
          <thead>
            <tr><th>Use</th><th class="num">Amount</th><th class="num">% of Total</th><th style="width:40%">Notes</th></tr>
          </thead>
          <tbody>
            ${useRows.map(r => `
              <tr>
                <td>${_esc(r.label)}</td>
                <td class="num">${h.fmtMoney(r.amt)}</td>
                <td class="num">${tpc > 0 ? h.fmtPct(r.amt / tpc, 1) : '-'}</td>
                <td style="font-size:8pt;color:#555">${_esc(r.note)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td>Total project cost</td>
              <td class="num">${h.fmtMoney(tpc)}</td>
              <td class="num">100.0%</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Sources of Capital</div>
        <table class="print-table" style="margin-bottom:5pt;font-size:8.5pt">
          <thead>
            <tr><th>Source</th><th class="num">Amount</th><th class="num">% of TPC</th><th style="width:40%">Notes</th></tr>
          </thead>
          <tbody>
            ${srcRows.map(r => `
              <tr>
                <td>${_esc(r.label)}</td>
                <td class="num">${h.fmtMoney(r.amt)}</td>
                <td class="num">${tpc > 0 ? h.fmtPct(r.amt / tpc, 1) : '-'}</td>
                <td style="font-size:8pt;color:#555">${_esc(r.note)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td>Total sources</td>
              <td class="num">${h.fmtMoney(totalSources)}</td>
              <td class="num">${tpc > 0 ? h.fmtPct(totalSources / tpc, 1) : '-'}</td>
              <td style="font-size:8pt;color:#555">${Math.abs(totalSources - tpc) < 1 ? 'Reconciled to total project cost' : `Variance of ${h.fmtMoney(totalSources - tpc)} vs. TPC`}</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Capital Stack</div>
        <div class="pb-avoid" style="display:flex;margin-bottom:6pt;font-size:8.5pt;font-weight:600;color:#fff;border-radius:3pt;overflow:hidden">
          <div style="background:#1a1a1a;padding:4pt;flex:${bridgePct};text-align:center">Bridge debt ${h.fmtPct(bridgePct, 1)}</div>
          <div style="background:#C9A84C;padding:4pt;flex:${eqPct};text-align:center">Investor equity ${h.fmtPct(eqPct, 1)}</div>
        </div>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Ownership and Distribution Structure</div>
        <table class="print-table" style="margin-bottom:0;font-size:8.5pt">
          <tbody>
            <tr>
              <td style="width:38%">Deal entity</td>
              <td>Joint venture between ASJP and the capital partner, formed as a single-purpose LLC for this acquisition</td>
            </tr>
            <tr>
              <td>Capital partner ownership</td>
              <td>${h.fmtPct(investorOwn, 1)} of the deal LLC</td>
            </tr>
            <tr>
              <td>Sponsor (ASJP) ownership</td>
              <td>${h.fmtPct(sponsorOwn, 1)} of the deal LLC</td>
            </tr>
            <tr>
              <td>Capital partner contribution at closing</td>
              <td>${h.fmtMoney(initEq)} cash (100% of cash equity)</td>
            </tr>
            <tr>
              <td>Sponsor contribution at closing</td>
              <td>Operational execution: deal sourcing, acquisition, capex management, asset management, refinancing, and disposition. Sponsor assumes personal recourse on the bridge loan.</td>
            </tr>
            <tr>
              <td>Cash flow and disposition distribution</td>
              <td>Pro-rata to ownership (${h.fmtPct(investorOwn, 1)} to capital partner, ${h.fmtPct(sponsorOwn, 1)} to sponsor)</td>
            </tr>
            <tr>
              <td>Promote / waterfall / preferred return</td>
              <td>None - straight pro-rata distributions throughout the life of the deal</td>
            </tr>
            <tr>
              <td colspan="2" style="font-size:7.5pt;line-height:1.4;color:#666;background:#fafafa">
                <strong>How to read this structure.</strong> The capital partner funds 100% of cash equity and owns ${h.fmtPct(investorOwn, 1)} of the deal LLC. The sponsor contributes operational execution and signs personally on the bridge loan. Distributions are pro-rata - ${h.fmtPct(investorOwn, 1)} of every dollar of cash flow and sale proceeds goes to the capital partner. There is no promote or preferred return; the math is symmetrical.
              </td>
            </tr>
          </tbody>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ════════════════════════════════════════════════════════════════
  // PAGE 5: VALUATION · REFINANCE · 10-YEAR CASH FLOW
  // ════════════════════════════════════════════════════════════════
  function _page5(deal, R, inputs, market, h, pageNum, totalPages) {
    const noi = R.stabilized_noi || 0;
    const exitCap = inputs.exit_cap || 0;
    const arv = R.stabilized_arv || 0;
    const tpc = R.total_project_cost || 0;
    const valueCreation = arv - tpc;
    const valueCreationPct = tpc > 0 ? valueCreation / tpc : 0;
    const refiLTV = inputs.target_refi_ltv || 0.7;
    const refiLoan = R.refi_loan_amount || 0;
    const refiRate = inputs.refi_rate || 0;
    const refiAnnualDS = R.refi_annual_ds || 0;
    const dscr = (refiAnnualDS > 0) ? (noi / refiAnnualDS) : 0;
    const refiClosingPct = 0.04;
    const refiClosing = refiLoan * refiClosingPct;
    const bridgePayoff = R.initial_loan_amt || ((R.acquisition_tranche || 0) + (R.construction_tranche || 0));
    const netCashOut = refiLoan - bridgePayoff - refiClosing;
    const initEq = R.initial_investor_equity || 0;
    const recap = _pctNorm(R.capital_recaptured_pct) || 0;
    const dist = Array.isArray(R.distribution) ? R.distribution : [];
    const holdYears = inputs.target_hold_years || 10;
    const refiMonth = inputs.target_refi_months || 7;

    const cfRows = [];
    for (let y = 0; y <= Math.min(holdYears, dist.length - 1); y++) {
      const v = dist[y] || 0;
      let note = '';
      if (y === 0) note = 'Initial equity contribution at closing';
      else if (y === 1) note = `Includes refinance proceeds (month ${refiMonth}) plus first-year operating cash flow`;
      else if (y === holdYears) note = 'Final-year operating cash flow plus net proceeds from sale';
      else note = 'Operating cash flow distribution';
      cfRows.push({ year: y, value: v, note: note });
    }
    const totalDist = cfRows.reduce((s, r) => r.year === 0 ? s : s + (r.value || 0), 0);

    return `
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'Valuation · Refinance · Cash Flow')}

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Stabilized Valuation</div>
        <table class="print-table" style="margin-bottom:5pt;font-size:8.5pt">
          <tbody>
            <tr>
              <td style="width:55%">Stabilized net operating income (NOI)</td>
              <td class="num">${h.fmtMoney(noi)}</td>
            </tr>
            <tr>
              <td>Exit cap rate <span style="color:#888;font-size:8pt">- market yield used to value the property</span></td>
              <td class="num">${h.fmtPct(exitCap, 2)}</td>
            </tr>
            <tr class="totals">
              <td>Stabilized after-repair value (ARV = NOI / exit cap)</td>
              <td class="num">${h.fmtMoney(arv)}</td>
            </tr>
            <tr>
              <td>Total project cost (purchase + renovations + costs)</td>
              <td class="num">${h.fmtMoney(tpc)}</td>
            </tr>
            <tr>
              <td>Value creation (ARV minus project cost)</td>
              <td class="num" style="color:${valueCreation >= 0 ? '#1f7a3c' : '#a00'};font-weight:600">${h.fmtMoney(valueCreation)} (${h.fmtPct(valueCreationPct, 1)})</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Refinance Mechanics</div>
        <table class="print-table" style="margin-bottom:5pt;font-size:8.5pt">
          <thead>
            <tr><th>Step</th><th class="num">Amount</th><th>Explanation</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>New refinance loan</td>
              <td class="num" style="color:#1f7a3c">+${h.fmtMoney(refiLoan)}</td>
              <td style="font-size:8pt;color:#555">Long-term agency loan at ${h.fmtPct(refiRate, 2)} interest, sized at ${h.fmtPct(refiLTV)} of stabilized value</td>
            </tr>
            <tr>
              <td>Less: payoff of bridge loan</td>
              <td class="num" style="color:#a00">(${h.fmtMoney(bridgePayoff)})</td>
              <td style="font-size:8pt;color:#555">Original bridge debt retired in full</td>
            </tr>
            <tr>
              <td>Less: refinance closing costs (~${h.fmtPct(refiClosingPct)})</td>
              <td class="num" style="color:#a00">(${h.fmtMoney(refiClosing)})</td>
              <td style="font-size:8pt;color:#555">Lender fees, title insurance, appraisal, legal</td>
            </tr>
            <tr class="totals">
              <td>Net cash returned to investors</td>
              <td class="num">${h.fmtMoney(netCashOut)}</td>
              <td style="font-size:8pt;color:#555">Approximately ${h.fmtPct(recap, 0)} of the ${h.fmtMoney(initEq)} initial equity</td>
            </tr>
            <tr>
              <td>Debt service coverage ratio (DSCR) at refinance</td>
              <td class="num">${dscr.toFixed(2)}x</td>
              <td style="font-size:8pt;color:#555">NOI divided by annual loan payment; agency lenders typically require at least 1.20x</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>${holdYears}-Year Investor Cash Flow</div>
        <table class="print-table" style="margin-bottom:4pt;font-size:8.5pt">
          <thead>
            <tr><th>Year</th><th class="num">Distribution</th><th>Notes</th></tr>
          </thead>
          <tbody>
            ${cfRows.map(r => `
              <tr>
                <td>Y${r.year}</td>
                <td class="num" style="color:${r.value < 0 ? '#a00' : (r.value > 0 ? '#1f7a3c' : '#555')};font-weight:${r.value !== 0 ? '600' : '400'}">${r.value < 0 ? '(' + h.fmtMoney(Math.abs(r.value)) + ')' : h.fmtMoney(r.value)}</td>
                <td style="font-size:8pt;color:#555">${_esc(r.note)}</td>
              </tr>
            `).join('')}
            <tr class="totals">
              <td>Total positive distributions</td>
              <td class="num">${h.fmtMoney(totalDist)}</td>
              <td style="font-size:8pt;color:#555">Sum of distributions Y1 through Y${holdYears}, on ${h.fmtMoney(initEq)} invested</td>
            </tr>
          </tbody>
        </table>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ════════════════════════════════════════════════════════════════
  // PAGE 6: RISKS · SENSITIVITY · FAQ · SPONSOR · DISCLAIMERS (CLOSE)
  // ════════════════════════════════════════════════════════════════
  function _page6(deal, R, inputs, market, h, pageNum, totalPages) {
    let risks = [];
    if (typeof assembleRisks === 'function') {
      risks = assembleRisks().filter(r => !r.resolved);
    }
    const sevOrder = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => (sevOrder[a.severity || 'medium'] || 1) - (sevOrder[b.severity || 'medium'] || 1));
    const topRisks = risks.slice(0, 3);

    const baseEC = inputs.exit_cap || 0.07;
    const baseRG = inputs.rent_growth_pct || 0.05;
    const baseSCP = inputs.sale_cost_pct || 0.07;
    const remLoan = R.remaining_loan_balance || 0;
    const baseVac = inputs.vacancy_pct || 0;
    const baseGpr = R.gpr_annual || 0;
    const baseExpRatio = (R.egi > 0) ? (R.total_operating_expenses / R.egi) : 0;
    const dist = Array.isArray(R.distribution) ? R.distribution : [];
    const holdYears = inputs.target_hold_years || 10;
    const initEq = R.initial_investor_equity || 0;
    const em = R.equity_multiple;
    const y1 = dist[1] || 0;
    const sumOpDist = (function () {
      let s = 0;
      for (let i = 2; i <= Math.min(holdYears - 1, dist.length - 1); i++) s += dist[i] || 0;
      return s;
    })();

    function _scenarioEM(ec, rg) {
      const gpr10 = baseGpr * Math.pow(1 + rg, holdYears - 1);
      const egi10 = gpr10 * (1 - baseVac);
      const opex10 = egi10 * baseExpRatio;
      const noi10 = egi10 - opex10;
      const dispVal = ec > 0 ? noi10 / ec : 0;
      const netSale = dispVal * (1 - baseSCP) - remLoan;
      const y10Approx = noi10 * 0.4;
      const sumPositive = y1 + sumOpDist + Math.max(0, netSale) + Math.max(0, y10Approx);
      return initEq > 0 ? sumPositive / initEq : 0;
    }

    const baseEM = (em != null && isFinite(em)) ? em : _scenarioEM(baseEC, baseRG);
    const downsideEM = _scenarioEM(baseEC + 0.005, Math.max(0, baseRG - 0.01));
    const upsideEM = _scenarioEM(Math.max(0.04, baseEC - 0.005), baseRG + 0.01);

    const co = (typeof CP === 'object' && CP && CP.active) ? CP.active : null;
    const contact = (co && co.contact_info) ? co.contact_info : {};
    const sponsorName = (co && co.name) || 'ASJP';

    const refiMonth = inputs.target_refi_months || 7;
    const recapPct = _pctNorm(R.capital_recaptured_pct) || 0;
    const faqs = [
      {
        q: 'What if it takes longer than ' + refiMonth + ' months to renovate and stabilize?',
        a: `The bridge loan can be extended if needed, typically at a higher rate. A 3-6 month delay would increase carrying costs but is built into the sponsor's contingency planning. A longer delay would push the refinance and reduce the IRR, but does not put the principal at risk as long as the property stabilizes at the projected rents.`
      },
      {
        q: 'What if I need my money back sooner than the ' + holdYears + '-year hold?',
        a: `LP interests in this deal are illiquid by nature. There is no required buyback mechanism. The sponsor can attempt to find a secondary buyer for the LP interest if requested, but cannot guarantee timing or pricing. Most of the initial investment is returned at refinance (month ${refiMonth}); the remaining equity is locked through disposition.`
      },
      {
        q: 'When do I receive my first distribution?',
        a: `The first material distribution arrives at refinance, around month ${refiMonth}, when approximately ${h.fmtPct(recapPct, 0)} of the initial investment is returned. Smaller operating cash flow distributions continue annually thereafter, with the final distribution including the sale proceeds at year ${holdYears}.`
      },
      {
        q: 'What is the worst-case scenario?',
        a: `The principal risk is failure to refinance at the projected terms, which would extend the bridge loan and reduce returns. In a downside scenario where rent growth disappoints and the exit cap softens, the deal still generates a positive return for investors but at a lower equity multiple (see the sensitivity table above). Catastrophic loss of capital would require both a failed refinance and a forced sale below total project cost.`
      }
    ];

    return `
      <div class="print-page print-page-compact iov-tight">
        ${_header(h, 'Risks · FAQ · Sponsor')}

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Key Risks</div>
        ${topRisks.length === 0 ? `
          <div style="font-size:8.5pt;color:#555;line-height:1.4;margin-bottom:5pt;padding:5pt 8pt;border-left:3pt solid #1f7a3c;background:#f5faf6">
            No risks have been flagged by the underwriting engine or market analysis modules against the assumptions in this report. The standard disclaimers below still apply, and prospective investors should conduct their own independent diligence.
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:2pt;margin-bottom:5pt">
            ${topRisks.map(r => {
              const sev = (r.severity || 'medium').toLowerCase();
              const sevColor = sev === 'high' ? '#c0392b' : (sev === 'medium' ? '#b8860b' : '#666');
              const sevBg = sev === 'high' ? '#fdf3f1' : (sev === 'medium' ? '#fdf9ee' : '#f7f7f7');
              return `
                <div class="pb-avoid" style="border-left:3pt solid ${sevColor};padding:2pt 8pt;background:${sevBg}">
                  <div style="font-size:7pt;font-weight:700;color:${sevColor};letter-spacing:0.04em;text-transform:uppercase">${_esc(sev)} severity</div>
                  <div style="font-size:8.5pt;font-weight:600;color:#0a0a0b">${_esc(r.title || 'Risk')}</div>
                  <div style="font-size:8pt;color:#444;line-height:1.35">${_esc(_truncate(r.detail || '', 180))}</div>
                  ${r.mitigation ? `<div style="font-size:8pt;color:#555;line-height:1.35;margin-top:1pt;padding-top:1pt;border-top:1px dashed #ddd"><strong>Mitigation.</strong> ${_esc(r.mitigation)}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
        `}

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>What If the Market Moves</div>
        <table class="print-table" style="margin-bottom:5pt;font-size:8.5pt">
          <thead><tr><th>Scenario</th><th>Description</th><th class="num">Equity Multiple</th></tr></thead>
          <tbody>
            <tr><td><strong>Downside</strong></td><td style="font-size:8pt;color:#555">Rent growth 1pp lower than projected; property sells at 50bp higher cap rate.</td><td class="num">${downsideEM.toFixed(2)}x</td></tr>
            <tr class="totals"><td><strong>Base case</strong></td><td style="font-size:8pt;color:#555">Underwriting assumptions are met. ${h.fmtPct(baseRG)} annual rent growth, ${h.fmtPct(baseEC, 2)} exit cap rate.</td><td class="num">${baseEM.toFixed(2)}x</td></tr>
            <tr><td><strong>Upside</strong></td><td style="font-size:8pt;color:#555">Rent growth 1pp higher than projected; property sells at 50bp lower cap rate.</td><td class="num">${upsideEM.toFixed(2)}x</td></tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Frequently Asked Questions</div>
        <div class="iov-faq" style="display:flex;flex-direction:column;gap:3pt;margin-bottom:5pt">
          ${faqs.map(f => `
            <div class="pb-avoid">
              <div style="font-size:8.5pt;font-weight:700;color:#0a0a0b;margin-bottom:1pt">${_esc(f.q)}</div>
              <div style="font-size:8pt;line-height:1.4;color:#555">${_esc(f.a)}</div>
            </div>
          `).join('')}
        </div>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Sponsor</div>
        <div class="iov-sponsor pb-avoid" style="margin-bottom:4pt;padding-bottom:3pt;border-bottom:1px solid #eee">
          <div style="font-size:10pt;font-weight:700;color:#0a0a0b;margin-bottom:1pt">${_esc(sponsorName)}</div>
          <div style="font-size:8pt;color:#333;line-height:1.4">
            ${contact.email ? `<span style="margin-right:10pt"><strong style="color:#777;font-size:7pt;letter-spacing:0.04em;text-transform:uppercase">Email</strong> ${_esc(contact.email)}</span>` : ''}
            ${contact.phone ? `<span style="margin-right:10pt"><strong style="color:#777;font-size:7pt;letter-spacing:0.04em;text-transform:uppercase">Phone</strong> ${_esc(contact.phone)}</span>` : ''}
            ${contact.website ? `<span style="margin-right:10pt"><strong style="color:#777;font-size:7pt;letter-spacing:0.04em;text-transform:uppercase">Web</strong> ${_esc(contact.website)}</span>` : ''}
          </div>
        </div>

        <div class="print-section pb-avoid" style="break-after:avoid"><span class="ps-accent"></span>Disclaimers</div>
        <div class="pb-avoid" style="font-size:7pt;line-height:1.35;color:#555;column-count:2;column-gap:12pt">
          <p style="margin:0 0 2pt 0;break-inside:avoid"><strong>No offer.</strong> This document is informational only and is not an offer to sell or a solicitation of an offer to buy any securities. Any offer will be made solely through a confidential Private Placement Memorandum.</p>
          <p style="margin:0 0 2pt 0;break-inside:avoid"><strong>Projections, not guarantees.</strong> Projections of returns are based on assumptions believed reasonable as of the date of this document. Actual results may differ materially.</p>
          <p style="margin:0 0 2pt 0;break-inside:avoid"><strong>Risk and independent diligence.</strong> Real estate investments involve substantial risk, including the possible loss of all invested capital. Prospective investors must conduct their own independent investigation and consult their own legal, tax, and financial advisors.</p>
          <p style="margin:0;break-inside:avoid"><strong>Confidentiality.</strong> This document is confidential and furnished solely to the named recipient for evaluation of a potential investment.</p>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_investment_overview(deal, R, inputs, market, helpers) {
    const h = helpers || {};
    const totalPages = 6;
    const pages = [
      _page1(deal, R, inputs, market, h, 1, totalPages),
      _page2(deal, R, inputs, market, h, 2, totalPages),
      _page3(deal, R, inputs, market, h, 3, totalPages),
      _page4(deal, R, inputs, market, h, 4, totalPages),
      _page5(deal, R, inputs, market, h, 5, totalPages),
      _page6(deal, R, inputs, market, h, 6, totalPages)
    ];
    return pages.join('\n');
  }

  window.renderReport_investment_overview = renderReport_investment_overview;

})();
