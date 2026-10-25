import type { HandContext, StreetName } from '@poker/core'
import { quotient, type Totals } from '../counters.js'
import { erase, type ErasedMetric, type Metric } from '../types.js'

interface Tally {
  aggressive: number
  calls: number
  folds: number
}

function tally(hand: HandContext, street: StreetName): Tally {
  const result: Tally = { aggressive: 0, calls: 0, folds: 0 }
  for (const view of hand.heroVoluntaryActions(street)) {
    if (view.action.kind === 'bet' || view.action.kind === 'raise') result.aggressive += 1
    else if (view.action.kind === 'call') result.calls += 1
    else if (view.action.kind === 'fold') result.folds += 1
  }
  return result
}

/**
 * Aggression factor: bets and raises over calls. Checks are excluded, which is
 * the classic definition and also its weakness — a player who checks every
 * street looks identical to one who never gets the chance. Aggression frequency
 * below is the number to read next to it, not instead of it.
 */
function aggressionFactor(street: StreetName): Metric<Totals> {
  return quotient({
    id: `af-${street}`,
    label: `AF ${street}`,
    description:
      `AF, «Aggression Factor» al ${street}: puntate e rilanci divisi per i call. Sopra 1 sei ` +
      "più aggressivo che passivo. Non conta i check, quindi va letto insieme all'AFq.",
    unit: 'ratio',
    include: (hand) => hand.sawStreet(street),
    numerator: (hand) => tally(hand, street).aggressive,
    denominator: (hand) => tally(hand, street).calls,
  })
}

/** Bets and raises as a share of every decision that was not a check. */
function aggressionFrequency(street: StreetName): Metric<Totals> {
  return quotient({
    id: `afq-${street}`,
    label: `AFq ${street}`,
    description:
      `AFq, «Aggression Frequency» al ${street}: puntate e rilanci sul totale delle azioni che ` +
      "non sono check. Più onesto dell'AF quando checki spesso.",
    unit: 'percent',
    include: (hand) => hand.sawStreet(street),
    numerator: (hand) => tally(hand, street).aggressive,
    denominator: (hand) => {
      const counts = tally(hand, street)
      return counts.aggressive + counts.calls + counts.folds
    },
    scale: 100,
  })
}

export const AGGRESSION_METRICS: readonly ErasedMetric[] = [
  aggressionFactor('flop'),
  aggressionFactor('turn'),
  aggressionFactor('river'),
  aggressionFrequency('flop'),
  aggressionFrequency('turn'),
  aggressionFrequency('river'),
].map(erase)
