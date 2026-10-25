/**
 * Minimum defence frequency: how much of your range has to keep going.
 *
 * It is the complement of his break-even point, and that is the whole argument:
 * defend less than this and betting any two cards prints money for him. It is a
 * ceiling on how much you are allowed to fold, not a rule about which hands.
 */

import { bb, percent } from '../labels.js'
import { breakEvenBluff, minimumDefence } from '../math.js'
import { money, sizeName } from './money.js'
import type { Drill } from '../types.js'

export const mdfDrill: Drill = {
  id: 'mdf',
  label: 'Quanto devi difendere',
  asks: 'Che parte delle tue mani non puoi passare?',
  why:
    'Se passi troppo spesso, chiunque se ne accorga può puntare con qualsiasi cosa e ' +
    'guadagnare senza mai mostrare una mano. Questo numero dice dove sta il troppo.',

  generate(rng, constraints) {
    const { pot, bet, fraction } = money(rng, constraints)
    const defend = minimumDefence(pot, bet) * 100
    const his = breakEvenBluff(pot, bet) * 100

    return {
      drill: 'mdf',
      ask: `Il piatto è ${bb(pot)} e lui punta ${bb(bet)}. Quale parte delle tue mani devi continuare a giocare per non diventare bluffabile?`,
      table: { potBB: pot, betBB: bet, toCallBB: bet },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        answer: Number(defend.toFixed(1)),
        tolerance: constraints.tolerance ?? 3,
        perfect: 1.5,
      },
      explain: {
        headline: `${percent(defend / 100)} delle tue mani`,
        steps: [
          { label: 'La formula', value: 'piatto ÷ (piatto + sua puntata)' },
          { label: 'Il conto', value: `${bb(pot)} ÷ (${bb(pot)} + ${bb(bet)}) = ${percent(defend / 100)}` },
          { label: 'La sua puntata era', value: sizeName(fraction) },
          {
            label: 'Perché proprio questo',
            value: `il suo bluff va in pari al ${percent(his / 100, 0)}: difendendo il resto glielo rendi indifferente`,
          },
        ],
        tip:
          'Contro metà piatto si difendono due terzi delle mani, contro il piatto intero la metà. ' +
          'È un limite teorico: contro chi non bluffa mai, passare di più è la mossa giusta.',
      },
    }
  },
}
