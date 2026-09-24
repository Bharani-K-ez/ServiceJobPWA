import type { CapacitorConfig } from '@capacitor/cli'

// appId follows reverse-domain convention. Change if you want a different
// bundle identifier before you run `npx cap add ios` / `npx cap add android`
// -- it's painful to rename after native projects exist.
const config: CapacitorConfig = {
  appId: 'com.ezmanagement.servicejobs',
  appName: 'ServiceJobs',
  webDir: 'dist',
  // Uncomment during device/emulator development to get live-reload from
  // your dev machine's Vite server instead of the last `npm run build`.
  // server: {
  //   url: 'http://192.168.1.50:5173',
  //   cleartext: true,
  // },
  plugins: {
    // Local job/site/customer/asset data only - not encrypted at rest. If
    // that needs to change before shipping, this is the one place to flip
    // it (iosIsEncryption/androidIsEncryption), alongside the 'no-encryption'
    // mode passed to createConnection() in src/db/sqlite.ts.
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
    },
    // Without this, every httpClient.ts (axios) call on a native build
    // still runs as a plain WebView fetch/XHR - which, unlike a real native
    // HTTP client, is still subject to the browser's CORS rules. Confirmed
    // on a real Android APK build: login failed with "No network
    // connection" even though the API log showed the OPTIONS preflight
    // reaching the server fine - the browser was blocking the follow-up
    // POST client-side because the WebView's origin (Capacitor's default
    // androidScheme makes it "https://localhost") isn't in the backend's
    // Cors:AllowedOrigins (see ezServiceHUBWebAPI's Program.cs/appsettings,
    // which - by explicit design there - only allows the deployed React
    // PWA's own origin and leaves everything else blocked; the backend's
    // own comments already assumed "Capacitor builds that use the native
    // HTTP bridge" would be the ones talking to it, i.e. this setting was
    // expected on this side and simply hadn't been turned on yet).
    // Enabling CapacitorHttp routes fetch/XHR through native platform code
    // on iOS/Android instead of the WebView, which isn't subject to CORS
    // at all - matching how the backend already expects native clients to
    // behave, and avoiding the need to special-case the app's own origin
    // in the backend's CORS allowlist at all. No effect on the web/PWA
    // build (Capacitor.getPlatform() there is 'web', where this plugin
    // doesn't apply and the normal browser fetch/XHR path is used, so the
    // PWA still needs its own real origin listed in Cors:AllowedOrigins
    // separately).
    CapacitorHttp: {
      enabled: true,
    },
    // iOS: show pushes that arrive while the app is in the foreground the
    // same way as in the background (the MAUI app behaves like this).
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Background sync heartbeat - see public/runners/sync-runner.js and
    // src/sync/backgroundSync.ts. `interval` is the OS cadence in minutes
    // (Android/WorkManager minimum is 15); the configured schedule
    // (default every 20 min, Mon-Fri 08:00-18:00, changeable in Utilities)
    // is applied inside the runner, which no-ops when it is not due or
    // outside working hours. iOS treats this as a BGAppRefresh request -
    // the system decides when it actually runs.
    BackgroundRunner: {
      label: 'com.ezmanagement.servicejobs.sync',
      src: 'runners/sync-runner.js',
      event: 'syncHeartbeat',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },
}

export default config
