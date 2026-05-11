// ════════════════════════════════════════════════════════════════
// FOUNDRY - Market Data Module (M4)
// ════════════════════════════════════════════════════════════════
//
// Client-side wrapper for the kpi-parser worker's /census, /hud-fmr,
// and /resolve-cbsa routes. Manages loading state and writes parsed
// data into the global `marketAnalysis` object.
//
// State shape on marketAnalysis after a successful fetch:
//
//   {
//     zip:            '44103',
//     cbsa:           '17460',
//     cbsa_name:      'Cleveland-Elyria, OH',
//     year_acs:       2024,
//     year_fmr:       2025,
//     census:         { ...25 fields per ACS_VARS },
//     fmr:            { studio, 1br, 2br, 3br, 4br, smallarea },
//     fmr_by_zip:     { ...optional, populated when smallarea=true },
//     derived:        { rent_to_income_ratio, affordability_index,
//                       market_strength_score, market_strength_grade },
//     fetched_at:     '2026-05-11T22:00:00Z',
//     cached_census:  bool,
//     cached_fmr:     bool,
//     fetch_status:   'idle' | 'loading' | 'success' | 'error',
//     fetch_error:    string | null
//   }
//
// Engine.js reads `marketAnalysis.derived.market_strength_score` to
// surface in the KPI tile and to feed the Risk Register auto-flags.
// ════════════════════════════════════════════════════════════════


const WORKER_BASE = 'https://kpi-parser.jonpaz305.workers.dev';


// ── HARDCODED INSTITUTIONAL THRESHOLDS (per Jonathan's direction) ──
// These drive both the Market Strength Score weights and the Risk
// Register auto-flag thresholds. Not user-editable in v1.
const MARKET_THRESHOLDS = {
  // Vacancy: rental_vacancy_rate (combined homeowner + rental for safety)
  vacancy_low:        0.05,   // green if <= 5%
  vacancy_mid:        0.10,   // gold if <= 10%, red if > 10%
  // Unemployment
  unemployment_low:   0.05,   // green if <= 5%
  unemployment_mid:   0.10,   // gold if <= 10%, red if > 10%
  // Poverty
  poverty_low:        0.15,   // green if <= 15%
  poverty_mid:        0.25,   // gold if <= 25%, red if > 25%
  // Rent-to-income: median_rent * 12 / median_income
  rent_income_low:    0.30,   // healthy if <= 30%
  rent_income_mid:    0.40,   // strained if <= 40%, severely cost-burdened if > 40%
  // Bachelor's+ (proxy for area human capital / wage growth potential)
  edu_high:           0.40,   // green if >= 40%
  edu_mid:            0.20,   // gold if >= 20%, red if < 20%
  // Owner-occupancy (stability proxy; lower in target submarkets but extremes signal risk)
  owner_low:          0.30,   // gold if < 30% (heavily renter market, more turnover)
  owner_high:         0.85,   // gold if > 85% (low rental demand)
  // Median household income (absolute floor for institutional consideration)
  income_floor:       30000,
  income_strong:      60000
};


// ── HELPERS ─────────────────────────────────────────────────────

function _setMarketStatus(status, error) {
  marketAnalysis.fetch_status = status;
  if (error !== undefined) marketAnalysis.fetch_error = error;
}

async function _postWorker(route, body) {
  const resp = await fetch(`${WORKER_BASE}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json.error || `Worker ${route} returned ${resp.status}`);
  }
  return json;
}


// ── MAIN: FETCH MARKET DATA FOR A ZIP ───────────────────────────
// Resolves zip → cbsa, then fetches census + FMR in parallel. Writes
// everything into marketAnalysis. Idempotent: re-running uses cache.
async function fetchMarketData(zip, opts) {
  opts = opts || {};
  const yearAcs = opts.yearAcs || 2024;
  const yearFmr = opts.yearFmr || 2025;

  if (!/^\d{5}$/.test(String(zip || ''))) {
    _setMarketStatus('error', 'Invalid zip code');
    renderMarketPage();
    return null;
  }

  _setMarketStatus('loading', null);
  renderMarketPage();

  try {
    // Step 1: Resolve CBSA. If marketAnalysis already has a CBSA for
    // this zip, skip; otherwise hit /resolve-cbsa.
    let cbsa = marketAnalysis.cbsa;
    let cbsa_name = marketAnalysis.cbsa_name;
    if (!cbsa || marketAnalysis.zip !== zip) {
      const cbsaResp = await _postWorker('/resolve-cbsa', { zip });
      cbsa = cbsaResp.cbsa;
      cbsa_name = cbsaResp.cbsa_name;
    }
    if (!cbsa) {
      throw new Error('Could not resolve CBSA for zip');
    }

    // Step 2: Parallel fetch census + FMR
    const [censusResp, fmrResp] = await Promise.all([
      _postWorker('/census',  { zip, year: yearAcs }),
      _postWorker('/hud-fmr', { cbsa, year: yearFmr })
    ]);

    // Step 3: Normalize FMR (extract subject-zip row if smallarea)
    const fmrData = _normalizeFmr(fmrResp.data, fmrResp.smallarea, zip);

    // Step 4: Assemble marketAnalysis
    marketAnalysis.zip           = zip;
    marketAnalysis.cbsa          = cbsa;
    marketAnalysis.cbsa_name     = cbsa_name;
    marketAnalysis.year_acs      = yearAcs;
    marketAnalysis.year_fmr      = yearFmr;
    marketAnalysis.census        = censusResp.data;
    marketAnalysis.fmr           = fmrData.fmr;
    marketAnalysis.fmr_by_zip    = fmrData.fmr_by_zip;
    marketAnalysis.fmr_smallarea = fmrResp.smallarea;
    marketAnalysis.cached_census = censusResp.cached;
    marketAnalysis.cached_fmr    = fmrResp.cached;
    marketAnalysis.fetched_at    = new Date().toISOString();
    marketAnalysis.derived       = computeMarketDerived(censusResp.data, fmrData.fmr);

    _setMarketStatus('success', null);

    // Persist to deal record
    autosave('market_analysis');

    // Update dashboard + market page
    if (typeof recompute === 'function') recompute();
    updateDashboard();
    renderMarketPage();

    return marketAnalysis;
  } catch (err) {
    _setMarketStatus('error', err.message || String(err));
    renderMarketPage();
    return null;
  }
}


// ── NORMALIZE FMR RESPONSE ──────────────────────────────────────
// HUD returns either:
//   - smallarea=true: array of per-zip entries, each with FMR levels
//   - smallarea=false: a single MSA-level object
// We extract the subject zip's row if smallarea, otherwise use MSA-level.
function _normalizeFmr(data, smallarea, zip) {
  if (smallarea && Array.isArray(data)) {
    // Find the subject zip
    const match = data.find(d => String(d.zip_code || d.zip || '').padStart(5, '0') === zip);
    const fmr_by_zip = {};
    for (const row of data) {
      const z = String(row.zip_code || row.zip || '').padStart(5, '0');
      fmr_by_zip[z] = _extractFmrLevels(row);
    }
    return {
      fmr: match ? _extractFmrLevels(match) : null,
      fmr_by_zip
    };
  }
  // MSA-level (single object)
  return {
    fmr: _extractFmrLevels(data),
    fmr_by_zip: null
  };
}

function _extractFmrLevels(row) {
  if (!row) return null;
  // HUD field names: Efficiency, One-Bedroom, Two-Bedroom, etc.
  // Or in some response shapes: fmr_0, fmr_1, ...
  return {
    studio: _firstNum(row, ['Efficiency', 'efficiency', 'fmr_0', 'fmr0']),
    br1:    _firstNum(row, ['One-Bedroom', 'one_bedroom', 'fmr_1', 'fmr1']),
    br2:    _firstNum(row, ['Two-Bedroom', 'two_bedroom', 'fmr_2', 'fmr2']),
    br3:    _firstNum(row, ['Three-Bedroom', 'three_bedroom', 'fmr_3', 'fmr3']),
    br4:    _firstNum(row, ['Four-Bedroom', 'four_bedroom', 'fmr_4', 'fmr4'])
  };
}

function _firstNum(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') {
      const n = Number(obj[k]);
      if (isFinite(n)) return n;
    }
  }
  return null;
}


// ── DERIVED METRICS + MARKET STRENGTH SCORE ─────────────────────
// 0-100 composite score. Higher = stronger market. Weighted across
// 6 dimensions. Grade is an A-F mapping for headline display.
//
// Weights (sum = 100):
//   Vacancy            20  (renter market health)
//   Unemployment       18  (income stability)
//   Median Income      15  (purchasing power)
//   Rent-to-Income     15  (affordability headroom)
//   Education          12  (wage growth potential)
//   Poverty            10  (downside risk)
//   Owner-occupancy    10  (market stability balance)
function computeMarketDerived(census, fmr) {
  if (!census) return {};

  const median_rent_annual = (census.median_rent || 0) * 12;
  const rent_to_income_ratio = census.median_household_income > 0
    ? median_rent_annual / census.median_household_income
    : null;
  const affordability_index = census.median_home_value > 0
    ? (census.median_household_income || 0) / census.median_home_value
    : null;

  // FMR vs market rent comparison (informational)
  const fmr_2br_vs_market = (fmr && fmr.br2 && census.median_rent)
    ? (fmr.br2 - census.median_rent) / census.median_rent
    : null;

  // Component scores 0-100
  const sVacancy   = _scoreVacancy(census.rental_vacancy_rate);
  const sUnemp     = _scoreInverse(census.unemployment_rate, MARKET_THRESHOLDS.unemployment_low, MARKET_THRESHOLDS.unemployment_mid);
  const sIncome    = _scoreIncome(census.median_household_income);
  const sRentInc   = rent_to_income_ratio != null
    ? _scoreInverse(rent_to_income_ratio, MARKET_THRESHOLDS.rent_income_low, MARKET_THRESHOLDS.rent_income_mid)
    : 50;
  const sEdu       = _scoreDirect(census.bachelors_or_higher_pct, MARKET_THRESHOLDS.edu_mid, MARKET_THRESHOLDS.edu_high);
  const sPoverty   = _scoreInverse(census.poverty_rate, MARKET_THRESHOLDS.poverty_low, MARKET_THRESHOLDS.poverty_mid);
  const sOwner     = _scoreOwnerBalance(census.owner_occupied_pct);

  const score = (
    sVacancy * 0.20 +
    sUnemp   * 0.18 +
    sIncome  * 0.15 +
    sRentInc * 0.15 +
    sEdu     * 0.12 +
    sPoverty * 0.10 +
    sOwner   * 0.10
  );

  return {
    rent_to_income_ratio,
    affordability_index,
    fmr_2br_vs_market,
    median_rent_annual,
    component_scores: {
      vacancy: sVacancy,
      unemployment: sUnemp,
      income: sIncome,
      rent_to_income: sRentInc,
      education: sEdu,
      poverty: sPoverty,
      owner_balance: sOwner
    },
    market_strength_score: Math.round(score),
    market_strength_grade: _scoreToGrade(score)
  };
}

function _scoreVacancy(rate) {
  if (rate == null) return 50;
  if (rate <= 0) return 50;                            // suspicious zero
  if (rate <= MARKET_THRESHOLDS.vacancy_low) return 95;
  if (rate <= MARKET_THRESHOLDS.vacancy_mid) {
    // Linear from 95 → 60 between low and mid
    const t = (rate - MARKET_THRESHOLDS.vacancy_low) / (MARKET_THRESHOLDS.vacancy_mid - MARKET_THRESHOLDS.vacancy_low);
    return 95 - t * 35;
  }
  // Above mid: linear from 60 → 20 between mid and 2× mid
  const t = Math.min(1, (rate - MARKET_THRESHOLDS.vacancy_mid) / MARKET_THRESHOLDS.vacancy_mid);
  return 60 - t * 40;
}

// Generic "lower is better" scorer: returns 95 at low, 60 at mid, 20 at 2× mid
function _scoreInverse(value, low, mid) {
  if (value == null) return 50;
  if (value <= low) return 95;
  if (value <= mid) {
    const t = (value - low) / (mid - low);
    return 95 - t * 35;
  }
  const t = Math.min(1, (value - mid) / mid);
  return 60 - t * 40;
}

// Generic "higher is better" scorer
function _scoreDirect(value, mid, high) {
  if (value == null) return 50;
  if (value >= high) return 95;
  if (value >= mid) {
    const t = (value - mid) / (high - mid);
    return 60 + t * 35;
  }
  const t = Math.max(0, value / mid);
  return 20 + t * 40;
}

function _scoreIncome(income) {
  if (!income || income <= 0) return 30;
  if (income >= MARKET_THRESHOLDS.income_strong) {
    // Linear bonus above 60k up to 120k
    const t = Math.min(1, (income - MARKET_THRESHOLDS.income_strong) / MARKET_THRESHOLDS.income_strong);
    return 80 + t * 15;
  }
  if (income >= MARKET_THRESHOLDS.income_floor) {
    const t = (income - MARKET_THRESHOLDS.income_floor) / (MARKET_THRESHOLDS.income_strong - MARKET_THRESHOLDS.income_floor);
    return 50 + t * 30;
  }
  // Below floor: linear 50 → 20
  const t = Math.max(0, income / MARKET_THRESHOLDS.income_floor);
  return 20 + t * 30;
}

function _scoreOwnerBalance(owner) {
  if (owner == null) return 50;
  // Best at 50-70% owner-occupied (balanced market with rental demand)
  if (owner >= 0.50 && owner <= 0.70) return 95;
  if (owner < MARKET_THRESHOLDS.owner_low) {
    // Very renter-heavy
    const t = owner / MARKET_THRESHOLDS.owner_low;
    return 50 + t * 25;  // 50-75 range
  }
  if (owner > MARKET_THRESHOLDS.owner_high) {
    // Very owner-heavy (low rental demand)
    const over = owner - MARKET_THRESHOLDS.owner_high;
    return Math.max(40, 70 - over * 200);
  }
  // Between 30-50 or 70-85: still good
  return 75;
}

function _scoreToGrade(score) {
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 55) return 'C+';
  if (score >= 45) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}


// ── RISK FLAGS FROM MARKET DATA ─────────────────────────────────
// Called from the engine to inject market risks into the Risk
// Register. Returns an array of {severity, category, title, detail}.
function computeMarketRisks(census, derived) {
  const risks = [];
  if (!census) return risks;

  if (census.rental_vacancy_rate != null && census.rental_vacancy_rate > MARKET_THRESHOLDS.vacancy_mid) {
    risks.push({
      severity: 'high',
      category: 'market',
      title: 'Elevated rental vacancy',
      detail: `Rental vacancy ${(census.rental_vacancy_rate * 100).toFixed(1)}% exceeds the ${(MARKET_THRESHOLDS.vacancy_mid * 100).toFixed(0)}% institutional threshold. Stabilization timeline at risk.`
    });
  } else if (census.rental_vacancy_rate != null && census.rental_vacancy_rate > MARKET_THRESHOLDS.vacancy_low) {
    risks.push({
      severity: 'medium',
      category: 'market',
      title: 'Moderate rental vacancy',
      detail: `Rental vacancy ${(census.rental_vacancy_rate * 100).toFixed(1)}% is above the ${(MARKET_THRESHOLDS.vacancy_low * 100).toFixed(0)}% comfort threshold but below crisis levels.`
    });
  }

  if (census.unemployment_rate != null && census.unemployment_rate > MARKET_THRESHOLDS.unemployment_mid) {
    risks.push({
      severity: 'high',
      category: 'market',
      title: 'Elevated unemployment',
      detail: `Local unemployment ${(census.unemployment_rate * 100).toFixed(1)}% exceeds the ${(MARKET_THRESHOLDS.unemployment_mid * 100).toFixed(0)}% threshold. Tenant payment capacity at risk.`
    });
  }

  if (census.poverty_rate != null && census.poverty_rate > MARKET_THRESHOLDS.poverty_mid) {
    risks.push({
      severity: 'medium',
      category: 'market',
      title: 'Elevated poverty rate',
      detail: `Area poverty rate ${(census.poverty_rate * 100).toFixed(1)}% exceeds ${(MARKET_THRESHOLDS.poverty_mid * 100).toFixed(0)}%. Underwrite turnover and collection assumptions conservatively.`
    });
  }

  if (derived && derived.rent_to_income_ratio != null && derived.rent_to_income_ratio > MARKET_THRESHOLDS.rent_income_mid) {
    risks.push({
      severity: 'medium',
      category: 'market',
      title: 'Cost-burdened tenant base',
      detail: `Rent-to-income ratio ${(derived.rent_to_income_ratio * 100).toFixed(1)}% exceeds ${(MARKET_THRESHOLDS.rent_income_mid * 100).toFixed(0)}%. Rent growth assumptions should be conservative; expect higher delinquency.`
    });
  }

  if (census.median_household_income != null && census.median_household_income < MARKET_THRESHOLDS.income_floor) {
    risks.push({
      severity: 'high',
      category: 'market',
      title: 'Median income below institutional floor',
      detail: `Median household income $${census.median_household_income.toLocaleString()} is below the $${MARKET_THRESHOLDS.income_floor.toLocaleString()} institutional floor. Limits rent growth ceiling and LP appetite.`
    });
  }

  if (derived && derived.market_strength_score != null && derived.market_strength_score < 45) {
    risks.push({
      severity: 'high',
      category: 'market',
      title: 'Weak composite market score',
      detail: `Market Strength Score ${derived.market_strength_score} (grade ${derived.market_strength_grade}) is below institutional threshold. Consider repositioning thesis or rejecting the deal.`
    });
  }

  return risks;
}


// ── MARKET PAGE RENDER ──────────────────────────────────────────
function renderMarketPage() {
  const wrap = document.getElementById('section-market-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = `<div class="panel"><div class="empty"><div class="empty-icon">🗺</div><div class="empty-title">No deal selected</div></div></div>`;
    return;
  }

  const zip = inputs.zip;
  const ma  = marketAnalysis || {};
  const status = ma.fetch_status || 'idle';
  const hasData = ma.census && status === 'success';

  // Header / fetch controls
  const header = `
    <div class="panel">
      <div class="panel-title">Market Analysis
        <span class="panel-sub">Census ACS5 demographics, HUD FMR rents, and composite Market Strength Score.</span>
      </div>
      <div class="g3" style="margin-bottom:1rem;align-items:end">
        <div class="field"><label>Zip code</label>
          <input value="${escapeHtml(zip || '')}" oninput="onInputChange('zip', this.value)" maxlength="5" placeholder="44103"/>
          <div class="hint">Subject property zip. ACS5 returns ZCTA-level data.</div>
        </div>
        <div class="field"><label>ACS year</label>
          <select onchange="onInputChange('market_year_acs', this.value)">
            <option value="2024" ${(ma.year_acs == 2024 || !ma.year_acs) ? 'selected' : ''}>2024 (latest)</option>
            <option value="2023" ${ma.year_acs == 2023 ? 'selected' : ''}>2023</option>
            <option value="2022" ${ma.year_acs == 2022 ? 'selected' : ''}>2022</option>
            <option value="2021" ${ma.year_acs == 2021 ? 'selected' : ''}>2021</option>
          </select>
        </div>
        <div class="field">
          <button class="btn btn-gold" onclick="fetchMarketDataFromUI()" ${!zip || status === 'loading' ? 'disabled' : ''}>
            ${status === 'loading' ? 'Loading...' : (hasData ? 'Refresh market data' : 'Fetch market data')}
          </button>
          <div class="hint">${ma.fetched_at ? 'Last fetched: ' + new Date(ma.fetched_at).toLocaleString() : 'Not yet fetched'}</div>
        </div>
      </div>
      ${status === 'error' ? `<div class="sbar s-bad" style="margin-bottom:1rem">${escapeHtml(ma.fetch_error || 'Fetch failed')}</div>` : ''}
      ${status === 'loading' ? `<div class="sbar s-info" style="margin-bottom:1rem">Calling Census ACS and HUD FMR... typically 1-3 seconds.</div>` : ''}
      ${hasData ? `<div class="sbar s-ok" style="margin-bottom:0">Data sourced from ${ma.cached_census ? 'cache' : 'live'} Census ACS ${ma.year_acs}${ma.cached_fmr ? ' and cached HUD FMR' : ' and live HUD FMR'} ${ma.year_fmr} for ${ma.cbsa_name || 'CBSA ' + ma.cbsa}.</div>` : ''}
    </div>
  `;

  if (!hasData) {
    wrap.innerHTML = header;
    return;
  }

  // ── Render full data view ──
  wrap.innerHTML = header
    + renderMarketStrengthPanel(ma)
    + renderDemographicsPanel(ma.census)
    + renderHousingStockPanel(ma.census)
    + renderFmrPanel(ma)
    + renderEconomicPanel(ma.census, ma.derived);
}


function renderMarketStrengthPanel(ma) {
  const d = ma.derived || {};
  const score = d.market_strength_score;
  const grade = d.market_strength_grade || '-';
  const cs = d.component_scores || {};
  const gradeColor = score >= 75 ? '#3fb950' : score >= 55 ? 'var(--gold-lt)' : score >= 35 ? 'var(--gold)' : '#f85e5e';

  function bar(label, val) {
    const v = val != null && isFinite(val) ? val : 0;
    const color = v >= 75 ? '#3fb950' : v >= 55 ? 'var(--gold-lt)' : v >= 35 ? 'var(--gold)' : '#f85e5e';
    return `
      <div class="msc-bar-row">
        <div class="msc-bar-label">${label}</div>
        <div class="msc-bar-track"><div class="msc-bar-fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></div></div>
        <div class="msc-bar-val">${Math.round(v)}</div>
      </div>
    `;
  }

  return `
    <div class="panel">
      <div class="panel-title">Market Strength Score
        <span class="panel-sub">Composite 0-100 score across 7 weighted institutional metrics.</span>
      </div>
      <div class="msc-wrap">
        <div class="msc-grade-card">
          <div class="msc-grade-label">Grade</div>
          <div class="msc-grade-value" style="color:${gradeColor}">${grade}</div>
          <div class="msc-grade-score">${score != null ? score : '-'} / 100</div>
        </div>
        <div class="msc-bars">
          ${bar('Vacancy (20%)',         cs.vacancy)}
          ${bar('Unemployment (18%)',    cs.unemployment)}
          ${bar('Median Income (15%)',   cs.income)}
          ${bar('Rent-to-Income (15%)',  cs.rent_to_income)}
          ${bar('Education (12%)',       cs.education)}
          ${bar('Poverty (10%)',         cs.poverty)}
          ${bar('Owner Balance (10%)',   cs.owner_balance)}
        </div>
      </div>
    </div>
  `;
}


function renderDemographicsPanel(c) {
  function row(label, val, sub) {
    return `<div class="data-row"><span class="data-row-label">${label}</span><span class="data-row-val">${val}</span>${sub ? `<span class="data-row-sub">${sub}</span>` : ''}</div>`;
  }
  return `
    <div class="panel">
      <div class="panel-title">Demographics
        <span class="panel-sub">Population, age, education from ACS5 Profile.</span>
      </div>
      <div class="data-grid-2">
        ${row('Total population',         c.population_total != null ? fN(c.population_total) : '-')}
        ${row('Median age',               c.median_age != null ? c.median_age.toFixed(1) + ' yrs' : '-')}
        ${row('Avg household size',       c.avg_household_size != null ? c.avg_household_size.toFixed(2) : '-')}
        ${row('Family households',        c.family_households_pct != null ? fP(c.family_households_pct) : '-')}
        ${row('Bachelor\u2019s+ education', c.bachelors_or_higher_pct != null ? fP(c.bachelors_or_higher_pct) : '-')}
        ${row('Labor force participation', c.labor_force_pct != null ? fP(c.labor_force_pct) : '-')}
      </div>
    </div>
  `;
}


function renderHousingStockPanel(c) {
  function row(label, val, flag) {
    const flagHtml = flag ? `<span class="comp-flag-pill ${flag.cls}" style="margin-left:8px">${flag.text}</span>` : '';
    return `<div class="data-row"><span class="data-row-label">${label}</span><span class="data-row-val">${val}${flagHtml}</span></div>`;
  }
  const vacancyFlag = c.rental_vacancy_rate != null
    ? (c.rental_vacancy_rate <= MARKET_THRESHOLDS.vacancy_low ? { text: 'tight', cls: '' }
        : c.rental_vacancy_rate <= MARKET_THRESHOLDS.vacancy_mid ? { text: 'moderate', cls: '' }
        : { text: 'elevated', cls: '' })
    : null;
  const ownerFlag = c.owner_occupied_pct != null
    ? (c.owner_occupied_pct >= 0.50 && c.owner_occupied_pct <= 0.70 ? { text: 'balanced', cls: 'comp-flag-reno' }
        : null)
    : null;
  return `
    <div class="panel">
      <div class="panel-title">Housing Stock
        <span class="panel-sub">Tenure mix, vacancy, vintage, and ownership.</span>
      </div>
      <div class="data-grid-2">
        ${row('Total housing units',      c.housing_units_total != null ? fN(c.housing_units_total) : '-')}
        ${row('Occupied units',           c.occupied_units != null ? fN(c.occupied_units) : '-')}
        ${row('Owner-occupied %',         c.owner_occupied_pct != null ? fP(c.owner_occupied_pct) : '-', ownerFlag)}
        ${row('Renter-occupied %',        c.renter_occupied_pct != null ? fP(c.renter_occupied_pct) : '-')}
        ${row('Rental vacancy rate',      c.rental_vacancy_rate != null ? fP(c.rental_vacancy_rate) : '-', vacancyFlag)}
        ${row('Homeowner vacancy rate',   c.homeowner_vacancy_rate != null ? fP(c.homeowner_vacancy_rate) : '-')}
        ${row('Median home value',        c.median_home_value != null ? f$(c.median_home_value) : '-')}
        ${row('Median year built',        c.median_year_built != null ? c.median_year_built.toFixed(0) : '-')}
      </div>
    </div>
  `;
}


function renderFmrPanel(ma) {
  const f = ma.fmr || {};
  const c = ma.census || {};
  function row(label, val, sub) {
    return `<div class="data-row"><span class="data-row-label">${label}</span><span class="data-row-val">${val}</span>${sub ? `<span class="data-row-sub">${sub}</span>` : ''}</div>`;
  }
  const subtitle = ma.fmr_smallarea
    ? `Small Area FMR (zip-level) for ${ma.cbsa_name}, ${ma.year_fmr}.`
    : `MSA-level FMR for ${ma.cbsa_name}, ${ma.year_fmr}.`;
  return `
    <div class="panel">
      <div class="panel-title">HUD Fair Market Rents
        <span class="panel-sub">${subtitle}</span>
      </div>
      <div class="data-grid-2">
        ${row('Studio FMR',     f.studio != null ? f$(f.studio) : '-')}
        ${row('1BR FMR',        f.br1 != null ? f$(f.br1) : '-')}
        ${row('2BR FMR',        f.br2 != null ? f$(f.br2) : '-')}
        ${row('3BR FMR',        f.br3 != null ? f$(f.br3) : '-')}
        ${row('4BR FMR',        f.br4 != null ? f$(f.br4) : '-')}
        ${row('ACS median rent', c.median_rent != null ? f$(c.median_rent) : '-')}
      </div>
      ${ma.derived && ma.derived.fmr_2br_vs_market != null ? `
        <div class="sbar ${ma.derived.fmr_2br_vs_market > 0.10 ? 's-info' : 's-ok'}" style="margin-top:1rem">
          2BR FMR is ${ma.derived.fmr_2br_vs_market > 0 ? fP(Math.abs(ma.derived.fmr_2br_vs_market)) + ' above' : fP(Math.abs(ma.derived.fmr_2br_vs_market)) + ' below'} the ACS median rent. ${ma.derived.fmr_2br_vs_market > 0.10 ? 'Subsidy program rents would support higher in-place rents than market.' : 'Market rents track FMR closely.'}
        </div>
      ` : ''}
    </div>
  `;
}


function renderEconomicPanel(c, derived) {
  function row(label, val, sub) {
    return `<div class="data-row"><span class="data-row-label">${label}</span><span class="data-row-val">${val}</span>${sub ? `<span class="data-row-sub">${sub}</span>` : ''}</div>`;
  }
  return `
    <div class="panel">
      <div class="panel-title">Economic Indicators
        <span class="panel-sub">Income, employment, poverty, and derived affordability.</span>
      </div>
      <div class="data-grid-2">
        ${row('Median household income',  c.median_household_income != null ? f$(c.median_household_income) : '-')}
        ${row('Mean household income',    c.mean_household_income != null ? f$(c.mean_household_income) : '-')}
        ${row('Unemployment rate',        c.unemployment_rate != null ? fP(c.unemployment_rate) : '-')}
        ${row('Poverty rate',             c.poverty_rate != null ? fP(c.poverty_rate) : '-')}
        ${row('Rent-to-income ratio',     derived && derived.rent_to_income_ratio != null ? fP(derived.rent_to_income_ratio) : '-', derived && derived.rent_to_income_ratio > MARKET_THRESHOLDS.rent_income_mid ? 'cost-burdened' : '')}
        ${row('Affordability index',      derived && derived.affordability_index != null ? derived.affordability_index.toFixed(3) : '-', 'income ÷ home value')}
      </div>
    </div>
  `;
}


// ── UI HOOK FOR THE FETCH BUTTON ────────────────────────────────
function fetchMarketDataFromUI() {
  const zip = (inputs.zip || '').trim();
  if (!zip) {
    alert('Enter a zip code first.');
    return;
  }
  const yearAcs = parseInt(inputs.market_year_acs || 2024, 10);
  fetchMarketData(zip, { yearAcs });
}
