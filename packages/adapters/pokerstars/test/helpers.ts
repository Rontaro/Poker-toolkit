import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { Money, type Chips, type Hand, type ParseResult } from '@poker/core'

import { decodeText } from '../src/encoding.js'
import type { PokerStarsLocale } from '../src/locale.js'
import { parseHand } from '../src/parse.js'
import { splitHands } from '../src/split.js'

const here = dirname(fileURLToPath(import.meta.url))

export const FIXTURES = join(here, '..', '__fixtures__', 'pokerstars')

/** Reads a fixture through the same decoding path the ingest will use. */
export function readFixture(...parts: string[]): string {
  return decodeText(readFileSync(join(FIXTURES, ...parts))).text
}

export function parseFixture(
  locale: PokerStarsLocale,
  ...parts: string[]
): ParseResult<Hand> {
  const text = readFixture(...parts)
  const [first] = splitHands(text, [locale])
  if (first === undefined) throw new Error(`Fixture ${parts.join('/')} contains no hand`)
  return parseHand(first, locale)
}

/** Parses and fails the test loudly if the hand did not come out clean. */
export function expectParsed(result: ParseResult<Hand>): Hand {
  if (!result.ok) {
    throw new Error(
      `Expected a parsed hand, got errors:\n${result.errors
        .map((e) => `  [${e.code}] ${e.message}${e.text ? ` -- ${e.text}` : ''}`)
        .join('\n')}`,
    )
  }
  return result.value
}

export function bb(hand: Hand, amount: Chips): number {
  return Money.toBigBlinds(amount, hand.game.stakes.bb)
}

export function actionsOf(hand: Hand, street: string): string[] {
  const found = hand.streets.find((s) => s.name === street)
  return (found?.actions ?? []).map((a) => {
    const size = a.amount === undefined ? '' : ` ${Money.toDecimalString(a.amount)}`
    const to = a.toAmount === undefined ? '' : `->${Money.toDecimalString(a.toAmount)}`
    return `${a.playerId} ${a.kind}${size}${to}${a.isAllIn ? ' all-in' : ''}`
  })
}

/** Total chips every player put in, minus what came back uncalled. */
export function potFromActions(hand: Hand): Chips {
  const contributed = Money.sum(
    hand.streets.flatMap((s) => s.actions.map((a) => a.contributed)),
  )
  const returned = Money.sum(hand.results.uncalledReturns.map((u) => u.amount))
  return Money.sub(contributed, returned)
}
