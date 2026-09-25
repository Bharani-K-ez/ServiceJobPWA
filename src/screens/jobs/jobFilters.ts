import type { LocalJob } from '../../db/localData'
import type { JobRole, JobSlot } from '../../db/crew'

/**
 * A job as the Jobs screen shows it: the ServiceRecord row plus the bits of
 * its site/customer that are displayed and searched. Built once per load in
 * JobListPage and shared by the list view, the calendar view and the
 * filters below.
 */
export interface JobRow {
  job: LocalJob
  siteName: string
  siteAddress: string
  customerName: string
  /** Lower-cased haystack for the wild search - every field an engineer might type. */
  searchText: string
  /** Local calendar day ("YYYY-MM-DD") the job is planned for, or null if unscheduled. */
  scheduledDay: string | null
  /** Every day the job is planned for - one per crew slot, else the single scheduledDay. */
  scheduledDays: string[]
  /** Lead (main job) or crew (time-sheet only) for the signed-in engineer. */
  role: JobRole
  /** The signed-in engineer's scheduled slots on this job (empty when not a crew-scheduled job). */
  slots: JobSlot[]
  /** The engineer added themselves from Find Job (JobCrew.JobType "self") rather than being dispatched. */
  selfJoined: boolean
}

export type DatePreset = 'all' | 'today' | 'week' | 'overdue' | 'unscheduled' | 'range'

export interface DateFilter {
  preset: DatePreset
  /** Inclusive local calendar days ("YYYY-MM-DD") - only used by preset 'range'. */
  from?: string
  to?: string
}

/** Local calendar day of a stored "YYYY-MM-DDTHH:mm:ss" (or ISO) date string. */
export function dayOf(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return toDayKey(d)
}

export function toDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // Mon = 0
  return addDays(out, -dow)
}

/** The day a job is planned for: ScheduledDate, else the promised date. */
export function plannedDate(job: LocalJob): string | null {
  return job.scheduledDate ?? job.datePromisedDt ?? null
}

/** Case-insensitive wild search over job number, docket, site, customer, address, description, type. */
export function matchesSearch(row: JobRow, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  // Every typed word must appear somewhere ("smith boiler" finds Smith's boiler job).
  return terms.every((t) => row.searchText.includes(t))
}

/** A job matches a date filter when ANY of its scheduled days does. */
export function matchesDate(row: JobRow, filter: DateFilter, today = new Date()): boolean {
  const days = row.scheduledDays
  const todayKey = toDayKey(today)
  switch (filter.preset) {
    case 'all':
      return true
    case 'unscheduled':
      return days.length === 0
    case 'today':
      return days.includes(todayKey)
    case 'week': {
      const start = toDayKey(startOfWeek(today))
      const end = toDayKey(addDays(startOfWeek(today), 6))
      return days.some((d) => d >= start && d <= end)
    }
    case 'overdue':
      // Every slot is in the past and the job is still open.
      return days.length > 0 && days.every((d) => d < todayKey)
    case 'range':
      return days.some((d) => (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to))
  }
}

export function applyFilters(rows: JobRow[], query: string, date: DateFilter): JobRow[] {
  return rows.filter((r) => matchesSearch(r, query) && matchesDate(r, date))
}

/** Builds the searchable/derived fields for one job. */
export function buildJobRow(
  job: LocalJob,
  site: { occupant: string | null; siteRef: string | null; address: string | null; town: string | null; county: string | null; postCode: string | null } | null,
  customer: { organizationName: string | null; firstName: string | null; lastName: string | null } | null,
  role: JobRole = 'lead',
  slots: JobSlot[] = [],
): JobRow {
  const siteName = site?.occupant ?? site?.siteRef ?? ''
  const siteAddress = [site?.address, site?.town, site?.county, site?.postCode].filter(Boolean).join(', ')
  const customerName =
    customer?.organizationName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(' ')
  const searchText = [
    job.serRecId,
    job.jobNumber,
    job.docketRef,
    siteName,
    siteAddress,
    customerName,
    job.probDesc,
    job.description,
    job.serviceType,
    job.system,
    job.callerName,
    job.dispatchStatusDesc,
  ]
    .filter((v) => v != null && v !== '')
    .join(' ')
    .toLowerCase()

  // Crew-scheduled jobs are planned per slot; anything else by ScheduledDate.
  const slotDays = Array.from(new Set(slots.map((s) => dayOf(s.start)).filter((d): d is string => d != null))).sort()
  const scheduledDay = slotDays[0] ?? dayOf(plannedDate(job))
  const scheduledDays = slotDays.length > 0 ? slotDays : scheduledDay ? [scheduledDay] : []

  return {
    job,
    siteName,
    siteAddress,
    customerName,
    searchText: `${searchText} ${role}`,
    scheduledDay,
    scheduledDays,
    role,
    slots,
    selfJoined: role === 'crew' && slots.length > 0 && slots.every((s) => s.selfJoined),
  }
}
