import type { HandId, Position } from '@poker/core'
import type { HandFilter, HandStore } from '@poker/store'

import { load } from './load.js'

export interface HandListItem {
  readonly id: HandId
  readonly playedAt: string
  readonly position: Position | null
  readonly hole: string
  readonly board: string
}

/** From `GET /api/hand-list`: hands the equity tab can preload, newest first. */
export async function getHandList(
  store: HandStore,
  filter: HandFilter,
): Promise<readonly HandListItem[]> {
  const hands = await load(store, filter)
  return hands
    .slice(-200)
    .reverse()
    .flatMap((hand) => {
      const hero = hand.seats.find((seat) => seat.isHero)
      if (hero?.holeCards === undefined) return []
      const board = hand.streets.flatMap((street) => [...street.board])
      return [
        {
          id: hand.id,
          playedAt: hand.playedAt.toISOString(),
          position: hero.position ?? null,
          hole: hero.holeCards.join(' '),
          board: board.join(' '),
        },
      ]
    })
}
