/** Geolocation + distance helpers for the Travel To screen. No map SDK, no API key. */

export interface LatLng {
  lat: number
  lng: number
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Rough driving estimate from a straight-line distance, used when no routing
 * service is available: roads add ~30% to the crow-flies distance, and the
 * average speed falls from ~70 km/h on a long run to ~30 km/h in town.
 * Good enough to pre-fill the ETA the engineer can then adjust by hand.
 */
export function estimateDriveMinutes(straightKm: number): { minutes: number; roadKm: number } {
  const roadKm = straightKm * 1.3
  const avgKmh = roadKm > 50 ? 70 : roadKm > 10 ? 50 : 30
  return { minutes: Math.max(1, Math.round((roadKm / avgKmh) * 60)), roadKm }
}

/** One GPS fix from the device (browser or Capacitor WebView). Rejects when denied/unavailable. */
export function getCurrentPosition(timeoutMs = 15_000): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied.'
              : err.code === err.TIMEOUT
                ? 'Could not get a GPS fix in time.'
                : 'Location is unavailable right now.',
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

/** Google Maps embed URL for a pin - no API key needed for this basic embed. */
export function mapEmbedUrl(target: LatLng | string): string {
  const q = typeof target === 'string' ? encodeURIComponent(target) : `${target.lat},${target.lng}`
  return `https://www.google.com/maps?q=${q}&z=15&output=embed`
}

/** Turn-by-turn directions link - opens the Google Maps app on a phone, the web site elsewhere. */
export function directionsUrl(destination: LatLng | string, origin?: LatLng | null): string {
  const dest = typeof destination === 'string' ? encodeURIComponent(destination) : `${destination.lat},${destination.lng}`
  const from = origin ? `&origin=${origin.lat},${origin.lng}` : ''
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${from}&travelmode=driving`
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
