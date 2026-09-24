import type { JobSlot } from '../db/crew'
import { formatTime } from './format'

/**
 * "Wed 24 Sep 09:00–18:00 · Thu 25 Sep 09:00–18:00" (mode 'full') or just
 * the time ranges (mode 'time', for a day agenda that already shows the
 * date). Up to three slots are spelled out, the rest summarised.
 */
export function formatSlots(slots: JobSlot[], mode: 'full' | 'time' = 'full'): string {
  const parts = slots.slice(0, 3).map((s) => {
    const range = s.start ? `${formatTime(s.start)}${s.end ? `–${formatTime(s.end)}` : ''}` : 'No time'
    if (mode === 'time' || !s.start) return range
    const d = new Date(s.start)
    const day = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
    return `${day} ${range}`
  })
  if (slots.length > 3) parts.push(`+${slots.length - 3} more`)
  return parts.join(' · ')
}
