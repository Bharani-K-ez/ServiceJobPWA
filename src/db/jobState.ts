import { clearStaleTransaction, getDb, persist } from './sqlite'
import { getCurrentUsername } from '../api/localAuth'

/**
 * Engineer job-state machine + employee time tracking. A direct port of the
 * legacy MAUI logic in BaseViewModel.UpdateStatus / SaveEmployee_StartTime /
 * SaveEmployee_FinishTime and TeamViewModel.UpdateTeam, on the same
 * legacy-named local tables (ServiceRecord, EmployeeTime, TblCurrentTeam,
 * Employee - see schema.ts).
 *
 * The device has ONE current job at a time and one current state:
 *
 *   state      DispatchStatus   meaning
 *   TravelTo        30          travelling to the site
 *   On Work         35          on site, working
 *   TravelFrom      37          travelling back
 *   Unknown         -           no current job (paused 40 / completed 50)
 *
 * Every transition (transition() below) closes the currently-open
 * EmployeeTime row of every team member (FinishDT + TimeHours) and opens a
 * fresh row per member with the new state as its Activity - so each member
 * ends up with one row per stretch of TravelTo / On Work / TravelFrom.
 * Starting a different job while one is current pauses the current one
 * first (status 40), exactly as MAUI does.
 *
 * Team membership lives in TblCurrentTeam and persists across jobs;
 * toggling a member while a job is current opens/closes that member's row
 * immediately (TeamViewModel.UpdateTeam).
 *
 * Everything written here is marked Sent = 0 and pushed to the server by
 * localData.ts's pushPendingLocalChanges() through SyncUp (serviceRecord /
 * employeeTime); nothing in this module talks to the network.
 */

export type JobState = 'TravelTo' | 'On Work' | 'TravelFrom' | 'Unknown'

export const JOB_STATUS = {
  travelTo: '30',
  onWork: '35',
  travelFrom: '37',
  paused: '40',
  completed: '50',
  declined: '04',
} as const

export interface EngineerState {
  /** SerRecID of the job the engineer is currently on, or null. */
  currentJob: number | null
  currentState: JobState
}

export interface TeamMember {
  employeeID: string
  displayName: string
  /** GUID of this member's currently-open EmployeeTime row, if the team is on a job. */
  openTimeGuid: string | null
}

export interface TeamCandidate {
  employeeID: string
  displayName: string
  selected: boolean
}

export interface LocalEmployeeTime {
  guid: string
  serviceId: number
  employeeId: string
  startDt: string
  finishDt: string | null
  timeHours: number | null
  activity: string | null
  sent: boolean
}

function rowsOf<T>(res: { values?: unknown[] }): T[] {
  return (res.values ?? []) as T[]
}

/**
 * Local wall-clock time as "YYYY-MM-DDTHH:mm:ss" with NO timezone suffix.
 * This is what the legacy app sent and what the API's date columns hold
 * (device local time); a trailing "Z" would make the server treat it as
 * UTC and shift it. `new Date(str)` parses this form as local time too, so
 * elapsed-time maths on the device stays consistent.
 */
export function nowLocalIso(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function newGuid(): string {
  return crypto.randomUUID().toUpperCase()
}

/**
 * Legacy SaveEmployee_FinishTime's hours rule: elapsed hours, anything under
 * 0.01h (36s) counts as 0, and a stretch left running overnight (more than
 * 12h AND finishing on a later calendar day) is capped at 18:00 of the day
 * it started - unless it started after 18:00, in which case the real
 * finish is used. Returns the TimeHours to store and the FinishDT to store.
 */
export function closeTimeRow(startDt: string, finishAt: Date): { timeHours: number; finishDt: string } {
  const start = new Date(startDt)
  let finish = finishAt
  let hours = (finish.getTime() - start.getTime()) / 3_600_000

  if (hours < 0.01) {
    hours = 0
  }

  if (hours > 12 && start.getDate() !== finish.getDate()) {
    const sixPm = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 18, 0, 0)
    if (start < sixPm) {
      finish = sixPm
      hours = (finish.getTime() - start.getTime()) / 3_600_000
    }
  }

  return { timeHours: Math.round(hours * 10_000) / 10_000, finishDt: nowLocalIso(finish) }
}

// ---------------------------------------------------------------- engineer state

export async function getEngineerState(): Promise<EngineerState> {
  const db = await getDb()
  const res = await db.query("SELECT key, value FROM app_meta WHERE key IN ('currentJob', 'currentState')")
  const map = new Map(rowsOf<{ key: string; value: string }>(res).map((r) => [r.key, r.value]))
  const job = Number(map.get('currentJob') ?? '')
  return {
    currentJob: Number.isFinite(job) && job > 0 ? job : null,
    currentState: (map.get('currentState') as JobState | undefined) ?? 'Unknown',
  }
}

// ------------------------------------------------------------------------ team

function displayName(row: { EmployeeID: string; FirstName: string | null; LastName: string | null }): string {
  const full = [row.FirstName, row.LastName].filter(Boolean).join(' ').trim()
  return full || row.EmployeeID
}

/** Everyone who can be on a team (engineers from the last sync), flagged with current membership. */
export async function getTeamCandidates(): Promise<TeamCandidate[]> {
  const db = await getDb()
  // The second SELECT keeps a current team member visible even when they
  // have no Employee row on this device (e.g. the signed-in engineer before
  // the first sync that brings the team list down).
  const res = await db.query(
    `SELECT e.EmployeeID AS EmployeeID, e.FirstName AS FirstName, e.LastName AS LastName, ct.Members AS Members
     FROM Employee e
     LEFT JOIN TblCurrentTeam ct ON lower(ct.Members) = lower(e.EmployeeID)
     WHERE e.Deleted = 0 AND (e.IsEngineer = 1 OR e.IsEngineer IS NULL)
     UNION ALL
     SELECT ct.Members, NULL, NULL, ct.Members
     FROM TblCurrentTeam ct
     WHERE NOT EXISTS (SELECT 1 FROM Employee e WHERE lower(e.EmployeeID) = lower(ct.Members))
     ORDER BY 2, 3, 1`,
  )
  return rowsOf<{ EmployeeID: string; FirstName: string | null; LastName: string | null; Members: string | null }>(
    res,
  ).map((r) => ({ employeeID: r.EmployeeID, displayName: displayName(r), selected: r.Members != null }))
}

export async function getCurrentTeam(): Promise<TeamMember[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT ct.Members AS EmployeeID, ct.tblEmployeeTime_GUID, e.FirstName, e.LastName
     FROM TblCurrentTeam ct
     LEFT JOIN Employee e ON lower(e.EmployeeID) = lower(ct.Members)
     ORDER BY e.FirstName, e.LastName, ct.Members`,
  )
  return rowsOf<{
    EmployeeID: string
    tblEmployeeTime_GUID: string | null
    FirstName: string | null
    LastName: string | null
  }>(res).map((r) => ({
    employeeID: r.EmployeeID,
    displayName: displayName(r),
    openTimeGuid: r.tblEmployeeTime_GUID,
  }))
}

/**
 * Makes sure the signed-in engineer is on the team when it is empty - the
 * MAUI team screen refuses to proceed with nobody selected; pre-selecting
 * the engineer is the sensible default for a one-person visit.
 */
export async function ensureSelfOnTeam(): Promise<void> {
  const team = await getCurrentTeam()
  if (team.length > 0) return
  const me = await getCurrentUsername()
  if (!me) return
  await setTeamMember(me, true)
}

/**
 * TeamViewModel.UpdateTeam: adds or removes a member. While a job is
 * current, adding opens an EmployeeTime row for them right now (with the
 * current state as Activity) and removing closes theirs.
 */
export async function setTeamMember(employeeID: string, selected: boolean): Promise<void> {
  const db = await getDb()
  await clearStaleTransaction(db)
  const { currentJob, currentState } = await getEngineerState()
  const now = new Date()

  if (selected) {
    let guid: string | null = null
    if (currentJob) {
      guid = newGuid()
      await db.run(
        `INSERT INTO EmployeeTime (tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, Activity, Updated, Sent)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [guid, currentJob, employeeID, nowLocalIso(now), currentState, nowLocalIso(now)],
      )
    }
    await db.run(
      `INSERT INTO TblCurrentTeam (Members, tblEmployeeTime_GUID) VALUES (?, ?)
       ON CONFLICT(Members) DO UPDATE SET tblEmployeeTime_GUID = COALESCE(excluded.tblEmployeeTime_GUID, TblCurrentTeam.tblEmployeeTime_GUID)`,
      [employeeID, guid],
    )
  } else {
    const res = await db.query('SELECT tblEmployeeTime_GUID FROM TblCurrentTeam WHERE lower(Members) = lower(?)', [
      employeeID,
    ])
    const guid = rowsOf<{ tblEmployeeTime_GUID: string | null }>(res)[0]?.tblEmployeeTime_GUID ?? null
    if (guid) {
      await closeTimeRowByGuid(guid, now)
    }
    await db.run('DELETE FROM TblCurrentTeam WHERE lower(Members) = lower(?)', [employeeID])
  }

  await persist()
}

// ----------------------------------------------------------------- time rows
//
// Everything a transition writes is collected as a list of statements and
// executed in ONE db.executeSet(..., true) call at the end: the plugin owns
// the BEGIN/COMMIT, so nothing here can collide with a transaction that is
// already open (which is exactly what "cannot start a transaction within a
// transaction" was). Reads happen up front, before any write.

interface Statement {
  statement: string
  values: unknown[]
}

/** Statements closing one open EmployeeTime row (SaveEmployee_FinishTime for a member). */
async function closeTimeRowStatements(guid: string, finishAt: Date): Promise<Statement[]> {
  const db = await getDb()
  const res = await db.query('SELECT StartDT FROM EmployeeTime WHERE tblEmployeeTime_GUID = ? AND FinishDT IS NULL', [
    guid,
  ])
  const row = rowsOf<{ StartDT: string }>(res)[0]
  if (!row) return []

  const { timeHours, finishDt } = closeTimeRow(row.StartDT, finishAt)
  return [
    {
      statement: `UPDATE EmployeeTime SET FinishDT = ?, TimeHours = ?, RateHour = 0, Updated = ?, Sent = 0
                  WHERE tblEmployeeTime_GUID = ?`,
      values: [finishDt, timeHours, nowLocalIso(finishAt), guid],
    },
    {
      statement: 'UPDATE TblCurrentTeam SET tblEmployeeTime_GUID = NULL WHERE tblEmployeeTime_GUID = ?',
      values: [guid],
    },
  ]
}

/** Runs closeTimeRowStatements on its own (used when a member is removed from the team). */
async function closeTimeRowByGuid(guid: string, finishAt: Date): Promise<void> {
  const db = await getDb()
  const statements = await closeTimeRowStatements(guid, finishAt)
  if (statements.length === 0) return
  await clearStaleTransaction(db)
  await db.executeSet(statements, true)
}

/** SaveEmployee_FinishTime: statements closing every team member's open row. */
async function closeTeamTimeRowStatements(finishAt: Date): Promise<Statement[]> {
  const db = await getDb()
  const res = await db.query(
    'SELECT tblEmployeeTime_GUID FROM TblCurrentTeam WHERE tblEmployeeTime_GUID IS NOT NULL',
  )
  const statements: Statement[] = []
  for (const r of rowsOf<{ tblEmployeeTime_GUID: string }>(res)) {
    statements.push(...(await closeTimeRowStatements(r.tblEmployeeTime_GUID, finishAt)))
  }
  return statements
}

/**
 * SaveEmployee_StartTime: statements opening a row per team member with
 * `state` as its Activity, and - when going On Work for the first time -
 * stamping the job's StartDT / ScheduledDate and deriving ScheduledEndDate
 * from SchDays/Hours/Minutes, as the legacy app did.
 */
async function openTeamTimeRowStatements(serRecId: number, state: JobState, startAt: Date): Promise<Statement[]> {
  const db = await getDb()
  const now = nowLocalIso(startAt)
  const team = rowsOf<{ Members: string }>(await db.query('SELECT Members FROM TblCurrentTeam'))
  const statements: Statement[] = []

  for (const member of team) {
    const guid = newGuid()
    statements.push(
      {
        statement: `INSERT INTO EmployeeTime (tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, Activity, Updated, Sent)
                    VALUES (?, ?, ?, ?, ?, ?, 0)`,
        values: [guid, serRecId, member.Members, now, state, now],
      },
      {
        statement: 'UPDATE TblCurrentTeam SET tblEmployeeTime_GUID = ? WHERE Members = ?',
        values: [guid, member.Members],
      },
    )
  }

  if (state === 'On Work') {
    const job = rowsOf<{ StartDT: string | null; SchDays: number | null; SchHours: number | null; SchMinutes: number | null }>(
      await db.query('SELECT StartDT, SchDays, SchHours, SchMinutes FROM ServiceRecord WHERE SerRecID = ?', [serRecId]),
    )[0]

    if (job && !job.StartDT) {
      const days = job.SchDays ?? 0
      const hrs = job.SchHours ?? 0
      const mins = job.SchMinutes ?? 0
      let scheduledEnd: string | null = null
      if (days > 0 || hrs > 0 || mins > 0) {
        const end = new Date(startAt)
        end.setDate(end.getDate() + days)
        end.setHours(end.getHours() + hrs, end.getMinutes() + mins)
        scheduledEnd = nowLocalIso(end)
      }
      statements.push({
        statement: 'UPDATE ServiceRecord SET StartDT = ?, ScheduledDate = ?, ScheduledEndDate = ?, Sent = 0 WHERE SerRecID = ?',
        values: [now, now, scheduledEnd, serRecId],
      })
    }
  }

  return statements
}

function stampJobStatement(
  serRecId: number,
  dispatchStatus: string,
  at: Date,
  localStatus: 'wip' | 'paused' | 'completed' | 'declined',
): Statement {
  const now = nowLocalIso(at)
  return {
    statement: `UPDATE ServiceRecord
                SET DispatchStatus = ?, FinishDT = ?, Updated = ?, Sent = 0, SerRec_GUID = ?,
                    ScheduledEndDate = CASE WHEN ? = '50' THEN ? ELSE ScheduledEndDate END,
                    local_status = ?,
                    local_completed_at = CASE WHEN ? = 'completed' THEN ? ELSE local_completed_at END
                WHERE SerRecID = ?`,
    values: [dispatchStatus, now, now, newGuid(), dispatchStatus, now, localStatus, localStatus, now, serRecId],
  }
}

function engineerStateStatements(state: EngineerState): Statement[] {
  return [
    ['currentJob', state.currentJob ? String(state.currentJob) : ''],
    ['currentState', state.currentState],
  ].map(([key, value]) => ({
    statement: `INSERT INTO app_meta (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    values: [key, value],
  }))
}

// ------------------------------------------------------------------ transitions

/**
 * BaseViewModel.UpdateStatus. `serRecId` null means "leave the current job"
 * (pause or complete, per `dispatchStatus`). All reads first, then every
 * write in one atomic executeSet.
 */
export async function transition(
  serRecId: number | null,
  dispatchStatus: string,
  newState: JobState,
): Promise<void> {
  const db = await getDb()
  const { currentJob } = await getEngineerState()
  const at = new Date()

  const changeCurrent = serRecId != null && currentJob === serRecId
  const exitCurrent = currentJob != null && (serRecId == null || currentJob !== serRecId)
  const createNew = serRecId != null && currentJob !== serRecId

  const statements: Statement[] = []

  if (exitCurrent && currentJob != null) {
    // Leaving the current job: it is paused unless we're explicitly
    // cancelling/completing it.
    const exitStatus =
      serRecId == null && (dispatchStatus === '45' || dispatchStatus === '50') ? dispatchStatus : JOB_STATUS.paused
    statements.push(stampJobStatement(currentJob, exitStatus, at, exitStatus === '50' ? 'completed' : 'paused'))
    statements.push(...(await closeTeamTimeRowStatements(at)))
  }

  statements.push(...engineerStateStatements({ currentJob: serRecId, currentState: serRecId == null ? 'Unknown' : newState }))

  if (changeCurrent && serRecId != null) {
    // Same job, new state (TravelTo -> On Work -> TravelFrom).
    statements.push(...(await closeTeamTimeRowStatements(at)))
    statements.push(stampJobStatement(serRecId, dispatchStatus, at, 'wip'))
    statements.push(...(await openTeamTimeRowStatements(serRecId, newState, at)))
  }

  if (createNew && serRecId != null) {
    statements.push(...(await openTeamTimeRowStatements(serRecId, newState, at)))
    statements.push(stampJobStatement(serRecId, dispatchStatus, at, 'wip'))
  }

  // Legacy TblLiveSync breadcrumb marking the state change, so the office
  // sees "Travelling to job 46346 / On site" as it happens (see liveSync.ts
  // for the GPS/ETA rows the Travel screen adds on top).
  const me = await getCurrentUsername()
  if (me) {
    const team = (await getCurrentTeam()).map((m) => m.displayName).join(', ')
    statements.push({
      statement: `INSERT INTO TblLiveSync (ID, EmpID, Latitude, Longitude, Activity, SerRecID, Updated, StateChange, ETA, New_GPS, Team, Sent)
                  VALUES (?, ?, NULL, NULL, ?, ?, ?, 1, NULL, 0, ?, 0)`,
      values: [newGuid(), me, serRecId == null ? 'Unknown' : newState, serRecId ?? currentJob, nowLocalIso(at), team || null],
    })
  }

  await clearStaleTransaction(db)
  await db.executeSet(statements, true)
  await persist()
}

export const travelTo = (serRecId: number) => transition(serRecId, JOB_STATUS.travelTo, 'TravelTo')
export const startWork = (serRecId: number) => transition(serRecId, JOB_STATUS.onWork, 'On Work')
export const travelFrom = (serRecId: number) => transition(serRecId, JOB_STATUS.travelFrom, 'TravelFrom')
/** Pause the current job (status 40) and close all time rows. */
export const pauseCurrentJob = () => transition(null, JOB_STATUS.paused, 'Unknown')
/** Complete the current job (status 50) and close all time rows. */
export const completeCurrentJob = () => transition(null, JOB_STATUS.completed, 'Unknown')

/**
 * Decline a job that hasn't been started (DispatchStatus 04). Only status
 * changes - no time rows are involved. The legacy app also emailed the
 * office from here (DeclinedEmail setting); that is not carried over yet.
 */
export async function declineJob(serRecId: number, reason: string | null): Promise<void> {
  const db = await getDb()
  const { currentJob } = await getEngineerState()
  if (currentJob === serRecId) {
    throw new Error('Pause or complete this job before declining it.')
  }
  await clearStaleTransaction(db)
  const now = nowLocalIso()
  await db.run(
    `UPDATE ServiceRecord
     SET DispatchStatus = ?, Cause = CASE WHEN ? IS NULL THEN Cause ELSE ? END, Updated = ?, Sent = 0, SerRec_GUID = ?,
         local_status = 'declined'
     WHERE SerRecID = ?`,
    [JOB_STATUS.declined, reason, reason, now, newGuid(), serRecId],
  )
  await persist()
}

// --------------------------------------------------------------------- queries

export async function getEmployeeTimesForJob(serRecId: number): Promise<LocalEmployeeTime[]> {
  const db = await getDb()
  const res = await db.query(
    `SELECT tblEmployeeTime_GUID, ServiceID, EmployeeID, StartDT, FinishDT, TimeHours, Activity, Sent
     FROM EmployeeTime WHERE ServiceID = ? AND Deleted = 0 ORDER BY StartDT`,
    [serRecId],
  )
  return rowsOf<{
    tblEmployeeTime_GUID: string
    ServiceID: number
    EmployeeID: string
    StartDT: string
    FinishDT: string | null
    TimeHours: number | null
    Activity: string | null
    Sent: number
  }>(res).map((r) => ({
    guid: r.tblEmployeeTime_GUID,
    serviceId: r.ServiceID,
    employeeId: r.EmployeeID,
    startDt: r.StartDT,
    finishDt: r.FinishDT,
    timeHours: r.TimeHours,
    activity: r.Activity,
    sent: Boolean(r.Sent),
  }))
}

/** Hours already booked on a job (closed rows), split the way the legacy summary did. */
export async function getJobHoursSummary(serRecId: number): Promise<{ labour: number; travel: number }> {
  const db = await getDb()
  const res = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN Activity IN ('TravelTo', 'TravelFrom') THEN TimeHours ELSE 0 END), 0) AS travel,
       COALESCE(SUM(CASE WHEN Activity NOT IN ('TravelTo', 'TravelFrom') THEN TimeHours ELSE 0 END), 0) AS labour
     FROM EmployeeTime WHERE ServiceID = ? AND Deleted = 0 AND FinishDT IS NOT NULL`,
    [serRecId],
  )
  const row = rowsOf<{ travel: number; labour: number }>(res)[0]
  return { labour: row?.labour ?? 0, travel: row?.travel ?? 0 }
}
