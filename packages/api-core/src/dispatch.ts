import type { HandId } from '@poker/core'
import type { HandStore } from '@poker/store'

import type { ApiResult } from './errors.js'
import { filterFromQuery } from './filter-query.js'
import { calculateFreeEquity } from './free-equity.js'
import { getHand } from './hand.js'
import { DEFAULT_RANGE, getHandEquity } from './hand-equity.js'
import { getHandList } from './hand-list.js'
import { getLeaks } from './leaks.js'
import { createNote, searchNotes, type NewNote } from './notes.js'
import { getOverview } from './overview.js'
import { getStatistics } from './statistics.js'
import { getStudyOptions, runStudy } from './study.js'
import { getTimeline } from './timeline.js'

/**
 * The one table of routes, shared by the Express server and the Web Worker.
 *
 * Both answer the same requests the browser sends (`GET /overview?gameType=cash`,
 * `POST /study {...}`, ...), and they must answer them identically. Keeping a
 * route table in each would let the two drift apart one forgotten edit at a
 * time; here there is only one, and each transport just turns its own request
 * shape into an `ApiRequest` and an `ApiResponse` back into its own reply.
 *
 * `/events` (server-sent events) is deliberately absent: it is a long-lived
 * stream, not a request/response pair, and stays in the Express server.
 */

export interface ApiRequest {
  readonly method: 'GET' | 'POST'
  /** Without the `/api` prefix, e.g. `/overview` or `/hand/abc123/equity`.
   * Pass it raw (still percent-encoded): `dispatch` decodes path parameters
   * itself, as Express decodes `:id`, so a pre-decoded path would be decoded
   * twice. */
  readonly path: string
  readonly query?: Readonly<Record<string, string>>
  readonly body?: unknown
}

export interface ApiResponse {
  /** 200, or the 400/404 of an expected failure or an unknown route. */
  readonly status: number
  /** What Express sends through `response.json(...)`. It is not yet
   * serialised: a value may still hold a `Date` that `JSON.stringify` turns
   * into an ISO string, so a transport that does not go through JSON (a
   * Worker's `postMessage`) must serialise it to answer the same. */
  readonly body: unknown
}

interface RouteContext {
  readonly params: Readonly<Record<string, string>>
  readonly query: Readonly<Record<string, string>>
  readonly body: unknown
}

interface Route {
  readonly method: ApiRequest['method']
  readonly pattern: RegExp
  readonly keys: readonly string[]
  readonly handle: (store: HandStore, context: RouteContext) => ApiResponse | Promise<ApiResponse>
}

const NOT_FOUND: ApiResponse = { status: 404, body: { error: 'route non trovata' } }

function json(value: unknown): ApiResponse {
  return { status: 200, body: value }
}

function fromResult<T>(result: ApiResult<T>): ApiResponse {
  return result.ok ? json(result.value) : { status: result.status, body: { error: result.error } }
}

/** A request body read as an object of optional fields: Express always hands
 * over an object (`{}` when there was no JSON body); a Worker might not. */
function bodyOf<T>(body: unknown): Partial<T> {
  return (body ?? {}) as Partial<T>
}

/**
 * Compiles `/hand/:id/equity` the way Express 4 does by default: literal
 * segments case-insensitive, a parameter is one non-empty segment, and one
 * trailing slash is tolerated.
 */
function route(method: Route['method'], path: string, handle: Route['handle']): Route {
  const keys: string[] = []
  const source = path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
      keys.push(segment.slice(1))
      return '([^/]+?)'
    })
    .join('/')
  return { method, pattern: new RegExp(`^${source}/?$`, 'i'), keys, handle }
}

const ROUTES: readonly Route[] = [
  route('GET', '/overview', (store, { query }) => getOverview(store, filterFromQuery(query)).then(json)),
  route('GET', '/statistics', (store, { query }) => getStatistics(store, filterFromQuery(query)).then(json)),
  route('GET', '/leaks', (store, { query }) => getLeaks(store, filterFromQuery(query)).then(json)),
  route('GET', '/timeline', (store, { query }) => getTimeline(store, filterFromQuery(query)).then(json)),

  /** One hand, replayed in the same prose the prompts use. */
  route('GET', '/hand/:id', async (store, { params }) => fromResult(await getHand(store, params['id'] as HandId))),

  route('GET', '/hand/:id/equity', async (store, { params, query }) => {
    return fromResult(await getHandEquity(store, params['id'] as HandId, query['range'] ?? DEFAULT_RANGE))
  }),

  route('POST', '/equity', (_store, { body }) => {
    const { players, board, dead } = bodyOf<{ players: string[]; board: string; dead: string }>(body)
    return fromResult(calculateFreeEquity(players ?? [], board ?? '', dead ?? ''))
  }),

  /** Hands the equity tab can preload, newest first. */
  route('GET', '/hand-list', (store, { query }) => getHandList(store, filterFromQuery(query)).then(json)),

  route('GET', '/notes', async (store, { query }) => {
    return json(await searchNotes(store, query['q'] ?? ''))
  }),

  route('POST', '/notes', async (store, { body }) => {
    await createNote(store, bodyOf<NewNote>(body) as NewNote)
    return json({ ok: true })
  }),

  route('GET', '/study/options', () => json(getStudyOptions())),

  route('POST', '/study', async (store, { body }) => {
    const params = bodyOf<{
      filter: Record<string, unknown>
      selector: string
      preset: string
      limit: number
      leakId: string
      handIds: HandId[]
    }>(body)
    return fromResult(
      await runStudy(store, {
        filter: filterFromQuery(params.filter ?? {}),
        ...(params.selector === undefined ? {} : { selector: params.selector }),
        ...(params.preset === undefined ? {} : { preset: params.preset }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.leakId === undefined ? {} : { leakId: params.leakId }),
        ...(params.handIds === undefined ? {} : { handIds: params.handIds }),
      }),
    )
  }),
]

/**
 * Answers one request against the store.
 *
 * An unknown route (or a known path with the wrong method) is a 404
 * `{error: 'route non trovata'}`; an `ApiResult` failure becomes its own
 * status with `{error}`. An unexpected exception is *not* caught here: it
 * propagates to the caller, which decides what a programming error looks like
 * on its transport.
 */
export async function dispatch(store: HandStore, request: ApiRequest): Promise<ApiResponse> {
  for (const candidate of ROUTES) {
    if (candidate.method !== request.method) continue
    const match = candidate.pattern.exec(request.path)
    if (match === null) continue

    const params: Record<string, string> = {}
    for (const [index, key] of candidate.keys.entries()) {
      const raw = match[index + 1] ?? ''
      try {
        params[key] = decodeURIComponent(raw)
      } catch {
        return { status: 400, body: { error: `Failed to decode param '${raw}'` } }
      }
    }

    return candidate.handle(store, { params, query: request.query ?? {}, body: request.body })
  }
  return NOT_FOUND
}
