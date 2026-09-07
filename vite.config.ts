import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        start_url: '/',
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
