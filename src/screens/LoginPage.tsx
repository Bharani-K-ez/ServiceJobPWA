import { useEffect, useState } from 'react'
import {
  IonButton,
  IonCheckbox,
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
import { getRememberedLogin, saveRememberedLogin, clearRememberedLogin } from '../api/localAuth'
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
  const { refresh } = useAuth()

  const [storedCompanyCode, setStoredCompanyCode] = useState<string | null>(null)
  const [companyCodeReady, setCompanyCodeReady] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberPassword, setRememberPassword] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([getTenantCode(), getRememberedLogin()]).then(([code, remembered]) => {
      if (!alive) return
      setStoredCompanyCode(code)
      setCompanyCodeReady(true)
      // Pre-fill from a previous "Save password" login, if any - the
      // toggle defaults on in that case since a saved login implies the
      // user opted in last time.
      if (remembered) {
        setCompanyCode(remembered.companyCode)
        setUsername(remembered.username)
        setPassword(remembered.password)
        setRememberPassword(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  async function handleSwitchCompany() {
    await clearTenantCode()
    // A remembered login is tied to the company it was saved under - clear
    // it along with the tenant code so a stale login doesn't get offered
    // for the wrong company.
    await clearRememberedLogin()
    setStoredCompanyCode(null)
    setCompanyCode('')
    setUsername('')
    setPassword('')
    setRememberPassword(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    // This is the ONLY validation for empty fields - the inputs above
    // deliberately do NOT use the `required` attribute. ion-input
    // participates in native HTML5 form validation, which silently blocks
    // the whole onSubmit (this handler never even runs) when a required
    // field is empty - no error message, nothing visibly happens. That was
    // biting people on a second login: after "Log out" the company code
    // field reappears blank (logout clears it - see api/auth.ts), and if
    // it's left empty while username/password get retyped from habit, the
    // screen looked "stuck" with no explanation. Validating here instead
    // means Sign In always runs this check and always shows a real error.
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

      if (rememberPassword) {
        await saveRememberedLogin({
          companyCode: effectiveCompanyCode,
          username: username.trim(),
          password,
        })
      } else {
        await clearRememberedLogin()
      }

      await refresh()

      if (result.isFirstLoginForAccount) {
        // This is the very first time this account has signed in on this
        // device - do the one-time sync now. After this, the app runs
        // off local SQLite data only; a manual "Sync data to server" in
        // Utilities is the only way to resync going forward.
        setBusyMessage('Syncing your jobs…')
        try {
          const syncResult = await syncDown()
          if (syncResult.hasData && syncResult.data) {
            await upsertSyncData(syncResult.data)
          }
        } catch {
          // Login already succeeded - let them into the app and sync
          // later from Utilities rather than blocking them here.
        }
      }

      // A plain React Router navigate() here left the app stuck showing this
      // login form even though the URL bar correctly changed to "/jobs" -
      // confirmed by reproducing it live: IonRouterOutlet keeps every
      // previously-visited page's DOM node mounted (for its swipe-back
      // gesture) and swaps which one is actually visible via its own
      // transition system, and that system does not reliably run for an
      // imperative replace navigation onto an already-existing page (the
      // same underlying quirk already worked around in JobListPage and
      // WipPage elsewhere in this app). A real browser navigation sidesteps
      // it entirely - it reloads the app fresh, so there is no stale old
      // page left mounted to (not) get hidden. The auth token was already
      // written to Preferences by login() above, so the fresh load lands
      // authed and RequireAuth sends it straight to the jobs list.
      window.location.href = '/jobs'
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
                />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Password"
                  labelPlacement="stacked"
                  type="password"
                  value={password}
                  onIonInput={(e) => setPassword(e.detail.value ?? '')}
                />
              </IonItem>
              <IonItem lines="none">
                <IonCheckbox
                  checked={rememberPassword}
                  onIonChange={(e) => setRememberPassword(e.detail.checked)}
                >
                  Save password
                </IonCheckbox>
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
