/**
 * Client-side shape of ezServiceHUB.Domain.ApiResponse.SyncV2Response and
 * friends, AFTER httpClient's response interceptor has lower-cased the
 * first letter of every key (see httpClient.ts's toCamelCase). Note this
 * only lowercases the first character, so e.g. `SerRecID` becomes
 * `serRecID` (capital ID preserved), not `serRecId`. Row field names are the
 * legacy MAUI SyncResponse spellings, so underscores and all-caps suffixes
 * survive too: `Time_Frame` -> `time_Frame`, `SerRec_GUID` -> `serRec_GUID`,
 * `AssetGUID` -> `assetGUID`, `TemplateID` -> `templateID`,
 * `Email_Site` -> `email_Site`, `SC_Emails` -> `sC_Emails`.
 */

/**
 * Body for POST /api/MobileV2/SyncV2/SyncDown - mirrors SyncDownV2Request on
 * the API side. Built by db/localData.ts's buildSyncDownRequest() from what
 * the device currently holds; never hand-written at a call site.
 *
 *  - fullSync: true  -> everything, ids/lastSyncTime ignored (first sign-in,
 *                       or a manual "replace local data" from Utilities).
 *  - fullSync: false -> only rows new to this device (jobs/sites not in the
 *                       verified lists) in full, plus rows changed after
 *                       lastSyncTime for everything it already holds.
 */
export interface SyncDownRequestDto {
  fullSync: boolean
  /** The `syncDateTime` from the previous SyncV2ResponseDto, sent back verbatim. */
  lastSyncTime?: string | null
  /** siteId of every row currently in the local `sites` table. */
  verifiedSiteIds?: number[]
  /** serRecId of every row currently in the local `jobs` table. */
  verifiedJobIds?: number[]
}

export interface SyncV2JobDto {
  serRecID: number
  siteSystemID: number | null
  docketRef: string | null
  siteID: number | null
  callReceivedDT: string | null
  callType: number | null
  probDesc: string | null
  startDT: string | null
  finishDT: string | null
  status: string | null
  completed: boolean
  serviceType: string | null
  description: string | null
  report: string | null
  datePromisedDT: string | null
  time_Frame: string | null
  scheduledDate: string | null
  scheduledEndDate: string | null
  schDays: number | null
  schHours: number | null
  schMinutes: number | null
  callerName: string | null
  prevMaintCarriedOut: boolean
  empIDs: string | null
  callModifiedBy: string | null
  callModifiedOn: string | null
  jobNumber: number | null
  priority: number | null
  dispatchEng: string | null
  dispatchStatus: string | null
  dispatchStatusDesc: string | null
  system: string | null
  timeEst: number
  updated: string | null
  labour: number | null
  callToConfirm: boolean | null
  installation: boolean | null
  maintenancectrl: boolean | null
  emergencyService: boolean | null
  temporaryDC: boolean | null
  cause: string | null
  serRec_GUID: string | null
  referenceJob: number | null
  custContID: number | null
  docTempMapping: string | null
  /** Legacy app-side flags - always default from the server. */
  sent: boolean
  riskAssessment: string | null
  riskAssessmentDate: string | null
  deleted: boolean
}

export interface SyncV2SiteDto {
  siteID: number
  siteRef: string | null
  occupant: string | null
  address: string | null
  town: string | null
  county: string | null
  areaCode: string | null
  postCode: string | null
  telephone: string | null
  custID: number | null
  commissionedBy: string | null
  dateInstalled: string | null
  installedYN: boolean
  monCompany: string | null
  cPanelProdID: number | null
  panelLocation: string | null
  gardaURN: string | null
  installer: string | null
  digiNo: string | null
  digiType: string | null
  renewalDate: string | null
  monFee: number | null
  lastModified: string | null
  modifiedBy: string | null
  customerType: string | null
  radioID: string | null
  labourRate: number
  percentRate: number
  updated: string | null
  contractNo: string | null
  latitude: number
  longitude: number
  note: string | null
  email_Site: string | null
  sC_Emails: string | null
  userDefined1: string | null
  userDefined2: string | null
  userDefined3: string | null
  userDefined4: string | null
  password: string | null
  userCode: string | null
  engCode: number | null
  siteSMSNumbers: string | null
  premiseType: string | null
  alarmType: string | null
  uRNAppliedForDate: string | null
  nSAICertNo: string | null
  fireAuthority: string | null
  policeAuthority: string | null
  installationId: string | null
  alarmsite_GUID: string | null
  deleted: boolean
  sent: boolean
}

export interface SyncV2CustomerDto {
  custID: number
  accountsRef: string | null
  prefix: string | null
  organizationName: string | null
  firstName: string | null
  lastName: string | null
  emailAddress: string | null
  address: string | null
  town: string | null
  county: string | null
  country: string | null
  areaCode: string | null
  homePhone: string | null
  mobilePhone: string | null
  workPhone: string | null
  updated: string | null
  directDebit: boolean
  deleted: boolean
}

export interface SyncV2AssetDto {
  assetGUID: string
  assetName: string | null
  assetDesc: string | null
  assetType: number
  contractID: number
  maintIntervalUnit: string | null
  maintInterval: number
  siteID: number | null
  assetModel: string | null
  serialNo: string | null
  number: string | null
  location: string | null
  installDate: string | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  isActive: boolean
  isRental: boolean
  createdOn: string | null
  createdBy: string | null
  updatedOn: string | null
  updatedBy: string | null
  lockedDateTime: string | null
  isLocked: boolean
  lockedByUser: string | null
  lockedSerRecId: number
  /** Links to SyncV2CommonCategoryDto.templateId - which form this asset uses. */
  templateID: number | null
  /** Legacy app-side flag - always default from the server. */
  isRequired: boolean
}

/** Db.Employees (engineers with an app login) - SyncV2Response.Employee. */
export interface SyncV2EmployeeDto {
  employeeID: string
  title: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  mobilePhone: string | null
  workPhone: string | null
  isEngineer: boolean | null
  updated: string | null
}

/** Db.EzFieldSMSetting rows for "All" + this engineer - SyncV2Response.Setting. */
export interface SyncV2SettingDto {
  engineer: string
  settingID: string
  settingValue: string | null
  updated: string | null
}

/** Db.JobCrew for every job in the bundle (all engineers' rows) - SyncV2Response.JobCrew. */
export interface SyncV2JobCrewDto {
  iD: number
  serRecID: number
  engName: string
  scheduledStart: string | null
  scheduledEnd: string | null
  jobType: string | null
  newSerRecID: number | null
  splitIntoDaily: boolean
}

/** Db.tblEmployeeTime for the engineer's jobs - SyncV2Response.EmployeeTime. */
export interface SyncV2EmployeeTimeDto {
  employeeTimeGuid: string
  serviceID: number
  employeeID: string
  startDT: string
  finishDT: string | null
  rateHour: number | null
  timeHours: number | null
  updated: string | null
  activity: string | null
}

/**
 * One "form" definition for the dynamic Asset Service information screen -
 * matched to assets via templateId. Pure reference/config data.
 */
export interface SyncV2CommonCategoryDto {
  categoryId: number
  type: number | null
  name: string | null
  propCount: number | null
  templateId: number | null
  templateType: string | null
}

/**
 * One dynamic field definition within a category/form. categoryType 0 =
 * header field (single value per asset), 1 = detail/grid field (many rows
 * per asset). propColRefNo (1-50) says which AssetProperties value{N} this
 * field's value lives in. ctrlProps holds Select options as JSON, e.g.
 * `[{"value":""},{"value":"Yes"}]`.
 */
export interface SyncV2CommonCategoryPropDto {
  propsId: number
  categoryId: number
  categoryType: number | null
  name: string | null
  ctrlType: string | null
  ctrlWidth: number | null
  ctrlOrder: number | null
  ctrlisMandatory: boolean | null
  ctrlDefaultVal: string | null
  ctrlProps: string | null
  propColRefNo: number | null
  code: string | null
}

/** One row of captured dynamic values for an asset - see AssetValueMap for the value1..value50 access helper. */
export interface SyncV2AssetPropertyDto {
  assetPropId: number
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
}

/**
 * The SyncDown bundle. Every list is filtered the same way server-side: on a
 * full sync it holds everything, on a partial sync only what is new to this
 * device or changed since lastSyncTime (see SyncScope.cs). Lists are never
 * null - empty means nothing to apply.
 *
 * Only the tables the app stores locally today are typed individually. The
 * legacy MAUI tables the API now also sends (employeeTime, jobFileTable,
 * customCheckList, assetService, assetServiceMap, partsUsed, keyHolder,
 * imageTable, custContract, tblCallType, product, setting, employee,
 * systemType, causeActionTakenList, delTables, assetType,
 * messageTemplate, siteSystems, alarmTypes, policeAuthorities,
 * fireAuthorities, premiseTypes, templateMappings) arrive as well - give
 * one a real Dto + local table when a screen needs it; until then the
 * index signature lets them through untyped and upsertSyncData ignores them.
 */
export interface SyncV2ResponseDto {
  /** Echo of the request's fullSync - tells upsertSyncData whether to replace or merge. */
  fullSync: boolean
  /** Server time at the start of this sync; store it and send it back as lastSyncTime next time. */
  syncDateTime: string
  /** Partial sync only: jobs the device holds that are no longer this engineer's - delete locally. */
  delJobIds: number[]
  // List names match the legacy MAUI SyncResponse (ServiceRecord, AlarmSite,
  // Customer, Asset...) after camelCasing, so both APIs read alike.
  serviceRecord: SyncV2JobDto[]
  alarmSite: SyncV2SiteDto[]
  customer: SyncV2CustomerDto[]
  asset: SyncV2AssetDto[]
  commonCategories: SyncV2CommonCategoryDto[]
  commonCategoryProps: SyncV2CommonCategoryPropDto[]
  assetProperties: SyncV2AssetPropertyDto[]
  employee: SyncV2EmployeeDto[]
  employeeTime: SyncV2EmployeeTimeDto[]
  jobCrew?: SyncV2JobCrewDto[]
  setting?: SyncV2SettingDto[]
  [legacyTable: string]: unknown
}

/**
 * The AssetService portion of the common POST /api/MobileV2/SyncV2/SyncUp
 * request/response body (see SyncUpRequestDto/SyncUpResponseDto below) -
 * mirrors AssetServiceUpRequest/AssetServiceUpResponse on the API side
 * (ezServiceHUB.Domain.ApiRequest / ApiResponse). Request bodies don't go
 * through httpClient's PascalCase->camelCase conversion (that's
 * response-only, see httpClient.ts) - ASP.NET Core's model binding is
 * case-insensitive, so these plain camelCase shapes bind fine as-is.
 */
export interface AssetServicePropertyUpDto {
  localId: string
  assetPropId: number | null
  type: number | null
  /** true = serviced, false = not serviced. No legacy-master equivalent. */
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

export interface AssetServiceVisitUpDto {
  serviceHisId: string
  assetGuid: string
  serRecId: number
  serviceDate: string | null
  status: number | null
  properties: AssetServicePropertyUpDto[]
}

export interface AssetServiceUpRequestDto {
  visits: AssetServiceVisitUpDto[]
}

export interface AssetServicePropertyUpResultDto {
  localId: string
  assetPropId: number
}

export interface AssetServiceVisitUpResultDto {
  serviceHisId: string
  success: boolean
  failMessage: string | null
  properties: AssetServicePropertyUpResultDto[]
}

export interface AssetServiceUpResponseDto {
  visits: AssetServiceVisitUpResultDto[]
}

/**
 * The single common request/response body for POST
 * /api/MobileV2/SyncV2/SyncUp - the one endpoint the app pushes ALL
 * locally-saved data up through, regardless of which feature produced it
 * (see SyncUpRequest/SyncUpResponse on the API side). Each kind of
 * transaction gets its own optional property here; build the request with only the properties you actually have
 * pending data for, matching the API's "only populated properties are
 * processed" contract.
 *
 * Adding a new synced transaction type later means adding one more
 * optional property here (and its matching Dto shape), never a new
 * endpoint or a new api/*.ts client function.
 */
export interface SyncUpRequestDto {
  /** Device clock (ISO 8601) when the request was built - audit only. */
  deviceDateTime?: string
  assetService?: AssetServiceUpRequestDto
  /** Job status/time edits made on the device - JobUpRequest on the API side. */
  serviceRecord?: JobUpDto[]
  /** Closed EmployeeTime rows not yet on the server - EmployeeTimeUpRequest on the API side. */
  employeeTime?: EmployeeTimeUpDto[]
  /** Location / ETA breadcrumbs (legacy TblLiveSync) - LiveSyncUpRequest on the API side. */
  liveSync?: LiveSyncUpDto[]
  // The API also accepts the remaining legacy tables here, under the legacy
  // SyncUpwardsRequest names - alarmSite, partsUsed, keyHolder, srCheckList,
  // liveSync, errorList, userSettings (see SyncUpRequest.cs /
  // SyncUpTableRequests.cs). Add a typed optional property for each as the
  // app starts capturing it.
}

/**
 * Mirrors JobUpRequest (the legacy ServiceRecord_Sync fields). Only applied
 * server-side when the job still belongs to the calling engineer; otherwise
 * it is acknowledged as confirmed so the app stops retrying.
 */
export interface JobUpDto {
  serRecID: number
  callType: number | null
  probDesc: string | null
  startDT: string | null
  finishDT: string | null
  report: string | null
  scheduledDate: string | null
  scheduledEndDate: string | null
  prevMaintCarriedOut: boolean
  system: string | null
  dispatchEng: string | null
  installation: boolean | null
  maintenancectrl: boolean | null
  emergencyService: boolean | null
  temporaryDC: boolean | null
  dispatchStatus: string | null
  cause: string | null
  serRec_GUID: string | null
}

/** Mirrors EmployeeTimeUpRequest (the legacy EmployeeTime_Sync fields). */
export interface EmployeeTimeUpDto {
  tblEmployeeTime_GUID: string
  serviceID: number
  employeeID: string
  startDT: string
  finishDT: string | null
  timeHours: number | null
  activity: string | null
}

/** Mirrors LiveSyncUpRequest (the legacy TblLiveSync_Sync fields). */
export interface LiveSyncUpDto {
  id: string
  empID: string
  latitude: string | null
  longitude: string | null
  activity: string | null
  serRecID: number | null
  updated: string | null
  stateChange: boolean
  eta: string | null
  newGPS: boolean
  team: string | null
}

/** Mirrors SyncUpTableResult<TKey>: keys the server now holds (or deliberately skipped) vs. failures. */
export interface SyncUpTableResultDto<TKey> {
  confirmed: TKey[]
  failed: { key: TKey; failMessage: string | null }[]
}

export interface SyncUpResponseDto {
  assetService?: AssetServiceUpResponseDto
  serviceRecord?: SyncUpTableResultDto<number>
  employeeTime?: SyncUpTableResultDto<string>
  liveSync?: SyncUpTableResultDto<string>
}
