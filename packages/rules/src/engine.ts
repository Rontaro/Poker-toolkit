import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HandContext, type Hand } from '@poker/core'
import { applies } from '@poker/metrics'

import { ALL_RULES } from './registry.js'
import type { LeakEvent, LeakReport, LeakSummary, Rule, RuleSettings } from './types.js'

const CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'config')

export interface RuleConfig {
  readonly id: string
  readonly label: string
  readonly note?: string
  readonly rules: Readonly<Record<string, RuleSettings>>
}

let cachedConfig: RuleConfig | undefined

/**
 * Thresholds live in JSON, not in code. A rule that fires too often is a
 * number to change, not a function to rewrite, and the player should be able
 * to disagree with "under a third of the pot is too small" without touching
 * TypeScript.
 */
export function loadRuleConfig(path: string = join(CONFIG_DIR, 'default.json')): RuleConfig {
  if (path === join(CONFIG_DIR, 'default.json') && cachedConfig !== undefined) return cachedConfig
  const config = JSON.parse(readFileSync(path, 'utf-8')) as RuleConfig
  if (path === join(CONFIG_DIR, 'default.json')) cachedConfig = config
  return config
}

/** A rule's own defaults, with anything the config says layered on top. */
export function settingsFor(rule: Rule, config: RuleConfig): RuleSettings {
  return { ...rule.defaults, ...(config.rules[rule.id] ?? {}) }
}

export interface DetectOptions {
  readonly rules?: readonly Rule[]
  readonly config?: RuleConfig
}

/** Runs every applicable rule over one hand. */
export function evaluateHand(
  hand: HandContext,
  options: DetectOptions = {},
): LeakEvent[] {
  const config = options.config ?? loadRuleConfig()
  const rules = options.rules ?? ALL_RULES

  return rules
    .filter((rule) => applies(rule.appliesTo, hand))
    .flatMap((rule) => rule.evaluate({ hand, settings: settingsFor(rule, config) }))
}

/**
 * Streams hands past every rule and totals what the leaks are estimated to
 * cost, so the report ranks them by money rather than by how often they fire.
 * A cheap habit repeated two hundred times matters less than an expensive one
 * repeated twenty, and only the cost column says so.
 */
export async function detectLeaks(
  hands: AsyncIterable<Hand> | Iterable<Hand>,
  options: DetectOptions = {},
): Promise<LeakReport> {
  const config = options.config ?? loadRuleConfig()
  const rules = options.rules ?? ALL_RULES

  const events: LeakEvent[] = []
  const counts = new Map<string, { count: number; cost: number; handsSeen: number }>()
  for (const rule of rules) counts.set(rule.id, { count: 0, cost: 0, handsSeen: 0 })

  let handsSeen = 0

  for await (const hand of hands) {
    const context = new HandContext(hand)
    handsSeen += 1

    for (const rule of rules) {
      if (!applies(rule.appliesTo, context)) continue

      const tally = counts.get(rule.id)
      if (tally !== undefined) tally.handsSeen += 1

      for (const leak of rule.evaluate({ hand: context, settings: settingsFor(rule, config) })) {
        events.push(leak)
        if (tally !== undefined) {
          tally.count += 1
          tally.cost += leak.costBB
        }
      }
    }
  }

  const byRule: LeakSummary[] = rules
    .map((rule) => {
      const tally = counts.get(rule.id) ?? { count: 0, cost: 0, handsSeen: 0 }
      return {
        ruleId: rule.id,
        label: rule.label,
        why: rule.why,
        count: tally.count,
        totalCostBB: tally.cost,
        handsSeen: tally.handsSeen,
      }
    })
    .filter((summary) => summary.count > 0)
    .sort((a, b) => b.totalCostBB - a.totalCostBB)

  return {
    events,
    byRule,
    handsSeen,
    totalCostBB: byRule.reduce((sum, summary) => sum + summary.totalCostBB, 0),
  }
}
