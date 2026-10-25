import { describe, expect, it } from 'vitest'

import { breakEvenBluff, minimumDefence, potOddsRatio, requiredEquity, roundTo } from '../src/math.js'

describe('requiredEquity', () => {
  it('e quanto metti diviso quanto ci sara nel piatto', () => {
    // Trenta bb nel piatto, dieci per chiamare: una volta su quattro.
    expect(requiredEquity(30, 10)).toBeCloseTo(0.25, 6)
  })

  it('riproduce i quattro numeri da sapere a memoria', () => {
    // Piatto 100 prima della puntata, quindi il piatto affrontato e 100 + x.
    expect(requiredEquity(133, 33)).toBeCloseTo(0.199, 2) // un terzo
    expect(requiredEquity(150, 50)).toBeCloseTo(0.25, 6) // meta
    expect(requiredEquity(175, 75)).toBeCloseTo(0.3, 6) // tre quarti
    expect(requiredEquity(200, 100)).toBeCloseTo(0.333, 2) // piatto intero
  })

  it('e zero quando non c e niente da chiamare', () => {
    expect(requiredEquity(30, 0)).toBe(0)
  })
})

describe('potOddsRatio', () => {
  it('dice la stessa cosa in odds', () => {
    expect(potOddsRatio(30, 10)).toBe('3 : 1')
    expect(potOddsRatio(35, 10)).toBe('3,5 : 1')
    expect(potOddsRatio(30, 0)).toBe('—')
  })
})

describe('breakEvenBluff e minimumDefence', () => {
  it('sono uno il complemento dell altro', () => {
    for (const [pot, bet] of [
      [10, 5],
      [30, 30],
      [12, 9],
      [20, 15],
    ] as const) {
      expect(breakEvenBluff(pot, bet) + minimumDefence(pot, bet)).toBeCloseTo(1, 6)
    }
  })

  it('meta piatto deve funzionare una volta su tre', () => {
    expect(breakEvenBluff(10, 5)).toBeCloseTo(1 / 3, 6)
    expect(minimumDefence(10, 5)).toBeCloseTo(2 / 3, 6)
  })

  it('il piatto intero, una su due', () => {
    expect(breakEvenBluff(20, 20)).toBeCloseTo(0.5, 6)
    expect(minimumDefence(20, 20)).toBeCloseTo(0.5, 6)
  })

  it('senza puntata non c e niente da difendere', () => {
    expect(breakEvenBluff(20, 0)).toBe(0)
    expect(minimumDefence(20, 0)).toBe(1)
  })
})

describe('roundTo', () => {
  it('tiene i numeri leggibili', () => {
    expect(roundTo(12.4713, 0.5)).toBe(12.5)
    expect(roundTo(12.1, 1)).toBe(12)
  })
})
