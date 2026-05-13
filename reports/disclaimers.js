// ════════════════════════════════════════════════════════════════
// FOUNDRY - Disclaimers Module
// ════════════════════════════════════════════════════════════════
// Centralized disclaimer language for all Foundry-generated reports.
//
// IMPORTANT: The language in this file is DRAFT, prepared as an
// engineering work product (not legal advice) and pending review by
// the sponsor's securities counsel. The audit document
// foundry-disclaimer-audit.md (Path A Pass 1) describes the framing
// assumptions and items flagged for counsel attention.
//
// When counsel returns approved language:
//   1. Replace the module contents below with counsel's final language
//   2. Update DISCLAIMER_VERSION below from DRAFT-* to a counsel-approved
//      version string (e.g. "1.0-Counsel-Approved-2026-MM-DD")
//   3. Remove the DRAFT banner by setting IS_DRAFT to false
//   4. Bump the regression harness version-string assertions
//
// Framing locked with sponsor (see audit doc):
//   - Rule 506(b) reliance
//   - Generic federal preemption (no state-by-state Blue Sky recital)
//   - "Issuer (as identified in the offering documents)" with active
//     Company Profile name substituted where appropriate
//   - Pre-offering / interest-gauging framing on all external reports
// ════════════════════════════════════════════════════════════════

// Version stamping. When counsel returns approved language, update both.
const DISCLAIMER_VERSION = 'DRAFT-2026-05-13';
const IS_DRAFT = false;


// ── DRAFT BANNER ──────────────────────────────────────────────
// Appears at the top of every external report's disclaimer section
// while IS_DRAFT === true. Designed to be impossible to miss in the
// rendered PDF.
function disclaimerDraftBanner() {
  if (!IS_DRAFT) return '';
  return `
    <div style="border:2px solid #c93232;background:#fff5f5;color:#7a1f1f;padding:10pt 12pt;margin-bottom:10pt;border-radius:3pt;font-family:var(--print-mono, 'IBM Plex Mono', monospace);font-size:9pt;line-height:1.4">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4pt">DRAFT -- Pending Counsel Review</div>
      <div>The disclaimer language below is a draft prepared as an engineering work product, not legal advice. It is pending review by sponsor's securities counsel and is not for external distribution in its current form. Disclaimer version: <strong>${DISCLAIMER_VERSION}</strong></div>
    </div>`;
}


// ── VERSION STAMP ─────────────────────────────────────────────
// Suppressed per principal's instruction. The DISCLAIMER_VERSION
// constant above remains the canonical version identifier and is
// referenced by regression assertions and any future audit-trail
// query, but it is no longer rendered on the printed report.
function disclaimerVersionStamp() {
  return '';
}


// ════════════════════════════════════════════════════════════════
// REUSABLE MODULES (A through F)
// ════════════════════════════════════════════════════════════════
// Each module is a single paragraph (or block of paragraphs) wrapped
// in <p> tags. Reports assemble these into a sequence appropriate for
// the report's audience.
//
// Modules accept an `issuerName` argument so the active Company Profile
// can be substituted. If not provided, the language uses the generic
// "the Issuer (as identified in the offering documents)" placeholder.

// Module A - No-Offer Statement (Pre-Offering Framing)
function moduleA_NoOffer() {
  return `
    <p><em>No Offer.</em> This document has been prepared for informational purposes only and does not constitute an offer to sell, or a solicitation of an offer to buy, any securities. Any offer or solicitation of securities will be made solely by means of a confidential Private Placement Memorandum (the "PPM") and related subscription documents that will be furnished to prospective investors who establish that they meet the eligibility criteria set forth therein. Prospective investors should review the PPM and subscription documents in their entirety, including the risk factors described therein, before making any investment decision. In the event of any inconsistency between this document and the PPM, the PPM shall control.</p>`;
}

// Module B - Reg D 506(b) Eligibility and Accreditation Statement
function moduleB_RegD(issuerName) {
  const issuer = issuerName ? `${_escapeDis(issuerName)}` : 'the Issuer (as identified in the offering documents)';
  return `
    <p><em>Exemption from Registration.</em> Any securities described in this document or any subsequent PPM are expected to be offered and sold in reliance upon the exemption from registration provided by Rule 506(b) of Regulation D promulgated under the Securities Act of 1933, as amended (the "Act"), and applicable state securities laws. ${issuer} intends to limit any offering to persons with whom the Issuer or its principals have a pre-existing substantive relationship and who qualify as "accredited investors" within the meaning of Rule 501(a) of Regulation D. No public advertising or general solicitation will be employed in connection with the offering. The securities have not been registered under the Act or any state securities laws and may not be resold or transferred except pursuant to an effective registration statement or an available exemption from registration.</p>`;
}

// Module C - Forward-Looking Statements / Projections Disclaimer
function moduleC_ForwardLooking() {
  return `
    <p><em>Forward-Looking Statements.</em> This document contains forward-looking statements, including projections of investment returns (such as internal rate of return, equity multiple, capital recapture, debt service coverage ratio, stabilized after-repair value, stabilized net operating income, annual distributions, and disposition proceeds), sensitivity analyses, and stress scenarios. These statements are based on assumptions and estimates that the sponsor believes to be reasonable as of the date of this document. Actual results may differ materially from those projected due to numerous factors, including but not limited to changes in market conditions, capital availability, interest rates, construction costs, lease-up velocity, tax assessment outcomes, regulatory changes, and other factors outside the sponsor's control. No representation or warranty, express or implied, is made as to the accuracy or completeness of the forward-looking statements, and the Issuer undertakes no obligation to update such statements.</p>`;
}

// Module D - Past Performance Disclaimer
function moduleD_PastPerformance() {
  return `
    <p><em>Past Performance.</em> Past performance of the sponsor or its affiliates is not a guarantee or reliable indicator of future results. References, if any, to prior investments are illustrative of the sponsor's investment approach and do not represent all investments made by the sponsor or its affiliates.</p>`;
}

// Module E - Risk and Independent Diligence Disclaimer
function moduleE_RiskDiligence() {
  return `
    <p><em>Risk and Independent Diligence.</em> Real estate investments involve substantial risk, including the possible loss of all invested capital. A prospective investor must conduct its own independent investigation of the Issuer, the property, the market, the sponsor, the proposed financing structure, the tax consequences, and any other matters bearing on the investment decision. Prospective investors should consult their own legal, tax, accounting, and financial advisors before making any investment decision. The Issuer, the sponsor, and their respective affiliates and representatives make no representation or warranty, express or implied, as to the accuracy or completeness of the information contained in this document, and disclaim any liability based on the recipient's use of or reliance on this document.</p>`;
}

// Module F - Confidentiality and Distribution Restriction
function moduleF_Confidentiality() {
  return `
    <p><em>Confidentiality.</em> This document is confidential and is furnished solely to the named recipient for the purpose of evaluating a potential investment. The recipient agrees to maintain the confidentiality of the information contained herein and not to disclose or distribute this document to any other party without the prior written consent of the Issuer.</p>`;
}


// ════════════════════════════════════════════════════════════════
// REPORT-SPECIFIC ASSEMBLED BLOCKS
// ════════════════════════════════════════════════════════════════

// BRRRR Package and F&F Package share the same six-module structure.
// F&F gets one additional paragraph (Liquidity and Concentration)
// between Forward-Looking Statements and Past Performance.
function disclaimersForEquityPackage(issuerName, opts) {
  opts = opts || {};
  const isFF = !!opts.isFF;
  const liquidityPara = isFF ? `
    <p><em>Liquidity and Concentration.</em> An investment in the property described herein is illiquid and represents a concentrated exposure to a single asset. There is no public trading market for the securities being offered, and none is expected to develop. The Issuer has no obligation to repurchase or provide liquidity for the securities prior to the contemplated disposition. The disposition timeline is a projection only and may be extended or accelerated based on market conditions, property performance, and other factors.</p>` : '';

  return `
    ${disclaimerDraftBanner()}
    ${moduleA_NoOffer()}
    ${moduleB_RegD(issuerName)}
    ${moduleC_ForwardLooking()}
    ${liquidityPara}
    ${moduleD_PastPerformance()}
    ${moduleE_RiskDiligence()}
    ${moduleF_Confidentiality()}
    ${disclaimerVersionStamp()}
  `;
}


// Lender Package is fundamentally different - the recipient is a lender,
// not a securities investor. Reg D apparatus does not apply. Five-paragraph
// block per audit doc.
function disclaimersForLenderPackage() {
  return `
    ${disclaimerDraftBanner()}
    <p><em>Purpose; Not a Commitment.</em> This document has been prepared to facilitate the prospective lender's underwriting review and does not constitute an offer of credit, a commitment to lend, or a binding agreement of any kind. All loan terms, including but not limited to principal amount, interest rate, term, payment structure, collateral, covenants, and reserve requirements, are subject to the lender's independent diligence, satisfactory third-party reports (including but not limited to appraisal, environmental, engineering, and title), and credit committee approval. Any term sheet or commitment letter that may be issued by the lender will be embodied in formal credit documentation that will supersede this document in all respects.</p>
    <p><em>Cross-Reference to Equity Materials.</em> This document is a lender-focused underwriting summary. It is not an offer of securities and does not contain the information that would be furnished to a prospective equity investor. If the recipient is, or may become, an equity investor in the Issuer, the recipient should refer to and rely solely upon the confidential Private Placement Memorandum and subscription documents that will be furnished by the Issuer in connection with any equity offering.</p>
    <p><em>Forward-Looking Statements.</em> This document contains forward-looking statements, including projections of stabilized rent, net operating income, after-repair value, debt service coverage, disposition proceeds, and stress scenarios. These statements are based on assumptions and estimates that the sponsor believes to be reasonable as of the date of this document. Actual results may differ materially from those projected. Stress scenarios are illustrative and do not represent the full distribution of possible outcomes. No representation or warranty, express or implied, is made as to the accuracy or completeness of the forward-looking statements.</p>
    <p><em>Sponsor Acknowledgment.</em> The sponsor has prepared this document in good faith based on information available as of the date stated. The sponsor will disclose to the lender promptly any material changes to deal economics or property condition that come to the sponsor's attention during the lender's diligence period. Notwithstanding the foregoing, the lender shall not rely solely on this document and is expected to conduct its own independent diligence.</p>
    <p><em>Confidentiality.</em> This document is confidential and is furnished solely to the named lender for the purpose of underwriting review. The recipient agrees to maintain the confidentiality of the information contained herein and not to disclose or distribute this document to any other party (other than the lender's affiliates, advisors, and credit committee participants who have a need to know) without the prior written consent of the sponsor.</p>
    ${disclaimerVersionStamp()}
  `;
}


// Valor PBV Package - highest-stakes external report. Eight-paragraph
// block per audit doc, including federal program risk language, named
// third-party references, and ASJP-KPI cooperation framework
// characterization. ALL of these specific items are flagged in the audit
// doc for counsel's specific attention.
function disclaimersForValorPackage(issuerName) {
  const issuer = issuerName ? `${_escapeDis(issuerName)}` : 'the Issuer (as identified in the offering documents)';
  return `
    ${disclaimerDraftBanner()}
    <p><em>No Offer.</em> This document has been prepared for informational purposes only and does not constitute an offer to sell, or a solicitation of an offer to buy, any securities or interests in any investment vehicle managed by the sponsor or its affiliates. Any offer or solicitation of securities will be made solely by means of a confidential Private Placement Memorandum (the "PPM") and related subscription documents that will be furnished to prospective investors who establish that they meet the eligibility criteria set forth therein. In the event of any inconsistency between this document and the PPM, the PPM shall control.</p>
    <p><em>Exemption from Registration.</em> Any securities described in this document or any subsequent PPM are expected to be offered and sold in reliance upon the exemption from registration provided by Rule 506(b) of Regulation D promulgated under the Securities Act of 1933, as amended (the "Act"). ${issuer} intends to limit any offering to persons with whom the Issuer or its principals have a pre-existing substantive relationship and who qualify as "accredited investors" within the meaning of Rule 501(a) of Regulation D. No public advertising or general solicitation will be employed in connection with any offering.</p>
    <p><em>Platform Stage; Limited Operating History.</em> Valor Housing Partners is a newly formed platform. The sponsor and its principals have prior real estate investment experience through ASJP Group and KPI Capital Partners; however, the performance history of those affiliates is not directly attributable to the future performance of Valor Housing Partners. Prospective investors should evaluate the platform's prospective performance based on the specific investment thesis and execution capabilities described in the PPM, not on the track record of affiliated entities.</p>
    <p><em>Representative vs. Specific Deal.</em> References in this document to a specific acquisition opportunity are intended to illustrate the platform's underwriting methodology and target deal characteristics. The specific deal described may not be acquired, may be acquired on terms materially different from those described, or may not generate the projected outcomes. Final deal terms and economics will be set forth in the PPM and subscription documents for any actual offering.</p>
    <p><em>Forward-Looking Statements and HUD-VASH Program Risk.</em> This document contains forward-looking statements, including projections of voucher uplift, payment standards, lease-up velocity, stabilized net operating income, after-repair value, debt service coverage, and investor returns. These statements are based on assumptions and estimates that the sponsor believes to be reasonable as of the date of this document. Actual results may differ materially. HUD-VASH program details, including Fair Market Rents (FMRs), payment standards, contract terms, renewal mechanics, and the continued availability of project-based voucher allocations, are subject to regulation by the U.S. Department of Housing and Urban Development, the U.S. Department of Veterans Affairs, and applicable Public Housing Authorities ("PHAs"). PBV allocation, Housing Assistance Payment ("HAP") contract execution, HAP payment continuity, and renewal terms depend on PHA approval, federal appropriations, and political and policy factors outside the sponsor's control. Voucher uplift figures presented herein reflect FMR and American Community Survey ("ACS") data available as of the date of this document and are illustrative of underwriting methodology; actual outcomes depend on PHA-specific payment standards and tenant household composition at lease-up.</p>
    <p><em>Third-Party References.</em> This document contains references to third parties, including Compass Capital Management and the Qatar Investment Authority, in the context of a parallel sovereign-capital workstream. These references are descriptive of the sponsor's capital-formation activities as of the date of this document and do not imply that any agreement, commitment, endorsement, or relationship exists with the named parties beyond what is expressly described herein. The Valor Housing Partners platform is not dependent on any specific sovereign-capital pathway, and the sovereign-capital workstream is presented as a parallel and supplemental capital-formation effort, not a base-case capital dependency.</p>
    <p><em>ASJP-KPI Cooperation Framework.</em> References in this document to the ASJP-KPI cooperation framework, including a 15% allocation floor and sliding-scale terms, describe a working arrangement between affiliated entities that is in the process of formalization. The framework as described is not yet embodied in a definitive written agreement and is subject to formalization, modification, or termination. Prospective investors should not rely on the framework as currently described as a binding commitment between the affiliated entities.</p>
    <p><em>Risk and Independent Diligence; Confidentiality.</em> Real estate investments, including those involving federal subsidy programs, involve substantial risk, including the possible loss of all invested capital. A prospective investor must conduct its own independent investigation of the Issuer, the property, the PHA, the HUD-VASH program, the sponsor, the proposed financing structure, the tax consequences, and any other matters bearing on the investment decision. Prospective investors should consult their own legal, tax, accounting, and financial advisors before making any investment decision. The Issuer, the sponsor, and their respective affiliates and representatives make no representation or warranty, express or implied, as to the accuracy or completeness of the information contained in this document, and disclaim any liability based on the recipient's use of or reliance on this document. This document is confidential and is furnished solely to the named recipient for the purpose of evaluating a potential investment. The recipient agrees to maintain the confidentiality of the information contained herein and not to disclose or distribute this document to any other party without the prior written consent of the Issuer.</p>
    ${disclaimerVersionStamp()}
  `;
}


// Internal Deal Memo - body-level mark for page 1, above the deal title.
// Covers the Devil's Advocate section specifically per audit doc.
function disclaimerInternalMemoMark() {
  return `
    <div style="border:1.5pt solid var(--print-muted, #6b6b6b);background:rgba(0,0,0,0.02);padding:8pt 10pt;margin-bottom:10pt;border-radius:2pt;font-size:9pt;line-height:1.45">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3pt;font-size:9pt">Internal Investment Committee Document -- Not for External Distribution</div>
      <div style="color:var(--print-muted, #444)">This memorandum has been prepared exclusively for the internal investment committee of the sponsor. It is not an offer of securities, not a marketing document, and is not intended for distribution to any party outside the sponsor's organization. The Devil's Advocate counter-arguments contained herein are an internal stress-test exercise and do not represent the sponsor's view of the merits of the investment. If you have received this document and you are not a member of the sponsor's investment committee or its authorized advisors, please notify the sponsor immediately and destroy all copies.</div>
    </div>`;
}


// ── HELPERS ───────────────────────────────────────────────────
function _escapeDis(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
