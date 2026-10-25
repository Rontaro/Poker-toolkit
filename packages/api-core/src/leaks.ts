import { analyse } from '@poker/prompt-builder'
import { ALL_RULES, type LeakEvent, type LeakSummary } from '@poker/rules'
import type { HandFilter, HandStore } from '@poker/store'

import { load } from './load.js'

export interface LeakEventJson extends LeakEvent {
  readonly playedAt: string | null
  readonly position: string | null
  readonly netBB: number
}

export interface LeaksResult {
  readonly rules: readonly { id: string; label: string; why: string }[]
  readonly byRule: readonly LeakSummary[]
  readonly events: readonly LeakEventJson[]
}

/** From `GET /api/leaks`: every leak rule's definition plus the events it fired on this sample. */
export async function getLeaks(store: HandStore, filter: HandFilter): Promise<LeaksResult> {
  const hands = await load(store, filter)
  const sample = await analyse(hands)

  return {
    rules: ALL_RULES.map((rule) => ({ id: rule.id, label: rule.label, why: rule.why })),
    byRule: sample.report.byRule,
    events: sample.report.events.map((event) => {
      const hand = sample.hands.find((entry) => entry.context.hand.id === event.handId)
      return {
        ...event,
        playedAt: hand?.context.hand.playedAt.toISOString() ?? null,
        position: hand?.context.heroPosition ?? null,
        netBB: Number((hand?.context.heroNetBB() ?? 0).toFixed(2)),
      }
    }),
  }
}
