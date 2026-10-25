import type { Hand } from '@poker/core'
import { computeMetrics, profileFor, vpipPfrGap, type Profile } from '@poker/metrics'
import { detectLeaks, type LeakSummary } from '@poker/rules'
import type { HandFilter, HandStore } from '@poker/store'
import { buildTimeline } from '@poker/timeline'

import { load } from './load.js'
import { withVerdicts } from './verdicts.js'

export interface OverviewBankrollPoint {
  readonly index: number
  readonly cumulativeBB: number
  readonly rollingBB100: number | null
  readonly playedAt: string
}

export interface EmptyOverview {
  readonly empty: true
  readonly hands: 0
}

export interface Overview {
  readonly empty: false
  readonly hands: number
  readonly profile: Profile | null
  readonly metrics: readonly unknown[]
  readonly gap: number | null
  readonly leaks: readonly LeakSummary[]
  readonly totalCostBB: number
  readonly bankroll: readonly OverviewBankrollPoint[]
  readonly sessions: number
}

export type OverviewResult = EmptyOverview | Overview

/** From `GET /api/overview`: the headline numbers for the active filter. */
export async function getOverview(store: HandStore, filter: HandFilter): Promise<OverviewResult> {
  const hands = await load(store, filter)
  if (hands.length === 0) return { empty: true, hands: 0 }

  const [metrics, leaks, timeline] = await Promise.all([
    computeMetrics(hands, { byPosition: false }),
    detectLeaks(hands),
    buildTimeline(hands),
  ])

  return {
    empty: false,
    hands: hands.length,
    profile: profileFor(hands[0] as Hand) ?? null,
    metrics: withVerdicts(metrics.overall, hands[0]),
    gap: vpipPfrGap(metrics.overall) ?? null,
    leaks: leaks.byRule,
    totalCostBB: leaks.totalCostBB,
    bankroll: timeline.bankroll.map((point) => ({
      index: point.index,
      cumulativeBB: Number(point.cumulativeBB.toFixed(2)),
      rollingBB100: point.rollingBB100 === undefined ? null : Number(point.rollingBB100.toFixed(1)),
      playedAt: point.playedAt.toISOString(),
    })),
    sessions: timeline.sessions.length,
  }
}
