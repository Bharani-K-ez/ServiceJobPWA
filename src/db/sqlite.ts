import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { DB_NAME, DB_VERSION, MIGRATION_STATEMENTS, SCHEMA_STATEMENTS } from './schema'

/** Minimal shape of the <jeep-sqlite> custom element methods this file calls
 * directly (its own type declarations don't cover this internal method). */
interface JeepSqliteElement extends HTMLElement {
  isStoreOpen: () => Promise<boolean>
}

/**
 * One SQLite connection for the whole app, opened lazily on first use and
 * cached. Works the same way on web (jeep-sqlite/IndexedDB, set up in
 * main.tsx) and on native (real SQLite via the Capacitor plugin) - callers
 * never need to branch on platform.
 */
const sqliteConnection = new SQLiteConnection(CapacitorSQLite)

let dbPromise: Promise<SQLiteDBConnection> | null = null
let webStoreReady: Promise<void> | null = null

/**
 * Polls the <jeep-sqlite> element's own isStoreOpen() until it reports true
 * (or a timeout elapses).
 *
 * Why this is needed: jeep-sqlite's connectedCallback() kicks off opening
 * its IndexedDB-backed store (`this.openStore(...).then(mStore => this.isStore
 * = mStore)`) WITHOUT awaiting it - isStoreOpen() just returns whatever
 * `this.isStore` happens to be at the instant it's called, with no retry of
 * its own. @capacitor-community/sqlite's initWebStore() calls isStoreOpen()
 * exactly once and trusts the result, so if that snapshot lands before the
 * store has actually finished opening, nothing downstream ever notices or
 * retries - createConnection()/open() only check the *live* isStore flag
 * (which usually has flipped true by then, so no error is thrown), but the
 * underlying Database.open() call can still end up resolving against a
 * store handle that isn't yet wired to the real persisted data, silently
 * opening a fresh, empty in-memory database instead of the real one.
 *
 * Symptom this fixes, confirmed by direct reproduction: after logging in
 * and syncing down jobs, closing the app and reopening it intermittently
 * showed an empty job list - even though the actual IndexedDB blob for the
 * database was independently verified (by loading its raw bytes into a
 * throwaway sql.js instance) to still contain the real, correct rows the
 * whole time. The data was never lost; the app just occasionally opened
 * past it. Explicitly waiting for a true isStoreOpen() before doing
 * anything else closes that window.
 */
async function waitForJeepSqliteStore(timeoutMs = 5000): Promise<void> {
  const el = document.querySelector('jeep-sqlite') as JeepSqliteElement | null
  if (!el) {
    return
  }
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if (await el.isStoreOpen()) {
        return
      }
    } catch {
      // Element not fully upgraded yet - keep polling until the timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function ensureWebStore(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    return
  }
  if (!webStoreReady) {
    webStoreReady = (async () => {
      await customElements.whenDefined('jeep-sqlite')
      await waitForJeepSqliteStore()
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
