import { httpClient } from './httpClient'
import type { ApiResult } from './types'

/** Find Job - online only: open jobs that are NOT mine, paged; join one as a self-added crew member. */

export interface JobSearchItemDto {
  serRecID: number
  docketRef: string | null
  jobNumber: number | null
  probDesc: string | null
  scheduledDate: string | null
  dispatchStatus: string | null
  dispatchStatusDesc: string | null
  priority: number | null
  dispatchEng: string | null
  leadName: string | null
  siteID: number | null
  siteName: string | null
  address: string | null
  town: string | null
  postCode: string | null
  customerName: string | null
  crew: string[]
}

export interface JobSearchDto {
  items: JobSearchItemDto[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export const FIND_JOB_PAGE_SIZE = 25

export async function searchJobs(q: string, page: number, pageSize = FIND_JOB_PAGE_SIZE): Promise<ApiResult<JobSearchDto>> {
  const { data } = await httpClient.get<ApiResult<JobSearchDto>>('/api/MobileV2/SyncV2/Jobs/Search', {
    params: { q: q || undefined, page, pageSize },
  })
  return data
}

export async function joinCrew(serRecID: number): Promise<ApiResult<boolean>> {
  const { data } = await httpClient.post<ApiResult<boolean>>('/api/MobileV2/SyncV2/Crew/Join', { serRecID })
  return data
}
