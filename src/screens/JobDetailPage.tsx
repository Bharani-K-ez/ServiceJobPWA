import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  IonAlert,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonLoading,
  IonNote,
  IonPage,
  IonRow,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { callOutline, carOutline, closeCircleOutline, playOutline, timeOutline } from 'ionicons/icons'
import { useJobDetails } from '../hooks/useJobDetails'
import { declineJob, getEngineerState, getJobHoursSummary, type EngineerState } from '../db/jobState'
import { getJobById, tryPushPendingLocalChanges } from '../db/localData'
import { getJobCrew, getJobRole, getJobSlots, type JobRole, type JobSlot } from '../db/crew'
import { formatSlots } from '../utils/slots'
import { formatDate, formatDateTime, formatHours } from '../utils/format'
import JobContactSheet from './JobContactSheet'
import { wipPathFor } from '../navigation/wipReturn'

/**
 * Job details, reached by tapping a job in the list. The four actions the
 * engineer has before a job is under way - Travel To, Start Job, Contact,
 * Decline - live in the footer. Travel To / Start Job go through TeamPage
 * (pick who is on site) and from there into WipPage; the job that is
 * already the device's current job just offers Resume.
 */
export default function JobDetailPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const id = Number(serRecId)
  const navigate = useNavigate()
  const location = useLocation()
  const { job, site, customer, loading, reload } = useJobDetails(id)

  const [engineer, setEngineer] = useState<EngineerState>({ currentJob: null, currentState: 'Unknown' })
  const [currentJobLabel, setCurrentJobLabel] = useState<string | null>(null)
  const [hours, setHours] = useState<{ labour: number; travel: number }>({ labour: 0, travel: 0 })
  const [role, setRole] = useState<JobRole>('lead')
  const [slots, setSlots] = useState<JobSlot[]>([])
  const [crew, setCrew] = useState<{ displayName: string; isLead: boolean }[]>([])
  const [contactOpen, setContactOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadState = useCallback(async () => {
    const state = await getEngineerState()
    setEngineer(state)
    if (state.currentJob && state.currentJob !== id) {
      const other = await getJobById(state.currentJob)
      setCurrentJobLabel(other?.docketRef ?? `Job #${state.currentJob}`)
    } else {
      setCurrentJobLabel(null)
    }
    setHours(await getJobHoursSummary(id))
    const [r, s, c] = await Promise.all([getJobRole(id), getJobSlots(id), getJobCrew(id)])
    setRole(r)
    setSlots(s)
    setCrew(c)
  }, [id])

  // Re-read on every arrival at this route - see JobListPage for why a
  // mount-only effect is not enough under IonRouterOutlet.
  useEffect(() => {
    if (location.pathname === `/jobs/${id}`) {
      void reload()
      void loadState()
    }
  }, [location, id, reload, loadState])

  const isCurrent = engineer.currentJob === id
  const isPaused = job?.localStatus === 'paused'
  const isDone = job?.localStatus === 'completed' || job?.localStatus === 'declined'

  function goToTeam(state: 'TravelTo' | 'On Work') {
    navigate(`/jobs/${id}/team?state=${encodeURIComponent(state)}`)
  }

  async function handleDecline(reason: string) {
    setError(null)
    setBusy(true)
    try {
      await declineJob(id, reason.trim() || null)
      void tryPushPendingLocalChanges()
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline the job.')
    } finally {
      setBusy(false)
    }
  }

  const address = [site?.address, site?.town, site?.county, site?.postCode].filter(Boolean).join(', ')

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/jobs" />
          </IonButtons>
          <IonTitle>{job?.docketRef ?? `Job #${id}`}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {!loading && !job && (
          <IonText color="medium">
            <p className="ion-padding">This job is no longer on this device.</p>
          </IonText>
        )}

        {job && (
          <>
            <IonCard>
              <IonCardHeader>
                <IonCardSubtitle>
                  {customer?.organizationName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(' ')}
                </IonCardSubtitle>
                <IonCardTitle style={{ fontSize: 20 }}>{site?.occupant ?? site?.siteRef ?? 'Site'}</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p>{address || 'No address on file'}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {isCurrent && <IonBadge color="warning">Current job</IonBadge>}
                  {isPaused && !isCurrent && <IonBadge color="medium">Paused</IonBadge>}
                  {role === 'crew' && <IonBadge color="tertiary">Crew job</IonBadge>}
                  {role === 'crew' && slots.length > 0 && slots.every((s) => s.selfJoined) && (
                    <IonBadge color="medium">Joined</IonBadge>
                  )}
                  {role === 'lead' && slots.length > 0 && <IonBadge color="success">Lead</IonBadge>}
                  {job.localStatus === 'completed' && <IonBadge color="success">Completed</IonBadge>}
                  {job.localStatus === 'declined' && <IonBadge color="danger">Declined</IonBadge>}
                  {job.dispatchStatusDesc && <IonBadge color="light">{job.dispatchStatusDesc}</IonBadge>}
                  {job.priority != null && job.priority > 0 && <IonBadge color="danger">Priority {job.priority}</IonBadge>}
                </div>
              </IonCardContent>
            </IonCard>

            <IonList inset>
              <IonItem>
                <IonLabel className="ion-text-wrap">
                  <h3>Problem / work requested</h3>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{job.probDesc ?? job.description ?? '—'}</p>
                </IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel className="ion-text-wrap">
                  <h3>{slots.length > 1 ? 'Scheduled slots' : 'Scheduled'}</h3>
                  {slots.length > 0 ? (
                    slots.map((s) => <p key={s.id}>{formatSlots([s])}</p>)
                  ) : (
                    <p>
                      {formatDate(job.scheduledDate)}
                      {job.timeFrame ? ` · ${job.timeFrame}` : ''}
                    </p>
                  )}
                </IonLabel>
                {job.timeEst > 0 && <IonNote slot="end">est. {formatHours(job.timeEst)}</IonNote>}
              </IonItem>
              {crew.length > 0 && (
                <IonItem>
                  <IonLabel className="ion-text-wrap">
                    <h3>Crew</h3>
                    <p>{crew.map((m) => (m.isLead ? `${m.displayName} (lead)` : m.displayName)).join(', ')}</p>
                  </IonLabel>
                </IonItem>
              )}
              <IonItem>
                <IonLabel>
                  <h3>Service type</h3>
                  <p>{[job.serviceType, job.system].filter(Boolean).join(' · ') || '—'}</p>
                </IonLabel>
              </IonItem>
              {job.callerName && (
                <IonItem>
                  <IonLabel>
                    <h3>Caller</h3>
                    <p>{job.callerName}</p>
                  </IonLabel>
                </IonItem>
              )}
              <IonItem>
                <IonLabel>
                  <h3>Logged</h3>
                  <p>{formatDateTime(job.callReceivedDt)}</p>
                </IonLabel>
              </IonItem>
              {site?.panelLocation && (
                <IonItem>
                  <IonLabel className="ion-text-wrap">
                    <h3>Panel location</h3>
                    <p>{site.panelLocation}</p>
                  </IonLabel>
                </IonItem>
              )}
              {site?.note && (
                <IonItem>
                  <IonLabel className="ion-text-wrap">
                    <h3>Site notes</h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{site.note}</p>
                  </IonLabel>
                </IonItem>
              )}
              {(hours.labour > 0 || hours.travel > 0 || job.startDt) && (
                <IonItem>
                  <IonIcon icon={timeOutline} slot="start" color="medium" />
                  <IonLabel>
                    <h3>Time so far</h3>
                    <p>
                      {formatHours(hours.labour)} on site · {formatHours(hours.travel)} travel
                      {job.startDt ? ` · started ${formatDateTime(job.startDt)}` : ''}
                    </p>
                  </IonLabel>
                </IonItem>
              )}
            </IonList>

            {currentJobLabel && !isDone && (
              <IonText color="warning">
                <p className="ion-padding-horizontal" style={{ fontSize: 14 }}>
                  {currentJobLabel} is your current job - starting this one will pause it.
                </p>
              </IonText>
            )}

            {error && (
              <IonText color="danger">
                <p className="ion-padding-horizontal">{error}</p>
              </IonText>
            )}
          </>
        )}

        <JobContactSheet
          isOpen={contactOpen}
          onDismiss={() => setContactOpen(false)}
          site={site}
          customer={customer}
        />

        <IonAlert
          isOpen={declineOpen}
          header="Decline this job?"
          message="The office will see it as declined and can reassign it."
          inputs={[{ name: 'reason', type: 'textarea', placeholder: 'Reason (optional)' }]}
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Decline',
              role: 'destructive',
              handler: (values: { reason?: string }) => void handleDecline(values?.reason ?? ''),
            },
          ]}
          onDidDismiss={() => setDeclineOpen(false)}
        />

        <IonLoading isOpen={busy} message="Saving…" />
      </IonContent>

      {job && !isDone && (
        <IonFooter>
          <IonToolbar>
            <IonGrid>
              {role === 'crew' ? (
                // Crew member: time sheet only - no Travel To / Start / Decline,
                // and nothing here ever amends the job record.
                <IonRow>
                  <IonCol size="8">
                    <IonButton expand="block" color="tertiary" onClick={() => navigate(`/jobs/${id}/crew`)}>
                      <IonIcon slot="start" icon={playOutline} />
                      Clock In
                    </IonButton>
                  </IonCol>
                  <IonCol size="4">
                    <IonButton expand="block" fill="outline" onClick={() => setContactOpen(true)}>
                      <IonIcon slot="start" icon={callOutline} />
                      Contact
                    </IonButton>
                  </IonCol>
                </IonRow>
              ) : isCurrent ? (
                <IonRow>
                  <IonCol size="8">
                    <IonButton expand="block" color="warning" onClick={() => navigate(wipPathFor(id))}>
                      <IonIcon slot="start" icon={playOutline} />
                      Resume
                    </IonButton>
                  </IonCol>
                  <IonCol size="4">
                    <IonButton expand="block" fill="outline" onClick={() => setContactOpen(true)}>
                      <IonIcon slot="start" icon={callOutline} />
                      Contact
                    </IonButton>
                  </IonCol>
                </IonRow>
              ) : (
                <>
                  <IonRow>
                    <IonCol size="6">
                      <IonButton expand="block" fill="outline" onClick={() => goToTeam('TravelTo')}>
                        <IonIcon slot="start" icon={carOutline} />
                        Travel To
                      </IonButton>
                    </IonCol>
                    <IonCol size="6">
                      <IonButton expand="block" color="success" onClick={() => goToTeam('On Work')}>
                        <IonIcon slot="start" icon={playOutline} />
                        {isPaused ? 'Resume Job' : 'Start Job'}
                      </IonButton>
                    </IonCol>
                  </IonRow>
                  <IonRow>
                    <IonCol size="6">
                      <IonButton expand="block" fill="outline" onClick={() => setContactOpen(true)}>
                        <IonIcon slot="start" icon={callOutline} />
                        Contact
                      </IonButton>
                    </IonCol>
                    <IonCol size="6">
                      <IonButton
                        expand="block"
                        fill="outline"
                        color="danger"
                        disabled={isPaused}
                        onClick={() => setDeclineOpen(true)}
                      >
                        <IonIcon slot="start" icon={closeCircleOutline} />
                        Decline
                      </IonButton>
                    </IonCol>
                  </IonRow>
                </>
              )}
            </IonGrid>
          </IonToolbar>
        </IonFooter>
      )}
    </IonPage>
  )
}
