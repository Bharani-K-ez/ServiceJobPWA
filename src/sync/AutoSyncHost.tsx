import { useEffect, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { useIonToast } from '@ionic/react'
import { useAuth } from '../auth/AuthContext'
import { maybeAutoSync } from './autoSync'
import { applyRunnerResults, ensureBackgroundPermissions, saveRunnerState } from './backgroundSync'

/**
 * Drives automatic syncing while the app is alive. Mounted once in App.tsx.
 *
 *  - start-up (signed in)      -> sync if due
 *  - every minute while open   -> sync if due (covers a long shift on the WIP screen)
 *  - back online               -> sync if due
 *  - app resumed / tab visible -> collect the background heartbeat's results
 *                                 (confirmations, last status), then sync if
 *                                 due - or straight away if the heartbeat
 *                                 saw new/changed jobs on the server
 *  - app paused / tab hidden   -> hand the background heartbeat a fresh
 *                                 outbox + schedule (sync/backgroundSync.ts)
 *
 * "Due" and "working hours" come from sync/syncSettings.ts.
 */
export default function AutoSyncHost() {
  const { status } = useAuth()
  const [presentToast] = useIonToast()
  const started = useRef(false)

  useEffect(() => {
    if (status !== 'authed') return

    async function onResume() {
      const { result, changesSeen } = await applyRunnerResults()
      if (result && !result.ok && !result.skipped) {
        void presentToast({ message: `Background sync: ${result.message}`, duration: 4000, color: 'warning' })
      }
      await maybeAutoSync('resume', changesSeen)
    }

    async function onPause() {
      await saveRunnerState()
    }

    if (!started.current) {
      started.current = true
      void ensureBackgroundPermissions()
      void onResume().then(() => maybeAutoSync('startup'))
    }

    const timer = window.setInterval(() => void maybeAutoSync('timer'), 60_000)

    const onOnline = () => void maybeAutoSync('online')
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void onResume()
      else void onPause()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    const resumeListener = CapApp.addListener('resume', () => void onResume())
    const pauseListener = CapApp.addListener('pause', () => void onPause())

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      void resumeListener.then((l) => l.remove())
      void pauseListener.then((l) => l.remove())
    }
  }, [status, presentToast])

  return null
}
