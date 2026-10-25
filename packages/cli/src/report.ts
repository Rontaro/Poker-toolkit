import { computeMetrics, compareToProfile, findMetric, profileFor, vpipPfrGap, type MetricResult, type Profile } from '@poker/metrics'
import { detectLeaks } from '@poker/rules'
import { buildTimeline } from '@poker/timeline'
import type { Hand } from '@poker/core'

/**
 * The weekly markdown report.
 *
 * Written for a notes vault rather than a terminal: leaks first and ordered by
 * what they cost, because a report that opens with the win rate invites reading
 * a good week as good play.
 */
export interface ReportOptions {
  readonly hands: readonly Hand[]
  readonly since?: Date
  readonly title?: string
}

export async function buildReport(options: ReportOptions): Promise<string> {
  const hands = options.hands
  if (hands.length === 0) {
    return `# ${options.title ?? 'Report'}\n\nNessuna mano nel periodo selezionato.\n`
  }

  const [metrics, leaks, timeline] = await Promise.all([
    computeMetrics(hands),
    detectLeaks(hands),
    buildTimeline(hands),
  ])

  const profile = profileFor(hands[0] as Hand)
  const netBB = timeline.bankroll.at(-1)?.cumulativeBB ?? 0
  const period =
    options.since === undefined
      ? `${hands.length} mani`
      : `dal ${options.since.toISOString().slice(0, 10)} · ${hands.length} mani`

  const sections = [
    `# ${options.title ?? 'Report poker'}`,
    '',
    `${period} · ${timeline.sessions.length} session${timeline.sessions.length === 1 ? 'e' : 'i'} · ${netBB.toFixed(1)}bb (${findValue(metrics.overall, 'bb-100')?.toFixed(1) ?? 'n/d'} bb/100)`,
    '',
    '## Leak, ordinati per costo stimato',
    '',
    leakTable(leaks.byRule),
    '',
    '## Statistiche',
    '',
    statsTable(metrics.overall, profile),
    '',
    '## Per posizione',
    '',
    positionTable(metrics),
    '',
    '## Quando sbaglio',
    '',
    tiltSection(timeline),
    '',
    hourTable(timeline),
    '',
    '## Sessioni',
    '',
    sessionTable(timeline),
    '',
  ]

  return sections.join('\n')
}

function findValue(results: readonly MetricResult[], id: string): number | undefined {
  return findMetric(results, id)?.value
}

function leakTable(byRule: Awaited<ReturnType<typeof detectLeaks>>['byRule']): string {
  if (byRule.length === 0) return '_Nessun leak rilevato._'

  const rows = byRule.map(
    (summary) =>
      `| ${summary.ruleId} | ${summary.count} | ${summary.totalCostBB.toFixed(1)} | ${summary.why} |`,
  )
  return ['| Leak | Volte | Costo stimato (bb) | Perché |', '|---|---:|---:|---|', ...rows].join('\n')
}

function statsTable(results: readonly MetricResult[], profile: Profile | undefined): string {
  const interesting = [
    'vpip',
    'pfr',
    'three-bet',
    'fold-to-three-bet',
    'cbet-flop',
    'cbet-turn',
    'wwsf',
    'wtsd',
    'wsd',
    'af-flop',
    'af-turn',
    'af-river',
    'avg-stack',
    'bb-100',
  ]

  const verdictLabel = { below: 'sotto', within: 'in range', above: 'sopra', unknown: '—' }
  const rows = interesting.flatMap((id) => {
    const metric = findMetric(results, id)
    if (metric === undefined) return []
    const range = profile?.ranges[id]
    const value = metric.value === undefined ? 'n/d' : metric.value.toFixed(1)
    const reference = range === undefined ? '—' : `${range.min}–${range.max}`
    return [
      `| ${metric.label} | ${value} | ${reference} | ${verdictLabel[compareToProfile(metric, profile)]} | ${metric.sampleSize} |`,
    ]
  })

  const gap = vpipPfrGap(results)
  const gapRow = gap === undefined ? [] : [`| Gap VPIP-PFR | ${gap.toFixed(1)} | — | — | — |`]

  return [
    '| Statistica | Valore | Riferimento | Giudizio | Campione |',
    '|---|---:|---|---|---:|',
    ...rows,
    ...gapRow,
  ].join('\n')
}

function positionTable(metrics: Awaited<ReturnType<typeof computeMetrics>>): string {
  const entries = Object.entries(metrics.byPosition)
  if (entries.length === 0) return '_Nessun dato per posizione._'

  const rows = entries.map(([position, results]) => {
    const at = (id: string, digits = 1): string =>
      findMetric(results ?? [], id)?.value?.toFixed(digits) ?? '—'
    return `| ${position} | ${at('hands', 0)} | ${at('vpip')} | ${at('pfr')} | ${at('three-bet')} | ${at('bb-100')} |`
  })

  return [
    '| Posizione | Mani | VPIP | PFR | 3-bet | bb/100 |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows,
  ].join('\n')
}

function tiltSection(timeline: Awaited<ReturnType<typeof buildTimeline>>): string {
  const { tilt } = timeline
  if (tilt.triggers === 0) {
    return `Nessun piatto perso oltre ${tilt.triggerBB}bb nel periodo: niente da misurare sul tilt.`
  }

  const comparison =
    tilt.ratio === undefined
      ? 'non confrontabile (baseline a zero)'
      : `${tilt.ratio.toFixed(2)}× il baseline`

  return [
    `**Tilt detector** — ${tilt.triggers} piatti persi oltre ${tilt.triggerBB}bb.`,
    '',
    `| | Mani | Leak per 100 mani | bb/100 |`,
    '|---|---:|---:|---:|',
    `| Dopo un piatto perso grosso | ${tilt.handsAfterTriggers} | ${tilt.leakRateAfterTriggers.toFixed(1)} | ${tilt.bb100AfterTriggers.toFixed(1)} |`,
    `| Resto del campione | ${tilt.handsElsewhere} | ${tilt.baselineLeakRate.toFixed(1)} | ${tilt.bb100Elsewhere.toFixed(1)} |`,
    '',
    `Rapporto: ${comparison}.`,
  ].join('\n')
}

function hourTable(timeline: Awaited<ReturnType<typeof buildTimeline>>): string {
  if (timeline.byHourOfDay.length === 0) return ''

  const rows = timeline.byHourOfDay.map(
    (bucket) =>
      `| ${String(bucket.hour).padStart(2, '0')}:00 | ${bucket.hands} | ${bucket.leakRate.toFixed(1)} | ${bucket.bb100.toFixed(1)} |`,
  )
  return [
    '**Per ora del giorno** (orario locale)',
    '',
    '| Ora | Mani | Leak/100 | bb/100 |',
    '|---|---:|---:|---:|',
    ...rows,
  ].join('\n')
}

function sessionTable(timeline: Awaited<ReturnType<typeof buildTimeline>>): string {
  const rows = timeline.sessions.map(
    (session) =>
      `| ${session.startedAt.toISOString().slice(0, 16).replace('T', ' ')} | ${session.hands} | ${session.netBB.toFixed(1)} | ${session.bb100.toFixed(1)} | ${session.leakRate.toFixed(1)} |`,
  )
  return [
    '| Inizio | Mani | Netto (bb) | bb/100 | Leak/100 |',
    '|---|---:|---:|---:|---:|',
    ...rows,
  ].join('\n')
}
