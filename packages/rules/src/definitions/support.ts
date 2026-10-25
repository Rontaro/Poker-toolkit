import type { HandContext, HandId, StreetName } from '@poker/core'
import type { LeakEvent } from '../types.js'

/** Streets where there is a board to bet into. */
export function postflopStreets(): readonly StreetName[] {
  return ['flop', 'turn', 'river']
}

/** Fills in the hand identity every leak carries, so rules do not repeat it. */
export function event(
  hand: HandContext,
  leak: Omit<LeakEvent, 'handId'> & { handId?: HandId },
): LeakEvent {
  return { ...leak, handId: leak.handId ?? hand.hand.id }
}
