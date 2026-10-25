import type { HandContext } from '@poker/core'
import { quotient, total, type Totals } from '../counters.js'
import { erase, type ErasedMetric, type Metric } from '../types.js'

const dealtIn = (hand: HandContext): boolean => hand.hero?.dealtIn === true

/**
 * The win rate, in big blinds per hundred hands. Normalising to big blinds is
 * what lets a NL2 session and a tournament sit in the same column.
 */
export const winRate: Metric<Totals> = quotient({
  id: 'bb-100',
  label: 'bb/100',
  description:
    "Quanti grandi bui vinci in media ogni 100 mani. È il win rate: sopra zero sei in profitto. Serve un campione grande prima che significhi qualcosa.",
  unit: 'bb/100',
  include: dealtIn,
  numerator: (hand) => hand.heroNetBB(),
  denominator: () => 1,
  scale: 100,
})

export const handsPlayed: Metric<Totals> = total({
  id: 'hands',
  label: 'Hands',
  description:
    "Quante mani ci sono nel campione che stai guardando.",
  unit: 'count',
  include: dealtIn,
  amount: () => 1,
})

/** The stack the hero started hands with, which is what buy-in discipline
 * shows up as over a sample. */
export const averageStack: Metric<Totals> = quotient({
  id: 'avg-stack',
  label: 'Average starting stack',
  description:
    "Con quanti grandi bui inizi le mani, in media. Cento è un buy-in pieno; molto meno vuol dire che ti siedi corto o non ricarichi.",
  unit: 'bb',
  include: dealtIn,
  numerator: (hand) => hand.heroStackBB(),
  denominator: () => 1,
})

export const RESULT_METRICS: readonly ErasedMetric[] = [winRate, handsPlayed, averageStack].map(erase)
