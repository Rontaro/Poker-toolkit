import { readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { sha256Hex, type SiteAdapter } from '@poker/core'
import type { SqliteHandStore } from '@poker/store'

import { DEFAULT_ADAPTERS, parseHandHistory } from './parse-file.js'

/**
 * Reading hand history files into the store.
 *
 * Two rules shape all of it. A file that has not changed is not read again, so
 * running this over a folder that grows by one file a night costs one file's
 * worth of work. And a hand that will not parse is set aside rather than
 * allowed to stop the import: the alternative is one malformed hand blocking
 * every hand written after it.
 */

export interface IngestOptions {
  readonly store: SqliteHandStore
  /** Defaults to every registered adapter's own default locations. */
  readonly paths?: readonly string[]
  readonly adapters?: readonly SiteAdapter<never>[]
  /** Re-read files whose size, mtime and hash are unchanged. */
  readonly force?: boolean
  readonly onProgress?: (event: ProgressEvent) => void
}

export type ProgressEvent =
  | { readonly kind: 'file-start'; readonly path: string }
  | { readonly kind: 'file-skipped'; readonly path: string; readonly reason: string }
  | {
      readonly kind: 'file-done'
      readonly path: string
      readonly parsed: number
      readonly quarantined: number
    }

export interface IngestResult {
  readonly filesSeen: number
  readonly filesRead: number
  readonly filesSkipped: number
  readonly handsParsed: number
  readonly handsQuarantined: number
  /** Files that could not be read or recognised at all. */
  readonly filesUnrecognised: readonly string[]
}

export { DEFAULT_ADAPTERS }

const HAND_HISTORY_FILE = /\.txt$/i

/** One pass over the configured folders. */
export async function ingest(options: IngestOptions): Promise<IngestResult> {
  const adapters = options.adapters ?? DEFAULT_ADAPTERS
  const roots = options.paths ?? adapters.flatMap((adapter) => adapter.defaultPaths(process.platform))

  const files: string[] = []
  for (const root of roots) files.push(...(await listFiles(root)))

  let filesRead = 0
  let filesSkipped = 0
  let handsParsed = 0
  let handsQuarantined = 0
  const unrecognised: string[] = []

  for (const path of files) {
    options.onProgress?.({ kind: 'file-start', path })

    const outcome = await ingestFile(path, adapters, options)
    if (outcome.kind === 'skipped') {
      filesSkipped += 1
      options.onProgress?.({ kind: 'file-skipped', path, reason: outcome.reason })
      continue
    }

    filesRead += 1
    handsParsed += outcome.parsed
    handsQuarantined += outcome.quarantined
    if (outcome.unrecognised) unrecognised.push(path)

    options.onProgress?.({
      kind: 'file-done',
      path,
      parsed: outcome.parsed,
      quarantined: outcome.quarantined,
    })
  }

  return {
    filesSeen: files.length,
    filesRead,
    filesSkipped,
    handsParsed,
    handsQuarantined,
    filesUnrecognised: unrecognised,
  }
}

type FileOutcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'read'; parsed: number; quarantined: number; unrecognised: boolean }

/** Reads and stores one file. Exported so a watcher can call it directly. */
export async function ingestFile(
  path: string,
  adapters: readonly SiteAdapter<never>[],
  options: IngestOptions,
): Promise<FileOutcome> {
  let bytes: Buffer
  let size: number
  let mtime: Date
  try {
    const stats = statSync(path)
    size = stats.size
    mtime = stats.mtime
    bytes = readFileSync(path)
  } catch (cause) {
    return { kind: 'skipped', reason: `unreadable: ${(cause as Error).message}` }
  }

  const contentHash = sha256Hex(bytes.toString('base64'))

  if (options.force !== true) {
    const known = await options.store.getIngestedFile(path)
    if (
      known !== undefined &&
      known.size === size &&
      known.mtime.getTime() === mtime.getTime() &&
      known.contentHash === contentHash
    ) {
      return { kind: 'skipped', reason: 'unchanged since the last import' }
    }
  }

  const { hands, quarantine, unrecognised } = parseHandHistory(bytes, path, adapters)

  if (unrecognised) {
    // Recorded anyway: an unrecognised file that has not changed should not be
    // re-read on every run either.
    await options.store.recordIngestedFile({ path, size, mtime, contentHash })
    return { kind: 'read', parsed: 0, quarantined: 0, unrecognised: true }
  }

  if (hands.length > 0) await options.store.upsert(hands)
  if (quarantine.length > 0) await options.store.quarantine(quarantine)
  await options.store.recordIngestedFile({ path, size, mtime, contentHash })

  return { kind: 'read', parsed: hands.length, quarantined: quarantine.length, unrecognised: false }
}

/** Every hand history file under a folder, recursively. Missing folders are
 * not an error: a player who has never opened the tournament client simply has
 * no tournament folder. */
export async function listFiles(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) found.push(...(await listFiles(path)))
    else if (HAND_HISTORY_FILE.test(entry.name)) found.push(path)
  }
  return found.sort()
}
