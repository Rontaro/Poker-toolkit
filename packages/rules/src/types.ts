import type { HandContext, HandId, StreetName } from '@poker/core'
import type { Applicability } from '@poker/metrics'

/** One thing the hero did that a rule thinks was a mistake. */
export interface LeakEvent {
  readonly ruleId: string
  readonly handId: HandId
  readonly street: StreetName
  /** Index of the offending action within the hand, when there is one. */
  readonly actionIndex?: number

  /**
   * What the mistake is estimated to have cost, in big blinds.
   *
   * These are deliberately rough — a bet that should have been bigger costs
   * the difference times a guess at how often it gets called — because the
   * number exists to *rank* leaks by what they are worth, not to price them.
   * Sorting by frequency would put a cheap habit above an expensive one.
   */
  readonly costBB: number

  /** 0 to 1: how sure the rule is that this was actually wrong. */
  readonly confidence: number

  /** Human-readable, in the language the prompts and the dashboard use. */
  readonly message: string
}

/** Thresholds and estimation factors for one rule, read from configuration. */
export type RuleSettings = Readonly<Record<string, number>>

export interface RuleContext {
  readonly hand: HandContext
  /** This rule's settings, already resolved from the active config. */
  readonly settings: RuleSettings
}

/**
 * A leak detector.
 *
 * Rules declare where they apply, so `short-buyin` never fires in a tournament
 * where a twenty big blind stack is normal rather than a choice. Adding one is
 * a file and a line in the registry; nothing existing changes.
 */
export interface Rule {
  readonly id: string
  /** Short name, shown in the dashboard and in generated prompts. */
  readonly label: string
  /** Why it is a leak, in one line. Ends up in the prompt sent for analysis. */
  readonly why: string
  readonly appliesTo?: Applicability
  /** Defaults, overridable by configuration. */
  readonly defaults: RuleSettings
  evaluate(context: RuleContext): LeakEvent[]
}

export interface LeakSummary {
  readonly ruleId: string
  readonly label: string
  readonly why: string
  readonly count: number
  readonly totalCostBB: number
  /** Hands the rule had the chance to look at. */
  readonly handsSeen: number
}

export interface LeakReport {
  readonly events: readonly LeakEvent[]
  /** Ordered by estimated cost, worst first. */
  readonly byRule: readonly LeakSummary[]
  readonly handsSeen: number
  readonly totalCostBB: number
}
