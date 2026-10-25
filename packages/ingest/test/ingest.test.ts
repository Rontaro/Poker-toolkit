import { copyFileSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SqliteHandStore } from '@poker/store'
import type { Hand } from '@poker/core'

import { ingest, listFiles } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__', 'pokerstars')

let dir: string
let store: SqliteHandStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'poker-ingest-'))
  store = new SqliteHandStore(':memory:')
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

function drop(name: string, ...fixture: string[]): string {
  const target = join(dir, name)
  copyFileSync(join(FIXTURES, ...fixture), target)
  return target
}

async function stored(): Promise<Hand[]> {
  const hands: Hand[] = []
  for await (const hand of store.query({})) hands.push(hand)
  return hands
}

describe('a single pass', () => {
  it('reads a real session file into the store', async () => {
    drop('session.txt', 'en', 'cash', 'nl2-6max-session.txt')

    const result = await ingest({ store, paths: [dir] })

    expect(result).toMatchObject({ filesSeen: 1, filesRead: 1, handsParsed: 52, handsQuarantined: 0 })
    expect(await stored()).toHaveLength(52)
  })

  it('reads Italian and English files in the same folder', async () => {
    drop('en.txt', 'en', 'cash', 'showdown-mucked-cards.txt')
    drop('it.txt', 'it', 'cash', 'showdown-mucked-cards.txt')

    const result = await ingest({ store, paths: [dir] })

    expect(result.handsParsed).toBe(2)
    // Same hand in two languages: one identity, so the store holds one row.
    expect(await stored()).toHaveLength(1)
  })

  it('finds files in nested folders and ignores everything else', async () => {
    drop('session.txt', 'en', 'cash', 'nl2-6max-session.txt')
    writeFileSync(join(dir, 'notes.md'), 'not a hand history')

    expect(await listFiles(dir)).toHaveLength(1)
    expect(await ingest({ store, paths: [dir] })).toMatchObject({ filesSeen: 1 })
  })

  it('treats a missing folder as empty rather than as an error', async () => {
    const result = await ingest({ store, paths: [join(dir, 'nope')] })
    expect(result).toMatchObject({ filesSeen: 0, filesRead: 0 })
  })
})

describe('doing it again', () => {
  it('skips a file that has not changed', async () => {
    drop('session.txt', 'en', 'cash', 'nl2-6max-session.txt')

    await ingest({ store, paths: [dir] })
    const second = await ingest({ store, paths: [dir] })

    expect(second).toMatchObject({ filesRead: 0, filesSkipped: 1, handsParsed: 0 })
    expect(await stored()).toHaveLength(52)
  })

  it('reads it again when asked to', async () => {
    drop('session.txt', 'en', 'cash', 'nl2-6max-session.txt')

    await ingest({ store, paths: [dir] })
    const forced = await ingest({ store, paths: [dir], force: true })

    expect(forced).toMatchObject({ filesRead: 1, handsParsed: 52 })
    // Re-reading stores the same hands under the same ids: no duplicates.
    expect(await stored()).toHaveLength(52)
  })

  it('reads a file that grew, and stores only what is new', async () => {
    // A session in progress: the client appends to the same file all evening.
    const source = readFileSync(join(FIXTURES, 'en', 'cash', 'nl2-6max-session.txt'), 'utf-8')
    const split = source.indexOf('PokerStars Hand #261973517707')
    expect(split).toBeGreaterThan(0)

    const path = join(dir, 'live.txt')
    writeFileSync(path, source.slice(0, split))
    const first = await ingest({ store, paths: [dir] })
    const partial = (await stored()).length
    expect(partial).toBeLessThan(52)
    expect(first.handsParsed).toBe(partial)

    writeFileSync(path, source)
    // Windows timestamps have coarse resolution; make the change unambiguous.
    const later = new Date(Date.now() + 2000)
    utimesSync(path, later, later)

    const second = await ingest({ store, paths: [dir] })
    expect(second.filesRead).toBe(1)
    expect(await stored()).toHaveLength(52)
  })
})

describe('files it cannot use', () => {
  it('sets aside a hand that will not parse and keeps the rest', async () => {
    const source = readFileSync(join(FIXTURES, 'en', 'cash', 'nl2-6max-session.txt'), 'utf-8')
    const damaged = source.replace('ChipLeader3: raises €0.04 to €0.06', 'ChipLeader3: wibbles €0.04')
    writeFileSync(join(dir, 'damaged.txt'), damaged)

    const result = await ingest({ store, paths: [dir] })

    expect(result.handsQuarantined).toBe(1)
    expect(result.handsParsed).toBe(51)
    expect(await stored()).toHaveLength(51)

    const [held] = await store.listQuarantined()
    expect(held?.sourcePath).toBe(join(dir, 'damaged.txt'))
    expect(held?.issues.map((issue) => issue.code)).toContain('pot-mismatch')
  })

  it('does not pile up quarantine rows when the same broken file is re-read', async () => {
    const source = readFileSync(join(FIXTURES, 'en', 'cash', 'nl2-6max-session.txt'), 'utf-8')
    writeFileSync(
      join(dir, 'damaged.txt'),
      source.replace('ChipLeader3: raises €0.04 to €0.06', 'ChipLeader3: wibbles €0.04'),
    )

    await ingest({ store, paths: [dir] })
    await ingest({ store, paths: [dir], force: true })

    expect(await store.listQuarantined()).toHaveLength(1)
  })

  it('records an unrecognised file so it is not re-read every run', async () => {
    writeFileSync(join(dir, 'shopping.txt'), 'milk\nbread\n')

    const first = await ingest({ store, paths: [dir] })
    expect(first.filesUnrecognised).toEqual([join(dir, 'shopping.txt')])
    expect(first.handsParsed).toBe(0)

    const second = await ingest({ store, paths: [dir] })
    expect(second.filesSkipped).toBe(1)
  })
})

describe('progress', () => {
  it('reports what it is doing', async () => {
    drop('session.txt', 'en', 'cash', 'nl2-6max-session.txt')

    const events: string[] = []
    await ingest({ store, paths: [dir], onProgress: (event) => events.push(event.kind) })
    expect(events).toEqual(['file-start', 'file-done'])

    const again: string[] = []
    await ingest({ store, paths: [dir], onProgress: (event) => again.push(event.kind) })
    expect(again).toEqual(['file-start', 'file-skipped'])
  })
})
