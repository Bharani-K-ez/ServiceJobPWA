import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import { Capacitor } from '@capacitor/core'
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader'

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css'

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'

import './index.css'
import App from './App.tsx'

setupIonicReact()

// Self-heal the "blank page after a redeploy" bug: the service worker's
// NavigationRoute (see vite.config.ts's workbox settings) binds EVERY
// navigation - "/", "/jobs", anything - to a single precached index.html
// snapshot. Right after a new build is deployed, whichever service worker
// is still active for an already-open browser answers the very next
// navigation with its OLD cached index.html, which references that OLD
// build's content-hashed JS/CSS chunk filenames - files a fresh Azure
// Static Web Apps deploy has already deleted, so they 404 and the page
// renders blank. registerType: 'autoUpdate' means the new worker installs,
// calls skipWaiting() and clientsClaim() automatically in the background
// (no user action needed) - but claiming this page's clients does not, by
// itself, re-run this page's already-loaded (now-broken) JS. Listening for
// 'controllerchange' and reloading exactly once turns that silent handoff
// into an automatic recovery: the moment the new worker takes control, the
// page reloads and this time gets served by the NEW worker's matching
// index.html + asset manifest. See public/staticwebapp.config.json for the
// other half of this fix (no-cache on index.html/sw.js so the update is
// actually discovered promptly).
if ('serviceWorker' in navigator) {
  let reloadedForNewServiceWorker = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForNewServiceWorker) {
      return
    }
    reloadedForNewServiceWorker = true
    window.location.reload()
  })
}

// The @capacitor-community/sqlite web implementation is backed by the
// jeep-sqlite web component (SQLite compiled to WASM + IndexedDB storage).
// It only applies on the web/PWA build - native iOS/Android use the real
// SQLite plugin and don't need any of this. See db/sqlite.ts for the other
// half (initWebStore()).
if (Capacitor.getPlatform() === 'web') {
  defineJeepSqlite(window)

  // Mount the <jeep-sqlite> element as soon as document.body exists, NOT
  // gated on a 'DOMContentLoaded' listener - that event fires exactly once,
  // and this is a deferred module script (type="module"), which the spec
  // already runs after the document has been parsed. On a slow/cold load
  // there's usually still time left before DOMContentLoaded fires, so the
  // listener happens to catch it and everything works - but on a fast
  // reload (assets served instantly from the browser/service-worker cache,
  // e.g. exactly what happens when reopening a closed tab/installed PWA),
  // DOMContentLoaded can fire BEFORE this script attaches the listener.
  // addEventListener silently never calls back for an event that already
  // fired, so <jeep-sqlite> never gets created - db/sqlite.ts's
  // ensureWebStore()/initWebStore() then has no element to talk to and
  // silently ends up with a fresh, disconnected in-memory database instead
  // of restoring the real one from IndexedDB. Symptom confirmed live: after
  // logging in and syncing down a job, closing and reopening the app showed
  // an empty job list and getVersion reported user_version 0, even though
  // the real data was still sitting untouched in IndexedDB - reader was
  // just never attached to it. Mounting synchronously (falling back to the
  // event only if the document is still mid-parse) removes the race.
  const mountJeepSqlite = () => {
    if (!document.querySelector('jeep-sqlite')) {
      const jeepEl = document.createElement('jeep-sqlite')
      document.body.appendChild(jeepEl)
    }
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mountJeepSqlite)
  } else {
    mountJeepSqlite()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
