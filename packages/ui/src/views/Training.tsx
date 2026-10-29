import { useEffect, useMemo, useRef, useState, type JSX } from 'react'

import {
  ENDLESS,
  LEVELS,
  drillById,
  endlessRound,
  grade,
  levelRound,
  pointsFor,
  record,
  seeded,
  weakest,
  type DrillId,
  type Level,
  type Quality,
  type Round,
  type Spot,
  type Stats,
  type TableView,
  type Verdict,
} from '@poker/trainer'

import { CardRow, DeckGrid, Gauge, HiddenPair } from '../components/Cards.js'
import { Panel } from '../components/Common.js'

/**
 * The trainer.
 *
 * Everything else in this dashboard looks backwards at hands you have already
 * played. This looks forward: it deals a spot, asks the one number the spot
 * turns on, and then shows the arithmetic you should have done. It never asks
 * anything it cannot check — every answer here is computed by the same engine
 * the rest of the tool uses, not written down by hand.
 *
 * It runs entirely in the browser and the progress lives in this browser's own
 * storage: the API over the hand store is read-only by design, and a game score
 * has no business in the hand database anyway.
 */

const STORAGE_KEY = 'poker-trainer-v1'

interface LevelProgress {
  readonly cleared: boolean
  readonly best: number
  readonly runs: number
}

interface Saved {
  readonly levels: Record<string, LevelProgress>
  readonly endless: { readonly score: number; readonly streak: number }
  readonly stats: Stats
}

const EMPTY_SAVED: Saved = { levels: {}, endless: { score: 0, streak: 0 }, stats: {} }

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return EMPTY_SAVED
    return { ...EMPTY_SAVED, ...(JSON.parse(raw) as Saved) }
  } catch {
    return EMPTY_SAVED
  }
}

function persist(saved: Saved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Private window, storage disabled, quota: the exercises still work, only
    // the history is lost. Not worth interrupting anyone over.
  }
}

/** Sent on `window` when the progress is deleted, so a trainer on screen
 * forgets it too instead of writing it back with its next answer. */
const RESET_EVENT = 'poker-trainer-reset'

/**
 * Deletes the trainer's progress from this browser: levels, record, the
 * per-exercise statistics. For the web app's "Cancella tutti i dati", which
 * has to mean all of them; a Training view that is open starts over.
 */
export function clearTrainingProgress(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage disabled: then nothing was ever saved.
  }
  window.dispatchEvent(new Event(RESET_EVENT))
}

interface Result {
  readonly drill: DrillId
  readonly quality: Quality
  readonly ms: number
}

interface Session {
  readonly kind: 'level' | 'endless'
  readonly level?: Level
  readonly index: number
  readonly round: Round
  readonly results: readonly Result[]
  readonly score: number
  readonly streak: number
  readonly bestStreak: number
  readonly startedAt: number
}

export function Training(): JSX.Element {
  const [saved, setSaved] = useState<Saved>(load)
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [finished, setFinished] = useState<Session | undefined>(undefined)
  const rng = useRef<() => number>(seeded(Date.now() >>> 0))

  useEffect(() => {
    const reset = (): void => {
      setSaved(EMPTY_SAVED)
      setSession(undefined)
      setFinished(undefined)
    }
    window.addEventListener(RESET_EVENT, reset)
    return () => window.removeEventListener(RESET_EVENT, reset)
  }, [])

  const update = (next: Saved): void => {
    setSaved(next)
    persist(next)
  }

  const startLevel = (level: Level): void => {
    rng.current = seeded((Date.now() ^ (Math.random() * 2 ** 31)) >>> 0)
    setFinished(undefined)
    setSession({
      kind: 'level',
      level,
      index: 0,
      round: levelRound(rng.current, level, 0),
      results: [],
      score: 0,
      streak: 0,
      bestStreak: 0,
      startedAt: Date.now(),
    })
  }

  const startEndless = (): void => {
    rng.current = seeded((Date.now() ^ (Math.random() * 2 ** 31)) >>> 0)
    setFinished(undefined)
    setSession({
      kind: 'endless',
      index: 0,
      round: endlessRound(rng.current, ENDLESS, saved.stats, 0),
      results: [],
      score: 0,
      streak: 0,
      bestStreak: 0,
      startedAt: Date.now(),
    })
  }

  if (session !== undefined) {
    return (
      <Play
        session={session}
        stats={saved.stats}
        rng={rng.current}
        onProgress={(stats) => update({ ...saved, stats })}
        onAdvance={setSession}
        onFinish={(done) => {
          setSession(undefined)
          // Closed before answering anything: nothing happened, so nothing is
          // recorded and there is no report to read.
          if (done.results.length === 0) return
          setFinished(done)
          update(closeOut(saved, done))
        }}
      />
    )
  }

  return (
    <Menu
      saved={saved}
      finished={finished}
      onLevel={startLevel}
      onEndless={startEndless}
      onReset={() => update(EMPTY_SAVED)}
      onDismiss={() => setFinished(undefined)}
    />
  )
}

/** Folds a finished session into what is kept between sessions. */
function closeOut(saved: Saved, done: Session): Saved {
  const right = done.results.filter((result) => result.quality !== 'wrong').length

  if (done.kind === 'endless') {
    return {
      ...saved,
      endless: {
        score: Math.max(saved.endless.score, done.score),
        streak: Math.max(saved.endless.streak, done.bestStreak),
      },
    }
  }

  const level = done.level
  if (level === undefined) return saved
  const previous = saved.levels[level.id] ?? { cleared: false, best: 0, runs: 0 }

  return {
    ...saved,
    levels: {
      ...saved.levels,
      [level.id]: {
        cleared: previous.cleared || right >= level.pass,
        best: Math.max(previous.best, right),
        runs: previous.runs + 1,
      },
    },
  }
}

/* ─── the menu ──────────────────────────────────────────────────────────── */

function Menu({
  saved,
  finished,
  onLevel,
  onEndless,
  onReset,
  onDismiss,
}: {
  saved: Saved
  finished: Session | undefined
  onLevel: (level: Level) => void
  onEndless: () => void
  onReset: () => void
  onDismiss: () => void
}): JSX.Element {
  const nextUp = LEVELS.find((level) => !(saved.levels[level.id]?.cleared ?? false))
  const soft = weakest(saved.stats, ENDLESS.drills)

  return (
    <div className="page stage wide">
      <div>
        <h2 className="section">Allenamento</h2>
        <p className="caption">
          Contare gli out, trasformarli in equity, confrontarla col prezzo del piatto. Sono i
          quattro conti che decidono le mani, e sono gli unici che al tavolo devi saper fare da
          solo. Qui li fai finché non ti vengono senza pensarci.
        </p>
      </div>

      {finished !== undefined && <Summary session={finished} onDismiss={onDismiss} />}

      <div className="figures">
        <div className="figure">
          <dt>Livelli superati</dt>
          <dd>
            {LEVELS.filter((level) => saved.levels[level.id]?.cleared ?? false).length}
            <span className="unit">su {LEVELS.length}</span>
          </dd>
        </div>
        <div className="figure">
          <dt>Record infinito</dt>
          <dd>{saved.endless.score.toLocaleString('it-IT')}</dd>
          <small>{saved.endless.streak} di fila</small>
        </div>
        <div className="figure">
          <dt>Risposte date</dt>
          <dd>{Object.values(saved.stats).reduce((sum, stat) => sum + stat.asked, 0)}</dd>
        </div>
        <div className="figure">
          <dt>Da rivedere</dt>
          <dd className="small-figure">{soft === undefined ? '—' : drillById(soft).label}</dd>
          <small>{soft === undefined ? 'ancora pochi dati' : 'è quello che sbagli di più'}</small>
        </div>
      </div>

      <div className="level-grid">
        {LEVELS.map((level, index) => {
          const progress = saved.levels[level.id]
          const cleared = progress?.cleared ?? false
          return (
            <button
              key={level.id}
              type="button"
              className={`level-card${cleared ? ' cleared' : ''}${level.id === nextUp?.id ? ' next' : ''}`}
              onClick={() => onLevel(level)}
            >
              <span className="n">{String(index + 1).padStart(2, '0')}</span>
              <h4>{level.title}</h4>
              <p>{level.goal}</p>
              <span className="foot">
                {level.questions} domande · ne servono {level.pass}
                {progress !== undefined && ` · meglio ${progress.best}`}
              </span>
              {cleared && <span className="stamp">fatto</span>}
              {!cleared && level.id === nextUp?.id && <span className="stamp next-stamp">tocca a te</span>}
            </button>
          )
        })}

        <button type="button" className="level-card endless" onClick={onEndless}>
          <span className="n">∞</span>
          <h4>{ENDLESS.label}</h4>
          <p>{ENDLESS.goal}</p>
          <span className="foot">record {saved.endless.score.toLocaleString('it-IT')} punti</span>
        </button>
      </div>

      <Panel title="Cosa allena, esercizio per esercizio">
        <table className="glossary">
          <thead>
            <tr>
              <th style={{ width: 200 }}>Esercizio</th>
              <th>A cosa serve</th>
              <th style={{ width: 120 }}>Come vai</th>
            </tr>
          </thead>
          <tbody>
            {ENDLESS.drills.map((id) => {
              const drill = drillById(id)
              const stat = saved.stats[id]
              return (
                <tr key={id}>
                  <td>{drill.label}</td>
                  <td>{drill.why}</td>
                  <td className="num">
                    {stat === undefined || stat.asked === 0
                      ? '—'
                      : `${Math.round((stat.right / stat.asked) * 100)}% su ${stat.asked}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      <div className="editor-foot">
        <span className="hint">
          I progressi restano in questo browser. Il database delle mani non viene toccato.
        </span>
        <button className="ghost" type="button" onClick={onReset}>
          azzera i progressi
        </button>
      </div>
    </div>
  )
}

/* ─── playing ───────────────────────────────────────────────────────────── */

function Play({
  session,
  stats,
  rng,
  onProgress,
  onAdvance,
  onFinish,
}: {
  session: Session
  stats: Stats
  rng: () => number
  onProgress: (stats: Stats) => void
  onAdvance: (session: Session) => void
  onFinish: (session: Session) => void
}): JSX.Element {
  const [typed, setTyped] = useState('')
  const [verdict, setVerdict] = useState<{ value: Verdict; points: number } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [theory, setTheory] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // Enter is handled by whatever has the focus — the answer box, then the
  // button that replaces it — and never by a listener on the window. A window
  // listener added while the keydown is still bubbling receives that same
  // keypress, which submitted an answer and skipped its explanation in one go.
  const advancing = useRef(false)

  const spot = session.round.spot
  const total = session.level?.questions

  useEffect(() => {
    setTyped('')
    setVerdict(undefined)
    advancing.current = false
    input.current?.focus()
  }, [session.index])

  const submit = (given: number): void => {
    if (verdict !== undefined) return
    const value = grade(spot, given)
    const ms = Date.now() - session.startedAt
    const points = pointsFor(value.quality, session.round.multiplier, session.streak)

    setVerdict({ value, points })
    onProgress(record(stats, session.round.drill, value.correct, ms))
  }

  /** The session with the answer just given folded into it. */
  const settle = (): Session => {
    if (verdict === undefined) return session
    const streak = verdict.value.correct ? session.streak + 1 : 0
    return {
      ...session,
      results: [
        ...session.results,
        {
          drill: session.round.drill,
          quality: verdict.value.quality,
          ms: Date.now() - session.startedAt,
        },
      ],
      score: session.score + verdict.points,
      streak,
      bestStreak: Math.max(session.bestStreak, streak),
    }
  }

  const advance = (): void => {
    if (verdict === undefined || advancing.current) return
    advancing.current = true
    const settled = settle()
    const next: Session = { ...settled, index: session.index + 1 }
    const streak = settled.streak

    if (total !== undefined && next.index >= total) {
      onFinish(next)
      return
    }

    // Generating a spot can mean a couple of hundred thousand hand evaluations.
    // Yield first so the button visibly reacts instead of the tab freezing.
    setBusy(true)
    window.setTimeout(() => {
      const round =
        session.kind === 'endless'
          ? endlessRound(rng, ENDLESS, stats, streak)
          : levelRound(rng, session.level as Level, next.index)
      setBusy(false)
      onAdvance({ ...next, round, startedAt: Date.now() })
    }, 16)
  }

  const numeric = spot.question.kind === 'number'
  const parsed = Number(typed.replace(',', '.'))
  const ready = typed.trim() !== '' && Number.isFinite(parsed)

  return (
    <div className="page stage">
      <div className="drill-head">
        <div>
          <h2 className="section">
            {session.level?.title ?? ENDLESS.label}
            <span className="drill-kind">{drillById(session.round.drill).label}</span>
          </h2>
        </div>

        <div className="drill-hud">
          {session.kind === 'endless' ? (
            <>
              <span>
                <b>{session.score.toLocaleString('it-IT')}</b> punti
              </span>
              <span>
                <b>{session.streak}</b> di fila
              </span>
              <span className="tier">
                ×{session.round.multiplier} {session.round.tier?.label}
              </span>
            </>
          ) : (
            <span>
              <b>{session.index + 1}</b> di {total}
            </span>
          )}
          <button className="ghost" type="button" onClick={() => onFinish(settle())}>
            chiudi
          </button>
        </div>
      </div>

      {total !== undefined && (
        <div className="dots">
          {Array.from({ length: total }, (_, i) => {
            const result = session.results[i]
            return (
              <span
                key={i}
                className={`dot${result === undefined ? '' : ` ${result.quality}`}${i === session.index ? ' now' : ''}`}
              />
            )
          })}
        </div>
      )}

      <p className="prompt">{spot.ask}</p>

      <Felt table={spot.table} />

      <div className="answer-bay">
        {verdict === undefined ? (
          <div className="answer">
              {numeric ? (
                <>
                  <label htmlFor="answer">
                    La tua risposta
                    {spot.question.kind === 'number' && spot.question.unit !== '' && (
                      <span> in {unitLabel(spot.question.unit)}</span>
                    )}
                  </label>
                  <div className="answer-row">
                    <input
                      id="answer"
                      ref={input}
                      value={typed}
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setTyped(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && ready) submit(parsed)
                      }}
                    />
                    <button className="copy" type="button" disabled={!ready} onClick={() => submit(parsed)}>
                      Rispondi
                    </button>
                  </div>
                  {spot.question.kind === 'number' && spot.question.unit === 'out' && (
                    <div className="quick">
                      {Array.from({ length: 16 }, (_, i) => (
                        <button key={i} type="button" onClick={() => submit(i)}>
                          {i}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="hint">Invio per rispondere. Non tirare a indovinare: conta.</p>
                </>
              ) : (
                <div className="choices">
                  {spot.question.kind === 'choice' &&
                    spot.question.options.map((option, index) => (
                      <button key={option} type="button" onClick={() => submit(index)}>
                        {option}
                      </button>
                    ))}
                </div>
              )}
            </div>
        ) : (
          <div className="answer">
            <button
              className="copy big"
              type="button"
              onClick={advance}
              onKeyDown={(event) => {
                if (event.key === 'Enter') advance()
              }}
              disabled={busy}
              autoFocus
            >
              {busy
                ? 'preparo la mano…'
                : total !== undefined && session.index + 1 >= total
                  ? 'Vedi il riepilogo'
                  : 'Avanti'}
            </button>
            <p className="hint">Invio per continuare.</p>
          </div>
        )}
      </div>

      {verdict !== undefined ? (
        <Feedback spot={spot} verdict={verdict.value} points={verdict.points} kind={session.kind} />
      ) : (
        <div className="theory-strip">
          <p>
            <b>{drillById(session.round.drill).label}.</b>{' '}
            {drillById(session.round.drill).why}
          </p>
          {session.level !== undefined && (
            <>
              <button className="ghost" type="button" onClick={() => setTheory(!theory)}>
                {theory ? 'nascondi il ripasso' : 'ripassa la teoria del livello'}
              </button>
              {theory && (
                <div className="theory">
                  {session.level.theory.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function unitLabel(unit: string): string {
  return unit === 'out' ? 'numero di out' : unit === '%' ? 'percentuale' : 'combinazioni'
}

/* ─── the table ─────────────────────────────────────────────────────────── */

function Felt({ table }: { table: TableView }): JSX.Element {
  const streetName =
    table.street === 'preflop' ? 'preflop' : table.street === 'turn' ? 'turn' : 'flop'

  // Half the exercises are pure arithmetic on a pot and have no cards at all.
  // Those get the money big and alone rather than a table with nothing on it.
  const cardless =
    table.hero === undefined && table.board === undefined && table.villainLabel === undefined

  return (
    <div className={cardless ? 'felt money-only' : 'felt'}>
      {table.board !== undefined && table.board.length > 0 && (
        <CardRow label={`il board · ${streetName}`} cards={table.board} size="xl" />
      )}

      <div className="felt-hands">
        {table.hero !== undefined && <CardRow label="le tue carte" cards={table.hero} size="xl" />}
        {table.villain !== undefined && <CardRow label="le sue carte" cards={table.villain} size="xl" />}
        {table.villain === undefined && table.villainLabel !== undefined && (
          <CardRow label="lui può avere">
            <HiddenPair label={table.villainLabel} />
          </CardRow>
        )}
      </div>

      {(table.potBB !== undefined || table.betBB !== undefined) && (
        <div className="pot">
          {table.potBB !== undefined && (
            <span>
              piatto <b>{format(table.potBB)} bb</b>
            </span>
          )}
          {table.toCallBB !== undefined ? (
            <span>
              per chiamare <b>{format(table.toCallBB)} bb</b>
            </span>
          ) : (
            table.betBB !== undefined && (
              <span>
                la tua puntata <b>{format(table.betBB)} bb</b>
              </span>
            )
          )}
        </div>
      )}
    </div>
  )
}

function format(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace('.', ',')
}

/* ─── feedback ──────────────────────────────────────────────────────────── */

function Feedback({
  spot,
  verdict,
  points,
  kind,
}: {
  spot: Spot
  verdict: Verdict
  points: number
  kind: 'level' | 'endless'
}): JSX.Element {
  const word =
    verdict.quality === 'perfect' ? 'esatto' : verdict.quality === 'close' ? 'ci sei vicino' : 'no'

  return (
    <Panel
      title={spot.explain.headline}
      meta={kind === 'endless' && points > 0 ? `+${points} punti` : undefined}
    >
      <div className={`feedback ${verdict.quality}`}>
        <div className="verdict-line">
          <span className="badge">{word}</span>
          {spot.question.kind === 'number' ? (
            <Gauge
              given={verdict.given}
              answer={verdict.answer}
              min={spot.question.min}
              max={Math.max(spot.question.max, verdict.given, verdict.answer)}
              unit={spot.question.unit === '%' ? '%' : ''}
            />
          ) : (
            <span className="choice-verdict">
              {spot.question.options[verdict.answer]} era la risposta
            </span>
          )}
        </div>

        <div className="working">
          <table className="steps">
            <tbody>
              {spot.explain.steps.map((step) => (
                <tr key={step.label}>
                  <th scope="row">{step.label}</th>
                  <td>{step.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {spot.explain.outs !== undefined && spot.explain.outs.length > 0 && (
            <div className="outs-block">
              <span className="tag-label">le carte che contano</span>
              <DeckGrid outs={spot.explain.outs} known={spot.explain.known ?? []} />
              <div className="deck-legend">
                <span className="swatch out" /> {spot.explain.outsLabel ?? 'ti servono'}
                <span className="swatch dead" /> già scoperte
              </div>
            </div>
          )}
        </div>

        <p className="tip">
          <b>Da ricordare.</b> {spot.explain.tip}
        </p>
      </div>
    </Panel>
  )
}

/* ─── summary ───────────────────────────────────────────────────────────── */

function Summary({ session, onDismiss }: { session: Session; onDismiss: () => void }): JSX.Element {
  const right = session.results.filter((result) => result.quality !== 'wrong').length
  const perfect = session.results.filter((result) => result.quality === 'perfect').length
  const level = session.level
  const cleared = level !== undefined && right >= level.pass

  const times = [...session.results.map((result) => result.ms)].sort((a, b) => a - b)
  const median = times.length === 0 ? 0 : (times[Math.floor(times.length / 2)] as number)

  const byDrill = useMemo(() => {
    const map = new Map<DrillId, { asked: number; right: number }>()
    for (const result of session.results) {
      const current = map.get(result.drill) ?? { asked: 0, right: 0 }
      map.set(result.drill, {
        asked: current.asked + 1,
        right: current.right + (result.quality === 'wrong' ? 0 : 1),
      })
    }
    return [...map.entries()].sort((a, b) => a[1].right / a[1].asked - b[1].right / b[1].asked)
  }, [session])

  const worst = byDrill[0]

  return (
    <Panel
      title={
        session.kind === 'endless'
          ? `Sessione infinita — ${session.score.toLocaleString('it-IT')} punti`
          : cleared
            ? `Livello superato — ${right} su ${session.results.length}`
            : `Non ancora — ${right} su ${session.results.length}`
      }
      meta={session.kind === 'endless' ? `${session.bestStreak} di fila` : level?.title}
    >
      <div className="summary">
        <div className="figures">
          <div className="figure">
            <dt>Giuste</dt>
            <dd className={cleared || session.kind === 'endless' ? 'pos' : ''}>
              {right}
              <span className="unit">su {session.results.length}</span>
            </dd>
            <small>{perfect} in pieno</small>
          </div>
          <div className="figure">
            <dt>Tempo per domanda</dt>
            <dd>
              {(median / 1000).toFixed(1).replace('.', ',')}
              <span className="unit">s</span>
            </dd>
            <small>mediana</small>
          </div>
          {worst !== undefined && (
            <div className="figure">
              <dt>Il punto debole</dt>
              <dd className="small-figure">{drillById(worst[0]).label}</dd>
              <small>
                {worst[1].right} su {worst[1].asked}
              </small>
            </div>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>Esercizio</th>
              <th className="num">Giuste</th>
            </tr>
          </thead>
          <tbody>
            {byDrill.map(([id, stat]) => (
              <tr key={id}>
                <td>{drillById(id).label}</td>
                <td className="num">
                  {stat.right}/{stat.asked}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="tip">
          {session.kind === 'endless'
            ? 'La modalità infinita pesca più spesso quello che sbagli: se un esercizio continua a tornare, è quello il livello da rifare.'
            : cleared
              ? 'Fatto. Il livello dopo dà per scontato questo, quindi vale la pena rifarlo ogni tanto: la velocità conta quanto la precisione.'
              : worst !== undefined
                ? `Rifallo guardando la teoria in alto: il grosso degli errori è su «${drillById(worst[0]).label}».`
                : 'Rifallo con calma, leggendo la spiegazione dopo ogni risposta.'}
        </p>

        <button className="ghost" type="button" onClick={onDismiss}>
          chiudi il riepilogo
        </button>
      </div>
    </Panel>
  )
}
