import { clearStaleTransaction, getDb, persist } from './sqlite'
import { getCurrentUsername } from '../api/localAuth'
import { closeTimeRow, getEngineerState, nowLocalIso } from './jobState'

/**
 * Crew module. A job can carry a crew (Db.JobCrew): one "lead" engineer -
 * normally also ServiceRecord.DispatchEng - plus crew members who only
 * record their time against the job, over one or more scheduled slots.
 *
 *  - getJobRole():  'lead' when the job is dispatched to me or my JobCrew
 *                   row says JobType 'lead'; 'crew' when I only have crew
 *                   rows; 'none' otherwise.
 *  - getJobSlots(): the scheduled slots, mine by default.
 *  - the crew clock: Clock In / Pause / Clock Out for a crew job. It writes
 *    plain EmployeeTime rows for ME only (Activity 'On Work', Sent = 0) and
 *    never touches ServiceRecord - a crew device must not amend the job.
 *    Deliberately separate from jobState.ts's lead state machine (current
 *    job + team + DispatchStatus); only one timer may run at a time across
 *    the two.
 */

export type JobRole = 'lead' | 'crew' | 'none'

export interface JobSlot {
  id: number
  serRecId: number
  engName: string
  start: string | null
  end: string | null
  jobType: string | null
}

export interface CrewMember {
  engName: string
  jobType: string | null
  isLead: boolean
}

export type CrewClockStatus = 'in' | 'paused' | 'out'

export interface CrewClock {
  serRecId: number
  /** Open EmployeeTime row while status is 'in'. */
  guid: string | null
  status: CrewClockStatus
  /** Local ISO time of the last clock-in (for the running timer). */
  since: string | null
}

const CLOCK_KEY = 'crewClock'
const CREW_ACTIVITY = 'On Work'

function rowsOf<T>(res: { values?: unknown[] }): T[] {
  return (res.values ?? []) as T[]
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

// ------------------------------------------------------------------ role / slots

/** Role of the signed-in engineer on one job. */
export async function getJobRole(serRecId: number): Promise<JobRole> {
  const roles = await getJobRoles([serRecId])
  return roles.get(serRecId) ?? 'none'
}

/** Roles for many jobs in two queries - used by the job list. */
export async function getJobRoles(serRecIds: number[]): Promise<Map<number, JobRole>> {
  const out = new Map<number, JobRole>()
  if (serRecIds.length === 0) return out
  const me = await getCurrentUsername()
  const db = await getDb()
  const ph = serRecIds.map(() => '?').join(', ')

  const jobs = rowsOf<{ SerRecID: number; DispatchEng: string | null }>(
    await db.query(`SELECT SerRecID, DispatchEng FROM ServiceRecord WHERE SerRecID IN (${ph})`, serRecIds),
  )
  const crew = rowsOf<{ SerRecID: number; EngName: string; JobType: string | null }>(
    await db.query(
      `SELECT SerRecID, EngName, JobType FROM JobCrew WHERE NewSerRecID IS NULL AND SerRecID IN (${ph})`,
      serRecIds,
    ),
  )

  for (const id of serRecIds) out.set(id, 'none')
  for (const j of jobs) {
    if (me && sameName(j.DispatchEng, me)) out.set(j.SerRecID, 'lead')
  }
  for (const c of crew) {
    if (!me || !sameName(c.EngName, me)) continue
    if ((c.JobType ?? '').toLowerCase() === 'lead') {
      out.set(c.SerRecID, 'lead')
    } else if (out.get(c.SerRecID) !== 'lead') {
      out.set(c.SerRecID, 'crew')
    }
  }
  return out
}

/** Scheduled slots of a job - the signed-in engineer's by default, everyone's with `allEngineers`. */
export async function getJobSlots(serRecId: number, allEngineers = false): Promise<JobSlot[]> {
  const db = await getDb()
  const me = allEngineers ? null : await getCurrentUsername()
  const res = await db.query(
    `SELECT ID, SerRecID, EngName, ScheduledStart, ScheduledEnd, JobType
     FROM JobCrew WHERE SerRecID = ? AND NewSerRecID IS NULL ORDER BY ScheduledStart`,
    [serRecId],
  )
  return rowsOf<{ ID: number; SerRecID: number; EngName: string; ScheduledStart: string | null; ScheduledEnd: string | null; JobType: string | null }>(res)
    .filter((r) => !me || sameName(r.EngName, me))
    .map((r) => ({ id: r.ID, serRecId: r.SerRecID, engName: r.EngName, start: r.ScheduledStart, end: r.ScheduledEnd, jobType: r.JobType }))
}

/** All of the signed-in engineer's slots across every job - one query, for the list/calendar. */
export async function getMySlotsByJob(): Promise<Map<number, JobSlot[]>> {
  const db = await getDb()
  const me = await getCurrentUsername()
  const out = new Map<number, JobSlot[]>()
  if (!me) return out
  const res = await db.query(
    `SELECT ID, SerRecID, EngName, ScheduledStart, ScheduledEnd, JobType
     FROM JobCrew WHERE NewSerRecID IS NULL AND lower(EngName) = lower(?) ORDER BY ScheduledStart`,
    [me],
  )
  for (const r of rowsOf<{ ID: number; SerRecID: number; EngName: string; ScheduledStart: string | null; ScheduledEnd: string | null; JobType: string | null }>(res)) {
    const list = out.get(r.SerRecID) ?? []
    list.push({ id: r.ID, serRecId: r.SerRecID, engName: r.EngName, start: r.ScheduledStart, end: r.ScheduledEnd, jobType: r.JobType })
    out.set(r.SerRecID, list)
  }
  return out
}

/** Distinct crew of a job (lead first), with display names when the Employee table knows them. */
export async function getJobCrew(serRecId: number): Promise<(CrewMember & { displayName: string })[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT DISTINCT c.EngName, c.JobType, e.FirstName, e.LastName
     FROM JobCrew c
     LEFT JOIN Employee e ON lower(e.EmployeeID) = lower(c.EngName)
     WHERE c.SerRecID = ? AND c.NewSerRecID IS NULL
     ORDER BY CASE WHEN lower(c.JobType) = 'lead' THEN 0 ELSE 1 END, c.EngName`,
    [serRecId],
  )
  const seen = new Set<string>()
  const members: (CrewMember & { displayName: string })[] = []
  for (const r of rowsOf<{ EngName: string; JobType: string | null; FirstName: string | null; LastName: string | null }>(res)) {
    const key = r.EngName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const full = [r.FirstName, r.LastName].filter(Boolean).join(' ').trim()
    members.push({
      engName: r.EngName,
      jobType: r.JobType,
      isLead: (r.JobType ?? '').toLowerCase() === 'lead',
      displayName: full || r.EngName,
    })
  }
  return members
}

// ------------------------------------------------------------------ crew clock

export async function getCrewClock(): Promise<CrewClock | null> {
  const db = await getDb()
  const res = await db.query('SELECT value FROM app_meta WHERE key = ?', [CLOCK_KEY])
  const raw = rowsOf<{ value: string | null }>(res)[0]?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CrewClock
    return parsed && typeof parsed.serRecId === 'number' ? parsed : null
  } catch {
    return null
  }
}

async function setCrewClock(clock: CrewClock | null): Promise<void> {
  const db = await getDb()
  if (clock) {
    await db.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [CLOCK_KEY, JSON.stringify(clock)],
    )
  } else {
    await db.run('DELETE FROM app_meta WHERE key = ?', [CLOCK_KEY])
  }
}

/**
 * Something else is already recording time for this engineer: the lead
 * state machine has a current job, or a crew clock is running on another
 * job. Returns a message to show, or null when clocking in is fine.
 */
export async function crewClockBlocker(serRecId: number): Promise<string | null> {
  const { currentJob } = await getEngineerState()
  if (currentJob && currentJob !== serRecId) {
    return `You are on job #${currentJob} as lead. Pause it before clocking in here.`
  }
  const clock = await getCrewClock()
  if (clock && clock.status === 'in' && clock.serRecId !== serRecId) {
    return `You are clocked in on job #${clock.serRecId}. Clock out there first.`
  }
  return null
}

/** Clock In (or Resume after a pause): opens an EmployeeTime row for me on this crew job. */
export async function crewClockIn(serRecId: number): Promise<void> {
  const blocker = await crewClockBlocker(serRecId)
  if (blocker) throw new Error(blocker)
  const me = await getCurrentUsername()
  if (!me) throw new Error('Could not work out who is signed in.')

  const existing = await getCrewClock()
  if (existing && existing.serRecId === serRecId && existing.status === 'in' && existing.guid) {
    return // already running
  }

  const db = await getDb()
  await clearStaleTransaction(db)
  const guid = crypto.randomUUID().toUpperCase()
  const now = nowLocalIso()
  await db.run(
    `INSERT INTO EmployeeTime (tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, Activity, Updated, Sent)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [guid, serRecId, me, now, CREW_ACTIVITY, now],
  )
  await setCrewClock({ serRecId, guid, status: 'in', since: now })
  await persist()
}

async function closeOpenRow(clock: CrewClock, at: Date): Promise<void> {
  if (!clock.guid) return
  const db = await getDb()
  const row = rowsOf<{ StartDT: string }>(
    await db.query('SELECT StartDT FROM EmployeeTime WHERE tblEmployeeTime_GUID = ? AND FinishDT IS NULL', [clock.guid]),
  )[0]
  if (!row) return
  const { timeHours, finishDt } = closeTimeRow(row.StartDT, at)
  await db.run(
    `UPDATE EmployeeTime SET FinishDT = ?, TimeHours = ?, RateHour = 0, Updated = ?, Sent = 0
     WHERE tblEmployeeTime_GUID = ?`,
    [finishDt, timeHours, nowLocalIso(at), clock.guid],
  )
}

/** Pause: closes the running row; the job stays "clocked on" so the button reads Resume. */
export async function crewPause(): Promise<void> {
  const clock = await getCrewClock()
  if (!clock || clock.status !== 'in') return
  const db = await getDb()
  await clearStaleTransaction(db)
  await closeOpenRow(clock, new Date())
  await setCrewClock({ ...clock, guid: null, status: 'paused', since: null })
  await persist()
}

/** Clock Out: closes the running row (if any) and ends the day on this job. */
export async function crewClockOut(): Promise<void> {
  const clock = await getCrewClock()
  if (!clock) return
  const db = await getDb()
  await clearStaleTransaction(db)
  await closeOpenRow(clock, new Date())
  await setCrewClock(null)
  await persist()
}

/**
 * Called after every sync-down: if the job the crew clock is on has gone
 * (the lead completed it, or the office cancelled/reassigned it), close
 * the running row now so the hours are not lost, and clear the clock.
 * Returns true when it did so, so the caller can tell the engineer.
 */
export async function reconcileCrewClock(): Promise<boolean> {
  const clock = await getCrewClock()
  if (!clock) return false
  const db = await getDb()
  const stillHere = rowsOf<{ n: number }>(
    await db.query("SELECT COUNT(*) AS n FROM ServiceRecord WHERE SerRecID = ? AND local_status NOT IN ('completed', 'declined')", [clock.serRecId]),
  )[0]?.n
  if (stillHere && stillHere > 0) return false
  await clearStaleTransaction(db)
  await closeOpenRow(clock, new Date())
  await setCrewClock(null)
  await persist()
  return true
}

/** Hours this engineer has booked on a crew job (closed rows only). */
export async function getMyHoursOnJob(serRecId: number): Promise<number> {
  const me = await getCurrentUsername()
  if (!me) return 0
  const db = await getDb()
  const row = rowsOf<{ hours: number | null }>(
    await db.query(
      `SELECT COALESCE(SUM(TimeHours), 0) AS hours FROM EmployeeTime
       WHERE ServiceID = ? AND lower(EmployeeID) = lower(?) AND FinishDT IS NOT NULL AND Deleted = 0`,
      [serRecId, me],
    ),
  )[0]
  return row?.hours ?? 0
}
