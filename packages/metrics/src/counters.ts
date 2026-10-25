import type { HandContext } from '@poker/core'
import type { Applicability, Metric, MetricUnit } from './types.js'

/**
 * Most poker statistics are one number over another: how often something
 * happened, out of the times it could have. Writing that shape once means a new
 * statistic is two predicates rather than an accumulator, a reducer and a
 * finaliser.
 */
export interface Counter {
  hits: number
  opportunities: number
}

export interface FrequencySpec {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly appliesTo?: Applicability
  /** Did this hand give the hero the chance to do the thing? */
  opportunity(hand: HandContext): boolean
  /** Given the chance, did they do it? */
  hit(hand: HandContext): boolean
}

/** A percentage: hits over opportunities. */
export function frequency(spec: FrequencySpec): Metric<Counter> {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    unit: 'percent',
    ...(spec.appliesTo === undefined ? {} : { appliesTo: spec.appliesTo }),
    seed: () => ({ hits: 0, opportunities: 0 }),
    reduce(counter, hand) {
      if (!spec.opportunity(hand)) return counter
      counter.opportunities += 1
      if (spec.hit(hand)) counter.hits += 1
      return counter
    },
    finalize(counter) {
      return {
        value: counter.opportunities === 0 ? undefined : (counter.hits / counter.opportunities) * 100,
        sampleSize: counter.opportunities,
      }
    },
  }
}

export interface Totals {
  numerator: number
  denominator: number
  /** Hands that contributed, which is the honest sample size. */
  hands: number
}

export interface QuotientSpec {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly unit: MetricUnit
  readonly appliesTo?: Applicability
  /** Skip hands the statistic says nothing about. */
  include?(hand: HandContext): boolean
  numerator(hand: HandContext): number
  denominator(hand: HandContext): number
  /** Applied to `numerator / denominator`; identity by default. */
  scale?: number
}

/**
 * A ratio of two running totals: aggression factor, bb/100, an average. Unlike
 * a frequency, the two sides accumulate independently.
 */
export function quotient(spec: QuotientSpec): Metric<Totals> {
  const scale = spec.scale ?? 1
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    unit: spec.unit,
    ...(spec.appliesTo === undefined ? {} : { appliesTo: spec.appliesTo }),
    seed: () => ({ numerator: 0, denominator: 0, hands: 0 }),
    reduce(totals, hand) {
      if (spec.include !== undefined && !spec.include(hand)) return totals
      totals.numerator += spec.numerator(hand)
      totals.denominator += spec.denominator(hand)
      totals.hands += 1
      return totals
    },
    finalize(totals) {
      return {
        value: totals.denominator === 0 ? undefined : (totals.numerator / totals.denominator) * scale,
        sampleSize: totals.hands,
      }
    },
  }
}

export interface TotalSpec {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly unit: MetricUnit
  readonly appliesTo?: Applicability
  include?(hand: HandContext): boolean
  amount(hand: HandContext): number
}

/** A running sum rather than a ratio: how many hands, how many big blinds. */
export function total(spec: TotalSpec): Metric<Totals> {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    unit: spec.unit,
    ...(spec.appliesTo === undefined ? {} : { appliesTo: spec.appliesTo }),
    seed: () => ({ numerator: 0, denominator: 0, hands: 0 }),
    reduce(totals, hand) {
      if (spec.include !== undefined && !spec.include(hand)) return totals
      totals.numerator += spec.amount(hand)
      totals.hands += 1
      return totals
    },
    finalize(totals) {
      return { value: totals.numerator, sampleSize: totals.hands }
    },
  }
}
