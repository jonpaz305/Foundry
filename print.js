// ════════════════════════════════════════════════════════════════
// FOUNDRY M6 - Print Pipeline
// ════════════════════════════════════════════════════════════════
//
// Browser-print to PDF. No server, no headless Chrome, no libraries.
//
// FLOW
//   1. User clicks a report card in the Reports section.
//   2. Foundry opens a new tab at:
//        <origin>/<index.html>#/print/<report-type>/<deal-id>
//   3. The new tab loads the normal app shell (which has Supabase JS).
//   4. On DOMContentLoaded, core.js boots Supabase, restores session
//      from localStorage, then checks for the print hash. If matched,
//      it calls into startPrintMode().
//   5. startPrintMode() hides the app shell, fetches the deal, hydrates
//      engine state, recomputes, sets document.title to the desired
//      PDF filename, renders the report HTML, and fires window.print().
//
// ROUTES
//   #/print/deal-snapshot/<deal-id>      Internal 1-page snapshot
//   #/print/brrrr-package/<deal-id>      BRRRR lender/equity package
//   #/print/ff-package/<deal-id>         F&F single-equity-LP package
//   #/print/internal-memo/<deal-id>      Internal deal memo
//   #/print/lender-package/<deal-id>     Bridge/agency lender package
//   #/print/hud-vash-package/<deal-id>   HUD-VASH PBV (Valor) package
//
// FILENAME CONVENTION
//   Foundry_<Mode>_<DealName>_<ReportType>_<YYYY-MM-DD>.pdf
//   ...where <Mode> is BRRRR or FixAndFlip and <DealName> is the deal
//   name with whitespace and unsafe characters stripped.
//
// EACH REPORT MODULE
//   reports/<report-type>.js exports a global function:
//       window.renderReport_<report_type>(deal, R, inputs, market, helpers)
//   The function returns an HTML string. The harness wraps it in the
//   print shell, sets the title, and calls window.print().
//
// IMPLEMENTATION NOTE
//   M6.1 ships the foundation only. None of the six report modules
//   exist yet. The harness will surface a friendly placeholder if the
//   render function isn't loaded yet.
// ════════════════════════════════════════════════════════════════


// Map route slug → metadata (report renderer function name + label)
const PRINT_REPORTS = {
  'deal-snapshot':    { fn: 'renderReport_deal_snapshot',    label: 'Deal Snapshot' },
  'brrrr-package':    { fn: 'renderReport_brrrr_package',    label: 'BRRRR Package' },
  'ff-package':       { fn: 'renderReport_ff_package',       label: 'F&F Package' },
  'internal-memo':    { fn: 'renderReport_internal_memo',    label: 'Internal Memo' },
  'lender-package':   { fn: 'renderReport_lender_package',   label: 'Lender Package' },
  'hud-vash-package': { fn: 'renderReport_hud_vash_package', label: 'HUD-VASH PBV Package' }
};

function isPrintHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return /^\/print\//.test(h);
}

function parsePrintHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  // Expected: /print/<report-type>/<deal-id>
  const m = h.match(/^\/print\/([a-z0-9_-]+)\/(.+)$/);
  if (!m) return null;
  return { reportType: m[1], dealId: m[2] };
}

// Sanitize a string for use in a filename. Strip path separators and
// collapse whitespace to underscores. Returns at most 60 chars.
function _safeFilename(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'Untitled';
}

function _todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function _modeLabel(mode) {
  if (mode === 'brrrr') return 'BRRRR';
  if (mode === 'fix_and_flip') return 'FixAndFlip';
  return 'Deal';
}


// ── ENTRY POINT (called from core.js after Supabase session is restored)
async function startPrintMode() {
  const route = parsePrintHash();
  if (!route) return false;

  const meta = PRINT_REPORTS[route.reportType];
  if (!meta) {
    document.body.innerHTML = _printErrorShell('Unknown report type: ' + route.reportType);
    return true;
  }

  // Hide the app shell and auth screen; we own the page now.
  const auth = document.getElementById('auth-screen');
  const app  = document.getElementById('app-screen');
  if (auth) auth.style.display = 'none';
  if (app)  app.style.display  = 'none';

  // Inject the print-only stylesheet if not already present.
  if (!document.getElementById('foundry-print-css')) {
    const link = document.createElement('link');
    link.id   = 'foundry-print-css';
    link.rel  = 'stylesheet';
    link.href = 'print.css';
    document.head.appendChild(link);
  }

  // Show a temporary loading splash so users see something while data fetches.
  const splash = document.createElement('div');
  splash.id = 'print-splash';
  splash.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#666;background:#fff;z-index:99999';
  splash.textContent = 'Preparing ' + meta.label + '...';
  document.body.appendChild(splash);

  try {
    // Wait for Supabase boot to complete (initSupabase sets `sb`).
    let tries = 0;
    while (typeof sb === 'undefined' || !sb) {
      if (tries++ > 50) throw new Error('Supabase did not initialize within 5s');
      await new Promise(r => setTimeout(r, 100));
    }

    // Confirm an authenticated session exists; if not, redirect to auth.
    const sess = await sb.auth.getSession();
    if (!sess || !sess.data || !sess.data.session) {
      throw new Error('No active session. Sign in to the main app first.');
    }

    // Fetch the deal directly (don't go through loadDeals/loadDeal which
    // mutate too much shell state; this tab is print-only).
    const { data, error } = await sb
      .from('foundry_deals')
      .select('*')
      .eq('id', route.dealId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Deal not found: ' + route.dealId);

    // Hydrate the engine globals so recompute() works against this deal.
    currentDeal = data;
    inputs = Object.assign(typeof makeDefaultInputs === 'function' ? makeDefaultInputs() : {}, data.inputs || {});
    if (data.address)    inputs.property_address = data.address;
    if (data.city)       inputs.city = data.city;
    if (data.state)      inputs.state = data.state;
    if (data.zip)        inputs.zip = data.zip;
    if (data.asset_type) inputs.asset_type = data.asset_type;
    unitMix        = Array.isArray(data.unit_mix) ? data.unit_mix : [];
    comps          = Array.isArray(data.comps) ? data.comps : [];
    marketAnalysis = data.market_analysis || {};
    overrides      = data.overrides || {};
    riskRegister   = Array.isArray(data.risks) ? data.risks : [];

    if (typeof recompute === 'function') recompute();

    // Build helpers exposed to report renderers (formatters, threshold
    // lookups, anything the report shouldn't reimplement).
    const helpers = _printHelpers();

    // Set document title (browser uses this as the default PDF filename).
    const filename = 'Foundry_' + _modeLabel(currentDeal.deal_mode) + '_'
                   + _safeFilename(currentDeal.name) + '_'
                   + meta.label.replace(/[^a-zA-Z0-9]/g, '') + '_'
                   + _todayISO();
    document.title = filename;

    // Dispatch to the report renderer. If missing, surface a placeholder.
    const fn = window[meta.fn];
    let bodyHtml;
    if (typeof fn !== 'function') {
      console.warn('[Foundry print] Report module not loaded: ' + meta.fn + '. Check that reports/' + route.reportType + '.js is uploaded and referenced from index.html.');
      bodyHtml = _printPlaceholder(meta.label, currentDeal);
    } else {
      bodyHtml = fn(currentDeal, R, inputs, marketAnalysis, helpers);
    }

    // Render into the page. Wrap each report in a print-page container
    // so report modules can use <div class="print-page"> for explicit
    // page breaks.
    document.body.innerHTML = `
      <div id="print-root">
        ${bodyHtml}
      </div>
    `;

    // Give the browser a tick to paint, then fire print().
    await new Promise(r => setTimeout(r, 250));
    window.print();

  } catch (err) {
    console.error('[Foundry print] ' + (err && err.message ? err.message : err));
    document.body.innerHTML = _printErrorShell(err && err.message ? err.message : String(err));
  }

  return true;
}


// ── HELPERS exposed to report renderers ──────────────────────
function _printHelpers() {
  return {
    fmtMoney: (x, dec) => {
      if (x == null || !isFinite(x)) return '-';
      const d = dec == null ? 0 : dec;
      return '$' + Number(x).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    fmtMoneyK: (x) => {
      if (x == null || !isFinite(x)) return '-';
      if (Math.abs(x) >= 1e6) return '$' + (x / 1e6).toFixed(2) + 'M';
      if (Math.abs(x) >= 1e3) return '$' + (x / 1e3).toFixed(0) + 'K';
      return '$' + Math.round(x);
    },
    fmtPct: (x, dec) => {
      if (x == null || !isFinite(x)) return '-';
      const d = dec == null ? 1 : dec;
      return (x * 100).toFixed(d) + '%';
    },
    fmtX: (x, dec) => {
      if (x == null || !isFinite(x)) return '-';
      const d = dec == null ? 2 : dec;
      return Number(x).toFixed(d) + 'x';
    },
    fmtInt: (x) => {
      if (x == null || !isFinite(x)) return '-';
      return Math.round(x).toLocaleString();
    },
    fmtDate: (d) => {
      if (!d) return '-';
      const dt = (d instanceof Date) ? d : new Date(d);
      if (isNaN(dt)) return '-';
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    },
    todayLong: () => {
      return new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    },
    foundryLogo: () => {
      // Reuse the dark logo data URI from logos.js. Returns img src.
      return (typeof FOUNDRY_LOGO_DARK !== 'undefined') ? FOUNDRY_LOGO_DARK : '';
    },
    asjpGold: '#C9A84C',
    asjpBlack: '#0a0a0b',
    asjpWhite: '#ffffff'
  };
}


// ── Print harness chrome (placeholder + error) ─────────────────
function _printPlaceholder(label, deal) {
  return `
    <div class="print-page">
      <div class="print-header">
        <div class="ph-logo">FOUNDRY</div>
        <div class="ph-date">${new Date().toLocaleDateString()}</div>
      </div>
      <div style="padding:1in;text-align:center">
        <div style="font-size:18pt;font-weight:700;margin-bottom:8pt">${label}</div>
        <div style="font-size:11pt;color:#666;margin-bottom:24pt">${deal && deal.name ? deal.name : 'Untitled deal'}</div>
        <div style="font-size:10pt;color:#999;max-width:5in;margin:0 auto;line-height:1.6">
          This report is not yet implemented. M6.1 ships the print pipeline foundation only; report modules ship one at a time in subsequent milestones.
        </div>
      </div>
      <div class="print-footer">
        <div class="pf-conf">Confidential</div>
        <div class="pf-page"></div>
      </div>
    </div>
  `;
}

function _printErrorShell(msg) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:6in;margin:2in auto;padding:1in;border:1px solid #ddd">
      <div style="font-size:14pt;font-weight:700;margin-bottom:12pt;color:#a00">Report could not be generated</div>
      <div style="font-size:10pt;color:#666;line-height:1.6">${msg}</div>
      <div style="margin-top:24pt;font-size:9pt;color:#999">Close this tab and try again from the main app.</div>
    </div>
  `;
}


// ── PUBLIC: triggered from the Reports page in shell-ui.js ─────
// Opens a new tab to the print route, which the new tab's core.js
// will detect on boot and dispatch through startPrintMode().
function openPrintTab(reportType) {
  if (!currentDeal || !currentDeal.id) {
    alert('Open a deal first.');
    return;
  }
  if (!PRINT_REPORTS[reportType]) {
    alert('Unknown report type: ' + reportType);
    return;
  }
  const url = window.location.pathname + '#/print/' + reportType + '/' + currentDeal.id;
  window.open(url, '_blank');
}
