import { useEffect, useState } from 'react'

import { get, post, type Filters } from '../api.js'
import { Panel, Term } from '../components/Common.js'

interface PlayedHand {
  id: string
  playedAt: string
  position: string | null
  hole: string
  board: string
}

interface EquityPlayer {
  notation: string
  combos: number
  equity: number
  win: number
  tie: number
}

interface EquityAnswer {
  players: EquityPlayer[]
  exhaustive: boolean
  samples: number
}

const RANGE_PRESETS: { label: string; notation: string }[] = [
  { label: 'coppie', notation: '22+' },
  { label: 'assi suited', notation: 'A2s+' },
  { label: 'broadway', notation: 'AKs, AQs, AJs, KQs, AKo, AQo, AJo, KQo' },
  { label: 'top 10%', notation: '77+, A9s+, KTs+, QJs, AJo+, KQo' },
  { label: 'largo (call station)', notation: '22+, A2s+, K7s+, Q9s+, J9s+, T9s, 98s, A7o+, K9o+, QTo+, JTo' },
  { label: 'qualsiasi mano', notation: 'random' },
]

/**
 * The equity calculator, with its own tab because it is a tool in its own right.
 *
 * The version attached to a played hand answers "how far ahead was I there".
 * This one answers "how do these compare", which is the question you ask away
 * from the table — and it can be preloaded from a hand you actually played, so
 * the two are the same workflow rather than two different tools.
 */
export function Equity({ filters }: { filters: Filters }): JSX.Element {
  const [hero, setHero] = useState('AhKh')
  const [villain, setVillain] = useState('22+, A2s+, K9s+, QTs+, JTs, T9s, A9o+, KTo+, QJo')
  const [board, setBoard] = useState('')
  const [answer, setAnswer] = useState<EquityAnswer | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [hands, setHands] = useState<PlayedHand[]>([])

  useEffect(() => {
    void get<PlayedHand[]>('/hand-list', filters).then(setHands)
  }, [JSON.stringify(filters)])

  /**
   * Takes explicit values rather than reading state, so loading a hand can
   * calculate the hand it just loaded instead of the one that was there before
   * React re-rendered. Not automatic on every keystroke: an exhaustive
   * calculation is real work and half-typed input is not a question.
   */
  const calculate = async (next?: { hero?: string; villain?: string; board?: string }): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      setAnswer(
        await post<EquityAnswer>('/equity', {
          players: [next?.hero ?? hero, next?.villain ?? villain],
          board: next?.board ?? board,
        }),
      )
    } catch (cause) {
      setError((cause as Error).message)
      setAnswer(undefined)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void calculate()
  }, [])

  const load = (hand: PlayedHand, upTo: number): void => {
    const nextHero = hand.hole.replace(/\s/g, '')
    const nextBoard = hand.board.split(' ').slice(0, upTo).join(' ')
    setHero(nextHero)
    setBoard(nextBoard)
    void calculate({ hero: nextHero, board: nextBoard })
  }

  return (
    <div className="page">
      <div>
        <h2 className="section">Equity</h2>
        <p className="caption">
          Quanto spesso la tua mano batte quella dell'avversario se le carte restanti uscissero
          tutte. Confrontala con l'
          <Term explain="Quanto devi mettere rispetto a quanto puoi vincere, girato in «quanto spesso devi avere la mano migliore perché chiamare convenga». È la soglia sopra la quale il call guadagna.">
            equity che ti servirebbe
          </Term>{' '}
          per capire se un call era giusto.
        </p>
      </div>

      <div className="equity-grid">
        <div className="controls">
          <div className="field">
            <label htmlFor="e-hero">La tua mano (o il tuo range)</label>
            <input
              id="e-hero"
              value={hero}
              spellCheck={false}
              onChange={(event) => setHero(event.target.value)}
            />
            <p className="hint" style={{ marginTop: 4 }}>
              Due carte precise come <code>AhKh</code>, oppure una notazione come{' '}
              <code>JJ+, AKs</code>.
            </p>
          </div>

          <div className="field">
            <label htmlFor="e-villain">Il range dell'avversario</label>
            <input
              id="e-villain"
              value={villain}
              spellCheck={false}
              onChange={(event) => setVillain(event.target.value)}
            />
            <div className="preset-row">
              {RANGE_PRESETS.map((preset) => (
                <button key={preset.label} type="button" onClick={() => setVillain(preset.notation)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="e-board">Board (0, 3, 4 o 5 carte)</label>
            <input
              id="e-board"
              value={board}
              placeholder="es. Ah 7d 2c"
              spellCheck={false}
              onChange={(event) => setBoard(event.target.value)}
            />
          </div>

          <button className="copy" type="button" onClick={() => void calculate()} disabled={busy}>
            {busy ? 'calcolo…' : 'Calcola'}
          </button>

          <p className="hint">
            <b>Come si scrive un range.</b> <code>22+</code> tutte le coppie da 22 in su.{' '}
            <code>AKs</code> asso-re dello stesso seme, <code>AKo</code> di semi diversi,{' '}
            <code>AK</code> entrambi. <code>ATs+</code> da AT a AK suited. <code>88-JJ</code> un
            intervallo. <code>random</code> qualsiasi mano.
          </p>
        </div>

        <div>
          {error !== undefined && (
            <Panel title="Non riesco a calcolare">
              <p style={{ padding: '16px', margin: 0, color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                {error}
              </p>
            </Panel>
          )}

          {answer !== undefined && (
            <Panel
              title="Risultato"
              meta={
                answer.exhaustive
                  ? 'calcolo esatto, tutte le combinazioni'
                  : `stima su ${answer.samples.toLocaleString('it-IT')} campioni`
              }
            >
              <div style={{ padding: '16px' }}>
                {answer.players.map((player, index) => (
                  <div key={index} style={{ marginBottom: index === 0 ? 20 : 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 12.5,
                          color: 'var(--chalk)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {index === 0 ? 'Tu: ' : 'Avversario: '}
                        {player.notation}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 24,
                          fontWeight: 500,
                          color: index === 0 ? 'var(--jade)' : 'var(--ink)',
                          flex: 'none',
                        }}
                      >
                        {player.equity.toFixed(1)}%
                      </span>
                    </div>
                    <div className="eq-bar">
                      <span style={{ width: `${player.equity}%` }} />
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                      {player.combos.toLocaleString('it-IT')} combinazioni
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Carica da una mano giocata" meta={`${hands.length} disponibili`}>
            <div style={{ maxHeight: '38vh', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Pos.</th>
                    <th>Le tue carte</th>
                    <th>Board</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {hands.map((hand) => (
                    <tr key={hand.id}>
                      <td style={{ color: 'var(--ink-dim)' }}>
                        {hand.playedAt.slice(5, 16).replace('T', ' ')}
                      </td>
                      <td style={{ color: 'var(--ink-dim)' }}>{hand.position ?? '—'}</td>
                      <td>{hand.hole}</td>
                      <td style={{ color: 'var(--ink-dim)' }}>{hand.board || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="ghost" type="button" onClick={() => load(hand, 0)}>
                            preflop
                          </button>
                          {hand.board !== '' && (
                            <button className="ghost" type="button" onClick={() => load(hand, 3)}>
                              flop
                            </button>
                          )}
                          {hand.board.split(' ').length >= 5 && (
                            <button className="ghost" type="button" onClick={() => load(hand, 5)}>
                              river
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
