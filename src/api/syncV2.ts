import { httpClient } from './httpClient'
import type { ApiResult } from './types'
import type {
  SyncDownRequestDto,
  SyncUpRequestDto,
  SyncUpResponseDto,
  SyncV2ResponseDto,
} from './syncV2Types'

/**
 * POST /api/MobileV2/SyncV2/SyncDown - everything the app stores locally for
 * this engineer, either in full (`fullSync: true`) or as a delta since the
 * `syncDateTime` the server returned last time (`fullSync: false` +
 * `lastSyncTime` + the job/site ids the app already holds). See
 * SyncV2Controller.cs / SyncDownV2Request.cs on the API side.
 *
 * Call sites should not build the request by hand - use
 * db/localData.ts's syncDownAndStore(), which reads the local state the
 * request needs and applies the response.
 */
export async function syncDown(request: SyncDownRequestDto): Promise<ApiResult<SyncV2ResponseDto>> {
  const { data } = await httpClient.post<ApiResult<SyncV2ResponseDto>>(
    '/api/MobileV2/SyncV2/SyncDown',
    request,
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

/** POST /api/MobileV2/SyncV2/PauseJob */
export async function pauseJobOnServer(serRecID: number): Promise<ApiResult<boolean>> {
  const { data } = await httpClient.post<ApiResult<boolean>>(
    '/api/MobileV2/SyncV2/PauseJob',
    { serRecID },
  )
  return data
}

/**
 * POST /api/MobileV2/SyncV2/SyncUp - the single common endpoint the app
 * pushes ALL locally-saved data up through, regardless of which feature
 * produced it (see SyncUpRequestDto's doc comment for the tables and how
 * a future transaction type gets added without a new endpoint or a new
 * client function). See SyncV2Controller.SyncUp /
 * SyncV2Service.SyncUp on the API side; called from UtilitiesPage.handleSync
 * before the existing syncDown() pull.
 */
export async function syncUp(request: SyncUpRequestDto): Promise<ApiResult<SyncUpResponseDto>> {
  const { data } = await httpClient.post<ApiResult<SyncUpResponseDto>>(
    '/api/MobileV2/SyncV2/SyncUp',
    request,
  )
  return data
}
