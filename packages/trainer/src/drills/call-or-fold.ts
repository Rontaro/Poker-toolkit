/**
 * The whole loop in one question: what you have, what he could have, what the
 * pot is charging, and therefore what you do.
 *
 * The bet size is chosen after the equity is known, so that the answer is never
 * a coin flip: a level asks for a decision that is clear by at least `edge`
 * points. Marginal spots are real, but they are not what a drill can teach —
 * you cannot learn a method from a question whose answer is "it depends".
 */

import type { Card } from '@poker/core'
import { combosOf, comboOf, handVsRange, parseRange } from '@poker/equity'

import { bb, percent } from '../labels.js'
import { choose, deal, sample } from '../deck.js'
import { requiredEquity, roundTo } from '../math.js'
import { sizeName } from './money.js'
import type { Drill } from '../types.js'

/** Small on purpose: a wide range on a flop is a quarter of a million runouts. */
const DEFAULT_RANGES = [
  'TT+, AQs+, AKo',
  'JJ+, AJs+, KQs',
  '99+, ATs+, KQs, AQo+',
  'TT+, AJs+, KQs, AQo+',
] as const

const FRACTIONS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5] as const

export const callOrFoldDrill: Drill = {
  id: 'call-or-fold',
  label: 'Chiamare o passare',
  asks: 'Il piatto ti sta facendo un prezzo giusto?',
  why:
    'È la decisione vera, e sono due numeri messi uno accanto all’altro: quanto vinci, ' +
    'quanto ti serve. Tutto il resto del tool serve a farti arrivare a questi due numeri.',

  generate(rng, constraints) {
    const boardSize = constraints.street === 'turn' ? 4 : 3
    const notation = choose(rng, constraints.villainRanges ?? DEFAULT_RANGES)
    const parsed = parseRange(notation)
    if (!parsed.ok) throw new Error(`range del livello non valido: ${notation}`)

    const edge = constraints.edge ?? 6

    const spot = sample(() => {
      const hand = deal(rng, boardSize)
      const result = handVsRange(
        comboOf(hand.hero[0] as Card, hand.hero[1] as Card),
        parsed.value,
        hand.board,
      )
      const mine = (result.players[0]?.equity ?? 0) * 100

      // Anything the pot can price is fair game; hopeless and unfoldable hands
      // teach nothing, and no bet size would make them a decision.
      if (mine < 12 || mine > 62) return undefined

      const usable = FRACTIONS.filter(
        (fraction) => Math.abs(requiredEquity(1 + fraction, fraction) * 100 - mine) >= edge,
      )
      if (usable.length === 0) return undefined

      return { hand, mine, fraction: choose(rng, usable) }
    }, 400, 'una decisione abbastanza netta')

    const pot = roundTo(6 + Math.floor(rng() * 25), 0.5)
    const bet = Math.max(0.5, roundTo(pot * spot.fraction, 0.5))
    const faced = pot + bet
    const needed = requiredEquity(faced, bet) * 100
    const call = spot.mine > needed
    const evBB = (spot.mine / 100) * faced - (1 - spot.mine / 100) * bet

    return {
      drill: 'call-or-fold',
      ask: `Lui punta ${bb(bet)} in un piatto di ${bb(pot)}. Chiami o passi?`,
      table: {
        hero: spot.hand.hero,
        board: spot.hand.board,
        villainLabel: notation,
        street: boardSize === 3 ? 'flop' : 'turn',
        potBB: faced,
        toCallBB: bet,
        betBB: bet,
      },
      question: { kind: 'choice', options: ['Chiama', 'Passa'], answer: call ? 0 : 1 },
      explain: {
        headline: call
          ? `Chiama: hai il ${percent(spot.mine / 100, 0)} e te ne serve il ${percent(needed / 100, 0)}`
          : `Passa: te ne serve il ${percent(needed / 100, 0)} e ne hai il ${percent(spot.mine / 100, 0)}`,
        steps: [
          { label: 'La tua equity', value: percent(spot.mine / 100) },
          {
            label: 'Quanto ti serve',
            value: `${bb(bet)} ÷ (${bb(faced)} + ${bb(bet)}) = ${percent(needed / 100)}`,
          },
          { label: 'La sua puntata era', value: sizeName(spot.fraction) },
          {
            label: 'Il call vale',
            value: `${evBB >= 0 ? '+' : ''}${bb(evBB)} ogni volta che ti trovi qui`,
          },
          {
            label: 'Contro cosa',
            value: `${notation} — ${combosOf(parsed.value).length} combinazioni`,
          },
        ],
        known: [...spot.hand.hero, ...spot.hand.board],
        tip:
          'Due numeri, sempre gli stessi: equity e prezzo. Chiamare con meno equity del prezzo si ' +
          'può fare solo se conti di vincergli altro dopo — e allora quei soldi vanno messi nel conto, non dati per scontati.',
      },
    }
  },
}
