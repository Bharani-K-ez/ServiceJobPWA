import type { LocalJob } from '../../db/localData'

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

export function matchesDate(row: JobRow, filter: DateFilter, today = new Date()): boolean {
  const day = row.scheduledDay
  const todayKey = toDayKey(today)
  switch (filter.preset) {
    case 'all':
      return true
    case 'unscheduled':
      return day == null
    case 'today':
      return day === todayKey
    case 'week': {
      const start = toDayKey(startOfWeek(today))
      const end = toDayKey(addDays(startOfWeek(today), 6))
      return day != null && day >= start && day <= end
    }
    case 'overdue':
      return day != null && day < todayKey
    case 'range': {
      if (day == null) return false
      if (filter.from && day < filter.from) return false
      if (filter.to && day > filter.to) return false
      return true
    }
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

  return { job, siteName, siteAddress, customerName, searchText, scheduledDay: dayOf(plannedDate(job)) }
}
