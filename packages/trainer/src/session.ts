/**
 * Running a session: which question comes next, and what it is worth.
 *
 * A level rotates through its own exercises so that every type gets asked.
 * Endless mode does the opposite and picks on purpose: the more often you get a
 * kind of question wrong, the more often it comes back. Practising what you are
 * already good at is the most comfortable way to waste an evening.
 */

import { choose } from './deck.js'
import { tierFor, type Endless, type Level, type Tier } from './curriculum.js'
import { generateSpot } from './registry.js'
import type { Constraints, DrillId, Quality, Spot } from './types.js'

export interface DrillStat {
  readonly asked: number
  readonly right: number
  /** Total time spent answering, in milliseconds. */
  readonly ms: number
}

export type Stats = Readonly<Record<string, DrillStat>>

export const EMPTY_STAT: DrillStat = { asked: 0, right: 0, ms: 0 }

/** Undefined until there is enough of a sample to mean anything. */
export function accuracy(stats: Stats, id: DrillId, minimum = 3): number | undefined {
  const stat = stats[id]
  if (stat === undefined || stat.asked < minimum) return undefined
  return stat.right / stat.asked
}

export function record(stats: Stats, id: DrillId, correct: boolean, ms: number): Stats {
  const stat = stats[id] ?? EMPTY_STAT
  return {
    ...stats,
    [id]: { asked: stat.asked + 1, right: stat.right + (correct ? 1 : 0), ms: stat.ms + ms },
  }
}

/** The exercise the numbers say you should be doing. */
export function weakest(stats: Stats, pool: readonly DrillId[]): DrillId | undefined {
  let worst: { id: DrillId; rate: number } | undefined
  for (const id of pool) {
    const rate = accuracy(stats, id)
    if (rate === undefined) continue
    if (worst === undefined || rate < worst.rate) worst = { id, rate }
  }
  return worst?.id
}

export interface Round {
  readonly drill: DrillId
  readonly spot: Spot
  readonly constraints: Constraints
  readonly multiplier: number
  readonly tier?: Tier
}

/** Straight rotation, so a ten-question level asks each of its drills evenly. */
export function levelRound(rng: () => number, level: Level, index: number): Round {
  const drill = level.drills[index % level.drills.length] as DrillId
  const constraints = choose(rng, level.constraints)
  return { drill, spot: generateSpot(drill, rng, constraints), constraints, multiplier: 1 }
}

/**
 * Weighted towards what you are getting wrong, with a floor so that nothing
 * ever disappears from the rotation entirely. An untried exercise counts as
 * half right, which puts it above anything you are comfortable with.
 */
export function pickEndlessDrill(rng: () => number, pool: readonly DrillId[], stats: Stats): DrillId {
  const weights = pool.map((id) => 1.05 - (accuracy(stats, id) ?? 0.5))
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  let ticket = rng() * total
  for (let i = 0; i < pool.length; i += 1) {
    ticket -= weights[i] as number
    if (ticket <= 0) return pool[i] as DrillId
  }
  return pool[pool.length - 1] as DrillId
}

export function endlessRound(
  rng: () => number,
  endless: Endless,
  stats: Stats,
  streak: number,
): Round {
  const tier = tierFor(streak, endless.tiers)
  const drill = pickEndlessDrill(rng, endless.drills, stats)
  return {
    drill,
    spot: generateSpot(drill, rng, tier.constraints),
    constraints: tier.constraints,
    multiplier: tier.multiplier,
    tier,
  }
}

/**
 * Points. Spot on is worth more than close, and a streak is worth more than any
 * single answer — because the thing being trained is consistency, not luck with
 * one estimate.
 */
export function pointsFor(quality: Quality, multiplier: number, streak: number): number {
  const base = quality === 'perfect' ? 100 : quality === 'close' ? 40 : 0
  if (base === 0) return 0
  return Math.round((base + 10 * Math.min(streak, 10)) * multiplier)
}
