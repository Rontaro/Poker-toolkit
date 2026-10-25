/**
 * The other side of the same division: how often a bluff has to work.
 *
 * Beginners bluff because a hand cannot win at showdown. The question that
 * matters is a price question — you are laying yourself odds, and the size you
 * pick decides how often you need to be believed.
 */

import { bb, percent } from '../labels.js'
import { breakEvenBluff } from '../math.js'
import { money, sizeName } from './money.js'
import type { Drill } from '../types.js'

export const breakevenBluffDrill: Drill = {
  id: 'breakeven-bluff',
  label: 'Il bluff in pari',
  asks: 'Quanto spesso deve funzionare la tua puntata?',
  why:
    'Un bluff non si giudica da com’è andato. Si giudica da quante volte doveva far ' +
    'passare per essere gratis, e da quante volte quello lì passa davvero.',

  generate(rng, constraints) {
    const { pot, bet, fraction } = money(rng, constraints)
    const needed = breakEvenBluff(pot, bet) * 100

    return {
      drill: 'breakeven-bluff',
      ask: `Il piatto è ${bb(pot)} e punti ${bb(bet)} in bluff. Quanto spesso deve farlo passare perché la puntata sia gratis?`,
      table: { potBB: pot, betBB: bet },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 80,
        step: 0.5,
        answer: Number(needed.toFixed(1)),
        tolerance: constraints.tolerance ?? 2,
        perfect: 0.7,
      },
      explain: {
        headline: `${percent(needed / 100)} delle volte`,
        steps: [
          { label: 'La formula', value: 'quanto rischi ÷ (piatto + quanto rischi)' },
          { label: 'Il conto', value: `${bb(bet)} ÷ (${bb(pot)} + ${bb(bet)}) = ${percent(needed / 100)}` },
          { label: 'La tua puntata era', value: sizeName(fraction) },
          {
            label: 'Se hai anche degli out',
            value: 'te ne serve meno: le volte che ti chiama, qualcuna la vinci lo stesso',
          },
        ],
        tip:
          'Metà piatto deve funzionare una volta su tre, il piatto intero una su due. ' +
          'Puntare di più non rende il bluff più credibile: lo rende solo più caro.',
      },
    }
  },
}
