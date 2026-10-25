import { minBet, missedValueRiver, passiveCallStrong } from './definitions/sizing.js'
import { openLimp, sbFlat, smallOpen } from './definitions/preflop.js'
import { missedCbet, shortBuyin, thinStackNoShove } from './definitions/postflop.js'
import type { Rule } from './types.js'

/**
 * Every leak detector the toolkit ships with. Adding one is a file in
 * `definitions/`, a line here, and a block in `config/default.json`.
 */
export const ALL_RULES: readonly Rule[] = [
  minBet,
  missedValueRiver,
  passiveCallStrong,
  openLimp,
  smallOpen,
  missedCbet,
  sbFlat,
  shortBuyin,
  thinStackNoShove,
]

export function ruleById(id: string): Rule | undefined {
  return ALL_RULES.find((rule) => rule.id === id)
}
