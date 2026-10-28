import type { JSX } from 'react'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { fixed, signClass, type BankrollPoint, type Filters, type LeakSummary, type Metric } from '../api.js'
import { Figure, NoHands, Panel, Term, useResource } from '../components/Common.js'

interface OverviewData {
  empty: boolean
  hands: number
  gap: number | null
  metrics: Metric[]
  leaks: LeakSummary[]
  totalCostBB: number
  bankroll: BankrollPoint[]
  sessions: number
}

export function Overview({
  filters,
  onGuide,
}: {
  filters: Filters
  onGuide?: () => void
}): JSX.Element {
  const { data, error } = useResource<OverviewData>('/overview', filters)

  if (error !== undefined) return <div className="page">Errore: {error}</div>
  if (data === undefined) return <div className="page" />
  if (data.empty) return <div className="page"><NoHands /></div>

  const at = (id: string): number | null => data.metrics.find((m) => m.id === id)?.value ?? null
  const net = data.bankroll.at(-1)?.cumulativeBB ?? 0
  const top = data.leaks.slice(0, 3)
  const worst = Math.max(...data.leaks.map((leak) => leak.totalCostBB), 1)

  return (
    <div className="page">
      <div>
        <h2 className="section">Panoramica</h2>
        <p className="caption">
          Il risultato è il rumore; i leak sono il segnale. La curva dice com'è andata, la tabella
          sotto dice perché. Tutto è misurato in{' '}
          <Term explain="Grande buio. A NL2 vale 2 centesimi. Si misura in bui e non in euro così sessioni a limiti diversi si possono confrontare.">
            bb
          </Term>
          , e le sigle si spiegano da sole se ci passi sopra il mouse.
        </p>
      </div>

      {onGuide !== undefined && (
        <div className="tip">
          <b>Prima volta qui?</b> Il giro è: importi le mani, guardi la scheda <b>Leak</b> per
          vedere cosa ti costa, poi la scheda <b>Studio</b> per farti spiegare le mani peggiori.{' '}
          <button
            className="ghost"
            type="button"
            style={{ marginLeft: 6 }}
            onClick={onGuide}
          >
            apri la guida
          </button>
        </div>
      )}

      <dl className="figures">
        <Figure label="Mani" value={String(data.hands)} note={`${data.sessions} sessioni`} />
        <Figure label="Risultato" value={fixed(net)} unit="bb" tone={signClass(net)} />
        <Figure
          label="Win rate"
          value={fixed(at('bb-100'))}
          unit="bb/100"
          tone={signClass(at('bb-100'))}
          note="grandi bui ogni 100 mani"
        />
        <Figure
          label="VPIP / PFR"
          value={`${fixed(at('vpip'), 0)}/${fixed(at('pfr'), 0)}`}
          unit="%"
          note="mani giocate / rilanciate preflop"
        />
        <Figure
          label="Costo dei leak"
          value={fixed(data.totalCostBB, 0)}
          unit="bb"
          tone="warn"
          note="stima, per ordinare"
        />
      </dl>

      <Panel title="Curva del bankroll" meta={`${data.bankroll.length} mani`}>
        <div className="chart">
          <ResponsiveContainer width="100%" height={252}>
            <AreaChart data={data.bankroll} margin={{ top: 6, right: 14, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="fillJade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#46d39a" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#46d39a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b2521" vertical={false} />
              <XAxis dataKey="index" stroke="#2a3833" tickLine={false} />
              <YAxis stroke="#2a3833" tickLine={false} width={44} />
              <Tooltip
                contentStyle={{
                  background: '#0e1412',
                  border: '1px solid #2a3833',
                  borderRadius: 2,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#7a8b83' }}
                labelFormatter={(index) => `mano ${String(index)}`}
                formatter={(value: number) => [`${value.toFixed(1)} bb`, 'cumulato']}
              />
              <Area
                type="monotone"
                dataKey="cumulativeBB"
                stroke="#46d39a"
                strokeWidth={1.5}
                fill="url(#fillJade)"
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="I tre leak più cari" meta="stima in big blind">
        {top.length === 0 ? (
          <p style={{ padding: '18px 16px', margin: 0, color: 'var(--ink-dim)' }}>
            Nessun leak rilevato in questo campione.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Leak</th>
                <th>Perché</th>
                <th className="num">Volte</th>
                <th className="num">Costo</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {top.map((leak) => (
                <tr key={leak.ruleId}>
                  <th scope="row">{leak.ruleId}</th>
                  <td style={{ fontFamily: 'var(--sans)', color: 'var(--ink-dim)' }}>{leak.why}</td>
                  <td className="num">{leak.count}</td>
                  <td className="num warn">{leak.totalCostBB.toFixed(1)}</td>
                  <td>
                    <div className="bar">
                      <span style={{ width: `${(leak.totalCostBB / worst) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
