import { describe, expect, it } from 'vitest'
import { Money } from '@poker/core'

import { en } from '../src/locales/en.js'
import { actionsOf, expectParsed, parseFixture, potFromActions } from './helpers.js'

const cash = (name: string) => parseFixture(en, 'en', 'cash', `${name}.txt`)

describe('a hand that folds round preflop', () => {
  const result = cash('fold-preflop-no-showdown')
  const hand = expectParsed(result)

  it('reads the header', () => {
    expect(hand.source).toEqual({
      site: 'pokerstars',
      siteHandId: '261973389667',
      language: 'en',
    })
    expect(hand.game).toEqual({
      type: 'cash',
      variant: 'nlhe',
      limit: 'nl',
      stakes: { sb: Money.fromDecimalString('0.01'), bb: Money.fromDecimalString('0.02'), currency: 'EUR' },
    })
    expect(hand.table).toEqual({ name: 'Bruwer VI', maxSeats: 6, buttonSeat: 6 })
  })

  it('keeps the local wall clock as well as the instant', () => {
    // Time-of-day analysis needs the time the player saw on screen, not UTC.
    expect(hand.playedAtLocal).toBe('2026-09-04T23:29:09')
    expect(hand.playedAtTz).toBe('CET')
    expect(hand.playedAt.toISOString()).toBe('2026-09-04T22:29:09.000Z')
  })

  it('identifies the hero from the dealt cards', () => {
    expect(hand.hero).toBe('Hero99')
    const hero = hand.seats.find((s) => s.isHero)
    expect(hero?.holeCards).toEqual(['2d', '5c'])
    expect(hero?.position).toBe('SB')
  })

  it('derives every position from the button', () => {
    expect(Object.fromEntries(hand.seats.map((s) => [s.playerId, s.position]))).toEqual({
      Hero99: 'SB',
      RailBird42: 'BB',
      NitFish07: 'UTG',
      ChipLeader3: 'MP',
      CallStation5: 'CO',
      ButtonAbuser: 'BTN',
    })
  })

  it('records the streets in order with the cards each one revealed', () => {
    expect(hand.streets.map((s) => s.name)).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(hand.streets.map((s) => s.board)).toEqual([[], ['4c', 'Qs', '5d'], ['7c'], ['Td']])
  })

  it('separates the printed raise size from the chips actually put in', () => {
    // "ChipLeader3: raises €0.04 to €0.06" from an unopened pot: nothing was
    // in front of them, so all six cents come off the stack.
    const raise = hand.streets[0]?.actions.find((a) => a.kind === 'raise')
    expect(raise?.amount).toBe(Money.fromDecimalString('0.04'))
    expect(raise?.toAmount).toBe(Money.fromDecimalString('0.06'))
    expect(raise?.contributed).toBe(Money.fromDecimalString('0.06'))
  })

  it('reads the whole preflop sequence', () => {
    expect(actionsOf(hand, 'preflop')).toEqual([
      'Hero99 post-sb 0.01',
      'RailBird42 post-bb 0.02',
      'NitFish07 fold',
      'ChipLeader3 raise 0.04->0.06',
      'CallStation5 fold',
      'ButtonAbuser fold',
      'Hero99 fold',
      'RailBird42 call 0.04',
    ])
  })

  it('returns the uncalled river bet', () => {
    expect(hand.results.uncalledReturns).toEqual([
      { playerId: 'RailBird42', amount: Money.fromDecimalString('0.14') },
    ])
  })

  it('balances the pot against the site totals', () => {
    expect(hand.results.totalPot).toBe(Money.fromDecimalString('0.29'))
    expect(hand.results.rake).toBe(Money.fromDecimalString('0.02'))
    expect(potFromActions(hand)).toBe(hand.results.totalPot)
    expect(hand.results.pots).toEqual([
      {
        kind: 'main',
        index: 0,
        amount: Money.fromDecimalString('0.27'),
        winners: ['RailBird42'],
      },
    ])
  })

  it('works out what each player won or lost', () => {
    expect(hand.results.net).toEqual({
      Hero99: Money.fromDecimalString('-0.01'),
      RailBird42: Money.fromDecimalString('0.13'),
      ChipLeader3: Money.fromDecimalString('-0.14'),
    })
  })

  it('has no showdown', () => {
    expect(hand.results.showdown).toEqual([])
  })

  it('parses without complaint', () => {
    expect(result.ok && result.warnings).toEqual([])
  })
})

describe('a hand that goes to showdown', () => {
  const hand = expectParsed(cash('showdown-mucked-cards'))

  it('records the cards shown', () => {
    expect(hand.results.showdown).toContainEqual({
      playerId: 'CallStation5',
      cards: ['Ac', '9h'],
      revealed: 'shown',
      description: 'two pair, Nines and Fours',
    })
  })

  it('recovers the cards of a player who mucked, from the summary', () => {
    // The action line only says "mucks hand"; the summary is where the cards
    // appear, and they are worth having for range work later.
    expect(hand.results.showdown).toContainEqual({
      playerId: 'ButtonAbuser',
      cards: ['6d', '6h'],
      revealed: 'mucked',
    })
    expect(hand.seats.find((s) => s.playerId === 'ButtonAbuser')?.holeCards).toEqual(['6d', '6h'])
  })
})

describe('a hand where the hero calls all-in and wins', () => {
  const hand = expectParsed(cash('hero-all-in-call-wins-at-showdown'))

  it('flags the all-in call and its real size', () => {
    // Villain bet €0.98 into a hero with €0.36 behind: the call is for the
    // stack, and €0.62 goes back.
    const call = hand.streets.find((s) => s.name === 'river')?.actions.at(-1)
    expect(call).toMatchObject({
      playerId: 'Hero99',
      kind: 'call',
      isAllIn: true,
      contributed: Money.fromDecimalString('0.36'),
    })
    expect(hand.results.uncalledReturns).toEqual([
      { playerId: 'ButtonAbuser', amount: Money.fromDecimalString('0.62') },
    ])
  })

  it('excludes the player who sat out from the hand', () => {
    const out = hand.seats.find((s) => s.playerId === 'CallStation5')
    expect(out).toMatchObject({ sittingOut: true, dealtIn: false })
    expect(out?.position).toBeUndefined()
  })

  it('shifts the positions of the five players who were dealt in', () => {
    expect(Object.fromEntries(hand.seats.filter((s) => s.dealtIn).map((s) => [s.playerId, s.position]))).toEqual({
      ButtonAbuser: 'SB',
      Hero99: 'BB',
      RailBird42: 'MP',
      NitFish07: 'CO',
      ChipLeader3: 'BTN',
    })
  })

  it('nets the hero up by the pot less their own investment', () => {
    expect(hand.results.net['Hero99']).toBe(Money.fromDecimalString('0.81'))
    expect(Money.sum(Object.values(hand.results.net))).toBe(Money.negate(hand.results.rake))
  })
})

describe('a hand whose summary mentions a seat that was never dealt in', () => {
  const result = cash('sitting-out-and-bare-summary-seat')
  const hand = expectParsed(result)

  it('ignores the bare summary seat without warning about it', () => {
    expect(result.ok && result.warnings).toEqual([])
    expect(hand.seats.filter((s) => s.dealtIn)).toHaveLength(5)
  })
})

describe('a hand where an opponent shoves and takes it down uncontested', () => {
  const hand = expectParsed(cash('opponent-all-in-uncalled'))

  it('marks the shove all-in and returns all of it', () => {
    const shove = hand.streets.find((s) => s.name === 'flop')?.actions.find((a) => a.kind === 'bet')
    expect(shove).toMatchObject({ playerId: 'ButtonAbuser', isAllIn: true, amount: Money.fromDecimalString('2.65') })
    expect(hand.results.uncalledReturns).toEqual([
      { playerId: 'ButtonAbuser', amount: Money.fromDecimalString('2.65') },
    ])
    // A returned shove costs nothing: the shover is up only the dead money.
    expect(hand.results.net['ButtonAbuser']).toBe(Money.fromDecimalString('0.24'))
  })
})

describe('a hand containing a client notice', () => {
  const result = cash('timed-out-and-uncalled-bet')

  it('treats "has timed out" as noise, not as an unknown action', () => {
    const hand = expectParsed(result)
    expect(result.ok && result.warnings).toEqual([])
    expect(hand.streets[0]?.actions.some((a) => a.playerId === 'RailBird42' && a.kind === 'fold')).toBe(true)
  })
})
