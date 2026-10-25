import { describe, expect, it } from 'vitest'

import { ENDLESS } from '../src/curriculum.js'
import { seeded } from '../src/deck.js'
import { tierFor } from '../src/curriculum.js'
import {
  EMPTY_STAT,
  accuracy,
  endlessRound,
  pickEndlessDrill,
  pointsFor,
  record,
  weakest,
  type Stats,
} from '../src/session.js'

describe('le statistiche', () => {
  it('non dicono niente prima di avere un campione', () => {
    let stats: Stats = {}
    stats = record(stats, 'pot-odds', true, 1200)
    expect(accuracy(stats, 'pot-odds')).toBeUndefined()

    stats = record(stats, 'pot-odds', true, 1000)
    stats = record(stats, 'pot-odds', false, 900)
    expect(accuracy(stats, 'pot-odds')).toBeCloseTo(2 / 3, 6)
  })

  it('sommano il tempo speso', () => {
    let stats: Stats = {}
    stats = record(stats, 'mdf', true, 1500)
    stats = record(stats, 'mdf', false, 2500)
    expect(stats['mdf']).toEqual({ asked: 2, right: 1, ms: 4000 })
    expect(EMPTY_STAT.asked).toBe(0)
  })

  it('sanno indicare il punto debole', () => {
    let stats: Stats = {}
    for (let i = 0; i < 4; i += 1) {
      stats = record(stats, 'pot-odds', true, 1000)
      stats = record(stats, 'combo-count', i === 0, 1000)
    }
    expect(weakest(stats, ['pot-odds', 'combo-count'])).toBe('combo-count')
    expect(weakest({}, ['pot-odds'])).toBeUndefined()
  })
})

describe('la scelta della prossima domanda', () => {
  it('pesca piu spesso quello che sbagli', () => {
    let stats: Stats = {}
    for (let i = 0; i < 10; i += 1) {
      stats = record(stats, 'pot-odds', true, 1000)
      stats = record(stats, 'combo-count', false, 1000)
    }

    const rng = seeded(3)
    let combo = 0
    for (let i = 0; i < 600; i += 1) {
      if (pickEndlessDrill(rng, ['pot-odds', 'combo-count'], stats) === 'combo-count') combo += 1
    }
    // 1,05 contro 0,05: praticamente sempre quello sbagliato.
    expect(combo).toBeGreaterThan(500)
  })

  it('senza dati sceglie fra tutti', () => {
    const rng = seeded(11)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) seen.add(pickEndlessDrill(rng, ENDLESS.drills, {}))
    expect(seen.size).toBe(ENDLESS.drills.length)
  })
})

describe('la modalita infinita', () => {
  it('alza lo scaglione con la striscia di risposte giuste', () => {
    expect(tierFor(0).multiplier).toBe(1)
    expect(tierFor(3).from).toBe(0)
    expect(tierFor(5).multiplier).toBeGreaterThan(1)
    expect(tierFor(100).multiplier).toBe(2)
  })

  it('genera una domanda vera a ogni scaglione', () => {
    const rng = seeded(808)
    for (const streak of [0, 5, 12]) {
      const round = endlessRound(rng, ENDLESS, {}, streak)
      expect(ENDLESS.drills).toContain(round.drill)
      expect(round.multiplier).toBe(tierFor(streak).multiplier)
      expect(round.spot.ask).not.toBe('')
    }
  })
})

describe('i punti', () => {
  it('premiano la precisione e la striscia', () => {
    expect(pointsFor('wrong', 2, 9)).toBe(0)
    expect(pointsFor('close', 1, 0)).toBe(40)
    expect(pointsFor('perfect', 1, 0)).toBe(100)
    expect(pointsFor('perfect', 1, 5)).toBe(150)
    expect(pointsFor('perfect', 2, 5)).toBe(300)
  })

  it('non fanno crescere il bonus all infinito', () => {
    expect(pointsFor('perfect', 1, 10)).toBe(pointsFor('perfect', 1, 40))
  })
})
