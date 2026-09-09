import type { LocalAssetProperty, LocalAssetServiceProperty, LocalCommonCategoryProp } from './localData'

export interface SelectOption {
  value: string
}

/**
 * Either row shape works here - LocalAssetProperty (legacy master rows) and
 * LocalAssetServiceProperty (asset service history rows) both have the same
 * value1..value50 dynamic-value columns. Overloads (rather than a generic
 * constrained to Record<string, unknown>) so each call site still gets back
 * its own concrete type - a plain interface isn't assignable to
 * Record<string, unknown> without an explicit index signature, which is
 * more churn than these two known shapes are worth.
 */
type DynamicValueRow = LocalAssetProperty | LocalAssetServiceProperty

/**
 * Defensive parse of CommonCategoryProps.CtrlProps. The real shape (per
 * sample data from the API side) is a JSON array of plain `{"value": "..."}`
 * objects - the option's display text IS its value, e.g.
 * `[{"value":""},{"value":"Yes"},{"value":"No"}]`. Falls back to an empty
 * list for anything missing/blank/malformed rather than throwing - a bad
 * CtrlProps value must never crash the whole form.
 */
export function parseSelectOptions(ctrlProps: string | null | undefined): SelectOption[] {
  if (!ctrlProps) return []
  try {
    const parsed: unknown = JSON.parse(ctrlProps)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item): SelectOption | null => {
        if (typeof item === 'string') return { value: item }
        if (item && typeof item === 'object' && 'value' in (item as Record<string, unknown>)) {
          const value = (item as { value?: unknown }).value
          return typeof value === 'string' ? { value } : null
        }
        return null
      })
      .filter((o): o is SelectOption => o !== null)
  } catch {
    return []
  }
}

/** Reads a field's value out of a row via CommonCategoryProps.PropColRefNo (1-50). */
export function getFieldValue(row: DynamicValueRow, prop: LocalCommonCategoryProp): string | null {
  if (!prop.propColRefNo || prop.propColRefNo < 1 || prop.propColRefNo > 50) return null
  return (row as unknown as Record<string, string | null>)[`value${prop.propColRefNo}`] ?? null
}

/** Returns a NEW row with this field's value updated (immutable - for React state). */
export function setFieldValue(
  row: LocalAssetProperty,
  prop: LocalCommonCategoryProp,
  value: string | null,
): LocalAssetProperty
export function setFieldValue(
  row: LocalAssetServiceProperty,
  prop: LocalCommonCategoryProp,
  value: string | null,
): LocalAssetServiceProperty
export function setFieldValue(
  row: DynamicValueRow,
  prop: LocalCommonCategoryProp,
  value: string | null,
): DynamicValueRow {
  if (!prop.propColRefNo || prop.propColRefNo < 1 || prop.propColRefNo > 50) return row
  return { ...row, [`value${prop.propColRefNo}`]: value }
}

/** DD/MM/YYYY -> ISO yyyy-mm-dd, for feeding an IonDatetime. Null if unparseable. */
export function dmyToIso(dmy: string | null): string | null {
  if (!dmy) return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** ISO yyyy-mm-dd (optionally with a time part) -> DD/MM/YYYY, for storage/display. */
export function isoToDmy(iso: string | null): string | null {
  if (!iso) return null
  const datePart = iso.split('T')[0]
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!m) return null
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/** True if a mandatory field's value is missing/blank. */
export function isFieldMissing(prop: LocalCommonCategoryProp, value: string | null): boolean {
  return prop.ctrlIsMandatory && (value == null || value.trim() === '')
}
