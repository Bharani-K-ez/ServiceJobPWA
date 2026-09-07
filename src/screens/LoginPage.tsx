import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonLoading,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { login } from '../api/auth'
import { getTenantCode, clearTenantCode } from '../api/tenant'
import { syncDown } from '../api/syncV2'
import { upsertSyncData } from '../db/localData'
import { useAuth } from '../auth/AuthContext'

/**
 * First-time login asks for company code + username + password. Once a
 * company code is stored (api/tenant.ts, via @capacitor/preferences), it is
 * reused silently and this screen only asks for username/password - "Not
 * your company?" clears it and asks again.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [storedCompanyCode, setStoredCompanyCode] = useState<string | null>(null)
  const [companyCodeReady, setCompanyCodeReady] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getTenantCode().then((code) => {
      if (!alive) return
      setStoredCompanyCode(code)
      setCompanyCodeReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  async function handleSwitchCompany() {
    await clearTenantCode()
    setStoredCompanyCode(null)
    setCompanyCode('')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const effectiveCompanyCode = storedCompanyCode ?? companyCode.trim()
    if (!effectiveCompanyCode || !username.trim() || !password) {
      setError('Please fill in every field.')
      return
    }

    setBusyMessage('Signing in…')
    try {
      const result = await login({
        username: username.trim(),
        password,
        companyCode: effectiveCompanyCode,
      })

      if (!result.success) {
        setError(result.message)
        return
      }

      await refresh()

      setBusyMessage('Syncing your jobs…')
      try {
        const syncResult = await syncDown()
        if (syncResult.hasData && syncResult.data) {
          await upsertSyncData(syncResult.data)
        }
      } catch {
        // Login already succeeded - let them into the app and sync later
        // from Utilities rather than blocking them here.
      }

      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    } finally {
      setBusyMessage(null)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>ServiceJobs</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {companyCodeReady && (
          <form onSubmit={handleSubmit}>
            <IonList inset>
              {!storedCompanyCode && (
                <IonItem>
                  <IonInput
                    label="Company code"
                    labelPlacement="stacked"
                    placeholder="e.g. ezTest"
                    value={companyCode}
                    onIonInput={(e) => setCompanyCode(e.detail.value ?? '')}
                    required
                  />
                </IonItem>
              )}
              <IonItem>
                <IonInput
                  label="Username"
                  labelPlacement="stacked"
                  value={username}
                  onIonInput={(e) => setUsername(e.detail.value ?? '')}
                  autocapitalize="off"
                  required
                />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Password"
                  labelPlacement="stacked"
                  type="password"
                  value={password}
                  onIonInput={(e) => setPassword(e.detail.value ?? '')}
                  required
                />
              </IonItem>
            </IonList>

            {storedCompanyCode && (
              <IonText color="medium">
                <p className="ion-padding-start">
                  Company: <strong>{storedCompanyCode}</strong> ·{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); void handleSwitchCompany() }}>
                    Not your company?
                  </a>
                </p>
              </IonText>
            )}

            {error && (
              <IonText color="danger">
                <p className="ion-padding-start">{error}</p>
              </IonText>
            )}

            <div className="ion-padding">
              <IonButton expand="block" type="submit" disabled={busyMessage !== null}>
                Sign in
              </IonButton>
            </div>
          </form>
        )}
        <IonLoading isOpen={busyMessage !== null} message={busyMessage ?? undefined} />
      </IonContent>
    </IonPage>
  )
}
