import type { JSX } from 'react'

import { fixed, type Filters, type Metric, type Verdict } from '../api.js'
import { NoHands, Panel, Term, useResource } from '../components/Common.js'

interface StatisticsData {
  hands: number
  profile: { id: string; label: string; ranges: Record<string, { min: number; max: number }> } | null
  overall: Metric[]
  byPosition: Record<string, Metric[]>
}

const POSITION_ORDER = ['UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']

const SHOWN = [
  'hands',
  'vpip',
  'pfr',
  'three-bet',
  'fold-to-three-bet',
  'four-bet',
  'cbet-flop',
  'cbet-turn',
  'cbet-river',
  'fold-to-cbet-flop',
  'wwsf',
  'wtsd',
  'wsd',
  'af-flop',
  'af-turn',
  'af-river',
  'afq-flop',
  'afq-turn',
  'afq-river',
  'avg-stack',
  'bb-100',
]

const VERDICT_LABEL: Record<Verdict, string> = {
  below: 'sotto',
  within: 'in range',
  above: 'sopra',
  unknown: '—',
}

export function Statistics({ filters }: { filters: Filters }): JSX.Element {
  const { data, error } = useResource<StatisticsData>('/statistics', filters)

  if (error !== undefined) return <div className="page">Errore: {error}</div>
  if (data === undefined) return <div className="page" />
  if (data.hands === 0) return <div className="page"><NoHands /></div>

  const ordered = SHOWN.flatMap((id) => data.overall.filter((metric) => metric.id === id))
  const explain = (id: string): string | undefined =>
    data.overall.find((metric) => metric.id === id)?.description
  const positions = POSITION_ORDER.filter((position) => data.byPosition[position] !== undefined)
  const digits = (metric: Metric): number => (metric.unit === 'count' ? 0 : metric.unit === 'ratio' ? 2 : 1)

  return (
    <div className="page">
      <div>
        <h2 className="section">Statistiche</h2>
        <p className="caption">
          Il giudizio è rispetto al profilo{' '}
          <strong>{data.profile?.label ?? 'nessuno'}</strong>, che vive in un file JSON: se non sei
          d'accordo con una banda, si cambia lì. Nessun giudizio sotto le trenta occasioni.
        </p>
      </div>

      <Panel title="Complessive" meta={`${data.hands} mani`}>
        <table>
          <thead>
            <tr>
              <th>Statistica</th>
              <th className="num">Valore</th>
              <th>Riferimento</th>
              <th>Giudizio</th>
              <th className="num">Campione</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((metric) => {
              const range = data.profile?.ranges[metric.id]
              return (
                <tr key={metric.id}>
                  <th scope="row">
                    <Term explain={metric.description}>{metric.label}</Term>
                  </th>
                  <td className="num">{fixed(metric.value, digits(metric))}</td>
                  <td style={{ color: 'var(--ink-faint)' }}>
                    {range === undefined ? '—' : `${range.min}–${range.max}`}
                  </td>
                  <td>
                    <span className={`verdict ${metric.verdict}`}>{VERDICT_LABEL[metric.verdict]}</span>
                  </td>
                  <td className="num" style={{ color: 'var(--ink-faint)' }}>
                    {metric.sampleSize}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Per posizione" meta="filtra per gioco per non mescolare cash e tornei">
        <div style={{ overflowX: 'auto' }}>
          <table className="sticky-first">
            <thead>
              <tr>
                <th>Posizione</th>
                <th className="num">Mani</th>
                <th className="num">
                  <Term explain={explain('vpip')}>VPIP</Term>
                </th>
                <th className="num">
                  <Term explain={explain('pfr')}>PFR</Term>
                </th>
                <th className="num">
                  <Term explain={explain('three-bet')}>3-bet</Term>
                </th>
                <th className="num">
                  <Term explain={explain('cbet-flop')}>C-bet flop</Term>
                </th>
                <th className="num">
                  <Term explain={explain('wtsd')}>WTSD</Term>
                </th>
                <th className="num">bb/100</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const row = data.byPosition[position] ?? []
                const cell = (id: string, places = 1): JSX.Element => {
                  const metric = row.find((entry) => entry.id === id)
                  return (
                    <td className="num">
                      <span className={metric === undefined ? '' : `verdict ${metric.verdict}`}>
                        {fixed(metric?.value ?? null, places)}
                      </span>
                    </td>
                  )
                }
                return (
                  <tr key={position}>
                    <th scope="row">{position}</th>
                    <td className="num">{fixed(row.find((m) => m.id === 'hands')?.value ?? null, 0)}</td>
                    {cell('vpip')}
                    {cell('pfr')}
                    {cell('three-bet')}
                    {cell('cbet-flop')}
                    {cell('wtsd')}
                    {cell('bb-100')}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
