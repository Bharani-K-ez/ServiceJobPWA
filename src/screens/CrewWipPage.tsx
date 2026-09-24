import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  IonAlert,
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
import { callOutline, logInOutline, logOutOutline, pauseOutline, playOutline } from 'ionicons/icons'
import { useJobDetails, useTicker } from '../hooks/useJobDetails'
import {
  crewClockBlocker,
  crewClockIn,
  crewClockOut,
  crewPause,
  getCrewClock,
  getJobCrew,
  getJobSlots,
  type CrewClock,
  type JobSlot,
} from '../db/crew'
import { getEmployeeTimesForJob, type LocalEmployeeTime } from '../db/jobState'
import { tryPushPendingLocalChanges } from '../db/localData'
import { getCurrentUsername } from '../api/localAuth'
import { formatElapsed, formatHours, formatTime, secondsSince } from '../utils/format'
import { formatSlots } from '../utils/slots'
import JobContactSheet from './JobContactSheet'
import UpButton from '../components/UpButton'

/**
 * WIP screen for a job the engineer is on as a CREW MEMBER - a time sheet,
 * nothing more: Clock In, Pause, Clock Out (db/crew.ts). It never changes
 * the job's status or any other job record; the lead engineer's device
 * does that from the main WipPage. The job stays on this device until the
 * lead completes it (it then leaves the sync scope and disappears from the
 * list; a running clock is closed automatically on that sync).
 */
export default function CrewWipPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const id = Number(serRecId)
  const navigate = useNavigate()
  const location = useLocation()
  const { job, site, customer, reload } = useJobDetails(id)

  const [clock, setClock] = useState<CrewClock | null>(null)
  const [slots, setSlots] = useState<JobSlot[]>([])
  const [crew, setCrew] = useState<{ displayName: string; isLead: boolean; engName: string }[]>([])
  const [times, setTimes] = useState<LocalEmployeeTime[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadState = useCallback(async () => {
    const [c, s, members, rows, username, block] = await Promise.all([
      getCrewClock(),
      getJobSlots(id),
      getJobCrew(id),
      getEmployeeTimesForJob(id),
      getCurrentUsername(),
      crewClockBlocker(id),
    ])
    setClock(c && c.serRecId === id ? c : null)
    setSlots(s)
    setCrew(members)
    setTimes(rows)
    setMe(username)
    setBlocker(block)
  }, [id])

  useEffect(() => {
    if (location.pathname === `/jobs/${id}/crew`) {
      void reload()
      void loadState()
    }
  }, [location, id, reload, loadState])

  const running = clock?.status === 'in'
  const now = useTicker(1000, running)

  const myRows = times.filter((t) => me && t.employeeId.toLowerCase() === me.toLowerCase())
  const myClosed = myRows.filter((t) => t.finishDt != null).slice().reverse()
  const myHours = myClosed.reduce((sum, r) => sum + (r.timeHours ?? 0), 0)

  async function run(label: string, action: () => Promise<void>, after?: () => void) {
    setError(null)
    setBusy(label)
    try {
      await action()
      void tryPushPendingLocalChanges()
      await loadState()
      after?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your time.')
    } finally {
      setBusy(null)
    }
  }

  const address = [site?.occupant, site?.address, site?.town].filter(Boolean).join(', ')
  const lead = crew.find((m) => m.isLead)

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <UpButton to="/jobs" />
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
        <IonCard color={running ? 'success' : clock ? 'warning' : 'tertiary'}>
          <IonCardContent>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Crew job · {running ? 'Clocked in' : clock ? 'Paused' : 'Not clocked in'}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  {customer?.organizationName ?? site?.occupant ?? ''}
                </div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{address}</div>
                {lead && <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>Lead: {lead.displayName}</div>}
              </div>
              {running && clock?.since && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatElapsed(secondsSince(clock.since, now))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>since {formatTime(clock.since)}</div>
                </div>
              )}
            </div>
          </IonCardContent>
        </IonCard>

        {job?.probDesc && (
          <IonText>
            <p className="ion-padding-horizontal" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>
              {job.probDesc}
            </p>
          </IonText>
        )}

        {/* Actions */}
        <IonGrid className="ion-padding-horizontal">
          {!running ? (
            <IonRow>
              <IonCol size={clock ? '8' : '12'}>
                <IonButton
                  expand="block"
                  color="success"
                  disabled={!!blocker}
                  onClick={() => void run(clock ? 'Resuming…' : 'Clocking in…', () => crewClockIn(id))}
                >
                  <IonIcon slot="start" icon={clock ? playOutline : logInOutline} />
                  {clock ? 'Resume' : 'Clock In'}
                </IonButton>
              </IonCol>
              {clock && (
                <IonCol size="4">
                  <IonButton expand="block" fill="outline" color="medium" onClick={() => setConfirmOut(true)}>
                    <IonIcon slot="start" icon={logOutOutline} />
                    Clock Out
                  </IonButton>
                </IonCol>
              )}
            </IonRow>
          ) : (
            <IonRow>
              <IonCol size="6">
                <IonButton expand="block" fill="outline" color="medium" onClick={() => void run('Pausing…', () => crewPause())}>
                  <IonIcon slot="start" icon={pauseOutline} />
                  Pause
                </IonButton>
              </IonCol>
              <IonCol size="6">
                <IonButton expand="block" color="danger" onClick={() => setConfirmOut(true)}>
                  <IonIcon slot="start" icon={logOutOutline} />
                  Clock Out
                </IonButton>
              </IonCol>
            </IonRow>
          )}
        </IonGrid>

        {blocker && !running && (
          <IonText color="warning">
            <p className="ion-padding-horizontal" style={{ fontSize: 14 }}>{blocker}</p>
          </IonText>
        )}
        {error && (
          <IonText color="danger">
            <p className="ion-padding-horizontal">{error}</p>
          </IonText>
        )}

        <IonList inset>
          <IonListHeader>
            <IonLabel>Your slots</IonLabel>
          </IonListHeader>
          {slots.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No scheduled slots for you on this job.</IonLabel>
            </IonItem>
          )}
          {slots.map((s) => (
            <IonItem key={s.id}>
              <IonLabel>{formatSlots([s])}</IonLabel>
            </IonItem>
          ))}
        </IonList>

        {crew.length > 0 && (
          <IonList inset>
            <IonListHeader>
              <IonLabel>Crew</IonLabel>
            </IonListHeader>
            {crew.map((m) => (
              <IonItem key={m.engName}>
                <IonLabel>{m.displayName}</IonLabel>
                {m.isLead && (
                  <IonBadge slot="end" color="success">
                    Lead
                  </IonBadge>
                )}
                {me && m.engName.toLowerCase() === me.toLowerCase() && (
                  <IonNote slot="end" color="primary">
                    you
                  </IonNote>
                )}
              </IonItem>
            ))}
          </IonList>
        )}

        <IonList inset>
          <IonListHeader>
            <IonLabel>Your time on this job</IonLabel>
            <IonNote style={{ paddingRight: 16 }}>{formatHours(myHours)}</IonNote>
          </IonListHeader>
          {myClosed.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">Nothing recorded yet.</IonLabel>
            </IonItem>
          )}
          {myClosed.map((row) => (
            <IonItem key={row.guid}>
              <IonLabel>
                <h2>{formatTime(row.startDt)} – {formatTime(row.finishDt)}</h2>
                <p>{new Date(row.startDt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}</p>
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

        <IonText color="medium">
          <p className="ion-padding-horizontal" style={{ fontSize: 13 }}>
            This job is completed by the lead engineer. It stays in your list, for time recording only, until then.
          </p>
        </IonText>

        <JobContactSheet isOpen={contactOpen} onDismiss={() => setContactOpen(false)} site={site} customer={customer} />

        <IonAlert
          isOpen={confirmOut}
          header="Clock out?"
          message="Your time on this job will be closed and sent to the office. You can clock in again later."
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Clock Out',
              role: 'confirm',
              handler: () => void run('Clocking out…', () => crewClockOut(), () => navigate('/jobs', { replace: true })),
            },
          ]}
          onDidDismiss={() => setConfirmOut(false)}
        />

        <IonLoading isOpen={busy !== null} message={busy ?? undefined} />
      </IonContent>
    </IonPage>
  )
}
