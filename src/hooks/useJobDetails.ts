import { useCallback, useEffect, useState } from 'react'
import {
  getCustomerById,
  getJobById,
  getSiteById,
  type LocalCustomer,
  type LocalJob,
  type LocalSite,
} from '../db/localData'

export interface JobDetails {
  job: LocalJob | null
  site: LocalSite | null
  customer: LocalCustomer | null
  loading: boolean
  /** Re-reads the job/site/customer from local SQLite (e.g. after a state change). */
  reload: () => Promise<void>
}

/** Loads a job plus its site and customer from the local tables. Shared by the job detail and WIP screens. */
export function useJobDetails(serRecId: number): JobDetails {
  const [job, setJob] = useState<LocalJob | null>(null)
  const [site, setSite] = useState<LocalSite | null>(null)
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const j = await getJobById(serRecId)
    setJob(j)
    const s = j?.siteId != null ? await getSiteById(j.siteId) : null
    setSite(s)
    setCustomer(s?.custId != null ? await getCustomerById(s.custId) : null)
    setLoading(false)
  }, [serRecId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { job, site, customer, loading, reload }
}

/** Re-renders the caller every `intervalMs` - drives the live timers on the WIP screen. */
export function useTicker(intervalMs = 1000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const handle = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(handle)
  }, [intervalMs, enabled])
  return now
}
