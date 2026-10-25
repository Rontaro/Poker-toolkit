import { homedir } from 'node:os'
import { join } from 'node:path'

import express, { type Request, type Response } from 'express'

import type { Hand, HandId } from '@poker/core'
import {
  compareToProfile,
  computeMetrics,
  profileFor,
  vpipPfrGap,
  type MetricResult,
} from '@poker/metrics'
import { analyse, buildPrompt, ALL_SELECTORS, PRESETS, renderHand } from '@poker/prompt-builder'
import { ALL_RULES, detectLeaks } from '@poker/rules'
import { SqliteHandStore, type HandFilter } from '@poker/store'
import { buildTimeline } from '@poker/timeline'

import { freeEquity, handEquity } from './equity-route.js'

/**
 * A thin read-only API over the store.
 *
 * It exists because the dashboard runs in a browser and the store runs on
 * SQLite, and for no other reason: there is no logic here that is not either
 * translating query strings into a `HandFilter` or handing a package's own
 * output straight back. Anything that looks like analysis belongs in a package,
 * where it can be tested without an HTTP client.
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

async function load(filter: HandFilter): Promise<Hand[]> {
  const hands: Hand[] = []
  for await (const hand of store.query(filter)) hands.push(hand)
  return hands
}

function withVerdicts(results: readonly MetricResult[], hand: Hand | undefined): unknown[] {
  const profile = hand === undefined ? undefined : profileFor(hand)
  return results.map((result) => ({ ...result, verdict: compareToProfile(result, profile) }))
}

app.get('/api/overview', async (request: Request, response: Response) => {
  const hands = await load(filterFrom(request.query))
  if (hands.length === 0) {
    response.json({ empty: true, hands: 0 })
    return
  }

  const [metrics, leaks, timeline] = await Promise.all([
    computeMetrics(hands, { byPosition: false }),
    detectLeaks(hands),
    buildTimeline(hands),
  ])

  response.json({
    empty: false,
    hands: hands.length,
    profile: profileFor(hands[0] as Hand) ?? null,
    metrics: withVerdicts(metrics.overall, hands[0]),
    gap: vpipPfrGap(metrics.overall) ?? null,
    leaks: leaks.byRule,
    totalCostBB: leaks.totalCostBB,
    bankroll: timeline.bankroll.map((point) => ({
      index: point.index,
      cumulativeBB: Number(point.cumulativeBB.toFixed(2)),
      rollingBB100: point.rollingBB100 === undefined ? null : Number(point.rollingBB100.toFixed(1)),
      playedAt: point.playedAt.toISOString(),
    })),
    sessions: timeline.sessions.length,
  })
})

app.get('/api/statistics', async (request: Request, response: Response) => {
  const hands = await load(filterFrom(request.query))
  const metrics = await computeMetrics(hands)
  const first = hands[0]

  response.json({
    hands: hands.length,
    profile: first === undefined ? null : (profileFor(first) ?? null),
    overall: withVerdicts(metrics.overall, first),
    byPosition: Object.fromEntries(
      Object.entries(metrics.byPosition).map(([position, results]) => [
        position,
        withVerdicts(results ?? [], first),
      ]),
    ),
  })
})

app.get('/api/leaks', async (request: Request, response: Response) => {
  const hands = await load(filterFrom(request.query))
  const sample = await analyse(hands)

  response.json({
    rules: ALL_RULES.map((rule) => ({ id: rule.id, label: rule.label, why: rule.why })),
    byRule: sample.report.byRule,
    events: sample.report.events.map((event) => {
      const hand = sample.hands.find((entry) => entry.context.hand.id === event.handId)
      return {
        ...event,
        playedAt: hand?.context.hand.playedAt.toISOString() ?? null,
        position: hand?.context.heroPosition ?? null,
        netBB: Number((hand?.context.heroNetBB() ?? 0).toFixed(2)),
      }
    }),
  })
})

app.get('/api/timeline', async (request: Request, response: Response) => {
  const hands = await load(filterFrom(request.query))
  const timeline = await buildTimeline(hands)
  response.json({
    ...timeline,
    bankroll: timeline.bankroll.map((point) => ({
      index: point.index,
      cumulativeBB: Number(point.cumulativeBB.toFixed(2)),
      rollingBB100: point.rollingBB100 === undefined ? null : Number(point.rollingBB100.toFixed(1)),
    })),
  })
})

/** One hand, replayed in the same prose the prompts use. */
app.get('/api/hand/:id', async (request: Request, response: Response) => {
  const id = request.params.id as HandId
  const hands = await load({ handIds: [id] })
  if (hands.length === 0) {
    response.status(404).json({ error: 'mano non trovata' })
    return
  }

  const sample = await analyse(hands)
  const analysed = sample.hands[0]
  if (analysed === undefined) {
    response.status(404).json({ error: 'mano non trovata' })
    return
  }

  response.json({
    id,
    replay: renderHand(analysed),
    leaks: analysed.leaks,
    notes: await store.listNotesForHand(id),
  })
})

app.get('/api/hand/:id/equity', async (request: Request, response: Response) => {
  await handEquity(request, response, (id) => load({ handIds: [id as HandId] }))
})

app.post('/api/equity', (request: Request, response: Response) => {
  freeEquity(request, response)
})

/** Hands the equity tab can preload, newest first. */
app.get('/api/hand-list', async (request: Request, response: Response) => {
  const hands = await load(filterFrom(request.query))
  response.json(
    hands
      .slice(-200)
      .reverse()
      .flatMap((hand) => {
        const hero = hand.seats.find((seat) => seat.isHero)
        if (hero?.holeCards === undefined) return []
        const board = hand.streets.flatMap((street) => [...street.board])
        return [
          {
            id: hand.id,
            playedAt: hand.playedAt.toISOString(),
            position: hero.position ?? null,
            hole: hero.holeCards.join(' '),
            board: board.join(' '),
          },
        ]
      }),
  )
})

app.get('/api/notes', async (request: Request, response: Response) => {
  const query = typeof request.query['q'] === 'string' ? request.query['q'] : ''
  response.json(await store.searchNotes(query))
})

app.post('/api/notes', async (request: Request, response: Response) => {
  const body = request.body as {
    handId: HandId
    source: 'claude' | 'me'
    content: string
    tags?: string[]
  }
  await store.insertNote({
    handId: body.handId,
    source: body.source,
    content: body.content,
    tags: body.tags ?? [],
    createdAt: new Date(),
  })
  response.json({ ok: true })
})

app.get('/api/study/options', (_request: Request, response: Response) => {
  response.json({
    selectors: ALL_SELECTORS.map((selector) => ({
      id: selector.id,
      label: selector.label,
      description: selector.description,
    })),
    presets: PRESETS.map((preset) => ({ id: preset.id, label: preset.label })),
    rules: ALL_RULES.map((rule) => ({ id: rule.id, label: rule.label })),
  })
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

  const hands =
    body.handIds !== undefined && body.handIds.length > 0
      ? await load({ handIds: body.handIds })
      : await load(filterFrom((body.filter ?? {}) as Request['query']))

  if (hands.length === 0) {
    response.status(400).json({ error: 'nessuna mano per questo filtro' })
    return
  }

  const sample = await analyse(hands)
  const built = await buildPrompt({
    sample,
    selector: body.selector ?? 'biggest-losses',
    preset: body.preset ?? 'full',
    ...(body.limit === undefined ? {} : { limit: body.limit }),
    ...(body.leakId === undefined ? {} : { leakId: body.leakId }),
  })

  response.json({
    text: built.text,
    characters: built.characters,
    hands: built.hands.map((hand) => ({
      id: hand.context.hand.id,
      netBB: Number(hand.context.heroNetBB().toFixed(2)),
      leaks: [...new Set(hand.leaks.map((leak) => leak.ruleId))],
    })),
  })
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
