import { clearStaleTransaction, getDb, persist } from './sqlite'
import { getCurrentUsername } from '../api/localAuth'
import { getCurrentTeam, getEngineerState, nowLocalIso } from './jobState'

/**
 * Legacy TblLiveSync breadcrumbs: where the engineer is, what they are
 * doing, and when they expect to arrive. Each row is pushed through SyncUp
 * (`liveSync`, see localData.ts's pushPendingLocalChanges) and the server
 * keeps LiveSyncTbl plus the engineer's EngActivity row up to date for the
 * office's live map / ETA display. Mirrors TravelViewModel.StartTimer in
 * the MAUI app.
 */

export interface LiveSyncInput {
  serRecId: number | null
  activity: string | null
  latitude?: number | null
  longitude?: number | null
  /** ISO local time ("YYYY-MM-DDTHH:mm:ss") the engineer expects to arrive. */
  eta?: string | null
  /** True when this row marks a state change (Travel To, On Work...), false for a plain GPS/ETA update. */
  stateChange: boolean
  newGps?: boolean
}

const ETA_KEY = 'currentEta'

export async function recordLiveSync(input: LiveSyncInput): Promise<void> {
  const db = await getDb()
  const me = (await getCurrentUsername()) ?? ''
  if (!me) return
  const team = (await getCurrentTeam()).map((m) => m.displayName).join(', ')
  const now = nowLocalIso()

  await clearStaleTransaction(db)
  await db.run(
    `INSERT INTO TblLiveSync (ID, EmpID, Latitude, Longitude, Activity, SerRecID, Updated, StateChange, ETA, New_GPS, Team, Sent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      crypto.randomUUID().toUpperCase(),
      me,
      input.latitude != null ? String(input.latitude) : null,
      input.longitude != null ? String(input.longitude) : null,
      input.activity,
      input.serRecId,
      now,
      input.stateChange ? 1 : 0,
      input.eta ?? null,
      input.newGps ? 1 : 0,
      team || null,
    ],
  )
  await persist()
}

/** Saves the ETA for the current job (device-side, like EngineerDetail.ETA) and queues a breadcrumb carrying it. */
export async function saveEta(eta: string, position?: { lat: number; lng: number } | null): Promise<void> {
  const db = await getDb()
  const { currentJob, currentState } = await getEngineerState()
  await db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [ETA_KEY, JSON.stringify({ serRecId: currentJob, eta })],
  )
  await recordLiveSync({
    serRecId: currentJob,
    activity: currentState,
    latitude: position?.lat,
    longitude: position?.lng,
    eta,
    stateChange: false,
    newGps: position != null,
  })
}

/** The ETA saved for this job on this device, if any. */
export async function getSavedEta(serRecId: number): Promise<string | null> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [ETA_KEY])
  const raw = ((res.values ?? []) as { value: string | null }[])[0]?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { serRecId: number | null; eta: string }
    return parsed.serRecId === serRecId ? parsed.eta : null
  } catch {
    return null
  }
}
