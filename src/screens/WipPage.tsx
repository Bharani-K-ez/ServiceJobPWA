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
  type LocalCustomer,
  type LocalJob,
  type LocalSite,
} from '../db/localData'
import { completeJobOnServer } from '../api/syncV2'

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
    setBusy(true)
    try {
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
            </IonRow>
          </IonGrid>
        </IonList>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        <IonLoading isOpen={busy} message="Completing job…" />
      </IonContent>
    </IonPage>
  )
}
