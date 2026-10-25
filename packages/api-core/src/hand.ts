import type { HandId } from '@poker/core'
import { analyse, renderHand } from '@poker/prompt-builder'
import type { LeakEvent } from '@poker/rules'
import type { HandNote, HandStore } from '@poker/store'

import { fail, ok, type ApiResult } from './errors.js'
import { load } from './load.js'

export interface HandDetail {
  readonly id: HandId
  readonly replay: string
  readonly leaks: readonly LeakEvent[]
  readonly notes: readonly HandNote[]
}

const NOT_FOUND = 'mano non trovata'

/** From `GET /api/hand/:id`: one hand, replayed in the same prose the prompts use. */
export async function getHand(store: HandStore, handId: HandId): Promise<ApiResult<HandDetail>> {
  const hands = await load(store, { handIds: [handId] })
  if (hands.length === 0) return fail(404, NOT_FOUND)

  const sample = await analyse(hands)
  const analysed = sample.hands[0]
  if (analysed === undefined) return fail(404, NOT_FOUND)

  return ok({
    id: handId,
    replay: renderHand(analysed),
    leaks: analysed.leaks,
    notes: await store.listNotesForHand(handId),
  })
}
