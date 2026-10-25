/**
 * Pure route logic, lifted out of `@poker/dashboard`'s Express server so the
 * same functions can run inside a Web Worker later, with nothing from
 * Express (`Request`/`Response`, status codes, query-string parsing) in
 * sight.
 *
 * Every function here is `(store, ...typed params) => result` or
 * `Promise<result>`. Turning a query string into a `HandFilter`, and turning
 * a result back into an HTTP response, stays in
 * `packages/dashboard/server/index.ts` -- that part is Express-specific and
 * always will be.
 *
 * Error convention: a function whose Express handler used to answer with
 * `response.status(400/404).json({error})` returns `ApiResult<T>` (see
 * `errors.ts`) instead of throwing: `{ok: true, value}` on success,
 * `{ok: false, status, error}` on an *expected* failure -- an unparsable
 * range, a hand id that does not exist, a filter matching no hands. A thrown
 * exception still means a programming error, not a bad request. Every
 * function with this need (`getHand`, `getHandEquity`, `calculateFreeEquity`,
 * `runStudy`) uses this same shape, so the Express layer handles all of them
 * the same way:
 *
 * ```ts
 * const result = await getHand(store, id)
 * if (!result.ok) { response.status(result.status).json({ error: result.error }); return }
 * response.json(result.value)
 * ```
 */

export type { ApiResult } from './errors.js'

export { getOverview } from './overview.js'
export type { EmptyOverview, Overview, OverviewBankrollPoint, OverviewResult } from './overview.js'

export { getStatistics } from './statistics.js'
export type { Statistics } from './statistics.js'

export { getLeaks } from './leaks.js'
export type { LeakEventJson, LeaksResult } from './leaks.js'

export { getTimeline } from './timeline.js'
export type { TimelineBankrollPoint, TimelineResult } from './timeline.js'

export { getHand } from './hand.js'
export type { HandDetail } from './hand.js'

export { getHandEquity, DEFAULT_RANGE } from './hand-equity.js'
export type {
  HandEquityNoHole,
  HandEquityResult,
  HandEquityStreet,
  HandEquityWithHole,
} from './hand-equity.js'

export { calculateFreeEquity } from './free-equity.js'
export type { FreeEquityPlayer, FreeEquityResult } from './free-equity.js'

export { getHandList } from './hand-list.js'
export type { HandListItem } from './hand-list.js'

export { searchNotes, createNote } from './notes.js'
export type { NewNote } from './notes.js'

export { getStudyOptions, runStudy } from './study.js'
export type { RunStudyParams, StudyOptions, StudyResult } from './study.js'
