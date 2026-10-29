import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { AppShell, type ImportInstructions } from '@poker/ui'

import type { WorkerClient } from '../worker/client.js'
import type { IngestProgress, IngestSummary, StoreStatus } from '../worker/protocol.js'

// Served from this origin, not from Google Fonts: the site makes no request to
// anyone else. Same families and weights as the local dashboard's index.html.
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-sans-condensed/400.css'
import '@fontsource/ibm-plex-sans-condensed/500.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'
import '@poker/ui/styles.css'
import './web.css'

/** How to get hands in, as the views word it. With `onDemo`, the empty
 * archive also offers the sample hands. */
function webImport(onDemo: (() => void) | undefined): ImportInstructions {
  return {
    emptyState: (
      <>
        <p>
          Carica le hand history di PokerStars con <b>Carica le tue mani</b>, nella barra a lato,
          oppure trascina i file <code>.txt</code> su questa pagina. Restano in questo browser: non
          vengono inviate a nessuno.
        </p>
        {onDemo !== undefined && (
          <p>
            Non hai file a portata di mano?{' '}
            <button className="ghost" type="button" onClick={onDemo}>
              Prova con mani di esempio
            </button>
          </p>
        )}
      </>
    ),
    guideStep: (
      <p>
        Con <b>Carica le tue mani</b>, nella barra a lato, scegli i file che il client di PokerStars
        scrive da solo nella cartella <b>HandHistory</b> (su Windows, sotto{' '}
        <b>%LOCALAPPDATA%\PokerStars.Italy</b>). Ricaricali quando vuoi: le mani già viste non vengono
        duplicate. Restano in questo browser.
      </p>
    ),
  }
}

const HAND_HISTORY_FILE = /\.txt$/i

const OPEN_FAILED = 'Non riesco ad aprire l’archivio salvato. Puoi cancellarlo e ricominciare.'

const DEMO_NOTICE = 'Stai guardando mani di esempio, generate apposta: non sono di nessun giocatore reale.'

const number = (value: number): string => value.toLocaleString('it-IT')

type Busy = 'import' | 'wipe' | 'demo' | undefined

/** The sample hands on screen instead of the user's; `handCount` is
 * undefined while they load. */
type Demo = { readonly handCount: number | undefined } | undefined

/** What an import ended with: the Worker's summary, plus the files the page
 * itself left out before sending them. */
type ImportResult = IngestSummary & { readonly ignored: number }

/** `?demo=1` follows the demo, so a reload lands where the user was. */
function setDemoInUrl(on: boolean): void {
  const url = new URL(window.location.href)
  if (on) url.searchParams.set('demo', '1')
  else url.searchParams.delete('demo')
  window.history.replaceState(window.history.state, '', url)
}

/**
 * The app in the browser: the same shell as the local dashboard, with the
 * archive controls where the dashboard shows its live indicator. Every
 * request the views make goes to the Worker (see `start.tsx`); this component
 * only talks to it for the import, the status, the wipe and the demo.
 *
 * In the demo the views read the sample hands, which the Worker keeps in a
 * store of their own; the user's archive stays as it was. Loading files means
 * wanting to see one's own hands, so it leaves the demo and imports into the
 * user's archive, and the result is on screen at once. The wipe is hidden:
 * next to sample hands, "delete all data" would read as deleting those, and
 * it would act on an archive that is not on screen.
 *
 * `demoAtStart` is the demo `start.tsx` already asked the Worker for, before
 * the views' first requests, when the page was opened at `?demo=1`.
 */
export function WebApp({
  client,
  demoAtStart,
}: {
  client: WorkerClient
  demoAtStart?: Promise<number> | undefined
}): JSX.Element {
  const [status, setStatus] = useState<StoreStatus | undefined>(undefined)
  /** Why the archive could not be opened, when it could not: then the wipe is
   * the way out, and has to stay reachable. */
  const [openError, setOpenError] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  // Opened at `?demo=1`: busy with the demo `start.tsx` already asked for.
  const initialBusy: Busy = demoAtStart === undefined ? undefined : 'demo'
  const [busy, setBusy] = useState<Busy>(initialBusy)
  const [demo, setDemo] = useState<Demo>(demoAtStart === undefined ? undefined : { handCount: undefined })
  const [progress, setProgress] = useState<IngestProgress | undefined>(undefined)
  const [result, setResult] = useState<ImportResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  // Read synchronously, unlike `busy`: two drops in the same tick both see the
  // state of the render before them, and would both start an import.
  const busyRef = useRef<Busy>(initialBusy)
  const begin = (next: Exclude<Busy, undefined>): boolean => {
    if (busyRef.current !== undefined) return false
    busyRef.current = next
    setBusy(next)
    return true
  }
  const end = (): void => {
    busyRef.current = undefined
    setBusy(undefined)
  }

  const opened = (next: StoreStatus): void => {
    setStatus(next)
    setOpenError(undefined)
  }

  const refresh = useCallback(() => {
    client
      .status()
      .then(opened)
      .catch((cause: Error) => {
        setStatus(undefined)
        setOpenError(cause.message)
      })
  }, [client])

  useEffect(refresh, [refresh])

  useEffect(() => {
    if (demoAtStart === undefined) return
    demoAtStart
      .then(
        (handCount) => setDemo({ handCount }),
        (cause: Error) => {
          setDemo(undefined)
          setDemoInUrl(false)
          setError(cause.message)
          setRevision((value) => value + 1)
        },
      )
      .finally(end)
  }, [demoAtStart])

  const enterDemo = async (): Promise<void> => {
    if (!begin('demo')) return
    setError(undefined)
    setResult(undefined)
    setDemo({ handCount: undefined })
    try {
      setDemo({ handCount: await client.enterDemo() })
      setDemoInUrl(true)
    } catch (cause) {
      setDemo(undefined)
      setError((cause as Error).message)
    } finally {
      end()
      setRevision((value) => value + 1)
    }
  }

  /** Back to the user's archive. Throws if the Worker could not do it. */
  const backToArchive = async (): Promise<void> => {
    await client.leaveDemo()
    setDemo(undefined)
    setDemoInUrl(false)
    setRevision((value) => value + 1)
  }

  const leaveDemo = async (): Promise<void> => {
    if (!begin('demo')) return
    setError(undefined)
    try {
      await backToArchive()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      end()
    }
  }

  const upload = async (picked: readonly File[]): Promise<void> => {
    if (busyRef.current !== undefined) return
    // The button is disabled until the archive is open; a drop has no such
    // guard, so it gets the same answer in words.
    if (status === undefined) {
      setResult(undefined)
      setError(
        openError === undefined
          ? 'L’archivio si sta ancora aprendo: riprova tra un attimo.'
          : 'Non posso importare: l’archivio salvato non si apre.',
      )
      return
    }
    const files = picked.filter((file) => HAND_HISTORY_FILE.test(file.name))
    if (files.length === 0) {
      setResult(undefined)
      setError('Nessun file .txt: le hand history di PokerStars sono file di testo.')
      return
    }
    if (!begin('import')) return

    setError(undefined)
    setResult(undefined)
    setProgress(undefined)
    try {
      if (demo !== undefined) await backToArchive()
      const outcome = await client.ingest(files, setProgress)
      setResult({ ...outcome.summary, ignored: picked.length - files.length })
      opened(outcome.status)
    } catch (cause) {
      setError((cause as Error).message)
      refresh()
    } finally {
      end()
      setProgress(undefined)
      setRevision((value) => value + 1)
    }
  }

  const wipe = async (): Promise<void> => {
    if (busyRef.current !== undefined || demo !== undefined) return
    const confirmed = window.confirm(
      'Cancellare tutte le mani salvate in questo browser? Non si può annullare: per riaverle dovrai caricare di nuovo i file.',
    )
    if (!confirmed || !begin('wipe')) return

    setError(undefined)
    setResult(undefined)
    try {
      opened(await client.wipe())
    } catch (cause) {
      setError((cause as Error).message)
      refresh()
    } finally {
      end()
      setRevision((value) => value + 1)
    }
  }

  const uploadRef = useRef(upload)
  uploadRef.current = upload
  useFileDrop((files) => void uploadRef.current(files), setDragging)

  // Offered while the user's own archive is empty, wherever it says so.
  const canTryDemo = demo === undefined && status?.handCount === 0
  const enterDemoRef = useRef(enterDemo)
  enterDemoRef.current = enterDemo
  const instructions = useMemo(
    () => webImport(canTryDemo ? () => void enterDemoRef.current() : undefined),
    [canTryDemo],
  )

  return (
    <>
      <AppShell
        revision={revision}
        importInstructions={instructions}
        banner={
          demo !== undefined && (
            <div className="demo-banner" role="status">
              <p>
                <b>{DEMO_NOTICE}</b> Il tuo archivio resta com’è: quando esci dalla demo lo ritrovi intatto.
                <br />
                Le note che scrivi qui sono solo per prova: spariscono quando esci dalla demo.
              </p>
              <button className="ghost demo-exit" type="button" disabled={busy !== undefined} onClick={() => void leaveDemo()}>
                Esci dalla demo
              </button>
            </div>
          )
        }
        foot={
          <StorePanel
            status={status}
            openError={openError}
            demo={demo}
            busy={busy}
            progress={progress}
            result={result}
            error={error}
            onFiles={(files) => void upload(files)}
            onWipe={() => void wipe()}
            onDemo={canTryDemo ? () => void enterDemo() : undefined}
          />
        }
      />
      {dragging && (
        <div className="drop-veil" aria-hidden="true">
          <p>Rilascia i file .txt per importarli</p>
        </div>
      )}
    </>
  )
}

/** Files dropped anywhere on the page. Counts enter/leave pairs because they
 * fire for every child element the pointer crosses. */
function useFileDrop(onFiles: (files: File[]) => void, onDragging: (dragging: boolean) => void): void {
  const handler = useRef(onFiles)
  handler.current = onFiles

  useEffect(() => {
    let depth = 0
    const carriesFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false

    const enter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      onDragging(true)
    }
    const over = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
    }
    const leave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) onDragging(false)
    }
    const drop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      onDragging(false)
      handler.current([...(event.dataTransfer?.files ?? [])])
    }

    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [onDragging])
}

/** What the count line says about the user's archive. Out of OPFS (another
 * tab holds it, a private window, an old browser) the hands here live only in
 * this tab, and "0 mani in archivio" would read as the saved ones being gone. */
function archiveLine(status: StoreStatus | undefined, opening: boolean): string {
  if (status === undefined) return opening ? 'apertura archivio…' : 'archivio non disponibile'
  if (status.persistent) return `${number(status.handCount)} mani in archivio`
  return status.handCount === 0
    ? 'archivio salvato non raggiungibile da qui'
    : `${number(status.handCount)} mani solo in questa scheda`
}

function StorePanel({
  status,
  openError,
  demo,
  busy,
  progress,
  result,
  error,
  onFiles,
  onWipe,
  onDemo,
}: {
  status: StoreStatus | undefined
  openError: string | undefined
  demo: Demo
  busy: Busy
  progress: IngestProgress | undefined
  result: ImportResult | undefined
  error: string | undefined
  onFiles: (files: File[]) => void
  onWipe: () => void
  onDemo: (() => void) | undefined
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const opening = status === undefined && openError === undefined
  // Uploading needs an open archive; wiping does not, since it is the only way
  // out of one that will not open.
  const canUpload = busy === undefined && status !== undefined
  const canWipe = busy === undefined && !opening

  const ready = demo === undefined ? status !== undefined : demo.handCount !== undefined
  const line =
    demo === undefined
      ? archiveLine(status, opening)
      : demo.handCount === undefined
        ? 'apertura mani di esempio…'
        : `${number(demo.handCount)} mani di esempio`

  return (
    <div className="rail-foot store-panel">
      <div className="store-count">
        <span className={ready ? 'pulse live' : 'pulse'} />
        {line}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        accept=".txt,text/plain"
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // Cleared so that picking the same file again still fires a change.
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
      <button className="ghost store-action" type="button" disabled={!canUpload} onClick={() => input.current?.click()}>
        {busy === 'import' ? 'Importazione…' : 'Carica le tue mani'}
      </button>
      <a className="store-privacy" href="/privacy">
        Privacy delle tue mani
      </a>
      {onDemo !== undefined && (
        <button className="ghost store-action" type="button" disabled={busy !== undefined} onClick={onDemo}>
          {busy === 'demo' ? 'Apertura…' : 'Prova con mani di esempio'}
        </button>
      )}

      {busy === 'import' && <ImportProgress progress={progress} />}
      {result !== undefined && <ImportSummary result={result} />}

      {openError !== undefined && (
        <p className="store-warning" role="alert">
          <b>{OPEN_FAILED}</b> <span className="store-detail">{openError}</span>
        </p>
      )}
      {demo === undefined && status !== undefined && !status.persistent && (
        <p className="store-warning" role="status">
          <b>Le mani non verranno salvate.</b> {status.persistenceIssue}
        </p>
      )}
      {error !== undefined && (
        <p className="store-warning" role="alert">
          {error}
        </p>
      )}

      {demo === undefined && (
        <button className="ghost store-action store-danger" type="button" disabled={!canWipe} onClick={onWipe}>
          {busy === 'wipe' ? 'Cancellazione…' : 'Cancella tutti i dati'}
        </button>
      )}
    </div>
  )
}

function ImportProgress({ progress }: { progress: IngestProgress | undefined }): JSX.Element {
  const share = progress === undefined || progress.bytesTotal === 0 ? 0 : progress.bytesDone / progress.bytesTotal
  const current = progress === undefined ? 0 : Math.min(progress.filesDone + 1, progress.filesTotal)

  return (
    <div className="store-progress">
      <div
        className="bar"
        role="progressbar"
        aria-label="Avanzamento dell’importazione"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </div>
      <small>
        {progress === undefined
          ? 'lettura dei file…'
          : `file ${current} di ${progress.filesTotal} · ${number(progress.handsDone)} mani`}
      </small>
    </div>
  )
}

function ImportSummary({ result }: { result: ImportResult }): JSX.Element {
  return (
    <div className="store-summary" role="status">
      <p>
        <b>{number(result.handsImported)}</b> {result.handsImported === 1 ? 'mano nuova' : 'mani nuove'}
        {result.handsAlreadyPresent > 0 && <>, {number(result.handsAlreadyPresent)} già presenti</>}
        {result.handsQuarantined > 0 && <>, {number(result.handsQuarantined)} in quarantena</>} da{' '}
        {result.files} file.
      </p>
      {result.ignored > 0 && (
        <p>
          {result.ignored} {result.ignored === 1 ? 'file ignorato perché non è' : 'file ignorati perché non sono'}{' '}
          .txt.
        </p>
      )}
      {result.unrecognisedFiles.length > 0 && <p>Non riconosciuti: {result.unrecognisedFiles.join(', ')}</p>}
      {result.errors.map((failure, index) => (
        <p key={index} className="neg">
          {failure.file}: {failure.message}
        </p>
      ))}
    </div>
  )
}
