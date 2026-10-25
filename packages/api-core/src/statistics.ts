import { computeMetrics, profileFor, type Profile } from '@poker/metrics'
import type { HandFilter, HandStore } from '@poker/store'

import { load } from './load.js'
import { withVerdicts } from './verdicts.js'

export interface Statistics {
  readonly hands: number
  readonly profile: Profile | null
  readonly overall: readonly unknown[]
  readonly byPosition: Readonly<Record<string, readonly unknown[]>>
}

/** From `GET /api/statistics`: overall metrics plus a breakdown by position. */
export async function getStatistics(store: HandStore, filter: HandFilter): Promise<Statistics> {
  const hands = await load(store, filter)
  const metrics = await computeMetrics(hands)
  const first = hands[0]

  return {
    hands: hands.length,
    profile: first === undefined ? null : (profileFor(first) ?? null),
    overall: withVerdicts(metrics.overall, first),
    byPosition: Object.fromEntries(
      Object.entries(metrics.byPosition).map(([position, results]) => [
        position,
        withVerdicts(results ?? [], first),
      ]),
    ),
  }
}
