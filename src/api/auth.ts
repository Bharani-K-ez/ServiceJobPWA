import md5 from 'md5'
import { httpClient } from './httpClient'
import { setAuthToken, clearAuthToken } from './authToken'
import { setTenantCode, clearTenantCode } from './tenant'
import type { ApiResult, LoginRequest } from './types'

export interface LoginParams {
  username: string
  password: string
  companyCode: string
}

export interface LoginOutcome {
  success: boolean
  message: string
}

/**
 * Calls POST /api/Account/Login (AccountController.Login, [AllowAnonymous]).
 * On success the backend returns the JWT as `data` inside the ApiResult
 * envelope; on failure `failMessage` explains why (bad credentials,
 * "Company not configured" from the tenant middleware, etc).
 */
export async function login({
  username,
  password,
  companyCode,
}: LoginParams): Promise<LoginOutcome> {
  // Store the tenant code before the call so the request interceptor can
  // attach it as `?code=` on this very request.
  await setTenantCode(companyCode)

  // The API expects the password MD5-hashed rather than plaintext (same
  // as the existing MAUI app), so hash it client-side before it ever
  // goes on the wire - the plaintext password itself never leaves this
  // function.
  const body: LoginRequest = { username, password: md5(password), code: companyCode }
  const { data: result } = await httpClient.post<ApiResult<string>>(
    '/api/Account/Login',
    body,
  )

  if (result.hasData && result.data) {
    await setAuthToken(result.data)
    return { success: true, message: result.okMessage ?? 'Login successful' }
  }

  return {
    success: false,
    message: result.failMessage ?? 'Login failed',
  }
}

export async function logout(): Promise<void> {
  await clearAuthToken()
  await clearTenantCode()
}
