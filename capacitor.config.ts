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
  },
}

export default config
