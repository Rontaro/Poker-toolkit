import type { Hand } from '@poker/core'
import type { HandFilter, HandStore } from '@poker/store'

/**
 * Drains the store's async iterator into an array once.
 *
 * Everything downstream of a route (metrics, rules, timeline, prompt-builder)
 * takes an array or re-iterates more than once, so there is no route left
 * that benefits from staying lazy past this point.
 */
export async function load(store: HandStore, filter: HandFilter): Promise<Hand[]> {
  const hands: Hand[] = []
  for await (const hand of store.query(filter)) hands.push(hand)
  return hands
}
