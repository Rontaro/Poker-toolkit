import { homedir } from 'node:os'
import { join } from 'node:path'

import express, { type Request, type Response } from 'express'

import {
  calculateFreeEquity,
  createNote,
  DEFAULT_RANGE,
  getHand,
  getHandEquity,
  getHandList,
  getLeaks,
  getOverview,
  getStatistics,
  getStudyOptions,
  getTimeline,
  runStudy,
  searchNotes,
} from '@poker/api-core'
import type { HandId } from '@poker/core'
import { SqliteHandStore, type HandFilter } from '@poker/store'

/**
 * A thin read-only API over the store.
 *
 * It exists because the dashboard runs in a browser and the store runs on
 * SQLite, and for no other reason: parsing a query string into a
 * `HandFilter`, calling the matching `@poker/api-core` function, and handing
 * its result to `response.json(...)` is all that happens here. The analysis
 * itself lives in `@poker/api-core` and the packages it calls, where it can
 * be tested without an HTTP client -- and, later, run inside a Web Worker
 * instead of this server.
 */

const PORT = Number(process.env['PORT'] ?? 5181)
const DB = process.env['POKER_DB'] ?? join(homedir(), '.poker-toolkit', 'hands.db')

const store = new SqliteHandStore(DB)
const app = express()
app.use(express.json({ limit: '1mb' }))

function filterFrom(query: Request['query']): HandFilter {
  const text = (key: string): string | undefined =>
    typeof query[key] === 'string' && query[key] !== '' ? (query[key] as string) : undefined
  const number = (key: string): number | undefined => {
    const value = text(key)
    return value === undefined ? undefined : Number(value)
  }

  const minSeats = number('minSeats')
  const maxSeats = number('maxSeats')
  const minBb = number('minBb')
  const maxBb = number('maxBb')
  const from = text('from')
  const to = text('to')

  return {
    ...(text('site') === undefined ? {} : { site: text('site') as string }),
    ...(text('hero') === undefined ? {} : { hero: text('hero') as string }),
    ...(text('gameType') === undefined ? {} : { gameType: text('gameType') as never }),
    ...(minSeats === undefined && maxSeats === undefined
      ? {}
      : {
          tableSize: {
            ...(minSeats === undefined ? {} : { min: minSeats }),
            ...(maxSeats === undefined ? {} : { max: maxSeats }),
          },
        }),
    ...(minBb === undefined && maxBb === undefined
      ? {}
      : {
          stakes: {
            ...(minBb === undefined ? {} : { minBb: minBb as never }),
            ...(maxBb === undefined ? {} : { maxBb: maxBb as never }),
          },
        }),
    ...(from === undefined ? {} : { from: new Date(from) }),
    ...(to === undefined ? {} : { to: new Date(to) }),
  }
}

/** Translates an `ApiResult` error into the same `response.status(...).json({error})`
 * every route used to write by hand; the success branch still goes through
 * `response.json(result.value)` at the call site so its type stays narrowed. */
function sendError(response: Response, result: { readonly status: 400 | 404; readonly error: string }): void {
  response.status(result.status).json({ error: result.error })
}

app.get('/api/overview', async (request: Request, response: Response) => {
  response.json(await getOverview(store, filterFrom(request.query)))
})

app.get('/api/statistics', async (request: Request, response: Response) => {
  response.json(await getStatistics(store, filterFrom(request.query)))
})

app.get('/api/leaks', async (request: Request, response: Response) => {
  response.json(await getLeaks(store, filterFrom(request.query)))
})

app.get('/api/timeline', async (request: Request, response: Response) => {
  response.json(await getTimeline(store, filterFrom(request.query)))
})

/** One hand, replayed in the same prose the prompts use. */
app.get('/api/hand/:id', async (request: Request, response: Response) => {
  const id = request.params.id as HandId
  const result = await getHand(store, id)
  if (!result.ok) {
    sendError(response, result)
    return
  }
  response.json(result.value)
})

app.get('/api/hand/:id/equity', async (request: Request, response: Response) => {
  const id = request.params.id as HandId
  const notation = typeof request.query['range'] === 'string' ? request.query['range'] : DEFAULT_RANGE
  const result = await getHandEquity(store, id, notation)
  if (!result.ok) {
    sendError(response, result)
    return
  }
  response.json(result.value)
})

app.post('/api/equity', (request: Request, response: Response) => {
  const body = request.body as { players?: string[]; board?: string; dead?: string }
  const result = calculateFreeEquity(body.players ?? [], body.board ?? '', body.dead ?? '')
  if (!result.ok) {
    sendError(response, result)
    return
  }
  response.json(result.value)
})

/** Hands the equity tab can preload, newest first. */
app.get('/api/hand-list', async (request: Request, response: Response) => {
  response.json(await getHandList(store, filterFrom(request.query)))
})

app.get('/api/notes', async (request: Request, response: Response) => {
  const query = typeof request.query['q'] === 'string' ? request.query['q'] : ''
  response.json(await searchNotes(store, query))
})

app.post('/api/notes', async (request: Request, response: Response) => {
  const body = request.body as {
    handId: HandId
    source: 'claude' | 'me'
    content: string
    tags?: string[]
  }
  await createNote(store, body)
  response.json({ ok: true })
})

app.get('/api/study/options', (_request: Request, response: Response) => {
  response.json(getStudyOptions())
})

app.post('/api/study', async (request: Request, response: Response) => {
  const body = request.body as {
    filter?: Record<string, string>
    selector?: string
    preset?: string
    limit?: number
    leakId?: string
    handIds?: HandId[]
  }

  const result = await runStudy(store, {
    filter: filterFrom((body.filter ?? {}) as Request['query']),
    ...(body.selector === undefined ? {} : { selector: body.selector }),
    ...(body.preset === undefined ? {} : { preset: body.preset }),
    ...(body.limit === undefined ? {} : { limit: body.limit }),
    ...(body.leakId === undefined ? {} : { leakId: body.leakId }),
    ...(body.handIds === undefined ? {} : { handIds: body.handIds }),
  })
  if (!result.ok) {
    sendError(response, result)
    return
  }
  response.json(result.value)
})

/**
 * Live updates while `poker watch` is running.
 *
 * The store is the only thing both processes share, so this watches it rather
 * than trying to hear from the ingester: it reports the hand count and the
 * newest timestamp, and the browser refetches when either moves. Cruder than a
 * message bus and it needs no coupling between two processes that otherwise do
 * not know about each other.
 */
app.get('/api/events', async (request: Request, response: Response) => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  let previous = ''
  const tick = async (): Promise<void> => {
    const stats = await store.stats({})
    const signature = `${stats.handCount}:${stats.lastHandAt?.toISOString() ?? ''}`
    if (signature !== previous) {
      previous = signature
      response.write(`data: ${JSON.stringify({ hands: stats.handCount })}\n\n`)
    }
  }

  await tick()
  const timer = setInterval(() => void tick(), 3000)
  request.on('close', () => clearInterval(timer))
})

app.listen(PORT, () => {
  process.stdout.write(`API su http://localhost:${PORT}  (database: ${DB})\n`)
})
