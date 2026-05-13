// ════════════════════════════════════════════════════════════════
// FOUNDRY M6.7 - Valor HUD-VASH PBV Package
// ════════════════════════════════════════════════════════════════
// Institutional pitch for Valor Housing Partners' veteran housing
// platform. Audience: HUD/VA officials brought by Robert Cullen,
// Compass/QIA sovereign capital pathway, institutional LPs evaluating
// Valor as a fund manager, swing-state housing finance agencies.
//
// HEADLINE METRIC: Voucher Uplift = FMR / ACS median rent - 1
// This is the strategic frame: HUD-VASH PBV vouchers pay FMR, which
// in many submarkets is well above ACS median market rent. The
// uplift is captured by the property owner as risk-adjusted yield.
//
// CONTRACT
//   window.renderReport_valor_pbv(deal, R, inputs, market, helpers)
//     -> HTML string (multiple .print-page elements)
//
// PAGES
//   1  Cover + Voucher Uplift Headline + Deal Snapshot
//   2  Mission + Federal Pathway (DRAFT narrative)
//   3  Voucher Economics + Rent Stack
//   4  Swing-State Context + Footprint
//   5  Asset Summary + Sponsor + Disclosures
//   6  Governance Structure
//
// VALOR PERSONNEL (locked in user memory; rendered on Pages 2/5/6)
//   - Jonathan Paz, CEO and Chief Investment Officer
//   - Alexei Semenov, COO and Chief Asset Officer
//   - Robert Cullen, SVP Federal Relations
//   - Tiffany Loo, Operations & Acquisitions Coordinator
//
// SWING-STATE FOOTPRINT
//   2024 battleground seven: AZ, GA, MI, NV, NC, PA, WI
//   Plus Virginia
//   Plus Cleveland (Ohio) as non-swing operational anchor exception
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

  // Swing-state footprint check
  // Returns: { tier: 'swing'|'expanded'|'anchor'|'outside', label }
  //   swing    - 2024 battleground seven
  //   expanded - Virginia (added per Valor strategy)
  //   anchor   - Cleveland OH (operational anchor, non-swing exception)
  //   outside  - anywhere else
  function _footprintTier(state, city) {
    const swing = ['AZ', 'GA', 'MI', 'NV', 'NC', 'PA', 'WI'];
    const stUp = (state || '').toUpperCase();
    const cityUp = (city || '').toUpperCase();
    if (swing.indexOf(stUp) >= 0) return { tier: 'swing', label: 'Swing-State Footprint (2024 Battleground)' };
    if (stUp === 'VA') return { tier: 'expanded', label: 'Expanded Swing-State Footprint (Virginia)' };
    if (stUp === 'OH' && cityUp.indexOf('CLEVELAND') >= 0) return { tier: 'anchor', label: 'Cleveland Operational Anchor (Non-Swing Exception)' };
    return { tier: 'outside', label: 'Outside Valor Footprint' };
  }


  // ── HEADER + FOOTER ───────────────────────────────────────────
  function _header(h, pageLabel) {
    return `
      <div class="print-header pb-avoid">
        <div class="ph-co-block">
          <div class="ph-co-name valor-brandmark">VALOR HOUSING PARTNERS</div>
          <div class="ph-co-sub">Institutional Veteran Housing Platform · ASJP Group</div>
        </div>
        <div class="ph-meta">
          <div><strong>HUD-VASH PBV Package</strong></div>
          <div>${_esc(pageLabel || '')}</div>
          <div>${_esc(h.todayLong())}</div>
        </div>
      </div>`;
  }

  function _footer(pageNum, totalPages) {
    return `
      <div class="print-footer pb-avoid">
        <div class="pf-conf">Confidential · Valor Housing Partners</div>
        <div class="pf-page">${pageNum} of ${totalPages}</div>
      </div>`;
  }


  // ── VOUCHER UPLIFT CALCULATION ────────────────────────────────
  // Headline metric: weighted-average uplift across the actual unit
  // mix where available, falling back to 2BR uplift. The "uplift" is
  // (FMR - market rent) / market rent - the spread captured by the
  // property when HUD pays voucher-side FMR instead of market.
  function _computeVoucherUplift(R, inputs, market) {
    const fmr = market && market.fmr;
    const census = market && market.census;
    if (!fmr || !census || !census.median_rent) return null;

    const mktRent = census.median_rent;
    const um = (typeof unitMix === 'object' && Array.isArray(unitMix)) ? unitMix : [];

    // Map bed_type strings to FMR bracket
    function _fmrFor(bed) {
      const b = String(bed || '').toLowerCase();
      if (b.includes('studio') || b === '0br') return fmr.studio || fmr.br1;
      if (b === '1br') return fmr.br1;
      if (b === '2br') return fmr.br2;
      if (b === '3br') return fmr.br3;
      if (b === '4br' || b.includes('4')) return fmr.br4;
      return fmr.br2; // default
    }

    // If we have unit mix, compute weighted-average FMR
    if (um.length > 0) {
      let totalUnits = 0, weightedFMR = 0;
      for (const u of um) {
        const n = u.count || 0;
        const fmrAmt = _fmrFor(u.bed_type);
        if (n > 0 && fmrAmt > 0) {
          totalUnits += n;
          weightedFMR += n * fmrAmt;
        }
      }
      if (totalUnits > 0) {
        const avgFMR = weightedFMR / totalUnits;
        const uplift = (avgFMR - mktRent) / mktRent;
        return {
          marketRent: mktRent,
          avgFMR,
          uplift,
          method: 'weighted-by-unit-mix',
          monthlyDollarUplift: avgFMR - mktRent,
          annualDollarUpliftPerUnit: (avgFMR - mktRent) * 12,
          totalUnits
        };
      }
    }

    // Fallback: 2BR FMR comparison
    const fmr2 = fmr.br2;
    if (fmr2 > 0) {
      return {
        marketRent: mktRent,
        avgFMR: fmr2,
        uplift: (fmr2 - mktRent) / mktRent,
        method: '2BR-fallback',
        monthlyDollarUplift: fmr2 - mktRent,
        annualDollarUpliftPerUnit: (fmr2 - mktRent) * 12,
        totalUnits: R.total_unit_count || 0
      };
    }

    return null;
  }


  // ── PAGE 1: COVER + VOUCHER UPLIFT + DEAL SNAPSHOT ────────────
  function _page1(deal, R, inputs, market, h, pageNum, totalPages) {
    const dealName = (deal && deal.name) ? deal.name : 'Untitled Deal';
    const addrLine = _addressLine(deal, inputs);
    const showAddrSub = addrLine && !_normForCmp(dealName).includes(_normForCmp(addrLine));
    const units = R.total_unit_count || 0;
    const uplift = _computeVoucherUplift(R, inputs, market);
    const footprint = _footprintTier(inputs.state, inputs.city);

    // Total PBV allocation capacity: HUD-VASH PBV caps PBV at 25% of
    // a PHA's voucher allocation for project-basing, though target
    // population (homeless veterans) gets exempt status in many PHAs.
    // For institutional sizing, we present the deal-level capacity
    // assuming full PBV qualification.
    const fullPBV = units; // assume all units can be PBV-eligible
    const annualFederalSubsidy = uplift ? uplift.avgFMR * 12 * fullPBV : null;

    const tiles = [
      {
        lbl: 'Voucher Uplift',
        val: uplift ? h.fmtPct(uplift.uplift) : '-',
        sub: uplift ? 'FMR / ACS rent - 1' : 'Awaiting market data',
        tone: uplift ? _toneAbove(uplift.uplift, 0, 0.10) : 'neutral'
      },
      {
        lbl: 'PBV Eligible Units',
        val: String(fullPBV) + ' / ' + String(units),
        sub: 'Project-Based Voucher capacity',
        tone: 'neutral'
      },
      {
        lbl: 'Annual Federal Subsidy',
        val: annualFederalSubsidy ? h.fmtMoneyK(annualFederalSubsidy) : '-',
        sub: 'Avg FMR × 12 × eligible units',
        tone: 'neutral'
      },
      {
        lbl: 'Monthly $ Uplift / Unit',
        val: uplift ? h.fmtMoney(uplift.monthlyDollarUplift) : '-',
        sub: 'FMR vs ACS median rent',
        tone: uplift ? _toneAbove(uplift.monthlyDollarUplift, 0, 100) : 'neutral'
      }
    ];

    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Cover · Voucher Uplift')}

        <div class="print-title pb-avoid">
          <div class="print-title-eyebrow valor-eyebrow">HUD-VASH Project-Based Voucher Package</div>
          <h1 class="print-title-h1">${_esc(dealName)}</h1>
          <div class="print-title-sub">
            ${showAddrSub ? _esc(addrLine) + ' · ' : ''}${_esc(_assetTypeLabel(inputs.asset_type))}${units > 0 ? ' · ' + units + ' units' : ''}
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Executive Summary</div>
        ${_execSummary(deal, R, inputs, market, h, uplift, footprint)}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Voucher Uplift Headline</div>
        <div class="print-kpis cols-2">
          ${tiles.map(t => `
            <div class="pk-tile pb-avoid pk-tone-${t.tone}">
              <div class="pk-tile-lbl">${_esc(t.lbl)}</div>
              <div class="pk-tile-val">${_toneGlyph(t.tone)}${_esc(t.val)}</div>
              <div class="pk-tile-sub">${_esc(t.sub)}</div>
            </div>`).join('')}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Deal Snapshot</div>
        ${_dealSnapshot(R, inputs, h)}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  function _execSummary(deal, R, inputs, market, h, uplift, footprint) {
    const units = R.total_unit_count || 0;
    const city = inputs.city || '';
    const state = inputs.state || '';

    let para;
    if (uplift) {
      const upliftDesc = uplift.uplift > 0
        ? `${h.fmtPct(uplift.uplift)} above ACS median market rent (${h.fmtMoney(uplift.monthlyDollarUplift)}/unit/month)`
        : `${h.fmtPct(Math.abs(uplift.uplift))} below ACS median market rent (market rent exceeds FMR; deal economics depend on tenant-paid premium rather than voucher uplift)`;
      para = `${units}-unit ${_assetTypeLabel(inputs.asset_type).toLowerCase()} in ${_esc(city)}${state ? ', ' + _esc(state) : ''}, sized for HUD-VASH Project-Based Voucher allocation. HUD FMR pays ${upliftDesc}, generating projected annual federal subsidy of ${h.fmtMoneyK(uplift.avgFMR * 12 * units)}. ${footprint.tier === 'swing' ? 'Subject submarket is within Valor\'s 2024 swing-state battleground footprint.' : footprint.tier === 'expanded' ? 'Subject submarket is within Valor\'s expanded footprint (Virginia).' : footprint.tier === 'anchor' ? 'Subject submarket is Cleveland, OH - Valor\'s designated operational anchor (non-swing footprint exception).' : 'Subject submarket is outside Valor\'s primary footprint.'}`;
    } else {
      para = `${units}-unit ${_assetTypeLabel(inputs.asset_type).toLowerCase()} in ${_esc(city)}${state ? ', ' + _esc(state) : ''}, sized for HUD-VASH Project-Based Voucher allocation. Market data (HUD FMR + ACS median rent) has not yet been fetched for this deal; voucher uplift cannot be computed. Run market analysis in the app to populate the headline metrics.`;
    }

    return `<div class="bp-narrative pb-avoid"><p>${para}</p></div>`;
  }


  function _dealSnapshot(R, inputs, h) {
    return `
      <div class="lender-twocol pb-avoid">
        <div>
          <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
            <div class="pl-row"><span class="pl-lbl">Total Units</span><span class="pl-val">${R.total_unit_count || 0}</span></div>
            <div class="pl-row"><span class="pl-lbl">Asset Type</span><span class="pl-val">${_esc(_assetTypeLabel(inputs.asset_type))}</span></div>
            <div class="pl-row"><span class="pl-lbl">Purchase Price</span><span class="pl-val">${h.fmtMoney(inputs.purchase_price)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Capex Budget</span><span class="pl-val">${h.fmtMoney(inputs.capex_budget)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Total Project Cost</span><span class="pl-val">${h.fmtMoney(R.total_project_cost)}</span></div>
          </div>
        </div>
        <div>
          <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
            <div class="pl-row"><span class="pl-lbl">Stabilized NOI</span><span class="pl-val">${h.fmtMoney(R.stabilized_noi)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Stabilized ARV</span><span class="pl-val">${h.fmtMoneyK(R.stabilized_arv)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Refi LTV</span><span class="pl-val">${h.fmtPct(inputs.target_refi_ltv)}</span></div>
            <div class="pl-row"><span class="pl-lbl">DSCR</span><span class="pl-val">${h.fmtX(R.dscr, 2)}</span></div>
            <div class="pl-row"><span class="pl-lbl">Hold</span><span class="pl-val">${inputs.target_hold_years || 10} years</span></div>
          </div>
        </div>
      </div>`;
  }


  // ── PAGE 2: MISSION + FEDERAL PATHWAY (auto-narrated DRAFT) ───
  function _page2(deal, R, inputs, market, h, pageNum, totalPages) {
    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Mission · Federal Pathway')}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Valor's Mission <span class="bp-draft-tag">DRAFT</span></div>
        <div class="bp-narrative pb-avoid">
          <p>Valor Housing Partners is the institutional affordable housing platform of ASJP Group, dedicated to acquiring, renovating, and operating quality housing for U.S. military veterans through the HUD-VASH Project-Based Voucher (PBV) program. The platform combines institutional underwriting discipline with mission-aligned property management, generating risk-adjusted returns for capital partners while delivering stable, dignified housing to veterans nationwide.</p>
          <p>The HUD-VASH program is a joint initiative of the U.S. Department of Housing and Urban Development and the U.S. Department of Veterans Affairs, providing rental assistance vouchers to homeless and at-risk veterans. Project-basing these vouchers, which affixes them to a specific property rather than the tenant, creates a stable federal revenue stream typically lasting 15-20 years, with multiple renewal options.</p>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Federal Pathway Mechanics <span class="bp-draft-tag">DRAFT</span></div>
        <div class="bp-narrative pb-avoid">
          <p><strong>HUD payment standard.</strong> PBV rents are set at the HUD-published Fair Market Rent (FMR) for the relevant bedroom type and metropolitan area, subject to PHA-specific payment standards (typically 90-110% of FMR). HUD pays the Housing Assistance Payment (HAP) directly to the property owner. Tenant contribution is capped at 30% of adjusted gross income, with HUD funding the gap.</p>
          <p><strong>Voucher portability and continuity.</strong> Under the PBV structure, the voucher attaches to the unit, not the tenant. If a tenant vacates, the unit remains voucher-eligible and the next eligible veteran tenant resumes the HAP stream. This eliminates the unit-by-unit re-lease friction characteristic of tenant-based vouchers and produces a stable, occupancy-resilient revenue floor.</p>
          <p><strong>Subsidy floor protection.</strong> HAP contracts are typically structured for an initial 15-year term with renewal options through year 20. Annual rent adjustments follow the published HUD AAF (Annual Adjustment Factor) for the metropolitan area, providing inflation-linked revenue growth. Contract default risk is limited to legislative authorization, with the program operating continuously since 2008.</p>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 3: VOUCHER ECONOMICS + RENT STACK ────────────────────
  function _page3(deal, R, inputs, market, h, pageNum, totalPages) {
    const um = (typeof unitMix === 'object' && Array.isArray(unitMix)) ? unitMix : [];
    const fmr = market && market.fmr;
    const census = market && market.census;
    const mktRent = census ? census.median_rent : null;
    const uplift = _computeVoucherUplift(R, inputs, market);

    function _fmrFor(bed) {
      if (!fmr) return null;
      const b = String(bed || '').toLowerCase();
      if (b.includes('studio') || b === '0br') return fmr.studio || fmr.br1;
      if (b === '1br') return fmr.br1;
      if (b === '2br') return fmr.br2;
      if (b === '3br') return fmr.br3;
      if (b === '4br' || b.includes('4')) return fmr.br4;
      return fmr.br2;
    }

    // Tenant contribution assumption: 30% of HUD-adjusted income.
    // For VASH target population (homeless veterans), incomes are
    // typically very low; HUD funds 100% of FMR in most cases.
    // For modeling, present as a range with a conservative default.
    const tenantSharePct = 0.10; // 10% tenant, 90% HUD HAP (conservative)
    const hudSharePct = 1 - tenantSharePct;

    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Voucher Economics · Rent Stack')}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>FMR vs ACS Market Rent by Bedroom</div>
        ${(!fmr || !census) ? `
          <div class="print-callout pb-avoid">
            <div class="pc-title">Market Data Not Loaded</div>
            HUD FMR and ACS median rent data have not been fetched for this deal. Open the Market panel in the app, enter the subject ZIP, and fetch census + FMR data to populate the voucher economics math on this page.
          </div>
        ` : `
          <table class="print-table pb-avoid valor-rent-stack">
            <thead>
              <tr>
                <th>Bedroom Type</th>
                <th class="num">HUD FMR (Monthly)</th>
                <th class="num">ACS Median Rent</th>
                <th class="num">Monthly Uplift</th>
                <th class="num">Uplift %</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Studio / Efficiency</td>
                <td class="num">${h.fmtMoney(fmr.studio)}</td>
                <td class="num">${h.fmtMoney(mktRent)}</td>
                <td class="num">${h.fmtMoney(fmr.studio - mktRent)}</td>
                <td class="num">${h.fmtPct((fmr.studio - mktRent) / mktRent)}</td>
              </tr>
              <tr>
                <td>1-Bedroom</td>
                <td class="num">${h.fmtMoney(fmr.br1)}</td>
                <td class="num">${h.fmtMoney(mktRent)}</td>
                <td class="num">${h.fmtMoney(fmr.br1 - mktRent)}</td>
                <td class="num">${h.fmtPct((fmr.br1 - mktRent) / mktRent)}</td>
              </tr>
              <tr>
                <td>2-Bedroom</td>
                <td class="num">${h.fmtMoney(fmr.br2)}</td>
                <td class="num">${h.fmtMoney(mktRent)}</td>
                <td class="num">${h.fmtMoney(fmr.br2 - mktRent)}</td>
                <td class="num">${h.fmtPct((fmr.br2 - mktRent) / mktRent)}</td>
              </tr>
              <tr>
                <td>3-Bedroom</td>
                <td class="num">${h.fmtMoney(fmr.br3)}</td>
                <td class="num">${h.fmtMoney(mktRent)}</td>
                <td class="num">${h.fmtMoney(fmr.br3 - mktRent)}</td>
                <td class="num">${h.fmtPct((fmr.br3 - mktRent) / mktRent)}</td>
              </tr>
              <tr>
                <td>4-Bedroom</td>
                <td class="num">${h.fmtMoney(fmr.br4)}</td>
                <td class="num">${h.fmtMoney(mktRent)}</td>
                <td class="num">${h.fmtMoney(fmr.br4 - mktRent)}</td>
                <td class="num">${h.fmtPct((fmr.br4 - mktRent) / mktRent)}</td>
              </tr>
            </tbody>
            <caption>ACS median rent is a single submarket figure; HUD FMR varies by bedroom type. Uplift is computed against the same ACS reference for comparability.</caption>
          </table>
        `}

        ${(um.length > 0 && fmr && mktRent) ? `
          <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Subject Unit Mix · Voucher Revenue Build</div>
          <table class="print-table pb-avoid">
            <thead>
              <tr>
                <th>Bed Type</th>
                <th class="num">Units</th>
                <th class="num">FMR</th>
                <th class="num">Monthly HAP / Unit</th>
                <th class="num">Monthly HAP</th>
                <th class="num">Annual HAP</th>
              </tr>
            </thead>
            <tbody>
              ${um.map(u => {
                const n = u.count || 0;
                const ff = _fmrFor(u.bed_type);
                const monthlyHAP = ff * hudSharePct;
                return `
                  <tr>
                    <td>${_esc((u.bed_type || '').toUpperCase())}</td>
                    <td class="num">${n}</td>
                    <td class="num">${h.fmtMoney(ff)}</td>
                    <td class="num">${h.fmtMoney(monthlyHAP)}</td>
                    <td class="num">${h.fmtMoney(n * monthlyHAP)}</td>
                    <td class="num">${h.fmtMoney(n * monthlyHAP * 12)}</td>
                  </tr>`;
              }).join('')}
              <tr class="totals">
                <td>Total</td>
                <td class="num">${um.reduce((acc, u) => acc + (u.count || 0), 0)}</td>
                <td></td>
                <td></td>
                <td class="num">${h.fmtMoney(um.reduce((acc, u) => acc + (u.count || 0) * _fmrFor(u.bed_type) * hudSharePct, 0))}</td>
                <td class="num">${h.fmtMoney(um.reduce((acc, u) => acc + (u.count || 0) * _fmrFor(u.bed_type) * hudSharePct * 12, 0))}</td>
              </tr>
            </tbody>
            <caption>Assumes ${h.fmtPct(hudSharePct, 0)} HUD HAP share and ${h.fmtPct(tenantSharePct, 0)} tenant contribution, reflecting VASH target population income profiles. Actual HAP/tenant split varies by PHA payment standard and household income at lease-up.</caption>
          </table>

          <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Comparison to Market-Rate Underwriting</div>
          <div class="print-list pb-avoid">
            <div class="pl-row"><span class="pl-lbl">Underwritten Market GPR (current model)</span><span class="pl-val">${h.fmtMoney(R.gpr_annual)}</span></div>
            <div class="pl-row"><span class="pl-lbl">PBV-Adjusted Annual HAP Revenue</span><span class="pl-val">${h.fmtMoney(um.reduce((acc, u) => acc + (u.count || 0) * _fmrFor(u.bed_type) * hudSharePct * 12, 0))}</span></div>
            <div class="pl-row"><span class="pl-lbl">PBV Annual Revenue Lift vs Market</span><span class="pl-val">${h.fmtMoney(um.reduce((acc, u) => acc + (u.count || 0) * _fmrFor(u.bed_type) * hudSharePct * 12, 0) - R.gpr_annual)}</span></div>
            <div class="pl-row"><span class="pl-lbl">HAP as % of Underwritten GPR</span><span class="pl-val">${h.fmtPct(um.reduce((acc, u) => acc + (u.count || 0) * _fmrFor(u.bed_type) * hudSharePct * 12, 0) / Math.max(1, R.gpr_annual))}</span></div>
          </div>
        ` : ''}

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 4: SWING-STATE CONTEXT + FOOTPRINT ───────────────────
  function _page4(deal, R, inputs, market, h, pageNum, totalPages) {
    const footprint = _footprintTier(inputs.state, inputs.city);
    const stUp = (inputs.state || '').toUpperCase();

    // Swing-state context narrative (mode-aware by footprint tier)
    let contextPara;
    if (footprint.tier === 'swing') {
      contextPara = `${_esc(inputs.state)} is one of the 2024 presidential election battleground states, placing the subject submarket within Valor's primary federal-policy-aligned footprint. Veteran housing and HUD-VASH program continuity are bipartisan policy priorities, and Valor's geographic concentration in these states positions the platform for engagement with both federal agencies and state housing finance authorities across administrations.`;
    } else if (footprint.tier === 'expanded') {
      contextPara = `Virginia sits in Valor's expanded footprint due to its substantial active-duty and veteran population, the concentration of federal agencies, and proximity to HUD/VA headquarters. Although not a 2024 battleground, Virginia's federal-services economy makes it a strategic operational state for veteran housing.`;
    } else if (footprint.tier === 'anchor') {
      contextPara = `Cleveland, Ohio is Valor's designated operational anchor - the geographic hub from which the platform manages portfolio operations across the swing-state footprint. While Ohio is not a 2024 battleground, Cleveland's affordable basis, deep multifamily inventory, and ASJP Group's established operating presence make it the logical execution headquarters. Cleveland-based assets are admitted as a documented exception to the swing-state mandate.`;
    } else {
      contextPara = `${_esc(inputs.state || 'The subject state')} is outside Valor's primary footprint. The deal-level economics may still pencil, but the strategic alignment with Valor's federal-policy thesis is weaker. Recommend IC review of whether this asset should be held in Valor or in a separate ASJP entity better aligned with the geography.`;
    }

    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Swing-State Footprint Context')}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Valor's Geographic Footprint</div>
        <div class="bp-narrative pb-avoid">
          <p>Valor concentrates acquisitions across the 2024 presidential election battleground states (Arizona, Georgia, Michigan, Nevada, North Carolina, Pennsylvania, Wisconsin), with an expanded footprint including Virginia and a documented operational anchor in Cleveland, Ohio. The geographic strategy aligns Valor's portfolio with federal-policy priority regions while preserving operational efficiency through the ASJP Group's established Cleveland operating platform.</p>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Footprint Tiers</div>
        <table class="print-table pb-avoid">
          <thead><tr><th>Tier</th><th>States</th><th>Strategic Role</th></tr></thead>
          <tbody>
            <tr class="${footprint.tier === 'swing' ? 'valor-row-active' : ''}">
              <td>Swing-State Battleground</td>
              <td>AZ, GA, MI, NV, NC, PA, WI</td>
              <td>Primary acquisition footprint; federal-policy alignment priority</td>
            </tr>
            <tr class="${footprint.tier === 'expanded' ? 'valor-row-active' : ''}">
              <td>Expanded Footprint</td>
              <td>VA</td>
              <td>Federal agency proximity; large veteran population concentration</td>
            </tr>
            <tr class="${footprint.tier === 'anchor' ? 'valor-row-active' : ''}">
              <td>Operational Anchor</td>
              <td>OH (Cleveland only)</td>
              <td>Portfolio operations hub; ASJP Group operating platform</td>
            </tr>
            <tr class="${footprint.tier === 'outside' ? 'valor-row-active' : ''}">
              <td>Outside Footprint</td>
              <td>All other states</td>
              <td>Held in separate ASJP entity; not eligible for Valor allocation</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Subject Deal Footprint Classification</div>
        <div class="valor-footprint-box valor-footprint-box-${footprint.tier} pb-avoid">
          <div class="valor-footprint-label">Classification</div>
          <div class="valor-footprint-tier">${_esc(footprint.label)}</div>
          <div class="valor-footprint-context">${contextPara}</div>
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 5: ASSET + SPONSOR + DISCLOSURES ─────────────────────
  function _page5(deal, R, inputs, market, h, pageNum, totalPages) {
    const addrLine = _addressLine(deal, inputs);

    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Asset · Sponsor · Disclosures')}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Asset Summary</div>
        <div class="lender-twocol pb-avoid">
          <div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">Property Address</span><span class="pl-val">${_esc(addrLine || 'Not specified')}</span></div>
              <div class="pl-row"><span class="pl-lbl">Asset Type</span><span class="pl-val">${_esc(_assetTypeLabel(inputs.asset_type))}</span></div>
              ${R.total_unit_count > 0 ? `<div class="pl-row"><span class="pl-lbl">Unit Count</span><span class="pl-val">${R.total_unit_count}</span></div>` : ''}
              ${R.subject_area_sf > 0 ? `<div class="pl-row"><span class="pl-lbl">Building Area</span><span class="pl-val">${Number(R.subject_area_sf).toLocaleString()} SF</span></div>` : ''}
              <div class="pl-row"><span class="pl-lbl">Purchase Price</span><span class="pl-val">${h.fmtMoney(inputs.purchase_price)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Capex Budget</span><span class="pl-val">${h.fmtMoney(inputs.capex_budget)}</span></div>
              <div class="pl-row"><span class="pl-lbl">Total Project Cost</span><span class="pl-val">${h.fmtMoney(R.total_project_cost)}</span></div>
            </div>
          </div>
          ${market && market.cbsa_name ? `
          <div>
            <div class="print-list" style="grid-template-columns:1fr;gap:1pt 0">
              <div class="pl-row"><span class="pl-lbl">MSA</span><span class="pl-val">${_esc(market.cbsa_name)}</span></div>
              ${market.derived && market.derived.market_strength_grade ? `<div class="pl-row"><span class="pl-lbl">Market Grade</span><span class="pl-val">Grade ${_esc(market.derived.market_strength_grade)} (${Math.round(market.derived.market_strength_score)}/100)</span></div>` : ''}
              ${market.census && market.census.median_household_income != null ? `<div class="pl-row"><span class="pl-lbl">Median HH Income</span><span class="pl-val">${h.fmtMoney(market.census.median_household_income)}</span></div>` : ''}
              ${market.census && market.census.poverty_rate != null ? `<div class="pl-row"><span class="pl-lbl">Poverty Rate</span><span class="pl-val">${h.fmtPct(market.census.poverty_rate)}</span></div>` : ''}
              ${market.census && market.census.rental_vacancy_rate != null ? `<div class="pl-row"><span class="pl-lbl">Rental Vacancy</span><span class="pl-val">${h.fmtPct(market.census.rental_vacancy_rate)}</span></div>` : ''}
              ${market.census && market.census.unemployment_rate != null ? `<div class="pl-row"><span class="pl-lbl">Unemployment</span><span class="pl-val">${h.fmtPct(market.census.unemployment_rate)}</span></div>` : ''}
            </div>
          </div>
          ` : '<div></div>'}
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Sponsor</div>
        <div class="bp-sponsor valor-sponsor pb-avoid">
          <div class="bp-sponsor-name">Valor Housing Partners</div>
          <div class="bp-sponsor-sub">Institutional Veteran Housing Platform · A Subsidiary of ASJP Group</div>
          <div class="bp-sponsor-contact">
            <div><span class="bp-sponsor-lbl">Office</span> Cleveland, Ohio (operational anchor)</div>
            <div><span class="bp-sponsor-lbl">Web</span> Valor brand standalone; ASJP Group parent at asjpgroup.com</div>
          </div>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Disclosures</div>
        <div class="bp-disclaimer">
          ${typeof disclaimersForValorPackage === 'function' ? disclaimersForValorPackage('Valor Housing Partners') : ''}
        </div>

        ${_footer(pageNum, totalPages)}
      </div>`;
  }


  // ── PAGE 6: GOVERNANCE STRUCTURE ──────────────────────────────
  function _page6(deal, R, inputs, market, h, pageNum, totalPages) {
    return `
      <div class="print-page print-page-compact valor-page">
        ${_header(h, 'Governance Structure')}

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Leadership Team</div>
        <table class="print-table pb-avoid valor-leadership-table">
          <thead><tr><th>Role</th><th>Principal</th><th>Mandate</th></tr></thead>
          <tbody>
            <tr>
              <td>CEO &amp; Chief Investment Officer</td>
              <td>Jonathan Paz</td>
              <td>Strategic direction, capital allocation, institutional capital relationships</td>
            </tr>
            <tr>
              <td>COO &amp; Chief Asset Officer</td>
              <td>Alexei Semenov</td>
              <td>Portfolio operations, asset management, renovation execution oversight</td>
            </tr>
          </tbody>
        </table>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Governance Structure (Option A)</div>
        <div class="bp-narrative pb-avoid">
          <p><strong>Valor Advisory Board.</strong> Independent advisory body providing strategic oversight on capital deployment, HUD/VA policy positioning, and Valor's role within the broader ASJP Group portfolio. The Advisory Board has consultative authority on platform-level decisions but does not have voting authority over fund-level capital commitments.</p>
          <p><strong>ASJP Holding Company Board with Fiduciary Duty.</strong> The ASJP Group parent entity board carries fiduciary responsibility for Valor's institutional capital partners, including investor reporting, audit oversight, and conflicts management between the Valor platform and other ASJP business lines (KPI Capital Partners institutional multifamily, ASJP LLC Cleveland portfolio).</p>
          <p><strong>ASJP-KPI Cooperation Framework.</strong> The verbal cooperation arrangement between ASJP and KPI Capital Partners is structured at a 15% allocation floor with sliding-scale terms, reflecting the natural deal flow overlap on value-add multifamily acquisitions. Formal documentation of the cooperation framework is in progress and is identified as a Phase 0 critical-path item for institutional capital readiness.</p>
        </div>

        <div class="print-section pb-avoid"><span class="ps-accent valor-accent"></span>Capital Pathways</div>
        <div class="lender-twocol pb-avoid">
          <div>
            <div class="valor-pathway-card valor-pathway-base pb-avoid">
              <div class="valor-pathway-label">Base Case</div>
              <div class="valor-pathway-title">Institutional LP Capital</div>
              <div class="valor-pathway-desc">Traditional institutional limited partner capital from family offices, endowments, foundations, and pension funds aligned with affordable housing impact mandates. Primary path to scale.</div>
            </div>
          </div>
          <div>
            <div class="valor-pathway-card valor-pathway-parallel pb-avoid">
              <div class="valor-pathway-label">Parallel Workstream</div>
              <div class="valor-pathway-title">Sovereign Capital Pathway</div>
              <div class="valor-pathway-desc">Engagement with Compass Capital Management and the Qatar Investment Authority is being pursued as a separate parallel workstream. Treated as base-case-excluded in the main Valor financial model; if materialized, represents accelerated scaling capital. Thomas Jung Ho Park's role, if pursued, is scoped as Capital Introducer and Non-Voting Observer only.</div>
            </div>
          </div>
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
  function _toneGlyph(tone) {
    if (tone === 'bad')  return '<span class="pk-glyph pk-glyph-bad">▼ </span>';
    if (tone === 'warn') return '<span class="pk-glyph pk-glyph-warn">◆ </span>';
    if (tone === 'good') return '<span class="pk-glyph pk-glyph-good">▲ </span>';
    return '';
  }


  // ── MAIN ENTRY ────────────────────────────────────────────────
  function renderReport_valor_pbv(deal, R, inputs, market, helpers) {
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

  window.renderReport_hud_vash_package = renderReport_valor_pbv;
  window.renderReport_valor_pbv = renderReport_valor_pbv;

})();
