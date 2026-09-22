import { IonButton, IonIcon } from '@ionic/react'
import { arrowBackOutline } from 'ionicons/icons'
import { useNavigate } from 'react-router-dom'

/**
 * A back arrow that always goes UP the app's screen hierarchy, not back
 * through browser history. IonBackButton pops history, which breaks down
 * once a screen can be reached from several places - e.g. arriving on the
 * asset list through the floating "WIP" menu (history: job list -> asset
 * list) made its back arrow return to the job list, and "WIP" then brought
 * you straight back to the asset list: the WIP summary became unreachable.
 * Used by every WIP-area sub-screen with its parent route as `to`.
 */
export default function UpButton({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <IonButton onClick={() => navigate(to, { replace: true })} aria-label="Back">
      <IonIcon slot="icon-only" icon={arrowBackOutline} />
    </IonButton>
  )
}
