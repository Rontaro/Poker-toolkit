import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import type { Hand } from '@poker/core'
import { SqliteHandStore } from '@poker/store'

const here = dirname(fileURLToPath(import.meta.url))

const FIXTURES = join(here, '..', '..', 'adapters', 'pokerstars', '__fixtures__', 'pokerstars')

/** Real hands, parsed through the real adapter -- same approach the other
 * packages' tests use, so a change to the parser's output shape is caught
 * here too, not just in `@poker/store`. */
export function realHands(...parts: string[]): Hand[] {
  const text = decodeText(readFileSync(join(FIXTURES, ...parts))).text
  return splitHands(text, [en]).flatMap((raw) => {
    const result = parseHand(raw, en)
    return result.ok ? [result.value] : []
  })
}

export function oneHand(): Hand {
  const [first] = realHands('en', 'cash', 'showdown-mucked-cards.txt')
  if (first === undefined) throw new Error('fixture produced no hand')
  return first
}

export function sessionHands(): Hand[] {
  return realHands('en', 'cash', 'nl2-6max-session.txt')
}

/** An empty, file-backed store never touches disk: everything lives in
 * SQLite's in-memory mode. */
export function openStore(): SqliteHandStore {
  return new SqliteHandStore(':memory:')
}

export async function storeWith(...hands: Hand[]): Promise<SqliteHandStore> {
  const store = openStore()
  await store.upsert(hands)
  return store
}
