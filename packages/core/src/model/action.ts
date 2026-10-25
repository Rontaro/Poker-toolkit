import type { Card } from '../cards/card.js'
import type { Chips } from '../money/chips.js'

export type StreetName = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export const BETTING_STREETS = ['preflop', 'flop', 'turn', 'river'] as const

export type ActionKind =
  | 'post-sb'
  | 'post-bb'
  | 'post-ante'
  | 'post-dead'
  | 'straddle'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'show'
  | 'muck'
  | 'no-show'

/** Kinds that move chips into the pot. */
export const COMMITTING_KINDS: readonly ActionKind[] = [
  'post-sb',
  'post-bb',
  'post-ante',
  'post-dead',
  'straddle',
  'call',
  'bet',
  'raise',
]

/** Kinds that represent a voluntary aggressive bet. */
export const AGGRESSIVE_KINDS: readonly ActionKind[] = ['bet', 'raise']

export interface Action {
  /** Ordinal across the whole hand, so actions stay comparable across streets. */
  readonly index: number
  readonly street: StreetName
  readonly playerId: string
  readonly kind: ActionKind

  /**
   * The amount as the site printed it: the call/bet size, or for a raise the
   * increment (`raises 0.04 to 0.06` -> 0.04). Absent for fold/check/show.
   */
  readonly amount?: Chips

  /** Total street commitment after the action, for raises (`to 0.06`). */
  readonly toAmount?: Chips

  /**
   * Chips this action actually moves from the player's stack into the pot,
   * after accounting for what they already had in on this street. This is the
   * number pot maths uses; `amount` is kept only for fidelity to the source.
   */
  readonly contributed: Chips

  readonly isAllIn: boolean

  /** Cards revealed by a `show`. */
  readonly cards?: readonly Card[]

  /** The site's own description of the holding, kept verbatim, never parsed
   * for strength: "two pair, Eights and Sixes". */
  readonly handDescription?: string
}

export interface Street {
  readonly name: StreetName
  /** Cards revealed on this street: three for the flop, one for turn/river. */
  readonly board: readonly Card[]
  readonly actions: readonly Action[]
  /** Board index when a hand is run more than once; absent for a single run. */
  readonly runIndex?: number
}
