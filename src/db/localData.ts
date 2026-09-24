import { clearStaleTransaction, getDb, persist } from './sqlite'
import { syncDown, syncUp } from '../api/syncV2'
import { completeJobOnServer } from '../api/syncV2'
import { reconcileCrewClock } from './crew'
import type {
  SyncUpRequestDto,
  EmployeeTimeUpDto,
  JobUpDto,
  LiveSyncUpDto,
  SyncV2AssetDto,
  SyncV2AssetPropertyDto,
  SyncV2CommonCategoryDto,
  SyncV2CommonCategoryPropDto,
  SyncV2CustomerDto,
  SyncV2EmployeeDto,
  SyncV2EmployeeTimeDto,
  SyncV2JobCrewDto,
  SyncV2SettingDto,
  SyncDownRequestDto,
  SyncV2ResponseDto,
  SyncV2SiteDto,
} from '../api/syncV2Types'

/**
 * App-side workflow state of a job, kept next to the legacy DispatchStatus:
 *  open      - not started on this device
 *  wip       - the device's current job (db/jobState.ts; DispatchStatus 30/35/37)
 *  paused    - started, then paused (DispatchStatus 40)
 *  completed - completed on the device (DispatchStatus 50) - hidden from the list
 *  declined  - declined on the device (DispatchStatus 04) - hidden from the list
 */
export type LocalJobStatus = 'open' | 'wip' | 'paused' | 'completed' | 'declined'

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

// Column lists of the legacy-named core tables, in schema.ts order (minus
// ServiceRecord's app-only local_* columns). Kept here, next to the code
// that writes them, so an added column is a two-line change (schema + list).
const SERVICE_RECORD_COLUMNS = [
  'SerRecID', 'SiteSystemID', 'DocketRef', 'SiteID', 'CallReceivedDT', 'CallType', 'ProbDesc',
  'StartDT', 'FinishDT', 'Status', 'Completed', 'ServiceType', 'Description', 'Report',
  'DatePromisedDT', 'Time_Frame', 'ScheduledDate', 'ScheduledEndDate', 'SchDays', 'SchHours',
  'SchMinutes', 'CallerName', 'PrevMaintCarriedOut', 'EmpIDs', 'CallModifiedBy', 'CallModifiedOn',
  'System', 'Updated', 'JobNumber', 'Priority', 'DispatchEng', 'DispatchStatus',
  'DispatchStatusDesc', 'TimeEst', 'Labour', 'CallToConfirm', 'Installation', 'Maintenancectrl',
  'EmergencyService', 'TemporaryDC', 'Cause', 'Sent', 'SerRec_GUID', 'RiskAssessment',
  'RiskAssessmentDate', 'Deleted', 'ReferenceJob', 'CustContID', 'DocTempMapping',
] as const

const ALARM_SITE_COLUMNS = [
  'SiteID', 'SiteRef', 'Address', 'Town', 'County', 'AreaCode', 'Telephone', 'PostCode', 'CustID',
  'CommissionedBy', 'DateInstalled', 'InstalledYN', 'MonCompany', 'CPanelProdID', 'PanelLocation',
  'Occupant', 'GardaURN', 'Installer', 'DigiNo', 'RenewalDate', 'MonFee', 'LastModified',
  'ModifiedBy', 'CustomerType', 'RadioID', 'LabourRate', 'PercentRate', 'Updated', 'ContractNo',
  'Latitude', 'Longitude', 'Note', 'Email_Site', 'SC_Emails', 'UserDefined1', 'UserDefined2',
  'UserDefined3', 'UserDefined4', 'Password', 'UserCode', 'Alarmsite_GUID', 'Deleted', 'Sent',
  'DigiType', 'EngCode', 'SiteSMSNumbers', 'PremiseType', 'AlarmType', 'URNAppliedForDate',
  'NSAICertNo', 'FireAuthority', 'PoliceAuthority', 'InstallationId',
] as const

const CUSTOMER_COLUMNS = [
  'CustID', 'AccountsRef', 'Prefix', 'FirstName', 'LastName', 'EmailAddress', 'OrganizationName',
  'Address', 'Town', 'County', 'Country', 'AreaCode', 'HomePhone', 'MobilePhone', 'WorkPhone',
  'DirectDebit', 'Updated', 'Deleted',
] as const

const TBL_ASSET_COLUMNS = [
  'AssetGUID', 'AssetName', 'AssetDesc', 'AssetType', 'ContractID', 'MaintIntervalUnit',
  'MaintInterval', 'TemplateID', 'SiteID', 'IsRental', 'NextServiceDate', 'LastServiceDate',
  'Location', 'SerialNo', 'Number', 'AssetModel', 'InstallDate', 'CreatedOn', 'CreatedBy',
  'UpdatedOn', 'UpdatedBy', 'IsActive', 'LockedDateTime', 'IsLocked', 'LockedByUser',
  'LockedSerRecId', 'IsRequired',
  // Sent / Deleted exist on the legacy local table but not in the sync
  // payload - left out of the INSERT so the schema default (0) applies.
] as const

const EMPLOYEE_COLUMNS = [
  'EmployeeID', 'Title', 'FirstName', 'MiddleName', 'LastName', 'MobilePhone', 'WorkPhone',
  'IsEngineer', 'Updated',
] as const

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

/** Column name -> the SyncV2 DTO key httpClient produces for it (first letter lower-cased). */
function dtoKey(column: string): string {
  return column.charAt(0).toLowerCase() + column.slice(1)
}

/** Reads a DTO in schema column order, storing booleans as 0/1 and undefined as NULL. */
function columnValues(dto: object, columns: readonly string[]): unknown[] {
  const record = dto as Record<string, unknown>
  return columns.map((column) => {
    const value = record[dtoKey(column)]
    if (value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
}

/**
 * Applies a SyncDown bundle to the local tables in one transaction. The four
 * core tables are the legacy MAUI names (ServiceRecord / AlarmSite /
 * Customer / TblAsset) with the legacy column spellings.
 *
 *  - data.fullSync = true:  the synced tables are cleared and re-filled
 *    (the original "replace everything" behaviour).
 *  - data.fullSync = false: a delta - rows in the bundle are upserted
 *    (INSERT OR REPLACE on each table's primary key) over what's already
 *    here, nothing else is touched, and the jobs in data.delJobIds are
 *    removed because they are no longer this engineer's.
 *
 * In both modes each job's local-only workflow state (local_status /
 * local_completed_at) is looked up by serRecId first and reapplied to the
 * incoming row, so a job the engineer already started (or completed but
 * hasn't dropped off the next sync yet) doesn't lose that state under their
 * feet. The server's syncDateTime is stored as `serverSyncDateTime` and sent
 * back as lastSyncTime on the next partial sync (see buildSyncDownRequest).
 */
export async function upsertSyncData(data: SyncV2ResponseDto): Promise<void> {
  const db = await getDb()

  const existingStatusRes = await db.query(
    'SELECT SerRecID, local_status, local_completed_at FROM ServiceRecord',
  )
  const existingStatus = new Map<number, { status: LocalJobStatus; completedAt: string | null }>()
  for (const row of rowsOf<{ SerRecID: number; local_status: LocalJobStatus; local_completed_at: string | null }>(
    existingStatusRes,
  )) {
    existingStatus.set(row.SerRecID, { status: row.local_status, completedAt: row.local_completed_at })
  }

  // Full sync = wipe and refill; partial = upsert over what's here. Every
  // synced table has a primary key (see schema.ts), which is what makes
  // INSERT OR REPLACE a correct merge.
  const insert = data.fullSync ? 'INSERT' : 'INSERT OR REPLACE'

  await clearStaleTransaction(db)
  await db.beginTransaction()
  try {
    // transaction=false on every statement below: the outer beginTransaction()
    // above already owns the transaction boundary. run()/executeSet() default
    // to wrapping themselves in their own implicit transaction, which fights
    // with (and can silently close) our manually-managed one - passing false
    // keeps everything inside the single explicit begin/commit/rollback.
    if (data.fullSync) {
      await db.run('DELETE FROM ServiceRecord', [], false)
      await db.run('DELETE FROM AlarmSite', [], false)
      await db.run('DELETE FROM Customer', [], false)
      await db.run('DELETE FROM TblAsset', [], false)
      await db.run('DELETE FROM Employee', [], false)
      await db.run('DELETE FROM JobCrew', [], false)
      await db.run('DELETE FROM EzFieldSMSetting', [], false)
      // Time rows still waiting to go up (Sent = 0) are the device's own
      // work and must survive a full refresh; everything else is re-sent.
      await db.run('DELETE FROM EmployeeTime WHERE Sent = 1', [], false)
    } else if (data.delJobIds.length > 0) {
      await db.run(
        `DELETE FROM ServiceRecord WHERE SerRecID IN (${data.delJobIds.map(() => '?').join(', ')})`,
        data.delJobIds,
        false,
      )
      await db.run(
        `DELETE FROM JobCrew WHERE SerRecID IN (${data.delJobIds.map(() => '?').join(', ')})`,
        data.delJobIds,
        false,
      )
    }

    // The four core tables mirror the legacy MAUI local schema column for
    // column (see schema.ts), and the SyncV2 DTO keys are those same column
    // names after httpClient's first-letter lower-casing - so each row is
    // written by walking the column list and reading `dto[camel(column)]`.
    // Booleans are stored as 0/1 like sqlite-net did.
    // On a partial sync a job the device has edited but not yet pushed
    // (Sent = 0 - a status change from jobState.ts) keeps the local copy:
    // the server's row is older by definition, and INSERT OR REPLACE would
    // silently throw the pending change away.
    const unsentJobs = new Set<number>()
    if (!data.fullSync) {
      for (const r of rowsOf<{ SerRecID: number }>(await db.query('SELECT SerRecID FROM ServiceRecord WHERE Sent = 0'))) {
        unsentJobs.add(r.SerRecID)
      }
    }
    const incomingJobs = data.serviceRecord.filter((job) => !unsentJobs.has(job.serRecID))

    if (incomingJobs.length > 0) {
      await db.executeSet(
        incomingJobs.map((job) => {
          const preserved = existingStatus.get(job.serRecID)
          return {
            statement: `${insert} INTO ServiceRecord (
              ${SERVICE_RECORD_COLUMNS.join(', ')}, local_status, local_completed_at
            ) VALUES (${placeholders(SERVICE_RECORD_COLUMNS.length + 2)})`,
            values: [
              ...columnValues(job, SERVICE_RECORD_COLUMNS),
              preserved?.status ?? 'open',
              preserved?.completedAt ?? null,
            ],
          }
        }),
        false,
      )
    }

    if (data.alarmSite.length > 0) {
      await db.executeSet(
        data.alarmSite.map((site: SyncV2SiteDto) => ({
          statement: `${insert} INTO AlarmSite (${ALARM_SITE_COLUMNS.join(', ')})
            VALUES (${placeholders(ALARM_SITE_COLUMNS.length)})`,
          values: columnValues(site, ALARM_SITE_COLUMNS),
        })),
        false,
      )
    }

    if (data.customer.length > 0) {
      await db.executeSet(
        data.customer.map((cust: SyncV2CustomerDto) => ({
          statement: `${insert} INTO Customer (${CUSTOMER_COLUMNS.join(', ')})
            VALUES (${placeholders(CUSTOMER_COLUMNS.length)})`,
          values: columnValues(cust, CUSTOMER_COLUMNS),
        })),
        false,
      )
    }

    if (data.asset.length > 0) {
      await db.executeSet(
        data.asset.map((asset: SyncV2AssetDto) => ({
          statement: `${insert} INTO TblAsset (${TBL_ASSET_COLUMNS.join(', ')})
            VALUES (${placeholders(TBL_ASSET_COLUMNS.length)})`,
          values: columnValues(asset, TBL_ASSET_COLUMNS),
        })),
        false,
      )
    }

    const employees = data.employee ?? []
    if (employees.length > 0) {
      await db.executeSet(
        employees.map((emp: SyncV2EmployeeDto) => ({
          statement: `${insert} INTO Employee (${EMPLOYEE_COLUMNS.join(', ')})
            VALUES (${placeholders(EMPLOYEE_COLUMNS.length)})`,
          values: columnValues(emp, EMPLOYEE_COLUMNS),
        })),
        false,
      )
    }

    // Server copies of this engineer's time rows. A row this device has
    // written but not yet pushed (Sent = 0) wins over the server's copy -
    // the device's version is newer by definition - so those GUIDs are
    // skipped; everything else is upserted as already-sent (Sent = 1).
    const employeeTimes = data.employeeTime ?? []
    if (employeeTimes.length > 0) {
      const unsentRes = await db.query('SELECT tblEmployeeTime_GUID FROM EmployeeTime WHERE Sent = 0')
      const unsent = new Set(
        rowsOf<{ tblEmployeeTime_GUID: string }>(unsentRes).map((r) => r.tblEmployeeTime_GUID.toUpperCase()),
      )
      const incoming = employeeTimes.filter((t) => !unsent.has(t.employeeTimeGuid.toUpperCase()))
      if (incoming.length > 0) {
        await db.executeSet(
          incoming.map((t: SyncV2EmployeeTimeDto) => ({
            statement: `INSERT OR REPLACE INTO EmployeeTime (
              tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, FinishDT, RateHour, TimeHours, Activity, Updated, Deleted, Sent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
            values: [
              t.employeeTimeGuid.toUpperCase(),
              t.serviceID,
              t.employeeID,
              t.startDT,
              t.finishDT,
              t.rateHour,
              t.timeHours,
              t.activity,
              t.updated,
            ],
          })),
          false,
        )
      }
    }

    // JobCrew has no Updated column, so the server sends every row for
    // every job in the bundle each time: replace per job (delete that
    // job's rows, insert what arrived). A job that arrived with no crew
    // rows keeps none.
    const crewRows = data.jobCrew ?? []
    if (!data.fullSync) {
      const jobIdsInBundle = Array.from(new Set(data.serviceRecord.map((j) => j.serRecID)))
      const crewJobIds = Array.from(new Set(crewRows.map((c) => c.serRecID)))
      const toClear = Array.from(new Set([...jobIdsInBundle, ...crewJobIds]))
      if (toClear.length > 0) {
        await db.run(`DELETE FROM JobCrew WHERE SerRecID IN (${placeholders(toClear.length)})`, toClear, false)
      }
    }
    if (crewRows.length > 0) {
      await db.executeSet(
        crewRows.map((c: SyncV2JobCrewDto) => ({
          statement: `INSERT OR REPLACE INTO JobCrew (ID, SerRecID, EngName, ScheduledStart, ScheduledEnd, JobType, NewSerRecID, SplitIntoDaily)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [c.iD, c.serRecID, c.engName, c.scheduledStart, c.scheduledEnd, c.jobType, c.newSerRecID, c.splitIntoDaily ? 1 : 0],
        })),
        false,
      )
    }

    const settingRows = data.setting ?? []
    if (settingRows.length > 0) {
      await db.executeSet(
        settingRows.map((s: SyncV2SettingDto) => ({
          statement: `INSERT OR REPLACE INTO EzFieldSMSetting (Engineer, SettingID, SettingValue, Updated) VALUES (?, ?, ?, ?)`,
          values: [s.engineer, s.settingID, s.settingValue, s.updated],
        })),
        false,
      )
    }

    // common_categories / common_category_props are pure reference/config
    // data - never edited on the device, so a full replace is safe (same as
    // sites/customers/assets above).
    if (data.fullSync) {
      await db.run('DELETE FROM common_categories', [], false)
      await db.run('DELETE FROM common_category_props', [], false)
    }

    if (data.commonCategories.length > 0) {
      await db.executeSet(
        data.commonCategories.map((cat: SyncV2CommonCategoryDto) => ({
          statement: `${insert} INTO common_categories (
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
          statement: `${insert} INTO common_category_props (
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
    // The SERVER's clock, not ours - the API compares its Updated columns
    // against exactly this value on the next partial sync, so it must go
    // back verbatim (including the daylight-saving shift the API applies).
    await db.run(
      `INSERT INTO app_meta (key, value) VALUES ('serverSyncDateTime', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [data.syncDateTime],
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

/** The syncDateTime the server returned on the last successful SyncDown, or null if never synced. */
export async function getServerSyncDateTime(): Promise<string | null> {
  const db = await getDb()
  const res = await db.query("SELECT value FROM app_meta WHERE key = 'serverSyncDateTime'")
  const rows = rowsOf<{ value: string }>(res)
  return rows[0]?.value ?? null
}

export type SyncDownMode = 'full' | 'partial'

/**
 * Builds the SyncDown request from local state. A 'partial' request with no
 * stored serverSyncDateTime (never synced, or upgraded from a build that
 * didn't store it) is promoted to a full sync - there is nothing to diff
 * against, and the API would treat it as full anyway.
 */
export async function buildSyncDownRequest(mode: SyncDownMode): Promise<SyncDownRequestDto> {
  const lastSyncTime = mode === 'partial' ? await getServerSyncDateTime() : null
  if (mode === 'full' || !lastSyncTime) {
    return { fullSync: true }
  }

  const db = await getDb()
  const jobs = rowsOf<{ serRecId: number }>(await db.query('SELECT SerRecID AS serRecId FROM ServiceRecord'))
  const sites = rowsOf<{ siteId: number }>(await db.query('SELECT SiteID AS siteId FROM AlarmSite'))

  return {
    fullSync: false,
    lastSyncTime,
    verifiedJobIds: jobs.map((r) => r.serRecId),
    verifiedSiteIds: sites.map((r) => r.siteId),
  }
}

export type SyncDownResult =
  | { ok: true; fullSync: boolean; crewClockClosed: boolean }
  | { ok: false; message: string }

/**
 * The one entry point for pulling data down: builds the request for the
 * requested mode, calls the API and applies the bundle via upsertSyncData.
 * Network / API errors are returned, not thrown, so each screen only has to
 * decide what to show. Used by LoginPage (first sign-in -> 'full'),
 * UtilitiesPage (manual sync -> 'partial', "replace local data" -> 'full')
 * and JobListPage's pull-to-refresh ('partial').
 */
export async function syncDownAndStore(mode: SyncDownMode): Promise<SyncDownResult> {
  try {
    const request = await buildSyncDownRequest(mode)
    const result = await syncDown(request)
    if (!result.hasData || !result.data) {
      return { ok: false, message: result.failMessage ?? 'Sync failed.' }
    }
    await upsertSyncData(result.data)
    // A crew job the lead has completed drops out of the bundle - close the
    // crew member's running clock so their hours still go up.
    const crewClockClosed = await reconcileCrewClock()
    if (crewClockClosed) void tryPushPendingLocalChanges()
    return { ok: true, fullSync: result.data.fullSync, crewClockClosed }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not reach the server.',
    }
  }
}

/** Open (not-yet-completed-locally) jobs, most urgent first. */
export async function getOpenJobs(): Promise<LocalJob[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT * FROM ServiceRecord WHERE local_status NOT IN ('completed', 'declined')
     ORDER BY Priority DESC, ScheduledDate ASC`,
  )
  return rowsOf<Record<string, unknown>>(res).map(mapJobRow)
}

export async function getJobById(serRecId: number): Promise<LocalJob | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM ServiceRecord WHERE SerRecID = ?', [serRecId])
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapJobRow(rows[0]) : null
}

/** The one job (if any) currently in progress - only one is allowed at a time. */
export async function getWipJob(): Promise<LocalJob | null> {
  const db = await getDb()
  const res = await db.query("SELECT * FROM ServiceRecord WHERE local_status = 'wip' LIMIT 1")
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapJobRow(rows[0]) : null
}

export async function getSiteById(siteId: number): Promise<LocalSite | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM AlarmSite WHERE SiteID = ?', [siteId])
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapSiteRow(rows[0]) : null
}

export async function getCustomerById(custId: number): Promise<LocalCustomer | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM Customer WHERE CustID = ?', [custId])
  const rows = rowsOf<Record<string, unknown>>(res)
  return rows[0] ? mapCustomerRow(rows[0]) : null
}

export async function getAssetsBySite(siteId: number): Promise<LocalAsset[]> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM TblAsset WHERE SiteID = ? ORDER BY AssetName', [siteId])
  return rowsOf<Record<string, unknown>>(res).map(mapAssetRow)
}

export async function getAssetByGuid(assetGuid: string): Promise<LocalAsset | null> {
  const db = await getDb()
  const res = await db.query('SELECT * FROM TblAsset WHERE AssetGUID = ?', [assetGuid])
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

  await clearStaleTransaction(db)
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

  await clearStaleTransaction(db)
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
  await clearStaleTransaction(db)
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
 * Result of pushPendingLocalChanges - a plain success/failure shape so
 * callers (UtilitiesPage.handleSync, WipPage, JobDetailPage) can each show
 * their own error text without duplicating the push logic itself.
 */
export interface PushedCounts {
  visits: number
  jobs: number
  times: number
  locations: number
  completions: number
}

export type PushPendingResult = { ok: true; pushed: PushedCounts } | { ok: false; message: string; pushed: PushedCounts }

/** "Sent 2 job updates and 5 time records" - or null when nothing went up. */
export function describePushed(p: PushedCounts): string | null {
  const parts: string[] = []
  if (p.jobs) parts.push(`${p.jobs} job update${p.jobs === 1 ? '' : 's'}`)
  if (p.times) parts.push(`${p.times} time record${p.times === 1 ? '' : 's'}`)
  if (p.visits) parts.push(`${p.visits} service visit${p.visits === 1 ? '' : 's'}`)
  if (p.locations) parts.push(`${p.locations} location update${p.locations === 1 ? '' : 's'}`)
  if (p.completions) parts.push(`${p.completions} completion${p.completions === 1 ? '' : 's'}`)
  if (parts.length === 0) return null
  return `Sent ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]}`
}

/** @deprecated name kept for older call sites - see PushPendingResult. */
export type PushPendingAssetServiceResult = PushPendingResult

const PENDING_COMPLETIONS_KEY = 'pendingCompleteJobIds'

/**
 * Jobs completed on the device whose server-side CompleteJob call (asset
 * history status + completion PDF/email - see SyncV2Service.CompleteJob)
 * has not succeeded yet. The job's DispatchStatus 50 itself travels up
 * through SyncUp like any other status; this list only exists so the
 * completion email is never lost when the engineer was offline at the
 * moment they pressed Complete. Retried by pushPendingLocalChanges.
 */
export async function getPendingCompletions(): Promise<number[]> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [PENDING_COMPLETIONS_KEY])
  const raw = rowsOf<{ value: string | null }>(res)[0]?.value
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

async function setPendingCompletions(ids: number[]): Promise<void> {
  const db = await getDb()
  await db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [PENDING_COMPLETIONS_KEY, JSON.stringify(ids)],
  )
}

export async function addPendingCompletion(serRecId: number): Promise<void> {
  const ids = await getPendingCompletions()
  if (!ids.includes(serRecId)) {
    ids.push(serRecId)
    await setPendingCompletions(ids)
    await persist()
  }
}

async function removePendingCompletion(serRecId: number): Promise<void> {
  const ids = await getPendingCompletions()
  await setPendingCompletions(ids.filter((id) => id !== serRecId))
}

/** ServiceRecord rows edited on the device (Sent = 0), shaped as the API's JobUpRequest. */
async function getPendingJobRows(): Promise<JobUpDto[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT SerRecID, CallType, ProbDesc, StartDT, FinishDT, Report, ScheduledDate, ScheduledEndDate,
            PrevMaintCarriedOut, System, DispatchEng, Installation, Maintenancectrl, EmergencyService,
            TemporaryDC, DispatchStatus, Cause, SerRec_GUID
     FROM ServiceRecord WHERE Sent = 0`,
  )
  const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v))
  return rowsOf<Record<string, unknown>>(res).map((r) => ({
    serRecID: r.SerRecID as number,
    callType: (r.CallType as number | null) ?? null,
    probDesc: (r.ProbDesc as string | null) ?? null,
    startDT: (r.StartDT as string | null) ?? null,
    finishDT: (r.FinishDT as string | null) ?? null,
    report: (r.Report as string | null) ?? null,
    scheduledDate: (r.ScheduledDate as string | null) ?? null,
    scheduledEndDate: (r.ScheduledEndDate as string | null) ?? null,
    prevMaintCarriedOut: Boolean(r.PrevMaintCarriedOut),
    system: (r.System as string | null) ?? null,
    dispatchEng: (r.DispatchEng as string | null) ?? null,
    installation: bool(r.Installation),
    maintenancectrl: bool(r.Maintenancectrl),
    emergencyService: bool(r.EmergencyService),
    temporaryDC: bool(r.TemporaryDC),
    dispatchStatus: (r.DispatchStatus as string | null) ?? null,
    cause: (r.Cause as string | null) ?? null,
    serRec_GUID: (r.SerRec_GUID as string | null) ?? null,
  }))
}

/**
 * EmployeeTime rows not yet on the server - including rows still open
 * (FinishDT NULL: the team is on the job right now), exactly like the
 * legacy app's "WHERE Sent=0": the office then sees who is clocked on, and
 * the row goes up again (Sent is reset to 0) when the next state change
 * closes it, upserting the FinishDT/TimeHours over the open copy.
 */
async function getPendingTimeRows(): Promise<EmployeeTimeUpDto[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, FinishDT, TimeHours, Activity
     FROM EmployeeTime WHERE Sent = 0 AND Deleted = 0`,
  )
  return rowsOf<{
    tblEmployeeTime_GUID: string
    ServiceID: number
    EmployeeID: string
    StartDT: string
    FinishDT: string | null
    TimeHours: number | null
    Activity: string | null
  }>(res).map((r) => ({
    tblEmployeeTime_GUID: r.tblEmployeeTime_GUID,
    serviceID: r.ServiceID,
    employeeID: r.EmployeeID,
    startDT: r.StartDT,
    finishDT: r.FinishDT,
    timeHours: r.TimeHours,
    activity: r.Activity,
  }))
}

/**
 * Marks confirmed rows as sent. GUID keys are compared case-insensitively:
 * the device writes them upper-case (like the legacy app) while .NET
 * serialises System.Guid lower-case.
 */
/** TblLiveSync rows not yet on the server, shaped as the API's LiveSyncUpRequest. */
async function getPendingLiveSyncRows(): Promise<LiveSyncUpDto[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT ID, EmpID, Latitude, Longitude, Activity, SerRecID, Updated, StateChange, ETA, New_GPS, Team
     FROM TblLiveSync WHERE Sent = 0 ORDER BY Updated`,
  )
  return rowsOf<Record<string, unknown>>(res).map((r) => ({
    id: r.ID as string,
    empID: r.EmpID as string,
    latitude: (r.Latitude as string | null) ?? null,
    longitude: (r.Longitude as string | null) ?? null,
    activity: (r.Activity as string | null) ?? null,
    serRecID: (r.SerRecID as number | null) ?? null,
    updated: (r.Updated as string | null) ?? null,
    stateChange: Boolean(r.StateChange),
    eta: (r.ETA as string | null) ?? null,
    newGPS: Boolean(r.New_GPS),
    team: (r.Team as string | null) ?? null,
  }))
}

async function markSent(
  table: 'ServiceRecord' | 'EmployeeTime' | 'TblLiveSync',
  keyColumn: string,
  keys: unknown[],
): Promise<void> {
  if (keys.length === 0) return
  const db = await getDb()
  const isText = table !== 'ServiceRecord'
  await db.run(
    `UPDATE ${table} SET Sent = 1 WHERE ${isText ? `upper(${keyColumn})` : keyColumn} IN (${placeholders(keys.length)})`,
    isText ? keys.map((k) => String(k).toUpperCase()) : keys,
  )
}

/**
 * Pushes EVERYTHING the device has saved and not yet sent up through the
 * single common SyncUp endpoint in one request - Asset Service visits, job
 * status/time edits (ServiceRecord rows with Sent = 0, written by
 * db/jobState.ts) and closed employee time rows (EmployeeTime with Sent = 0)
 * - then applies the result back: confirmed keys are marked Sent = 1 /
 * synced, failed ones are left pending so the next push retries them.
 * Finally, any job completed on the device while offline gets its
 * server-side CompleteJob call retried (see getPendingCompletions).
 *
 * Shared by UtilitiesPage's manual Sync (push-then-pull), WipPage's
 * Complete Job and the best-effort push after every job state change. A
 * no-op (returns { ok: true } immediately) when there is nothing pending.
 * Local data is left untouched on any failure - the caller decides what to
 * show; nothing is ever lost because every row keeps its Sent = 0 flag
 * until the server confirms it.
 */
export async function pushPendingLocalChanges(): Promise<PushPendingResult> {
  const [pendingVisits, pendingJobs, pendingTimes, pendingLocations, pendingCompletions] = await Promise.all([
    getPendingAssetServiceVisits(),
    getPendingJobRows(),
    getPendingTimeRows(),
    getPendingLiveSyncRows(),
    getPendingCompletions(),
  ])

  const problems: string[] = []
  const pushed: PushedCounts = { visits: 0, jobs: 0, times: 0, locations: 0, completions: 0 }

  if (pendingVisits.length > 0 || pendingJobs.length > 0 || pendingTimes.length > 0 || pendingLocations.length > 0) {
    const pushResult = await syncUp({
      deviceDateTime: new Date().toISOString(),
      assetService:
        pendingVisits.length > 0
          ? {
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
            }
          : undefined,
      serviceRecord: pendingJobs.length > 0 ? pendingJobs : undefined,
      employeeTime: pendingTimes.length > 0 ? pendingTimes : undefined,
      liveSync: pendingLocations.length > 0 ? pendingLocations : undefined,
    })

    if (!pushResult.hasData || !pushResult.data) {
      return {
        ok: false,
        pushed,
        message:
          pushResult.failMessage ??
          'Could not sync your saved work. Your local changes are safe and will be retried on the next Sync.',
      }
    }

    const data = pushResult.data

    if (pendingVisits.length > 0) {
      if (data.assetService) {
        await applyAssetServiceUpResults(data.assetService.visits)
        pushed.visits = data.assetService.visits.filter((v) => v.success).length
        const failedVisits = data.assetService.visits.filter((v) => !v.success)
        if (failedVisits.length > 0) {
          problems.push(
            `${failedVisits.length} saved service visit(s) could not be synced: ${failedVisits
              .map((v) => v.failMessage ?? 'Unknown error')
              .join('; ')}`,
          )
        }
      } else {
        problems.push('The server did not acknowledge the saved service visits')
      }
    }

    if (pendingJobs.length > 0) {
      const confirmed = data.serviceRecord?.confirmed ?? []
      await markSent('ServiceRecord', 'SerRecID', confirmed)
      pushed.jobs = confirmed.length
      const failed = data.serviceRecord?.failed ?? []
      if (failed.length > 0) {
        problems.push(
          `${failed.length} job update(s) could not be synced: ${failed
            .map((f) => `#${f.key}: ${f.failMessage ?? 'Unknown error'}`)
            .join('; ')}`,
        )
      }
    }

    if (pendingTimes.length > 0) {
      const confirmed = data.employeeTime?.confirmed ?? []
      await markSent('EmployeeTime', 'tblEmployeeTime_GUID', confirmed)
      pushed.times = confirmed.length
      const failed = data.employeeTime?.failed ?? []
      if (failed.length > 0) {
        problems.push(`${failed.length} time record(s) could not be synced`)
      }
    }

    if (pendingLocations.length > 0) {
      // The server only keeps the 5 most recent breadcrumbs and acknowledges
      // the rest as confirmed, so everything confirmed is simply done.
      const confirmed = data.liveSync?.confirmed ?? []
      await markSent('TblLiveSync', 'ID', confirmed)
      pushed.locations = confirmed.length
      // Sent breadcrumbs are of no further use on the device - keep the table small.
      await db_deleteSentLiveSync()
    }

    await persist()
  }

  for (const serRecId of pendingCompletions) {
    try {
      const result = await completeJobOnServer(serRecId)
      if (result.hasData) {
        await removePendingCompletion(serRecId)
        pushed.completions += 1
      } else {
        problems.push(`Job #${serRecId} completion: ${result.failMessage ?? 'not accepted by the server'}`)
      }
    } catch (err) {
      problems.push(`Job #${serRecId} completion: ${err instanceof Error ? err.message : 'could not reach the server'}`)
    }
  }
  if (pendingCompletions.length > 0) {
    await persist()
  }

  if (problems.length > 0) {
    return { ok: false, pushed, message: `${problems.join('. ')}. They will be retried on the next Sync.` }
  }
  return { ok: true, pushed }
}

// ---------------------------------------------------------------- background outbox

/**
 * Snapshot of everything pending, for the background heartbeat (see
 * sync/backgroundSync.ts). `stamps` records each row's Updated value at
 * snapshot time so confirmations can be applied later ONLY if the row has
 * not changed again in between (a row edited after the snapshot keeps
 * Sent = 0 and goes up with the next push).
 */
export interface OutboxSnapshot {
  request: SyncUpRequestDto | null
  stamps: {
    jobs: Record<string, string | null>
    times: Record<string, string | null>
    liveSync: string[]
  }
}

export async function getOutboxSnapshot(): Promise<OutboxSnapshot> {
  const [jobs, times, locations] = await Promise.all([getPendingJobRows(), getPendingTimeRows(), getPendingLiveSyncRows()])
  const db = await getDb()
  const jobStamps = rowsOf<{ SerRecID: number; Updated: string | null }>(
    await db.query('SELECT SerRecID, Updated FROM ServiceRecord WHERE Sent = 0'),
  )
  const timeStamps = rowsOf<{ tblEmployeeTime_GUID: string; Updated: string | null }>(
    await db.query('SELECT tblEmployeeTime_GUID, Updated FROM EmployeeTime WHERE Sent = 0 AND Deleted = 0'),
  )
  const empty = jobs.length === 0 && times.length === 0 && locations.length === 0
  return {
    request: empty
      ? null
      : {
          deviceDateTime: new Date().toISOString(),
          serviceRecord: jobs.length > 0 ? jobs : undefined,
          employeeTime: times.length > 0 ? times : undefined,
          liveSync: locations.length > 0 ? locations : undefined,
        },
    stamps: {
      jobs: Object.fromEntries(jobStamps.map((r) => [String(r.SerRecID), r.Updated])),
      times: Object.fromEntries(timeStamps.map((r) => [r.tblEmployeeTime_GUID.toUpperCase(), r.Updated])),
      liveSync: locations.map((l) => l.id.toUpperCase()),
    },
  }
}

export interface OutboxConfirmations {
  serviceRecord?: number[]
  employeeTime?: string[]
  liveSync?: string[]
}

/** Marks rows the background heartbeat got confirmed as Sent = 1 - only if unchanged since the snapshot. */
export async function applyOutboxConfirmations(confirmed: OutboxConfirmations, stamps: OutboxSnapshot['stamps']): Promise<number> {
  const db = await getDb()
  await clearStaleTransaction(db)
  let applied = 0
  for (const id of confirmed.serviceRecord ?? []) {
    const stamp = stamps.jobs[String(id)]
    if (stamp === undefined) continue
    const res = await db.run('UPDATE ServiceRecord SET Sent = 1 WHERE SerRecID = ? AND Sent = 0 AND (Updated IS ? OR Updated = ?)', [id, stamp, stamp])
    applied += res.changes?.changes ?? 0
  }
  for (const guid of confirmed.employeeTime ?? []) {
    const key = guid.toUpperCase()
    const stamp = stamps.times[key]
    if (stamp === undefined) continue
    const res = await db.run(
      'UPDATE EmployeeTime SET Sent = 1 WHERE upper(tblEmployeeTime_GUID) = ? AND Sent = 0 AND (Updated IS ? OR Updated = ?)',
      [key, stamp, stamp],
    )
    applied += res.changes?.changes ?? 0
  }
  const live = (confirmed.liveSync ?? []).map((k) => k.toUpperCase()).filter((k) => stamps.liveSync.includes(k))
  if (live.length > 0) {
    const res = await db.run(`UPDATE TblLiveSync SET Sent = 1 WHERE upper(ID) IN (${placeholders(live.length)})`, live)
    applied += res.changes?.changes ?? 0
  }
  if (applied > 0) await persist()
  return applied
}

async function db_deleteSentLiveSync(): Promise<void> {
  const db = await getDb()
  await db.run("DELETE FROM TblLiveSync WHERE Sent = 1 AND replace(Updated, 'T', ' ') < datetime('now', 'localtime', '-1 day')")
}

/**
 * Fire-and-forget variant used right after a job state change (Travel To,
 * Start, Pause, ...): tries to push, swallows every error - the engineer
 * may well be offline in a plant room - and leaves the rows pending for the
 * next explicit Sync.
 */
export async function tryPushPendingLocalChanges(): Promise<void> {
  try {
    await pushPendingLocalChanges()
  } catch {
    // offline - rows stay Sent = 0 and go up on the next Sync
  }
}

/** @deprecated use pushPendingLocalChanges - kept so older call sites still compile. */
export const pushPendingAssetServiceVisits = pushPendingLocalChanges

// The core tables use the legacy PascalCase column names (see schema.ts),
// while the rest of the app works with the camelCase Local* types below -
// these mappers are the one place that translation happens. Column names
// are quoted exactly as SQLite returns them.

function mapJobRow(row: Record<string, unknown>): LocalJob {
  const s = (k: string) => (row[k] as string | null) ?? null
  const n = (k: string) => (row[k] as number | null) ?? null
  return {
    serRecId: row.SerRecID as number,
    docketRef: s('DocketRef'),
    siteId: n('SiteID'),
    callReceivedDt: s('CallReceivedDT'),
    probDesc: s('ProbDesc'),
    startDt: s('StartDT'),
    finishDt: s('FinishDT'),
    status: s('Status'),
    completed: Boolean(row.Completed),
    serviceType: s('ServiceType'),
    description: s('Description'),
    datePromisedDt: s('DatePromisedDT'),
    timeFrame: s('Time_Frame'),
    scheduledDate: s('ScheduledDate'),
    scheduledEndDate: s('ScheduledEndDate'),
    callerName: s('CallerName'),
    jobNumber: n('JobNumber'),
    priority: n('Priority'),
    dispatchEng: s('DispatchEng'),
    dispatchStatus: s('DispatchStatus'),
    dispatchStatusDesc: s('DispatchStatusDesc'),
    system: s('System'),
    timeEst: (row.TimeEst as number | null) ?? 0,
    localStatus: row.local_status as LocalJobStatus,
    localCompletedAt: s('local_completed_at'),
  }
}

function mapSiteRow(row: Record<string, unknown>): LocalSite {
  const s = (k: string) => (row[k] as string | null) ?? null
  const n = (k: string) => (row[k] as number | null) ?? null
  return {
    siteId: row.SiteID as number,
    siteRef: s('SiteRef'),
    occupant: s('Occupant'),
    address: s('Address'),
    town: s('Town'),
    county: s('County'),
    areaCode: s('AreaCode'),
    postCode: s('PostCode'),
    telephone: s('Telephone'),
    custId: n('CustID'),
    panelLocation: s('PanelLocation'),
    note: s('Note'),
    latitude: n('Latitude'),
    longitude: n('Longitude'),
  }
}

function mapCustomerRow(row: Record<string, unknown>): LocalCustomer {
  const s = (k: string) => (row[k] as string | null) ?? null
  return {
    custId: row.CustID as number,
    organizationName: s('OrganizationName'),
    firstName: s('FirstName'),
    lastName: s('LastName'),
    address: s('Address'),
    town: s('Town'),
    county: s('County'),
    homePhone: s('HomePhone'),
    mobilePhone: s('MobilePhone'),
    workPhone: s('WorkPhone'),
    emailAddress: s('EmailAddress'),
    accountsRef: s('AccountsRef'),
  }
}

function mapAssetRow(row: Record<string, unknown>): LocalAsset {
  const s = (k: string) => (row[k] as string | null) ?? null
  const n = (k: string) => (row[k] as number | null) ?? null
  return {
    assetGuid: row.AssetGUID as string,
    assetName: s('AssetName'),
    assetType: n('AssetType'),
    siteId: n('SiteID'),
    assetModel: s('AssetModel'),
    assetDesc: s('AssetDesc'),
    serialNo: s('SerialNo'),
    number: s('Number'),
    location: s('Location'),
    lastServiceDate: s('LastServiceDate'),
    nextServiceDate: s('NextServiceDate'),
    isActive: Boolean(row.IsActive),
    templateId: n('TemplateID'),
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
