import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications'

/**
 * Push notifications, wired into the SAME server-side setup the MAUI app
 * uses (nothing changes on the API):
 *
 *  - the device gets an FCM token (Firebase project "ezservicemobileapp",
 *    the one in the MAUI app's google-services.json / GoogleService-Info.plist);
 *  - the token is stored under the MAUI app's Preferences key "DeviceToken"
 *    and sent as `deviceToken` in POST /api/Account/Login (LoginRequest.
 *    DeviceToken), which the account service saves on EngineerPDA.DeviceToken;
 *  - when the office dispatches a job the server queues a
 *    PushNotificationsMobile row (legacy SavePushData / SyncV2's
 *    QueuePushNotificationAsync) and PushNotificationService sends it via
 *    FCM with the title in the MAUI format "Alert|SerRecID".
 *
 * This module owns the plugin: registration, token storage, and turning the
 * two plugin events into app-level callbacks that PushNotificationsHost
 * (a React component with router access) subscribes to. Web/PWA is a no-op.
 */

const DEVICE_TOKEN_KEY = 'DeviceToken'
const CHANNEL_ID = 'fcm_default_channel'

export interface IncomingPush {
  title: string | null
  body: string | null
  /** Job the notification is about, parsed from the MAUI-style "Alert|SerRecID" title or the data payload. */
  serRecId: number | null
  data: Record<string, string>
}

type ReceivedHandler = (push: IncomingPush) => void
type TappedHandler = (push: IncomingPush) => void

let receivedHandler: ReceivedHandler | null = null
let tappedHandler: TappedHandler | null = null
let initialised = false
/** A tap that arrived before the host subscribed (cold start from a notification). */
let pendingTap: IncomingPush | null = null

export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')
}

/** The FCM token last handed to us by the plugin (same key the MAUI app used). */
export async function getStoredDeviceToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: DEVICE_TOKEN_KEY })
  return value || null
}

function parsePush(n: PushNotificationSchema): IncomingPush {
  const data = (n.data ?? {}) as Record<string, string>
  const title = n.title ?? null
  // MAUI: title is "Alert|SerRecID" - see MyFirebaseMessagingService.SendNotification.
  let serRecId: number | null = null
  const fromTitle = title?.split('|')[1]
  const fromData = data.SerRecID ?? data.serRecId ?? data.serRecID
  const candidate = Number(fromData ?? fromTitle)
  if (Number.isFinite(candidate) && candidate > 0) serRecId = candidate
  return { title, body: n.body ?? null, serRecId, data }
}

/**
 * Asks for permission, registers with FCM/APNs and wires the plugin events.
 * Safe to call more than once; resolves to the token when one is already
 * known, otherwise null (the token arrives via the 'registration' event and
 * is stored for the next login).
 */
export async function initPushNotifications(): Promise<string | null> {
  if (!isPushSupported()) return null
  if (initialised) return getStoredDeviceToken()
  initialised = true

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions()
  }
  if (permission.receive !== 'granted') {
    return null
  }

  if (Capacitor.getPlatform() === 'android') {
    // Same channel name/importance as the MAUI app's MainActivity creates
    // ("FCM Notifications"), so the sound/heads-up behaviour matches.
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'FCM Notifications',
      description: 'Job notifications from the office',
      importance: 4,
      visibility: 1,
      vibration: true,
    })
  }

  await PushNotifications.addListener('registration', async (token: Token) => {
    await Preferences.set({ key: DEVICE_TOKEN_KEY, value: token.value })
  })

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration failed', err)
  })

  await PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) => {
    receivedHandler?.(parsePush(n))
  })

  await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const push = parsePush(action.notification)
    if (tappedHandler) tappedHandler(push)
    else pendingTap = push
  })

  await PushNotifications.register()
  return getStoredDeviceToken()
}

/** PushNotificationsHost subscribes here; returns an unsubscribe. */
export function onPush(handlers: { received: ReceivedHandler; tapped: TappedHandler }): () => void {
  receivedHandler = handlers.received
  tappedHandler = handlers.tapped
  if (pendingTap) {
    const p = pendingTap
    pendingTap = null
    handlers.tapped(p)
  }
  return () => {
    receivedHandler = null
    tappedHandler = null
  }
}

/** Clears delivered notifications from the tray (e.g. after a sync brought the jobs in). */
export async function clearDeliveredNotifications(): Promise<void> {
  if (!isPushSupported()) return
  try {
    await PushNotifications.removeAllDeliveredNotifications()
  } catch {
    // not fatal
  }
}
