import type { AnalysedHand } from './analyse.js'

export interface SelectionInput {
  readonly hands: readonly AnalysedHand[]
  readonly limit: number
  /** Which leak to gather, for the selector that groups by one. */
  readonly leakId?: string
  /** Reproducibility for the random sample. */
  readonly seed?: number
}

/**
 * A way of choosing which hands are worth looking at.
 *
 * Ten hands is already more than fits in a readable prompt, so the whole job
 * is picking the right few. Adding a way to pick is a new object in this file
 * and a line in the registry.
 */
export interface HandSelector {
  readonly id: string
  readonly label: string
  /** Shown in the dashboard so the choice explains itself. */
  readonly description: string
  select(input: SelectionInput): readonly AnalysedHand[]
}

function take(hands: readonly AnalysedHand[], limit: number): readonly AnalysedHand[] {
  return hands.slice(0, Math.max(0, limit))
}

export const biggestLosses: HandSelector = {
  id: 'biggest-losses',
  label: 'Perdite più grosse',
  description: 'I piatti persi più grandi in big blind',
  select: ({ hands, limit }) =>
    take(
      [...hands]
        .filter((hand) => hand.context.heroNetBB() < 0)
        .sort((a, b) => a.context.heroNetBB() - b.context.heroNetBB()),
      limit,
    ),
}

export const highSeverityLeaks: HandSelector = {
  id: 'high-severity-leaks',
  label: 'Leak più costosi',
  description: 'Le mani in cui le regole stimano il costo più alto',
  select: ({ hands, limit }) =>
    take(
      [...hands].filter((hand) => hand.leaks.length > 0).sort((a, b) => b.leakCostBB - a.leakCostBB),
      limit,
    ),
}

/**
 * Hands where the hero did something they almost never do.
 *
 * Rarity is measured against this sample, not against theory: folding top pair
 * is only interesting if the hero usually does not. Two signals are counted,
 * both of which the brief named, and the limitation is that a line can be
 * unusual in ways neither of them catches.
 */
export const unusualLines: HandSelector = {
  id: 'unusual-lines',
  label: 'Linee anomale',
  description: 'Mani in cui hai agito fuori dalle tue frequenze abituali',
  select: ({ hands, limit }) => {
    const threeBetRateByPosition = new Map<string, { hits: number; spots: number }>()
    for (const hand of hands) {
      const position = hand.context.heroPosition
      if (position === undefined || hand.context.preflopRaisesFacedByHero() !== 1) continue
      const tally = threeBetRateByPosition.get(position) ?? { hits: 0, spots: 0 }
      tally.spots += 1
      if (hand.context.heroFirstDecision('preflop')?.action.kind === 'raise') tally.hits += 1
      threeBetRateByPosition.set(position, tally)
    }

    const scored = hands
      .map((hand) => ({ hand, score: rarityScore(hand, threeBetRateByPosition) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || Math.abs(b.hand.context.heroNetBB()) - Math.abs(a.hand.context.heroNetBB()),
      )

    return take(
      scored.map((entry) => entry.hand),
      limit,
    )
  },
}

function rarityScore(
  hand: AnalysedHand,
  threeBetRates: ReadonlyMap<string, { hits: number; spots: number }>,
): number {
  let score = 0
  const { context } = hand

  // Folding a hand this strong is rare enough to be worth a second look.
  for (const street of ['flop', 'turn', 'river'] as const) {
    const strength = context.heroHandStrength(street)
    if (strength?.strong !== true) continue
    if (context.heroVoluntaryActions(street).some((view) => view.action.kind === 'fold')) score += 2
  }

  // A 3-bet from a seat the hero almost never 3-bets from.
  const position = context.heroPosition
  if (position !== undefined && context.preflopRaisesFacedByHero() === 1) {
    if (context.heroFirstDecision('preflop')?.action.kind === 'raise') {
      const tally = threeBetRates.get(position)
      if (tally !== undefined && tally.spots >= 4 && tally.hits / tally.spots <= 0.25) score += 1
    }
  }

  return score
}

/**
 * Spots where the answer was not obvious: the hero faced a bet needing an
 * amount of equity in the band where calling and folding are both defensible.
 * Outside that band the decision makes itself and there is nothing to discuss.
 */
export const closeSpots: HandSelector = {
  id: 'close-spots',
  label: 'Decisioni al limite',
  description: 'Spot in cui chiamare e foldare erano entrambi difendibili',
  select: ({ hands, limit }) => {
    const marginal = hands
      .map((hand) => {
        const decisions = hand.context
          .heroActions()
          .filter(
            (view) =>
              (view.action.kind === 'call' || view.action.kind === 'fold') &&
              view.requiredEquity >= 0.25 &&
              view.requiredEquity <= 0.45,
          )
        return { hand, potBB: Math.max(...decisions.map((v) => hand.context.bb(v.potBefore)), 0) }
      })
      .filter((entry) => entry.potBB > 0)
      .sort((a, b) => b.potBB - a.potBB)

    return take(
      marginal.map((entry) => entry.hand),
      limit,
    )
  },
}

export const noShowdownLosses: HandSelector = {
  id: 'no-showdown-losses',
  label: 'Perse senza showdown',
  description: 'Piatti lasciati senza arrivare allo showdown',
  select: ({ hands, limit }) =>
    take(
      [...hands]
        .filter((hand) => hand.context.heroNetBB() < 0 && !hand.context.heroReachedShowdown())
        .sort((a, b) => a.context.heroNetBB() - b.context.heroNetBB()),
      limit,
    ),
}

export const sameLeak: HandSelector = {
  id: 'same-leak',
  label: 'Stesso leak',
  description: 'Più mani con lo stesso errore, per vedere il pattern',
  select: ({ hands, limit, leakId }) => {
    if (leakId === undefined) return []
    return take(
      hands
        .filter((hand) => hand.leaks.some((leak) => leak.ruleId === leakId))
        .sort((a, b) => b.leakCostBB - a.leakCostBB),
      limit,
    )
  },
}

/**
 * A control group. Studying only the hands a rule flagged tells you nothing
 * about the hands it did not, and a coach reading only disasters will find
 * disasters everywhere.
 */
export const randomSample: HandSelector = {
  id: 'random-sample',
  label: 'Campione casuale',
  description: 'Un campione di controllo, non filtrato',
  select: ({ hands, limit, seed }) => {
    const shuffled = [...hands]
    let state = (seed ?? 1) >>> 0 || 1
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      // xorshift32: reproducible, so the same sample can be discussed twice.
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      const j = Math.abs(state) % (i + 1)
      const a = shuffled[i] as AnalysedHand
      const b = shuffled[j] as AnalysedHand
      shuffled[i] = b
      shuffled[j] = a
    }
    return take(shuffled, limit)
  },
}

export const ALL_SELECTORS: readonly HandSelector[] = [
  biggestLosses,
  highSeverityLeaks,
  unusualLines,
  closeSpots,
  noShowdownLosses,
  sameLeak,
  randomSample,
]

export function selectorById(id: string): HandSelector | undefined {
  return ALL_SELECTORS.find((selector) => selector.id === id)
}
