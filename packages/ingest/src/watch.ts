import { watch as chokidarWatch, type FSWatcher } from 'chokidar'

import type { SiteAdapter } from '@poker/core'

import { DEFAULT_ADAPTERS, ingest, ingestFile, type IngestOptions } from './ingest.js'

/**
 * Keeps the store in step with the folders the client writes to.
 *
 * The client appends to a file for the whole time a table is open, so the same
 * file changes many times a session. Each change re-reads that one file and
 * upserts what it finds: hands already stored keep their ids and are written
 * over with identical content, and only the new ones are new. That is why
 * ingestion had to be idempotent before this could exist.
 */

export interface WatchOptions extends IngestOptions {
  /** Wait for a file to stop changing before reading it. */
  readonly settleMs?: number
  readonly onError?: (error: Error) => void
}

export interface Watcher {
  /** Resolves once the initial scan has finished and watching has begun. */
  readonly ready: Promise<void>
  close(): Promise<void>
}

export function watch(options: WatchOptions): Watcher {
  const adapters: readonly SiteAdapter<never>[] = options.adapters ?? DEFAULT_ADAPTERS
  const roots =
    options.paths ?? adapters.flatMap((adapter) => adapter.defaultPaths(process.platform))
  const settleMs = options.settleMs ?? 500

  let watcher: FSWatcher | undefined
  const pending = new Set<string>()
  let draining = false

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (pending.size > 0) {
        const [path] = pending
        if (path === undefined) break
        pending.delete(path)
        try {
          const outcome = await ingestFile(path, adapters, options)
          if (outcome.kind === 'read') {
            options.onProgress?.({
              kind: 'file-done',
              path,
              parsed: outcome.parsed,
              quarantined: outcome.quarantined,
            })
          }
        } catch (cause) {
          options.onError?.(cause as Error)
        }
      }
    } finally {
      draining = false
    }
  }

  const ready = (async () => {
    // One full pass first, so a watcher started after a session still catches
    // up rather than only seeing what happens next.
    await ingest(options)

    watcher = chokidarWatch([...roots], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: settleMs, pollInterval: 100 },
    })

    watcher.on('add', (path: string) => {
      pending.add(path)
      void drain()
    })
    watcher.on('change', (path: string) => {
      pending.add(path)
      void drain()
    })
    watcher.on('error', (error: unknown) => options.onError?.(error as Error))

    await new Promise<void>((resolve) => {
      watcher?.on('ready', () => resolve())
    })
  })()

  return {
    ready,
    async close(): Promise<void> {
      await ready.catch(() => undefined)
      await watcher?.close()
    },
  }
}
