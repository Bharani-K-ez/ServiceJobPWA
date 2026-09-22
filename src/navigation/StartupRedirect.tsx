import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { startupPath } from './wipReturn'

/**
 * On a cold start (fresh page load / app launch) that lands on the job
 * list, jump to the current job's WIP screen if one is under way - the
 * engineer who reopens the app mid-job should be back where they were, not
 * on the list. Runs exactly once per app load, only once auth has resolved,
 * and only when the landing route is "/" or "/jobs" (a deep link to any
 * other screen is respected). LoginPage handles the same decision for the
 * post-sign-in navigation.
 *
 * The small delay lets IonRouterOutlet finish mounting the first page
 * before we navigate - see App.tsx's note on redirecting during the very
 * first transition.
 */
export default function StartupRedirect() {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || status !== 'authed') return
    done.current = true
    if (location.pathname !== '/' && location.pathname !== '/jobs') return

    let cancelled = false
    void startupPath().then((target) => {
      if (cancelled || target === '/jobs') return
      window.setTimeout(() => {
        if (!cancelled) navigate(target, { replace: true })
      }, 250)
    })
    return () => {
      cancelled = true
    }
  }, [status, location.pathname, navigate])

  return null
}
