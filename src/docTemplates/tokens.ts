/**
 * The "{Token}" substitution engine for legacy document templates (see
 * public/templates/*.html - ported from the old MAUI app's DocMapView/
 * StaticWebView flow, which filled these in via plain C# string.Replace
 * before loading the HTML into its WebView).
 *
 * Two different things both use the token map built here, on purpose:
 *
 * 1. Plain "{Token}" occurrences in HTML text/attributes (e.g.
 *    `value="{SR_SerRecID}"`, `<img src="{img1}">`) - substituteTemplate()
 *    below replaces these directly in the HTML string, HTML-escaped so a
 *    value containing '"', '<', '>' or '&' can't break the surrounding
 *    markup.
 * 2. window.__DOC_CONTEXT__ - a JSON blob DocumentFormPage injects into the
 *    template so its own inline JS (FormHelper.getScopeInitData - see that
 *    function's comment in work_docket.html) can read the same values
 *    safely, without the fragile old approach of substituting "{Token}"
 *    directly inside JS string literals (a value with a quote or backtick
 *    would have corrupted the script, not just the data).
 *
 * Both draw from the same DocTokens map so there's exactly one place that
 * decides what "{SiteAddr1Line}" etc. means.
 */

/** Every "{Token}" name any bundled template currently uses. Not every
 * template uses every key - substituteTemplate() only touches the ones
 * actually present in a given template's HTML, and getDocContext() (see
 * DocumentFormPage.tsx) only needs whichever subset that template's own JS
 * reads from window.__DOC_CONTEXT__. */
export type DocTokens = Partial<{
  // Job
  SR_SerRecID: string
  SR_ProbDesc: string
  ProbDesc: string
  SR_DispatchEng: string
  AT_AssetGUID: string
  // Site
  AS_Occupant: string
  OCCUPANT: string
  AS_Telephone: string
  SiteAddr1Line: string
  SITE_ADDRESS: string
  // Customer
  CU_OrganizationName: string
  ORGANISATION_NAME: string
  CU_Address: string
  CU_Town: string
  CU_County: string
  CU_Country: string
  CUSTFULLADDRESS: string
  // Company / branding - see buildCompanyTokens()'s doc comment: no real
  // per-tenant source for these yet, so they're placeholder-empty for now.
  CompanyName: string
  CompanyAddress: string
  CompanyContactLine1: string
  CompanyContactLine2: string
  CompanyContactLine3: string
  CompanyContactLine4: string
  img1: string
  ID_HeaderImageWidth: string
  // Signing - always blank at load (a fresh document has no signature yet);
  // DocumentFormPage's signature-capture flow sets these live in the
  // Angular scope after loading, it does not reload/re-substitute the
  // template to show a captured signature.
  Image_UserSignature: string
  Image_CustSignature: string
  company_sign: string
  customer_sign: string
  sign_date: string
  // Legacy per-template extras seen in the sample template; substituted as
  // empty when not applicable rather than left as a literal "{Token}" in
  // the rendered output.
  TBL_Image: string
}>

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escapes a string for safe insertion as a regex literal (the token names
 * themselves are always plain [A-Za-z0-9_], so this is defensive, not load-
 * bearing - but cheap enough to just always do). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces every "{Key}" in `html` with tokens[Key], HTML-escaped. Only
 * touches keys actually present in `tokens` (a missing key's "{Token}" is
 * left as literal text rather than guessed at) and only ever matches a
 * single '{' ... '}' pair around an exact known key name - never a generic
 * "{\w+}" pattern - so Angular's own "{{ data.x }}" bindings elsewhere in
 * the same file are never at risk of a false-positive match.
 */
export function substituteTemplate(html: string, tokens: DocTokens): string {
  let result = html
  for (const [key, rawValue] of Object.entries(tokens)) {
    if (rawValue === undefined) continue
    const pattern = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g')
    result = result.replace(pattern, escapeHtml(rawValue))
  }
  return result
}

/**
 * Serializes `tokens` as a `<script>` tag defining window.__DOC_CONTEXT__,
 * meant to be inserted once into the template's <head> before its own
 * trailing <script> block runs. JSON.stringify already makes this safe
 * against quote/backtick/newline corruption (the whole reason this exists
 * instead of the old raw-substitution-inside-JS approach) - the one thing
 * it does NOT guard against is a value containing the literal text
 * "</script>", which would prematurely close this script tag when the HTML
 * parser sees it, before any JS ever runs. Escaping the forward slash
 * (valid inside a JS/JSON string, invisible to the parsed value) closes
 * that gap.
 */
export function buildDocContextScript(tokens: DocTokens): string {
  const json = JSON.stringify(tokens).replace(/<\/script/gi, '<\\/script')
  return `<script>window.__DOC_CONTEXT__ = ${json};</script>`
}

/**
 * Company/branding placeholders (CompanyName, CompanyAddress, the four
 * CompanyContactLine fields, the header logo img1/ID_HeaderImageWidth).
 *
 * KNOWN GAP: this app has no per-tenant company-settings data synced down
 * yet (see chat history - grepped for it, nothing exists), so these are
 * empty placeholders rather than real values for now. The header will just
 * show blank space where the company block would be until that data
 * exists; wire this up to real synced settings once the API/schema for it
 * is decided rather than guessing at a shape here.
 */
export function buildCompanyTokens(): DocTokens {
  return {
    CompanyName: '',
    CompanyAddress: '',
    CompanyContactLine1: '',
    CompanyContactLine2: '',
    CompanyContactLine3: '',
    CompanyContactLine4: '',
    img1: '',
    ID_HeaderImageWidth: '150',
  }
}

function mergeAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(', ')
}

/**
 * The common job/site/customer token set every bundled template is
 * expected to want (a specific template's own buildXTokens() - see
 * registry.ts - can layer more on top). Any field that isn't available
 * (e.g. a job with no siteId yet) is simply omitted rather than guessed,
 * so its "{Token}" is left visible in the rendered output as a visible
 * signal something's missing, rather than silently showing blank.
 */
export function buildCommonTokens(input: {
  job?: { serRecId: number; probDesc: string | null; dispatchEng: string | null } | null
  site?: {
    occupant: string | null
    telephone: string | null
    address: string | null
    town: string | null
    county: string | null
  } | null
  customer?: {
    organizationName: string | null
    address: string | null
    town: string | null
    county: string | null
  } | null
  assetGuid?: string | null
}): DocTokens {
  const tokens: DocTokens = {}

  if (input.job) {
    tokens.SR_SerRecID = String(input.job.serRecId)
    tokens.SR_ProbDesc = input.job.probDesc ?? ''
    tokens.ProbDesc = input.job.probDesc ?? ''
    tokens.SR_DispatchEng = input.job.dispatchEng ?? ''
  }

  if (input.site) {
    tokens.AS_Occupant = input.site.occupant ?? ''
    tokens.OCCUPANT = input.site.occupant ?? ''
    tokens.AS_Telephone = input.site.telephone ?? ''
    tokens.SiteAddr1Line = input.site.address ?? ''
    tokens.SITE_ADDRESS = mergeAddress([
      input.site.address,
      input.site.town,
      input.site.county,
    ])
  }

  if (input.customer) {
    tokens.CU_OrganizationName = input.customer.organizationName ?? ''
    tokens.ORGANISATION_NAME = input.customer.organizationName ?? ''
    tokens.CU_Address = input.customer.address ?? ''
    tokens.CU_Town = input.customer.town ?? ''
    tokens.CU_County = input.customer.county ?? ''
    // No country field on LocalCustomer - see localData.ts's LocalCustomer
    // interface. Left unset (not '') so its "{CU_Country}" stays visible
    // rather than silently vanishing, matching this function's own
    // "omit rather than guess" rule above.
    tokens.CUSTFULLADDRESS = mergeAddress([
      input.customer.address,
      input.customer.town,
      input.customer.county,
    ])
  }

  if (input.assetGuid) {
    tokens.AT_AssetGUID = input.assetGuid
  }

  // A brand new document has no signature yet - see this map's own
  // Image_UserSignature/company_sign etc. doc comment on DocTokens above.
  tokens.Image_UserSignature = ''
  tokens.Image_CustSignature = ''
  tokens.company_sign = ''
  tokens.customer_sign = ''
  tokens.sign_date = ''
  tokens.TBL_Image = ''

  return { ...tokens, ...buildCompanyTokens() }
}
