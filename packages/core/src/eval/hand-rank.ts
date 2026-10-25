/**
 * Five to seven card hand evaluation.
 *
 * Every hand collapses to one integer, so comparing two holdings is a single
 * `>`. The integer packs the category in the high bits and five tie-break
 * ranks in four bits each, which is exactly how poker comparison works:
 * category first, then card by card.
 *
 * No lookup tables. A table would be faster, but the equity enumerator runs a
 * few hundred thousand evaluations per spot rather than a few hundred million,
 * and a table nobody can read is a table nobody can check.
 */

import { rankValue, suitOf, type Card } from '../cards/card.js'

export const CATEGORIES = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
] as const

export type HandCategory = (typeof CATEGORIES)[number]

const HIGH_CARD = 0
const PAIR = 1
const TWO_PAIR = 2
const TRIPS = 3
const STRAIGHT = 4
const FLUSH = 5
const FULL_HOUSE = 6
const QUADS = 7
const STRAIGHT_FLUSH = 8

/** Ace-low straight: the five is the top card, and the ace plays below the deuce. */
const WHEEL = [12, 3, 2, 1, 0]

export class EvaluationError extends Error {}

/**
 * A comparable score. Higher always beats lower, and equal scores are a genuine
 * tie, so a split pot needs no special case.
 */
export type HandScore = number

export function categoryOf(score: HandScore): HandCategory {
  return CATEGORIES[score >>> 20] as HandCategory
}

/** The five tie-break ranks, strongest first. */
export function kickersOf(score: HandScore): number[] {
  return [16, 12, 8, 4, 0].map((shift) => (score >>> shift) & 0xf)
}

function pack(category: number, ranks: readonly number[]): HandScore {
  let score = category << 20
  for (let i = 0; i < 5; i += 1) score |= (ranks[i] ?? 0) << (16 - i * 4)
  return score
}

/**
 * Scores the best five-card hand available from five to seven cards.
 *
 * The categories are computed independently and the best score wins, rather
 * than being checked in priority order. Packing the category into the high
 * bits makes "best category, then best kickers" fall out of a single `max`.
 */
export function evaluate(cards: readonly Card[]): HandScore {
  if (cards.length < 5 || cards.length > 7) {
    throw new EvaluationError(`evaluate() takes five to seven cards, got ${cards.length}`)
  }

  const ranks = cards.map(rankValue)
  const rankCounts = new Array<number>(13).fill(0)
  for (const rank of ranks) rankCounts[rank] = (rankCounts[rank] as number) + 1

  const bySuit = new Map<string, number[]>()
  for (const card of cards) {
    const suit = suitOf(card)
    const bucket = bySuit.get(suit)
    if (bucket === undefined) bySuit.set(suit, [rankValue(card)])
    else bucket.push(rankValue(card))
  }

  let best = scoreByRankCounts(rankCounts)

  const straightHigh = findStraightHigh(new Set(ranks))
  if (straightHigh !== undefined) best = Math.max(best, pack(STRAIGHT, [straightHigh]))

  for (const suited of bySuit.values()) {
    if (suited.length < 5) continue
    const descending = [...suited].sort((a, b) => b - a)
    best = Math.max(best, pack(FLUSH, descending.slice(0, 5)))

    const flushStraight = findStraightHigh(new Set(suited))
    if (flushStraight !== undefined) best = Math.max(best, pack(STRAIGHT_FLUSH, [flushStraight]))
  }

  return best
}

/** Everything that depends only on how often each rank appears. */
function scoreByRankCounts(rankCounts: readonly number[]): HandScore {
  const of = (n: number): number[] => {
    const found: number[] = []
    for (let rank = 12; rank >= 0; rank -= 1) if (rankCounts[rank] === n) found.push(rank)
    return found
  }

  const quads = of(4)
  const trips = of(3)
  const pairs = of(2)
  const singles = of(1)

  const first = quads[0]
  if (first !== undefined) {
    const kicker = [...trips, ...pairs, ...singles, ...quads.slice(1)].sort((a, b) => b - a)[0] ?? 0
    return pack(QUADS, [first, kicker])
  }

  const trip = trips[0]
  if (trip !== undefined) {
    // A second set of trips plays as the pair half of a full house.
    const pairRank = trips[1] ?? pairs[0]
    if (pairRank !== undefined) return pack(FULL_HOUSE, [trip, pairRank])
    return pack(TRIPS, [trip, ...singles.slice(0, 2)])
  }

  const high = pairs[0]
  const low = pairs[1]
  if (high !== undefined && low !== undefined) {
    const kicker = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0] ?? 0
    return pack(TWO_PAIR, [high, low, kicker])
  }

  if (high !== undefined) return pack(PAIR, [high, ...singles.slice(0, 3)])

  return pack(HIGH_CARD, singles.slice(0, 5))
}

/**
 * The top card of the best straight in a rank set, or undefined. For the wheel
 * the top card is the five, which is why the ace is not simply "rank 12 or -1"
 * but a separate case.
 */
export function findStraightHigh(ranks: ReadonlySet<number>): number | undefined {
  for (let high = 12; high >= 4; high -= 1) {
    let complete = true
    for (let step = 0; step < 5; step += 1) {
      if (!ranks.has(high - step)) {
        complete = false
        break
      }
    }
    if (complete) return high
  }
  return WHEEL.every((rank) => ranks.has(rank)) ? 3 : undefined
}

/** Sorts holdings best first. Ties keep their input order. */
export function compareScores(a: HandScore, b: HandScore): number {
  return b - a
}
