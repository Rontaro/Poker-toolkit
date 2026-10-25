import { HandContext, type Card, type HandId, type StreetName } from '@poker/core'
import { comboOf, handVsRange, parseRange } from '@poker/equity'
import type { HandStore } from '@poker/store'

import { fail, ok, type ApiResult } from './errors.js'
import { load } from './load.js'

/** Wide enough to mean something at micro stakes, where people call too much. */
export const DEFAULT_RANGE = '22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, A9o+, KTo+, QJo'

export interface HandEquityStreet {
  readonly street: StreetName
  readonly board: readonly Card[]
  readonly equity: number
  readonly exhaustive: boolean
  readonly samples: number
  /** What the pot was offering when the hero last had to call on this
   * street, so the equity has something to be measured against. */
  readonly requiredEquity: number | null
}

export interface HandEquityNoHole {
  readonly range: string
  readonly streets: readonly []
  readonly note: string
}

export interface HandEquityWithHole {
  readonly range: string
  readonly hero: readonly Card[]
  readonly streets: readonly HandEquityStreet[]
}

export type HandEquityResult = HandEquityNoHole | HandEquityWithHole

/**
 * Hero's equity street by street, against a range the player types.
 *
 * From `GET /api/hand/:id/equity`. An unparsable range and a missing hand are
 * both expected failures and come back as `ApiResult` errors, not thrown
 * exceptions; a hand whose hero cards are not known is not an error at all --
 * the original route answered it with a 200 carrying an explanatory note, and
 * this keeps doing the same.
 */
export async function getHandEquity(
  store: HandStore,
  handId: HandId,
  rangeNotation: string,
): Promise<ApiResult<HandEquityResult>> {
  const parsed = parseRange(rangeNotation)
  if (!parsed.ok) {
    return fail(400, parsed.errors.map((issue) => issue.message).join('; '))
  }

  const hands = await load(store, { handIds: [handId] })
  const hand = hands[0]
  if (hand === undefined) return fail(404, 'mano non trovata')

  const context = new HandContext(hand)
  const hole = context.hero?.holeCards
  if (hole === undefined || hole.length !== 2) {
    return ok({ range: rangeNotation, streets: [], note: 'carte di Hero non note' })
  }

  const hero = comboOf(hole[0] as never, hole[1] as never)
  const streets: HandEquityStreet[] = []

  for (const street of ['flop', 'turn', 'river'] as StreetName[]) {
    const board = context.boardAt(street)
    if (board.length < 3) continue

    const result = handVsRange(hero, parsed.value, board)
    const mine = result.players[0]
    if (mine === undefined) continue

    streets.push({
      street,
      board,
      equity: Number((mine.equity * 100).toFixed(1)),
      exhaustive: mine.exhaustive ?? false,
      samples: mine.samples,
      requiredEquity: requiredEquityOn(context, street),
    })
  }

  return ok({ range: rangeNotation, hero: hole, streets })
}

function requiredEquityOn(context: HandContext, street: StreetName): number | null {
  const facing = context
    .heroVoluntaryActions(street)
    .filter((view) => view.toCall > 0 && (view.action.kind === 'call' || view.action.kind === 'fold'))
    .at(-1)
  return facing === undefined ? null : Number((facing.requiredEquity * 100).toFixed(1))
}
