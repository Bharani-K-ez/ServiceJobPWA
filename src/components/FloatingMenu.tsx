import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IonIcon, IonToast } from '@ionic/react'
import { closeOutline, constructOutline, listOutline, settingsOutline } from 'ionicons/icons'
import { useAuth } from '../auth/AuthContext'
import { getEngineerState } from '../db/jobState'
import { rememberWipPath, wipPathFor } from '../navigation/wipReturn'

type Section = 'wip' | 'jobs' | 'utilities'

interface MenuItem {
  key: Section
  label: string
  icon: string
}

const ITEMS: MenuItem[] = [
  { key: 'wip', label: 'WIP', icon: constructOutline },
  { key: 'jobs', label: 'Jobs List', icon: listOutline },
  { key: 'utilities', label: 'Utilities', icon: settingsOutline },
]

function sectionFor(pathname: string): Section {
  if (pathname.startsWith('/utilities') || pathname.startsWith('/dev/')) return 'utilities'
  if (/^\/jobs\/\d+\/(wip|team|assets|documents)/.test(pathname)) return 'wip'
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
  const [toast, setToast] = useState<string | null>(null)

  const current = sectionFor(location.pathname)

  // Close when the route changes (after a pick, or a back navigation), and
  // remember WIP-area screens so "WIP" can return to the exact one.
  useEffect(() => {
    setOpen(false)
    rememberWipPath(location.pathname, location.search)
  }, [location.pathname, location.search])

  // Hidden on login, and on the two screens whose own action footer sits
  // where the pill would (job details, team picker) - both are one tap
  // away from the list anyway.
  const hasOwnFooter = /^\/jobs\/\d+$/.test(location.pathname) || /^\/jobs\/\d+\/team/.test(location.pathname)
  if (status !== 'authed' || location.pathname === '/login' || hasOwnFooter) return null

  async function go(section: Section) {
    setOpen(false)
    if (section === 'jobs') {
      navigate('/jobs')
    } else if (section === 'utilities') {
      navigate('/utilities')
    } else {
      const { currentJob } = await getEngineerState()
      if (currentJob) {
        navigate(wipPathFor(currentJob))
      } else {
        setToast('No job in progress. Open a job from the list and press Travel To or Start Job.')
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
        {open &&
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
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
          style={{
            ...pillStyle,
            background: 'var(--ion-color-primary)',
            color: 'var(--ion-color-primary-contrast)',
            fontWeight: 600,
          }}
        >
          <IonIcon icon={open ? closeOutline : currentItem.icon} style={{ fontSize: 20 }} />
          <span>{open ? 'Close' : currentItem.label}</span>
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
