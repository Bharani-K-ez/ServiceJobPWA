/**
 * Mirrors the backend's `Result<T>` / `IResult<T>` response envelope used
 * across ezServiceHUB.WebAPI controllers (see e.g. CustomerController,
 * AccountController). Every endpoint built on that base returns this shape,
 * so model it once here instead of re-declaring it per call site.
 */
export interface ApiResult<T> {
  hasData: boolean
  data: T | null
  okMessage: string | null
  failMessage: string | null
  error: unknown
}

/**
 * Body for POST /api/Account/Login (AccountController.Login).
 * `code` is the tenant company code - the same value the tenant
 * middleware expects as the `?code=` query parameter on every request.
 */
export interface LoginRequest {
  username: string
  password: string
  code: string
  userEmail?: string
}
