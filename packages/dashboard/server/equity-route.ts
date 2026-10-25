import type { Request, Response } from 'express'

import { HandContext, card, type Card, type Hand, type StreetName } from '@poker/core'
import { combosOf, comboOf, equity, handVsRange, parseRange, type Range } from '@poker/equity'

/**
 * Hero's equity street by street, against a range the player types.
 *
 * Bolted onto the hand view rather than given its own tab because the question
 * only ever comes up while looking at a hand: "how far ahead was I actually,
 * there". The range is the caller's guess about the opponent and the answer is
 * only as good as it — which is why the range is an input and not a default the
 * tool pretends to know.
 */

/** Wide enough to mean something at micro stakes, where people call too much. */
export const DEFAULT_RANGE = '22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, A9o+, KTo+, QJo'

export async function handEquity(
  request: Request,
  response: Response,
  load: (id: string) => Promise<Hand[]>,
): Promise<void> {
  const notation = typeof request.query['range'] === 'string' ? request.query['range'] : DEFAULT_RANGE

  const parsed = parseRange(notation)
  if (!parsed.ok) {
    response.status(400).json({ error: parsed.errors.map((issue) => issue.message).join('; ') })
    return
  }

  const hands = await load(request.params.id as string)
  const hand = hands[0]
  if (hand === undefined) {
    response.status(404).json({ error: 'mano non trovata' })
    return
  }

  const context = new HandContext(hand)
  const hole = context.hero?.holeCards
  if (hole === undefined || hole.length !== 2) {
    response.json({ range: notation, streets: [], note: 'carte di Hero non note' })
    return
  }

  const hero = comboOf(hole[0] as never, hole[1] as never)
  const streets: unknown[] = []

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
      exhaustive: result.players[0]?.exhaustive ?? false,
      samples: mine.samples,
      // What the pot was offering when the hero last had to call on this
      // street, so the equity has something to be measured against.
      requiredEquity: requiredEquityOn(context, street),
    })
  }

  response.json({ range: notation, hero: hole, streets })
}

function requiredEquityOn(context: HandContext, street: StreetName): number | null {
  const facing = context
    .heroVoluntaryActions(street)
    .filter((view) => view.toCall > 0 && (view.action.kind === 'call' || view.action.kind === 'fold'))
    .at(-1)
  return facing === undefined ? null : Number((facing.requiredEquity * 100).toFixed(1))
}


/**
 * A free-standing equity calculation: any number of ranges, any board.
 *
 * The hand-attached version above answers "how far ahead was I there". This one
 * answers "how do these two holdings compare", which is the question you ask
 * away from a specific hand — and it is the same engine either way.
 */
export function freeEquity(request: Request, response: Response): void {
  const body = request.body as { players?: string[]; board?: string; dead?: string }
  const notations = (body.players ?? []).filter((entry) => entry.trim() !== '')

  if (notations.length < 2) {
    response.status(400).json({ error: 'servono almeno due range' })
    return
  }

  const ranges: Range[] = []
  for (const notation of notations) {
    const parsed = parseRange(notation)
    if (!parsed.ok) {
      response.status(400).json({
        error: `«${notation}»: ${parsed.errors.map((issue) => issue.message).join('; ')}`,
      })
      return
    }
    if (combosOf(parsed.value).length === 0) {
      response.status(400).json({ error: `«${notation}» non contiene nessuna mano` })
      return
    }
    ranges.push(parsed.value)
  }

  let board: Card[] = []
  let dead: Card[] = []
  try {
    board = readCards(body.board ?? '')
    dead = readCards(body.dead ?? '')
  } catch (cause) {
    response.status(400).json({ error: (cause as Error).message })
    return
  }

  if (board.length === 1 || board.length === 2 || board.length > 5) {
    response.status(400).json({ error: 'il board deve avere 0, 3, 4 o 5 carte' })
    return
  }

  try {
    const result = equity({ players: ranges, board, dead })
    response.json({
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
    response.status(400).json({ error: (cause as Error).message })
  }
}

function readCards(text: string): Card[] {
  const tokens = text.trim().replace(/[[\],]/g, ' ').split(/\s+/).filter((t) => t !== '')
  return tokens.map((token) => card(token))
}
