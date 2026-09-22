import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { IonButton, IonDatetime, IonDatetimeButton, IonIcon, IonModal, IonNote, IonText } from '@ionic/react'
import { locateOutline, navigateOutline, saveOutline, timeOutline } from 'ionicons/icons'
import type { LocalSite } from '../db/localData'
import { getSavedEta, saveEta } from '../db/liveSync'
import { tryPushPendingLocalChanges } from '../db/localData'
import { nowLocalIso } from '../db/jobState'
import {
  directionsUrl,
  estimateDriveMinutes,
  formatKm,
  getCurrentPosition,
  haversineKm,
  mapEmbedUrl,
  type LatLng,
} from '../utils/geo'
import { formatTime } from '../utils/format'

interface Props {
  serRecId: number
  site: LocalSite | null
}

/**
 * The "Travel To" block on the WIP screen - the port of the MAUI Travel
 * view: a map of the site, the engineer's ETA (pre-filled from the device's
 * GPS position and a driving estimate, adjustable, saved as a TblLiveSync
 * breadcrumb for the office), and a Navigate button that hands off to the
 * device's maps app for turn-by-turn directions.
 *
 * No maps SDK or API key: the map is Google's keyless embed, and the ETA
 * estimate is straight-line distance with a road factor (utils/geo.ts).
 * Everything degrades gracefully - no coordinates on the site falls back to
 * its address; no GPS just leaves the ETA for the engineer to set by hand.
 */
export default function TravelPanel({ serRecId, site }: Props) {
  const [position, setPosition] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [eta, setEta] = useState<string>(() => nowLocalIso(new Date(Date.now() + 30 * 60_000)))
  const [savedEta, setSavedEta] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const destination = useMemo<LatLng | string | null>(() => {
    if (site?.latitude != null && site?.longitude != null && (site.latitude !== 0 || site.longitude !== 0)) {
      return { lat: site.latitude, lng: site.longitude }
    }
    const address = [site?.address, site?.town, site?.county, site?.postCode].filter(Boolean).join(', ')
    return address || null
  }, [site])

  const estimate = useMemo(() => {
    if (!position || !destination || typeof destination === 'string') return null
    const km = haversineKm(position, destination)
    return { km, ...estimateDriveMinutes(km) }
  }, [position, destination])

  useEffect(() => {
    void getSavedEta(serRecId).then((saved) => {
      if (saved) {
        setSavedEta(saved)
        setEta(saved)
      }
    })
    void locate(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serRecId])

  async function locate(silent = false) {
    setLocating(true)
    setLocError(null)
    try {
      const pos = await getCurrentPosition()
      setPosition(pos)
      // Pre-fill the ETA from the estimate only if the engineer hasn't saved one yet.
      if (!savedEta && destination && typeof destination !== 'string') {
        const { minutes } = estimateDriveMinutes(haversineKm(pos, destination))
        setEta(nowLocalIso(new Date(Date.now() + minutes * 60_000)))
      }
    } catch (err) {
      if (!silent) setLocError(err instanceof Error ? err.message : 'Could not get your location.')
    } finally {
      setLocating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await saveEta(eta, position)
      setSavedEta(eta)
      setMessage(`ETA ${formatTime(eta)} sent to the office.`)
      void tryPushPendingLocalChanges()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save the ETA.')
    } finally {
      setSaving(false)
    }
  }

  const etaDirty = savedEta !== eta

  return (
    <div style={{ margin: '0 16px 8px' }}>
      {/* ETA bar */}
      <div
        style={{
          background: 'var(--ion-color-success)',
          color: 'var(--ion-color-success-contrast)',
          borderRadius: 10,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 600 }}>
          <IonIcon icon={timeOutline} />
          ETA {formatTime(eta)}
          {savedEta && !etaDirty && <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.9 }}>saved</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IonDatetimeButton datetime="travel-eta" style={{ '--ion-color-base': '#fff' } as CSSProperties} />
          <IonButton size="small" color="light" onClick={() => void handleSave()} disabled={saving || (!etaDirty && !!savedEta)}>
            <IonIcon slot="start" icon={saveOutline} />
            Save
          </IonButton>
        </div>
      </div>
      <IonModal keepContentsMounted>
        <IonDatetime
          id="travel-eta"
          presentation="time"
          value={eta}
          minuteValues="0,5,10,15,20,25,30,35,40,45,50,55"
          onIonChange={(e) => {
            const v = e.detail.value
            if (typeof v === 'string') {
              // Keep today's date, take the picked time.
              const picked = new Date(v)
              const d = new Date()
              d.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
              setEta(nowLocalIso(d))
            }
          }}
        />
      </IonModal>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 2px' }}>
        <IonNote color={estimate ? 'success' : 'medium'} style={{ fontSize: 14 }}>
          {estimate
            ? `≈ ${estimate.minutes} min · ${formatKm(estimate.roadKm)} by road`
            : locating
              ? 'Getting your location…'
              : locError ?? (typeof destination === 'string' ? 'Site has no coordinates - set the ETA by hand.' : 'Location unknown')}
        </IonNote>
        <IonButton fill="clear" size="small" onClick={() => void locate()} disabled={locating}>
          <IonIcon slot="icon-only" icon={locateOutline} />
        </IonButton>
      </div>

      {message && (
        <IonText color="medium">
          <p style={{ fontSize: 13, margin: '0 0 6px' }}>{message}</p>
        </IonText>
      )}

      {/* Map */}
      {destination ? (
        <iframe
          title="Site location"
          src={mapEmbedUrl(destination)}
          style={{ width: '100%', height: 260, border: 0, borderRadius: 10, display: 'block' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <IonNote color="medium">No site address or coordinates on file.</IonNote>
      )}

      {destination && (
        <IonButton
          expand="block"
          color="primary"
          style={{ marginTop: 10 }}
          onClick={() => window.open(directionsUrl(destination, position), '_blank')}
        >
          <IonIcon slot="start" icon={navigateOutline} />
          Navigate with Maps
        </IonButton>
      )}
    </div>
  )
}
