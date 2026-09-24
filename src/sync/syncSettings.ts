import { getDb, persist } from '../db/sqlite'
import { getCurrentUsername } from '../api/localAuth'

/**
 * Automatic-sync schedule. Three layers, most specific wins:
 *
 *  1. the engineer's own override, saved on this device from Utilities;
 *  2. the office's EzFieldSMSetting rows that came down with the last sync
 *     (Engineer = the engineer, then Engineer = 'All'):
 *        AutoSyncEnabled       true / false
 *        AutoSyncIntervalMins  e.g. 20
 *        AutoSyncStart         HH:mm, e.g. 08:00
 *        AutoSyncEnd           HH:mm, e.g. 18:00
 *        AutoSyncDays          1-7 for Mon-Sun, comma separated, e.g. 1,2,3,4,5
 *  3. the defaults below.
 *
 * The same settings drive the foreground catch-up (sync/autoSync.ts) and
 * the background heartbeat (public/runners/sync-runner.js, which receives a
 * copy in its KV store).
 */

export interface SyncSchedule {
  enabled: boolean
  intervalMinutes: number
  /** "HH:mm" local time. */
  workStart: string
  workEnd: string
  /** 1 = Monday ... 7 = Sunday (ISO). */
  workDays: number[]
}

export const DEFAULT_SCHEDULE: SyncSchedule = {
  enabled: true,
  intervalMinutes: 20,
  workStart: '08:00',
  workEnd: '18:00',
  workDays: [1, 2, 3, 4, 5],
}

const OVERRIDE_KEY = 'syncScheduleOverride'

function rowsOf<T>(res: { values?: unknown[] }): T[] {
  return (res.values ?? []) as T[]
}

/** Server setting for this engineer, else the 'All' row, else null. */
export async function getServerSetting(settingId: string): Promise<string | null> {
  const db = await getDb()
  const me = (await getCurrentUsername()) ?? ''
  const res = await db.query(
    `SELECT Engineer, SettingValue FROM EzFieldSMSetting
     WHERE SettingID = ? AND (lower(Engineer) = lower(?) OR Engineer = 'All')
     ORDER BY CASE WHEN Engineer = 'All' THEN 1 ELSE 0 END`,
    [settingId, me],
  )
  return rowsOf<{ SettingValue: string | null }>(res)[0]?.SettingValue ?? null
}

function parseTime(v: string | null | undefined, fallback: string): string {
  return v && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : fallback
}

function parseDays(v: string | null | undefined, fallback: number[]): number[] {
  if (!v) return fallback
  const days = v
    .split(/[,; ]+/)
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  return days.length > 0 ? Array.from(new Set(days)).sort() : fallback
}

/** The office's schedule (server settings over defaults) - what the override falls back to. */
export async function getServerSchedule(): Promise<SyncSchedule> {
  const [enabled, interval, start, end, days] = await Promise.all([
    getServerSetting('AutoSyncEnabled'),
    getServerSetting('AutoSyncIntervalMins'),
    getServerSetting('AutoSyncStart'),
    getServerSetting('AutoSyncEnd'),
    getServerSetting('AutoSyncDays'),
  ])
  const intervalNum = Number(interval)
  return {
    enabled: enabled == null ? DEFAULT_SCHEDULE.enabled : enabled.trim().toLowerCase() === 'true' || enabled.trim() === '1',
    intervalMinutes: Number.isFinite(intervalNum) && intervalNum >= 5 ? Math.round(intervalNum) : DEFAULT_SCHEDULE.intervalMinutes,
    workStart: parseTime(start, DEFAULT_SCHEDULE.workStart),
    workEnd: parseTime(end, DEFAULT_SCHEDULE.workEnd),
    workDays: parseDays(days, DEFAULT_SCHEDULE.workDays),
  }
}

export async function getScheduleOverride(): Promise<Partial<SyncSchedule> | null> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [OVERRIDE_KEY])
  const raw = rowsOf<{ value: string | null }>(res)[0]?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<SyncSchedule>
  } catch {
    return null
  }
}

/** Effective schedule: device override over office settings over defaults. */
export async function getSyncSchedule(): Promise<SyncSchedule> {
  const [server, override] = await Promise.all([getServerSchedule(), getScheduleOverride()])
  return { ...server, ...(override ?? {}) }
}

export async function saveScheduleOverride(override: Partial<SyncSchedule> | null): Promise<void> {
  const db = await getDb()
  if (override && Object.keys(override).length > 0) {
    await db.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [OVERRIDE_KEY, JSON.stringify(override)],
    )
  } else {
    await db.run('DELETE FROM app_meta WHERE key = ?', [OVERRIDE_KEY])
  }
  await persist()
}

// ------------------------------------------------------------------ pure helpers
// (duplicated in public/runners/sync-runner.js, which cannot import modules)

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** True when `now` falls on a working day, between workStart and workEnd. */
export function isWithinWorkingHours(schedule: SyncSchedule, now = new Date()): boolean {
  const isoDay = ((now.getDay() + 6) % 7) + 1 // Mon = 1 ... Sun = 7
  if (!schedule.workDays.includes(isoDay)) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = minutesOf(schedule.workStart)
  const end = minutesOf(schedule.workEnd)
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end // overnight window
}

/** True when the last sync is older than the interval (or never happened). */
export function isSyncDue(schedule: SyncSchedule, lastSyncIso: string | null, now = new Date()): boolean {
  if (!lastSyncIso) return true
  const last = new Date(lastSyncIso).getTime()
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= schedule.intervalMinutes * 60_000
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function describeSchedule(s: SyncSchedule): string {
  if (!s.enabled) return 'Automatic sync is off'
  const days =
    s.workDays.length === 7
      ? 'every day'
      : s.workDays.length === 5 && s.workDays.every((d) => d <= 5)
        ? 'Mon–Fri'
        : s.workDays.map((d) => DAY_LABELS[d - 1]).join(', ')
  return `Every ${s.intervalMinutes} min, ${days} ${s.workStart}–${s.workEnd}`
}
