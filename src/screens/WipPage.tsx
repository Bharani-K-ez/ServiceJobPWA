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
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonLoading,
  IonNote,
  IonPage,
  IonRow,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import {
  callOutline,
  carOutline,
  checkmarkDoneOutline,
  constructOutline,
  documentTextOutline,
  pauseOutline,
  peopleOutline,
  playOutline,
} from 'ionicons/icons'
import { useJobDetails, useTicker } from '../hooks/useJobDetails'
import {
  completeCurrentJob,
  getEmployeeTimesForJob,
  getEngineerState,
  getTeamCandidates,
  pauseCurrentJob,
  startWork,
  travelFrom,
  type EngineerState,
  type JobState,
  type LocalEmployeeTime,
} from '../db/jobState'
import { addPendingCompletion, pushPendingLocalChanges, tryPushPendingLocalChanges } from '../db/localData'
import { completeJobOnServer } from '../api/syncV2'
import { DOC_TEMPLATES } from '../docTemplates/registry'
import { formatElapsed, formatHours, formatTime, secondsSince } from '../utils/format'
import JobContactSheet from './JobContactSheet'
import TravelPanel from './TravelPanel'

const STATE_LABEL: Record<JobState, string> = {
  TravelTo: 'Travelling to site',
  'On Work': 'On site',
  TravelFrom: 'Travelling back',
  Unknown: 'Not under way',
}

const STATE_COLOR: Record<JobState, string> = {
  TravelTo: 'primary',
  'On Work': 'success',
  TravelFrom: 'tertiary',
  Unknown: 'medium',
}

/**
 * Work In Progress. State-aware: the banner shows where the job is
 * (travelling / on site / travelling back) with a live clock since the last
 * change, the team list shows each member's running time, and the action
 * buttons offer only the moves that make sense from the current state:
 *
 *   TravelTo    -> Arrived (On Work) · Pause
 *   On Work     -> Travel From · Complete · Pause · Asset Service · Create Document
 *   TravelFrom  -> Complete · Back on site (On Work) · Pause
 *   not current -> Resume (via TeamPage) - the job is paused
 *
 * Every move goes through db/jobState.ts (closing/opening EmployeeTime rows
 * for the whole team) and is then pushed best-effort; Complete additionally
 * calls the server's CompleteJob (asset-service history + completion email)
 * once the push has landed, queuing it for the next Sync if offline.
 */
export default function WipPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const id = Number(serRecId)
  const navigate = useNavigate()
  const location = useLocation()
  const { job, site, customer, reload } = useJobDetails(id)

  const [engineer, setEngineer] = useState<EngineerState>({ currentJob: null, currentState: 'Unknown' })
  const [times, setTimes] = useState<LocalEmployeeTime[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [contactOpen, setContactOpen] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isCurrent = engineer.currentJob === id
  const state: JobState = isCurrent ? engineer.currentState : 'Unknown'
  const now = useTicker(1000, isCurrent)

  const jobDocTemplates = DOC_TEMPLATES.filter((t) => !t.assetScoped)

  const loadState = useCallback(async () => {
    const [st, rows, candidates] = await Promise.all([getEngineerState(), getEmployeeTimesForJob(id), getTeamCandidates()])
    setEngineer(st)
    setTimes(rows)
    setNames(new Map(candidates.map((c) => [c.employeeID.toLowerCase(), c.displayName])))
  }, [id])

  useEffect(() => {
    if (location.pathname === `/jobs/${id}/wip`) {
      void reload()
      void loadState()
    }
  }, [location, id, reload, loadState])

  const nameOf = (employeeId: string) => names.get(employeeId.toLowerCase()) ?? employeeId
  const openRows = times.filter((t) => t.finishDt == null)
  const closedRows = times.filter((t) => t.finishDt != null).slice().reverse()
  const stateSince = openRows.length > 0 ? openRows.map((r) => r.startDt).sort()[0] : null
  const labourHours = closedRows.filter((r) => r.activity === 'On Work').reduce((s, r) => s + (r.timeHours ?? 0), 0)
  const travelHours = closedRows.filter((r) => r.activity !== 'On Work').reduce((s, r) => s + (r.timeHours ?? 0), 0)

  async function move(label: string, action: () => Promise<void>) {
    setError(null)
    setBusy(label)
    try {
      await action()
      void tryPushPendingLocalChanges()
      await reload()
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the job.')
    } finally {
      setBusy(null)
    }
  }

  async function handlePause() {
    setError(null)
    setBusy('Pausing job…')
    try {
      await pauseCurrentJob()
      void tryPushPendingLocalChanges()
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pause the job.')
    } finally {
      setBusy(null)
    }
  }

  async function handleComplete() {
    setError(null)
    setBusy('Completing job…')
    try {
      // 1. Close every team member's time row and stamp the job 50 locally -
      //    this works offline and is the source of truth for the hours.
      await completeCurrentJob()

      // 2. Push the time rows, the job status and any saved Asset Service
      //    visits. The server builds the completion report from what it
      //    holds at the moment CompleteJob is called, so this must land first.
      const push = await pushPendingLocalChanges()
      let completedOnServer = false
      if (push.ok) {
        try {
          const result = await completeJobOnServer(id)
          completedOnServer = result.hasData
        } catch {
          completedOnServer = false
        }
      }

      // 3. Offline (or the server hiccupped): remember to call CompleteJob on
      //    the next Sync so the completion email still goes out.
      if (!completedOnServer) {
        await addPendingCompletion(id)
      }
      navigate('/jobs', {
        replace: true,
        state: {
          toast: completedOnServer
            ? 'Job completed.'
            : 'Job completed on this device. It will be sent to the office on your next Sync.',
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the job.')
    } finally {
      setBusy(null)
    }
  }

  const address = [site?.occupant, site?.address, site?.town].filter(Boolean).join(', ')

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/jobs" />
          </IonButtons>
          <IonTitle>{job?.docketRef ?? `Job #${id}`}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setContactOpen(true)}>
              <IonIcon slot="icon-only" icon={callOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {/* State banner */}
        <IonCard color={STATE_COLOR[state]}>
          <IonCardContent>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {STATE_LABEL[state]}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  {customer?.organizationName ?? site?.occupant ?? ''}
                </div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{address}</div>
              </div>
              {isCurrent && stateSince && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatElapsed(secondsSince(stateSince, now))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>since {formatTime(stateSince)}</div>
                </div>
              )}
            </div>
          </IonCardContent>
        </IonCard>

        {isCurrent && state === 'TravelTo' && <TravelPanel serRecId={id} site={site} />}

        {job?.probDesc && (
          <IonText>
            <p className="ion-padding-horizontal" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>
              {job.probDesc}
            </p>
          </IonText>
        )}

        {!isCurrent && job && (
          <IonText color="medium">
            <p className="ion-padding-horizontal" style={{ fontSize: 14 }}>
              {job.localStatus === 'completed'
                ? 'This job has been completed on this device.'
                : 'This job is paused. Resume it to start recording time again.'}
            </p>
          </IonText>
        )}

        {/* Team + live timers */}
        <IonList inset>
          <IonListHeader>
            <IonLabel>Team</IonLabel>
            {isCurrent && (
              <IonButton fill="clear" size="small" onClick={() => navigate(`/jobs/${id}/team`)}>
                <IonIcon slot="start" icon={peopleOutline} />
                Manage
              </IonButton>
            )}
          </IonListHeader>
          {openRows.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No one is clocked on to this job right now.</IonLabel>
            </IonItem>
          )}
          {openRows.map((row) => (
            <IonItem key={row.guid}>
              <IonLabel>
                <h2>{nameOf(row.employeeId)}</h2>
                <p>
                  {STATE_LABEL[(row.activity as JobState) ?? 'Unknown'] ?? row.activity} · from {formatTime(row.startDt)}
                </p>
              </IonLabel>
              <IonNote slot="end" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 16 }}>
                {formatElapsed(secondsSince(row.startDt, now))}
              </IonNote>
            </IonItem>
          ))}
        </IonList>

        {/* Actions */}
        <IonGrid className="ion-padding-horizontal">
          {!isCurrent && job && job.localStatus !== 'completed' && (
            <IonRow>
              <IonCol size="6">
                <IonButton expand="block" fill="outline" onClick={() => navigate(`/jobs/${id}/team?state=TravelTo`)}>
                  <IonIcon slot="start" icon={carOutline} />
                  Travel To
                </IonButton>
              </IonCol>
              <IonCol size="6">
                <IonButton expand="block" color="success" onClick={() => navigate(`/jobs/${id}/team?state=On%20Work`)}>
                  <IonIcon slot="start" icon={playOutline} />
                  Resume Job
                </IonButton>
              </IonCol>
            </IonRow>
          )}

          {isCurrent && (
            <>
              <IonRow>
                {state === 'TravelTo' && (
                  <IonCol size="12">
                    <IonButton expand="block" color="success" onClick={() => void move('Starting work…', () => startWork(id))}>
                      <IonIcon slot="start" icon={constructOutline} />
                      Arrived - Start Work
                    </IonButton>
                  </IonCol>
                )}
                {state === 'On Work' && (
                  <>
                    <IonCol size="6">
                      <IonButton expand="block" fill="outline" onClick={() => void move('Starting travel…', () => travelFrom(id))}>
                        <IonIcon slot="start" icon={carOutline} />
                        Travel From
                      </IonButton>
                    </IonCol>
                    <IonCol size="6">
                      <IonButton expand="block" color="success" onClick={() => setConfirmComplete(true)}>
                        <IonIcon slot="start" icon={checkmarkDoneOutline} />
                        Complete Job
                      </IonButton>
                    </IonCol>
                  </>
                )}
                {state === 'TravelFrom' && (
                  <>
                    <IonCol size="6">
                      <IonButton expand="block" fill="outline" onClick={() => void move('Starting work…', () => startWork(id))}>
                        <IonIcon slot="start" icon={constructOutline} />
                        Back on site
                      </IonButton>
                    </IonCol>
                    <IonCol size="6">
                      <IonButton expand="block" color="success" onClick={() => setConfirmComplete(true)}>
                        <IonIcon slot="start" icon={checkmarkDoneOutline} />
                        Complete Job
                      </IonButton>
                    </IonCol>
                  </>
                )}
              </IonRow>

              {state === 'On Work' && (
                <IonRow>
                  <IonCol size="6">
                    <IonButton expand="block" fill="outline" routerLink={`/jobs/${id}/assets`}>
                      Asset Service
                    </IonButton>
                  </IonCol>
                  <IonCol size="6">
                    {jobDocTemplates.length > 0 ? (
                      jobDocTemplates.map((t) => (
                        <IonButton key={t.key} expand="block" fill="outline" routerLink={`/jobs/${id}/documents/${t.key}`}>
                          <IonIcon slot="start" icon={documentTextOutline} />
                          Create Document
                        </IonButton>
                      ))
                    ) : (
                      <IonButton expand="block" fill="outline" disabled>
                        Create Document
                      </IonButton>
                    )}
                  </IonCol>
                </IonRow>
              )}

              <IonRow>
                <IonCol size="12">
                  <IonButton expand="block" fill="outline" color="medium" onClick={() => void handlePause()}>
                    <IonIcon slot="start" icon={pauseOutline} />
                    Pause Job
                  </IonButton>
                </IonCol>
              </IonRow>
            </>
          )}
        </IonGrid>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-horizontal">{error}</p>
          </IonText>
        )}

        {/* Time log */}
        {closedRows.length > 0 && (
          <IonList inset>
            <IonListHeader>
              <IonLabel>Time recorded</IonLabel>
              <IonNote style={{ paddingRight: 16 }}>
                {formatHours(labourHours)} on site · {formatHours(travelHours)} travel
              </IonNote>
            </IonListHeader>
            {closedRows.map((row) => (
              <IonItem key={row.guid}>
                <IonLabel>
                  <h2>{nameOf(row.employeeId)}</h2>
                  <p>
                    {STATE_LABEL[(row.activity as JobState) ?? 'Unknown'] ?? row.activity} · {formatTime(row.startDt)} –{' '}
                    {formatTime(row.finishDt)}
                  </p>
                </IonLabel>
                <IonNote slot="end">{formatHours(row.timeHours ?? 0)}</IonNote>
                {!row.sent && (
                  <IonBadge slot="end" color="light">
                    unsent
                  </IonBadge>
                )}
              </IonItem>
            ))}
          </IonList>
        )}

        <JobContactSheet isOpen={contactOpen} onDismiss={() => setContactOpen(false)} site={site} customer={customer} />

        <IonAlert
          isOpen={confirmComplete}
          header="Complete this job?"
          message={
            openRows.length > 1
              ? `Time will be closed for all ${openRows.length} team members and the job sent to the office.`
              : 'Time will be closed and the job sent to the office.'
          }
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            { text: 'Complete', role: 'confirm', handler: () => void handleComplete() },
          ]}
          onDidDismiss={() => setConfirmComplete(false)}
        />

        <IonLoading isOpen={busy !== null} message={busy ?? undefined} />
      </IonContent>
    </IonPage>
  )
}
