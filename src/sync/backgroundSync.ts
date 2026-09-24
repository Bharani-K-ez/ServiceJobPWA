import { Capacitor } from '@capacitor/core'
import { BackgroundRunner } from '@capacitor/background-runner'
import { API_BASE_URL } from '../config/env'
import { getAuthToken } from '../api/authToken'
import { getTenantCode } from '../api/tenant'
import {
  applyOutboxConfirmations,
  getLastSyncAt,
  getOutboxSnapshot,
  getServerSyncDateTime,
  type OutboxConfirmations,
  type OutboxSnapshot,
} from '../db/localData'
import { getDb, persist } from '../db/sqlite'
import { getSyncSchedule } from './syncSettings'

/**
 * Bridge to the background heartbeat (Capacitor Background Runner,
 * public/runners/sync-runner.js). The runner is a separate JS runtime with
 * only fetch, a KV store and local notifications - no SQLite, none of the
 * app's code - so the contract is:
 *
 *  app  -> runner  "saveState": auth (base URL, token, tenant code), the
 *                   schedule, the pending SyncUp payload (outbox) and its
 *                   stamps, and the last server sync time. Sent when the
 *                   app goes to the background and after every push.
 *  runner (on its own, every ~15-20 min within working hours): POSTs the
 *                   outbox, GETs /SyncV2/Changes, posts a notification
 *                   ("Synced 14:20 · 2 new jobs" / "Sync failed"), and
 *                   stores the result + the confirmations it received.
 *  app  -> runner  "readState" on resume: takes the confirmations (marks
 *                   those rows Sent = 1 if unchanged) and the last result
 *                   (shown in Utilities), then clears them.
 *
 * Android: WorkManager, >= 15 min, roughly on time. iOS: BGAppRefresh,
 * opportunistic - the OS decides. Web/PWA: not available (no-op here).
 */

export const RUNNER_LABEL = 'com.ezmanagement.servicejobs.sync'

export interface BackgroundSyncResult {
  at: string
  ok: boolean
  message: string
  newJobs?: number
  updatedJobs?: number
  pushed?: number
  skipped?: 'outside-hours' | 'not-due' | 'disabled' | 'no-auth'
}

const LAST_BG_KEY = 'lastBackgroundSync'
let permissionAsked = false

export function isBackgroundRunnerAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundRunner')
}

async function dispatch<T>(event: string, details: Record<string, unknown> = {}): Promise<T | null> {
  try {
    return (await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event, details })) as T
  } catch (err) {
    console.warn(`[background-sync] ${event} failed`, err)
    return null
  }
}

/** Ask once for the runner's notification permission (Android 13+ / iOS prompt). */
export async function ensureBackgroundPermissions(): Promise<void> {
  if (!isBackgroundRunnerAvailable() || permissionAsked) return
  permissionAsked = true
  try {
    await BackgroundRunner.requestPermissions({ apis: ['notifications'] })
  } catch {
    // the heartbeat still runs; it just cannot notify
  }
}

/**
 * Hands the runner everything it needs for its next runs. Called when the
 * app goes to the background and after every push (so the outbox reflects
 * what is still pending).
 */
export async function saveRunnerState(): Promise<void> {
  if (!isBackgroundRunnerAvailable()) return
  const [token, code, schedule, outbox, serverSync, lastSyncAt] = await Promise.all([
    getAuthToken(),
    getTenantCode(),
    getSyncSchedule(),
    getOutboxSnapshot(),
    getServerSyncDateTime(),
    getLastSyncAt(),
  ])
  await dispatch('saveState', {
    auth: token && code ? { baseUrl: API_BASE_URL, token, code } : null,
    schedule,
    outbox: outbox.request,
    stamps: outbox.stamps,
    serverSyncDateTime: serverSync,
    lastSyncAt,
    savedAt: new Date().toISOString(),
  })
}

interface RunnerState {
  confirmations: OutboxConfirmations | null
  stamps: OutboxSnapshot['stamps'] | null
  lastResult: BackgroundSyncResult | null
}

/**
 * On resume: apply what the runner achieved while we were away. Returns
 * the last background result (also stored for Utilities) and whether the
 * runner saw changes on the server - the caller then runs a partial sync.
 */
export async function applyRunnerResults(): Promise<{ result: BackgroundSyncResult | null; changesSeen: boolean }> {
  if (!isBackgroundRunnerAvailable()) return { result: null, changesSeen: false }
  const state = await dispatch<RunnerState>('readState')
  if (!state) return { result: null, changesSeen: false }

  if (state.confirmations && state.stamps) {
    await applyOutboxConfirmations(state.confirmations, state.stamps)
  }
  if (state.lastResult) {
    const db = await getDb()
    await db.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [LAST_BG_KEY, JSON.stringify(state.lastResult)],
    )
    await persist()
  }
  const changesSeen = !!state.lastResult?.ok && ((state.lastResult.newJobs ?? 0) > 0 || (state.lastResult.updatedJobs ?? 0) > 0)
  return { result: state.lastResult, changesSeen }
}

export async function getLastBackgroundSync(): Promise<BackgroundSyncResult | null> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [LAST_BG_KEY])
  const raw = ((res.values ?? []) as { value: string | null }[])[0]?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as BackgroundSyncResult
  } catch {
    return null
  }
}

/** Debug/QA: run one heartbeat right now, as the OS would. */
export async function runHeartbeatNow(): Promise<BackgroundSyncResult | null> {
  if (!isBackgroundRunnerAvailable()) return null
  await saveRunnerState()
  return dispatch<BackgroundSyncResult>('syncHeartbeat', { force: true })
}
