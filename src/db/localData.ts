import { getDb, persist } from './sqlite'
import { syncUp } from '../api/syncV2'
import type {
  SyncV2AssetDto,
  SyncV2AssetPropertyDto,
  SyncV2CommonCategoryDto,
  SyncV2CommonCategoryPropDto,
  SyncV2CustomerDto,
  SyncV2ResponseDto,
  SyncV2SiteDto,
} from '../api/syncV2Types'

export type LocalJobStatus = 'open' | 'wip' | 'paused' | 'completed'

export interface LocalJob {
  serRecId: number
  docketRef: string | null
  siteId: number | null
  callReceivedDt: string | null
  probDesc: string | null
  startDt: string | null
  finishDt: string | null
  status: string | null
  completed: boolean
  serviceType: string | null
  description: string | null
  datePromisedDt: string | null
  timeFrame: string | null
  scheduledDate: string | null
  scheduledEndDate: string | null
  callerName: string | null
  jobNumber: number | null
  priority: number | null
  dispatchEng: string | null
  dispatchStatus: string | null
  dispatchStatusDesc: string | null
  system: string | null
  timeEst: number
  localStatus: LocalJobStatus
  localCompletedAt: string | null
}

export interface LocalSite {
  siteId: number
  siteRef: string | null
  occupant: string | null
  address: string | null
  town: string | null
  county: string | null
  areaCode: string | null
  postCode: string | null
  telephone: string | null
  custId: number | null
  panelLocation: string | null
  note: string | null
  latitude: number | null
  longitude: number | null
}

export interface LocalCustomer {
  custId: number
  organizationName: string | null
  firstName: string | null
  lastName: string | null
  address: string | null
  town: string | null
  county: string | null
  homePhone: string | null
  mobilePhone: string | null
  workPhone: string | null
  emailAddress: string | null
  accountsRef: string | null
}

export interface LocalAsset {
  assetGuid: string
  assetName: string | null
  assetType: number | null
  siteId: number | null
  assetModel: string | null
  assetDesc: string | null
  serialNo: string | null
  number: string | null
  location: string | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  isActive: boolean
  /** Links to LocalCommonCategory.templateId - which dynamic form this asset uses. */
  templateId: number | null
}

export interface LocalCommonCategory {
  categoryId: number
  type: number | null
  name: string | null
  propCount: number | null
  templateId: number | null
  templateType: string | null
}

export interface LocalCommonCategoryProp {
  propsId: number
  categoryId: number
  categoryType: number | null
  name: string | null
  ctrlType: string | null
  ctrlWidth: number | null
  ctrlOrder: number | null
  ctrlIsMandatory: boolean
  ctrlDefaultVal: string | null
  ctrlProps: string | null
  propColRefNo: number | null
  code: string | null
}

/**
 * One row of dynamic values for an asset - a single header row (type === 0)
 * or one of possibly many detail/grid rows (type === 1). Use
 * dynamicFields.ts's getFieldValue/setFieldValue to read/write value1..
 * value50 by PropColRefNo instead of indexing these fields directly.
 *
 * localId is this app's own stable key (see schema.ts's asset_properties
 * table) - assetPropId is only set for a row that originated on the server.
 */
export interface LocalAssetProperty {
  localId: string
  assetPropId: number | null
  assetGuid: string
  assetDetailGuid: string | null
  type: number | null
  value1: string | null
  value2: string | null
  value3: string | null
  value4: string | null
  value5: string | null
  value6: string | null
  value7: string | null
  value8: string | null
  value9: string | null
  value10: string | null
  value11: string | null
  value12: string | null
  value13: string | null
  value14: string | null
  value15: string | null
  value16: string | null
  value17: string | null
  value18: string | null
  value19: string | null
  value20: string | null
  value21: string | null
  value22: string | null
  value23: string | null
  value24: string | null
  value25: string | null
  value26: string | null
  value27: string | null
  value28: string | null
  value29: string | null
  value30: string | null
  value31: string | null
  value32: string | null
  value33: string | null
  value34: string | null
  value35: string | null
  value36: string | null
  value37: string | null
  value38: string | null
  value39: string | null
  value40: string | null
  value41: string | null
  value42: string | null
  value43: string | null
  value44: string | null
  value45: string | null
  value46: string | null
  value47: string | null
  value48: string | null
  value49: string | null
  value50: string | null
  assetServiceGuid: string | null
  localModified: boolean
  localCreated: boolean
}

/**
 * One row of dynamic values captured for an asset SERVICE VISIT (as opposed
 * to LocalAssetProperty's legacy master row) - a header row (type === 0) or
 * one of possibly many detail/grid rows (type === 1), scoped to one
 * asset_service_history visit via serviceHisId. See schema.ts's
 * asset_service_history/asset_service_properties tables and
 * saveAssetServiceVisit below.
 */
export interface LocalAssetServiceProperty {
  localId: string
  serviceHisId: string
  assetPropId: number | null
  type: number | null
  /** Toggled directly from the Devices list, independent of the edit popup -
   * see AssetServiceInfoPage.tsx. No legacy-master equivalent (asset_properties
   * has no such column), so this never round-trips through fromMasterProperty. */
  serviceFlag: boolean
  value1: string | null
  value2: string | null
  value3: string | null
  value4: string | null
  value5: string | null
  value6: string | null
  value7: string | null
  value8: string | null
  value9: string | null
  value10: string | null
  value11: string | null
  value12: string | null
  value13: string | null
  value14: string | null
  value15: string | null
  value16: string | null
  value17: string | null
  value18: string | null
  value19: string | null
  value20: string | null
  value21: string | null
  value22: string | null
  value23: string | null
  value24: string | null
  value25: string | null
  value26: string | null
  value27: string | null
  value28: string | null
  value29: string | null
  value30: string | null
  value31: string | null
  value32: string | null
  value33: string | null
  value34: string | null
  value35: string | null
  value36: string | null
  value37: string | null
  value38: string | null
  value39: string | null
  value40: string | null
  value41: string | null
  value42: string | null
  value43: string | null
  value44: string | null
  value45: string | null
  value46: string | null
  value47: string | null
  value48: string | null
  value49: string | null
  value50: string | null
}

/** The header (history) row for one asset service visit - see schema.ts's asset_service_history table. */
export interface LocalAssetServiceHistory {
  serviceHisId: string
  assetGuid: string
  serRecId: number
  serviceDate: string | null
  status: number | null
  synced: boolean
}

export interface LocalAssetServiceVisit {
  history: LocalAssetServiceHistory
  properties: LocalAssetServiceProperty[]
}

/** See schema.ts's job_documents table doc comment for the full field-by-field rationale. */
export interface LocalJobDocument {
  localId: string
  serRecId: number
  assetGuid: string | null
  templateKey: string
  dataJson: string
  pdfFileName: string | null
  createdAt: string
  updatedAt: string
  synced: boolean
}

/** value1..value50 - shared by the asset_properties column list and the
 * INSERT/mapping code below (and by dynamicFields.ts's PropColRefNo lookup). */
export const VALUE_COLUMNS = Array.from({ length: 50 }, (_, i) => `value${i + 1}`)

function rowsOf<T>(res: { values?: unknown[] }): T[] {
  return (res.values ?? []) as T[]
}

/**
 * Replaces the local jobs/sites/customers/assets tables with the latest
 * sync bundle from the server, in one transaction. Each job's local-only
 * workflow state (local_status / local_completed_at) is looked up by
 * serRecId before the table is cleared and reapplied after the new rows are
 * inserted, so a job the engineer already started (or completed but hasn't
 * dropped off the next sync yet) doesn't lose that state under their feet.
 */
export async function upsertSyncData(data: SyncV2ResponseDto): Promise<void> {
  const db = await getDb()

  const existingStatusRes = await db.query(
    'SELECT serRecId, local_status, local_completed_at FROM jobs',
  )
  const existingStatus = new Map<number, { status: LocalJobStatus; completedAt: string | null }>()
  for (const row of rowsOf<{ serRecId: number; local_status: LocalJobStatus; local_completed_at: string | null }>(
    existingStatusRes,
  )) {
    existingStatus.set(row.serRecId, { status: row.local_status, completedAt: row.local_completed_at })
  }

  await db.beginTransaction()
  try {
    // transaction=false on every statement below: the outer beginTransaction()
    // above already owns the transaction boundary. run()/executeSet() default
    // to wrapping themselves in their own implicit transaction, which fights
    // with (and can silently close) our manually-managed one - passing false
    // keeps everything inside the single explicit begin/commit/rollback.
    await db.run('DELETE FROM jobs', [], false)
    await db.run('DELETE FROM sites', [], false)
    await db.run('DELETE FROM customers', [], false)
    await db.run('DELETE FROM assets', [], false)

    if (data.jobs.length > 0) {
      await db.executeSet(
        data.jobs.map((job) => {
          const preserved = existingStatus.get(job.serRecID)
          return {
            statement: `INSERT INTO jobs (
              serRecId, docketRef, siteId, callReceivedDt, probDesc, startDt, finishDt,
              status, completed, serviceType, description, datePromisedDt, timeFrame,
              scheduledDate, scheduledEndDate, callerName, jobNumber, priority,
              dispatchEng, dispatchStatus, dispatchStatusDesc, system, timeEst,
              local_status, local_completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
              job.serRecID,
              job.docketRef,
              job.siteID,
              job.callReceivedDT,
              job.probDesc,
              job.startDT,
              job.finishDT,
              job.status,
              job.completed ? 1 : 0,
              job.serviceType,
              job.description,
              job.datePromisedDT,
              job.timeFrame,
              job.scheduledDate,
              job.scheduledEndDate,
              job.callerName,
              job.jobNumber,
              job.priority,
              job.dispatchEng,
              job.dispatchStatus,
              job.dispatchStatusDesc,
              job.system,
              job.timeEst,
              preserved?.status ?? 'open',
              preserved?.completedAt ?? null,
            ],
          }
        }),
        false,
      )
    }

    if (data.sites.length > 0) {
      await db.executeSet(
        data.sites.map((site: SyncV2SiteDto) => ({
          statement: `INSERT INTO sites (
            siteId, siteRef, occupant, address, town, county, areaCode, postCode,
            telephone, custId, panelLocation, note, latitude, longitude
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            site.siteID,
            site.siteRef,
            site.occupant,
            site.address,
            site.town,
            site.county,
            site.areaCode,
            site.postCode,
            site.telephone,
            site.custID,
            site.panelLocation,
            site.note,
            site.latitude,
            site.longitude,
          ],
        })),
        false,
      )
    }

    if (data.customers.length > 0) {
      await db.executeSet(
        data.customers.map((cust: SyncV2CustomerDto) => ({
          statement: `INSERT INTO customers (
            custId, organizationName, firstName, lastName, address, town, county,
            homePhone, mobilePhone, workPhone, emailAddress, accountsRef
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            cust.custID,
            cust.organizationName,
            cust.firstName,
            cust.lastName,
            cust.address,
            cust.town,
            cust.county,
            cust.homePhone,
            cust.mobilePhone,
            cust.workPhone,
            cust.emailAddress,
            cust.accountsRef,
          ],
        })),
        false,
      )
    }

    if (data.assets.length > 0) {
      await db.executeSet(
        data.assets.map((asset: SyncV2AssetDto) => ({
          statement: `INSERT INTO assets (
            assetGuid, assetName, assetType, siteId, assetModel, assetDesc, serialNo,
            number, location, lastServiceDate, nextServiceDate, isActive, templateId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            asset.assetGuid,
            asset.assetName,
            asset.assetType,
            asset.siteID,
            asset.assetModel,
            asset.assetDesc,
            asset.serialNo,
            asset.number,
            asset.location,
            asset.lastServiceDate,
            asset.nextServiceDate,
            asset.isActive ? 1 : 0,
            asset.templateId,
          ],
        })),
        false,
      )
    }

    // common_categories / common_category_props are pure reference/config
    // data - never edited on the device, so a full replace is safe (same as
    // sites/customers/assets above).
    await db.run('DELETE FROM common_categories', [], false)
    await db.run('DELETE FROM common_category_props', [], false)

    if (data.commonCategories.length > 0) {
      await db.executeSet(
        data.commonCategories.map((cat: SyncV2CommonCategoryDto) => ({
          statement: `INSERT INTO common_categories (
            categoryId, type, name, propCount, templateId, templateType
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          values: [cat.categoryId, cat.type, cat.name, cat.propCount, cat.templateId, cat.templateType],
        })),
        false,
      )
    }

    if (data.commonCategoryProps.length > 0) {
      await db.executeSet(
        data.commonCategoryProps.map((prop: SyncV2CommonCategoryPropDto) => ({
          statement: `INSERT INTO common_category_props (
            propsId, categoryId, categoryType, name, ctrlType, ctrlWidth, ctrlOrder,
            ctrlIsMandatory, ctrlDefaultVal, ctrlProps, propColRefNo, code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            prop.propsId,
            prop.categoryId,
            prop.categoryType,
            prop.name,
            prop.ctrlType,
            prop.ctrlWidth,
            prop.ctrlOrder,
            prop.ctrlisMandatory ? 1 : 0,
            prop.ctrlDefaultVal,
            prop.ctrlProps,
            prop.propColRefNo,
            prop.code,
          ],
        })),
        false,
      )
    }

    // asset_properties is the one synced table the engineer edits on the
    // device (header + detail rows via AssetServiceInfoPage). Since nothing
    // is synced back up yet, the server always sends the original unedited
    // values - a row-by-row upsert keyed by localId ('srv-<assetPropId>')
    // that SKIPS any row already marked local_modified preserves those
    // edits instead of overwriting them out from under the engineer. Rows
    // with no server counterpart (local_created, added on the device) are
    // never touched here at all.
    if (data.assetProperties.length > 0) {
      const modifiedRes = await db.query(
        "SELECT localId FROM asset_properties WHERE local_modified = 1",
      )
      const modifiedIds = new Set(
        rowsOf<{ localId: string }>(modifiedRes).map((r) => r.localId),
      )

      const toUpsert = data.assetProperties.filter(
        (p) => !modifiedIds.has(`srv-${p.assetPropId}`),
      )

      if (toUpsert.length > 0) {
        await db.executeSet(
          toUpsert.map((p: SyncV2AssetPropertyDto) => ({
            statement: `INSERT OR REPLACE INTO asset_properties (
              localId, assetPropId, assetGuid, assetDetailGuid, type,
              ${VALUE_COLUMNS.join(', ')},
              assetServiceGuid, local_modified, local_created
            ) VALUES (?, ?, ?, ?, ?, ${VALUE_COLUMNS.map(() => '?').join(', ')}, ?, 0, 0)`,
            values: [
              `srv-${p.assetPropId}`,
              p.assetPropId,
              p.assetGuid,
              p.assetDetailGuid,
              p.type,
              ...VALUE_COLUMNS.map((col) => p[col as keyof SyncV2AssetPropertyDto] as string | null),
              p.assetServiceGuid,
            ],
          })),
          false,
        )
      }
    }

    await db.run(
      `INSERT INTO app_meta (key, value) VALUES ('lastSyncAt', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [new Date().toISOString()],
      false,
    )

    await db.commitTransaction()
  } catch (err) {
    // Best-effort rollback - if the transaction already ended (or never
    // truly started) this itself throws "no transaction is active", which
    // must never replace and hide the real error being propagated below.
    try {
      await db.rollbackTransaction()
    } catch {
      // ignore - see comment above
    }
    throw err
  }

  await persist()
}

export async function getLastSyncAt(): Promise<string | null> {
  const db = await getDb()
  const res = await db.query("SELECT value FROM app_meta WHERE key = 'lastSyncAt'")
  const rows = rowsOf<{ value: string }>(res)
  return rows[0]?.value ?? null
}

/** Open (not-yet-completed-locally) jobs, most urgent first. */
export async function getOpenJobs(): Promise<LocalJob[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT * FROM jobs WHERE local_status != 'completed'
     ORDER BY priority DESC, scheduledDate ASC`,
  )
  return rowsOf<Record<string, unknown>>(res).map(mapJobRow)
}

export async function getJobById(serRecId: number): Promise<LocalJob | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM jobs WHERE serRecId = ?', [serRecId])
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapJobRow(rows[0]) : null
}

/** The one job (if any) currently in progress - only one is allowed at a time. */
export async function getWipJob(): Promise<LocalJob | null> {
  const db = await getDb()
  const res = await db.query("SELECT * FROM jobs WHERE local_status = 'wip' LIMIT 1")
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapJobRow(rows[0]) : null
}

export async function startJob(serRecId: number): Promise<void> {
  const db = await getDb()
  await db.run("UPDATE jobs SET local_status = 'wip' WHERE serRecId = ?", [serRecId])
  await persist()
}

/**
 * Marks a job paused locally - it stays out of 'completed' (so getOpenJobs
 * keeps showing it) but is no longer 'wip' (so getWipJob's "only one job in
 * progress at a time" lock frees up, letting another job be started).
 * Resuming a paused job reuses the existing startJob() above - same as this
 * app has never had a separate "resume" server call, only Complete/Pause
 * explicitly mutate the server's DispatchStatus.
 */
export async function pauseJobLocally(serRecId: number): Promise<void> {
  const db = await getDb()
  await db.run("UPDATE jobs SET local_status = 'paused' WHERE serRecId = ?", [serRecId])
  await persist()
}

export async function markJobCompletedLocally(serRecId: number): Promise<void> {
  const db = await getDb()
  await db.run(
    "UPDATE jobs SET local_status = 'completed', local_completed_at = ? WHERE serRecId = ?",
    [new Date().toISOString(), serRecId],
  )
  await persist()
}

export async function getSiteById(siteId: number): Promise<LocalSite | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM sites WHERE siteId = ?', [siteId])
  const rows = rowsOf<LocalSite>(res)
  return rows[0] ?? null
}

export async function getCustomerById(custId: number): Promise<LocalCustomer | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM customers WHERE custId = ?', [custId])
  const rows = rowsOf<LocalCustomer>(res)
  return rows[0] ?? null
}

export async function getAssetsBySite(siteId: number): Promise<LocalAsset[]> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM assets WHERE siteId = ? ORDER BY assetName', [siteId])
  return rowsOf<Record<string, unknown>>(res).map(mapAssetRow)
}

export async function getAssetByGuid(assetGuid: string): Promise<LocalAsset | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM assets WHERE assetGuid = ?', [assetGuid])
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapAssetRow(rows[0]) : null
}

/** The dynamic form definition for a given Asset.templateId, if any is configured. */
export async function getCommonCategoryByTemplateId(
  templateId: number,
): Promise<LocalCommonCategory | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM common_categories WHERE templateId = ?', [templateId])
  const rows = rowsOf<LocalCommonCategory>(res)
  return rows[0] ?? null
}

/** All field definitions for a category, in display order. */
export async function getCommonCategoryProps(categoryId: number): Promise<LocalCommonCategoryProp[]> {
  const db = await getDb()
  const res = await db.query(
    'SELECT * FROM common_category_props WHERE categoryId = ? ORDER BY ctrlOrder ASC',
    [categoryId],
  )
  return rowsOf<Record<string, unknown>>(res).map(mapCommonCategoryPropRow)
}

/** All captured dynamic-value rows (header + detail) for one asset. */
export async function getAssetPropertiesByAssetGuid(assetGuid: string): Promise<LocalAssetProperty[]> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM asset_properties WHERE assetGuid = ?', [assetGuid])
  return rowsOf<Record<string, unknown>>(res).map(mapAssetPropertyRow)
}

/** A fresh, unpersisted row for "add a new header/detail row" - only written to SQLite on Save. */
export function createBlankAssetPropertyRow(assetGuid: string, type: number): LocalAssetProperty {
  const row = {
    localId: `local-${crypto.randomUUID()}`,
    assetPropId: null,
    assetGuid,
    assetDetailGuid: null,
    type,
    assetServiceGuid: null,
    localModified: false,
    localCreated: true,
  } as LocalAssetProperty
  for (const col of VALUE_COLUMNS) {
    ;(row as unknown as Record<string, string | null>)[col] = null
  }
  return row
}

/**
 * Persists the page's (until now purely in-memory/temporary) header row and
 * detail rows for one asset to local SQLite - the "Save" button on
 * AssetServiceInfoPage. Nothing is sent to the API (see the schema.ts
 * comment on asset_properties) - this only protects the edits from being
 * lost, and from being overwritten by the next sync-down.
 */
export async function saveAssetProperties(
  header: LocalAssetProperty | null,
  details: LocalAssetProperty[],
): Promise<void> {
  const db = await getDb()
  const rows = header ? [header, ...details] : details
  if (rows.length === 0) {
    return
  }

  await db.beginTransaction()
  try {
    await db.executeSet(
      rows.map((row) => ({
        statement: `INSERT OR REPLACE INTO asset_properties (
          localId, assetPropId, assetGuid, assetDetailGuid, type,
          ${VALUE_COLUMNS.join(', ')},
          assetServiceGuid, local_modified, local_created
        ) VALUES (?, ?, ?, ?, ?, ${VALUE_COLUMNS.map(() => '?').join(', ')}, ?, 1, ?)`,
        values: [
          row.localId,
          row.assetPropId,
          row.assetGuid,
          row.assetDetailGuid,
          row.type,
          ...VALUE_COLUMNS.map((col) => row[col as keyof LocalAssetProperty] as string | null),
          row.assetServiceGuid,
          row.assetPropId == null ? 1 : 0,
        ],
      })),
      false,
    )
    await db.commitTransaction()
  } catch (err) {
    try {
      await db.rollbackTransaction()
    } catch {
      // ignore - see upsertSyncData's comment on this same pattern
    }
    throw err
  }

  await persist()
}

/** Seeds a new asset-service-visit draft row from a legacy master AssetProperties
 * row - used when the technician opens the service screen for a (asset, job)
 * pair that has no saved visit yet, so the form starts from the asset's
 * last-known values instead of blank (per "take the asset property details
 * to show in service screen"). A fresh localId/serviceHisId is assigned -
 * this is only ever a starting point for a NEW asset_service_properties row,
 * never a reference back to the master row it was copied from (beyond
 * carrying over its assetPropId, so saving amends that same master row
 * rather than creating a duplicate). */
export function fromMasterProperty(master: LocalAssetProperty): LocalAssetServiceProperty {
  const row = {
    localId: `local-${crypto.randomUUID()}`,
    serviceHisId: '',
    assetPropId: master.assetPropId,
    type: master.type,
    // The master row has no serviced/not-serviced concept - always starts
    // unserviced for a freshly-seeded visit row.
    serviceFlag: false,
  } as LocalAssetServiceProperty
  for (const col of VALUE_COLUMNS) {
    ;(row as unknown as Record<string, string | null>)[col] = (
      master as unknown as Record<string, string | null>
    )[col]
  }
  return row
}

/** A fresh, unpersisted row for "add a new header/detail row" to an asset service visit. */
export function createBlankAssetServicePropertyRow(type: number): LocalAssetServiceProperty {
  const row = {
    localId: `local-${crypto.randomUUID()}`,
    serviceHisId: '',
    assetPropId: null,
    type,
    serviceFlag: false,
  } as LocalAssetServiceProperty
  for (const col of VALUE_COLUMNS) {
    ;(row as unknown as Record<string, string | null>)[col] = null
  }
  return row
}

/**
 * The existing local visit (history + its property rows) for a (assetGuid,
 * serRecId) pair, if the technician has saved one before - whether already
 * pushed to the server or still pending. Returns null if no visit has ever
 * been saved locally for this pair.
 */
export async function getServiceVisit(
  assetGuid: string,
  serRecId: number,
): Promise<LocalAssetServiceVisit | null> {
  const db = await getDb()
  const historyRes = await db.query(
    'SELECT * FROM asset_service_history WHERE assetGuid = ? AND serRecId = ?',
    [assetGuid, serRecId],
  )
  const historyRows = rowsOf<Record<string, unknown>>(historyRes)
  if (historyRows.length === 0) return null

  const history = mapAssetServiceHistoryRow(historyRows[0])
  const propsRes = await db.query('SELECT * FROM asset_service_properties WHERE serviceHisId = ?', [
    history.serviceHisId,
  ])
  const properties = rowsOf<Record<string, unknown>>(propsRes).map(mapAssetServicePropertyRow)

  return { history, properties }
}

/**
 * Finds or creates the asset_service_history row for this (assetGuid,
 * serRecId) visit and full-replaces its asset_service_properties rows with
 * `header` + `details`. ServiceHisId is reused across repeated saves of the
 * same visit ("one history entry per job+asset, updated in place" -
 * confirmed with the user) rather than creating a new history row every
 * time.
 *
 * `status` is the local WIP/Serviced flag on this exact row (distinct from,
 * and unrelated to, the server's own Status = 0/1 lifecycle tied to job
 * completion - see SyncV2Repository.PushAssetServiceUp's doc comment; the
 * server always hardcodes 0 on push regardless of what's sent here):
 *   0 - a silent background autosave (AssetServiceInfoPage's dirty-tracking
 *       effect) triggered by an in-progress edit. "Work in progress."
 *   1 - the technician explicitly pressed the page's Save button on a fully
 *       valid form. "Serviced" - this is what AssetServiceListPage's
 *       getServicedAssetGuidsForJob checks for. Touching the form again
 *       after this (any further tracked change) autosaves back to 0 until
 *       Save is pressed again - "serviced" always means "confirmed as of
 *       the last explicit save", not "has ever been saved once."
 *
 * Always resets `synced` back to 0, even for a visit that had already been
 * pushed up successfully - any edit after a sync must go up again on the
 * next manual Sync (see UtilitiesPage.handleSync / applyAssetServiceUpResults).
 *
 * Returns the resolved serviceHisId (useful for tests/diagnostics; the page
 * itself doesn't need to keep it since it always looks the visit back up by
 * (assetGuid, serRecId) via getServiceVisit).
 */
export async function saveAssetServiceVisit(
  assetGuid: string,
  serRecId: number,
  header: LocalAssetServiceProperty | null,
  details: LocalAssetServiceProperty[],
  status: 0 | 1,
): Promise<string> {
  const db = await getDb()

  const existingRes = await db.query(
    'SELECT serviceHisId FROM asset_service_history WHERE assetGuid = ? AND serRecId = ?',
    [assetGuid, serRecId],
  )
  const existingRows = rowsOf<{ serviceHisId: string }>(existingRes)
  const serviceHisId = existingRows[0]?.serviceHisId ?? crypto.randomUUID()

  const rows = header ? [header, ...details] : details

  await db.beginTransaction()
  try {
    // serviceDate is best-effort "when this visit was captured" - stamped
    // at save time since the screen has no dedicated field for it.
    await db.run(
      `INSERT INTO asset_service_history (serviceHisId, assetGuid, serRecId, serviceDate, status, synced)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(serviceHisId) DO UPDATE SET
         serviceDate = excluded.serviceDate,
         status = excluded.status,
         synced = 0`,
      [serviceHisId, assetGuid, serRecId, new Date().toISOString(), status],
      false,
    )

    await db.run('DELETE FROM asset_service_properties WHERE serviceHisId = ?', [serviceHisId], false)

    if (rows.length > 0) {
      await db.executeSet(
        rows.map((row) => ({
          statement: `INSERT INTO asset_service_properties (
            localId, serviceHisId, assetPropId, type, serviceFlag, ${VALUE_COLUMNS.join(', ')}
          ) VALUES (?, ?, ?, ?, ?, ${VALUE_COLUMNS.map(() => '?').join(', ')})`,
          values: [
            row.localId,
            serviceHisId,
            row.assetPropId,
            row.type,
            row.serviceFlag ? 1 : 0,
            ...VALUE_COLUMNS.map((col) => row[col as keyof LocalAssetServiceProperty] as string | null),
          ],
        })),
        false,
      )
    }

    await db.commitTransaction()
  } catch (err) {
    try {
      await db.rollbackTransaction()
    } catch {
      // ignore - see upsertSyncData's comment on this same pattern
    }
    throw err
  }

  await persist()
  return serviceHisId
}

/**
 * The set of assetGuids marked "Serviced" (status = 1 - an explicit,
 * validated Save on AssetServiceInfoPage, not just a background autosave)
 * for this job - used by AssetServiceListPage to badge an asset in the
 * list. A row with status = 0 here means only a silent autosave has
 * happened (still work-in-progress) and does NOT count - see
 * saveAssetServiceVisit's doc comment for the local status lifecycle. Note
 * this is distinct from the server's own Status = 0/1 lifecycle (tied to
 * job completion, not to this page's Save button).
 */
export async function getServicedAssetGuidsForJob(serRecId: number): Promise<Set<string>> {
  const db = await getDb()
  const res = await db.query(
    'SELECT DISTINCT assetGuid FROM asset_service_history WHERE serRecId = ? AND status = 1',
    [serRecId],
  )
  const rows = rowsOf<{ assetGuid: string }>(res)
  return new Set(rows.map((r) => r.assetGuid))
}

/**
 * The set of assetGuids marked "WIP" (status = 0 - only a silent background
 * autosave has happened, no explicit Save yet, or the technician touched an
 * already-Saved form again without re-Saving) for this job - used by
 * AssetServiceListPage to badge an asset as in-progress. Since
 * saveAssetServiceVisit keeps exactly one asset_service_history row per
 * (assetGuid, serRecId) - status 0 and 1 are mutually exclusive on that row,
 * never both at once - an assetGuid returned here is never also in
 * getServicedAssetGuidsForJob's result for the same job.
 */
export async function getWipAssetGuidsForJob(serRecId: number): Promise<Set<string>> {
  const db = await getDb()
  const res = await db.query(
    'SELECT DISTINCT assetGuid FROM asset_service_history WHERE serRecId = ? AND status = 0',
    [serRecId],
  )
  const rows = rowsOf<{ assetGuid: string }>(res)
  return new Set(rows.map((r) => r.assetGuid))
}

/** Every locally-saved visit not yet confirmed pushed to the server - see
 * saveAssetServiceVisit ("synced" reset to 0 on every save) and
 * UtilitiesPage.handleSync (pushes these up before pulling fresh data down). */
export async function getPendingAssetServiceVisits(): Promise<LocalAssetServiceVisit[]> {
  const db = await getDb()
  const historyRes = await db.query('SELECT * FROM asset_service_history WHERE synced = 0')
  const histories = rowsOf<Record<string, unknown>>(historyRes).map(mapAssetServiceHistoryRow)

  const visits: LocalAssetServiceVisit[] = []
  for (const history of histories) {
    const propsRes = await db.query('SELECT * FROM asset_service_properties WHERE serviceHisId = ?', [
      history.serviceHisId,
    ])
    visits.push({
      history,
      properties: rowsOf<Record<string, unknown>>(propsRes).map(mapAssetServicePropertyRow),
    })
  }
  return visits
}

/**
 * Finds the in-progress/completed document for this (serRecId, assetGuid,
 * templateKey) triple, if one has been saved before. DocumentFormPage uses
 * this to re-seed the template's Angular scope from a previous save instead
 * of starting blank every time the technician reopens it.
 */
export async function getJobDocument(
  serRecId: number,
  assetGuid: string | null,
  templateKey: string,
): Promise<LocalJobDocument | null> {
  const db = await getDb()
  const res = assetGuid
    ? await db.query(
        'SELECT * FROM job_documents WHERE serRecId = ? AND assetGuid = ? AND templateKey = ?',
        [serRecId, assetGuid, templateKey],
      )
    : await db.query(
        'SELECT * FROM job_documents WHERE serRecId = ? AND assetGuid IS NULL AND templateKey = ?',
        [serRecId, templateKey],
      )
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapJobDocumentRow(rows[0]) : null
}

export async function getJobDocumentsForJob(serRecId: number): Promise<LocalJobDocument[]> {
  const db = await getDb()
  const res = await db.query(
    'SELECT * FROM job_documents WHERE serRecId = ? ORDER BY updatedAt DESC',
    [serRecId],
  )
  return rowsOf<Record<string, unknown>>(res).map(mapJobDocumentRow)
}

/**
 * Saves (inserts or, for a repeat save of the same document, updates in
 * place) the technician's current progress on a generated document.
 * Mirrors saveAssetServiceVisit's find-existing-by-natural-key pattern
 * rather than always inserting, so reopening and re-saving the same
 * document amends it instead of piling up duplicate rows. Always resets
 * `synced` back to 0 - there's no upload step wired up yet (see
 * schema.ts's doc comment on that column), but when there is, this is the
 * same "any local edit means it needs to go up again" rule
 * saveAssetServiceVisit already uses for asset_service_history.
 */
export async function saveJobDocument(input: {
  serRecId: number
  assetGuid: string | null
  templateKey: string
  dataJson: string
  pdfFileName?: string | null
}): Promise<string> {
  const db = await getDb()
  const existing = await getJobDocument(input.serRecId, input.assetGuid, input.templateKey)
  const localId = existing?.localId ?? crypto.randomUUID()
  const now = new Date().toISOString()

  // Preserve a previously-generated PDF's filename across a save that
  // doesn't itself (re)generate one - e.g. editing field values again after
  // already producing a PDF shouldn't silently forget it.
  const pdfFileName = input.pdfFileName !== undefined ? input.pdfFileName : (existing?.pdfFileName ?? null)

  await db.run(
    `INSERT INTO job_documents (localId, serRecId, assetGuid, templateKey, dataJson, pdfFileName, createdAt, updatedAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(localId) DO UPDATE SET
       dataJson = excluded.dataJson,
       pdfFileName = excluded.pdfFileName,
       updatedAt = excluded.updatedAt,
       synced = 0`,
    [
      localId,
      input.serRecId,
      input.assetGuid,
      input.templateKey,
      input.dataJson,
      pdfFileName,
      existing?.createdAt ?? now,
      now,
    ],
  )

  await persist()
  return localId
}

/**
 * Applies a SyncAssetServiceUp response back to local storage: marks each
 * successfully-pushed visit synced (so it isn't pushed again next time) and
 * backfills the server-assigned AssetPropId onto local property rows that
 * didn't have one yet. That backfill matters - without it, saving and
 * syncing the same newly-added device row a second time before the next
 * sync-down would send AssetPropId = null again, and the server would
 * insert a second, duplicate master AssetProperties row instead of
 * updating the one it just created. A visit the server reports as failed
 * is left with synced = 0 so the next Sync retries it.
 */
export async function applyAssetServiceUpResults(
  visits: Array<{
    serviceHisId: string
    success: boolean
    properties: Array<{ localId: string; assetPropId: number }>
  }>,
): Promise<void> {
  const succeeded = visits.filter((v) => v.success)
  if (succeeded.length === 0) return

  const db = await getDb()
  await db.beginTransaction()
  try {
    for (const visit of succeeded) {
      await db.run(
        'UPDATE asset_service_history SET synced = 1 WHERE serviceHisId = ?',
        [visit.serviceHisId],
        false,
      )
      for (const prop of visit.properties) {
        await db.run(
          'UPDATE asset_service_properties SET assetPropId = ? WHERE localId = ?',
          [prop.assetPropId, prop.localId],
          false,
        )
      }
    }
    await db.commitTransaction()
  } catch (err) {
    try {
      await db.rollbackTransaction()
    } catch {
      // ignore - see upsertSyncData's comment on this same pattern
    }
    throw err
  }

  await persist()
}

/**
 * Result of pushPendingAssetServiceVisits - a plain success/failure shape so
 * callers (UtilitiesPage.handleSync, WipPage.handleCompleteJob) can each
 * show their own error text without duplicating the push logic itself.
 */
export type PushPendingAssetServiceResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Pushes every locally-saved, not-yet-synced Asset Service visit up through
 * the single common SyncUp endpoint, and applies the result back to local
 * storage (see applyAssetServiceUpResults) - shared by UtilitiesPage's
 * manual Sync (push-then-pull) and WipPage's Complete Job (push only, so the
 * job is marked complete with this visit's data already on the server -
 * see WipPage.handleCompleteJob). A no-op (returns { ok: true } immediately)
 * when there is nothing pending.
 *
 * Local data is left untouched on any failure - the caller decides what
 * that means for its own flow (UtilitiesPage just reports it and lets the
 * next Sync retry; WipPage must NOT mark the job complete, since the
 * server's completion PDF/email is built from whatever Asset Service data
 * it already has for this job at the moment CompleteJob is called).
 */
export async function pushPendingAssetServiceVisits(): Promise<PushPendingAssetServiceResult> {
  const pendingVisits = await getPendingAssetServiceVisits()
  if (pendingVisits.length === 0) {
    return { ok: true }
  }

  const pushResult = await syncUp({
    assetService: {
      visits: pendingVisits.map(({ history, properties }) => ({
        serviceHisId: history.serviceHisId,
        assetGuid: history.assetGuid,
        serRecId: history.serRecId,
        serviceDate: history.serviceDate,
        status: history.status,
        // Drop serviceHisId from each property row - it's implied by the
        // visit above and isn't part of the property DTO shape.
        properties: properties.map(({ serviceHisId: _serviceHisId, ...rest }) => rest),
      })),
    },
  })

  if (!pushResult.hasData || !pushResult.data?.assetService) {
    return {
      ok: false,
      message:
        pushResult.failMessage ??
        'Could not sync your saved service visits. Your local changes are safe and will be retried on the next Sync.',
    }
  }

  const assetServiceResult = pushResult.data.assetService
  await applyAssetServiceUpResults(assetServiceResult.visits)

  const failedVisits = assetServiceResult.visits.filter((v) => !v.success)
  if (failedVisits.length > 0) {
    return {
      ok: false,
      message: `${failedVisits.length} saved service visit(s) could not be synced: ${failedVisits
        .map((v) => v.failMessage ?? 'Unknown error')
        .join('; ')}. They will be retried on the next Sync.`,
    }
  }

  return { ok: true }
}

function mapJobRow(row: Record<string, unknown>): LocalJob {
  return {
    ...(row as unknown as LocalJob),
    completed: Boolean(row.completed),
    localStatus: row.local_status as LocalJobStatus,
    localCompletedAt: (row.local_completed_at as string | null) ?? null,
  }
}

function mapAssetRow(row: Record<string, unknown>): LocalAsset {
  return {
    ...(row as unknown as LocalAsset),
    isActive: Boolean(row.isActive),
  }
}

function mapCommonCategoryPropRow(row: Record<string, unknown>): LocalCommonCategoryProp {
  return {
    ...(row as unknown as LocalCommonCategoryProp),
    ctrlIsMandatory: Boolean(row.ctrlIsMandatory),
  }
}

function mapAssetPropertyRow(row: Record<string, unknown>): LocalAssetProperty {
  return {
    ...(row as unknown as LocalAssetProperty),
    localModified: Boolean(row.local_modified),
    localCreated: Boolean(row.local_created),
  }
}

function mapAssetServiceHistoryRow(row: Record<string, unknown>): LocalAssetServiceHistory {
  return {
    ...(row as unknown as LocalAssetServiceHistory),
    synced: Boolean(row.synced),
  }
}

function mapAssetServicePropertyRow(row: Record<string, unknown>): LocalAssetServiceProperty {
  return {
    ...(row as unknown as LocalAssetServiceProperty),
    serviceFlag: Boolean(row.serviceFlag),
  }
}

function mapJobDocumentRow(row: Record<string, unknown>): LocalJobDocument {
  return {
    ...(row as unknown as LocalJobDocument),
    synced: Boolean(row.synced),
  }
}
