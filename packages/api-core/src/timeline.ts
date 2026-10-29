import type { HandFilter, HandStore } from '@poker/store'
import { buildTimeline, type TimelineReport } from '@poker/timeline'

import { load } from './load.js'

export interface TimelineBankrollPoint {
  readonly index: number
  readonly cumulativeBB: number
  readonly rollingBB100: number | null
}

/** The tilt report as it crosses JSON: `ratio` is `null`, not absent, when there
 * is nothing to compare against (no baseline, or no hand after a shock). */
export interface TimelineTilt extends Omit<TimelineReport['tilt'], 'ratio'> {
  readonly ratio: number | null
}

export interface TimelineResult
  extends Omit<TimelineReport, 'bankroll' | 'tilt'> {
  readonly tilt: TimelineTilt
  readonly bankroll: readonly TimelineBankrollPoint[]
}

/** From `GET /api/timeline`: sessions, fatigue/tilt buckets and the bankroll
 * curve for the active filter. Note that unlike `getOverview`'s bankroll
 * points, these drop `playedAt` -- the dashboard's timeline chart never used
 * it, and the original route never sent it either. (Neither function's
 * bankroll points ever included `netBB`.) */
export async function getTimeline(store: HandStore, filter: HandFilter): Promise<TimelineResult> {
  const hands = await load(store, filter)
  const timeline = await buildTimeline(hands)
  return {
    ...timeline,
    // `undefined` would vanish over JSON, and the view tests for `null`.
    tilt: { ...timeline.tilt, ratio: timeline.tilt.ratio ?? null },
    bankroll: timeline.bankroll.map((point) => ({
      index: point.index,
      cumulativeBB: Number(point.cumulativeBB.toFixed(2)),
      rollingBB100: point.rollingBB100 === undefined ? null : Number(point.rollingBB100.toFixed(1)),
    })),
  }
}
