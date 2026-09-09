import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Disabled because of a confirmed, reproduced bug in how it interacts
    // with the PWA service worker below. Vite's default modulePreload
    // injects <link rel="modulepreload"> hints (and a runtime polyfill for
    // dynamically-imported chunks) so the browser starts fetching a chunk
    // before it's actually import()'d. Once the Workbox service worker is
    // active, it separately intercepts the *real* import()'s fetch for
    // that same chunk - so the browser can end up with two different
    // fetches for one URL: one that bypassed/predated the service worker
    // (the preload) and one it controlled (the actual import). Chrome
    // detects this as a "cross-world service worker resource mismatch",
    // refuses to reuse the preloaded module, and in the case reproduced
    // here that second, SW-controlled load of one of jeep-sqlite's own
    // lazy-loaded (Stencil) chunks never resolved at all - confirmed live
    // by calling the mounted <jeep-sqlite> element's own isStoreOpen()
    // directly from the console and watching it hang indefinitely, with
    // the exact two chunk URLs named in this mismatch warning every time.
    // That silently broke local SQLite storage on the web/PWA build: every
    // wait on isStoreOpen() (both this app's own and
    // @capacitor-community/sqlite's internal one) hung forever, which is
    // what made the app look like "the database never initializes" after
    // closing and reopening (see sqlite.ts's raceTimeout/ensureWebStore
    // and its doc comments for the app-side half of this fix - that half
    // turns the hang into a visible, retryable error, but doesn't stop the
    // hang from happening in the first place). Turning modulePreload off
    // removes the preload fetch entirely, so every chunk - jeep-sqlite's
    // included - has exactly one fetch path (the service-worker-controlled
    // one), eliminating the mismatch this depends on.
    modulePreload: false,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Service Jobs',
        short_name: 'ServiceJobs',
        description: 'ServiceJobs mobile app',
        theme_color: '#73c136',
        background_color: '#ffffff',
        display: 'standalone',
        // '/jobs' (not '/') so relaunching the installed app/PWA lands
        // directly on the real route. Landing on '/' first would make the
        // client-side App.tsx redirect from '/' to '/jobs' on every cold
        // start - a rapid route-to-route redirect during the router's very
        // first page transition that could trip up IonRouterOutlet's
        // enter-transition bookkeeping and leave the real page stuck
        // invisible (repro'd: reopening the app after a first login showed
        // a blank /jobs screen that only recovered on a manual refresh).
        // See App.tsx's AppRoutes for the matching client-side fix.
        start_url: '/jobs',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never cache calls to the API - the PWA offline story here is
        // "app shell works offline", not "API responses are cached blindly".
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Lets you test install/offline behaviour with `npm run dev` too,
        // not just in a production build.
        enabled: true,
      },
    }),
  ],
})
