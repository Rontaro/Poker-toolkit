/**
 * What the hero actually holds, in the terms a poker player would use.
 *
 * `evaluate()` answers "who wins"; this answers "what have I got", which is a
 * different question and the one the leak rules ask. A rule that fires on "top
 * pair or better" cannot work from a score alone: top pair and bottom pair are
 * the same category.
 */

import { rankValue, suitOf, type Card, type Rank, RANKS } from '../cards/card.js'
import { categoryOf, evaluate, findStraightHigh, type HandCategory, type HandScore } from './hand-rank.js'

export type MadeHand =
  | 'nothing'
  | 'ace-high'
  | 'underpair'
  | 'bottom-pair'
  | 'middle-pair'
  | 'second-pair'
  | 'top-pair'
  | 'overpair'
  | 'two-pair'
  | 'set'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush'

export interface Draws {
  /** Four to a flush, with at least one of them in the hero's hand. */
  readonly flush: boolean
  /** Two or more ranks complete the straight. */
  readonly openEnded: boolean
  /** Exactly one rank completes it. */
  readonly gutshot: boolean
}

export interface HandStrength {
  readonly score: HandScore
  readonly category: HandCategory
  readonly made: MadeHand
  /** The unpaired hole card, when the hero holds one pair. */
  readonly kicker?: Rank
  /** The kicker is the best one still available given the board. */
  readonly topKicker: boolean
  readonly draws: Draws
  /** True from top pair upwards: the threshold the value-betting rules use. */
  readonly strong: boolean
  /** River only: the hero's cards add nothing to the five on the board. */
  readonly playsTheBoard: boolean
}

const MADE_FROM_CATEGORY: Partial<Record<HandCategory, MadeHand>> = {
  straight: 'straight',
  flush: 'flush',
  'full-house': 'full-house',
  quads: 'quads',
  'straight-flush': 'straight-flush',
}

const STRONG_MADE: ReadonlySet<MadeHand> = new Set<MadeHand>([
  'top-pair',
  'overpair',
  'two-pair',
  'set',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
])

/**
 * Describes a two-card holding against a board of three, four or five cards.
 * Preflop has no board and no made hand, so callers ask for strength only from
 * the flop on.
 */
export function describeStrength(hole: readonly Card[], board: readonly Card[]): HandStrength {
  if (hole.length !== 2) {
    throw new RangeError(`describeStrength() expects two hole cards, got ${hole.length}`)
  }
  if (board.length < 3 || board.length > 5) {
    throw new RangeError(`describeStrength() expects a board of three to five cards, got ${board.length}`)
  }

  const score = evaluate([...hole, ...board])
  const category = categoryOf(score)
  const holeRanks = hole.map(rankValue)
  const boardRanks = board.map(rankValue)
  const distinctBoard = [...new Set(boardRanks)].sort((a, b) => b - a)

  const made = classify(category, holeRanks, boardRanks, distinctBoard)
  const kicker = kickerOf(made, holeRanks, boardRanks)

  return {
    score,
    category,
    made,
    ...(kicker === undefined ? {} : { kicker: RANKS[kicker] as Rank }),
    topKicker: kicker !== undefined && kicker === bestAvailableKicker(holeRanks, boardRanks),
    draws: findDraws(hole, board),
    strong: STRONG_MADE.has(made),
    playsTheBoard: board.length === 5 && evaluate(board) === score,
  }
}

function classify(
  category: HandCategory,
  holeRanks: readonly number[],
  boardRanks: readonly number[],
  distinctBoard: readonly number[],
): MadeHand {
  const fromCategory = MADE_FROM_CATEGORY[category]
  if (fromCategory !== undefined) return fromCategory

  const pocketPair = holeRanks[0] === holeRanks[1]
  const pocket = holeRanks[0] as number

  if (category === 'trips') {
    // Three of a kind from a pocket pair is a set; from one hole card against
    // a paired board it is trips. Players play the two very differently.
    return pocketPair && boardRanks.includes(pocket) ? 'set' : 'trips'
  }

  if (category === 'two-pair') return 'two-pair'

  if (category === 'pair') {
    if (pocketPair) {
      if (boardRanks.includes(pocket)) return 'set'
      return pocket > (distinctBoard[0] as number) ? 'overpair' : 'underpair'
    }

    const paired = holeRanks.find((rank) => boardRanks.includes(rank))
    if (paired === undefined) {
      // The pair is on the board and the hero has nothing to do with it.
      return holeRanks.includes(12) ? 'ace-high' : 'nothing'
    }

    const position = distinctBoard.indexOf(paired)
    if (position === 0) return 'top-pair'
    if (position === 1) return 'second-pair'
    return position === distinctBoard.length - 1 ? 'bottom-pair' : 'middle-pair'
  }

  return holeRanks.includes(12) ? 'ace-high' : 'nothing'
}

function kickerOf(
  made: MadeHand,
  holeRanks: readonly number[],
  boardRanks: readonly number[],
): number | undefined {
  const paired: MadeHand[] = ['top-pair', 'second-pair', 'middle-pair', 'bottom-pair']
  if (!paired.includes(made)) return undefined
  const matched = holeRanks.find((rank) => boardRanks.includes(rank))
  return holeRanks.find((rank) => rank !== matched)
}

/** The best kicker the board still leaves available. */
function bestAvailableKicker(
  holeRanks: readonly number[],
  boardRanks: readonly number[],
): number | undefined {
  const matched = holeRanks.find((rank) => boardRanks.includes(rank))
  for (let rank = 12; rank >= 0; rank -= 1) {
    if (rank !== matched && !boardRanks.includes(rank)) return rank
  }
  return undefined
}

/**
 * Draws the hero holds that the board does not already hold on its own. A
 * flush draw sitting entirely on the board is everyone's draw, not the hero's,
 * and must not be counted as a reason to keep betting.
 */
function findDraws(hole: readonly Card[], board: readonly Card[]): Draws {
  const none: Draws = { flush: false, openEnded: false, gutshot: false }
  if (board.length >= 5) return none

  const all = [...hole, ...board]
  const suitCounts = new Map<string, number>()
  for (const card of all) suitCounts.set(suitOf(card), (suitCounts.get(suitOf(card)) ?? 0) + 1)

  const drawSuit = [...suitCounts.entries()].find(([, count]) => count === 4)?.[0]
  const flush = drawSuit !== undefined && hole.some((card) => suitOf(card) === drawSuit)

  const allRanks = new Set(all.map(rankValue))
  const boardRanks = new Set(board.map(rankValue))

  // Already there: a made straight is not a draw to one.
  if (findStraightHigh(allRanks) !== undefined) return { flush, openEnded: false, gutshot: false }

  const heroOuts = completingRanks(allRanks)
  const boardOuts = completingRanks(boardRanks)
  const gained = heroOuts - boardOuts

  return { flush, openEnded: gained >= 2, gutshot: gained === 1 }
}

/** How many ranks, if they landed, would complete a straight. */
function completingRanks(ranks: ReadonlySet<number>): number {
  let count = 0
  for (let rank = 0; rank <= 12; rank += 1) {
    if (ranks.has(rank)) continue
    if (findStraightHigh(new Set([...ranks, rank])) !== undefined) count += 1
  }
  return count
}

export type Suitedness = 'rainbow' | 'two-tone' | 'monotone'

export interface BoardTexture {
  readonly suitedness: Suitedness
  readonly paired: boolean
  /** Pairs of distinct board cards no more than two ranks apart. */
  readonly connections: number
  readonly highRank: Rank
  /**
   * 0 for a board nobody can have connected with, up to 3 for one where
   * everything gets there. Rules read this rather than the parts, so their
   * threshold stays a number in a config file.
   */
  readonly wetness: number
}

export function describeBoard(board: readonly Card[]): BoardTexture {
  if (board.length < 3) throw new RangeError('describeBoard() needs at least a flop')

  const ranks = board.map(rankValue)
  const distinct = [...new Set(ranks)].sort((a, b) => b - a)

  const suitCounts = new Map<string, number>()
  for (const card of board) suitCounts.set(suitOf(card), (suitCounts.get(suitOf(card)) ?? 0) + 1)
  const topSuit = Math.max(...suitCounts.values())

  const suitedness: Suitedness =
    topSuit >= board.length ? 'monotone' : topSuit >= 2 ? 'two-tone' : 'rainbow'

  let connections = 0
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      if ((distinct[i] as number) - (distinct[j] as number) <= 2) connections += 1
    }
  }

  const suitPoints = suitedness === 'monotone' ? 2 : suitedness === 'two-tone' ? 1 : 0
  const connectPoints = connections >= 2 ? 2 : connections === 1 ? 1 : 0

  return {
    suitedness,
    paired: distinct.length < ranks.length,
    connections,
    highRank: RANKS[distinct[0] as number] as Rank,
    wetness: Math.min(3, suitPoints + connectPoints),
  }
}
