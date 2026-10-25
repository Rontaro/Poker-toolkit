/** Cards are stored in the site-independent `Rs` form: rank then suit, e.g. `Ad`. */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export const SUITS = ['c', 'd', 'h', 's'] as const

export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]

declare const CARD: unique symbol
export type Card = string & { readonly [CARD]: true }

export class CardFormatError extends Error {}

const RANK_INDEX: ReadonlyMap<string, number> = new Map(RANKS.map((r, i) => [r, i]))

export function isCard(value: string): boolean {
  if (value.length !== 2) return false
  return RANK_INDEX.has(value[0] as string) && (SUITS as readonly string[]).includes(value[1] as string)
}

/** Normalises `10h`/`AD`/`ad` to the canonical `Ts`/`Ad` form. */
export function card(value: string): Card {
  const trimmed = value.trim()
  const normalised = (trimmed.length === 3 && trimmed.startsWith('10') ? `T${trimmed[2]}` : trimmed)
  if (normalised.length !== 2) throw new CardFormatError(`Not a card: ${JSON.stringify(value)}`)
  const out = `${normalised[0]?.toUpperCase()}${normalised[1]?.toLowerCase()}`
  if (!isCard(out)) throw new CardFormatError(`Not a card: ${JSON.stringify(value)}`)
  return out as Card
}

/** Parses a whitespace-separated card list, as found inside `[Ad 2d]`. */
export function cards(value: string): Card[] {
  const tokens = value.trim().split(/\s+/).filter((t) => t !== '')
  return tokens.map(card)
}

export function rankOf(c: Card): Rank {
  return c[0] as Rank
}

export function suitOf(c: Card): Suit {
  return c[1] as Suit
}

/** 0 for a deuce, 12 for an ace. */
export function rankValue(c: Card): number {
  return RANK_INDEX.get(rankOf(c)) ?? -1
}
