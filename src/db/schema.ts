/**
 * Local SQLite schema. One row per synced entity, keyed by the same id the
 * API uses (SerRecID / SiteID / CustID / AssetGUID) so a re-sync can upsert
 * by primary key instead of wiping and reloading everything.
 *
 * `local_status` / `local_completed_at` on ServiceRecord are NOT part of the synced
 * API data - they are this app's own offline workflow state (open -> wip ->
 * completed) and must survive a re-sync of the same job (see
 * db/localData.ts's upsertSyncData, which preserves them across re-inserts).
 */
export const SCHEMA_STATEMENTS: string[] = [
  // The four core tables use the legacy MAUI app's local table and column
  // names (ServiceJobs.Models.ServiceRecord / AlarmSite / Customer /
  // TblAsset, as created by sqlite-net in Data/SqLiteConfig.cs) so a
  // downloaded .db reads the same in both apps and the SyncV2 DTOs map 1:1.
  // local_status / local_completed_at on ServiceRecord are this app's own
  // offline workflow state, not part of the legacy schema or the sync.
  `CREATE TABLE IF NOT EXISTS ServiceRecord (
    SerRecID INTEGER PRIMARY KEY NOT NULL,
    SiteSystemID INTEGER,
    DocketRef TEXT,
    SiteID INTEGER,
    CallReceivedDT TEXT,
    CallType INTEGER,
    ProbDesc TEXT,
    StartDT TEXT,
    FinishDT TEXT,
    Status TEXT,
    Completed INTEGER NOT NULL DEFAULT 0,
    ServiceType TEXT,
    Description TEXT,
    Report TEXT,
    DatePromisedDT TEXT,
    Time_Frame TEXT,
    ScheduledDate TEXT,
    ScheduledEndDate TEXT,
    SchDays INTEGER,
    SchHours INTEGER,
    SchMinutes INTEGER,
    CallerName TEXT,
    PrevMaintCarriedOut INTEGER NOT NULL DEFAULT 0,
    EmpIDs TEXT,
    CallModifiedBy TEXT,
    CallModifiedOn TEXT,
    System TEXT,
    Updated TEXT,
    JobNumber INTEGER,
    Priority INTEGER,
    DispatchEng TEXT,
    DispatchStatus TEXT,
    DispatchStatusDesc TEXT,
    TimeEst INTEGER,
    Labour REAL,
    CallToConfirm INTEGER,
    Installation INTEGER,
    Maintenancectrl INTEGER,
    EmergencyService INTEGER,
    TemporaryDC INTEGER,
    Cause TEXT,
    Sent INTEGER NOT NULL DEFAULT 0,
    SerRec_GUID TEXT,
    RiskAssessment TEXT,
    RiskAssessmentDate TEXT,
    Deleted INTEGER NOT NULL DEFAULT 0,
    ReferenceJob INTEGER,
    CustContID INTEGER,
    DocTempMapping TEXT,
    local_status TEXT NOT NULL DEFAULT 'open',
    local_completed_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS AlarmSite (
    SiteID INTEGER PRIMARY KEY NOT NULL,
    SiteRef TEXT,
    Address TEXT,
    Town TEXT,
    County TEXT,
    AreaCode TEXT,
    Telephone TEXT,
    PostCode TEXT,
    CustID INTEGER,
    CommissionedBy TEXT,
    DateInstalled TEXT,
    InstalledYN INTEGER NOT NULL DEFAULT 0,
    MonCompany TEXT,
    CPanelProdID REAL,
    PanelLocation TEXT,
    Occupant TEXT,
    GardaURN TEXT,
    Installer TEXT,
    DigiNo TEXT,
    RenewalDate TEXT,
    MonFee REAL,
    LastModified TEXT,
    ModifiedBy TEXT,
    CustomerType TEXT,
    RadioID TEXT,
    LabourRate REAL,
    PercentRate REAL,
    Updated TEXT,
    ContractNo TEXT,
    Latitude REAL,
    Longitude REAL,
    Note TEXT,
    Email_Site TEXT,
    SC_Emails TEXT,
    UserDefined1 TEXT,
    UserDefined2 TEXT,
    UserDefined3 TEXT,
    UserDefined4 TEXT,
    Password TEXT,
    UserCode TEXT,
    Alarmsite_GUID TEXT,
    Deleted INTEGER NOT NULL DEFAULT 0,
    Sent INTEGER NOT NULL DEFAULT 0,
    DigiType TEXT,
    EngCode INTEGER,
    SiteSMSNumbers TEXT,
    PremiseType TEXT,
    AlarmType TEXT,
    URNAppliedForDate TEXT,
    NSAICertNo TEXT,
    FireAuthority TEXT,
    PoliceAuthority TEXT,
    InstallationId TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS Customer (
    CustID INTEGER PRIMARY KEY NOT NULL,
    AccountsRef TEXT,
    Prefix TEXT,
    FirstName TEXT,
    LastName TEXT,
    EmailAddress TEXT,
    OrganizationName TEXT,
    Address TEXT,
    Town TEXT,
    County TEXT,
    Country TEXT,
    AreaCode TEXT,
    HomePhone TEXT,
    MobilePhone TEXT,
    WorkPhone TEXT,
    DirectDebit INTEGER NOT NULL DEFAULT 0,
    Updated TEXT,
    Deleted INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS TblAsset (
    AssetGUID TEXT PRIMARY KEY NOT NULL,
    AssetName TEXT,
    AssetDesc TEXT,
    AssetType INTEGER,
    ContractID INTEGER,
    MaintIntervalUnit TEXT,
    MaintInterval INTEGER,
    TemplateID INTEGER,
    SiteID INTEGER,
    IsRental INTEGER NOT NULL DEFAULT 0,
    NextServiceDate TEXT,
    LastServiceDate TEXT,
    Location TEXT,
    SerialNo TEXT,
    Number TEXT,
    AssetModel TEXT,
    InstallDate TEXT,
    CreatedOn TEXT,
    CreatedBy TEXT,
    UpdatedOn TEXT,
    UpdatedBy TEXT,
    IsActive INTEGER NOT NULL DEFAULT 1,
    LockedDateTime TEXT,
    IsLocked INTEGER NOT NULL DEFAULT 0,
    LockedByUser TEXT,
    LockedSerRecId INTEGER NOT NULL DEFAULT 0,
    IsRequired INTEGER NOT NULL DEFAULT 0,
    Sent INTEGER NOT NULL DEFAULT 0,
    Deleted INTEGER NOT NULL DEFAULT 0
  );`,
  // Employee time tracking - legacy MAUI table names again (Models/Entities
  // Employee.cs / EmployeeTime.cs / TblCurrentTeam.cs). Employee comes down
  // from SyncDown's `employee` list; EmployeeTime rows are opened/closed
  // locally by db/jobState.ts and pushed up through SyncUp (`employeeTime`),
  // and also come down from the server for the engineer's jobs; TblCurrentTeam
  // is the device's current team (one row per member, holding the GUID of
  // that member's currently-open EmployeeTime row, if any).
  `CREATE TABLE IF NOT EXISTS Employee (
    EmployeeID TEXT PRIMARY KEY NOT NULL,
    Title TEXT,
    FirstName TEXT,
    MiddleName TEXT,
    LastName TEXT,
    MobilePhone TEXT,
    WorkPhone TEXT,
    IsEngineer INTEGER,
    Updated TEXT,
    Deleted INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS EmployeeTime (
    tblEmployeeTime_GUID TEXT PRIMARY KEY NOT NULL,
    ServiceID INTEGER NOT NULL,
    EmployeeID TEXT NOT NULL,
    StartDT TEXT NOT NULL,
    FinishDT TEXT,
    RateHour REAL,
    TimeHours REAL,
    Activity TEXT,
    Updated TEXT,
    Deleted INTEGER NOT NULL DEFAULT 0,
    Sent INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS IX_EmployeeTime_ServiceID ON EmployeeTime (ServiceID);`,
  `CREATE TABLE IF NOT EXISTS TblCurrentTeam (
    Members TEXT PRIMARY KEY NOT NULL,
    tblEmployeeTime_GUID TEXT
  );`,
  // Legacy TblLiveSync: one breadcrumb per state change / GPS fix / ETA save,
  // pushed through SyncUp (`liveSync`) so the office sees where the engineer
  // is and when they expect to arrive. Written by db/liveSync.ts.
  `CREATE TABLE IF NOT EXISTS TblLiveSync (
    ID TEXT PRIMARY KEY NOT NULL,
    EmpID TEXT NOT NULL,
    Latitude TEXT,
    Longitude TEXT,
    Activity TEXT,
    SerRecID INTEGER,
    Updated TEXT,
    StateChange INTEGER NOT NULL DEFAULT 0,
    ETA TEXT,
    New_GPS INTEGER NOT NULL DEFAULT 0,
    Team TEXT,
    Sent INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );`,
  /**
   * Dynamic "Asset Service information" form config - pure reference data
   * pushed down from CommonCategorys / CommonCategoryProps. Always safe to
   * fully replace on every sync (see localData.ts's upsertSyncData): nothing
   * in these two tables is ever edited on the device.
   */
  `CREATE TABLE IF NOT EXISTS common_categories (
    categoryId INTEGER PRIMARY KEY NOT NULL,
    type INTEGER,
    name TEXT,
    propCount INTEGER,
    templateId INTEGER,
    templateType TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS common_category_props (
    propsId INTEGER PRIMARY KEY NOT NULL,
    categoryId INTEGER NOT NULL,
    categoryType INTEGER,
    name TEXT,
    ctrlType TEXT,
    ctrlWidth INTEGER,
    ctrlOrder INTEGER,
    ctrlIsMandatory INTEGER,
    ctrlDefaultVal TEXT,
    ctrlProps TEXT,
    propColRefNo INTEGER,
    code TEXT
  );`,
  /**
   * Captured dynamic field VALUES for each asset (Value1..Value50, mapped
   * back to fields via CommonCategoryProps.PropColRefNo). Unlike the tables
   * above, this one IS edited on the device (per the "don't sync back to
   * API yet" instruction, only locally so far) so it needs its own local
   * identity and edit-tracking columns that aren't part of the server shape:
   *
   * - localId: a client-generated key, stable for the row's lifetime.
   *   'srv-<assetPropId>' for a row that originated on the server,
   *   'local-<uuid>' for a row the engineer added on the device.
   * - assetPropId: the server AssetPropId, NULL for a locally-added row.
   * - local_modified: 1 once the engineer has edited this row on the device.
   *   upsertSyncData leaves modified rows alone on re-sync instead of
   *   overwriting them with the server's (unedited, since nothing is synced
   *   back up yet) values - see the preservation logic there.
   * - local_created: 1 for a row with no server counterpart at all.
   */
  `CREATE TABLE IF NOT EXISTS asset_properties (
    localId TEXT PRIMARY KEY NOT NULL,
    assetPropId INTEGER,
    assetGuid TEXT NOT NULL,
    assetDetailGuid TEXT,
    type INTEGER,
    value1 TEXT, value2 TEXT, value3 TEXT, value4 TEXT, value5 TEXT,
    value6 TEXT, value7 TEXT, value8 TEXT, value9 TEXT, value10 TEXT,
    value11 TEXT, value12 TEXT, value13 TEXT, value14 TEXT, value15 TEXT,
    value16 TEXT, value17 TEXT, value18 TEXT, value19 TEXT, value20 TEXT,
    value21 TEXT, value22 TEXT, value23 TEXT, value24 TEXT, value25 TEXT,
    value26 TEXT, value27 TEXT, value28 TEXT, value29 TEXT, value30 TEXT,
    value31 TEXT, value32 TEXT, value33 TEXT, value34 TEXT, value35 TEXT,
    value36 TEXT, value37 TEXT, value38 TEXT, value39 TEXT, value40 TEXT,
    value41 TEXT, value42 TEXT, value43 TEXT, value44 TEXT, value45 TEXT,
    value46 TEXT, value47 TEXT, value48 TEXT, value49 TEXT, value50 TEXT,
    assetServiceGuid TEXT,
    local_modified INTEGER NOT NULL DEFAULT 0,
    local_created INTEGER NOT NULL DEFAULT 0
  );`,
  /**
   * Local mirror of the server's new AssetServiceHis table - one row per
   * (assetGuid, serRecId) "asset service" visit captured via this screen.
   * Separate feature entirely from asset_properties above (which stays as
   * the legacy master mirror, untouched by this table) - see backend
   * CLAUDE.md's "don't touch existing tables" and AssetServiceHis.cs's own
   * doc comment on the server side.
   *
   * - serviceHisId: the app-generated GUID reused for every save of the
   *   same (assetGuid, serRecId) pair (localData.ts's saveAssetServiceVisit
   *   finds-and-updates by this pair rather than inserting a new row per
   *   save - "one history entry per job+asset, updated in place").
   * - synced: 0 until a SyncAssetServiceUp push confirms the server has
   *   this visit; UtilitiesPage's manual Sync pushes every synced = 0 row
   *   up before pulling fresh data down, then flips this back to 1 (see
   *   localData.ts's applyAssetServiceUpResults). Any further local edit
   *   resets it back to 0 so the next Sync pushes it again.
   */
  `CREATE TABLE IF NOT EXISTS asset_service_history (
    serviceHisId TEXT PRIMARY KEY NOT NULL,
    assetGuid TEXT NOT NULL,
    serRecId INTEGER NOT NULL,
    serviceDate TEXT,
    status INTEGER,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  /**
   * Property rows (header + detail/grid) for one asset_service_history
   * visit. Full-replace semantics on every save, matching the server's own
   * delete+reinsert in SyncV2Repository.PushAssetServiceUp: every save of a
   * visit rewrites every row here for that serviceHisId to match the
   * current in-memory set exactly, so a device row the technician removes
   * before saving doesn't linger.
   *
   * serviceFlag: 1 = the technician has marked this device/detail row
   * serviced during this visit, 0 = not yet. Toggled directly from the
   * Devices list (see AssetServiceInfoPage.tsx), independent of opening the
   * edit popup. Backed by AssetServiceProperties.ServiceFlag on the API
   * side - there is NO equivalent column on the legacy master
   * asset_properties table above, so this is never copied there.
   */
  `CREATE TABLE IF NOT EXISTS asset_service_properties (
    localId TEXT PRIMARY KEY NOT NULL,
    serviceHisId TEXT NOT NULL,
    assetPropId INTEGER,
    type INTEGER,
    serviceFlag INTEGER NOT NULL DEFAULT 0,
    value1 TEXT, value2 TEXT, value3 TEXT, value4 TEXT, value5 TEXT,
    value6 TEXT, value7 TEXT, value8 TEXT, value9 TEXT, value10 TEXT,
    value11 TEXT, value12 TEXT, value13 TEXT, value14 TEXT, value15 TEXT,
    value16 TEXT, value17 TEXT, value18 TEXT, value19 TEXT, value20 TEXT,
    value21 TEXT, value22 TEXT, value23 TEXT, value24 TEXT, value25 TEXT,
    value26 TEXT, value27 TEXT, value28 TEXT, value29 TEXT, value30 TEXT,
    value31 TEXT, value32 TEXT, value33 TEXT, value34 TEXT, value35 TEXT,
    value36 TEXT, value37 TEXT, value38 TEXT, value39 TEXT, value40 TEXT,
    value41 TEXT, value42 TEXT, value43 TEXT, value44 TEXT, value45 TEXT,
    value46 TEXT, value47 TEXT, value48 TEXT, value49 TEXT, value50 TEXT
  );`,
  /**
   * One row per completed (or in-progress) generated document - the
   * "capture inputs from an HTML template, produce a docket/report" feature
   * (see docTemplates/ and DocumentFormPage.tsx). Modeled after
   * asset_service_history above: a stable app-generated localId, found and
   * updated in place on repeat saves of the same (serRecId, assetGuid,
   * templateKey) rather than inserting a new row every time the technician
   * reopens and re-saves the same document.
   *
   * - dataJson: the filled-in AngularJS scope's `data` object (everything
   *   the technician entered into the template's ng-model fields, plus the
   *   two signature images as data URLs), JSON-stringified. This is the
   *   editable source of truth - reopening the document re-seeds the
   *   template's scope from this instead of blank.
   * - pdfFileName: set once a PDF has been generated for this row (see
   *   generatePdf.ts) - relative to Filesystem Directory.Data, not an
   *   absolute path, since that base path differs per platform/install.
   *   NULL until the technician completes the document (a document can be
   *   saved as a draft - dataJson populated - before a PDF exists).
   * - synced: mirrors asset_service_history's own flag - reserved for a
   *   future "upload the finished document to the server" step, not wired
   *   up to anything yet. Always 0 for now.
   */
  `CREATE TABLE IF NOT EXISTS job_documents (
    localId TEXT PRIMARY KEY NOT NULL,
    serRecId INTEGER NOT NULL,
    assetGuid TEXT,
    templateKey TEXT NOT NULL,
    dataJson TEXT NOT NULL,
    pdfFileName TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
]

/**
 * `CREATE TABLE IF NOT EXISTS` (above) only helps a table that doesn't
 * exist yet - it does NOT add a new column to a table an earlier version of
 * this app already created (e.g. `assets` before `templateId` existed). Each
 * statement here is run separately and its failure ignored (see sqlite.ts)
 * so this doubles as a no-op on a fresh install where the column was
 * already part of the CREATE TABLE above.
 */
export const MIGRATION_STATEMENTS: string[] = [
  // The core tables were renamed to the legacy MAUI names (jobs ->
  // ServiceRecord, sites -> AlarmSite, customers -> Customer, assets ->
  // TblAsset). Drop the old ones so a pre-rename install doesn't carry dead
  // tables around. The next sync refills the new tables - with them empty,
  // buildSyncDownRequest sends no verified ids, so the server treats every
  // job/site as new to the device and sends them in full. Local job status
  // from before the rename is not carried over.
  'DROP TABLE IF EXISTS jobs',
  'DROP TABLE IF EXISTS sites',
  'DROP TABLE IF EXISTS customers',
  'DROP TABLE IF EXISTS assets',
  'ALTER TABLE asset_service_properties ADD COLUMN serviceFlag INTEGER NOT NULL DEFAULT 0',
]

export const DB_NAME = 'servicejobs'
export const DB_VERSION = 1
