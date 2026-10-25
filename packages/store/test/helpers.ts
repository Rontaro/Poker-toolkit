import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeText, en, parseHand, splitHands } from '@poker/adapter-pokerstars'
import { makeHandId, type Hand } from '@poker/core'

const here = dirname(fileURLToPath(import.meta.url))

const FIXTURES = join(
  here,
  '..',
  '..',
  'adapters',
  'pokerstars',
  '__fixtures__',
  'pokerstars',
)

/**
 * Real hands, parsed through the real adapter. The store's job is to give back
 * exactly what it was given, so testing it against hand-built objects would
 * miss the fields a genuine hand has and a made-up one does not.
 */
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

/**
 * A copy of a hand moved in time, with the id recomputed the way the parser
 * would. Used to build session timelines without inventing hand shapes.
 */
export function movedTo(hand: Hand, playedAt: Date, siteHandId: string): Hand {
  const local = playedAt.toISOString().slice(0, 19)
  return {
    ...hand,
    id: makeHandId({
      site: hand.source.site,
      siteHandId,
      tableName: hand.table.name,
      playedAtLocal: local,
    }),
    source: { ...hand.source, siteHandId },
    playedAt,
    playedAtLocal: local,
  }
}

export const MINUTE = 60_000
