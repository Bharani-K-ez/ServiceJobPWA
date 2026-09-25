import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IonIcon, IonToast } from '@ionic/react'
import { closeOutline, constructOutline, listOutline, searchOutline, settingsOutline } from 'ionicons/icons'
import { useAuth } from '../auth/AuthContext'
import { activeWorkPath, rememberWipPath } from '../navigation/wipReturn'

type Section = 'wip' | 'jobs' | 'findJob' | 'utilities'

interface MenuItem {
  key: Section
  label: string
  icon: string
}

const ITEMS: MenuItem[] = [
  { key: 'wip', label: 'WIP', icon: constructOutline },
  { key: 'jobs', label: 'Jobs List', icon: listOutline },
  { key: 'findJob', label: 'Find Job', icon: searchOutline },
  { key: 'utilities', label: 'Utilities', icon: settingsOutline },
]

function sectionFor(pathname: string): Section {
  if (pathname.startsWith('/utilities') || pathname.startsWith('/leave') || pathname.startsWith('/dev/')) return 'utilities'
  if (pathname.startsWith('/find-job')) return 'findJob'
  if (/^\/jobs\/\d+\/(wip|crew|team|assets|documents)/.test(pathname)) return 'wip'
  return 'jobs'
}

/**
 * The bottom-corner floating menu - the React take on the MAUI app's bottom
 * tab bar (WIP · Jobs List · Utilities). Collapsed, it is a single pill in
 * the bottom-right showing the section the engineer is in; tapping it fans
 * out the other sections above it, tapping outside (or the X) closes it.
 * "WIP" jumps straight to the job currently under way, or says so when
 * there isn't one. Hidden on the login screen. Rendered once in App.tsx,
 * outside IonRouterOutlet, so it floats over every page.
 */
export default function FloatingMenu() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useAuth()
  const [open, setOpen] = useState(false)
  // 'peek': the fan-out shown briefly on app start so the engineer learns the
  // menu is there - no backdrop, and it folds away by itself.
  const [peek, setPeek] = useState(false)
  // 'compact': after a few idle seconds the pill shrinks to just its icon so
  // it hides as little of the page as possible; any tap expands it again.
  const [compact, setCompact] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const idleTimer = useRef<number | null>(null)

  const current = sectionFor(location.pathname)

  // Hidden on login, and on the two screens whose own action footer sits
  // where the pill would (job details, team picker) - both are one tap
  // away from the list anyway.
  const hasOwnFooter = /^\/jobs\/\d+$/.test(location.pathname) || /^\/jobs\/\d+\/team/.test(location.pathname)
  const visible = status === 'authed' && location.pathname !== '/login' && !hasOwnFooter

  // Close when the route changes (after a pick, or a back navigation), and
  // remember WIP-area screens so "WIP" can return to the exact one.
  useEffect(() => {
    setOpen(false)
    setPeek(false)
    rememberWipPath(location.pathname, location.search)
  }, [location.pathname, location.search])

  // Pages scroll under the pill: give every ion-content on a page where the
  // menu shows enough bottom padding that the last item can still be
  // scrolled clear of it (see index.css / .has-floating-menu).
  useEffect(() => {
    document.body.classList.toggle('has-floating-menu', visible)
    return () => document.body.classList.remove('has-floating-menu')
  }, [visible])

  // Once per app start: fan the menu out for a moment, then fold it away.
  useEffect(() => {
    if (!visible || peekShown) return
    peekShown = true
    const show = window.setTimeout(() => setPeek(true), 600)
    const hide = window.setTimeout(() => setPeek(false), 3600)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [visible])

  // Shrink to icon-only after 4s of nothing happening; expand on any touch.
  useEffect(() => {
    if (!visible) return
    const arm = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
      setCompact(false)
      idleTimer.current = window.setTimeout(() => setCompact(true), 4000)
    }
    arm()
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
    }
  }, [visible, open, peek, location.pathname])

  if (!visible) return null

  async function go(section: Section) {
    setOpen(false)
    setPeek(false)
    if (section === 'jobs') {
      navigate('/jobs')
    } else if (section === 'findJob') {
      navigate('/find-job')
    } else if (section === 'utilities') {
      navigate('/utilities')
    } else {
      const target = await activeWorkPath()
      if (target) {
        navigate(target)
      } else {
        setToast('No job in progress. Open a job from the list and press Travel To, Start Job or Clock In.')
      }
    }
  }

  const currentItem = ITEMS.find((i) => i.key === current) ?? ITEMS[1]
  const others = ITEMS.filter((i) => i.key !== current)

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9998 }}
        />
      )}
      {/* The start-up peek has no backdrop - the page stays usable and the
        * fan-out simply folds away after a moment. */}

      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
        }}
      >
        {(open || peek) &&
          others.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void go(item.key)}
              style={{
                ...pillStyle,
                background: 'var(--ion-background-color, #fff)',
                color: 'var(--ion-text-color, #222)',
                animation: `fm-pop 160ms ease-out ${i * 40}ms both`,
              }}
            >
              <IonIcon icon={item.icon} style={{ fontSize: 20 }} />
              <span>{item.label}</span>
            </button>
          ))}

        <button
          type="button"
          aria-label={open ? 'Close menu' : `${currentItem.label} - open menu`}
          onClick={() => {
            if (peek) {
              setPeek(false)
              setOpen(true)
            } else {
              setOpen((o) => !o)
            }
          }}
          style={{
            ...pillStyle,
            background: 'var(--ion-color-primary)',
            color: 'var(--ion-color-primary-contrast)',
            fontWeight: 600,
            // Compact = icon-only circle; the label collapses via max-width so it animates.
            padding: compact && !open && !peek ? 14 : pillStyle.padding,
            transition: 'padding 200ms',
          }}
        >
          <IonIcon icon={open ? closeOutline : currentItem.icon} style={{ fontSize: 20 }} />
          <span
            style={{
              maxWidth: compact && !open && !peek ? 0 : 160,
              opacity: compact && !open && !peek ? 0 : 1,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'max-width 200ms, opacity 150ms',
            }}
          >
            {open ? 'Close' : currentItem.label}
          </span>
        </button>
      </div>

      <IonToast isOpen={toast !== null} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />

      <style>{`
        @keyframes fm-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}

/** Set once per app load - the peek is a hint, not a ritual. */
let peekShown = false

const pillStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: 'none',
  borderRadius: 999,
  padding: '12px 18px',
  fontSize: 15,
  boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
  cursor: 'pointer',
  minHeight: 48,
}
