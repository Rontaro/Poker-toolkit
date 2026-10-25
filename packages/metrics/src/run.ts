import { HandContext, POSITIONS, type Hand, type Position } from '@poker/core'
import { ALL_METRICS } from './registry.js'
import { applies, type ErasedMetric, type MetricResult } from './types.js'

/**
 * Metrics are computed once and grouped, rather than being written once per
 * position. Six copies of VPIP that differ only in a filter is six places for
 * the definition to drift apart.
 */
export interface MetricReport {
  readonly overall: readonly MetricResult[]
  /** Only the positions the hero actually held in this sample appear. */
  readonly byPosition: Readonly<Partial<Record<Position, readonly MetricResult[]>>>
  readonly handsSeen: number
  /** Hands skipped because no metric applied to them. */
  readonly handsSkipped: number
}

export interface ComputeOptions {
  /** Defaults to every registered metric. Author one with `erase(metric)`. */
  readonly metrics?: readonly ErasedMetric[]
  /** Group by the hero's position as well as overall. On by default. */
  readonly byPosition?: boolean
}

/**
 * Streams hands through every metric.
 *
 * The input is an async iterable because that is what the store hands back, and
 * because holding the whole database in memory to compute an average would
 * defeat the point of streaming it out.
 */
export async function computeMetrics(
  hands: AsyncIterable<Hand> | Iterable<Hand>,
  options: ComputeOptions = {},
): Promise<MetricReport> {
  const metrics = options.metrics ?? ALL_METRICS
  const wantPositions = options.byPosition ?? true

  const overall = metrics.map((metric) => ({ metric, accumulation: metric.start() }))
  const positional = new Map<Position, { metric: ErasedMetric; accumulation: ReturnType<ErasedMetric['start']> }[]>()

  let handsSeen = 0
  let handsSkipped = 0

  for await (const hand of hands) {
    const context = new HandContext(hand)
    let used = false

    for (const entry of overall) {
      if (!applies(entry.metric.appliesTo, context)) continue
      entry.accumulation.add(context)
      used = true
    }

    const position = context.heroPosition
    if (wantPositions && position !== undefined) {
      let bucket = positional.get(position)
      if (bucket === undefined) {
        bucket = metrics.map((metric) => ({ metric, accumulation: metric.start() }))
        positional.set(position, bucket)
      }
      for (const entry of bucket) {
        if (applies(entry.metric.appliesTo, context)) entry.accumulation.add(context)
      }
    }

    handsSeen += 1
    if (!used) handsSkipped += 1
  }

  const byPosition: Partial<Record<Position, readonly MetricResult[]>> = {}
  for (const position of POSITIONS) {
    const bucket = positional.get(position)
    if (bucket !== undefined) byPosition[position] = bucket.map(toResult)
  }

  return { overall: overall.map(toResult), byPosition, handsSeen, handsSkipped }
}

function toResult(entry: {
  metric: ErasedMetric
  accumulation: { finish(): { value: number | undefined; sampleSize: number } }
}): MetricResult {
  const finished = entry.accumulation.finish()
  return {
    id: entry.metric.id,
    label: entry.metric.label,
    description: entry.metric.description,
    unit: entry.metric.unit,
    value: finished.value,
    sampleSize: finished.sampleSize,
  }
}

export function findMetric(results: readonly MetricResult[], id: string): MetricResult | undefined {
  return results.find((result) => result.id === id)
}

/** The gap between VPIP and PFR: how much the hero calls rather than raises. */
export function vpipPfrGap(results: readonly MetricResult[]): number | undefined {
  const vpip = findMetric(results, 'vpip')?.value
  const pfr = findMetric(results, 'pfr')?.value
  return vpip === undefined || pfr === undefined ? undefined : vpip - pfr
}
