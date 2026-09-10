/**
 * The list of bundled document templates (public/templates/*.html - see
 * tokens.ts's doc comment for how they get filled in). Add an entry here
 * for each new template file you hand over; DocumentFormPage.tsx and
 * whatever screen links to it (currently WipPage.tsx's "Create Document"
 * button) work off this list rather than anything template-specific, so a
 * new template needs no new screen code as long as it follows the same
 * "{Token}" + ng-model + c-edit/c-disp pattern as work_docket.html.
 */
export interface DocTemplateDef {
  key: string
  title: string
  /** Path under public/, fetched relative to the app's own origin at runtime. */
  assetPath: string
  /** Whether this template is filled out per-asset (would take an
   * assetGuid and use {AT_AssetGUID}) as opposed to per-job with no
   * specific asset. Every bundled template today is job-level
   * (assetScoped: false) - WipPage's "Create Document" only offers those.
   * Kept for a future template that genuinely is tied to one asset; that
   * would need its own entry point (there isn't one today) as well as
   * assetScoped: true here. */
  assetScoped: boolean
}

export const DOC_TEMPLATES: DocTemplateDef[] = [
  {
    key: 'work_docket',
    title: 'AOV Commissioning Sheet',
    assetPath: 'templates/work_docket.html',
    assetScoped: false,
  },
]

export function getDocTemplate(key: string): DocTemplateDef | null {
  return DOC_TEMPLATES.find((t) => t.key === key) ?? null
}
