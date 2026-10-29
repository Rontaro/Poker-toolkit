import { dispatch } from '@poker/api-core'
import type { BrowserHandStore } from '@poker/store/browser'

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
  /** Where a programming error is reported in full, since the page only gets
   * Express's terse `<path>: 500` for it. */
  readonly logError?: (context: string, cause: unknown) => void
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

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
      throw new Error(`Non riesco ad aprire l’archivio delle mani: ${message(cause)}`, { cause })
    }
  }

  async function run(request: WorkerRequest): Promise<void> {
    const { id } = request
    switch (request.kind) {
      case 'api': {
        const current = await opened()
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
        // never opened has nothing to close.
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
          post({ id, kind: 'error', message: message(failure) })
          return
        }
        post({ id, kind: 'wiped', status })
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
        post({ id: request.id, kind: 'error', message: message(cause) })
      }
    })
    queue = next
    return next
  }
}
