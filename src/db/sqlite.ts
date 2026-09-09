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
 *
 * UPDATE, confirmed by a second live reproduction: isStoreOpen() does not
 * only ever return false while pending - it can return a promise that
 * never settles at all (observed hanging indefinitely on a reload,
 * reproduced directly in the live app's own console: `await
 * document.querySelector('jeep-sqlite').isStoreOpen()` simply never
 * returned). That happened alongside console warnings naming jeep-sqlite's
 * own lazy-loaded Stencil chunk as "a cross-world service worker resource
 * mismatch" - i.e. the browser resolved two different physical files for
 * what should be one logical module, which is consistent with the
 * *specific instance* this code queries never being the one whose
 * connectedCallback() actually runs and resolves isStore. Retrying the
 * exact same call in a loop cannot route around that - it is not a
 * "not-ready-yet" state that more polling fixes, it is a promise that will
 * never settle. So each individual isStoreOpen() call here is now also
 * bounded by raceTimeout(), and this function's caller (ensureWebStore)
 * bounds the whole sequence again from outside for the same reason -
 * without an outer bound, a hang here (or, just as fatal, one inside
 * initWebStore()'s own separate isStoreOpen() call, which this function
 * has no control over) would leave webStoreReady/dbPromise permanently
 * *pending* rather than rejected, which is worse than an error: nothing
 * downstream ever throws, so nothing (not even navigating away to Settings
 * and back to Jobs, which just re-awaits the same stuck promise) can ever
 * recover without a full page reload. This is believed to be the root
 * cause of the "DB looks like it's not initializing at all, and the old
 * Settings-then-back-to-Jobs workaround stopped helping too" regression.
 */
async function waitForJeepSqliteStore(timeoutMs = 5000): Promise<void> {
  const el = document.querySelector('jeep-sqlite') as JeepSqliteElement | null
  if (!el) {
    return
  }
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if (await raceTimeout(el.isStoreOpen(), 1000)) {
        return
      }
    } catch {
      // Either isStoreOpen() itself threw, or our 1s per-call race timed
      // out (see raceTimeout's doc comment for why that second case is
      // real and confirmed, not theoretical) - keep polling either way
      // until the overall timeoutMs elapses.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Races a promise against a timeout, so a caller can move on instead of
 * hanging forever. Rejects with `new Error('timeout')` if `ms` elapses
 * first; the original promise, if it later settles, is simply ignored (its
 * result/rejection has no further effect - this can't cancel real work,
 * only stop *waiting* on it).
 */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function ensureWebStore(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') {
    return
  }
  if (!webStoreReady) {
    webStoreReady = raceTimeout(
      (async () => {
        await customElements.whenDefined('jeep-sqlite')
        await waitForJeepSqliteStore()
        // sqliteConnection.initWebStore() calls the jeep-sqlite element's
        // isStoreOpen() again internally (see @capacitor-community/sqlite's
        // web.ts) - that call is NOT wrapped by raceTimeout above, so it's
        // still exposed to the same hang. The outer raceTimeout wrapping
        // this whole IIFE (below) is what actually bounds that case too.
        await sqliteConnection.initWebStore()
      })(),
      8000,
    ).catch((err) => {
      // If this attempt fails (e.g. the store never reported open before
      // waitForJeepSqliteStore's timeout, so initWebStore's own internal
      // isStoreOpen() check also came back false and every downstream
      // CapacitorSQLiteWeb method start throwing "WebStore is not open
      // yet"), do NOT leave the failure cached here forever. webStoreReady
      // is a module-level singleton that's normally never reset - without
      // this reset, this exact rejection would be replayed for every future
      // call for the rest of the page's lifetime, including one triggered
      // by navigating away (e.g. to Settings) and back to Jobs, which is
      // exactly the "was working as a recovery workaround before, now
      // navigating away and back doesn't help either" regression this fixes.
      // Clearing it lets the next call start a genuinely fresh attempt.
      webStoreReady = null
      console.error('[sqlite] ensureWebStore failed, will retry on next call:', err)
      throw err
    })
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
    // Same reasoning as webStoreReady above: if openDb() ever rejects (it
    // calls ensureWebStore(), plus its own createConnection()/open() calls,
    // any of which can throw), clear the cache instead of pinning the
    // rejection in place forever. Without this, one bad attempt would
    // permanently break the app for the rest of the page's lifetime, with
    // no way to recover short of a full reload - not even by navigating
    // away and back, since that just calls getDb() again and got the same
    // dead promise back.
    dbPromise = openDb().catch((err) => {
      dbPromise = null
      console.error('[sqlite] openDb failed, will retry on next call:', err)
      throw err
    })
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
