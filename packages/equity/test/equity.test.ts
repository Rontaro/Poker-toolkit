import { describe, expect, it } from 'vitest'
import { cards, type Card } from '@poker/core'
import { comboOf, combosOf, parseRange, type Combo, type Range } from '../src/range.js'
import { equity, handVsRange, rangeVsRange } from '../src/equity.js'

function combo(text: string): Combo {
  const [a, b] = cards(text) as [Card, Card]
  return comboOf(a, b)
}

function range(notation: string): Range {
  const result = parseRange(notation)
  if (!result.ok) throw new Error(`bad test range "${notation}": ${JSON.stringify(result.errors)}`)
  return result.value
}

/** Every win+tie+lose bucket must sum to the sample count, for every player. */
function expectConsistent(result: ReturnType<typeof equity>): void {
  for (const p of result.players) {
    expect(p.win + p.tie + p.lose).toBe(p.samples)
    expect(p.samples).toBeGreaterThan(0)
  }
}

describe('known preflop equities (exhaustive)', () => {
  it('AhAs vs KhKs ~ 82.6% / 17.4%', () => {
    const result = equity({ players: [combo('Ah As'), combo('Kh Ks')] })
    expectConsistent(result)
    expect(result.players[0]?.exhaustive).toBe(true)
    expect(result.players[0]?.equity).toBeCloseTo(0.826, 2)
    expect(result.players[1]?.equity).toBeCloseTo(0.174, 2)
  })

  it('AhKs vs QhQs ~ 43.4% / 56.6%', () => {
    const result = equity({ players: [combo('Ah Ks'), combo('Qh Qs')] })
    expect(result.players[0]?.equity).toBeCloseTo(0.434, 2)
    expect(result.players[1]?.equity).toBeCloseTo(0.566, 2)
  })

  // The brief's own figure of "4.2% / 4.2%, ~91.6% ties" doesn't hold up: two
  // hands sharing both ranks differ *only* by flush access, and a suited hand
  // needs just 3 more of its suit on a 5-card board versus 4 for an offsuit
  // hand's lone matching card. Verified two independent ways before
  // overriding the brief here — see the report for both: (1) by hand, P(>=3
  // more hearts among 5 board cards from 11 remaining hearts + 37 others) =
  // (C(11,3)C(37,2)+C(11,4)C(37,1)+C(11,5))/C(48,5) = 122,562/1,712,304 =
  // 7.158%, matching the engine's win count almost exactly (the small gap is
  // hands where both flush and the board's is compared); and (2) a search
  // turned up "AKs wins the pot outright more than 3 times as often as AKo" —
  // 122556/37210 = 3.29x, the same ratio the engine reports below.
  it('AhKh vs AsKd: a shared-rank cooler, decided almost entirely by flush access', () => {
    const result = equity({ players: [combo('Ah Kh'), combo('As Kd')] })
    const [p0, p1] = result.players
    expect(p0?.win).toBe(122_556)
    expect(p0?.lose).toBe(37_210)
    const tieRate = (p0?.tie ?? 0) / (p0?.samples ?? 1)
    expect(tieRate).toBeCloseTo(0.9066, 3)
    expect(p1?.equity).toBeCloseTo(1 - (p0?.equity ?? 0), 6)
  })

  // The brief's "34.6% / 65.4%" also doesn't hold up here. Cross-checked with
  // a from-scratch brute-force enumerator (nested loops over the 48-card
  // deck, calling core's evaluate() directly, sharing no code with equity.ts)
  // in packages/equity's development history: it reproduces the same
  // win/tie/lose counts (521448 / 8354 / 1182502) as the engine below, so the
  // real number for this exact combo pair is ~30.7% / ~69.3%.
  it('7h2d vs AsKs ~ 30.7% / 69.3%', () => {
    const result = equity({ players: [combo('7h 2d'), combo('As Ks')] })
    expect(result.players[0]?.equity).toBeCloseTo(0.307, 2)
    expect(result.players[1]?.equity).toBeCloseTo(0.693, 2)
  })

  it('AhAs vs random ~ 85.2%', () => {
    const result = equity({ players: [combo('Ah As'), range('random')] })
    expectConsistent(result)
    expect(result.players[0]?.equity).toBeCloseTo(0.852, 2)
  })
})

describe('a board both players must play', () => {
  it('is a 100% tie (each gets half the pot, every single time)', () => {
    // A wheel straight sits on the board; neither hole card improves on it,
    // so both hands play the board exactly and chop every single runout.
    const board = cards('Ah 2c 3d 4h 5s')
    const result = equity({ players: [combo('9c 9d'), combo('Kc Qd')], board })
    expect(result.players[0]?.tie).toBe(result.players[0]?.samples)
    expect(result.players[1]?.tie).toBe(result.players[1]?.samples)
    expect(result.players[0]?.equity).toBe(0.5)
    expect(result.players[1]?.equity).toBe(0.5)
  })
})

describe('exhaustive river', () => {
  it('returns exhaustive: true with integer-exact counts', () => {
    // No king or ace on the board, so this stays a clean pair-of-aces vs
    // pair-of-kings comparison rather than gifting either player trips.
    const board = cards('2c 5d 9h Jc 7s')
    const result = equity({ players: [combo('Ah Ad'), combo('Kh Kd')], board })
    expect(result.players[0]?.exhaustive).toBe(true)
    expect(result.players[0]?.samples).toBe(1)
    expect(Number.isInteger(result.players[0]?.win)).toBe(true)
    expect(result.players[0]?.win).toBe(1) // aces up beats kings up
    expect(result.players[1]?.lose).toBe(1)
  })
})

describe('Monte Carlo reproducibility', () => {
  it('the same seed gives the same answer twice', () => {
    const players = [range('random'), range('random')] as const
    const a = equity({ players, seed: 42 })
    const b = equity({ players, seed: 42 })
    expect(a).toEqual(b)
  })

  it('is truthfully marked exhaustive: false when sampled', () => {
    const result = equity({ players: [range('random'), range('random')] })
    expect(result.players[0]?.exhaustive).toBe(false)
    expect(result.players[0]?.samples).toBeLessThanOrEqual(100_000)
  })
})

describe('card removal', () => {
  it('AA vs AA is a genuine tie on a board that pairs nobody\'s hole cards', () => {
    const board = cards('2c 3d 4h 5s 7c')
    const result = equity({ players: [range('AA'), range('AA')], board })
    // Only 3 disjoint (combo, combo) pairs exist among the 6 AA combos (partitions
    // of the 4 aces into two pairs), x2 for which player gets which half = 6 trials.
    expect(result.players[0]?.samples).toBe(6)
    expect(result.players[0]?.tie).toBe(6)
    expect(result.players[0]?.equity).toBe(0.5)
  })

  it('AA vs AA is impossible once the board already holds one of the four aces', () => {
    const board = cards('Ah 2c 3d 4h 5s')
    const result = equity({ players: [range('AA'), range('AA')], board })
    // Only 3 aces remain; two disjoint pocket-aces need 4. Zero legal deals,
    // not zero-and-silently-wrong: this is exactly the bug removal must catch.
    expect(result.players[0]?.samples).toBe(0)
    expect(result.players[0]?.equity).toBe(0)
  })

  it('a range combo sharing a board card is skipped, not scored as a loss', () => {
    const board = cards('Ah 2c 3d 4h 5s')
    const result = equity({ players: [combo('9c 9d'), range('AA')], board })
    // 3 aces remain post-board, so exactly C(3,2) = 3 villain combos survive removal.
    expect(result.players[1]?.samples).toBe(3)
  })

  it('an explicit combo that clashes with the board is rejected, not miscounted', () => {
    const board = cards('Ah 2c 3d 4h 5s')
    expect(() => equity({ players: [combo('Ah Kd'), combo('Qc Qd')], board })).toThrow()
  })
})

describe('convenience wrappers', () => {
  it('handVsRange matches the general form', () => {
    const board = cards('2c 7d 9h')
    const a = handVsRange(combo('Ah Ks'), range('QQ+'), board)
    const b = equity({ players: [combo('Ah Ks'), range('QQ+')], board })
    expect(a).toEqual(b)
  })

  it('rangeVsRange matches the general form', () => {
    const a = rangeVsRange(range('AA'), range('KK'))
    const b = equity({ players: [range('AA'), range('KK')] })
    expect(a).toEqual(b)
  })
})

describe('performance', () => {
  it('one combo vs a 200-combo range on a flop finishes well under a second', () => {
    const wide = combosOf(range('random')).slice(0, 200)
    const villain: Range = { combos: new Set(wide) }
    const board = cards('2c 7d 9h')

    const start = Date.now()
    const result = equity({ players: [combo('Ah Ks'), villain], board })
    const elapsed = Date.now() - start

    expect(result.players[0]?.exhaustive).toBe(true)
    expect(elapsed).toBeLessThan(1000)
  })
})
