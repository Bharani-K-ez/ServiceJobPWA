/**
 * Central place for build-time config so nothing else in the app reads
 * `import.meta.env` directly. Vite only exposes vars prefixed `VITE_`.
 *
 * Set these in a local `.env` file (see `.env.example`) - never commit
 * real `.env` files, only `.env.example`.
 */

// Matches the WebAPI project's `https` launch profile in
// Properties/launchSettings.json for local development. Point this at a
// real host/port for staging or production builds.
const DEFAULT_DEV_API_BASE_URL = 'https://localhost:7092'

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_DEV_API_BASE_URL
