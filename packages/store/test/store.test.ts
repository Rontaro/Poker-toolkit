import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Money, type Hand } from '@poker/core'
import { SESSION_GAP_MS, SqliteHandStore } from '../src/index.js'
import { MINUTE, movedTo, oneHand, realHands } from './helpers.js'

const open = (): SqliteHandStore => new SqliteHandStore(':memory:')

async function collect(iterable: AsyncIterable<Hand>): Promise<Hand[]> {
  const out: Hand[] = []
  for await (const hand of iterable) out.push(hand)
  return out
}

describe('migrations', () => {
  it('creates the schema from scratch', async () => {
    const store = open()
    await expect(store.stats({})).resolves.toMatchObject({ handCount: 0 })
    store.close()
  })

  it('is a no-op the second time a database is opened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-store-'))
    const path = join(dir, 'hands.db')
    try {
      const first = new SqliteHandStore(path)
      first.close()
      // Re-running an applied migration would fail on CREATE TABLE.
      const second = new SqliteHandStore(path)
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('round trip', () => {
  it('gives back exactly the hand it was given', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])

    const [back] = await collect(store.query({}))
    expect(back).toEqual(hand)
    store.close()
  })

  it('keeps money as exact integers and dates as dates', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])
    const [back] = await collect(store.query({}))

    expect(back?.playedAt).toBeInstanceOf(Date)
    expect(back?.playedAt.getTime()).toBe(hand.playedAt.getTime())
    expect(back?.results.rake).toBe(hand.results.rake)
    expect(Money.toDecimalString(back?.results.totalPot ?? Money.ZERO)).toBe(
      Money.toDecimalString(hand.results.totalPot),
    )
    expect(back?.game.stakes.bb).toBe(hand.game.stakes.bb)
    store.close()
  })

  it('survives a real session file whole', async () => {
    const store = open()
    const hands = realHands('en', 'cash', 'nl2-6max-session.txt')
    expect(hands).toHaveLength(52)

    await store.upsert(hands)
    const back = await collect(store.query({}))
    expect(back).toHaveLength(52)
    // query() orders by time, the fixture is already in time order.
    expect(back.map((h) => h.id)).toEqual(hands.map((h) => h.id))
    store.close()
  })
})

describe('upsert', () => {
  it('is idempotent, so re-importing a file changes nothing', async () => {
    const store = open()
    const hands = realHands('en', 'cash', 'nl2-6max-session.txt')

    await store.upsert(hands)
    const first = await store.stats({})
    await store.upsert(hands)
    const second = await store.stats({})

    expect(second).toEqual(first)
    expect(second.handCount).toBe(52)
    store.close()
  })

  it('overwrites a hand that is stored again with new content', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])
    await store.upsert([{ ...hand, table: { ...hand.table, name: 'Renamed' } }])

    const back = await collect(store.query({}))
    expect(back).toHaveLength(1)
    expect(back[0]?.table.name).toBe('Renamed')
    store.close()
  })
})

describe('filters', () => {
  const seed = async (store: SqliteHandStore): Promise<Hand[]> => {
    const hands = realHands('en', 'cash', 'nl2-6max-session.txt')
    await store.upsert(hands)
    return hands
  }

  it('filters by hero', async () => {
    const store = open()
    await seed(store)
    expect(await collect(store.query({ hero: 'Hero99' }))).toHaveLength(52)
    expect(await collect(store.query({ hero: 'Nobody' }))).toHaveLength(0)
    store.close()
  })

  it('filters by game type and site', async () => {
    const store = open()
    await seed(store)
    expect(await collect(store.query({ gameType: 'cash' }))).toHaveLength(52)
    expect(await collect(store.query({ gameType: 'tournament' }))).toHaveLength(0)
    expect(await collect(store.query({ site: 'pokerstars' }))).toHaveLength(52)
    expect(await collect(store.query({ site: 'winamax' }))).toHaveLength(0)
    store.close()
  })

  it('filters by table size as a range, never mixing 6-max with 9-max', async () => {
    const store = open()
    await seed(store)
    expect(await collect(store.query({ tableSize: { min: 6, max: 6 } }))).toHaveLength(52)
    expect(await collect(store.query({ tableSize: { min: 9 } }))).toHaveLength(0)
    expect(await collect(store.query({ tableSize: { max: 2 } }))).toHaveLength(0)
    store.close()
  })

  it('filters by stakes', async () => {
    const store = open()
    await seed(store)
    const bb = Money.fromDecimalString('0.02')
    expect(await collect(store.query({ stakes: { minBb: bb, maxBb: bb } }))).toHaveLength(52)
    expect(
      await collect(store.query({ stakes: { minBb: Money.fromDecimalString('0.10') } })),
    ).toHaveLength(0)
    store.close()
  })

  it('filters by date range', async () => {
    const store = open()
    const hands = await seed(store)
    const sorted = [...hands].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime())
    const cutoff = sorted[10]?.playedAt as Date

    const after = await collect(store.query({ from: cutoff }))
    expect(after.every((h) => h.playedAt >= cutoff)).toBe(true)
    expect(after.length).toBeLessThan(52)

    const before = await collect(store.query({ to: cutoff }))
    expect(before.every((h) => h.playedAt <= cutoff)).toBe(true)
    expect(after.length + before.length).toBe(53) // the cutoff hand is in both
    store.close()
  })

  it('filters by explicit hand ids', async () => {
    const store = open()
    const hands = await seed(store)
    const wanted = [hands[0]?.id, hands[5]?.id].filter((id) => id !== undefined)

    const back = await collect(store.query({ handIds: wanted }))
    expect(back.map((h) => h.id).sort()).toEqual([...wanted].sort())
    store.close()
  })

  it('pages with limit and offset', async () => {
    const store = open()
    await seed(store)
    const all = await collect(store.query({}))
    const page = await collect(store.query({ limit: 10, offset: 20 }))

    expect(page).toHaveLength(10)
    expect(page.map((h) => h.id)).toEqual(all.slice(20, 30).map((h) => h.id))
    store.close()
  })

  it('combines filters', async () => {
    const store = open()
    await seed(store)
    const back = await collect(
      store.query({ hero: 'Hero99', gameType: 'cash', tableSize: { min: 6, max: 6 }, limit: 3 }),
    )
    expect(back).toHaveLength(3)
    store.close()
  })
})

describe('sessions', () => {
  const timeline = (offsetsMinutes: readonly number[]): Hand[] => {
    const base = oneHand()
    const start = new Date('2026-09-04T20:00:00Z').getTime()
    return offsetsMinutes.map((minutes, i) =>
      movedTo(base, new Date(start + minutes * MINUTE), `90000000${i}`),
    )
  }

  it('keeps hands closer than the gap in one session', async () => {
    const store = open()
    await store.upsert(timeline([0, 10, 25, 40]))
    expect((await store.stats({})).sessionCount).toBe(1)
    store.close()
  })

  it('starts a new session after a gap longer than thirty minutes', async () => {
    const store = open()
    await store.upsert(timeline([0, 10, 45, 55]))
    expect((await store.stats({})).sessionCount).toBe(2)
    store.close()
  })

  it('treats exactly thirty minutes as the same session', async () => {
    const store = open()
    expect(SESSION_GAP_MS).toBe(30 * MINUTE)
    await store.upsert(timeline([0, 30]))
    expect((await store.stats({})).sessionCount).toBe(1)
    store.close()
  })

  it('gets the same answer when hands arrive out of order', async () => {
    const ordered = open()
    await ordered.upsert(timeline([0, 10, 45, 55]))
    const expected = (await ordered.stats({})).sessionCount
    ordered.close()

    // Files are imported in whatever order they are found, so a hand that
    // bridges two apparent sessions can land last.
    const shuffled = open()
    const hands = timeline([0, 10, 45, 55])
    await shuffled.upsert([hands[3] as Hand, hands[0] as Hand])
    await shuffled.upsert([hands[2] as Hand])
    await shuffled.upsert([hands[1] as Hand])

    expect((await shuffled.stats({})).sessionCount).toBe(expected)
    shuffled.close()
  })

  it('joins two apparent sessions when the hand between them arrives late', async () => {
    const store = open()
    const hands = timeline([0, 40, 20])

    await store.upsert([hands[0] as Hand, hands[1] as Hand])
    expect((await store.stats({})).sessionCount).toBe(2)

    await store.upsert([hands[2] as Hand])
    expect((await store.stats({})).sessionCount).toBe(1)
    store.close()
  })
})

describe('stats', () => {
  it('adds up the hero result over a real session', async () => {
    const store = open()
    const hands = realHands('en', 'cash', 'nl2-6max-session.txt')
    await store.upsert(hands)

    const stats = await store.stats({})
    const expectedNet = Money.sum(hands.map((h) => h.results.net['Hero99'] ?? Money.ZERO))

    expect(stats.handCount).toBe(52)
    expect(stats.heroHandsDealtIn).toBe(52)
    expect(stats.heroNetChips).toBe(expectedNet)
    expect(stats.heroNetBb).toBeCloseTo(
      Money.toBigBlinds(expectedNet, Money.fromDecimalString('0.02')),
      6,
    )
    expect(stats.bb100).toBeCloseTo((stats.heroNetBb / 52) * 100, 6)
    store.close()
  })

  it('reports the range of dates covered', async () => {
    const store = open()
    const hands = realHands('en', 'cash', 'nl2-6max-session.txt')
    await store.upsert(hands)

    const times = hands.map((h) => h.playedAt.getTime())
    const stats = await store.stats({})
    expect(stats.firstHandAt?.getTime()).toBe(Math.min(...times))
    expect(stats.lastHandAt?.getTime()).toBe(Math.max(...times))
    store.close()
  })

  it('answers safely for an empty database', async () => {
    const store = open()
    expect(await store.stats({})).toMatchObject({
      handCount: 0,
      sessionCount: 0,
      heroNetChips: 0,
      bb100: 0,
    })
    store.close()
  })

  it('respects the filter', async () => {
    const store = open()
    await store.upsert(realHands('en', 'cash', 'nl2-6max-session.txt'))
    expect((await store.stats({ gameType: 'tournament' })).handCount).toBe(0)
    expect((await store.stats({ limit: 5 })).handCount).toBe(52) // limit is for query, not stats
    store.close()
  })
})

describe('quarantine', () => {
  const entry = { raw: 'PokerStars Hand #1: broken', sourcePath: 'C:/hh/file.txt', issues: [] }

  it('stores a hand that could not be parsed, with its issues', async () => {
    const store = open()
    await store.quarantine([
      { ...entry, issues: [{ severity: 'error', code: 'pot-mismatch', message: 'nope' }] },
    ])

    const [row] = await store.listQuarantined()
    expect(row?.raw).toBe(entry.raw)
    expect(row?.sourcePath).toBe(entry.sourcePath)
    expect(row?.issues[0]?.code).toBe('pot-mismatch')
    expect(row?.hash).toHaveLength(64)
    store.close()
  })

  it('does not pile up rows when the same broken hand is seen again', async () => {
    const store = open()
    await store.quarantine([entry])
    await store.quarantine([entry])
    expect(await store.listQuarantined()).toHaveLength(1)
    store.close()
  })
})

describe('ingested files', () => {
  it('remembers what it has already read, so an unchanged file can be skipped', async () => {
    const store = open()
    const record = {
      path: 'C:/hh/file.txt',
      size: 1234,
      mtime: new Date('2026-09-04T22:00:00Z'),
      contentHash: 'abc',
    }
    await store.recordIngestedFile(record)

    const back = await store.getIngestedFile(record.path)
    expect(back).toMatchObject({ path: record.path, size: 1234, contentHash: 'abc' })
    expect(back?.mtime.getTime()).toBe(record.mtime.getTime())
    expect(await store.getIngestedFile('C:/hh/other.txt')).toBeUndefined()
    store.close()
  })

  it('updates the record when the file changes', async () => {
    const store = open()
    const base = { path: 'C:/hh/file.txt', mtime: new Date(0), size: 1, contentHash: 'a' }
    await store.recordIngestedFile(base)
    await store.recordIngestedFile({ ...base, size: 2, contentHash: 'b' })

    expect(await store.getIngestedFile(base.path)).toMatchObject({ size: 2, contentHash: 'b' })
    store.close()
  })
})

describe('notes', () => {
  it('stores and lists notes against a hand', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])

    await store.insertNote({
      handId: hand.id,
      source: 'claude',
      content: 'The turn bet is too small.',
      createdAt: new Date('2026-09-05T10:00:00Z'),
      tags: ['sizing', 'turn'],
    })

    const [note] = await store.listNotesForHand(hand.id)
    expect(note).toMatchObject({ source: 'claude', tags: ['sizing', 'turn'] })
    expect(note?.createdAt).toBeInstanceOf(Date)
    store.close()
  })

  it('searches by content and by tag', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])
    await store.insertNote({
      handId: hand.id,
      source: 'me',
      content: 'I keep min-betting the turn.',
      createdAt: new Date(),
      tags: ['sizing'],
    })

    expect(await store.searchNotes('min-betting')).toHaveLength(1)
    expect(await store.searchNotes('sizing')).toHaveLength(1)
    expect(await store.searchNotes('preflop')).toHaveLength(0)
    store.close()
  })

  it('does not let a wildcard in the query match everything', async () => {
    const store = open()
    const hand = oneHand()
    await store.upsert([hand])
    await store.insertNote({
      handId: hand.id,
      source: 'me',
      content: 'plain text',
      createdAt: new Date(),
      tags: [],
    })

    expect(await store.searchNotes('%')).toHaveLength(0)
    store.close()
  })
})

describe('persistence', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('keeps hands across a close and reopen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'poker-store-'))
    const path = join(dir, 'hands.db')
    const hand = oneHand()

    const first = new SqliteHandStore(path)
    await first.upsert([hand])
    first.close()

    const second = new SqliteHandStore(path)
    const [back] = await collect(second.query({}))
    expect(back).toEqual(hand)
    second.close()
  })
})
