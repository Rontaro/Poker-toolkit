import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

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

const WEB_IMPORT: ImportInstructions = {
  emptyState: (
    <p>
      Carica le hand history di PokerStars con <b>Carica le tue mani</b>, nella barra a lato,
      oppure trascina i file <code>.txt</code> su questa pagina. Restano in questo browser: non
      vengono inviate a nessuno.
    </p>
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

const HAND_HISTORY_FILE = /\.txt$/i

const OPEN_FAILED = 'Non riesco ad aprire l’archivio salvato. Puoi cancellarlo e ricominciare.'

const number = (value: number): string => value.toLocaleString('it-IT')

type Busy = 'import' | 'wipe' | undefined

/** What an import ended with: the Worker's summary, plus the files the page
 * itself left out before sending them. */
type ImportResult = IngestSummary & { readonly ignored: number }

/**
 * The app in the browser: the same shell as the local dashboard, with the
 * archive controls where the dashboard shows its live indicator. Every
 * request the views make goes to the Worker (see `start.tsx`); this component
 * only talks to it for the import, the status and the wipe.
 */
export function WebApp({ client }: { client: WorkerClient }): JSX.Element {
  const [status, setStatus] = useState<StoreStatus | undefined>(undefined)
  /** Why the archive could not be opened, when it could not: then the wipe is
   * the way out, and has to stay reachable. */
  const [openError, setOpenError] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<Busy>(undefined)
  const [progress, setProgress] = useState<IngestProgress | undefined>(undefined)
  const [result, setResult] = useState<ImportResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  // Read synchronously, unlike `busy`: two drops in the same tick both see the
  // state of the render before them, and would both start an import.
  const busyRef = useRef<Busy>(undefined)
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

  const upload = async (picked: readonly File[]): Promise<void> => {
    const files = picked.filter((file) => HAND_HISTORY_FILE.test(file.name))
    if (files.length === 0) {
      if (busyRef.current !== undefined) return
      setResult(undefined)
      setError('Nessun file .txt: le hand history di PokerStars sono file di testo.')
      return
    }
    if (!begin('import')) return

    setError(undefined)
    setResult(undefined)
    setProgress(undefined)
    try {
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
    if (busyRef.current !== undefined) return
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

  return (
    <>
      <AppShell
        revision={revision}
        importInstructions={WEB_IMPORT}
        foot={
          <StorePanel
            status={status}
            openError={openError}
            busy={busy}
            progress={progress}
            result={result}
            error={error}
            onFiles={(files) => void upload(files)}
            onWipe={() => void wipe()}
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

function StorePanel({
  status,
  openError,
  busy,
  progress,
  result,
  error,
  onFiles,
  onWipe,
}: {
  status: StoreStatus | undefined
  openError: string | undefined
  busy: Busy
  progress: IngestProgress | undefined
  result: ImportResult | undefined
  error: string | undefined
  onFiles: (files: File[]) => void
  onWipe: () => void
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const opening = status === undefined && openError === undefined
  // Uploading needs an open archive; wiping does not, since it is the only way
  // out of one that will not open.
  const canUpload = busy === undefined && status !== undefined
  const canWipe = busy === undefined && !opening

  return (
    <div className="rail-foot store-panel">
      <div className="store-count">
        <span className={status === undefined ? 'pulse' : 'pulse live'} />
        {status !== undefined
          ? `${number(status.handCount)} mani in archivio`
          : opening
            ? 'apertura archivio…'
            : 'archivio non disponibile'}
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

      {busy === 'import' && <ImportProgress progress={progress} />}
      {result !== undefined && <ImportSummary result={result} />}

      {openError !== undefined && (
        <p className="store-warning" role="alert">
          <b>{OPEN_FAILED}</b> <span className="store-detail">{openError}</span>
        </p>
      )}
      {status !== undefined && !status.persistent && (
        <p className="store-warning" role="status">
          <b>Le mani non verranno salvate.</b> {status.persistenceIssue}
        </p>
      )}
      {error !== undefined && (
        <p className="store-warning" role="alert">
          {error}
        </p>
      )}

      <button className="ghost store-action store-danger" type="button" disabled={!canWipe} onClick={onWipe}>
        {busy === 'wipe' ? 'Cancellazione…' : 'Cancella tutti i dati'}
      </button>
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
