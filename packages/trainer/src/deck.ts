/**
 * Dealing, seeded.
 *
 * Every spot the trainer shows is reproducible from its seed: the same session
 * replayed gives the same hands, which is what makes a level a level rather
 * than a different game every time, and what lets a test assert on a spot.
 */

import { card, RANKS, SUITS, type Card } from '@poker/core'
import { mulberry32 } from '@poker/equity'

/** The 52 cards, in a fixed order. */
export const DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => card(`${rank}${suit}`)))

/** One session's stream of randomness, reproducible from its seed. */
export function seeded(seed: number): () => number {
  return mulberry32(seed)
}

/** A uniform integer in [0, n). */
export function pick(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

export function choose<T>(rng: () => number, values: readonly T[]): T {
  return values[pick(rng, values.length)] as T
}

/** Fisher-Yates over a copy, so `DECK` itself stays in its fixed order. */
export function shuffled(rng: () => number, from: readonly Card[] = DECK): Card[] {
  const deck = [...from]
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = pick(rng, i + 1)
    const swap = deck[i] as Card
    deck[i] = deck[j] as Card
    deck[j] = swap
  }
  return deck
}

export interface Deal {
  readonly hero: readonly Card[]
  readonly villain: readonly Card[]
  readonly board: readonly Card[]
}

/** Two hands and a board of `boardSize` cards off one shuffle. */
export function deal(rng: () => number, boardSize: number): Deal {
  const deck = shuffled(rng)
  return {
    hero: deck.slice(0, 2),
    villain: deck.slice(2, 4),
    board: deck.slice(4, 4 + boardSize),
  }
}

/** The cards nobody has seen yet. */
export function remaining(seen: readonly Card[]): Card[] {
  const used = new Set(seen)
  return DECK.filter((value) => !used.has(value))
}

/**
 * Rejection sampling with a ceiling.
 *
 * A level describes the spots it wants by filtering random deals, which is far
 * easier to read than a constructor per kind of draw — but a filter nothing can
 * satisfy would spin forever, so the attempt count is bounded and the caller is
 * told which constraints it was. That failure is a bug in the curriculum, and
 * it should look like one.
 */
export function sample<T>(make: () => T | undefined, attempts = 4000, what = 'spot'): T {
  for (let i = 0; i < attempts; i += 1) {
    const value = make()
    if (value !== undefined) return value
  }
  throw new Error(`non riesco a generare ${what} in ${attempts} tentativi: vincoli troppo stretti`)
}
