import { getDb, persist } from '../db/sqlite'
import { describePushed, getLastSyncAt, pushPendingLocalChanges, syncDownAndStore } from '../db/localData'
import { getSyncSchedule, isSyncDue, isWithinWorkingHours } from './syncSettings'

/**
 * Foreground automatic sync: whenever the app is open (or comes back to the
 * foreground / regains connectivity) and the last sync is older than the
 * configured interval within working hours, push pending changes and pull
 * a delta - the same thing Utilities' "Sync data to server" does, without
 * anyone pressing it. Works identically on Android, iOS and the PWA.
 *
 * The outcome of the last automatic run is kept in app_meta so Utilities
 * can show "Last automatic sync 14:20 - sent 2 time records" or the error.
 */

export type AutoSyncReason = 'startup' | 'resume' | 'online' | 'timer' | 'push'

export interface AutoSyncOutcome {
  at: string
  ok: boolean
  reason: AutoSyncReason
  message: string
}

const LAST_KEY = 'lastAutoSync'
let running: Promise<AutoSyncOutcome | null> | null = null

export async function getLastAutoSync(): Promise<AutoSyncOutcome | null> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [LAST_KEY])
  const raw = ((res.values ?? []) as { value: string | null }[])[0]?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as AutoSyncOutcome
  } catch {
    return null
  }
}

async function recordOutcome(outcome: AutoSyncOutcome): Promise<void> {
  const db = await getDb()
  await db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_KEY, JSON.stringify(outcome)],
  )
  await persist()
}

/**
 * Runs a push + partial pull if the schedule says it is due. `force` skips
 * the due/working-hours checks (used after a push notification, where the
 * office has just told us something changed). Returns null when nothing
 * ran. Never throws; never runs twice at once.
 */
export function maybeAutoSync(reason: AutoSyncReason, force = false): Promise<AutoSyncOutcome | null> {
  if (running) return running
  running = (async () => {
    try {
      if (!navigator.onLine) return null
      const schedule = await getSyncSchedule()
      if (!force) {
        if (!schedule.enabled) return null
        if (!isWithinWorkingHours(schedule)) return null
        if (!isSyncDue(schedule, await getLastSyncAt())) return null
      }

      const push = await pushPendingLocalChanges()
      const pull = await syncDownAndStore('partial')

      const problems: string[] = []
      if (!push.ok) problems.push(push.message)
      if (!pull.ok) problems.push(pull.message)

      const sent = describePushed(push.pushed)
      const outcome: AutoSyncOutcome = {
        at: new Date().toISOString(),
        ok: problems.length === 0,
        reason,
        message: problems.length > 0 ? problems.join(' ') : sent ? `${sent}.` : 'Up to date.',
      }
      await recordOutcome(outcome)
      return outcome
    } catch (err) {
      const outcome: AutoSyncOutcome = {
        at: new Date().toISOString(),
        ok: false,
        reason,
        message: err instanceof Error ? err.message : 'Sync failed.',
      }
      try {
        await recordOutcome(outcome)
      } catch {
        // storage trouble - nothing more to do
      }
      return outcome
    } finally {
      running = null
    }
  })()
  return running
}
