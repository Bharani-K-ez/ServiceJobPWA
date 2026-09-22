import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonLoading,
  IonNote,
  IonPage,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { getCurrentUsername } from '../api/localAuth'
import {
  ensureSelfOnTeam,
  getEngineerState,
  getTeamCandidates,
  setTeamMember,
  startWork,
  travelTo,
  type TeamCandidate,
} from '../db/jobState'
import { getJobById, tryPushPendingLocalChanges } from '../db/localData'
import UpButton from '../components/UpButton'

type StartState = 'TravelTo' | 'On Work'

/**
 * "Who is on this job?" - the port of the MAUI Team screen. Every engineer
 * from the last sync is listed with a checkbox; the signed-in engineer is
 * ticked by default. Team membership is stored in TblCurrentTeam and is
 * device-wide (it carries over to the next job), and EmployeeTime rows are
 * recorded for exactly the ticked members.
 *
 * Two ways in:
 *  - /jobs/:id/team?state=TravelTo|On Work  (from JobDetailPage): the
 *    footer button confirms the team AND moves the job into that state,
 *    then lands on the WIP screen.
 *  - /jobs/:id/team                          (from WipPage): just edits
 *    the team of the job under way - ticking someone opens their time row
 *    right now, un-ticking closes it - and Done goes back.
 */
export default function TeamPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const id = Number(serRecId)
  const navigate = useNavigate()
  const location = useLocation()

  const startState = useMemo<StartState | null>(() => {
    const raw = new URLSearchParams(location.search).get('state')
    return raw === 'TravelTo' || raw === 'On Work' ? raw : null
  }, [location.search])

  const [candidates, setCandidates] = useState<TeamCandidate[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [jobLabel, setJobLabel] = useState<string>('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCurrentJob, setIsCurrentJob] = useState(false)

  const load = useCallback(async () => {
    await ensureSelfOnTeam()
    const [list, username, job, state] = await Promise.all([
      getTeamCandidates(),
      getCurrentUsername(),
      getJobById(id),
      getEngineerState(),
    ])
    setCandidates(list)
    setMe(username)
    setJobLabel(job?.docketRef ?? `Job #${id}`)
    setIsCurrentJob(state.currentJob === id)
  }, [id])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  const selected = candidates.filter((c) => c.selected)
  const visible = candidates.filter((c) => {
    const q = filter.trim().toLowerCase()
    return !q || c.displayName.toLowerCase().includes(q) || c.employeeID.toLowerCase().includes(q)
  })

  async function toggle(candidate: TeamCandidate, checked: boolean) {
    setError(null)
    // Optimistic tick so the list doesn't lag behind the finger.
    setCandidates((prev) => prev.map((c) => (c.employeeID === candidate.employeeID ? { ...c, selected: checked } : c)))
    try {
      await setTeamMember(candidate.employeeID, checked)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the team.')
      await load()
    }
  }

  async function confirm() {
    if (!startState) {
      navigate(-1)
      return
    }
    if (selected.length === 0) {
      setError('Select at least one team member.')
      return
    }
    setError(null)
    setBusy(startState === 'TravelTo' ? 'Starting travel…' : 'Starting job…')
    try {
      if (startState === 'TravelTo') {
        await travelTo(id)
      } else {
        await startWork(id)
      }
      void tryPushPendingLocalChanges()
      navigate(`/jobs/${id}/wip`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the job.')
    } finally {
      setBusy(null)
    }
  }

  const confirmLabel = startState === 'TravelTo' ? 'Start travelling' : startState === 'On Work' ? 'Start job' : 'Done'

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <UpButton to={startState ? `/jobs/${id}` : `/jobs/${id}/wip`} />
          </IonButtons>
          <IonTitle>Team · {jobLabel}</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            placeholder="Find an engineer"
            value={filter}
            onIonInput={(e) => setFilter(e.detail.value ?? '')}
            debounce={100}
          />
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonNote className="ion-padding-horizontal" style={{ display: 'block', marginTop: 8 }}>
          {selected.length === 0
            ? 'Nobody selected yet.'
            : `${selected.length} on this job: ${selected.map((c) => c.displayName).join(', ')}`}
          {isCurrentJob && ' Changes apply straight away - time is recorded for ticked members only.'}
        </IonNote>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-horizontal">{error}</p>
          </IonText>
        )}

        <IonList>
          {visible.map((c) => {
            const isMe = me != null && c.employeeID.toLowerCase() === me.toLowerCase()
            return (
              <IonItem key={c.employeeID}>
                <IonCheckbox
                  checked={c.selected}
                  onIonChange={(e) => void toggle(c, e.detail.checked)}
                  labelPlacement="end"
                  justify="start"
                >
                  <IonLabel>
                    <h2>
                      {c.displayName}
                      {isMe && (
                        <IonNote color="primary" style={{ marginLeft: 8, fontSize: 12 }}>
                          you
                        </IonNote>
                      )}
                    </h2>
                    {c.displayName !== c.employeeID && <p>{c.employeeID}</p>}
                  </IonLabel>
                </IonCheckbox>
              </IonItem>
            )
          })}
          {candidates.length === 0 && (
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap" color="medium">
                No engineers on this device yet - run a Sync from Utilities to download the team list.
              </IonLabel>
            </IonItem>
          )}
        </IonList>

        <IonLoading isOpen={busy !== null} message={busy ?? undefined} />
      </IonContent>

      <IonFooter>
        <IonToolbar>
          <div className="ion-padding-horizontal">
            <IonButton
              expand="block"
              color={startState === 'TravelTo' ? 'primary' : startState ? 'success' : 'medium'}
              disabled={startState !== null && selected.length === 0}
              onClick={() => void confirm()}
            >
              {confirmLabel}
              {startState && selected.length > 0 ? ` (${selected.length})` : ''}
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  )
}
