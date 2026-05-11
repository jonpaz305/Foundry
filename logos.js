// ════════════════════════════════════════════════════════════════
// FOUNDRY — Brand Marks
// ════════════════════════════════════════════════════════════════
// Brand concept: transformation rectangles. A smaller, narrower
// rectangle at the bottom represents the raw acquisition; a larger,
// gold-accented rectangle at the top represents the stabilized or
// disposed asset. The visual reads as value-add transformation —
// taking something raw and refining it into something larger and
// more valuable. The gold accent on the upper form mirrors Tranche's
// gold-accented tax-credit-equity layer so the suite reads as a
// design family (Cadence wordmark · Tranche stacked stack · Foundry
// transformation rectangles).
//
// Three marks:
//   FOUNDRY_LOGO_DARK  — wordmark + icon for dark backgrounds
//   FOUNDRY_LOGO_LIGHT — same mark for light backgrounds (reports)
//   FOUNDRY_ICON       — square favicon-style mark
// ════════════════════════════════════════════════════════════════

// Wordmark for dark backgrounds (top bar, sidebar, auth screen)
// Transformation icon (raw -> refined) + "FOUNDRY" wordmark + tagline
const FOUNDRY_LOGO_DARK = 'data:image/svg+xml;base64,' + btoa(`<svg width="320" height="48" viewBox="0 0 320 48" xmlns="http://www.w3.org/2000/svg">
  <!-- Transformation icon: small raw rect at bottom, larger refined rect at top with gold accent -->
  <!-- Bottom rect: narrower, dimmer — the raw acquisition -->
  <rect x="12" y="30" width="18" height="6" rx="1" fill="#E8E8F0" opacity="0.5"/>
  <!-- Diagonal stroke implying work / transformation -->
  <line x1="14" y1="28" x2="36" y2="14" stroke="#C9A84C" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/>
  <!-- Top rect: wider, brighter, gold-accented — the refined/stabilized asset -->
  <rect x="8" y="10" width="32" height="6" rx="1" fill="#E8E8F0" opacity="0.92"/>
  <rect x="8" y="10" width="32" height="2" rx="1" fill="#C9A84C"/>
  <!-- Vertical separator -->
  <line x1="48" y1="8" x2="48" y2="40" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  <!-- Wordmark -->
  <text x="58" y="28" font-family="Manrope,Helvetica,sans-serif" font-size="18" font-weight="300" letter-spacing="3" fill="#E8E8F0">FOUNDRY</text>
  <text x="59" y="41" font-family="Manrope,Helvetica,sans-serif" font-size="8.5" font-weight="400" letter-spacing="2.2" fill="#C9A84C" opacity="0.55">BRRRR &amp; FLIP UNDERWRITING</text>
</svg>`);

// Wordmark for light backgrounds (report PDFs, printed pages)
const FOUNDRY_LOGO_LIGHT = 'data:image/svg+xml;base64,' + btoa(`<svg width="320" height="48" viewBox="0 0 320 48" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="30" width="18" height="6" rx="1" fill="#0a0a0b" opacity="0.55"/>
  <line x1="14" y1="28" x2="36" y2="14" stroke="#a07828" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
  <rect x="8" y="10" width="32" height="6" rx="1" fill="#0a0a0b" opacity="0.92"/>
  <rect x="8" y="10" width="32" height="2" rx="1" fill="#a07828"/>
  <line x1="48" y1="8" x2="48" y2="40" stroke="#a07828" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <text x="58" y="28" font-family="Manrope,Helvetica,sans-serif" font-size="18" font-weight="300" letter-spacing="3" fill="#0a0a0b">FOUNDRY</text>
  <text x="59" y="41" font-family="Manrope,Helvetica,sans-serif" font-size="8.5" font-weight="400" letter-spacing="2.2" fill="#a07828" opacity="0.75">BRRRR &amp; FLIP UNDERWRITING</text>
</svg>`);

// Square icon mark — favicon, top-bar compact view
const FOUNDRY_ICON = 'data:image/svg+xml;base64,' + btoa(`<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <!-- Bottom rect: raw acquisition -->
  <rect x="14" y="32" width="20" height="6" rx="1" fill="#C9A84C" opacity="0.5"/>
  <!-- Diagonal stroke: transformation -->
  <line x1="16" y1="30" x2="38" y2="16" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
  <!-- Top rect: refined stabilized asset, gold accent stripe -->
  <rect x="10" y="10" width="32" height="6" rx="1" fill="#C9A84C" opacity="0.92"/>
  <rect x="10" y="10" width="32" height="2" rx="1" fill="#C9A84C"/>
</svg>`);
