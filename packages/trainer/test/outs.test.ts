import { describe, expect, it } from 'vitest'

import { cards } from '@poker/core'

import { analyseOuts, countOuts, ruleOfTwoAndFour } from '../src/outs.js'

describe('countOuts', () => {
  it('conta il colore e le carte alte, e niente altro', () => {
    // Il caso da manuale: progetto di colore massimo contro coppia massima.
    const result = countOuts(cards('Ah Kh'), cards('Qs Jd'), cards('Qh 7h 2c'))

    expect(result.ahead).toBe(false)
    expect(result.outs).toHaveLength(15)
    expect(result.kinds).toEqual([
      { makes: 'colore', count: 9 },
      { makes: 'coppia massima', count: 6 },
    ])
    expect(result.villainNow).toBe('coppia massima')
    expect(result.cardsToCome).toBe(2)
  })

  it('non conta le carte che migliorano anche lui', () => {
    // Colore mancante contro un set. I cuori rimasti sono nove, ma il 2 di
    // cuori appaia il board e gli da il full: gli out sono otto, non nove. E
    // esattamente questo il motivo per cui il conto si fa contro la sua mano e
    // non guardando solo la propria.
    const result = countOuts(cards('Ah Kh'), cards('7s 7d'), cards('Qh 7h 2c'))

    expect(result.outs.every((out) => out.makes === 'colore')).toBe(true)
    expect(result.outs).toHaveLength(8)
    expect(result.outs.map((out) => out.card)).not.toContain('2h')
    expect(result.villainNow).toBe('set')
  })

  it('quando sei avanti conta le carte che ti superano', () => {
    const result = countOuts(cards('As Ad'), cards('Kh Qh'), cards('Ac 7h 2h'))

    expect(result.ahead).toBe(true)
    expect(result.outs).toHaveLength(0)
    expect(result.counterOuts.length).toBeGreaterThan(0)
    // Con un tris di assi contro colore mancante lo salvano solo i cuori.
    expect(result.counterOuts.every((out) => out.card.endsWith('h'))).toBe(true)
  })

  it('rifiuta un board che non sia un flop o un turn', () => {
    expect(() => countOuts(cards('Ah Kh'), cards('Qs Jd'), cards('Qh 7h'))).toThrow(RangeError)
    expect(() => countOuts(cards('Ah Kh'), cards('Qs Jd'), cards('Qh 7h 2c 3d 4s'))).toThrow(RangeError)
  })
})

describe('analyseOuts', () => {
  it('affianca al conto degli out l equity esatta', () => {
    const result = analyseOuts(cards('Ah Kh'), cards('Qs Jd'), cards('Qh 7h 2c'))

    expect(result.outs).toHaveLength(15)
    expect(result.shortcut).toBe(60)
    // Quindici out al flop valgono circa il 54%: la regola del 4 esagera sempre
    // quando gli out sono tanti, ed e proprio questo che il livello insegna.
    expect(result.equity).toBeGreaterThan(0.5)
    expect(result.equity).toBeLessThan(0.58)
    expect(result.shortcut).toBeGreaterThan(result.equity * 100)
  })

  it('e simmetrica: le due equity sommano a uno', () => {
    const hero = analyseOuts(cards('Ah Kh'), cards('Qs Jd'), cards('Qh 7h 2c'))
    const villain = analyseOuts(cards('Qs Jd'), cards('Ah Kh'), cards('Qh 7h 2c'))

    expect(hero.equity + villain.equity).toBeCloseTo(1, 6)
  })
})

describe('ruleOfTwoAndFour', () => {
  it('e due punti per out per carta che manca', () => {
    expect(ruleOfTwoAndFour(9, 2)).toBe(36)
    expect(ruleOfTwoAndFour(9, 1)).toBe(18)
    expect(ruleOfTwoAndFour(0, 2)).toBe(0)
  })
})
