/**
 * How this package reports an error that Express used to turn into a 400 or
 * a 404.
 *
 * Every function here that can fail on bad *input* -- an unparsable range, a
 * hand id that does not exist, a filter matching no hands -- returns an
 * `ApiResult<T>` instead of throwing: `{ ok: true, value }` on success, or
 * `{ ok: false, status, error }` on an expected failure, carrying the HTTP
 * status the caller should use and the message Express already sent as
 * `{ error }`. The `status` travels with the result precisely so
 * `dashboard/server/index.ts` never has to re-derive "was this a bad request
 * or a missing hand" from the message text.
 *
 * A thrown exception stays reserved for programming errors (a bug here or in
 * a package this one calls), so the Express layer can let those crash loudly
 * instead of mistaking them for a handled 400.
 */
export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: 400 | 404; readonly error: string }

export function ok<T>(value: T): ApiResult<T> {
  return { ok: true, value }
}

export function fail(status: 400 | 404, error: string): ApiResult<never> {
  return { ok: false, status, error }
}
