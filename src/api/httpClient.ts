import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '../config/env'
import { getAuthToken, clearAuthToken } from './authToken'
import { getTenantCode } from './tenant'

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
})

// Every request needs `?code=<tenantCode>` - the backend's tenant
// middleware reads it before anything else runs, including auth.
// Attaching it here means no call site has to remember to pass it.
httpClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const tenantCode = await getTenantCode()
  if (tenantCode) {
    config.params = { ...config.params, code: tenantCode }
  }

  const token = await getAuthToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

/**
 * The API serializes responses with PascalCase keys exactly matching the
 * C# property names (e.g. `{ HasData, Data, OkMessage, FailMessage,
 * Error }`), not camelCase - confirmed against a real Login response.
 * Rather than writing every TypeScript type to match .NET casing, convert
 * once here so the rest of the app can use normal camelCase everywhere.
 * Only response bodies need this - request bodies already bind fine with
 * lowercase keys because ASP.NET Core's JSON model binding is
 * case-insensitive by default.
 */
function toCamelCase(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(toCamelCase)
  }
  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key.charAt(0).toLowerCase() + key.slice(1),
        toCamelCase(value),
      ]),
    )
  }
  return input
}

httpClient.interceptors.response.use(
  (response) => {
    response.data = toCamelCase(response.data)
    return response
  },
  async (error) => {
    // A 401 means the stored token is gone/expired - drop it so the
    // app's auth-state check reliably falls back to "logged out" on the
    // next read, rather than repeatedly sending a dead token.
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearAuthToken()
    }
    return Promise.reject(error)
  },
)
