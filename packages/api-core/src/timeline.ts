import type { HandFilter, HandStore } from '@poker/store'
import { buildTimeline, type TimelineReport } from '@poker/timeline'

import { load } from './load.js'

export interface TimelineBankrollPoint {
  readonly index: number
  readonly cumulativeBB: number
  readonly rollingBB100: number | null
}

export interface TimelineResult
  extends Omit<TimelineReport, 'bankroll'> {
  readonly bankroll: readonly TimelineBankrollPoint[]
}

/** From `GET /api/timeline`: sessions, fatigue/tilt buckets and the bankroll
 * curve for the active filter. Note that unlike `getOverview`'s bankroll
 * points, these drop `playedAt` and `netBB` -- the dashboard's timeline chart
 * never used them, and the original route never sent them either. */
export async function getTimeline(store: HandStore, filter: HandFilter): Promise<TimelineResult> {
  const hands = await load(store, filter)
  const timeline = await buildTimeline(hands)
  return {
    ...timeline,
    bankroll: timeline.bankroll.map((point) => ({
      index: point.index,
      cumulativeBB: Number(point.cumulativeBB.toFixed(2)),
      rollingBB100: point.rollingBB100 === undefined ? null : Number(point.rollingBB100.toFixed(1)),
    })),
  }
}
