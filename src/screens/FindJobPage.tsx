import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IonAlert,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonLoading,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { cloudOfflineOutline, peopleOutline } from 'ionicons/icons'
import { FIND_JOB_PAGE_SIZE, joinCrew, searchJobs, type JobSearchItemDto } from '../api/findJob'
import { syncDownAndStore } from '../db/localData'
import { formatDate } from '../utils/format'

/**
 * Find Job (main menu) - ONLINE ONLY. Lists open, dispatched jobs that are
 * NOT this engineer's (not the lead, not on the crew), by search or all of
 * them, 25 at a time with infinite scroll. Tapping a job explains that it
 * is someone else's and offers "Join as crew": the server adds a JobCrew
 * row (JobType "self"), the app runs a partial sync so the job lands on the
 * device like any crew job, and the crew WIP screen takes over from there -
 * Clock In / Pause / Clock Out, offline from then on. Nothing on this
 * screen is stored locally.
 */
type Mode = 'search' | 'all'

export default function FindJobPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<JobSearchItemDto[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<JobSearchItemDto | null>(null)
  const [joining, setJoining] = useState(false)
  const [failToast, setFailToast] = useState<string | null>(null)
  const requestId = useRef(0)

  const effectiveQuery = mode === 'all' ? '' : query.trim()

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!navigator.onLine) {
        setOffline(true)
        return
      }
      setOffline(false)
      // In search mode an empty box shows nothing (the "All open jobs" tab is the way to browse).
      if (mode === 'search' && effectiveQuery === '') {
        setItems([])
        setTotal(null)
        setHasMore(false)
        return
      }
      const id = ++requestId.current
      setLoading(replace)
      setError(null)
      try {
        const result = await searchJobs(effectiveQuery, nextPage, FIND_JOB_PAGE_SIZE)
        if (id !== requestId.current) return // a newer search superseded this one
        if (!result.hasData || !result.data) {
          setError(result.failMessage ?? 'Could not search jobs.')
          return
        }
        setItems((prev) => (replace ? result.data!.items : [...prev, ...result.data!.items]))
        setPage(result.data.page)
        setHasMore(result.data.hasMore)
        setTotal(result.data.total)
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : 'Could not reach the server.')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [mode, effectiveQuery],
  )

  // New search / mode -> first page.
  useEffect(() => {
    if (location.pathname !== '/find-job') return
    void load(1, true)
  }, [location.pathname, load])

  useEffect(() => {
    const on = () => void load(1, true)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [load])

  async function handleJoin(job: JobSearchItemDto) {
    setJoining(true)
    setError(null)
    try {
      const result = await joinCrew(job.serRecID)
      if (!result.hasData) {
        const msg = result.failMessage ?? 'Could not join the crew.'
        setError(msg)
        setFailToast(`Not joined: ${msg}`)
        return
      }
      // Bring the job (and its site/customer) down now that it is in scope.
      await syncDownAndStore('partial')
      setSelected(null)
      navigate(`/jobs/${job.serRecID}/crew`, { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the server.'
      setError(msg)
      setFailToast(`Not joined: ${msg}`)
    } finally {
      setJoining(false)
    }
  }

  const siteLine = (j: JobSearchItemDto) => [j.siteName, j.address, j.town, j.postCode].filter(Boolean).join(', ')

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/jobs" />
          </IonButtons>
          <IonTitle>Find Job</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={mode} onIonChange={(e) => setMode((e.detail.value as Mode) ?? 'search')}>
            <IonSegmentButton value="search">
              <IonLabel>Search</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="all">
              <IonLabel>All open jobs</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        {mode === 'search' && (
          <IonToolbar>
            <IonSearchbar
              placeholder="Job no, docket, site, customer, postcode…"
              value={query}
              debounce={400}
              onIonInput={(e) => setQuery(e.detail.value ?? '')}
              onIonClear={() => setQuery('')}
            />
          </IonToolbar>
        )}
      </IonHeader>

      <IonContent>
        {offline && (
          <IonItem color="warning" lines="none">
            <IonIcon icon={cloudOfflineOutline} slot="start" />
            <IonLabel className="ion-text-wrap">Find Job needs a connection - these are other engineers&apos; jobs, read from the office.</IonLabel>
          </IonItem>
        )}

        <IonText color="medium">
          <p className="ion-padding-horizontal" style={{ fontSize: 13, margin: '8px 0 0' }}>
            Jobs dispatched to other engineers. You can join one as a crew member to log your time against it.
            {total != null && ` ${total} job${total === 1 ? '' : 's'}.`}
          </p>
        </IonText>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-horizontal">{error}</p>
          </IonText>
        )}

        {!loading && !offline && items.length === 0 && (mode === 'all' || effectiveQuery !== '') && !error && (
          <div className="ion-padding ion-text-center">
            <p>No open jobs found.</p>
          </div>
        )}

        <IonList>
          {items.map((j) => (
            <IonItem key={j.serRecID} button detail onClick={() => setSelected(j)} disabled={offline}>
              <IonLabel className="ion-text-wrap">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {j.docketRef ?? `Job #${j.serRecID}`}
                  <IonBadge color="medium">Lead: {j.leadName ?? j.dispatchEng ?? '—'}</IonBadge>
                  {j.priority != null && j.priority > 0 && <IonBadge color="danger">P{j.priority}</IonBadge>}
                </h2>
                <p>{siteLine(j) || 'No site on file'}</p>
                {j.customerName && j.customerName !== j.siteName && <p>{j.customerName}</p>}
                <p>{j.probDesc}</p>
                <IonNote color="medium">
                  {formatDate(j.scheduledDate)}
                  {j.dispatchStatusDesc ? ` · ${j.dispatchStatusDesc}` : ''}
                  {j.crew.length > 0 ? ` · crew: ${j.crew.join(', ')}` : ''}
                </IonNote>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>

        <IonInfiniteScroll
          disabled={!hasMore || offline}
          onIonInfinite={(e) => void load(page + 1, false).finally(() => e.target.complete())}
        >
          <IonInfiniteScrollContent loadingText="Loading more jobs…" />
        </IonInfiniteScroll>

        <IonAlert
          isOpen={selected !== null}
          header={selected ? (selected.docketRef ?? `Job #${selected.serRecID}`) : ''}
          subHeader="This is not your job"
          message={
            selected
              ? `It is dispatched to ${selected.leadName ?? selected.dispatchEng ?? 'another engineer'}` +
                (selected.crew.length > 0 ? ` with crew ${selected.crew.join(', ')}` : '') +
                `. Join it as a crew member to log your time against it? You will not be able to change the job itself, and the office will see you on the crew.`
              : ''
          }
          buttons={[
            { text: 'Cancel', role: 'cancel', handler: () => setSelected(null) },
            {
              text: 'Join as crew',
              role: 'confirm',
              handler: () => {
                if (selected) void handleJoin(selected)
              },
            },
          ]}
          onDidDismiss={() => {
            if (!joining) setSelected(null)
          }}
        />

        <IonToast
          isOpen={failToast !== null}
          message={failToast ?? ''}
          color="danger"
          duration={6000}
          position="top"
          buttons={[{ text: 'OK', role: 'cancel' }]}
          onDidDismiss={() => setFailToast(null)}
        />
        <IonLoading isOpen={loading || joining} message={joining ? 'Joining crew…' : 'Searching…'} />

        {items.length === 0 && !loading && mode === 'search' && effectiveQuery === '' && !offline && (
          <div className="ion-padding ion-text-center">
            <IonIcon icon={peopleOutline} style={{ fontSize: 40, color: 'var(--ion-color-medium)' }} />
            <p>Search for a job, or switch to <strong>All open jobs</strong> to browse.</p>
            <IonButton fill="outline" size="small" onClick={() => setMode('all')}>
              Show all open jobs
            </IonButton>
          </div>
        )}
      </IonContent>
    </IonPage>
  )
}
