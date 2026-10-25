/**
 * Turning outs into a percentage — the rule of two and four.
 *
 * The outs are given here, so the only thing being tested is the conversion and
 * the honesty about what it costs: the rule is a shortcut, it runs long when
 * you have a lot of outs, and knowing by how much is the difference between
 * using it and trusting it.
 */

import { percent } from '../labels.js'
import { ruleOfTwoAndFour } from '../outs.js'
import { dealFitting } from './shared.js'
import type { Drill } from '../types.js'

export const outsToEquityDrill: Drill = {
  id: 'outs-to-equity',
  label: 'Dagli out all’equity',
  asks: 'Con questi out, che equity hai?',
  why:
    'Gli out non si confrontano con niente. La percentuale sì: è l’unico numero che ' +
    'puoi mettere accanto a quello che ti chiede il piatto.',

  generate(rng, constraints) {
    const { hero, villain, board, analysis } = dealFitting(rng, constraints)
    const outs = analysis.outs.length
    const cardsToCome = analysis.cardsToCome
    const shortcut = ruleOfTwoAndFour(outs, cardsToCome)
    const exact = analysis.equity * 100
    const drift = shortcut - exact

    return {
      drill: 'outs-to-equity',
      ask:
        cardsToCome === 2
          ? `Hai ${outs} out e devi ancora vedere due carte. Che equity hai, con la regola del 2 e del 4?`
          : `Hai ${outs} out e manca solo il river. Che equity hai, con la regola del 2 e del 4?`,
      table: { hero, villain, board, street: cardsToCome === 2 ? 'flop' : 'turn' },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        answer: shortcut,
        tolerance: constraints.tolerance ?? 4,
        perfect: 2,
      },
      explain: {
        headline: `${outs} × ${2 * cardsToCome} = ${shortcut}%`,
        steps: [
          { label: 'La regola', value: 'due punti per ogni out, per ogni carta che manca' },
          { label: 'Il conto', value: `${outs} out × ${2 * cardsToCome} = ${shortcut}%` },
          { label: 'Equity vera', value: percent(analysis.equity) },
          {
            label: 'Scarto della regola',
            value: `${drift >= 0 ? '+' : ''}${drift.toFixed(1).replace('.', ',')} punti`,
          },
        ],
        outs: analysis.outs,
        known: [...hero, ...villain, ...board],
        tip:
          cardsToCome === 2
            ? 'Il ×4 vale solo se vedi davvero tutte e due le carte senza pagare ancora. Se ti aspetti un’altra puntata al turn, il conto giusto è ×2.'
            : 'Con una carta sola la regola è precisa: ogni out vale poco più di due punti.',
      },
    }
  },
}
