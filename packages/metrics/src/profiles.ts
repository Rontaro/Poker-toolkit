import type { Hand } from '@poker/core'
import { applies, type Applicability, type MetricResult } from './types.js'

import nl26max from '../profiles/nl2-6max.json' with { type: 'json' }
import nl29max from '../profiles/nl2-9max.json' with { type: 'json' }

export interface Range {
  readonly min: number
  readonly max: number
}

/**
 * Reference ranges for one kind of game.
 *
 * These live in JSON rather than in code on purpose: they are opinions about
 * how a winning player at a given format looks, they differ by stake and by
 * year, and the player should be able to disagree with them by editing a file
 * rather than by editing a parser.
 */
export interface Profile {
  readonly id: string
  readonly label: string
  readonly appliesTo?: Applicability
  readonly source?: string
  readonly ranges: Readonly<Record<string, Range>>
}

// Sorted by file name, matching the previous directory-listing order.
const PROFILES: readonly Profile[] = [nl26max, nl29max] as unknown as readonly Profile[]

export function loadProfiles(): readonly Profile[] {
  return PROFILES
}

export function profileById(id: string): Profile | undefined {
  return loadProfiles().find((profile) => profile.id === id)
}

/**
 * The profile that fits a hand. Applicability is checked against the same
 * predicate metrics use, so a 6-max profile can never be applied to a full ring
 * sample by accident.
 */
export function profileFor(hand: Hand): Profile | undefined {
  const shim = { hand } as Parameters<typeof applies>[1]
  return loadProfiles().find((profile) => applies(profile.appliesTo, shim))
}

export type Verdict = 'below' | 'within' | 'above' | 'unknown'

/**
 * Where a measured value sits against the reference. `unknown` covers both "no
 * reference for this metric" and "not enough hands to say", because showing a
 * red cell off nine hands is worse than showing nothing.
 */
export function compareToProfile(
  result: MetricResult,
  profile: Profile | undefined,
  minimumSample = 30,
): Verdict {
  const range = profile?.ranges[result.id]
  if (range === undefined || result.value === undefined) return 'unknown'
  if (result.sampleSize < minimumSample) return 'unknown'
  if (result.value < range.min) return 'below'
  if (result.value > range.max) return 'above'
  return 'within'
}
