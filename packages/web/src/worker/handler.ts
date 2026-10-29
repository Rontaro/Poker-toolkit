import { dispatch } from '@poker/api-core'
import type { BrowserHandStore } from '@poker/store/browser'

import { errorMessage } from './errors.js'
import { ingestFiles } from './ingest.js'
import type { StoreStatus, WorkerRequest, WorkerResponse } from './protocol.js'

/**
 * Everything the Worker does, without the Worker: `poker-worker.ts` only wires
 * this to `self`, so the logic runs (and is tested) in Node against an
 * in-memory store.
 */
export interface WorkerDeps {
  /** `BrowserHandStore.openPersistent()` in the Worker. */
  readonly openStore: () => Promise<BrowserHandStore>
  /** `deleteBrowserData()` in the Worker. */
  readonly deleteData: () => Promise<void>
  /** `BrowserHandStore.create()` in the Worker: the sample hands' own store,
   * in memory, so they can never mix with the user's. */
  readonly openDemoStore: () => Promise<BrowserHandStore>
  /** The sample hands' text, loaded only when the demo is first opened. */
  readonly loadDemoHands: () => Promise<string>
  /** Where a programming error is reported in full, since the page only gets
   * Express's terse `<path>: 500` for it. */
  readonly logError?: (context: string, cause: unknown) => void
}

/** What the sample hands are called as an import, should anything name it. */
const DEMO_FILE_NAME = 'mani-di-esempio.txt'

/** What `response.json(body)` puts on the wire, read back: `Date`s become ISO
 * strings, `undefined` fields disappear. Without it the page would get, over
 * `postMessage`, values Express could never have sent. */
function overJson(body: unknown): unknown {
  const text = JSON.stringify(body)
  return text === undefined ? undefined : (JSON.parse(text) as unknown)
}

async function statusOf(store: BrowserHandStore): Promise<StoreStatus> {
  const { handCount } = await store.stats({})
  return {
    handCount,
    persistent: store.persistent,
    ...(store.persistenceIssue === undefined ? {} : { persistenceIssue: store.persistenceIssue }),
  }
}

/**
 * Returns the function to call with each incoming request.
 *
 * Requests run one at a time, in arrival order. A wipe closes the store an
 * import may be writing to, and a read issued during the wipe must not reach a
 * closed database; serialising everything rules both out at the cost of a
 * view waiting for an import to finish, which is what it would show anyway.
 *
 * Nothing thrown escapes: a failure becomes the answer to the request that
 * caused it (an `error` message, or a 500 for an API route, as Express would
 * answer), and the Worker keeps serving the next one.
 */
export function createWorkerHandler(
  deps: WorkerDeps,
  post: (response: WorkerResponse) => void,
): (request: WorkerRequest) => Promise<void> {
  const logError = deps.logError ?? ((context, cause) => console.error(`[poker-worker] ${context}`, cause))

  let store: Promise<BrowserHandStore> = deps.openStore()
  // An open that fails is reported per request, not as an unhandled rejection.
  store.catch(() => undefined)

  async function opened(): Promise<BrowserHandStore> {
    try {
      return await store
    } catch (cause) {
      throw new Error(`Non riesco ad aprire l’archivio delle mani: ${errorMessage(cause)}`, { cause })
    }
  }

  /** The sample hands' store while the demo is on. Only ever set to a store
   * that opened: a failed demo leaves the views on the user's archive. */
  let demo: BrowserHandStore | undefined

  async function openDemo(): Promise<BrowserHandStore> {
    const sample = await deps.openDemoStore()
    try {
      const bytes = new TextEncoder().encode(await deps.loadDemoHands())
      // The same import as an upload: the sample goes through the parser and
      // its arithmetic check like any file the user could hand in.
      const summary = await ingestFiles(sample, [{ name: DEMO_FILE_NAME, bytes: bytes.buffer as ArrayBuffer }], () => undefined)
      const failure = summary.errors[0]?.message ?? (summary.handsImported === 0 ? 'nessuna mano letta' : undefined)
      if (failure !== undefined) throw new Error(failure)
      return sample
    } catch (cause) {
      sample.close()
      throw cause
    }
  }

  async function run(request: WorkerRequest): Promise<void> {
    const { id } = request
    switch (request.kind) {
      case 'api': {
        const current = demo ?? (await opened())
        let status: number
        let body: unknown
        try {
          const response = await dispatch(current, request.request)
          status = response.status
          body = overJson(response.body)
        } catch (cause) {
          // A programming error, which Express turns into a 500 whose body is
          // not JSON: the page sees `<path>: 500`, the console the cause.
          logError(`${request.request.method} ${request.request.path}`, cause)
          status = 500
          body = undefined
        }
        post({ id, kind: 'api', status, body })
        return
      }

      case 'ingest': {
        const current = await opened()
        const summary = await ingestFiles(current, request.files, (progress) => {
          post({ id, kind: 'progress', progress })
        })
        post({ id, kind: 'ingested', summary, status: await statusOf(current) })
        return
      }

      case 'status': {
        post({ id, kind: 'status', status: await statusOf(await opened()) })
        return
      }

      case 'wipe': {
        // The store must be closed before its files are deleted; a store that
        // never opened (the case the wipe is the way out of) has nothing to
        // close.
        const previous = await store.catch(() => undefined)
        try {
          previous?.close()
        } catch (cause) {
          logError('close before wipe', cause)
        }

        let failure: unknown
        try {
          await deps.deleteData()
        } catch (cause) {
          failure = cause
        }

        // Reopened either way: after a failed delete the hands are still on
        // disk, and the app must keep working on them.
        store = deps.openStore()
        store.catch(() => undefined)
        const status = await statusOf(await opened())

        if (failure !== undefined) {
          // A store in memory (OPFS held by another tab) took this tab's
          // hands with it when it closed: say that much happened, and that
          // the saved ones are still there.
          const text =
            previous?.persistent === false
              ? 'Le mani di questa scheda sono state cancellate. I dati salvati non sono raggiungibili da qui: ' +
                'chiudi le altre schede di questo sito e riprova per cancellare anche quelli.'
              : errorMessage(failure)
          post({ id, kind: 'error', message: text })
          return
        }
        post({ id, kind: 'wiped', status })
        return
      }

      case 'enter-demo': {
        // Independent of the user's archive: the demo opens even when that
        // one will not, or is held by another tab.
        if (demo === undefined) {
          try {
            demo = await openDemo()
          } catch (cause) {
            throw new Error(`Non riesco ad aprire le mani di esempio: ${errorMessage(cause)}`, { cause })
          }
        }
        const { handCount } = await demo.stats({})
        post({ id, kind: 'demo-entered', handCount })
        return
      }

      case 'leave-demo': {
        const sample = demo
        demo = undefined
        try {
          sample?.close()
        } catch (cause) {
          logError('close demo', cause)
        }
        post({ id, kind: 'demo-left' })
        return
      }
    }
  }

  let queue: Promise<void> = Promise.resolve()

  return (request) => {
    const next = queue.then(async () => {
      try {
        await run(request)
      } catch (cause) {
        logError(request.kind, cause)
        post({ id: request.id, kind: 'error', message: errorMessage(cause) })
      }
    })
    // Even if posting the error fails, the next request must still run.
    queue = next.catch((cause: unknown) => logError(`${request.kind}: answer not delivered`, cause))
    return next
  }
}
