import type { GameType, HandContext, Variant } from '@poker/core'

/** Where a metric or a rule makes sense. An absent field means "anywhere". */
export interface Applicability {
  readonly gameTypes?: readonly GameType[]
  readonly variants?: readonly Variant[]
  /** Range over `table.maxSeats`: 6-max and 9-max are never averaged together. */
  readonly tableSizes?: { readonly min?: number; readonly max?: number }
}

export function applies(scope: Applicability | undefined, hand: HandContext): boolean {
  if (scope === undefined) return true

  const { game, table } = hand.hand
  if (scope.gameTypes !== undefined && !scope.gameTypes.includes(game.type)) return false
  if (scope.variants !== undefined && !scope.variants.includes(game.variant)) return false
  if (scope.tableSizes !== undefined) {
    const { min, max } = scope.tableSizes
    if (min !== undefined && table.maxSeats < min) return false
    if (max !== undefined && table.maxSeats > max) return false
  }
  return true
}

export type MetricUnit = 'percent' | 'ratio' | 'bb/100' | 'bb' | 'count'

export interface MetricValue {
  /**
   * The number, or undefined when the metric never had a chance to measure
   * anything. A VPIP of zero over no hands is not a VPIP of zero.
   */
  readonly value: number | undefined
  /** How many chances the metric had. Small samples are not opinions. */
  readonly sampleSize: number
}

export interface MetricResult extends MetricValue {
  readonly id: string
  readonly label: string
  /** Plain-language explanation, shown wherever the number is. An acronym
   * nobody can expand is a number nobody can act on. */
  readonly description: string
  readonly unit: MetricUnit
}

/**
 * A statistic, written once and computed by streaming.
 *
 * `reduce` takes an accumulator and one hand and returns the next one, so a two
 * hundred thousand hand database costs one hand of memory. Returning the same
 * mutated object is fine and is what the built-in metrics do.
 */
export interface Metric<Acc> {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly unit: MetricUnit
  readonly appliesTo?: Applicability
  /** A fresh accumulator, called once per group. */
  seed(): Acc
  reduce(accumulator: Acc, hand: HandContext): Acc
  finalize(accumulator: Acc): MetricValue
}

/**
 * A metric with its accumulator type hidden, so metrics that accumulate
 * different things can sit in one list. Authors write `Metric<Acc>` and never
 * see this; the registry and the runner hold these.
 */
export interface ErasedMetric {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly unit: MetricUnit
  readonly appliesTo?: Applicability
  /** Starts one independent accumulation. */
  start(): MetricAccumulation
}

export interface MetricAccumulation {
  add(hand: HandContext): void
  finish(): MetricValue
}

/** Hides a metric's accumulator type behind a closure. */
export function erase<Acc>(metric: Metric<Acc>): ErasedMetric {
  return {
    id: metric.id,
    label: metric.label,
    description: metric.description,
    unit: metric.unit,
    ...(metric.appliesTo === undefined ? {} : { appliesTo: metric.appliesTo }),
    start(): MetricAccumulation {
      let accumulator = metric.seed()
      return {
        add(hand: HandContext): void {
          accumulator = metric.reduce(accumulator, hand)
        },
        finish(): MetricValue {
          return metric.finalize(accumulator)
        },
      }
    },
  }
}
