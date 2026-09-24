import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { calendarOutline, closeCircle, listOutline, settingsOutline } from 'ionicons/icons'
import { getCustomerById, getOpenJobs, getSiteById, syncDownAndStore } from '../db/localData'
import { getEngineerState, type JobState } from '../db/jobState'
import { getCrewClock, getJobRoles, getMySlotsByJob, type CrewClock } from '../db/crew'
import { formatDate } from '../utils/format'
import JobRowItem from './jobs/JobRowItem'
import { wipPathFor } from '../navigation/wipReturn'
import JobCalendarView from './jobs/JobCalendarView'
import { applyFilters, buildJobRow, type DateFilter, type DatePreset, type JobRow } from './jobs/jobFilters'

type ViewMode = 'list' | 'calendar'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'unscheduled', label: 'Unscheduled' },
]

const CHIP_STYLE: CSSProperties = { flex: '0 0 auto', maxWidth: 'none', margin: '4px 2px' }
const CHIP_LABEL_STYLE: CSSProperties = { whiteSpace: 'nowrap', overflow: 'visible', textOverflow: 'clip' }

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem('jobs.viewMode') === 'calendar' ? 'calendar' : 'list'
  } catch {
    return 'list'
  }
}

/**
 * My Jobs. Two views over the same filtered set of jobs - the default list
 * and a Day/Week/Month calendar (JobCalendarView) - with a wild search
 * (job number, docket, site, customer, address, description...) and a
 * date filter (presets or a picked range) that apply to both. The chosen
 * view is remembered on the device.
 */
export default function JobListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<JobRow[]>([])
  const [view, setView] = useState<ViewMode>(readViewMode)
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>({ preset: 'all' })
  const [rangeOpen, setRangeOpen] = useState(false)
  const [currentJob, setCurrentJob] = useState<number | null>(null)
  const [currentState, setCurrentState] = useState<JobState>('Unknown')
  const [crewClock, setCrewClock] = useState<CrewClock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // One-shot message handed over by WipPage after completing a job (see its
  // navigate('/jobs', { state: { toast } })).
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const incoming = (location.state as { toast?: string } | null)?.toast
    if (incoming) {
      setToast(incoming)
      // Clear it so a refresh / back-navigation doesn't replay it.
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [jobs, engineer, clock] = await Promise.all([getOpenJobs(), getEngineerState(), getCrewClock()])
      setCrewClock(clock)
      const [roles, slotsByJob] = await Promise.all([getJobRoles(jobs.map((j) => j.serRecId)), getMySlotsByJob()])
      const built = await Promise.all(
        jobs.map(async (job) => {
          const site = job.siteId != null ? await getSiteById(job.siteId) : null
          const customer = site?.custId != null ? await getCustomerById(site.custId) : null
          return buildJobRow(job, site, customer, roles.get(job.serRecId) ?? 'lead', slotsByJob.get(job.serRecId) ?? [])
        }),
      )
      setRows(built)
      setCurrentJob(engineer.currentJob)
      setCurrentState(engineer.currentState)
    } catch (err) {
      // Without this, a failure here (e.g. the local database failing to
      // open - see sqlite.ts's getDb()/ensureWebStore() for a case that
      // used to hang forever with no rejection at all) left this page
      // silently stuck on its initial empty/loading state forever: no
      // error shown, and - since the useEffect below just fires load()
      // and never inspects the result - an unhandled promise rejection
      // that only ever showed up in the browser console, not to the user
      // in the field. Surfacing it here also means the existing "go to
      // Settings and come back to Jobs" recovery path actually has
      // something to show for itself when the retry (now possible again
      // after sqlite.ts's cache-reset fix) still fails.
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load your jobs. Try again, or go to Settings and back.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  // IonRouterOutlet keeps this page's component mounted (for back-navigation
  // transitions) rather than unmounting/remounting it every time it becomes
  // active again, so a plain useEffect-on-mount only ever loads once for
  // this page's whole lifetime - navigating here again after a manual Sync
  // in Utilities, or after completing a job, would otherwise keep showing
  // the stale list.
  //
  // Ionic's own useIonViewWillEnter looked like the fix, but turned out
  // unreliable here: it never fires for the very first arrival at "/jobs"
  // right after login (RequireAuth swaps its loading-spinner IonPage out
  // for this one once auth resolves, and the outlet doesn't treat that
  // swap as a transition), AND it never fires for WipPage's
  // `navigate('/jobs', { replace: true })` after completing a job (a
  // REPLACE history action, unlike a genuine back-navigation) - both
  // confirmed by instrumenting it directly. Reacting to react-router's own
  // `location` instead sidesteps Ionic's transition detection entirely:
  // react-router gives every navigation (push, replace, or pop alike) a
  // new location with a unique key, and this component stays mounted and
  // subscribed to that location regardless of which route is currently
  // visible - so this fires exactly when the app actually arrives at
  // "/jobs", however it got there.
  // Both "/" and "/jobs" render this page (see App.tsx's note on why "/"
  // is not a redirect) - a fresh browser load lands on "/", so the check
  // must accept it too or the list stays empty until the next navigation.
  const isJobsRoute = location.pathname === '/jobs' || location.pathname === '/'

  useEffect(() => {
    if (isJobsRoute) {
      void load()
    }
  }, [location, isJobsRoute, load])

  // Covers a case the location-based effect above can't: the app going to
  // the background while already sitting on "/jobs" and coming back
  // without React Router ever seeing a navigation (no new `location`), so
  // that effect never re-fires. On Android specifically, whether the app
  // process actually survives backgrounding is up to the OS - if it does,
  // this component never remounts and nothing would otherwise reload the
  // list at all; if the OS killed it, this is a fresh cold start and the
  // effect above already re-fires load() on mount, but that first call can
  // still be sitting behind a slow-to-wake native SQLite bridge call (see
  // sqlite.ts's getDb() timeout for the matching fix on that side) with no
  // second attempt of its own. Either way, explicitly reacting to the app
  // actually becoming active again is a real trigger point independent of
  // both cases, confirmed necessary by direct reproduction: closing and
  // reopening the app left the list blank for 20+ seconds with nothing
  // shown, and only a manual pull-to-refresh (which just calls load()
  // again) brought the data back.
  useEffect(() => {
    const listenerPromise = App.addListener('resume', () => {
      if (isJobsRoute) {
        void load()
      }
    })
    return () => {
      void listenerPromise.then((listener) => listener.remove())
    }
  }, [isJobsRoute, load])

  async function handleRefresh(event: CustomEvent<RefresherEventDetail>) {
    try {
      // Pull-to-refresh is a delta: only what changed since the last sync.
      await syncDownAndStore('partial')
      await load()
    } finally {
      event.detail.complete()
    }
  }

  const filtered = useMemo(() => applyFilters(rows, query, dateFilter), [rows, query, dateFilter])
  const isFiltered = query.trim() !== '' || dateFilter.preset !== 'all'

  function switchView(next: ViewMode) {
    setView(next)
    try {
      localStorage.setItem('jobs.viewMode', next)
    } catch {
      // per-viewer convenience only
    }
  }

  function applyRange(value: string | string[] | null | undefined) {
    // IonDatetime with presentation="date" multiple gives the picked days;
    // the earliest and latest become the inclusive range.
    const days = (Array.isArray(value) ? value : value ? [value] : []).map((v) => v.slice(0, 10)).sort()
    if (days.length === 0) return
    setDateFilter({ preset: 'range', from: days[0], to: days[days.length - 1] })
  }

  const rangeLabel =
    dateFilter.preset === 'range'
      ? dateFilter.from === dateFilter.to
        ? formatDate(dateFilter.from)
        : `${formatDate(dateFilter.from)} – ${formatDate(dateFilter.to)}`
      : 'Pick dates'

  const openJob = (serRecId: number) => navigate(`/jobs/${serRecId}`)
  const resumeJob = (serRecId: number) => {
    const row = rows.find((r) => r.job.serRecId === serRecId)
    navigate(row?.role === 'crew' ? `/jobs/${serRecId}/crew` : wipPathFor(serRecId))
  }
  // A running/paused crew clock marks its job as "current" too, with its own badge text.
  const activeJob = currentJob ?? crewClock?.serRecId ?? null
  const activeLabel = currentJob ? undefined : crewClock?.status === 'in' ? 'Clocked in' : crewClock ? 'Paused' : undefined

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>My Jobs</IonTitle>
          <IonButtons slot="end">
            <IonButton
              onClick={() => switchView(view === 'list' ? 'calendar' : 'list')}
              title={view === 'list' ? 'Calendar view' : 'List view'}
            >
              <IonIcon slot="icon-only" icon={view === 'list' ? calendarOutline : listOutline} />
            </IonButton>
            <IonButton routerLink="/utilities">
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            placeholder="Search job no, site, customer, address…"
            value={query}
            debounce={150}
            onIonInput={(e) => setQuery(e.detail.value ?? '')}
            onIonClear={() => setQuery('')}
          />
        </IonToolbar>
        <IonToolbar>
          {/* Horizontally scrolling chip row. Each chip is flex: none so the
           * row overflows and scrolls instead of squeezing the chips (which
           * clipped their labels on phone widths). */}
          <div className="date-chip-row" style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '0 8px 4px', scrollbarWidth: 'none' }}>
            {DATE_PRESETS.map((p) => (
              <IonChip
                key={p.value}
                style={CHIP_STYLE}
                color={dateFilter.preset === p.value ? 'primary' : 'medium'}
                outline={dateFilter.preset !== p.value}
                onClick={() => setDateFilter({ preset: p.value })}
              >
                <IonLabel style={CHIP_LABEL_STYLE}>{p.label}</IonLabel>
              </IonChip>
            ))}
            <IonChip
              style={CHIP_STYLE}
              color={dateFilter.preset === 'range' ? 'primary' : 'medium'}
              outline={dateFilter.preset !== 'range'}
              onClick={() => setRangeOpen(true)}
            >
              <IonIcon icon={calendarOutline} />
              <IonLabel style={CHIP_LABEL_STYLE}>{rangeLabel}</IonLabel>
              {dateFilter.preset === 'range' && (
                <IonIcon
                  icon={closeCircle}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDateFilter({ preset: 'all' })
                  }}
                />
              )}
            </IonChip>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {!loading && rows.length === 0 && (
          <div className="ion-padding ion-text-center">
            <p>No open jobs. Pull down to sync.</p>
          </div>
        )}

        {!loading && rows.length > 0 && filtered.length === 0 && (
          <div className="ion-padding ion-text-center">
            <p>No jobs match your search or date filter.</p>
            <IonButton
              fill="clear"
              onClick={() => {
                setQuery('')
                setDateFilter({ preset: 'all' })
              }}
            >
              Clear filters
            </IonButton>
          </div>
        )}

        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        {isFiltered && filtered.length > 0 && (
          <IonText color="medium">
            <p className="ion-padding-horizontal" style={{ fontSize: 13, margin: '6px 0 0' }}>
              {filtered.length} of {rows.length} jobs
            </p>
          </IonText>
        )}

        {view === 'list' ? (
          <IonList>
            {filtered.map((row) => (
              <JobRowItem
                key={row.job.serRecId}
                row={row}
                isCurrent={activeJob === row.job.serRecId}
                currentState={currentState}
                currentLabel={activeLabel}
                onOpen={openJob}
                onResume={resumeJob}
              />
            ))}
          </IonList>
        ) : (
          <JobCalendarView
            rows={filtered}
            currentJob={activeJob}
            currentState={currentState}
            currentLabel={activeLabel}
            onOpen={openJob}
            onResume={resumeJob}
          />
        )}

        <IonModal isOpen={rangeOpen} onDidDismiss={() => setRangeOpen(false)} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Filter by date</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setRangeOpen(false)}>Done</IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonText color="medium">
              <p style={{ marginTop: 0 }}>Tap one day, or tap two days to filter everything between them.</p>
            </IonText>
            <IonDatetime
              presentation="date"
              multiple
              value={
                dateFilter.preset === 'range' && dateFilter.from && dateFilter.to
                  ? dateFilter.from === dateFilter.to
                    ? [dateFilter.from]
                    : [dateFilter.from, dateFilter.to]
                  : undefined
              }
              onIonChange={(e) => applyRange(e.detail.value)}
              style={{ margin: '0 auto' }}
            />
          </IonContent>
        </IonModal>

        <IonToast isOpen={toast !== null} message={toast ?? ''} duration={4000} onDidDismiss={() => setToast(null)} />
      </IonContent>
    </IonPage>
  )
}
