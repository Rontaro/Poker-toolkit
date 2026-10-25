import type { HandContext, StreetName } from '@poker/core'
import { frequency, type Counter } from '../counters.js'
import { erase, type ErasedMetric, type Metric } from '../types.js'

/** Nothing was bet before the hero's first decision on this street. */
function firstToAct(hand: HandContext, street: StreetName): boolean {
  const decision = hand.heroFirstDecision(street)
  if (decision === undefined) return false
  return hand.aggressionBefore(street, decision.action.index).length === 0
}

function betsFirst(hand: HandContext, street: StreetName): boolean {
  return hand.heroFirstDecision(street)?.action.kind === 'bet'
}

/**
 * A continuation bet continues a story: the hero took the lead on the previous
 * street and keeps it. On the flop that means being the preflop raiser; from
 * the turn on it means having been the one who bet the street before.
 *
 * A street where somebody else bet before the hero acted is not a missed c-bet,
 * it is a spot the hero never had, so it is excluded rather than counted as a
 * failure.
 */
const CBET_DESCRIPTIONS: Partial<Record<StreetName, string>> = {
  flop: "C-bet, «continuation bet»: dopo aver preso l'iniziativa preflop, quante volte continui a puntare al flop. Contano solo le mani in cui nessuno ha puntato prima di te.",
  turn: 'Quante volte continui a puntare al turn dopo aver puntato al flop.',
  river: 'Quante volte continui a puntare al river dopo aver puntato al turn.',
}

function continuationBet(street: StreetName, previous: StreetName | 'preflop'): Metric<Counter> {
  const led = (hand: HandContext): boolean =>
    previous === 'preflop'
      ? hand.wasPreflopAggressor()
      : hand.lastAggressorOn(previous) === hand.hero?.playerId

  return frequency({
    id: `cbet-${street}`,
    label: `C-bet ${street}`,
    description: CBET_DESCRIPTIONS[street] ?? '',
    opportunity: (hand) => led(hand) && hand.sawStreet(street) && firstToAct(hand, street),
    hit: (hand) => betsFirst(hand, street),
  })
}

export const cbetFlop = continuationBet('flop', 'preflop')
export const cbetTurn = continuationBet('turn', 'flop')
export const cbetRiver = continuationBet('river', 'turn')

export const foldToCbetFlop: Metric<Counter> = frequency({
  id: 'fold-to-cbet-flop',
  label: 'Fold to c-bet flop',
  description:
    "Quando chi ha rilanciato preflop punta al flop, quante volte lasci.",
  opportunity: (hand) => {
    if (hand.wasPreflopAggressor() || !hand.sawStreet('flop')) return false
    const decision = hand.heroFirstDecision('flop')
    if (decision === undefined) return false
    const aggressor = hand.preflopAggressor()
    return hand
      .aggressionBefore('flop', decision.action.index)
      .some((view) => view.action.playerId === aggressor)
  },
  hit: (hand) => hand.heroFirstDecision('flop')?.action.kind === 'fold',
})

export const wwsf: Metric<Counter> = frequency({
  id: 'wwsf',
  label: 'Won when saw flop',
  description:
    "WWSF, «Won When Saw Flop»: delle mani in cui arrivi a vedere il flop, quante ne vinci — anche senza showdown.",
  opportunity: (hand) => hand.sawStreet('flop'),
  hit: (hand) => hand.heroWonPot(),
})

export const wtsd: Metric<Counter> = frequency({
  id: 'wtsd',
  label: 'Went to showdown',
  description:
    "WTSD, «Went To ShowDown»: delle mani in cui vedi il flop, quante finiscono con le carte scoperte. Alto vuol dire che lasci poco.",
  opportunity: (hand) => hand.sawStreet('flop'),
  hit: (hand) => hand.heroReachedShowdown(),
})

export const wsd: Metric<Counter> = frequency({
  id: 'wsd',
  label: 'Won at showdown',
  description:
    "W$SD, «Won money at ShowDown»: degli showdown a cui arrivi, quanti ne vinci. Basso vuol dire che ci arrivi con mani troppo deboli.",
  opportunity: (hand) => hand.heroReachedShowdown(),
  hit: (hand) => hand.heroWonPot(),
})

export const POSTFLOP_METRICS: readonly ErasedMetric[] = [
  cbetFlop,
  cbetTurn,
  cbetRiver,
  foldToCbetFlop,
  wwsf,
  wtsd,
  wsd,
].map(erase)
