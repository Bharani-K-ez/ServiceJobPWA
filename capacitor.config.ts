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
  },
}

export default config
