/**
 * Preflop equity against a range.
 *
 * Preflop is the only street where the numbers are worth memorising, because
 * the situations repeat: a pair against two overcards is the same coin flip
 * every time. Against a range rather than a hand, because that is the form the
 * question actually takes at the table.
 *
 * Sampled, not enumerated: every runout of two exact preflop hands is 1.7
 * million boards and about five seconds, which is not a game. Twenty-five
 * thousand samples land within half a point, and the answer is graded to five.
 */

import { rankValue, type Card } from '@poker/core'
import { combosOf, comboOf, handVsRange, parseRange } from '@poker/equity'

import { cardsText, percent } from '../labels.js'
import { deal, sample } from '../deck.js'
import type { Drill } from '../types.js'

const SAMPLES = 25_000

const DEFAULT_RANGES = [
  'QQ+, AKs, AKo',
  'JJ+, AQs+, AKo',
  '22+',
  '77+, A9s+, KTs+, QJs, AJo+, KQo',
  '22+, A2s+, K9s+, QTs+, JTs, T9s, A9o+, KTo+, QJo',
  'random',
] as const

/** A hand worth arguing about: a pair, two cards of a suit, or high cards. */
function playable(hole: readonly Card[]): boolean {
  const a = rankValue(hole[0] as Card)
  const b = rankValue(hole[1] as Card)
  const suited = (hole[0] as string)[1] === (hole[1] as string)[1]
  return a === b || suited || Math.min(a, b) >= 8 || Math.max(a, b) === 12
}

export const preflopEquityDrill: Drill = {
  id: 'preflop-equity',
  label: 'Equity preflop',
  asks: 'Che equity ha la tua mano contro il suo range?',
  why:
    'Preflop le situazioni si ripetono sempre uguali. Sono numeri che si imparano una ' +
    'volta e poi si sanno: quanto vale una coppia contro due carte alte, quanto vale AK contro una coppia.',

  generate(rng, constraints) {
    const notation = (constraints.villainRanges ?? DEFAULT_RANGES)[
      Math.floor(rng() * (constraints.villainRanges ?? DEFAULT_RANGES).length)
    ] as string
    const parsed = parseRange(notation)
    if (!parsed.ok) throw new Error(`range del livello non valido: ${notation}`)

    const hero = sample(() => {
      const hand = deal(rng, 0)
      return playable(hand.hero) ? hand.hero : undefined
    }, 2000, 'una mano giocabile')

    const seed = Math.floor(rng() * 2 ** 31)
    const result = handVsRange(
      comboOf(hero[0] as Card, hero[1] as Card),
      parsed.value,
      [],
      { maxSamples: SAMPLES, seed },
    )
    const mine = (result.players[0]?.equity ?? 0) * 100

    return {
      drill: 'preflop-equity',
      ask: `Hai ${cardsText(hero)} e lui apre con un range di ${notation}. Che equity hai?`,
      table: { hero, villainLabel: notation, street: 'preflop' },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        answer: Number(mine.toFixed(1)),
        tolerance: constraints.tolerance ?? 6,
        perfect: 3,
      },
      explain: {
        headline: `${percent(mine / 100)} contro ${notation}`,
        steps: [
          { label: 'La tua mano', value: cardsText(hero) },
          {
            label: 'Il suo range',
            value: `${notation} — ${combosOf(parsed.value).length} combinazioni`,
          },
          { label: 'La tua equity', value: percent(mine / 100) },
          { label: 'Come è calcolata', value: `${SAMPLES.toLocaleString('it-IT')} mani simulate` },
        ],
        known: hero,
        tip:
          'Le tre da sapere a memoria: coppia contro due carte più alte è 55/45 per la coppia; ' +
          'due carte alte contro due più basse è 60/40; coppia contro coppia più bassa è 80/20. ' +
          'Contro un range largo tutto si appiattisce verso il 50%.',
      },
    }
  },
}
