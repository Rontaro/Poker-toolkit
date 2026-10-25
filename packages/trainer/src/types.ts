/**
 * The shapes an exercise is made of.
 *
 * A drill is a question with an answer the tool can compute exactly, plus the
 * arithmetic that produced it. The explanation is data, not a string of prose,
 * because the point of the exercise is not to be told the answer: it is to see
 * where the answer came from, step by step, in the same order you would have
 * had to do it at the table.
 */

import type { Card } from '@poker/core'

export type DrillId =
  | 'count-outs'
  | 'outs-to-equity'
  | 'equity-estimate'
  | 'preflop-equity'
  | 'pot-odds'
  | 'call-or-fold'
  | 'breakeven-bluff'
  | 'mdf'
  | 'combo-count'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

/** One line of the worked solution: what was computed, and what came out. */
export interface Step {
  readonly label: string
  readonly value: string
}

/** A card that improves the hero, and the hand it would make. */
export interface OutCard {
  readonly card: Card
  readonly makes: string
}

/** Everything the table drawing needs. Every field is optional: a pot-odds
 *  question has money and no cards, an outs question has cards and no money. */
export interface TableView {
  readonly hero?: readonly Card[]
  readonly villain?: readonly Card[]
  /** Shown instead of the villain's cards when the opponent is a range. */
  readonly villainLabel?: string
  readonly board?: readonly Card[]
  readonly street?: Street
  /** Big blinds already in the middle, including any bet you are facing. */
  readonly potBB?: number
  readonly toCallBB?: number
  readonly betBB?: number
}

export interface Explanation {
  /** The answer in one phrase, the way you would say it out loud. */
  readonly headline: string
  readonly steps: readonly Step[]
  readonly outs?: readonly OutCard[]
  /** What the highlighted cards are, when they are not the hero's own outs. */
  readonly outsLabel?: string
  /** Cards already visible, so the deck grid can grey them out. */
  readonly known?: readonly Card[]
  /** The shortcut, the trap, or the thing to notice next time. */
  readonly tip: string
}

export type Unit = 'out' | '%' | 'combo' | ''

export interface NumberQuestion {
  readonly kind: 'number'
  readonly unit: Unit
  readonly min: number
  readonly max: number
  readonly step: number
  readonly answer: number
  /** Inside this distance the answer counts as right. */
  readonly tolerance: number
  /** Inside this distance it counts as spot on. */
  readonly perfect: number
}

export interface ChoiceQuestion {
  readonly kind: 'choice'
  readonly options: readonly string[]
  /** Index into `options`. */
  readonly answer: number
}

export type Question = NumberQuestion | ChoiceQuestion

export interface Spot {
  readonly drill: DrillId
  /** The question itself, one sentence. */
  readonly ask: string
  readonly table: TableView
  readonly question: Question
  readonly explain: Explanation
}

/**
 * What a level asks its generators for.
 *
 * These are filters on an otherwise random deal, not a script: the generator
 * keeps dealing until it gets a spot that fits, so a level is described by what
 * makes a spot suitable rather than by a list of hand-written positions.
 */
export interface Constraints {
  readonly street?: 'flop' | 'turn'
  /** The hero must be drawing to this. */
  readonly requireDraw?: 'flush' | 'straight' | 'any'
  readonly minOuts?: number
  readonly maxOuts?: number
  /** How many different hands the outs are allowed to make. 1 = a pure draw. */
  readonly maxOutKinds?: number
  /** True demands the hero is already in front, false that he is behind. */
  readonly heroAhead?: boolean
  readonly potRange?: readonly [number, number]
  /** Bet sizes offered, as a fraction of the pot. */
  readonly betFractions?: readonly number[]
  /** Ranges the opponent can turn up with, in the usual notation. */
  readonly villainRanges?: readonly string[]
  /** How far the decision has to be from the break-even point, in points. */
  readonly edge?: number
  /** Overrides the drill's own tolerance, for levels that want it tighter. */
  readonly tolerance?: number
}

export interface Drill {
  readonly id: DrillId
  readonly label: string
  /** What the question asks, in one line. */
  readonly asks: string
  /** Why this is worth being able to do at the table. */
  readonly why: string
  readonly generate: (rng: () => number, constraints: Constraints) => Spot
}

export type Quality = 'perfect' | 'close' | 'wrong'

export interface Verdict {
  readonly quality: Quality
  readonly correct: boolean
  readonly given: number
  readonly answer: number
  readonly delta: number
}

/**
 * Marks an answer.
 *
 * Two bands rather than one: an equity estimate three points out is a good
 * estimate and a wrong number, and a trainer that calls it simply "wrong"
 * teaches you to distrust a method that was working. `close` is a pass;
 * `perfect` is what you are aiming at.
 */
export function grade(spot: Spot, given: number): Verdict {
  if (spot.question.kind === 'choice') {
    const correct = given === spot.question.answer
    return {
      quality: correct ? 'perfect' : 'wrong',
      correct,
      given,
      answer: spot.question.answer,
      delta: correct ? 0 : 1,
    }
  }

  const delta = Math.abs(given - spot.question.answer)
  const quality: Quality =
    delta <= spot.question.perfect ? 'perfect' : delta <= spot.question.tolerance ? 'close' : 'wrong'
  return { quality, correct: quality !== 'wrong', given, answer: spot.question.answer, delta }
}
