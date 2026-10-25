import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { fixed, signClass, type BankrollPoint, type Filters } from '../api.js'
import { Figure, NoHands, Panel, useResource } from '../components/Common.js'

interface TimelineData {
  hands: number
  sessions: {
    sessionId: string
    startedAt: string
    hands: number
    netBB: number
    bb100: number
    leakRate: number
  }[]
  byHourOfDay: { hour: number; hands: number; leakRate: number; bb100: number }[]
  byHandsIntoSession: {
    fromHand: number
    toHand: number
    hands: number
    leakRate: number
    bb100: number
  }[]
  tilt: {
    triggerBB: number
    windowHands: number
    triggers: number
    handsAfterTriggers: number
    leakRateAfterTriggers: number
    handsElsewhere: number
    baselineLeakRate: number
    ratio: number | null
    bb100AfterTriggers: number
    bb100Elsewhere: number
  }
  bankroll: BankrollPoint[]
}

const TOOLTIP = {
  contentStyle: {
    background: '#0e1412',
    border: '1px solid #2a3833',
    borderRadius: 2,
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 12,
  },
  labelStyle: { color: '#7a8b83' },
}

export function Timeline({ filters }: { filters: Filters }): JSX.Element {
  const { data, error } = useResource<TimelineData>('/timeline', filters)

  if (error !== undefined) return <div className="page">Errore: {error}</div>
  if (data === undefined) return <div className="page" />
  if (data.hands === 0) return <div className="page"><NoHands /></div>

  const { tilt } = data
  const worse = tilt.ratio !== null && tilt.ratio > 1

  return (
    <div className="page">
      <div>
        <h2 className="section">Andamento</h2>
        <p className="caption">
          Un leak costante è un'abitudine e si corregge studiando. Un leak che raddoppia dopo un
          piatto perso, o alla duecentesima mano della notte, non è un'abitudine e studiare non lo
          tocca.
        </p>
      </div>

      <dl className="figures">
        <Figure
          label={`Piatti persi oltre ${tilt.triggerBB}bb`}
          value={String(tilt.triggers)}
          note={`finestra di ${tilt.windowHands} mani`}
        />
        <Figure
          label="Leak/100 dopo"
          value={fixed(tilt.leakRateAfterTriggers)}
          tone={worse ? 'warn' : undefined}
          note={`${tilt.handsAfterTriggers} mani`}
        />
        <Figure
          label="Leak/100 altrove"
          value={fixed(tilt.baselineLeakRate)}
          note={`${tilt.handsElsewhere} mani`}
        />
        <Figure
          label="Rapporto"
          value={tilt.ratio === null ? '—' : `${tilt.ratio.toFixed(2)}×`}
          tone={worse ? 'neg' : 'pos'}
          note={worse ? 'peggiori dopo un colpo' : 'nessun peggioramento'}
        />
        <Figure
          label="bb/100 dopo"
          value={fixed(tilt.bb100AfterTriggers)}
          tone={signClass(tilt.bb100AfterTriggers)}
          note={`altrove ${fixed(tilt.bb100Elsewhere)}`}
        />
      </dl>

      <Panel title="Win rate mobile" meta="finestra di 100 mani">
        <div className="chart">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.bankroll} margin={{ top: 6, right: 14, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1b2521" vertical={false} />
              <XAxis dataKey="index" stroke="#2a3833" tickLine={false} />
              <YAxis stroke="#2a3833" tickLine={false} width={48} />
              <Tooltip {...TOOLTIP} formatter={(value: number) => [`${value} bb/100`, 'mobile']} />
              <Line
                type="monotone"
                dataKey="rollingBB100"
                stroke="#46d39a"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                isAnimationActive
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="split">
        <Panel title="Per ora del giorno" meta="orario locale">
          <div className="chart">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data.byHourOfDay} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1b2521" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="#2a3833"
                  tickLine={false}
                  tickFormatter={(hour: number) => `${String(hour).padStart(2, '0')}`}
                />
                <YAxis stroke="#2a3833" tickLine={false} width={38} />
                <Tooltip
                  {...TOOLTIP}
                  labelFormatter={(hour) => `ore ${String(hour).padStart(2, '0')}:00`}
                  formatter={(value: number) => [`${value.toFixed(1)}`, 'leak/100']}
                />
                <Bar dataKey="leakRate" fill="#e0a344" radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Stanchezza" meta="mani dall'inizio della sessione">
          <div className="chart">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={data.byHandsIntoSession}
                margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="#1b2521" vertical={false} />
                <XAxis dataKey="fromHand" stroke="#2a3833" tickLine={false} />
                <YAxis stroke="#2a3833" tickLine={false} width={38} />
                <Tooltip
                  {...TOOLTIP}
                  labelFormatter={(from) => `dalla mano ${String(from)}`}
                  formatter={(value: number) => [`${value.toFixed(1)}`, 'leak/100']}
                />
                <Bar dataKey="leakRate" fill="#e0a344" radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Sessioni" meta={`${data.sessions.length}`}>
        <table>
          <thead>
            <tr>
              <th>Inizio</th>
              <th className="num">Mani</th>
              <th className="num">Netto</th>
              <th className="num">bb/100</th>
              <th className="num">Leak/100</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((session) => (
              <tr key={session.sessionId}>
                <th scope="row">{session.startedAt.slice(0, 16).replace('T', ' ')}</th>
                <td className="num">{session.hands}</td>
                <td className={`num ${signClass(session.netBB)}`}>{session.netBB.toFixed(1)}</td>
                <td className={`num ${signClass(session.bb100)}`}>{session.bb100.toFixed(1)}</td>
                <td className="num warn">{session.leakRate.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
