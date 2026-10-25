/**
 * Pot odds: the price the pot is offering, expressed as the share of the time
 * you have to be right. It is one division, and getting it backwards is the
 * single most expensive mistake available to a beginner.
 */

import { bb, percent } from '../labels.js'
import { potOddsRatio, requiredEquity } from '../math.js'
import { money, sizeName } from './money.js'
import type { Drill } from '../types.js'

export const potOddsDrill: Drill = {
  id: 'pot-odds',
  label: 'Le pot odds',
  asks: 'Quanta equity ti serve per chiamare?',
  why:
    'Il piatto ti fa un prezzo. Finché non lo traduci in percentuale non hai niente da ' +
    'confrontare con la tua mano, e stai decidendo a sensazione.',

  generate(rng, constraints) {
    const { pot, bet, fraction } = money(rng, constraints)
    const faced = pot + bet
    const needed = requiredEquity(faced, bet) * 100

    return {
      drill: 'pot-odds',
      ask: `Nel piatto ci sono ${bb(faced)}, la sua puntata compresa, e per chiamare ne devi mettere ${bb(bet)}. Quanta equity ti serve?`,
      table: { potBB: faced, toCallBB: bet, betBB: bet },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 60,
        step: 0.5,
        answer: Number(needed.toFixed(1)),
        tolerance: constraints.tolerance ?? 2,
        perfect: 0.7,
      },
      explain: {
        headline: `${percent(needed / 100)} — tanto ti serve per andare in pari`,
        steps: [
          { label: 'La formula', value: 'quanto metti ÷ (quanto è già nel piatto + quanto metti)' },
          {
            label: 'Il conto',
            value: `${bb(bet)} ÷ (${bb(faced)} + ${bb(bet)}) = ${percent(needed / 100)}`,
          },
          { label: 'Detto in odds', value: potOddsRatio(faced, bet) },
          {
            label: 'La sua puntata era',
            value: `${sizeName(fraction)} (${bb(bet)} su ${bb(pot)})`,
          },
        ],
        tip:
          'I quattro numeri da sapere a memoria: se punta un terzo del piatto ti serve il 20%, ' +
          'metà piatto il 25%, tre quarti il 30%, il piatto intero il 33%.',
      },
    }
  },
}
