import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonList,
  IonLoading,
  IonPage,
  IonRow,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import {
  getCustomerById,
  getJobById,
  getSiteById,
  markJobCompletedLocally,
  pauseJobLocally,
  pushPendingAssetServiceVisits,
  type LocalCustomer,
  type LocalJob,
  type LocalSite,
} from '../db/localData'
import { completeJobOnServer, pauseJobOnServer } from '../api/syncV2'

/**
 * Work In Progress shell. Only "Asset Service" and "Complete Job" are wired
 * up per the current spec - Create Document and Add Parts are shown as
 * disabled placeholders ("added one by one in future").
 */
export default function WipPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const navigate = useNavigate()
  const id = Number(serRecId)

  const [job, setJob] = useState<LocalJob | null>(null)
  const [site, setSite] = useState<LocalSite | null>(null)
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState('Completing job…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const j = await getJobById(id)
      setJob(j)
      if (j?.siteId != null) {
        const s = await getSiteById(j.siteId)
        setSite(s)
        if (s?.custId != null) {
          setCustomer(await getCustomerById(s.custId))
        }
      }
    })()
  }, [id])

  async function handleCompleteJob() {
    setError(null)
    setBusyMessage('Completing job…')
    setBusy(true)
    try {
      // Push this visit's saved Asset Service data up FIRST - the server
      // builds the completion Asset Service report PDF/email from whatever
      // data it already has for this job at the moment CompleteJob is
      // called, so completing the job without pushing first would email a
      // report missing (or stale for) whatever was just captured here.
      // Shares its push logic with UtilitiesPage.handleSync - see
      // pushPendingAssetServiceVisits. If the push fails, the job is left
      // NOT completed (same as any other failure below) so this can just be
      // retried.
      const pushResult = await pushPendingAssetServiceVisits()
      if (!pushResult.ok) {
        setError(pushResult.message)
        return
      }

      const result = await completeJobOnServer(id)
      if (!result.hasData) {
        setError(result.failMessage ?? 'Could not mark the job as completed. Please try again.')
        return
      }
      await markJobCompletedLocally(id)
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server. Try again once you have a connection.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Pauses the job server-side (DispatchStatus "40"/WIPPaused) and locally
   * (local_status = 'paused'), then returns to the job list. Unlike
   * completing, pausing does not push pending Asset Service data first - a
   * paused job is still resumable and its data is still local, not final.
   */
  async function handlePauseJob() {
    setError(null)
    setBusyMessage('Pausing job…')
    setBusy(true)
    try {
      const result = await pauseJobOnServer(id)
      if (!result.hasData) {
        setError(result.failMessage ?? 'Could not pause the job. Please try again.')
        return
      }
      await pauseJobLocally(id)
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server. Try again once you have a connection.')
    } finally {
      setBusy(false)
    }
  }

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
      <IonContent className="ion-padding">
        <IonCard>
          <IonCardContent>
            <p><strong>{customer?.organizationName}</strong></p>
            <p>{[site?.occupant, site?.address, site?.town, site?.county].filter(Boolean).join(', ')}</p>
            <p>{job?.probDesc}</p>
          </IonCardContent>
        </IonCard>

        <IonList inset>
          <IonGrid>
            <IonRow>
              <IonCol size="6">
                <IonButton expand="block" fill="outline" routerLink={`/jobs/${id}/assets`}>
                  Asset Service
                </IonButton>
              </IonCol>
              <IonCol size="6">
                <IonButton expand="block" fill="outline" disabled>
                  Create Document
                </IonButton>
              </IonCol>
              <IonCol size="6">
                <IonButton expand="block" fill="outline" disabled>
                  Add Parts
                </IonButton>
              </IonCol>
              <IonCol size="6">
                <IonButton expand="block" color="success" onClick={handleCompleteJob}>
                  Complete Job
                </IonButton>
              </IonCol>
              <IonCol size="12">
                <IonButton expand="block" fill="outline" color="medium" onClick={handlePauseJob}>
                  Pause Job
                </IonButton>
              </IonCol>
            </IonRow>
          </IonGrid>
        </IonList>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        <IonLoading isOpen={busy} message={busyMessage} />
      </IonContent>
    </IonPage>
  )
}
