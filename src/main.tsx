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

// The @capacitor-community/sqlite web implementation is backed by the
// jeep-sqlite web component (SQLite compiled to WASM + IndexedDB storage).
// It only applies on the web/PWA build - native iOS/Android use the real
// SQLite plugin and don't need any of this. See db/sqlite.ts for the other
// half (initWebStore()).
if (Capacitor.getPlatform() === 'web') {
  defineJeepSqlite(window)
  window.addEventListener('DOMContentLoaded', () => {
    const existing = document.querySelector('jeep-sqlite')
    if (!existing) {
      const jeepEl = document.createElement('jeep-sqlite')
      document.body.appendChild(jeepEl)
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
