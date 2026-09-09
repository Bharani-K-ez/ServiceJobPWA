import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonText,
  IonTitle,
  IonToolbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { settingsOutline } from 'ionicons/icons'
import {
  getOpenJobs,
  getSiteById,
  getWipJob,
  pauseJobLocally,
  startJob,
  type LocalJob,
} from '../db/localData'
import { pauseJobOnServer, syncDown } from '../api/syncV2'
import { upsertSyncData } from '../db/localData'

interface JobRow {
  job: LocalJob
  siteLabel: string
}

export default function JobListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<JobRow[]>([])
  const [wipSerRecId, setWipSerRecId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pausingSerRecId, setPausingSerRecId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [jobs, wipJob] = await Promise.all([getOpenJobs(), getWipJob()])
    const withSites = await Promise.all(
      jobs.map(async (job) => {
        const site = job.siteId != null ? await getSiteById(job.siteId) : null
        const siteLabel = site
          ? [site.occupant, site.address, site.town].filter(Boolean).join(', ')
          : 'No site on file'
        return { job, siteLabel }
      }),
    )
    setRows(withSites)
    setWipSerRecId(wipJob?.serRecId ?? null)
    setLoading(false)
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
  useEffect(() => {
    if (location.pathname === '/jobs') {
      void load()
    }
  }, [location, load])

  async function handleRefresh(event: CustomEvent<RefresherEventDetail>) {
    try {
      const result = await syncDown()
      if (result.hasData && result.data) {
        await upsertSyncData(result.data)
      }
      await load()
    } finally {
      event.detail.complete()
    }
  }

  async function handleStartJob(serRecId: number) {
    await startJob(serRecId)
    navigate(`/jobs/${serRecId}/wip`)
  }

  /**
   * Pauses a job right from the list (DispatchStatus "40"/WIPPaused
   * server-side, local_status = 'paused' locally) without navigating into
   * WipPage first. Resuming a paused job reuses handleStartJob above - same
   * as WipPage, there is no separate "resume" server call.
   */
  async function handlePauseJob(serRecId: number) {
    setError(null)
    setPausingSerRecId(serRecId)
    try {
      const result = await pauseJobOnServer(serRecId)
      if (!result.hasData) {
        setError(result.failMessage ?? 'Could not pause the job. Please try again.')
        return
      }
      await pauseJobLocally(serRecId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server. Try again once you have a connection.')
    } finally {
      setPausingSerRecId(null)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>My Jobs</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/utilities">
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
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

        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        <IonList>
          {rows.map(({ job, siteLabel }) => {
            const isThisWip = wipSerRecId === job.serRecId
            const anotherJobIsWip = wipSerRecId != null && !isThisWip
            const isPaused = job.localStatus === 'paused'
            const isPausingThis = pausingSerRecId === job.serRecId

            return (
              <IonItem key={job.serRecId}>
                <IonLabel className="ion-text-wrap">
                  <h2>{job.docketRef ?? `Job #${job.serRecId}`}</h2>
                  <p>{siteLabel}</p>
                  <p>{job.probDesc}</p>
                  {job.dispatchStatusDesc && (
                    <IonNote color="medium">{job.dispatchStatusDesc}</IonNote>
                  )}
                </IonLabel>
                {isThisWip && <IonBadge color="warning">In progress</IonBadge>}
                {isPaused && !isThisWip && <IonBadge color="medium">Paused</IonBadge>}
                <IonButton
                  slot="end"
                  fill={isThisWip ? 'solid' : 'outline'}
                  disabled={anotherJobIsWip}
                  onClick={() =>
                    isThisWip ? navigate(`/jobs/${job.serRecId}/wip`) : handleStartJob(job.serRecId)
                  }
                >
                  {isThisWip ? 'Resume' : isPaused ? 'Resume' : 'Start Job'}
                </IonButton>
                {isThisWip && (
                  <IonButton
                    slot="end"
                    fill="outline"
                    color="medium"
                    disabled={isPausingThis}
                    onClick={() => handlePauseJob(job.serRecId)}
                  >
                    Pause
                  </IonButton>
                )}
              </IonItem>
            )
          })}
        </IonList>
      </IonContent>
    </IonPage>
  )
}
