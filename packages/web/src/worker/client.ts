import type { ApiRequest } from '@poker/api-core'
import { transportError, type Transport } from '@poker/ui'

import type {
  IngestProgress,
  IngestSummary,
  StoreStatus,
  UploadedFile,
  WorkerCommand,
  WorkerRequest,
  WorkerResponse,
} from './protocol.js'

/**
 * The page's side of the Worker: numbers each request, matches each answer to
 * it, and dresses the API requests up as the `Transport` `@poker/ui` expects,
 * so the views cannot tell a Worker from the Express server.
 */

/** The part of `Worker` the client uses, so tests can hand it a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void
}

const BASE = 'http://worker.invalid'

/**
 * Turns what the page would have fetched (`/api` + `target`) into the request
 * `dispatch` takes, the way the Express server does.
 *
 * The URL is parsed exactly as `fetch` would have sent it, so the path stays
 * percent-encoded (`dispatch` decodes parameters itself). Query values are
 * kept only when they are plain strings to Express's parser: a key repeated
 * (`?a=1&a=2`, an array to Express) or with brackets (`?a[b]=1`, an object)
 * is dropped, as the server's `stringsOf` drops it.
 */
export function toApiRequest(method: ApiRequest['method'], target: string, body?: unknown): ApiRequest {
  const url = new URL(`/api${target}`, BASE)
  const path = url.pathname.slice('/api'.length)

  const counts = new Map<string, number>()
  for (const key of url.searchParams.keys()) counts.set(key, (counts.get(key) ?? 0) + 1)

  const query: Record<string, string> = {}
  for (const [key, value] of url.searchParams) {
    if (counts.get(key) !== 1 || /\[[^\]]*\]/.test(key)) continue
    query[key] = value
  }

  if (method === 'GET') return { method, path, query }
  // `express.json()` hands the route a freshly parsed copy, `{}` when nothing
  // was sent; the same round trip here keeps a `Date` from arriving as a Date.
  const text = JSON.stringify(body)
  return { method, path, query, body: text === undefined ? {} : (JSON.parse(text) as unknown) }
}

interface Pending {
  readonly resolve: (response: WorkerResponse) => void
  readonly reject: (error: Error) => void
  readonly onProgress?: ((progress: IngestProgress) => void) | undefined
}

export class WorkerClient {
  readonly #worker: WorkerLike
  readonly #pending = new Map<number, Pending>()
  #nextId = 1
  /** Set once the Worker itself has died: every later request fails with it. */
  #broken: Error | undefined

  constructor(worker: WorkerLike) {
    this.#worker = worker
    worker.addEventListener('message', (event) => this.#receive(event.data))
    // The Worker script failed to load or threw at the top level: nothing in
    // flight will ever be answered.
    worker.addEventListener('error', (event) => {
      const detail = (event as ErrorEvent).message
      this.#fail(new Error(`Il Worker dell’archivio si è fermato${detail ? `: ${detail}` : ''}.`))
    })
    worker.addEventListener('messageerror', () => {
      this.#fail(new Error('Il Worker dell’archivio ha inviato un messaggio illeggibile.'))
    })
  }

  /** What `setTransport` takes. Same contract as `httpTransport`, errors
   * included: any non-2xx answer rejects with `body.error` or `<path>: <status>`. */
  readonly transport: Transport = {
    get: <T>(path: string, query: string) => this.#api<T>(path, toApiRequest('GET', `${path}${query}`)),
    post: <T>(path: string, body: unknown) => this.#api<T>(path, toApiRequest('POST', path, body)),
  }

  /** Reads the files and hands them to the Worker, which parses and stores
   * them; `onProgress` follows along. The bytes are transferred, not copied. */
  async ingest(
    files: readonly (File | UploadedFile)[],
    onProgress?: (progress: IngestProgress) => void,
  ): Promise<{ summary: IngestSummary; status: StoreStatus }> {
    const uploaded: UploadedFile[] = await Promise.all(
      files.map(async (file) =>
        file instanceof Blob ? { name: file.name, bytes: await file.arrayBuffer() } : file,
      ),
    )
    const response = await this.#request(
      { kind: 'ingest', files: uploaded },
      uploaded.map((file) => file.bytes),
      onProgress,
    )
    if (response.kind !== 'ingested') throw unexpected(response)
    return { summary: response.summary, status: response.status }
  }

  async status(): Promise<StoreStatus> {
    const response = await this.#request({ kind: 'status' })
    if (response.kind !== 'status') throw unexpected(response)
    return response.status
  }

  /** Deletes every stored hand. Rejects with a message for the user when the
   * data could not be deleted (e.g. another tab holds it). */
  async wipe(): Promise<StoreStatus> {
    const response = await this.#request({ kind: 'wipe' })
    if (response.kind !== 'wiped') throw unexpected(response)
    return response.status
  }

  async #api<T>(path: string, request: ApiRequest): Promise<T> {
    const response = await this.#request({ kind: 'api', request })
    if (response.kind !== 'api') throw unexpected(response)
    // `response.ok` is 200-299; anything else is a failure, as for fetch.
    if (response.status < 200 || response.status > 299) {
      throw transportError(path, response.status, response.body)
    }
    return response.body as T
  }

  #request(
    command: WorkerCommand,
    transfer: Transferable[] = [],
    onProgress?: (progress: IngestProgress) => void,
  ): Promise<WorkerResponse> {
    if (this.#broken !== undefined) return Promise.reject(this.#broken)
    const id = this.#nextId++
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onProgress })
      try {
        this.#worker.postMessage({ ...command, id } as WorkerRequest, transfer)
      } catch (cause) {
        this.#pending.delete(id)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })
  }

  #receive(response: WorkerResponse): void {
    const pending = this.#pending.get(response.id)
    // An answer nobody waits for (a request that already failed): ignored.
    if (pending === undefined) return

    if (response.kind === 'progress') {
      pending.onProgress?.(response.progress)
      return
    }

    this.#pending.delete(response.id)
    if (response.kind === 'error') pending.reject(new Error(response.message))
    else pending.resolve(response)
  }

  #fail(error: Error): void {
    this.#broken = error
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
}

function unexpected(response: WorkerResponse): Error {
  return new Error(`risposta inattesa dal Worker: ${response.kind}`)
}
