/** Pot sizes that look like a real hand: round numbers, believable bets. */

import { choose, pick } from '../deck.js'
import { roundTo } from '../math.js'
import type { Constraints } from '../types.js'

const DEFAULT_FRACTIONS = [0.25, 0.33, 0.5, 0.66, 0.75, 1] as const

export interface Money {
  /** What was in the middle before anyone bet on this street. */
  readonly pot: number
  readonly bet: number
  readonly fraction: number
}

export function money(rng: () => number, constraints: Constraints): Money {
  const [low, high] = constraints.potRange ?? [4, 40]
  const pot = roundTo(low + pick(rng, Math.max(1, Math.round(high - low) + 1)), 0.5)
  const fraction = choose(rng, constraints.betFractions ?? DEFAULT_FRACTIONS)
  const bet = Math.max(0.5, roundTo(pot * fraction, 0.5))
  return { pot, bet, fraction }
}

/** Half the pot is said as `metà piatto` at the table, not as a fraction. */
export function sizeName(fraction: number): string {
  if (fraction <= 0.3) return 'un quarto del piatto'
  if (fraction <= 0.4) return 'un terzo del piatto'
  if (fraction <= 0.55) return 'metà piatto'
  if (fraction <= 0.7) return 'due terzi del piatto'
  if (fraction <= 0.85) return 'tre quarti del piatto'
  if (fraction <= 1.1) return 'il piatto intero'
  return 'più del piatto'
}
