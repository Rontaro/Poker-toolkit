import { describe, expect, it } from 'vitest'

import { ALL_DRILLS, drillById } from '../src/registry.js'
import { CURRICULUM, ENDLESS, LEVELS } from '../src/curriculum.js'
import { levelRound } from '../src/session.js'
import { seeded } from '../src/deck.js'
import { grade, type Spot } from '../src/types.js'

/** Ogni domanda deve essere risolvibile, spiegata, e graduabile. */
function check(spot: Spot): void {
  expect(spot.ask.length).toBeGreaterThan(10)
  expect(spot.explain.headline.length).toBeGreaterThan(3)
  expect(spot.explain.steps.length).toBeGreaterThan(0)
  expect(spot.explain.tip.length).toBeGreaterThan(20)
  for (const step of spot.explain.steps) {
    expect(step.label).not.toBe('')
    expect(step.value).not.toBe('')
  }

  if (spot.question.kind === 'number') {
    const { answer, min, max, tolerance } = spot.question
    expect(Number.isFinite(answer)).toBe(true)
    expect(answer).toBeGreaterThanOrEqual(min)
    expect(answer).toBeLessThanOrEqual(max)

    expect(grade(spot, answer).quality).toBe('perfect')
    expect(grade(spot, answer + tolerance + 0.6).correct).toBe(false)
    expect(grade(spot, answer - tolerance - 0.6).correct).toBe(false)
  } else {
    expect(spot.question.options.length).toBeGreaterThan(1)
    expect(spot.question.answer).toBeGreaterThanOrEqual(0)
    expect(spot.question.answer).toBeLessThan(spot.question.options.length)
    expect(grade(spot, spot.question.answer).correct).toBe(true)
    expect(grade(spot, 1 - spot.question.answer).correct).toBe(false)
  }
}

describe('ogni esercizio', () => {
  for (const drill of ALL_DRILLS) {
    it(`${drill.id} genera domande valide senza vincoli`, () => {
      const rng = seeded(20260907)
      for (let i = 0; i < 3; i += 1) check(drill.generate(rng, {}))
    })
  }

  it('sa descrivere se stesso', () => {
    for (const drill of ALL_DRILLS) {
      expect(drill.label).not.toBe('')
      expect(drill.asks.endsWith('?')).toBe(true)
      expect(drill.why.length).toBeGreaterThan(40)
    }
  })
})

describe('ogni livello', () => {
  for (const level of LEVELS) {
    it(`${level.id} genera domande che rispettano i suoi vincoli`, () => {
      const rng = seeded(7)
      for (let i = 0; i < level.drills.length + 2; i += 1) {
        const round = levelRound(rng, level, i)
        expect(level.drills).toContain(round.drill)
        check(round.spot)

        const board = round.spot.table.board
        if (round.constraints.street !== undefined && board !== undefined) {
          expect(board.length).toBe(round.constraints.street === 'turn' ? 4 : 3)
        }
      }
    })
  }
})

describe('gli out chiesti', () => {
  it('stanno nell intervallo che il livello ha chiesto', () => {
    const rng = seeded(99)
    const level = LEVELS.find((entry) => entry.id === 'outs-colore')
    expect(level).toBeDefined()

    for (let i = 0; i < 6; i += 1) {
      const spot = levelRound(rng, level as never, i).spot
      if (spot.question.kind !== 'number') continue
      expect(spot.question.answer).toBeGreaterThanOrEqual(6)
      expect(spot.question.answer).toBeLessThanOrEqual(13)
      // Il livello sul colore: quasi tutti gli out devono fare colore.
      const flush = (spot.explain.outs ?? []).filter((out) => out.makes === 'colore').length
      expect(flush).toBeGreaterThan(0)
    }
  })
})

describe('la stessa sequenza', () => {
  it('con lo stesso seme da le stesse mani', () => {
    const first = levelRound(seeded(4242), LEVELS[0] as never, 0)
    const second = levelRound(seeded(4242), LEVELS[0] as never, 0)
    expect(JSON.stringify(first.spot)).toBe(JSON.stringify(second.spot))
  })

  it('con semi diversi da mani diverse', () => {
    const first = levelRound(seeded(1), LEVELS[0] as never, 0)
    const second = levelRound(seeded(2), LEVELS[0] as never, 0)
    expect(JSON.stringify(first.spot)).not.toBe(JSON.stringify(second.spot))
  })
})

describe('il percorso', () => {
  it('cita solo esercizi che esistono', () => {
    for (const level of LEVELS) {
      expect(level.drills.length).toBeGreaterThan(0)
      for (const id of level.drills) expect(() => drillById(id)).not.toThrow()
    }
    for (const id of ENDLESS.drills) expect(() => drillById(id)).not.toThrow()
  })

  it('chiede di indovinarne meno di quante ne fa', () => {
    for (const level of LEVELS) {
      expect(level.pass).toBeLessThanOrEqual(level.questions)
      expect(level.pass).toBeGreaterThan(level.questions / 2)
      expect(level.constraints.length).toBeGreaterThan(0)
      expect(level.theory.length).toBeGreaterThan(1)
      expect(level.goal).not.toBe('')
    }
  })

  it('ha livelli con id distinti', () => {
    const ids = LEVELS.map((level) => level.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CURRICULUM.label).not.toBe('')
  })

  it('ha scaglioni infiniti ordinati e sempre piu difficili', () => {
    const tiers = ENDLESS.tiers
    expect(tiers.length).toBeGreaterThan(1)
    expect(tiers[0]?.from).toBe(0)
    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i]?.from).toBeGreaterThan(tiers[i - 1]?.from as number)
      expect(tiers[i]?.multiplier).toBeGreaterThan(tiers[i - 1]?.multiplier as number)
    }
  })
})
