import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getAuthToken } from '../api/authToken'
import { logout as apiLogout } from '../api/auth'
import { getOfflineSessionAccount } from '../api/localAuth'

type AuthStatus = 'loading' | 'authed' | 'anon'

interface AuthContextValue {
  status: AuthStatus
  /** Re-checks stored auth state - call after a successful login. */
  refresh: () => Promise<void>
  /** Clears the stored session and tenant code, then flips to 'anon'. */
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')

  const refresh = useCallback(async () => {
    // A real JWT means an online session; the offline-session marker
    // means the last login was validated locally (no network) against
    // credentials saved from an earlier successful online login - see
    // api/auth.ts and api/localAuth.ts. Either one counts as "authed" so
    // the app can run entirely off local SQLite data with no connection.
    const [token, offlineAccount] = await Promise.all([getAuthToken(), getOfflineSessionAccount()])
    setStatus(token || offlineAccount ? 'authed' : 'anon')
  }, [])

  const signOut = useCallback(async () => {
    await apiLogout()
    setStatus('anon')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ status, refresh, signOut }), [status, refresh, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
