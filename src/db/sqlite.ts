import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { DB_NAME, DB_VERSION, MIGRATION_STATEMENTS, SCHEMA_STATEMENTS } from './schema'

/**
 * One SQLite connection for the whole app, opened lazily on first use and
 * cached. Works the same way on web (jeep-sqlite/IndexedDB, set up in
 * main.tsx) and on native (real SQLite via the Capacitor plugin) - callers
 * never need to branch on platform.
 */
const sqliteConnection = new SQLiteConnection(CapacitorSQLite)

let dbPromise: Promise<SQLiteDBConnection> | null = null
let webStoreReady: Promise<void> | null = null

async function ensureWebStore(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    return
  }
  if (!webStoreReady) {
    webStoreReady = (async () => {
      await customElements.whenDefined('jeep-sqlite')
      await sqliteConnection.initWebStore()
    })()
  }
  await webStoreReady
}

async function openDb(): Promise<SQLiteDBConnection> {
  await ensureWebStore()

  const { result: alreadyConnected } = await sqliteConnection.isConnection(DB_NAME, false)
  const db = alreadyConnected
    ? await sqliteConnection.retrieveConnection(DB_NAME, false)
    : await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)

  await db.open()
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement)
  }
  for (const statement of MIGRATION_STATEMENTS) {
    try {
      await db.execute(statement)
    } catch {
      // Expected on every run after the first: the column already exists,
      // either added by a prior migration or (on a fresh install) already
      // part of the CREATE TABLE above. Nothing to do either way.
    }
  }

  return db
}

/** Resolves once to the same open, schema-migrated connection. */
export function getDb(): Promise<SQLiteDBConnection> {
  if (!dbPromise) {
    dbPromise = openDb()
  }
  return dbPromise
}

/**
 * Flushes the database to its durable store. Only meaningful on web: the
 * jeep-sqlite backend runs SQLite compiled to WASM entirely in memory and
 * only writes its blob to IndexedDB when explicitly told to - without this,
 * every local write (job status, saved asset properties, a sync) is lost
 * on a full page reload. Native iOS/Android write straight to an on-disk
 * SQLite file via the real Capacitor plugin, so there is no separate flush
 * step there - this is a no-op on that platform.
 *
 * Callers should await this after any write they need to survive a
 * reload/app-restart - see localData.ts's mutating functions, which all
 * call this once their transaction (if any) has committed.
 */
export async function persist(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    return
  }
  await sqliteConnection.saveToStore(DB_NAME)
}
