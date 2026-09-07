import { Preferences } from '@capacitor/preferences'

/**
 * JWT issued by POST /api/Account/Login. @capacitor/preferences is fine
 * for a working scaffold, but it is NOT encrypted at rest on either
 * platform - if you need that guarantee before shipping, swap this file's
 * internals for a Keychain/Keystore-backed plugin (e.g.
 * capacitor-secure-storage-plugin) without touching any of its callers.
 */
const AUTH_TOKEN_KEY = 'serviceJobs.authToken'

export async function getAuthToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY })
  return value
}

export async function setAuthToken(token: string): Promise<void> {
  await Preferences.set({ key: AUTH_TOKEN_KEY, value: token })
}

export async function clearAuthToken(): Promise<void> {
  await Preferences.remove({ key: AUTH_TOKEN_KEY })
}
