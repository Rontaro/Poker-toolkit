import { card, type Card } from '@poker/core'
import { combosOf, equity, parseRange, type Range } from '@poker/equity'

import { fail, ok, type ApiResult } from './errors.js'

export interface FreeEquityPlayer {
  readonly notation: string
  readonly combos: number
  readonly equity: number
  readonly win: number
  readonly tie: number
}

export interface FreeEquityResult {
  readonly players: readonly FreeEquityPlayer[]
  readonly exhaustive: boolean
  readonly samples: number
}

/**
 * A free-standing equity calculation: any number of ranges, any board.
 *
 * From `POST /api/equity`. Every validation failure the original route
 * answered with a 400 (too few ranges, an unparsable or empty range, a
 * malformed card, a board of the wrong length, or the equity engine itself
 * rejecting the input) comes back as an `ApiResult` error instead of a thrown
 * exception.
 */
export function calculateFreeEquity(
  playersNotations: readonly string[],
  boardText: string,
  deadText: string,
): ApiResult<FreeEquityResult> {
  const notations = playersNotations.filter((entry) => entry.trim() !== '')

  if (notations.length < 2) return fail(400, 'servono almeno due range')

  const ranges: Range[] = []
  for (const notation of notations) {
    const parsed = parseRange(notation)
    if (!parsed.ok) {
      return fail(400, `«${notation}»: ${parsed.errors.map((issue) => issue.message).join('; ')}`)
    }
    if (combosOf(parsed.value).length === 0) {
      return fail(400, `«${notation}» non contiene nessuna mano`)
    }
    ranges.push(parsed.value)
  }

  let board: Card[] = []
  let dead: Card[] = []
  try {
    board = readCards(boardText)
    dead = readCards(deadText)
  } catch (cause) {
    return fail(400, (cause as Error).message)
  }

  if (board.length === 1 || board.length === 2 || board.length > 5) {
    return fail(400, 'il board deve avere 0, 3, 4 o 5 carte')
  }

  try {
    const result = equity({ players: ranges, board, dead })
    return ok({
      players: notations.map((notation, index) => ({
        notation,
        combos: combosOf(ranges[index] as never).length,
        equity: Number(((result.players[index]?.equity ?? 0) * 100).toFixed(2)),
        win: result.players[index]?.win ?? 0,
        tie: result.players[index]?.tie ?? 0,
      })),
      exhaustive: result.players[0]?.exhaustive ?? false,
      samples: result.players[0]?.samples ?? 0,
    })
  } catch (cause) {
    return fail(400, (cause as Error).message)
  }
}

function readCards(text: string): Card[] {
  const tokens = text.trim().replace(/[[\],]/g, ' ').split(/\s+/).filter((t) => t !== '')
  return tokens.map((token) => card(token))
}
