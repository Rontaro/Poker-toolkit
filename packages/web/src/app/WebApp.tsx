import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { AppShell, ImportInstructionsContext, type ImportInstructions } from '@poker/ui'

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
    <>
      <p>
        Carica i file che il client di PokerStars scrive da solo, nella cartella{' '}
        <b>HandHistory</b> (su Windows, sotto <b>%LOCALAPPDATA%\PokerStars.Italy</b>). Ricaricali
        quando vuoi: le mani già viste non vengono duplicate. Restano in questo browser.
      </p>
      <code>Carica le tue mani</code>
    </>
  ),
}

const HAND_HISTORY_FILE = /\.txt$/i

const number = (value: number): string => value.toLocaleString('it-IT')

type Busy = 'import' | 'wipe' | undefined

/**
 * The app in the browser: the same shell as the local dashboard, with the
 * archive controls where the dashboard shows its live indicator. Every
 * request the views make goes to the Worker (see `main.tsx`); this component
 * only talks to it for the import, the status and the wipe.
 */
export function WebApp({ client }: { client: WorkerClient }): JSX.Element {
  const [status, setStatus] = useState<StoreStatus | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<Busy>(undefined)
  const [progress, setProgress] = useState<IngestProgress | undefined>(undefined)
  const [summary, setSummary] = useState<IngestSummary | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  const refresh = useCallback(() => {
    client
      .status()
      .then(setStatus)
      .catch((cause: Error) => setError(cause.message))
  }, [client])

  useEffect(refresh, [refresh])

  const upload = useCallback(
    async (picked: readonly File[]) => {
      if (busy !== undefined) return
      const files = picked.filter((file) => HAND_HISTORY_FILE.test(file.name))
      setError(undefined)
      setSummary(undefined)
      if (files.length === 0) {
        setError('Nessun file .txt: le hand history di PokerStars sono file di testo.')
        return
      }

      setBusy('import')
      setProgress(undefined)
      try {
        const result = await client.ingest(files, setProgress)
        setSummary(result.summary)
        setStatus(result.status)
      } catch (cause) {
        setError((cause as Error).message)
        refresh()
      } finally {
        setBusy(undefined)
        setProgress(undefined)
        setRevision((value) => value + 1)
      }
    },
    [busy, client, refresh],
  )

  const wipe = useCallback(async () => {
    if (busy !== undefined) return
    const confirmed = window.confirm(
      'Cancellare tutte le mani salvate in questo browser? Non si può annullare: per riaverle dovrai caricare di nuovo i file.',
    )
    if (!confirmed) return

    setBusy('wipe')
    setError(undefined)
    setSummary(undefined)
    try {
      setStatus(await client.wipe())
    } catch (cause) {
      setError((cause as Error).message)
      refresh()
    } finally {
      setBusy(undefined)
      setRevision((value) => value + 1)
    }
  }, [busy, client, refresh])

  useFileDrop((files) => void upload(files), setDragging)

  return (
    <ImportInstructionsContext.Provider value={WEB_IMPORT}>
      <AppShell
        revision={revision}
        foot={
          <StorePanel
            status={status}
            busy={busy}
            progress={progress}
            summary={summary}
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
    </ImportInstructionsContext.Provider>
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
  busy,
  progress,
  summary,
  error,
  onFiles,
  onWipe,
}: {
  status: StoreStatus | undefined
  busy: Busy
  progress: IngestProgress | undefined
  summary: IngestSummary | undefined
  error: string | undefined
  onFiles: (files: File[]) => void
  onWipe: () => void
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const disabled = busy !== undefined || status === undefined

  return (
    <div className="store-panel">
      <div className="store-count">
        <span className={status === undefined ? 'pulse' : 'pulse live'} />
        {status === undefined ? 'apertura archivio…' : `${number(status.handCount)} mani in archivio`}
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
      <button className="ghost store-action" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        {busy === 'import' ? 'Importazione…' : 'Carica le tue mani'}
      </button>

      {busy === 'import' && <ImportProgress progress={progress} />}
      {summary !== undefined && <ImportSummary summary={summary} />}

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

      <button className="ghost store-action store-danger" type="button" disabled={disabled} onClick={onWipe}>
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

function ImportSummary({ summary }: { summary: IngestSummary }): JSX.Element {
  return (
    <div className="store-summary" role="status">
      <p>
        <b>{number(summary.handsImported)}</b> {summary.handsImported === 1 ? 'mano nuova' : 'mani nuove'}
        {summary.handsAlreadyPresent > 0 && <>, {number(summary.handsAlreadyPresent)} già presenti</>}
        {summary.handsQuarantined > 0 && <>, {number(summary.handsQuarantined)} in quarantena</>} da{' '}
        {summary.files} file.
      </p>
      {summary.unrecognisedFiles.length > 0 && <p>Non riconosciuti: {summary.unrecognisedFiles.join(', ')}</p>}
      {summary.errors.map((failure) => (
        <p key={failure.file} className="neg">
          {failure.file}: {failure.message}
        </p>
      ))}
    </div>
  )
}
