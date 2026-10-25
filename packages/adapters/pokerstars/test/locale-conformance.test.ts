import { describe, expect, it } from 'vitest'
import { Money, type Hand } from '@poker/core'

import { LOCALES } from '../src/index.js'
import type { PokerStarsLocale } from '../src/locale.js'
import { expectParsed, parseFixture, potFromActions } from './helpers.js'

/**
 * One suite, run identically against every locale pack.
 *
 * Adding a language means dropping a translated fixture next to the others and
 * a pack into `src/locales`; these assertions then validate it without a line
 * of new test code. The strongest of them is the last: the same hand written in
 * two languages must parse into byte-identical results, hand id included.
 */

/** Fixtures that exist for every language, by name. */
const SHARED = [
  'fold-preflop-no-showdown',
  'showdown-mucked-cards',
  'hero-all-in-call-wins-at-showdown',
  'sitting-out-and-bare-summary-seat',
] as const

/** Everything a parse must satisfy, whatever language it came from. */
function assertWellFormed(hand: Hand): void {
  expect(hand.id).toHaveLength(32)
  expect(hand.source.site).toBe('pokerstars')
  expect(hand.seats.length).toBeGreaterThan(1)
  expect(hand.streets[0]?.name).toBe('preflop')

  // Positions exist for exactly the players who were dealt in, and are unique.
  const positions = hand.seats.filter((s) => s.dealtIn).map((s) => s.position)
  expect(positions.every((p) => p !== undefined)).toBe(true)
  expect(new Set(positions).size).toBe(positions.length)
  expect(hand.seats.filter((s) => !s.dealtIn).every((s) => s.position === undefined)).toBe(true)

  // Whoever posted the blinds must be the seats we called SB and BB.
  const posts = hand.streets[0]?.actions ?? []
  const sb = posts.find((a) => a.kind === 'post-sb')
  const bb = posts.find((a) => a.kind === 'post-bb')
  const positionOf = (player: string) => hand.seats.find((s) => s.playerId === player)?.position
  if (sb) expect(positionOf(sb.playerId)).toBe(hand.seats.filter((s) => s.dealtIn).length === 2 ? 'BTN' : 'SB')
  if (bb) expect(positionOf(bb.playerId)).toBe('BB')

  // The money adds up, in both directions.
  expect(potFromActions(hand)).toBe(hand.results.totalPot)
  const paidOut = Money.sum(hand.results.pots.map((p) => p.amount))
  expect(Money.add(paidOut, hand.results.rake)).toBe(hand.results.totalPot)
  expect(Money.sum(Object.values(hand.results.net))).toBe(Money.negate(hand.results.rake))

  // Nothing may leave the pot that never went in.
  expect(hand.results.rake).toBeGreaterThanOrEqual(0)
  for (const action of hand.streets.flatMap((s) => s.actions)) {
    expect(action.contributed).toBeGreaterThanOrEqual(0)
  }

  // Every card is canonical and no card appears twice.
  const seen = hand.streets.flatMap((s) => s.board)
  expect(new Set(seen).size).toBe(seen.length)
  expect(seen.every((c) => /^[2-9TJQKA][cdhs]$/.test(c))).toBe(true)
}

for (const locale of LOCALES) {
  describe(`locale: ${locale.language}`, () => {
    for (const name of SHARED) {
      it(`parses ${name} into a well-formed hand`, () => {
        const result = parseFixture(locale as PokerStarsLocale, locale.language, 'cash', `${name}.txt`)
        const hand = expectParsed(result)
        expect(result.ok && result.warnings).toEqual([])
        expect(hand.source.language).toBe(locale.language)
        assertWellFormed(hand)
      })
    }
  })
}

/** Drops the fields that are meant to differ between languages. */
function withoutLanguage(hand: Hand): unknown {
  return JSON.parse(
    JSON.stringify(hand, (key, value) =>
      key === 'language' || key === 'handDescription' || key === 'description' ? undefined : value,
    ),
  )
}

describe('cross-locale equivalence', () => {
  const [reference, ...others] = LOCALES
  if (reference === undefined) throw new Error('no locales registered')

  for (const other of others) {
    for (const name of SHARED) {
      it(`${name} parses the same in ${reference.language} and ${other.language}`, () => {
        const a = expectParsed(
          parseFixture(reference as PokerStarsLocale, reference.language, 'cash', `${name}.txt`),
        )
        const b = expectParsed(
          parseFixture(other as PokerStarsLocale, other.language, 'cash', `${name}.txt`),
        )

        // Same hand, same identity: the id must not depend on the language the
        // client happened to be set to when the file was written.
        expect(b.id).toBe(a.id)
        expect(withoutLanguage(b)).toEqual(withoutLanguage(a))
      })
    }
  }
})

describe('locale packs', () => {
  for (const locale of LOCALES) {
    it(`${locale.language} declares every token the parser needs`, () => {
      expect(locale.header.prefixes.length).toBeGreaterThan(0)
      expect(locale.detection.length).toBeGreaterThan(1)
      for (const [name, templates] of Object.entries(locale.actions)) {
        // A locale may legitimately have no straddle, but nothing else.
        if (name !== 'straddle') expect(templates.length, `actions.${name}`).toBeGreaterThan(0)
      }
      expect(new Set(Object.values(locale.streets)).size).toBe(6)
    })
  }

  it('gives every locale a distinct header prefix', () => {
    const prefixes = LOCALES.flatMap((l) => l.header.prefixes)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })
})
