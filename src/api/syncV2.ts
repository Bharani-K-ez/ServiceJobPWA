import { httpClient } from './httpClient'
import type { ApiResult } from './types'
import type { SyncUpRequestDto, SyncUpResponseDto, SyncV2ResponseDto } from './syncV2Types'

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
 * produced it (only `assetService` exists today - see SyncUpRequestDto's
 * doc comment for how a future transaction type gets added here without a
 * new endpoint or a new client function). See SyncV2Controller.SyncUp /
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
