// ════════════════════════════════════════════════════════════════
// FOUNDRY - Brand Marks
// ════════════════════════════════════════════════════════════════
// Brand concept: ascending arrow rising from a base bar. The base
// represents the raw acquisition; the arrow rising from it represents
// the value creation. Suite-consistent with Cadence (stylized C) and
// Tranche (stacked bars): single gold linework, no fills, no
// decoration. Reads at favicon size as just the arrow.
//
// Three marks:
//   FOUNDRY_LOGO_DARK  - wordmark + icon for dark backgrounds
//   FOUNDRY_LOGO_LIGHT - same mark for light backgrounds (reports)
//   FOUNDRY_ICON       - square favicon mark
// ════════════════════════════════════════════════════════════════

// Wordmark for dark backgrounds (auth screen, top bar, sidebar)
const FOUNDRY_LOGO_DARK = 'data:image/svg+xml;base64,' + btoa(`<svg width="320" height="48" viewBox="0 0 320 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="38" width="20" height="4" rx="1" fill="#C9A84C" opacity="0.55"/>
  <line x1="14" y1="38" x2="14" y2="14" stroke="#C9A84C" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M 6 16 L 14 8 L 22 16" stroke="#C9A84C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="28" y1="6" x2="28" y2="42" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round"/>
  <text x="37" y="28" font-family="Inter,Helvetica,sans-serif" font-size="18" font-weight="300" letter-spacing="3" fill="#E8E8F0">FOUNDRY</text>
  <text x="38" y="41" font-family="Inter,Helvetica,sans-serif" font-size="8.5" font-weight="400" letter-spacing="2.2" fill="#C9A84C" opacity="0.55">VALUE-ADD UNDERWRITING PLATFORM</text>
</svg>`);

// Wordmark for light backgrounds (report PDFs)
const FOUNDRY_LOGO_LIGHT = 'data:image/svg+xml;base64,' + btoa(`<svg width="320" height="48" viewBox="0 0 320 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="38" width="20" height="4" rx="1" fill="#a07828" opacity="0.7"/>
  <line x1="14" y1="38" x2="14" y2="14" stroke="#a07828" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M 6 16 L 14 8 L 22 16" stroke="#a07828" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="28" y1="6" x2="28" y2="42" stroke="#a07828" stroke-width="1.5" stroke-linecap="round"/>
  <text x="37" y="28" font-family="Inter,Helvetica,sans-serif" font-size="18" font-weight="300" letter-spacing="3" fill="#0a0a0b">FOUNDRY</text>
  <text x="38" y="41" font-family="Inter,Helvetica,sans-serif" font-size="8.5" font-weight="400" letter-spacing="2.2" fill="#a07828" opacity="0.75">VALUE-ADD UNDERWRITING PLATFORM</text>
</svg>`);

// Square favicon
const FOUNDRY_ICON = 'data:image/svg+xml;base64,' + btoa(`<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="38" width="36" height="4" rx="1" fill="#C9A84C" opacity="0.6"/>
  <line x1="24" y1="38" x2="24" y2="12" stroke="#C9A84C" stroke-width="4" stroke-linecap="round"/>
  <path d="M 12 14 L 24 4 L 36 14" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`);
