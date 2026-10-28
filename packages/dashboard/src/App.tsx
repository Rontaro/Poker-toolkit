import { useEffect, useMemo, useState, type JSX } from 'react'

import {
  EMPTY_FILTERS,
  Equity,
  Guide,
  Leaks,
  Overview,
  Statistics,
  Studio,
  Timeline,
  Training,
  type Filters,
} from '@poker/ui'

const VIEWS = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'statistics', label: 'Statistiche' },
  { id: 'leaks', label: 'Leak' },
  { id: 'timeline', label: 'Andamento' },
  { id: 'studio', label: 'Studio' },
  { id: 'equity', label: 'Equity' },
  { id: 'training', label: 'Allenamento' },
  { id: 'guide', label: 'Come si usa' },
] as const

type ViewId = (typeof VIEWS)[number]['id']

export function App(): JSX.Element {
  const [view, setView] = useState<ViewId>('overview')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [live, setLive] = useState<{ connected: boolean; hands: number }>({
    connected: false,
    hands: 0,
  })

  // While `poker watch` is running, new hands land in the store and the
  // dashboard follows. The token changes and every view refetches.
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = (message: MessageEvent<string>) => {
      const payload = JSON.parse(message.data) as { hands: number }
      setLive({ connected: true, hands: payload.hands })
      setRevision((value) => value + 1)
    }
    source.onerror = () => setLive((value) => ({ ...value, connected: false }))
    return () => source.close()
  }, [])

  const key = useMemo(() => `${JSON.stringify(filters)}#${revision}`, [filters, revision])

  return (
    <div className="shell">
      <nav className="rail">
        <div className="wordmark">
          <h1>
            Led<em>ger</em>
          </h1>
          <p>Analisi post-sessione</p>
        </div>

        <div className="nav">
          {VIEWS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              aria-current={view === entry.id}
              onClick={() => setView(entry.id)}
            >
              <span className="idx">{String(index + 1).padStart(2, '0')}</span>
              <span>{entry.label}</span>
            </button>
          ))}
        </div>

        <div className="rail-foot">
          <span className={live.connected ? 'pulse live' : 'pulse'} />
          {live.connected ? `${live.hands} mani in archivio` : 'archivio non raggiungibile'}
        </div>
      </nav>

      <main className="main">
        <GlobalFilters value={filters} onChange={setFilters} />

        {view === 'overview' && (
          <Overview key={key} filters={filters} onGuide={() => setView('guide')} />
        )}
        {view === 'statistics' && <Statistics key={key} filters={filters} />}
        {view === 'leaks' && <Leaks key={key} filters={filters} />}
        {view === 'timeline' && <Timeline key={key} filters={filters} />}
        {view === 'studio' && <Studio key={key} filters={filters} />}
        {view === 'equity' && <Equity key={key} filters={filters} />}
        {view === 'training' && <Training />}
        {view === 'guide' && <Guide />}
      </main>
    </div>
  )
}

/**
 * Always on screen, on every view.
 *
 * Table size is a range rather than a single value and it is here rather than
 * per-view for one reason: averaging a 6-max sample together with a full ring
 * one produces a number that describes neither, and a filter you have to
 * remember to set is a filter you will forget.
 */
function GlobalFilters({
  value,
  onChange,
}: {
  value: Filters
  onChange: (next: Filters) => void
}): JSX.Element {
  const set = (key: keyof Filters) => (event: { target: { value: string } }) =>
    onChange({ ...value, [key]: event.target.value })

  return (
    <div className="filters">
      <div className="field">
        <label htmlFor="f-game">Gioco</label>
        <select id="f-game" value={value.gameType} onChange={set('gameType')}>
          <option value="">tutti</option>
          <option value="cash">cash</option>
          <option value="tournament">torneo</option>
          <option value="sng">sit &amp; go</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-seats">Posti al tavolo</label>
        <select
          id="f-seats"
          value={`${value.minSeats}-${value.maxSeats}`}
          onChange={(event) => {
            const [min, max] = event.target.value.split('-')
            onChange({ ...value, minSeats: min ?? '', maxSeats: max ?? '' })
          }}
        >
          <option value="-">tutti</option>
          <option value="2-2">heads-up</option>
          <option value="3-6">fino a 6-max</option>
          <option value="6-6">6-max</option>
          <option value="7-10">full ring</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-from">Dal</label>
        <input id="f-from" type="date" value={value.from} onChange={set('from')} />
      </div>

      <div className="field">
        <label htmlFor="f-to">Al</label>
        <input id="f-to" type="date" value={value.to} onChange={set('to')} />
      </div>

      <button className="ghost" type="button" onClick={() => onChange(EMPTY_FILTERS)}>
        azzera
      </button>
    </div>
  )
}
