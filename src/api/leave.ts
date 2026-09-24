import { httpClient } from './httpClient'
import type { ApiResult } from './types'

/**
 * Leave application - online only (Utilities > Leave). The engineer's own
 * slice of the cloud Settings > Holiday Planner, on the SyncV2 controller.
 */

export interface LeaveTypeDto {
  id: number
  type: string
  colorCode: string
  isOrgLeave: boolean
  icon: string
}

export interface LeaveEntryDto {
  id: number
  holidayTypeId: number
  type: string
  colorCode: string
  leaveFrom: string
  leaveTo: string
  reason: string | null
}

export interface LeaveDto {
  types: LeaveTypeDto[]
  entries: LeaveEntryDto[]
}

export interface LeaveRequest {
  id?: number
  holidayTypeId: number
  /** "YYYY-MM-DDTHH:mm:ss" local time (whole days: 00:00:00 - 23:59:59). */
  leaveFrom: string
  leaveTo: string
  reason?: string | null
}

export async function getLeave(from: string, to: string): Promise<ApiResult<LeaveDto>> {
  const { data } = await httpClient.get<ApiResult<LeaveDto>>('/api/MobileV2/SyncV2/Leave', { params: { from, to } })
  return data
}

export async function saveLeave(request: LeaveRequest): Promise<ApiResult<LeaveEntryDto>> {
  const { data } = await httpClient.post<ApiResult<LeaveEntryDto>>('/api/MobileV2/SyncV2/Leave', request)
  return data
}

export async function deleteLeave(id: number): Promise<ApiResult<boolean>> {
  const { data } = await httpClient.delete<ApiResult<boolean>>(`/api/MobileV2/SyncV2/Leave/${id}`)
  return data
}
