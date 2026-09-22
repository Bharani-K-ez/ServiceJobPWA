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
import type { SyncDownMode } from '../db/localData'
import { describePushed, getLastSyncAt, pushPendingLocalChanges, syncDownAndStore } from '../db/localData'
import { exportAndShareDiagnostics } from '../db/diagnostics'
import { useAuth } from '../auth/AuthContext'

export default function UtilitiesPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getLastSyncAt().then(setLastSyncAt)
  }, [])

  /**
   * 'partial' (the everyday Sync item) pulls only what changed since the
   * last sync; 'full' (the "Replace local data" item) wipes the synced
   * tables and re-downloads everything - the recovery path if local data
   * ever looks wrong. Both push pending local changes up first.
   */
  async function handleSync(mode: SyncDownMode) {
    setError(null)
    setMessage(null)
    setBusyMessage(mode === 'full' ? 'Downloading all your data…' : 'Syncing your jobs…')
    try {
      // Push any locally-saved data up FIRST - Asset Service visits, job
      // status changes, employee time and any offline completions - before
      // pulling fresh data down: a pull-down that landed before the push
      // could otherwise refresh rows out from under a pending edit. See
      // pushPendingLocalChanges (shared with WipPage) for the actual push.
      // If it fails outright, or the server reports something it couldn't
      // accept, stop here: the local data is untouched and safe, and this
      // Sync can just be tried again once the issue is fixed.
      const pushResult = await pushPendingLocalChanges()
      if (!pushResult.ok) {
        setError(pushResult.message)
        return
      }

      const result = await syncDownAndStore(mode)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setLastSyncAt(await getLastSyncAt())
      const sent = describePushed(pushResult.pushed)
      setMessage(`${result.fullSync ? 'Full sync complete.' : 'Sync complete.'} ${sent ?? 'Nothing new to send'}.`)
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
    // A real browser navigation, not React Router's navigate() - see the
    // matching comment in LoginPage.tsx's post-login navigation for why:
    // IonRouterOutlet doesn't reliably swap which already-mounted page is
    // visible for an imperative replace navigation, and a fresh load
    // sidesteps that entirely (and conveniently also guarantees no stale
    // React state from the signed-out account lingers into the next login).
    window.location.href = '/login'
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
          <IonItem button onClick={() => handleSync('partial')}>
            <IonLabel>
              <h2>Sync data to server</h2>
              <p>
                Sends your saved work up, then pulls down only what changed since your last
                sync. The app only syncs automatically on your very first sign-in on this
                device - use this any time afterward to get fresh data.
              </p>
            </IonLabel>
            {lastSyncAt && (
              <IonNote slot="end">{new Date(lastSyncAt).toLocaleString()}</IonNote>
            )}
          </IonItem>

          <IonItem button onClick={() => handleSync('full')}>
            <IonLabel>
              <h2>Replace local data</h2>
              <p>
                Sends your saved work up, then re-downloads everything from the server. Use
                this if the job list ever looks out of date or incomplete.
              </p>
            </IonLabel>
          </IonItem>

          <IonItem button onClick={handleDiagnostics}>
            <IonLabel>
              <h2>Send diagnostics</h2>
              <p>Exports the local app database for troubleshooting.</p>
            </IonLabel>
          </IonItem>

          {import.meta.env.DEV && (
            <IonItem button onClick={() => navigate('/dev/db')}>
              <IonLabel color="warning">
                <h2>Local database (dev only)</h2>
                <p>Browse and query the app&apos;s SQLite tables; download the .db file.</p>
              </IonLabel>
            </IonItem>
          )}

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
