import { useMemo, useState, type JSX, type ReactNode } from 'react'

import { EMPTY_FILTERS, type Filters } from '../api.js'
import {
  ImportInstructionsContext,
  LOCAL_IMPORT_INSTRUCTIONS,
  type ImportInstructions,
} from './Common.js'
import { Equity } from '../views/Equity.js'
import { Guide } from '../views/Guide.js'
import { Leaks } from '../views/Leaks.js'
import { Overview } from '../views/Overview.js'
import { Statistics } from '../views/Statistics.js'
import { Studio } from '../views/Studio.js'
import { Timeline } from '../views/Timeline.js'
import { Training } from '../views/Training.js'

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

/**
 * The whole app around the views: rail with the wordmark and the eight tabs,
 * the filters, and the active view. Shared by the local dashboard and the web
 * app, which differ in what sits at the foot of the rail (a live indicator
 * over SSE, or the upload and the archive controls), in what makes the views
 * reload, and in how hands get into the archive.
 *
 * `revision` is that reload: whenever it changes, every view is remounted and
 * refetches, exactly as a filter change does. `importInstructions` is the
 * how, shown by the empty state and the guide; it defaults to the local
 * dashboard's CLI commands.
 */
export function AppShell({
  revision,
  foot,
  importInstructions = LOCAL_IMPORT_INSTRUCTIONS,
}: {
  revision: number
  foot: ReactNode
  importInstructions?: ImportInstructions
}): JSX.Element {
  const [view, setView] = useState<ViewId>('overview')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const key = useMemo(() => `${JSON.stringify(filters)}#${revision}`, [filters, revision])

  return (
    <ImportInstructionsContext.Provider value={importInstructions}>
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

          {foot}
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
    </ImportInstructionsContext.Provider>
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
