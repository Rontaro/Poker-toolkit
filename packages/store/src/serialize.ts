import { Money, heroSeat, type Chips, type Hand } from '@poker/core'

/**
 * `Hand` round-trips through `JSON.stringify`/`parse` almost for free: `Chips`
 * is a branded plain number so it survives untouched, and every other field
 * is already string/number/array/object. The one place JSON lies is `Date` --
 * `playedAt` comes back as an ISO string, not a `Date` -- so the reviver
 * below re-wraps exactly that key. Nothing else in `Hand` is a `Date`.
 */
export function serializeHand(hand: Hand): string {
  return JSON.stringify(hand)
}

export function hydrateHand(json: string): Hand {
  return JSON.parse(json, (key, value: unknown) =>
    key === 'playedAt' && typeof value === 'string' ? new Date(value) : value,
  ) as Hand
}

/** The subset of `Hand` promoted to real columns, in the exact shape
 * `node:sqlite`'s named-parameter binding wants. The index signature is
 * there only so this satisfies `Record<string, SQLInputValue>` when bound --
 * every field is still named and typed below. */
export interface HandRow {
  readonly [column: string]: string | number | null
  readonly id: string
  readonly site: string
  readonly hero: string | null
  readonly game_type: string
  readonly variant: string
  readonly table_size: number
  readonly stakes_bb: number
  readonly stakes_currency: string
  readonly played_at: number
  readonly played_at_local: string
  readonly hero_dealt_in: number
  readonly hero_net: number | null
  readonly data: string
}

export function toHandRow(hand: Hand): HandRow {
  const hero = hand.hero
  const heroNet: Chips | undefined = hero === undefined ? undefined : hand.results.net[hero]

  return {
    id: hand.id,
    site: hand.source.site,
    hero: hero ?? null,
    game_type: hand.game.type,
    variant: hand.game.variant,
    table_size: hand.table.maxSeats,
    stakes_bb: hand.game.stakes.bb,
    stakes_currency: hand.game.stakes.currency,
    played_at: hand.playedAt.getTime(),
    played_at_local: hand.playedAtLocal,
    hero_dealt_in: heroSeat(hand)?.dealtIn === true ? 1 : 0,
    hero_net: heroNet ?? null,
    data: serializeHand(hand),
  }
}

export function toChips(units: number): Chips {
  return Money.chips(units)
}
