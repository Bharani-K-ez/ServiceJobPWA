# ServiceJobs

React + TypeScript PWA, wrapped with Capacitor for Android/iOS, talking to
the `ezServiceHUB.WebAPI` project.

## What's already wired up

- **Vite + React + TypeScript**, installable as a PWA (`vite-plugin-pwa`,
  manifest + service worker, works in `npm run dev` too via `devOptions`).
- **Capacitor** core installed and configured (`capacitor.config.ts`),
  ready for `npx cap add android` / `npx cap add ios`.
- **API client** (`src/api/httpClient.ts`) that automatically attaches:
  - `?code=<tenantCompanyCode>` on every request - required by the
    backend's `TenantConfigurationMiddleware`, which resolves the tenant
    DB/config from this query param on every single call.
  - `Authorization: Bearer <token>` once you've logged in.
- **Auth flow** (`src/api/auth.ts`) calling `POST /api/Account/Login`
  (`AccountController.Login`) and storing the returned JWT.
- Tenant code and auth token are both stored via `@capacitor/preferences`,
  which uses native storage on iOS/Android and `localStorage` on web - one
  API, no per-platform branching required in app code.
- `src/App.tsx` is a minimal working login form wired to all of the above,
  so you can confirm the whole path works against the real API before
  building actual screens.

## Getting started

```bash
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if needed
npm run dev
```

`VITE_API_BASE_URL` defaults to `https://localhost:7092`, matching the
WebAPI project's `https` launch profile
(`ezServiceHUB.WebAPI/Properties/launchSettings.json`). If the API's
dev-cert isn't trusted by your browser, either trust it
(`dotnet dev-certs https --trust`) or point `VITE_API_BASE_URL` at the
plain `http://localhost:5125` profile instead.

## Adding the native platforms

Not done yet on purpose - these generate real native project folders and
are better run on the machine you'll actually build from:

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios       # requires Xcode, i.e. must be run on a Mac
```

After that, the day-to-day loop is:

```bash
npm run cap:android   # builds the web app, syncs, opens Android Studio
npm run cap:ios       # same, opens Xcode (Mac only)
```

Commit the generated `android/` and `ios/` folders to source control once
they exist - that's the Capacitor-recommended convention, and the
`.gitignore` here already excludes just their build output
(`android/app/build`, `ios/App/Pods`, etc.), not the projects themselves.

## Backend integration notes

- The tenant `code` is the same value used across the existing MAUI app
  and the WebAPI's Swagger docs (see `AddCompanyCodeParameter` filter) -
  whatever company code you use there works here too.
- `AccountController.Login` accepts `{ username, password, code }` (plus
  an optional `userEmail`) and returns the JWT inside the standard
  `ApiResult<T>` envelope (`hasData` / `data` / `okMessage` /
  `failMessage`) that every controller in this API uses - `src/api/types.ts`
  models that envelope once so you don't have to redeclare it per call.
- New mobile-only endpoints on the API side don't require touching
  `Program.cs` or any existing controller - both tenant resolution and
  auth are global middleware/filters, so a fresh controller inherits them
  automatically. See the API repo's own `CLAUDE.md` (or ask for one to be
  set up) for the recommended folder/route convention for those.

## Known gaps to close before shipping

- `@capacitor/preferences` is not encrypted at rest. Swap
  `src/api/authToken.ts`'s internals for a Keychain/Keystore-backed
  plugin before this holds anything more sensitive than a short-lived JWT.
- No token refresh flow yet - a 401 currently just clears the stored
  token (see the response interceptor in `httpClient.ts`), so the app
  will need to route back to login rather than silently retry.
- No offline data layer yet. If/when you need local SQLite (e.g. for
  offline job data), add it as its own module behind an interface so the
  storage engine can change without touching call sites - see the earlier
  conversation on `sqlite-wasm`/`wa-sqlite` (web) vs
  `@capacitor-community/sqlite` (native) for the two implementations
  you'd need.
