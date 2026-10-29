import { useEffect, useMemo, useState, type JSX } from 'react'

import { get, post, type Filters, type LeakEvent, type LeakSummary } from '../api.js'
import { NoHands, Panel, Term, useResource } from '../components/Common.js'

interface LeaksData {
  rules: { id: string; label: string; why: string }[]
  byRule: LeakSummary[]
  events: LeakEvent[]
}

interface Note {
  handId: string
  source: 'claude' | 'me'
  content: string
  createdAt: string
  tags: string[]
}

interface HandDetail {
  id: string
  replay: string
  leaks: LeakEvent[]
  notes: Note[]
}

interface EquityStreet {
  street: string
  board: string[]
  equity: number
  exhaustive: boolean
  samples: number
  requiredEquity: number | null
}

interface EquityReport {
  range: string
  streets: EquityStreet[]
  note?: string
  error?: string
}

const DEFAULT_RANGE = '22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, A9o+, KTo+, QJo'

export function Leaks({ filters }: { filters: Filters }): JSX.Element {
  const { data, error } = useResource<LeaksData>('/leaks', filters)
  const [rule, setRule] = useState('')
  const [position, setPosition] = useState('')
  const [selected, setSelected] = useState<string | undefined>(undefined)

  const events = useMemo(() => {
    if (data === undefined) return []
    return data.events
      .filter((event) => rule === '' || event.ruleId === rule)
      .filter((event) => position === '' || event.position === position)
      .sort((a, b) => b.costBB - a.costBB)
  }, [data, rule, position])

  if (error !== undefined) return <div className="page">Errore: {error}</div>
  if (data === undefined) return <div className="page" />
  if (data.events.length === 0 && data.byRule.length === 0) {
    return (
      <div className="page">
        <NoHands />
      </div>
    )
  }

  const positions = [...new Set(data.events.map((event) => event.position))].filter(
    (value): value is string => value !== null,
  )

  return (
    <div className="page">
      <div>
        <h2 className="section">Leak</h2>
        <p className="caption">
          Ordinati per costo stimato, non per frequenza: un'abitudine da poco ripetuta duecento
          volte pesa meno di una costosa ripetuta venti. Clicca una riga per rileggere la mano.
        </p>
      </div>

      <div className="filters" style={{ position: 'static', border: 0, padding: '0 0 16px' }}>
        <div className="field">
          <label htmlFor="l-rule">Regola</label>
          <select id="l-rule" value={rule} onChange={(event) => setRule(event.target.value)}>
            <option value="">tutte</option>
            {data.byRule.map((summary) => (
              <option key={summary.ruleId} value={summary.ruleId}>
                {summary.ruleId} ({summary.count})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="l-pos">Posizione</label>
          <select id="l-pos" value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="">tutte</option>
            {positions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <span className="filter-count">
          <b>{events.length}</b> episodi
        </span>
      </div>

      <div className="split">
        <Panel title="Episodi" meta={`${events.length} · costo stimato in bb`}>
          <div style={{ maxHeight: '58vh', overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Regola</th>
                  <th>Strada</th>
                  <th>Pos.</th>
                  <th className="num">Costo</th>
                  <th className="num">Mano</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr
                    key={`${event.handId}-${event.ruleId}-${index}`}
                    className="rowlink"
                    aria-selected={selected === event.handId}
                    onClick={() => setSelected(event.handId)}
                  >
                    <th scope="row">
                      <Term explain={explainRule(data.rules, event.ruleId)}>{event.ruleId}</Term>
                    </th>
                    <td style={{ color: 'var(--ink-dim)' }}>{event.street}</td>
                    <td style={{ color: 'var(--ink-dim)' }}>{event.position ?? '—'}</td>
                    <td className="num warn">{event.costBB.toFixed(1)}</td>
                    <td className={`num ${event.netBB < 0 ? 'neg' : 'pos'}`}>
                      {event.netBB.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {selected === undefined ? (
          <Panel title="Replay">
            <p style={{ padding: '22px 16px', margin: 0, color: 'var(--ink-dim)' }}>
              Seleziona un episodio per rileggere la mano, con la strada dell'errore evidenziata.
            </p>
          </Panel>
        ) : (
          <HandPanel handId={selected} />
        )}
      </div>
    </div>
  )
}

/** The rule's own words, so the id in the table is never the only clue. */
function explainRule(
  rules: { id: string; label: string; why: string }[],
  id: string,
): string | undefined {
  const rule = rules.find((entry) => entry.id === id)
  return rule === undefined ? undefined : `${rule.label} — ${rule.why}.`
}

function HandPanel({ handId }: { handId: string }): JSX.Element {
  const [detail, setDetail] = useState<HandDetail | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = (): void => {
    void get<HandDetail>(`/hand/${handId}`).then(setDetail)
  }

  useEffect(() => {
    setDetail(undefined)
    setDraft('')
    reload()
  }, [handId])

  if (detail === undefined) return <Panel title="Replay">{null}</Panel>

  const save = async (): Promise<void> => {
    if (draft.trim() === '') return
    setSaving(true)
    try {
      await post('/notes', { handId, source: 'claude', content: draft, tags: [] })
      setDraft('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Replay" meta={detail.leaks.map((leak) => leak.ruleId).join(' · ')}>
      <pre className="replay">{highlight(detail.replay)}</pre>

      <Equity handId={handId} />

      <div className="note">
        <header>Incolla qui la risposta ricevuta</header>
        <textarea
          className="note-field"
          value={draft}
          placeholder="La risposta dell'analisi, in markdown…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="editor-foot">
          <span>{detail.notes.length} note salvate</span>
          <button className="ghost" type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'salvo…' : 'salva nota'}
          </button>
        </div>
      </div>

      {detail.notes.map((note, index) => (
        <div className="note" key={index}>
          <header>
            {note.source === 'claude' ? 'Analisi' : 'Nota mia'} · {note.createdAt.slice(0, 10)}
          </header>
          <p>{note.content}</p>
        </div>
      ))}
    </Panel>
  )
}

/**
 * Colours the replay in place: street headings, and the lines a rule flagged.
 * The text itself is exactly what the prompt would carry, so what is studied
 * here and what gets pasted into a chat are the same words.
 */
function highlight(text: string): JSX.Element[] {
  return text.split('\n').map((line, index) => {
    const className = line.includes('⚠')
      ? 'flag'
      : /^(Preflop|Flop|Turn|River)/.test(line)
        ? 'street'
        : line.startsWith('###') || line.startsWith('Risultato')
          ? 'head'
          : undefined

    return (
      <span key={index} className={className}>
        {line}
        {'\n'}
      </span>
    )
  })
}

/**
 * Equity street by street against a range the player types, in the spirit of
 * an equity calculator but answering the question that actually came up: how
 * far ahead was I in *this* spot. Shown next to what the pot was demanding, so
 * "I had 38%" can be read against "I needed 24%".
 */
function Equity({ handId }: { handId: string }): JSX.Element {
  const [range, setRange] = useState(DEFAULT_RANGE)
  const [draft, setDraft] = useState(DEFAULT_RANGE)
  const [report, setReport] = useState<EquityReport | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBusy(true)
    setReport(undefined)
    // Through `get`, so whichever transport is active (Express or the web
    // app's Worker) answers. An unparsable range or a missing hand rejects
    // with the server's own message, shown in place of the table.
    get<EquityReport>(`/hand/${handId}/equity?range=${encodeURIComponent(range)}`)
      .catch((cause: Error): EquityReport => ({ range, streets: [], error: cause.message }))
      .then(setReport)
      .finally(() => setBusy(false))
  }, [handId, range])

  return (
    <div className="note">
      <header>Equity — quanto eri avanti, contro un range</header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          className="note-field"
          style={{ minHeight: 0, padding: '6px 10px', flex: 1 }}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setRange(draft)
          }}
        />
        <button className="ghost" type="button" onClick={() => setRange(draft)}>
          calcola
        </button>
      </div>

      {busy && <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 12 }}>calcolo…</p>}

      {report?.error !== undefined && (
        <p style={{ margin: 0, color: 'var(--amber)', fontSize: 12 }}>{report.error}</p>
      )}

      {report?.note !== undefined && (
        <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 12 }}>{report.note}</p>
      )}

      {report !== undefined && report.streets.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Strada</th>
              <th>Board</th>
              <th className="num">Equity</th>
              <th className="num">Ti serviva</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {report.streets.map((street) => (
              <tr key={street.street}>
                <th scope="row">{street.street}</th>
                <td style={{ color: 'var(--ink-dim)' }}>{street.board.join(' ')}</td>
                <td className="num">{street.equity.toFixed(1)}%</td>
                <td className="num" style={{ color: 'var(--ink-faint)' }}>
                  {street.requiredEquity === null ? '—' : `${street.requiredEquity.toFixed(0)}%`}
                </td>
                <td style={{ color: 'var(--ink-faint)', fontSize: 10 }}>
                  {street.exhaustive ? 'esatta' : `${street.samples.toLocaleString('it-IT')} campioni`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
