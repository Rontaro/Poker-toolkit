import type { ErasedMetric } from './types.js'
import { AGGRESSION_METRICS } from './definitions/aggression.js'
import { POSTFLOP_METRICS } from './definitions/postflop.js'
import { PREFLOP_METRICS } from './definitions/preflop.js'
import { RESULT_METRICS } from './definitions/results.js'

/**
 * Every metric the toolkit ships with.
 *
 * Adding one means writing it in a `definitions/` file and adding it to a list;
 * nothing else in the package changes, and nothing outside it does. The
 * accumulator types are erased here so the list can be heterogeneous while each
 * definition stays fully typed where it is written.
 */
export const ALL_METRICS: readonly ErasedMetric[] = [
  ...RESULT_METRICS,
  ...PREFLOP_METRICS,
  ...POSTFLOP_METRICS,
  ...AGGRESSION_METRICS,
]

export function metricById(id: string): ErasedMetric | undefined {
  return ALL_METRICS.find((metric) => metric.id === id)
}
