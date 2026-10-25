import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import { makeHandId, type Hand } from '@poker/core'

import { buildTimeline } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__', 'pokerstars')

function realHands(...parts: string[]): Hand[] {
  const text = decodeText(readFileSync(join(FIXTURES, ...parts))).text
  return splitHands(text, [en]).flatMap((raw) => {
    const result = parseHand(raw, en)
    return result.ok ? [result.value] : []
  })
}

const session = () => realHands('en', 'cash', 'nl2-6max-session.txt')

/** A copy of a hand moved in time, with a net result forced onto the hero. */
function at(base: Hand, minutesFromStart: number, netBB: number, id: string): Hand {
  const playedAt = new Date(Date.UTC(2026, 8, 5, 20, 0, 0) + minutesFromStart * 60_000)
  const local = playedAt.toISOString().slice(0, 19)
  const hero = base.hero as string
  return {
    ...base,
    id: makeHandId({
      site: base.source.site,
      siteHandId: id,
      tableName: base.table.name,
      playedAtLocal: local,
    }),
    source: { ...base.source, siteHandId: id },
    playedAt,
    playedAtLocal: local,
    results: {
      ...base.results,
      net: { ...base.results.net, [hero]: (netBB * base.game.stakes.bb) as never },
    },
  }
}

describe('over a real session', () => {
  it('finds one sitting and counts every hand into it', async () => {
    const report = await buildTimeline(session())

    expect(report.hands).toBe(52)
    expect(report.sessions).toHaveLength(1)
    expect(report.sessions[0]?.hands).toBe(52)
    expect(report.sessions[0]?.startedAt.getTime()).toBeLessThan(
      report.sessions[0]?.endedAt.getTime() as number,
    )
  })

  it('buckets by the hour the player saw on their own clock', async () => {
    const report = await buildTimeline(session())

    // The session ran from 23:29 to just after midnight, local time.
    expect(report.byHourOfDay.map((bucket) => bucket.hour)).toEqual([0, 23])
    expect(report.byHourOfDay.reduce((sum, bucket) => sum + bucket.hands, 0)).toBe(52)
  })

  it('buckets by how deep into the session the hand was', async () => {
    const report = await buildTimeline(session(), { fatigueBucketHands: 25 })

    expect(report.byHandsIntoSession.map((b) => [b.fromHand, b.toHand])).toEqual([
      [1, 25],
      [26, 50],
      [51, 75],
    ])
    expect(report.byHandsIntoSession.reduce((sum, b) => sum + b.hands, 0)).toBe(52)
  })

  it('draws a bankroll curve that ends on the session result', async () => {
    const report = await buildTimeline(session())
    const hands = session()
    const total = hands.reduce(
      (sum, hand) => sum + (hand.results.net['Hero99'] ?? 0) / hand.game.stakes.bb,
      0,
    )

    expect(report.bankroll).toHaveLength(52)
    expect(report.bankroll.at(-1)?.cumulativeBB).toBeCloseTo(total, 6)
    expect(report.bankroll[0]?.index).toBe(1)
  })

  it('withholds a rolling win rate until the window is full', async () => {
    const report = await buildTimeline(session(), { rollingWindowHands: 20 })

    expect(report.bankroll.slice(0, 19).every((p) => p.rollingBB100 === undefined)).toBe(true)
    expect(report.bankroll[19]?.rollingBB100).toBeTypeOf('number')
  })
})

describe('the tilt detector', () => {
  const base = () => session()[0] as Hand

  it('compares the hands after a big loss with all the others', async () => {
    // A twenty hand quiet stretch, one forty big blind loss, then five hands.
    const hands = [
      ...Array.from({ length: 20 }, (_, i) => at(base(), i, 0, `10${i}`)),
      at(base(), 20, -40, '200'),
      ...Array.from({ length: 5 }, (_, i) => at(base(), 21 + i, 0, `30${i}`)),
    ]

    const report = await buildTimeline(hands, { tiltTriggerBB: 30, tiltWindowHands: 20 })

    expect(report.tilt.triggers).toBe(1)
    expect(report.tilt.handsAfterTriggers).toBe(5)
    expect(report.tilt.handsElsewhere).toBe(21)
  })

  it('does not fire on a loss under the trigger', async () => {
    const hands = [at(base(), 0, -20, '400'), at(base(), 1, 0, '401')]
    const report = await buildTimeline(hands, { tiltTriggerBB: 30 })

    expect(report.tilt.triggers).toBe(0)
    expect(report.tilt.handsAfterTriggers).toBe(0)
  })

  it('stops the window at the end of the session', async () => {
    // The big loss is the last hand of the night; the next session starts an
    // hour later and must not be counted as tilt.
    const hands = [
      at(base(), 0, -40, '500'),
      at(base(), 90, 0, '501'),
      at(base(), 91, 0, '502'),
    ]
    const report = await buildTimeline(hands, { tiltTriggerBB: 30, tiltWindowHands: 20 })

    expect(report.sessions).toHaveLength(2)
    expect(report.tilt.triggers).toBe(1)
    expect(report.tilt.handsAfterTriggers).toBe(0)
  })

  it('reports no ratio rather than infinity when there is no baseline', async () => {
    const hands = [at(base(), 0, -40, '600'), at(base(), 1, 0, '601')]
    const report = await buildTimeline(hands, { tiltTriggerBB: 30 })
    expect(report.tilt.ratio).toBeUndefined()
  })

  it('measures the win rate after a shock separately', async () => {
    const hands = [
      at(base(), 0, 0, '700'),
      at(base(), 1, -40, '701'),
      at(base(), 2, -10, '702'),
      at(base(), 3, -10, '703'),
    ]
    const report = await buildTimeline(hands, { tiltTriggerBB: 30, tiltWindowHands: 20 })

    expect(report.tilt.netBBAfterTriggers).toBeCloseTo(-20, 6)
    expect(report.tilt.bb100AfterTriggers).toBeCloseTo(-1000, 6)
  })
})

describe('sessions', () => {
  const base = () => session()[0] as Hand

  it('splits on a gap of more than thirty minutes', async () => {
    const hands = [at(base(), 0, 0, '800'), at(base(), 31, 0, '801')]
    expect((await buildTimeline(hands)).sessions).toHaveLength(2)
  })

  it('keeps hands exactly thirty minutes apart together', async () => {
    const hands = [at(base(), 0, 0, '810'), at(base(), 30, 0, '811')]
    expect((await buildTimeline(hands)).sessions).toHaveLength(1)
  })

  it('reports each sitting in order with its own result', async () => {
    const hands = [
      at(base(), 0, 5, '820'),
      at(base(), 5, -5, '821'),
      at(base(), 90, 10, '822'),
    ]
    const report = await buildTimeline(hands)

    expect(report.sessions).toHaveLength(2)
    expect(report.sessions[0]?.netBB).toBeCloseTo(0, 6)
    expect(report.sessions[1]?.netBB).toBeCloseTo(10, 6)
    expect(report.sessions[1]?.bb100).toBeCloseTo(1000, 6)
  })
})

describe('an empty sample', () => {
  it('answers with zeroes rather than dividing by them', async () => {
    const report = await buildTimeline([])
    expect(report).toMatchObject({ hands: 0, sessions: [], byHourOfDay: [], bankroll: [] })
    expect(report.tilt.triggers).toBe(0)
    expect(report.tilt.baselineLeakRate).toBe(0)
    expect(report.tilt.ratio).toBeUndefined()
  })
})
