/**
 * Local SQLite schema. One row per synced entity, keyed by the same id the
 * API uses (SerRecID / SiteID / CustID / AssetGuid) so a re-sync can upsert
 * by primary key instead of wiping and reloading everything.
 *
 * `local_status` / `local_completed_at` on jobs are NOT part of the synced
 * API data - they are this app's own offline workflow state (open -> wip ->
 * completed) and must survive a re-sync of the same job (see
 * db/localData.ts's upsertSyncData, which preserves them across re-inserts).
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS jobs (
    serRecId INTEGER PRIMARY KEY NOT NULL,
    docketRef TEXT,
    siteId INTEGER,
    callReceivedDt TEXT,
    probDesc TEXT,
    startDt TEXT,
    finishDt TEXT,
    status TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    serviceType TEXT,
    description TEXT,
    datePromisedDt TEXT,
    timeFrame TEXT,
    scheduledDate TEXT,
    scheduledEndDate TEXT,
    callerName TEXT,
    jobNumber INTEGER,
    priority INTEGER,
    dispatchEng TEXT,
    dispatchStatus TEXT,
    dispatchStatusDesc TEXT,
    system TEXT,
    timeEst INTEGER,
    local_status TEXT NOT NULL DEFAULT 'open',
    local_completed_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS sites (
    siteId INTEGER PRIMARY KEY NOT NULL,
    siteRef TEXT,
    occupant TEXT,
    address TEXT,
    town TEXT,
    county TEXT,
    areaCode TEXT,
    postCode TEXT,
    telephone TEXT,
    custId INTEGER,
    panelLocation TEXT,
    note TEXT,
    latitude REAL,
    longitude REAL
  );`,
  `CREATE TABLE IF NOT EXISTS customers (
    custId INTEGER PRIMARY KEY NOT NULL,
    organizationName TEXT,
    firstName TEXT,
    lastName TEXT,
    address TEXT,
    town TEXT,
    county TEXT,
    homePhone TEXT,
    mobilePhone TEXT,
    workPhone TEXT,
    emailAddress TEXT,
    accountsRef TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS assets (
    assetGuid TEXT PRIMARY KEY NOT NULL,
    assetName TEXT,
    assetType INTEGER,
    siteId INTEGER,
    assetModel TEXT,
    assetDesc TEXT,
    serialNo TEXT,
    number TEXT,
    location TEXT,
    lastServiceDate TEXT,
    nextServiceDate TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    templateId INTEGER
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
  'ALTER TABLE assets ADD COLUMN templateId INTEGER',
  'ALTER TABLE asset_service_properties ADD COLUMN serviceFlag INTEGER NOT NULL DEFAULT 0',
]

export const DB_NAME = 'servicejobs'
export const DB_VERSION = 1
