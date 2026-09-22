import { getEngineerState } from '../db/jobState'

/**
 * Remembers where inside the WIP area the engineer last was, so "WIP" (the
 * floating menu, Resume buttons, app start-up) brings them back to the exact
 * screen - the asset they were servicing, the document they were filling -
 * rather than the WIP summary every time.
 *
 * The WIP area is every route under /jobs/:id/ other than the details page:
 * wip, assets, assets/:guid, documents/:template, team (without a ?state=
 * start-job query). Stored per job, in localStorage (a per-device
 * convenience, nothing that needs syncing).
 */

const KEY = 'jobs.lastWipPath'

const WIP_AREA = /^\/jobs\/(\d+)\/(wip|assets|documents|team)(\/|$)/

/** Called on every route change (FloatingMenu does this) - records WIP-area routes. */
export function rememberWipPath(pathname: string, search: string): void {
  const m = WIP_AREA.exec(pathname)
  if (!m) return
  // The team picker reached from Job Details (?state=TravelTo|On Work) is a
  // "start job" step, not a WIP screen to return to.
  if (m[2] === 'team' && new URLSearchParams(search).has('state')) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ serRecId: Number(m[1]), path: pathname + search }))
  } catch {
    // per-viewer convenience only
  }
}

/** Where to go for job `serRecId`'s WIP: the remembered sub-screen if it belongs to that job, else the WIP summary. */
export function wipPathFor(serRecId: number): string {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { serRecId: number; path: string }
      if (saved.serRecId === serRecId && typeof saved.path === 'string') return saved.path
    }
  } catch {
    // fall through
  }
  return `/jobs/${serRecId}/wip`
}

export function clearWipPath(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/**
 * The screen the app should open on: the current job's WIP area when a job
 * is under way, otherwise the job list. Used by LoginPage after sign-in and
 * by StartupRedirect on a cold start.
 */
export async function startupPath(): Promise<string> {
  try {
    const { currentJob } = await getEngineerState()
    return currentJob ? wipPathFor(currentJob) : '/jobs'
  } catch {
    return '/jobs'
  }
}
