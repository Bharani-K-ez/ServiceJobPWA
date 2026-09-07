import { Preferences } from '@capacitor/preferences'

/**
 * The tenant "company code" the backend's TenantConfigurationMiddleware
 * reads off the `?code=` query string on every single request to resolve
 * which tenant DB/config to use. There is no header-based alternative in
 * the current API, so this must be attached to every request - see
 * httpClient.ts's request interceptor.
 *
 * Stored via @capacitor/preferences, which uses native storage on
 * iOS/Android and falls back to localStorage on the web - one API for
 * both without branching in app code.
 */
const TENANT_CODE_KEY = 'serviceJobs.tenantCode'

export async function getTenantCode(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TENANT_CODE_KEY })
  return value
}

export async function setTenantCode(code: string): Promise<void> {
  await Preferences.set({ key: TENANT_CODE_KEY, value: code })
}

export async function clearTenantCode(): Promise<void> {
  await Preferences.remove({ key: TENANT_CODE_KEY })
}
