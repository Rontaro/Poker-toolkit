/**
 * The course: which exercises come in which order, and what to read first.
 *
 * It is a JSON file for the same reason the metric ranges are: the order to
 * learn things in is an opinion, and someone who disagrees with it should be
 * able to reorder the levels without opening a TypeScript file.
 */

import raw from '../config/curriculum.json'
import type { Constraints, DrillId } from './types.js'

export interface Level {
  readonly id: string
  readonly title: string
  /** What you should be able to do afterwards. */
  readonly goal: string
  /** Read before playing: the base, and the arithmetic. */
  readonly theory: readonly string[]
  readonly drills: readonly DrillId[]
  readonly questions: number
  /** Right answers needed to clear it. */
  readonly pass: number
  /** One is drawn per question, so a level can mix flop and turn. */
  readonly constraints: readonly Constraints[]
}

export interface Tier {
  /** Streak at which this tier starts. */
  readonly from: number
  readonly label: string
  readonly multiplier: number
  readonly constraints: Constraints
}

export interface Endless {
  readonly label: string
  readonly goal: string
  readonly theory: readonly string[]
  readonly drills: readonly DrillId[]
  readonly tiers: readonly Tier[]
}

export interface Curriculum {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly levels: readonly Level[]
  readonly endless: Endless
}

export const CURRICULUM = raw as unknown as Curriculum
export const LEVELS: readonly Level[] = CURRICULUM.levels
export const ENDLESS: Endless = CURRICULUM.endless

export function levelById(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id)
}

/** The hardest tier the streak has reached. */
export function tierFor(streak: number, tiers: readonly Tier[] = ENDLESS.tiers): Tier {
  let current = tiers[0] as Tier
  for (const tier of tiers) if (streak >= tier.from) current = tier
  return current
}
