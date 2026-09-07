import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonLoading,
  IonNote,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { syncDown } from '../api/syncV2'
import { getLastSyncAt, upsertSyncData } from '../db/localData'
import { exportAndShareDiagnostics } from '../db/diagnostics'
import { useAuth } from '../auth/AuthContext'

export default function UtilitiesPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getLastSyncAt().then(setLastSyncAt)
  }, [])

  async function handleSync() {
    setError(null)
    setMessage(null)
    setBusyMessage('Syncing your jobs…')
    try {
      const result = await syncDown()
      if (!result.hasData || !result.data) {
        setError(result.failMessage ?? 'Sync failed.')
        return
      }
      await upsertSyncData(result.data)
      setLastSyncAt(await getLastSyncAt())
      setMessage('Sync complete.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.')
    } finally {
      setBusyMessage(null)
    }
  }

  async function handleDiagnostics() {
    setError(null)
    setMessage(null)
    setBusyMessage('Preparing diagnostics…')
    try {
      await exportAndShareDiagnostics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export diagnostics.')
    } finally {
      setBusyMessage(null)
    }
  }

  async function handleLogOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/jobs" />
          </IonButtons>
          <IonTitle>Utilities</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset>
          <IonItem button onClick={handleSync}>
            <IonLabel>
              <h2>Sync data to server</h2>
              <p>Pulls your latest assigned jobs, sites, customers and assets.</p>
            </IonLabel>
            {lastSyncAt && (
              <IonNote slot="end">{new Date(lastSyncAt).toLocaleString()}</IonNote>
            )}
          </IonItem>

          <IonItem button onClick={handleDiagnostics}>
            <IonLabel>
              <h2>Send diagnostics</h2>
              <p>Exports the local app database for troubleshooting.</p>
            </IonLabel>
          </IonItem>

          <IonItem button onClick={handleLogOut} detail={false}>
            <IonLabel color="danger">
              <h2>Log out</h2>
            </IonLabel>
          </IonItem>
        </IonList>

        {message && (
          <IonText color="success">
            <p className="ion-padding-start">{message}</p>
          </IonText>
        )}
        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        <IonLoading isOpen={busyMessage !== null} message={busyMessage ?? undefined} />
      </IonContent>
    </IonPage>
  )
}
