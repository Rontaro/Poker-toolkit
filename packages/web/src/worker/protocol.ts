import type { ApiRequest } from '@poker/api-core'

/**
 * Everything that crosses between the page and the Worker that owns the store.
 *
 * Every request carries an `id`; every message the Worker sends back carries
 * the id of the request it belongs to, so the client can have several in
 * flight and match each answer to its caller. A request gets exactly one final
 * message (its own kind, or `error`); an ingest may send any number of
 * `progress` messages before its final one.
 */

/** A file the user picked or dropped, already read: the Worker has no `File`
 * access of its own to the user's disk, only what the page hands it. */
export interface UploadedFile {
  readonly name: string
  readonly bytes: ArrayBuffer
}

export type WorkerRequest =
  /** What `fetch('/api' + path)` used to be: answered by `dispatch`. */
  | { readonly id: number; readonly kind: 'api'; readonly request: ApiRequest }
  | { readonly id: number; readonly kind: 'ingest'; readonly files: readonly UploadedFile[] }
  | { readonly id: number; readonly kind: 'status' }
  /** Close the store, delete everything stored, reopen an empty one. */
  | { readonly id: number; readonly kind: 'wipe' }
  /** Answer `api` requests from the sample hands, held in a store of their
   * own in memory, until `leave-demo`. The user's archive is never touched:
   * `status`, `ingest` and `wipe` keep acting on it throughout. */
  | { readonly id: number; readonly kind: 'enter-demo' }
  /** Back to the user's archive; the sample store is closed. */
  | { readonly id: number; readonly kind: 'leave-demo' }

export interface StoreStatus {
  readonly handCount: number
  /** false: the hands live in memory and are gone on reload. */
  readonly persistent: boolean
  /** Why `persistent` is false, worded for the user (Italian). */
  readonly persistenceIssue?: string
}

export interface IngestProgress {
  readonly filesTotal: number
  /** Files finished so far, the current one excluded. */
  readonly filesDone: number
  readonly currentFile?: string
  /** Hands parsed (stored or quarantined) so far, across all files. */
  readonly handsDone: number
  /** For the bar: bytes of the finished files, plus the share of the current
   * file its processed hands stand for. */
  readonly bytesDone: number
  readonly bytesTotal: number
}

export interface IngestSummary {
  readonly files: number
  /** Hands that were not in the archive before this import. */
  readonly handsImported: number
  /** Hands the archive already had (hand ids are content hashes, so a file
   * uploaded twice adds nothing the second time), including unparsable ones
   * an earlier upload had already set aside. */
  readonly handsAlreadyPresent: number
  /** Hands that did not parse and were set aside by this import. */
  readonly handsQuarantined: number
  /** Files no adapter recognised as a hand history. */
  readonly unrecognisedFiles: readonly string[]
  /** Files that failed outright, with why. The others were still imported. */
  readonly errors: readonly { readonly file: string; readonly message: string }[]
}

export type WorkerResponse =
  /** `body` already went through JSON, exactly as Express sends it. */
  | { readonly id: number; readonly kind: 'api'; readonly status: number; readonly body: unknown }
  | { readonly id: number; readonly kind: 'progress'; readonly progress: IngestProgress }
  | { readonly id: number; readonly kind: 'ingested'; readonly summary: IngestSummary; readonly status: StoreStatus }
  | { readonly id: number; readonly kind: 'status'; readonly status: StoreStatus }
  | { readonly id: number; readonly kind: 'wiped'; readonly status: StoreStatus }
  /** `handCount`: how many sample hands the views are now looking at. */
  | { readonly id: number; readonly kind: 'demo-entered'; readonly handCount: number }
  | { readonly id: number; readonly kind: 'demo-left' }
  /** The request failed as a whole; `message` is meant for the user. */
  | { readonly id: number; readonly kind: 'error'; readonly message: string }

/** A `WorkerRequest` before the client numbers it. */
export type WorkerCommand = WithoutId<WorkerRequest>

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
