import md5 from 'md5'
import axios from 'axios'
import { httpClient } from './httpClient'
import { setAuthToken, clearAuthToken } from './authToken'
import { setTenantCode, clearTenantCode } from './tenant'
import {
  getSavedCredentials,
  saveCredentials,
  clearOfflineSessionAccount,
  setOfflineSessionAccount,
  sameAccount,
} from './localAuth'
import type { ApiResult, LoginRequest } from './types'

export interface LoginParams {
  username: string
  password: string
  companyCode: string
}

export type LoginMode = 'online' | 'offline'

export interface LoginOutcome {
  success: boolean
  message: string
  /** 'online' when the credentials were just verified against the server;
   *  'offline' when there was no network and they were instead checked
   *  against the MD5 hash saved on this device from an earlier login. */
  mode: LoginMode
  /**
   * True only the first time this exact username + company code pair has
   * ever completed an ONLINE login on this device. The caller (LoginPage)
   * uses this - and only this - to decide whether to run the one-time
   * sync: every later login for the same account, online or offline,
   * must NOT auto-sync. A manual resync lives in Utilities instead.
   */
  isFirstLoginForAccount: boolean
}

function isNetworkError(err: unknown): boolean {
  // Axios only sets `.response` once the server actually replied - a
  // response (even a 4xx/5xx one) means the request reached the API and
  // it made a decision, so that's a real credential failure, not
  // something to fall back to an offline check for. No `.response`
  // (timeout, DNS failure, offline device, connection refused) means the
  // request never completed at all.
  return axios.isAxiosError(err) && !err.response
}

/**
 * Calls POST /api/Account/Login (AccountController.Login, [AllowAnonymous])
 * whenever the device has network. If it doesn't, falls back to checking
 * the entered credentials against whatever was saved on this device by a
 * previous successful online login - see localAuth.ts - so the app can
 * still be opened with zero connectivity once that has happened once.
 */
export async function login({
  username,
  password,
  companyCode,
}: LoginParams): Promise<LoginOutcome> {
  const trimmedUsername = username.trim()
  const trimmedCompanyCode = companyCode.trim()

  // Store the tenant code before the call so the request interceptor can
  // attach it as `?code=` on this very request.
  await setTenantCode(trimmedCompanyCode)

  // The API expects the password MD5-hashed rather than plaintext (same
  // as the existing MAUI app), so hash it client-side before it ever goes
  // on the wire - the plaintext password itself never leaves this
  // function. This same hash is also what gets saved for the offline
  // fallback check, per the requirement to store user/md5-password/
  // company code after a successful first login.
  const passwordHash = md5(password)
  const account = { username: trimmedUsername, companyCode: trimmedCompanyCode }

  const saved = await getSavedCredentials()
  const isSavedAccount = !!saved && sameAccount(saved, account)

  try {
    const body: LoginRequest = {
      username: trimmedUsername,
      password: passwordHash,
      code: trimmedCompanyCode,
    }
    const { data: result } = await httpClient.post<ApiResult<string>>(
      '/api/Account/Login',
      body,
    )

    if (result.hasData && result.data) {
      await setAuthToken(result.data)
      await clearOfflineSessionAccount()

      const isFirstLoginForAccount = !isSavedAccount
      if (isFirstLoginForAccount || saved?.passwordHash !== passwordHash) {
        // Either this device has never seen this account before, or the
        // server just accepted a password that differs from what's
        // saved (it changed) - (re)save it so future offline checks and
        // the "is this a first login" test both stay accurate. Note this
        // does NOT count as a fresh "first login" by itself when the
        // account was already known - only a brand-new account does.
        await saveCredentials({ ...account, passwordHash })
      }

      return {
        success: true,
        message: result.okMessage ?? 'Login successful',
        mode: 'online',
        isFirstLoginForAccount,
      }
    }

    // Server was reachable and explicitly rejected these credentials -
    // never fall back to the offline check in this case.
    return {
      success: false,
      message: result.failMessage ?? 'Login failed',
      mode: 'online',
      isFirstLoginForAccount: false,
    }
  } catch (err) {
    if (!isNetworkError(err)) throw err

    // No network reachable at all: the only way in is an account that
    // already completed an online first login on this device, with a
    // password hash matching what was just typed.
    if (isSavedAccount && saved!.passwordHash === passwordHash) {
      await setOfflineSessionAccount(account)
      return {
        success: true,
        message: "Signed in offline using this device's saved credentials.",
        mode: 'offline',
        isFirstLoginForAccount: false,
      }
    }

    return {
      success: false,
      message: isSavedAccount
        ? 'Incorrect password (checked offline - no network connection).'
        : 'No network connection, and this account has not signed in on this device before.',
      mode: 'offline',
      isFirstLoginForAccount: false,
    }
  }
}

export async function logout(): Promise<void> {
  await clearAuthToken()
  await clearTenantCode()
  await clearOfflineSessionAccount()
  // Saved credentials (username/md5 password/company code) are
  // deliberately NOT cleared on logout - the whole point is that this
  // account's next login on this device stays offline-capable and does
  // not trigger another automatic sync.
}
