import { httpClient } from './httpClient'
import type { ApiResult } from './types'
import type { SyncV2ResponseDto } from './syncV2Types'

/**
 * GET /api/MobileV2/SyncV2/SyncDown - this engineer's open jobs plus the
 * related sites/customers/assets. See SyncV2Controller.cs on the API side.
 */
export async function syncDown(): Promise<ApiResult<SyncV2ResponseDto>> {
  const { data } = await httpClient.get<ApiResult<SyncV2ResponseDto>>(
    '/api/MobileV2/SyncV2/SyncDown',
  )
  return data
}

/** POST /api/MobileV2/SyncV2/CompleteJob */
export async function completeJobOnServer(serRecID: number): Promise<ApiResult<boolean>> {
  const { data } = await httpClient.post<ApiResult<boolean>>(
    '/api/MobileV2/SyncV2/CompleteJob',
    { serRecID },
  )
  return data
}
