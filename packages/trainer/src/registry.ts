/**
 * Every exercise the trainer knows about.
 *
 * Adding one is a file in `drills/` and a line here — the same shape the
 * metrics and the rules use, and for the same reason: the list of things the
 * tool can do should be readable in one screen.
 */

import { breakevenBluffDrill } from './drills/breakeven-bluff.js'
import { callOrFoldDrill } from './drills/call-or-fold.js'
import { comboCountDrill } from './drills/combo-count.js'
import { countOutsDrill } from './drills/count-outs.js'
import { equityEstimateDrill } from './drills/equity-estimate.js'
import { mdfDrill } from './drills/mdf.js'
import { outsToEquityDrill } from './drills/outs-to-equity.js'
import { potOddsDrill } from './drills/pot-odds.js'
import { preflopEquityDrill } from './drills/preflop-equity.js'
import type { Constraints, Drill, DrillId, Spot } from './types.js'

export const ALL_DRILLS: readonly Drill[] = [
  countOutsDrill,
  outsToEquityDrill,
  equityEstimateDrill,
  potOddsDrill,
  callOrFoldDrill,
  breakevenBluffDrill,
  mdfDrill,
  comboCountDrill,
  preflopEquityDrill,
]

export function drillById(id: DrillId): Drill {
  const drill = ALL_DRILLS.find((entry) => entry.id === id)
  if (drill === undefined) throw new Error(`esercizio sconosciuto: ${id}`)
  return drill
}

export function generateSpot(id: DrillId, rng: () => number, constraints: Constraints): Spot {
  return drillById(id).generate(rng, constraints)
}
