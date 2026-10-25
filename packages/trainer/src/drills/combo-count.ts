/**
 * Counting combinations, which is how a range stops being a feeling.
 *
 * "He could have a set" is not an argument until you know it is three
 * combinations against your twelve. And every card you can see removes some of
 * them, which is the whole of what a blocker is.
 */

import { rankOf, RANKS, type Card, type Rank } from '@poker/core'
import { combosOf, comboCards, parseRange } from '@poker/equity'

import { cardsText } from '../labels.js'
import { choose, deal, pick, sample } from '../deck.js'
import type { Drill, Step } from '../types.js'

type Shape = 'pair-on-board' | 'pocket-pair' | 'two-ranks' | 'two-ranks-suited'

/** How many of a rank are still unaccounted for, given everything visible. */
function leftOf(rank: Rank, seen: readonly Card[]): number {
  return 4 - seen.filter((value) => rankOf(value) === rank).length
}

function notationFor(shape: Shape, high: Rank, low: Rank): string {
  if (shape === 'pair-on-board' || shape === 'pocket-pair') return `${high}${high}`
  return shape === 'two-ranks-suited' ? `${high}${low}s` : `${high}${low}`
}

export const comboCountDrill: Drill = {
  id: 'combo-count',
  label: 'Contare le combinazioni',
  asks: 'Quante versioni di quella mano può avere davvero?',
  why:
    'Serve a smettere di ragionare per mani e cominciare a ragionare per quantità: i set ' +
    'sono sempre pochi, gli assi che non hai tu sono tanti, e le carte che vedi cambiano il conto.',

  generate(rng, constraints) {
    const boardSize = constraints.street === 'turn' ? 4 : 3

    const picked = sample(() => {
      const hand = deal(rng, boardSize)
      const seen: readonly Card[] = [...hand.hero, ...hand.board]
      const boardRanks = [...new Set(hand.board.map(rankOf))]

      const shape: Shape = choose(rng, [
        'pair-on-board',
        'pocket-pair',
        'two-ranks',
        'two-ranks-suited',
      ] as const)

      let high: Rank
      let low: Rank
      if (shape === 'pair-on-board') {
        high = choose(rng, boardRanks)
        low = high
      } else if (shape === 'pocket-pair') {
        const off = RANKS.filter((rank) => !boardRanks.includes(rank))
        high = choose(rng, off)
        low = high
      } else {
        const a = RANKS[8 + pick(rng, 5)] as Rank
        const b = choose(rng, RANKS.filter((rank) => rank !== a))
        const ordered = RANKS.indexOf(a) > RANKS.indexOf(b) ? [a, b] : [b, a]
        high = ordered[0] as Rank
        low = ordered[1] as Rank
      }

      const notation = notationFor(shape, high, low)
      const parsed = parseRange(notation)
      if (!parsed.ok) return undefined

      const dead = new Set(seen)
      const live = combosOf(parsed.value).filter((combo) => {
        const [x, y] = comboCards(combo)
        return !dead.has(x) && !dead.has(y)
      })
      if (live.length === 0) return undefined

      return { hand, seen, shape, high, low, notation, count: live.length }
    }, 2000, 'una mano da contare')

    const { hand, seen, shape, high, low, notation, count } = picked
    const highLeft = leftOf(high, seen)
    const lowLeft = leftOf(low, seen)

    const steps: Step[] =
      shape === 'pair-on-board' || shape === 'pocket-pair'
        ? [
            {
              label: `Quanti ${high} restano`,
              value: `${highLeft} su 4${highLeft < 4 ? ' (gli altri li vedi)' : ''}`,
            },
            {
              label: 'Coppie che ci si fanno',
              value: `${highLeft} × ${highLeft - 1} ÷ 2 = ${count}`,
            },
          ]
        : [
            { label: `Quanti ${high} restano`, value: `${highLeft} su 4` },
            { label: `Quanti ${low} restano`, value: `${lowLeft} su 4` },
            {
              label: shape === 'two-ranks-suited' ? 'Solo quelle dello stesso seme' : 'Tutte le coppie possibili',
              value:
                shape === 'two-ranks-suited'
                  ? `una per seme, tolte quelle bruciate: ${count}`
                  : `${highLeft} × ${lowLeft} = ${count}`,
            },
          ]

    return {
      drill: 'combo-count',
      ask: `Quante combinazioni di ${notation} può avere, viste le tue carte e il board?`,
      table: {
        hero: hand.hero,
        board: hand.board,
        villainLabel: notation,
        street: boardSize === 3 ? 'flop' : 'turn',
      },
      question: {
        kind: 'number',
        unit: 'combo',
        min: 0,
        max: 16,
        step: 1,
        answer: count,
        tolerance: constraints.tolerance ?? 0,
        perfect: 0,
      },
      explain: {
        headline: `${count} combinazioni di ${notation}`,
        steps: [
          { label: 'Quello che vedi', value: cardsText(seen) },
          ...steps,
        ],
        known: seen,
        tip:
          'I numeri di partenza sono due: una coppia sono 6 combinazioni, due carte diverse sono 16 ' +
          '(4 dello stesso seme e 12 no). Ogni carta scoperta ne toglie: un asso in mano tua porta i suoi AK da 16 a 12, ' +
          'e una coppia che sta sul board scende da 6 a 3.',
      },
    }
  },
}
