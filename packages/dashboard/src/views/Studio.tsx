import { useEffect, useRef, useState } from 'react'

import { get, post, type Filters } from '../api.js'
import { Panel } from '../components/Common.js'

interface Options {
  selectors: { id: string; label: string; description: string }[]
  presets: { id: string; label: string }[]
  rules: { id: string; label: string }[]
}

interface Built {
  text: string
  characters: number
  hands: { id: string; netBB: number; leaks: string[] }[]
}

/**
 * Where the tool hands over.
 *
 * Everything upstream exists to fill this box: the prompt is assembled, shown
 * in full, left editable, and copied. Nothing is sent anywhere — the analysis
 * happens in a conversation the player has themselves, which is the whole
 * design, not a limitation of it.
 */
export function Studio({ filters }: { filters: Filters }): JSX.Element {
  const [options, setOptions] = useState<Options | undefined>(undefined)
  const [selector, setSelector] = useState('biggest-losses')
  const [preset, setPreset] = useState('full')
  const [leakId, setLeakId] = useState('min-bet')
  const [limit, setLimit] = useState(5)

  const [built, setBuilt] = useState<Built | undefined>(undefined)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const editor = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    void get<Options>('/study/options').then(setOptions)
  }, [])

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await post<Built>('/study', {
        filter: filters,
        selector,
        preset,
        limit,
        ...(selector === 'same-leak' ? { leakId } : {}),
      })
      setBuilt(result)
      setText(result.text)
    } catch (cause) {
      setError((cause as Error).message)
      setBuilt(undefined)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void generate()
  }, [selector, preset, limit, leakId, JSON.stringify(filters)])

  /**
   * The one button the whole tool exists to serve, so it does not get to fail
   * quietly. The Clipboard API needs permission the browser can refuse; when it
   * does, fall back to selecting the textarea and letting the old command copy
   * it, and if even that fails, say so and leave the text selected so the
   * player can press the shortcut themselves.
   */
  const copy = async (): Promise<void> => {
    const done = (): void => {
      setCopied('done')
      window.setTimeout(() => setCopied('idle'), 1800)
    }

    try {
      await navigator.clipboard.writeText(text)
      done()
      return
    } catch {
      // Fall through to the selection-based copy.
    }

    const field = editor.current
    if (field !== null) {
      field.focus()
      field.select()
      if (document.execCommand('copy')) {
        done()
        return
      }
    }

    setCopied('failed')
  }

  const chosen = options?.selectors.find((entry) => entry.id === selector)

  return (
    <div className="page">
      <div>
        <h2 className="section">Studio</h2>
        <p className="caption">
          Scegli le mani, scegli la domanda, copia. Il tool non chiama nessun servizio: prepara il
          pacchetto e si ferma.
        </p>
      </div>

      <div className="studio">
        <div className="controls">
          <div className="field">
            <label htmlFor="s-selector">Selezione</label>
            <select
              id="s-selector"
              value={selector}
              onChange={(event) => setSelector(event.target.value)}
            >
              {options?.selectors.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          {chosen !== undefined && <p className="hint">{chosen.description}</p>}

          {selector === 'same-leak' && (
            <div className="field">
              <label htmlFor="s-leak">Quale leak</label>
              <select id="s-leak" value={leakId} onChange={(event) => setLeakId(event.target.value)}>
                {options?.rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="s-limit">Mani ({limit})</label>
            <input
              id="s-limit"
              type="range"
              min={1}
              max={10}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
            <p className="hint" style={{ marginTop: 2 }}>
              Oltre dieci il prompt diventa illeggibile.
            </p>
          </div>

          <div className="field">
            <label htmlFor="s-preset">Cosa chiedere</label>
            <select id="s-preset" value={preset} onChange={(event) => setPreset(event.target.value)}>
              {options?.presets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className={copied === 'done' ? 'copy done' : 'copy'}
            type="button"
            onClick={() => void copy()}
            disabled={text === ''}
          >
            {copied === 'done' ? '✓ copiato' : 'Copia negli appunti'}
          </button>

          {copied === 'failed' && (
            <p className="hint" style={{ color: 'var(--amber)' }}>
              Il browser ha rifiutato l'accesso agli appunti. Il testo è selezionato: copialo con
              Ctrl+C.
            </p>
          )}

          {built !== undefined && (
            <p className="hint">
              {built.hands.length} mani · {built.characters.toLocaleString('it-IT')} caratteri
            </p>
          )}
        </div>

        <div>
          <textarea
            ref={editor}
            className="prompt-editor"
            value={busy && text === '' ? 'Genero…' : text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
          <div className="editor-foot">
            <span>
              {error !== undefined
                ? `Errore: ${error}`
                : 'Modificabile prima di copiare: quello che leggi è quello che incolli.'}
            </span>
            <span>{text.length.toLocaleString('it-IT')} caratteri</span>
          </div>

          {built !== undefined && built.hands.length > 0 && (
            <Panel title="Mani incluse">
              <table>
                <thead>
                  <tr>
                    <th>Mano</th>
                    <th className="num">Risultato</th>
                    <th>Leak</th>
                  </tr>
                </thead>
                <tbody>
                  {built.hands.map((hand) => (
                    <tr key={hand.id}>
                      <th scope="row" style={{ color: 'var(--ink-faint)' }}>
                        {hand.id.slice(0, 10)}
                      </th>
                      <td className={`num ${hand.netBB < 0 ? 'neg' : 'pos'}`}>
                        {hand.netBB.toFixed(1)} bb
                      </td>
                      <td>
                        {hand.leaks.length === 0 ? (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        ) : (
                          hand.leaks.map((leak) => (
                            <span className="tag" key={leak}>
                              {leak}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
