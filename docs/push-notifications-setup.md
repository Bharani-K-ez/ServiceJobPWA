# Push notifications – setup

The React app reuses the MAUI app's push pipeline end to end. Nothing changes on the API:

| Step | MAUI app | React app |
|---|---|---|
| Get an FCM token | `Plugin.FirebasePushNotifications` | `@capacitor/push-notifications` (`src/push/pushNotifications.ts`) |
| Store it | `Preferences["DeviceToken"]` | `Preferences["DeviceToken"]` (same key) |
| Send it to the server | `LoginRequest.DeviceToken` → `POST /api/Account/Login` | same (`src/api/auth.ts`) |
| Server stores it | `EngineerPDA.DeviceToken` | same |
| Server sends | `PushNotificationsMobile` row → `PushNotificationService` → FCM, title `"Alert|SerRecID"` | same |
| Device shows / handles | `MyFirebaseMessagingService` | OS shows it; `PushNotificationsHost.tsx` handles foreground + tap |

Firebase project: **ezservicemobileapp** (the one in `Main/Platforms/Android/google-services.json`).

## 1. Install

```
npm install
npx cap sync
```

## 2. Android

1. The Capacitor app id is `com.ezmanagement.servicejobs`. The Firebase project currently has
   `com.ezmanagement.servicejobshub` (the MAUI app), `com.ezmanagement.servicejob`, `com.ezmanagementltd.servicejobs`,
   `ezService.ezService` – **not** `com.ezmanagement.servicejobs`. In the Firebase console, project
   *ezservicemobileapp* → Project settings → *Add app* → Android → package `com.ezmanagement.servicejobs`,
   then download the new `google-services.json`. (Registering a second app does not affect the MAUI app or
   the server's sender credentials – they are per project.)
2. Put it at `android/app/google-services.json`. `android/app/build.gradle` already applies the
   `com.google.gms.google-services` plugin when that file exists, and `android/build.gradle` already has the
   classpath.
3. Do **not** copy the MAUI file as-is – the Gradle plugin fails with "No matching client found for package
   name 'com.ezmanagement.servicejobs'".
4. `AndroidManifest.xml` now declares `POST_NOTIFICATIONS` and the default channel meta-data; the app creates the
   channel (`fcm_default_channel`, "FCM Notifications") at start-up and prompts for permission on Android 13+.

## 3. iOS

Capacitor's plugin returns the raw **APNs** token by default, but the server sends through **FCM**, so the token
must be exchanged for an FCM token via the Firebase iOS SDK – the same thing `Plugin.FirebasePushNotifications`
does for the MAUI app.

1. Firebase console → *Add app* → iOS → bundle id `com.ezmanagement.servicejobs`; download `GoogleService-Info.plist`
   and add it to the Xcode project (`ios/App/App/`, ensure it is in the *App* target). The APNs key already uploaded
   for the MAUI app is project-wide, so nothing to upload.
2. `ios/App/Podfile` – add inside `target 'App'`:
   ```ruby
   pod 'FirebaseMessaging'
   ```
   then `cd ios/App && pod install`.
3. Xcode → target *App* → *Signing & Capabilities* → add **Push Notifications** and **Background Modes → Remote
   notifications**.
4. `ios/App/App/AppDelegate.swift`:
   ```swift
   import FirebaseCore
   import FirebaseMessaging

   // in application(_:didFinishLaunchingWithOptions:)
   FirebaseApp.configure()

   // replace the two remote-notification callbacks with:
   func application(_ application: UIApplication,
                    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
       Messaging.messaging().apnsToken = deviceToken
       Messaging.messaging().token { token, error in
           if let error = error {
               NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
           } else if let token = token {
               // Hand the FCM token (not the APNs one) to the Capacitor plugin,
               // so JS stores/sends the same kind of token the MAUI app did.
               NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
           }
       }
   }

   func application(_ application: UIApplication,
                    didFailToRegisterForRemoteNotificationsWithError error: Error) {
       NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
   }
   ```
   (The plugin's `registration` event then delivers the FCM token; `pushNotifications.ts` stores it.)

## 4. How it behaves

* First sign-in on a device: permission prompt → FCM token → stored → the **next** `/api/Account/Login` carries it.
  On a fresh install the token usually arrives before the user finishes typing the password, so it goes with the
  first login; if not, it goes with the next one (same behaviour as MAUI, which also only sends at login).
* Job dispatched by the office → notification on the device (background/closed) exactly like MAUI.
* App in foreground → toast at the top with the office's message and an *Open* button, plus an immediate partial
  sync so the job appears in the list.
* Tap on a notification → partial sync, then the job's details (`/jobs/{SerRecID}`) when the title carried
  `"Alert|SerRecID"` or the data has `SerRecID`; else the job list.

## 5. Not covered (by design, same as MAUI)

* Silent background sync on push – the server sends visible notification messages, so the sync happens when the
  engineer opens the app. Needs native code if wanted later.
* Token refresh between logins – FCM rotates tokens rarely; the new token is sent on the next login. A
  `MobileV2/Device/RegisterToken` endpoint would close that gap (half a day).
* Web/PWA – FCM Web Push is possible on the same project (VAPID key + `firebase-messaging-sw.js`); not wired.

---

# Automatic & background sync

Files: `src/sync/syncSettings.ts` (schedule), `src/sync/autoSync.ts` + `AutoSyncHost.tsx` (foreground),
`src/sync/backgroundSync.ts` + `public/runners/sync-runner.js` (background heartbeat), `AutoSyncSettingsModal.tsx`
(Utilities → Automatic sync). Server: `GET /api/MobileV2/SyncV2/Changes?since=`.

## Schedule (configurable)

Defaults: every 20 min, Mon–Fri 08:00–18:00. The office can set it per tenant or per engineer with
`EzFieldSMSetting` rows (Engineer = `All` or the EngName), which come down with every sync:

| SettingID | Example |
|---|---|
| `AutoSyncEnabled` | `true` |
| `AutoSyncIntervalMins` | `20` |
| `AutoSyncStart` | `08:00` |
| `AutoSyncEnd` | `18:00` |
| `AutoSyncDays` | `1,2,3,4,5` (1 = Mon … 7 = Sun) |

The engineer can override on the device (Utilities → Automatic sync) and revert with *Use office settings*.

## Foreground (all platforms incl. PWA)

While the app is open: on start-up, every minute, when back online and when resumed, if the last sync is older than the
interval and it is within working hours → push pending changes + partial pull. A push notification forces one
immediately. Result shown in Utilities ("Last automatic sync …").

## Background heartbeat (Android / iOS)

`@capacitor/background-runner` runs `public/runners/sync-runner.js` outside the WebView (Android: WorkManager every
15 min; iOS: BGAppRefresh, when the system allows). When the app goes to the background it hands the runner the auth
token, tenant code, schedule, the pending SyncUp payload (outbox) and the last server sync time. Each run, within
working hours and when due:

1. POSTs the outbox to `SyncUp`; keeps the server's confirmations.
2. GETs `Changes?since=` for counts of new / updated jobs.
3. Posts a notification: **"Synced 14:20 · 2 items sent · 1 new job"** or **"Sync failed 14:20 … Will retry."**
   (nothing when there was nothing to report).

On resume the app applies the confirmations (rows marked sent only if unchanged since the snapshot), shows the last
background result in Utilities, and pulls immediately if the heartbeat saw changes.

Setup after `npm install && npx cap sync`:

* **Android** – nothing else; `POST_NOTIFICATIONS` is already in the manifest and the app asks the runner's
  notification permission on first sign-in.
* **iOS** – Xcode → target *App* → *Signing & Capabilities* → **Background Modes** → tick *Background fetch* and
  *Background processing*; add to `Info.plist`:
  ```xml
  <key>BGTaskSchedulerPermittedIdentifiers</key>
  <array>
    <string>com.ezmanagement.servicejobs.sync</string>
  </array>
  ```
* **QA** – Utilities → *Run automatic sync now* runs the foreground sync and dispatches one heartbeat to the runner
  as the OS would.
