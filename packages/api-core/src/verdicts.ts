import type { Hand } from '@poker/core'
import { compareToProfile, profileFor, type MetricResult } from '@poker/metrics'

/** Attaches a below/within/above/unknown verdict to each metric, against the
 * profile that fits the first hand in the sample. */
export function withVerdicts(results: readonly MetricResult[], hand: Hand | undefined): unknown[] {
  const profile = hand === undefined ? undefined : profileFor(hand)
  return results.map((result) => ({ ...result, verdict: compareToProfile(result, profile) }))
}
