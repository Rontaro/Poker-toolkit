import { homedir } from 'node:os'
import { join } from 'node:path'

import express, { type NextFunction, type Request, type Response } from 'express'

import { dispatch } from '@poker/api-core'
import { SqliteHandStore } from '@poker/store'

/**
 * A thin read-only API over the store.
 *
 * It exists because the dashboard runs in a browser and the store runs on
 * SQLite, and for no other reason. Every route but `/events` lives in
 * `@poker/api-core`'s `dispatch`, the same route table the Web Worker uses:
 * this file only turns an Express request into an `ApiRequest` and the
 * `ApiResponse` back into `response.status(...).json(...)`, so the server and
 * the Worker cannot answer the same request differently.
 */

const PORT = Number(process.env['PORT'] ?? 5181)
const DB = process.env['POKER_DB'] ?? join(homedir(), '.poker-toolkit', 'hands.db')

const store = new SqliteHandStore(DB)
const app = express()
app.use(express.json({ limit: '1mb' }))

/**
 * Live updates while `poker watch` is running.
 *
 * The store is the only thing both processes share, so this watches it rather
 * than trying to hear from the ingester: it reports the hand count and the
 * newest timestamp, and the browser refetches when either moves. Cruder than a
 * message bus and it needs no coupling between two processes that otherwise do
 * not know about each other.
 *
 * Registered before the `dispatch` handler below, which would otherwise answer
 * it with a 404: a stream is not a request/response pair and has no place in
 * the shared route table.
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

/** Only plain string values reach `dispatch`: Express's parser turns `?a=1&a=2`
 * into an array and `?a[b]=1` into an object, and every route already ignored
 * both, as if the key were absent. */
function stringsOf(query: Request['query']): Record<string, string> {
  const strings: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') strings[key] = value
  }
  return strings
}

/**
 * Everything else under `/api`. Mounted with `app.use`, so `request.path` is
 * already relative to `/api`. HEAD answers as GET, as Express's own `app.get`
 * routes did; any other method than GET/HEAD/POST falls through to Express's
 * default 404, as before. A thrown exception goes to Express's error handler
 * (a 500) instead of becoming an unhandled rejection.
 */
app.use('/api', (request: Request, response: Response, next: NextFunction) => {
  const method = request.method === 'HEAD' ? 'GET' : request.method
  if (method !== 'GET' && method !== 'POST') {
    next()
    return
  }

  dispatch(store, {
    method,
    path: request.path,
    query: stringsOf(request.query),
    body: request.body,
  }).then((result) => {
    response.status(result.status).json(result.body)
  }, next)
})

app.listen(PORT, () => {
  process.stdout.write(`API su http://localhost:${PORT}  (database: ${DB})\n`)
})
