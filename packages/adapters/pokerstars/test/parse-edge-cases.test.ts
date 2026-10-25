import { describe, expect, it } from 'vitest'
import { Money } from '@poker/core'

import { en } from '../src/locales/en.js'
import { expectParsed, parseFixture, potFromActions } from './helpers.js'

const eur = (text: string) => Money.fromDecimalString(text)

describe('a three-way all-in with a side pot', () => {
  const hand = expectParsed(parseFixture(en, 'en', 'synthetic', 'side-pot-three-way-all-in.txt'))

  it('keeps the main and side pots apart, each with its own winner', () => {
    expect(hand.results.pots).toEqual([
      { kind: 'main', index: 0, amount: eur('0.86'), winners: ['ShortStack'] },
      { kind: 'side', index: 1, amount: eur('0.95'), winners: ['BigStack'] },
    ])
  })

  it('charges the short stack only what they had', () => {
    // ShortStack raises to €0.30 with €0.02 already posted as the big blind,
    // so €0.28 leaves the stack, not €0.30.
    const shove = hand.streets[0]?.actions.find((a) => a.playerId === 'ShortStack' && a.kind === 'raise')
    expect(shove).toMatchObject({
      isAllIn: true,
      toAmount: eur('0.30'),
      contributed: eur('0.28'),
    })
    expect(hand.seats.find((s) => s.playerId === 'ShortStack')?.stack).toBe(eur('0.30'))
  })

  it('balances', () => {
    expect(potFromActions(hand)).toBe(hand.results.totalPot)
    expect(Money.sum(Object.values(hand.results.net))).toBe(Money.negate(hand.results.rake))
  })

  it('nets each player against what they actually put in', () => {
    expect(hand.results.net).toEqual({
      Hero: eur('-0.80'),
      ShortStack: eur('0.56'),
      BigStack: eur('0.15'),
    })
  })
})

describe('a split pot', () => {
  const hand = expectParsed(parseFixture(en, 'en', 'synthetic', 'split-pot.txt'))

  it('gives the pot two winners', () => {
    expect(hand.results.pots).toEqual([
      { kind: 'main', index: 0, amount: eur('0.12'), winners: ['Hero', 'Villain'] },
    ])
  })

  it('leaves both players level', () => {
    expect(hand.results.net).toEqual({ Hero: Money.ZERO, Villain: Money.ZERO })
  })
})

describe('a heads-up hand', () => {
  const result = parseFixture(en, 'en', 'synthetic', 'heads-up.txt')
  const hand = expectParsed(result)

  it('puts the button on the small blind', () => {
    expect(hand.seats.map((s) => [s.playerId, s.position])).toEqual([
      ['Hero', 'BTN'],
      ['Villain', 'BB'],
    ])
    expect(hand.streets[0]?.actions[0]).toMatchObject({ playerId: 'Hero', kind: 'post-sb' })
  })

  it('does not report the button and the small blind as a mismatch', () => {
    expect(result.ok && result.warnings).toEqual([])
  })

  it('charges a raise from the small blind only the difference', () => {
    const raise = hand.streets[0]?.actions.find((a) => a.kind === 'raise')
    expect(raise).toMatchObject({ toAmount: eur('0.06'), contributed: eur('0.05') })
  })
})

describe('a tournament hand with antes', () => {
  const result = parseFixture(en, 'en', 'tournament', 'mtt-with-antes.txt')
  const hand = expectParsed(result)

  it('reads the tournament, the level and the buy-in', () => {
    expect(hand.game.type).toBe('tournament')
    expect(hand.game.level).toBe(5)
    expect(hand.game.tournament).toEqual({
      siteTournamentId: '3492812891',
      buyIn: eur('0.91'),
      fee: eur('0.09'),
      currency: 'EUR',
    })
  })

  it('treats the blinds as chips, not currency', () => {
    expect(hand.game.stakes).toEqual({ sb: eur('75'), bb: eur('150'), currency: 'CHIPS' })
  })

  it('names all nine positions from the button', () => {
    expect(Object.fromEntries(hand.seats.map((s) => [s.seat, s.position]))).toEqual({
      1: 'HJ',
      2: 'CO',
      3: 'BTN',
      4: 'SB',
      5: 'BB',
      6: 'UTG',
      7: 'UTG1',
      8: 'MP1',
      9: 'MP2',
    })
  })

  it('counts antes into the pot but not towards the current bet', () => {
    const antes = hand.streets[0]?.actions.filter((a) => a.kind === 'post-ante') ?? []
    expect(antes).toHaveLength(9)
    expect(Money.sum(antes.map((a) => a.contributed))).toBe(eur('180'))

    // The hero raises to 375 over a big blind of 150; the ante they already
    // paid must not be credited against that.
    const raise = hand.streets[0]?.actions.find((a) => a.kind === 'raise')
    expect(raise).toMatchObject({ toAmount: eur('375'), contributed: eur('375') })
  })

  it('balances a pot of 1005 chips', () => {
    expect(hand.results.totalPot).toBe(eur('1005'))
    expect(potFromActions(hand)).toBe(eur('1005'))
    expect(hand.results.net['Hero']).toBe(eur('610'))
  })

  it('measures stacks in big blinds for comparison with cash', () => {
    const hero = hand.seats.find((s) => s.isHero)
    expect(Money.toBigBlinds(hero?.stack ?? Money.ZERO, hand.game.stakes.bb)).toBe(22.8)
  })
})
