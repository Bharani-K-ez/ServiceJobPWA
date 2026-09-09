import { Preferences } from '@capacitor/preferences'

/**
 * On-device record of the last account (username + company code) that
 * completed a full ONLINE "first login" on this device - meaning the
 * server actually verified the credentials and the app ran its one-time
 * SyncV2 pull. This is used two ways, both in api/auth.ts:
 *
 *  1. To decide whether the automatic post-login sync should run at all.
 *     It must only ever run once per (username, company code) pair per
 *     device - never on every login - so login() compares the account
 *     being signed in against this before deciding.
 *  2. As the fallback credential check when there is no network: the
 *     entered password's MD5 hash is compared against `passwordHash`
 *     here, so the app can still be opened and used - entirely off local
 *     SQLite data - with zero connectivity, once this has been populated.
 *
 * Same @capacitor/preferences backing as authToken.ts/tenant.ts - see the
 * note there about it being unencrypted at rest on either platform.
 */
const USERNAME_KEY = 'serviceJobs.savedUsername'
const PASSWORD_HASH_KEY = 'serviceJobs.savedPasswordHash'
const COMPANY_CODE_KEY = 'serviceJobs.savedCompanyCode'

/**
 * Marks that the current session was authenticated offline (no server
 * round-trip), rather than storing a fake bearer token that could
 * confuse httpClient's real Authorization header. AuthContext treats
 * either a real auth token OR this marker as "authed".
 */
const OFFLINE_SESSION_KEY = 'serviceJobs.offlineSessionAccount'

export interface Account {
  username: string
  companyCode: string
}

export interface SavedCredentials extends Account {
  passwordHash: string
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  const [{ value: username }, { value: passwordHash }, { value: companyCode }] = await Promise.all([
    Preferences.get({ key: USERNAME_KEY }),
    Preferences.get({ key: PASSWORD_HASH_KEY }),
    Preferences.get({ key: COMPANY_CODE_KEY }),
  ])
  if (!username || !passwordHash || !companyCode) return null
  return { username, passwordHash, companyCode }
}

export async function saveCredentials(creds: SavedCredentials): Promise<void> {
  await Promise.all([
    Preferences.set({ key: USERNAME_KEY, value: creds.username }),
    Preferences.set({ key: PASSWORD_HASH_KEY, value: creds.passwordHash }),
    Preferences.set({ key: COMPANY_CODE_KEY, value: creds.companyCode }),
  ])
}

export async function clearSavedCredentials(): Promise<void> {
  await Promise.all([
    Preferences.remove({ key: USERNAME_KEY }),
    Preferences.remove({ key: PASSWORD_HASH_KEY }),
    Preferences.remove({ key: COMPANY_CODE_KEY }),
  ])
}

/** Case/whitespace-insensitive match - usernames and company codes are
 * typically not case-sensitive on the backend and get retyped by hand. */
export function sameAccount(a: Account, b: Account): boolean {
  return (
    a.username.trim().toLowerCase() === b.username.trim().toLowerCase() &&
    a.companyCode.trim().toLowerCase() === b.companyCode.trim().toLowerCase()
  )
}

export async function getOfflineSessionAccount(): Promise<Account | null> {
  const { value } = await Preferences.get({ key: OFFLINE_SESSION_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as Account
  } catch {
    return null
  }
}

export async function setOfflineSessionAccount(account: Account): Promise<void> {
  await Preferences.set({ key: OFFLINE_SESSION_KEY, value: JSON.stringify(account) })
}

export async function clearOfflineSessionAccount(): Promise<void> {
  await Preferences.remove({ key: OFFLINE_SESSION_KEY })
}

/**
 * The "Save password" toggle on LoginPage - entirely separate from
 * SavedCredentials above. That one is saved automatically after every
 * successful online login (to power the offline-login check) and only ever
 * holds an MD5 hash, which cannot be turned back into the plaintext needed
 * to pre-fill the password field. This one is opt-in (only written when the
 * user has the toggle on) and holds the actual plaintext password purely so
 * LoginPage can pre-fill company code / username / password on the next
 * visit. Same @capacitor/preferences backing as everything else in this
 * file - unencrypted at rest on either platform, same as the rest of this
 * module - so only save it when the user has explicitly opted in via the
 * toggle.
 */
const REMEMBERED_COMPANY_CODE_KEY = 'serviceJobs.rememberedCompanyCode'
const REMEMBERED_USERNAME_KEY = 'serviceJobs.rememberedUsername'
const REMEMBERED_PASSWORD_KEY = 'serviceJobs.rememberedPasswordPlain'

export interface RememberedLogin {
  companyCode: string
  username: string
  password: string
}

export async function getRememberedLogin(): Promise<RememberedLogin | null> {
  const [{ value: companyCode }, { value: username }, { value: password }] = await Promise.all([
    Preferences.get({ key: REMEMBERED_COMPANY_CODE_KEY }),
    Preferences.get({ key: REMEMBERED_USERNAME_KEY }),
    Preferences.get({ key: REMEMBERED_PASSWORD_KEY }),
  ])
  if (!username || !password) return null
  return { companyCode: companyCode ?? '', username, password }
}

export async function saveRememberedLogin(login: RememberedLogin): Promise<void> {
  await Promise.all([
    Preferences.set({ key: REMEMBERED_COMPANY_CODE_KEY, value: login.companyCode }),
    Preferences.set({ key: REMEMBERED_USERNAME_KEY, value: login.username }),
    Preferences.set({ key: REMEMBERED_PASSWORD_KEY, value: login.password }),
  ])
}

export async function clearRememberedLogin(): Promise<void> {
  await Promise.all([
    Preferences.remove({ key: REMEMBERED_COMPANY_CODE_KEY }),
    Preferences.remove({ key: REMEMBERED_USERNAME_KEY }),
    Preferences.remove({ key: REMEMBERED_PASSWORD_KEY }),
  ])
}
