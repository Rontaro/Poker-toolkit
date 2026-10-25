/**
 * The real number.
 *
 * Same spot as the outs drills, different question: not what the shortcut says
 * but what the enumeration says. The gap between the two is the lesson — outs
 * that arrive dirty, hands that redraw, boards that pair — and it only shows up
 * if you have first committed to an estimate.
 */

import { percent } from '../labels.js'
import { dealFitting } from './shared.js'
import type { Drill, Step } from '../types.js'

export const equityEstimateDrill: Drill = {
  id: 'equity-estimate',
  label: 'Stimare l’equity',
  asks: 'Quanto spesso vinci questa mano?',
  why:
    'È la domanda vera: quante volte su cento, se le carte uscissero tutte, questa mano ' +
    'è la migliore. Tutto il resto del poker si confronta con questo numero.',

  generate(rng, constraints) {
    const { hero, villain, board, analysis } = dealFitting(rng, constraints)
    const exact = analysis.equity * 100
    const outs = analysis.ahead ? analysis.counterOuts.length : analysis.outs.length

    const steps: Step[] = [
      { label: 'Tu hai', value: analysis.heroNow },
      { label: 'Lui ha', value: analysis.villainNow },
      {
        label: analysis.ahead ? 'Carte che lo salvano' : 'I tuoi out',
        value: `${outs}`,
      },
      {
        label: 'Regola del 2 e del 4',
        value: `${outs} × ${2 * analysis.cardsToCome} = ${outs * 2 * analysis.cardsToCome}%`,
      },
      { label: 'Equity esatta', value: percent(analysis.equity) },
    ]

    return {
      drill: 'equity-estimate',
      ask: 'Che equity ha la tua mano contro la sua?',
      table: { hero, villain, board, street: board.length === 3 ? 'flop' : 'turn' },
      question: {
        kind: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        answer: Number(exact.toFixed(1)),
        tolerance: constraints.tolerance ?? 5,
        perfect: 2,
      },
      explain: {
        headline: `${percent(analysis.equity)} — calcolata su tutte le uscite possibili`,
        steps,
        outs: analysis.ahead ? analysis.counterOuts : analysis.outs,
        ...(analysis.ahead ? { outsLabel: 'lo salvano' } : {}),
        known: [...hero, ...villain, ...board],
        tip: analysis.ahead
          ? 'Essere avanti non basta: contro un progetto la tua equity al flop è spesso solo 60-70%, ed è per questo che si punta invece di rallentare.'
          : 'Se la regola ti dà più dell’equity vera, di solito è perché qualche out ti fa la mano e gliene fa una migliore, oppure perché lui può ancora migliorare al river.',
      },
    }
  },
}
