import {
  computeMetrics,
  findMetric,
  profileFor,
  vpipPfrGap,
  type MetricResult,
  type Profile,
} from '@poker/metrics'
import type { LeakReport } from '@poker/rules'

import type { AnalysedHand, AnalysedSample } from './analyse.js'
import { presetById, type Preset } from './presets.js'
import { renderHand } from './render-hand.js'
import { selectorById, type HandSelector } from './selectors.js'

export interface BuildPromptOptions {
  readonly sample: AnalysedSample
  /** Selector id, or the selector itself. */
  readonly selector: string | HandSelector
  readonly preset: string | Preset
  /** Ten is the point past which a prompt stops being readable. */
  readonly limit?: number
  /** For the `same-leak` selector. */
  readonly leakId?: string
  readonly seed?: number
}

export interface BuiltPrompt {
  readonly text: string
  readonly hands: readonly AnalysedHand[]
  readonly selector: HandSelector
  readonly preset: Preset
  /** Rough size, for the counter next to the copy button. */
  readonly characters: number
}

export const MAX_HANDS = 10
export const DEFAULT_HANDS = 5

/**
 * Assembles everything into one block to paste into a chat.
 *
 * The tool stops here on purpose. Nothing in this package calls a model: the
 * qualitative half of the analysis happens in a conversation the player has
 * themselves, and what this builds is the material for it.
 */
export async function buildPrompt(options: BuildPromptOptions): Promise<BuiltPrompt> {
  const selector =
    typeof options.selector === 'string' ? selectorById(options.selector) : options.selector
  if (selector === undefined) throw new Error(`Unknown selector: ${String(options.selector)}`)

  const preset = typeof options.preset === 'string' ? presetById(options.preset) : options.preset
  if (preset === undefined) throw new Error(`Unknown preset: ${String(options.preset)}`)

  const limit = Math.min(options.limit ?? DEFAULT_HANDS, MAX_HANDS)
  const chosen = selector.select({
    hands: options.sample.hands,
    limit,
    ...(options.leakId === undefined ? {} : { leakId: options.leakId }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  })

  const text = await render(options.sample, chosen, selector, preset)
  return { text, hands: chosen, selector, preset, characters: text.length }
}

async function render(
  sample: AnalysedSample,
  chosen: readonly AnalysedHand[],
  selector: HandSelector,
  preset: Preset,
): Promise<string> {
  const hands = sample.hands.map((hand) => hand.context.hand)
  const metrics = await computeMetrics(hands, { byPosition: false })
  const profile = hands[0] === undefined ? undefined : profileFor(hands[0])

  const enriched = chosen
    .map((hand, i) => renderHand(hand, { index: i + 1, total: chosen.length }))
    .join('\n\n')

  const sessions = new Set(sample.hands.map((hand) => hand.sessionId)).size

  return `Sei un coach di poker. Analizza le mie mani e dimmi cosa sto sbagliando.

## Chi sono
Formato: ${formatLine(sample)}
Campione analizzato: ${hands.length} mani su ${sessions} session${sessions === 1 ? 'e' : 'i'}

Statistiche:
${statistics(metrics.overall, profile)}

Leak già identificati dalle mie regole automatiche:
${leakSummary(sample.report)}

## Le mani
Selezione: ${selector.label} · ${chosen.length} man${chosen.length === 1 ? 'o' : 'i'}

${enriched}

## Cosa voglio sapere
${preset.instruction}

## Come rispondermi
- Vai strada per strada, ma salta quello che ho fatto bene: concentrati sugli errori
- Dammi numeri concreti: sizing in bb e in percentuale del piatto, pot odds,
  equity stimata quando serve
- Dimmi anche quando una regola automatica ha dato un falso allarme e perché
- Chiudi con una tabella riepilogativa: strada / cosa ho fatto / cosa fare
- Alla fine una sola frase: il concetto più importante da portarmi via
- Niente premesse, vai dritto al punto`
}

function formatLine(sample: AnalysedSample): string {
  const first = sample.hands[0]?.context.hand
  if (first === undefined) return 'sconosciuto'

  const type =
    first.game.type === 'cash' ? 'cash' : first.game.type === 'sng' ? 'sit & go' : 'torneo'
  const stakes =
    first.game.stakes.currency === 'CHIPS'
      ? ''
      : ` ${decimals(first.game.stakes.sb)}/${decimals(first.game.stakes.bb)} ${first.game.stakes.currency}`

  return `${type}${stakes} ${first.table.maxSeats}-max, ${first.source.site}`
}

function decimals(chips: number): string {
  const units = chips / 10_000
  return units < 1 ? units.toFixed(2) : String(units)
}

/**
 * The stats block, with the reference band beside the numbers the active
 * profile has an opinion about, and a warning beside the ones resting on too
 * few hands to mean anything. A hundred per cent c-bet over two opportunities
 * would otherwise read as a fact.
 */
function statistics(results: readonly MetricResult[], profile: Profile | undefined): string {
  const THIN = 30

  const value = (id: string, digits = 1): string => {
    const found = findMetric(results, id)?.value
    return found === undefined ? 'n/d' : found.toFixed(digits)
  }

  const thinNote = (...ids: readonly string[]): string => {
    const sizes = ids
      .map((id) => findMetric(results, id))
      .filter((metric) => metric?.value !== undefined && metric.sampleSize < THIN)
      .map((metric) => metric?.sampleSize ?? 0)
    return sizes.length === 0 ? '' : `  [campione sottile: ${Math.min(...sizes)} spot]`
  }

  const band = (id: string): string => {
    const range = profile?.ranges[id]
    return range === undefined ? '' : `${range.min}-${range.max}`
  }
  const reference = (id: string): string =>
    profile === undefined ? '' : `    (riferimento: ${band(id)})`

  const gap = vpipPfrGap(results)
  const gapText = gap === undefined ? 'n/d' : gap.toFixed(1)
  const headline =
    profile === undefined
      ? ''
      : `    (riferimento ${profile.label}: ${band('vpip')} / ${band('pfr')})`

  const lines = [
    `  VPIP ${value('vpip')}% / PFR ${value('pfr')}% / gap ${gapText}${headline}`,
    `  3-bet ${value('three-bet')}%${reference('three-bet')}${thinNote('three-bet')}`,
    `  C-bet flop ${value('cbet-flop')}%${reference('cbet-flop')}${thinNote('cbet-flop')}`,
    `  AF flop ${value('af-flop', 2)} / turn ${value('af-turn', 2)} / river ${value('af-river', 2)}${thinNote('af-flop', 'af-turn', 'af-river')}`,
    `  WTSD ${value('wtsd')}% / W$SD ${value('wsd')}%${thinNote('wtsd', 'wsd')}`,
    `  bb/100: ${value('bb-100')}`,
  ]
  return lines.join('\n')
}

function leakSummary(report: LeakReport): string {
  if (report.byRule.length === 0) return '  (nessun leak rilevato in questo campione)'

  const lines = report.byRule.map((summary) => {
    const times = summary.count === 1 ? '1 volta' : `${summary.count} volte`
    // Enough precision that a small estimate is not rounded away to zero, which
    // would read as "this one is free".
    const cost =
      summary.totalCostBB < 10 ? summary.totalCostBB.toFixed(1) : summary.totalCostBB.toFixed(0)
    return `  - ${summary.ruleId} (${summary.why.toLowerCase()}): ${times}, ~${cost}bb stimati`
  })
  return lines.join('\n')
}
