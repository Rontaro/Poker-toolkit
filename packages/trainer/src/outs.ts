/**
 * Out counting, done exactly.
 *
 * An out is defined here as a card that takes the hero from behind to in
 * front — not as a card that "improves" him, which is the definition that
 * teaches people to count a pair of jacks as outs against a set. The opponent's
 * hand is known to the counter, so the answer is a fact about 47 cards rather
 * than an opinion, and it can be shown card by card.
 *
 * The two halves are separate on purpose: counting is 47 evaluations and runs
 * inside a rejection-sampling loop, while the exact equity enumerates every
 * runout and only ever runs once, on the spot that was actually chosen.
 */

import { describeStrength, evaluate, type Card } from '@poker/core'
import { comboOf, equity } from '@poker/equity'

import { madeLabel } from './labels.js'
import { remaining } from './deck.js'
import type { OutCard } from './types.js'

export interface OutKind {
  readonly makes: string
  readonly count: number
}

export interface OutsCount {
  /** Cards that put the hero in front, in deck order. */
  readonly outs: readonly OutCard[]
  /** The same outs grouped by the hand they make, commonest first. */
  readonly kinds: readonly OutKind[]
  readonly ahead: boolean
  /** What each player holds right now, in words. */
  readonly heroNow: string
  readonly villainNow: string
  /** When the hero is already in front: the cards that take the lead away. */
  readonly counterOuts: readonly OutCard[]
  readonly cardsToCome: number
}

export interface OutsAnalysis extends OutsCount {
  /** Exact, every runout enumerated. 0..1. */
  readonly equity: number
  /** What the rule of two and four would have told you, in percent. */
  readonly shortcut: number
}

function label(hole: readonly Card[], board: readonly Card[]): string {
  return madeLabel(describeStrength(hole, board).made)
}

export function countOuts(
  hero: readonly Card[],
  villain: readonly Card[],
  board: readonly Card[],
): OutsCount {
  if (board.length !== 3 && board.length !== 4) {
    throw new RangeError(`countOuts() vuole un flop o un turn, non ${board.length} carte`)
  }

  const heroNow = evaluate([...hero, ...board])
  const villainNow = evaluate([...villain, ...board])
  const ahead = heroNow > villainNow

  const outs: OutCard[] = []
  const counterOuts: OutCard[] = []

  for (const next of remaining([...hero, ...villain, ...board])) {
    const board2 = [...board, next]
    const mine = evaluate([...hero, ...board2])
    const theirs = evaluate([...villain, ...board2])

    if (!ahead && mine > theirs) outs.push({ card: next, makes: label(hero, board2) })
    if (ahead && mine <= theirs) counterOuts.push({ card: next, makes: label(villain, board2) })
  }

  const counts = new Map<string, number>()
  for (const out of outs) counts.set(out.makes, (counts.get(out.makes) ?? 0) + 1)

  return {
    outs,
    kinds: [...counts.entries()]
      .map(([makes, count]) => ({ makes, count }))
      .sort((a, b) => b.count - a.count),
    ahead,
    heroNow: label(hero, board),
    villainNow: label(villain, board),
    counterOuts,
    cardsToCome: 5 - board.length,
  }
}

/** The rule of two and four: two points per out per card still to come. */
export function ruleOfTwoAndFour(outs: number, cardsToCome: number): number {
  return outs * 2 * cardsToCome
}

export function analyseOuts(
  hero: readonly Card[],
  villain: readonly Card[],
  board: readonly Card[],
): OutsAnalysis {
  const counted = countOuts(hero, villain, board)
  const result = equity({
    players: [
      comboOf(hero[0] as Card, hero[1] as Card),
      comboOf(villain[0] as Card, villain[1] as Card),
    ],
    board,
  })

  return {
    ...counted,
    equity: result.players[0]?.equity ?? 0,
    shortcut: ruleOfTwoAndFour(counted.outs.length, counted.cardsToCome),
  }
}
