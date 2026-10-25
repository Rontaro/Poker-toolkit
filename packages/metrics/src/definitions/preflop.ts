import type { HandContext } from '@poker/core'
import { frequency } from '../counters.js'
import { erase, type ErasedMetric, type Metric } from '../types.js'
import type { Counter } from '../counters.js'

/** Every hand the hero was dealt into is a chance to play or not play it. */
const dealtIn = (hand: HandContext): boolean => hand.hero?.dealtIn === true

export const vpip: Metric<Counter> = frequency({
  id: 'vpip',
  label: 'VPIP',
  description:
    "VPIP, «Voluntarily Put money In Pot»: su 100 mani, quante volte metti soldi nel piatto preflop per tua scelta — call o rilancio. I bui obbligatori non contano. Misura quanto giochi largo.",
  opportunity: dealtIn,
  hit: (hand) => hand.heroPutMoneyInVoluntarily('preflop'),
})

export const pfr: Metric<Counter> = frequency({
  id: 'pfr',
  label: 'PFR',
  description:
    "PFR, «Pre-Flop Raise»: su 100 mani, quante volte rilanci preflop. È sempre un sottoinsieme del VPIP; la differenza fra i due è quanto spesso entri chiamando invece che rilanciando.",
  opportunity: dealtIn,
  hit: (hand) => hand.heroRaisedPreflop(),
})

/**
 * A 3-bet spot is one raise standing in front of the hero. Counting every raise
 * the hero ever made would fold opens and 4-bets into the same number.
 */
export const threeBet: Metric<Counter> = frequency({
  id: 'three-bet',
  label: '3-bet',
  description:
    "Quante volte rilanci avendo già un rilancio davanti. Si chiama 3-bet perché è il terzo giro di puntate: il grande buio, l'apertura, il tuo rilancio.",
  opportunity: (hand) => dealtIn(hand) && hand.preflopRaisesFacedByHero() === 1,
  hit: (hand) => hand.heroFirstDecision('preflop')?.action.kind === 'raise',
})

export const foldToThreeBet: Metric<Counter> = frequency({
  id: 'fold-to-three-bet',
  label: 'Fold to 3-bet',
  description:
    "Quando apri il piatto e qualcuno ti ri-rilancia, quante volte lasci la mano.",
  opportunity: (hand) => hand.heroFacedThreeBet(),
  hit: (hand) =>
    hand.heroVoluntaryActions('preflop').some((view) => view.action.kind === 'fold'),
})

export const fourBet: Metric<Counter> = frequency({
  id: 'four-bet',
  label: '4-bet',
  description:
    "Quante volte ri-rilanci un 3-bet. È il quarto giro di puntate.",
  opportunity: (hand) => dealtIn(hand) && hand.preflopRaisesFacedByHero() === 2,
  hit: (hand) => hand.heroFirstDecision('preflop')?.action.kind === 'raise',
})

export const PREFLOP_METRICS: readonly ErasedMetric[] = [
  vpip,
  pfr,
  threeBet,
  foldToThreeBet,
  fourBet,
].map(erase)
