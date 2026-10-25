import type { Card } from '../cards/card.js'
import type { Chips } from '../money/chips.js'
import type { Position } from '../table/position.js'
import type { Street } from './action.js'
import type { Game } from './game.js'

declare const HAND_ID: unique symbol
export type HandId = string & { readonly [HAND_ID]: true }

export interface Seat {
  readonly seat: number
  readonly playerId: string
  /** Stack at the moment the hand was dealt. */
  readonly stack: Chips
  readonly isHero: boolean
  /** Present at the table but not in this hand. */
  readonly sittingOut: boolean
  /** Took part in the hand and therefore has a position. */
  readonly dealtIn: boolean
  readonly position?: Position
  /** Known hole cards: always for the hero, for others only when revealed. */
  readonly holeCards?: readonly Card[]
  /** Knockout tournaments. */
  readonly bounty?: Chips
}

export interface Pot {
  readonly kind: 'main' | 'side'
  /** 0 for the main pot, 1..n for side pots in the order the site lists them. */
  readonly index: number
  readonly amount: Chips
  readonly winners: readonly string[]
}

export interface Showdown {
  readonly playerId: string
  readonly cards: readonly Card[]
  readonly description?: string
  /** `mucked` still carries cards when the summary revealed them. */
  readonly revealed: 'shown' | 'mucked'
}

export interface UncalledReturn {
  readonly playerId: string
  readonly amount: Chips
}

export interface HandResults {
  readonly pots: readonly Pot[]
  readonly rake: Chips
  /** As reported by the site, before the rake is taken out. */
  readonly totalPot: Chips
  readonly uncalledReturns: readonly UncalledReturn[]
  readonly showdown: readonly Showdown[]
  /** Net chips won or lost per player over the hand. Keyed by player id. */
  readonly net: Readonly<Record<string, Chips>>
}

export interface HandSource {
  readonly site: string
  readonly siteHandId: string
  /** Language the hand history was written in, as detected. */
  readonly language: string
  /** Original text, kept when the caller asks for it. */
  readonly raw?: string
}

export interface Table {
  readonly name: string
  readonly maxSeats: number
  readonly buttonSeat: number
}

export interface Hand {
  /** Stable content hash, not the site's id: two sites could collide. */
  readonly id: HandId
  readonly source: HandSource

  /** Absolute instant the hand was played. */
  readonly playedAt: Date
  /** Wall-clock time as the client printed it, `YYYY-MM-DDTHH:mm:ss`. Time of
   * day analysis uses this, not the UTC instant. */
  readonly playedAtLocal: string
  /** Timezone label from the history, e.g. `CET`. */
  readonly playedAtTz: string

  readonly game: Game
  readonly table: Table

  /** Player id of the history's owner, when the file identifies one. */
  readonly hero?: string

  readonly seats: readonly Seat[]
  /** Ordered, one entry per street actually played. */
  readonly streets: readonly Street[]
  readonly results: HandResults
}

export function seatOf(hand: Hand, playerId: string): Seat | undefined {
  return hand.seats.find((s) => s.playerId === playerId)
}

export function heroSeat(hand: Hand): Seat | undefined {
  return hand.seats.find((s) => s.isHero)
}

export function dealtInSeats(hand: Hand): Seat[] {
  return hand.seats.filter((s) => s.dealtIn)
}
