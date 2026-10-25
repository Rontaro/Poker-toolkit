/**
 * Counting outs: the first thing to learn, because everything else is built on
 * it. The opponent's cards are face up — not because they will be at the table,
 * but because a number you can check is the only kind you can be trained on.
 */

import { cardsText, percent } from '../labels.js'
import { unseen, dealFitting, outsTip } from './shared.js'
import type { Drill, OutCard, Step } from '../types.js'

export const countOutsDrill: Drill = {
  id: 'count-outs',
  label: 'Contare gli out',
  asks: 'Quante carte ti fanno passare in vantaggio?',
  why:
    'È il conto da cui dipendono tutti gli altri. Sbagliare gli out di due sposta ' +
    "l'equity di otto punti, che è la differenza fra un call giusto e uno che perde.",

  generate(rng, constraints) {
    const { hero, villain, board, analysis } = dealFitting(rng, constraints)
    const defending = analysis.ahead

    // Ahead, the question flips: it is his outs you have to count, and it is the
    // same skill pointed the other way.
    const list: readonly OutCard[] = defending ? analysis.counterOuts : analysis.outs
    const count = list.length

    const groups = new Map<string, number>()
    for (const out of list) groups.set(out.makes, (groups.get(out.makes) ?? 0) + 1)

    const steps: Step[] = [
      { label: 'Adesso hai', value: analysis.heroNow },
      { label: 'Lui ha', value: analysis.villainNow },
      ...[...groups.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([makes, n]) => ({
          label: defending ? `carte che gli danno ${makes}` : `carte che ti danno ${makes}`,
          value: `${n}`,
        })),
      { label: 'Totale', value: `${count} out su ${unseen(board)} carte che non vedresti al tavolo` },
      {
        label: 'Equity vera',
        value: `${percent(defending ? 1 - analysis.equity : analysis.equity)} per chi insegue`,
      },
    ]

    return {
      drill: 'count-outs',
      ask: defending
        ? 'Sei avanti. Quante carte lo fanno passare in vantaggio?'
        : 'Quante carte ti fanno passare in vantaggio?',
      table: {
        hero,
        villain,
        board,
        street: board.length === 3 ? 'flop' : 'turn',
      },
      question: {
        kind: 'number',
        unit: 'out',
        min: 0,
        max: 24,
        step: 1,
        answer: count,
        tolerance: constraints.tolerance ?? 0,
        perfect: 0,
      },
      explain: {
        headline:
          count === 0
            ? 'Nessun out: qui non ci sono carte che cambiano la mano'
            : `${count} ${defending ? 'carte lo salvano' : 'out'} — ${cardsText(
                list.slice(0, 8).map((out) => out.card),
              )}${count > 8 ? '…' : ''}`,
        steps,
        outs: list,
        ...(defending ? { outsLabel: 'lo salvano' } : {}),
        known: [...hero, ...villain, ...board],
        tip: defending
          ? 'Quando sei avanti conta le sue carte, non le tue: è quello che decide se vale la pena puntare per farlo pagare.'
          : outsTip(analysis),
      },
    }
  },
}
