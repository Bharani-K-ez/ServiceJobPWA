import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIonToast } from '@ionic/react'
import { useAuth } from '../auth/AuthContext'
import { maybeAutoSync } from '../sync/autoSync'
import { initPushNotifications, onPush } from './pushNotifications'

/**
 * Connects push notifications to the running app. Mounted once in App.tsx
 * inside the router (it needs navigate). Once the engineer is signed in it
 * registers for pushes (permission prompt on first run), then:
 *
 *  - a push arriving while the app is OPEN -> a toast with the office's
 *    message and a partial sync straight away, so the new/changed job is in
 *    the list within seconds (the OS shows nothing itself in the foreground);
 *  - a tap on a notification (app in background or closed) -> a partial
 *    sync, then straight to that job's details when the title/data carried
 *    a SerRecID (MAUI's "Alert|SerRecID" format), else the job list.
 */
export default function PushNotificationsHost() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (status !== 'authed') return
    void initPushNotifications()

    return onPush({
      received: (push) => {
        void presentToast({
          header: push.title?.split('|')[0] ?? 'Notification',
          message: push.body ?? '',
          duration: 5000,
          position: 'top',
          buttons: push.serRecId
            ? [{ text: 'Open', handler: () => navigate(`/jobs/${push.serRecId}`) }]
            : undefined,
        })
        void maybeAutoSync('push', true)
      },
      tapped: (push) => {
        void maybeAutoSync('push', true).finally(() => {
          navigate(push.serRecId ? `/jobs/${push.serRecId}` : '/jobs')
        })
      },
    })
  }, [status, navigate, presentToast])

  return null
}
