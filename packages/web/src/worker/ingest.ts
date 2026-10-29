import type { Hand, HandId } from '@poker/core'
import { parseHandHistory } from '@poker/ingest/parse'
import type { BrowserHandStore } from '@poker/store/browser'

import type { IngestProgress, IngestSummary, UploadedFile } from './protocol.js'

/**
 * The browser's import: the CLI's pipeline (`@poker/ingest`'s
 * `parseHandHistory`, the same function `ingestFile` calls) over files the
 * user handed in, instead of over folders on disk.
 *
 * Two things differ from the CLI, both because a browser upload is not a
 * folder the tool owns. Nothing is skipped as "unchanged since the last
 * import": there is no path or mtime worth trusting, re-uploading is a
 * deliberate act, and hand ids are content hashes, so storing the same hand
 * twice is a no-op anyway. And for the same reason nothing is recorded in
 * `ingested_files`, which only ever served that skip.
 */

/** Hands written per transaction. Small enough for the bar to move on a big
 * file, large enough that the per-call session recompute stays cheap. */
const CHUNK = 1000

/** Ids per `IN (...)` when asking which hands are already stored: well under
 * SQLite's bound-parameter limit. */
const ID_BATCH = 500

/** How many of `ids` the store already holds. */
async function countStored(store: BrowserHandStore, ids: readonly HandId[]): Promise<number> {
  let count = 0
  for (let start = 0; start < ids.length; start += ID_BATCH) {
    const { handCount } = await store.stats({ handIds: ids.slice(start, start + ID_BATCH) })
    count += handCount
  }
  return count
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function ingestFiles(
  store: BrowserHandStore,
  files: readonly UploadedFile[],
  onProgress: (progress: IngestProgress) => void,
): Promise<IngestSummary> {
  const bytesTotal = files.reduce((sum, file) => sum + file.bytes.byteLength, 0)
  let bytesBefore = 0
  let handsDone = 0
  let handsImported = 0
  let handsAlreadyPresent = 0
  let handsQuarantined = 0
  const unrecognisedFiles: string[] = []
  const errors: { file: string; message: string }[] = []

  const report = (filesDone: number, bytesDone: number, currentFile?: string): void => {
    onProgress({
      filesTotal: files.length,
      filesDone,
      ...(currentFile === undefined ? {} : { currentFile }),
      handsDone,
      bytesDone: Math.round(bytesDone),
      bytesTotal,
    })
  }

  for (const [index, file] of files.entries()) {
    const size = file.bytes.byteLength
    report(index, bytesBefore, file.name)

    try {
      const parsed = parseHandHistory(new Uint8Array(file.bytes), file.name)
      if (parsed.unrecognised) {
        unrecognisedFiles.push(file.name)
      } else {
        // The same hand twice in one file counts once. Across files, the
        // second copy is simply "already present".
        const unique = [...new Map(parsed.hands.map((hand) => [hand.id, hand] as const)).values()]
        const total = unique.length + parsed.quarantine.length

        if (parsed.quarantine.length > 0) {
          await store.quarantine(parsed.quarantine)
          handsQuarantined += parsed.quarantine.length
          handsDone += parsed.quarantine.length
        }

        for (let start = 0; start < unique.length; start += CHUNK) {
          const chunk: Hand[] = unique.slice(start, start + CHUNK)
          const already = await countStored(store, chunk.map((hand) => hand.id))
          await store.upsert(chunk)
          handsAlreadyPresent += already
          handsImported += chunk.length - already
          handsDone += chunk.length

          const doneInFile = parsed.quarantine.length + start + chunk.length
          report(index, bytesBefore + (total === 0 ? 0 : (size * doneInFile) / total), file.name)
        }
      }
    } catch (cause) {
      // One broken file must not cost the others.
      errors.push({ file: file.name, message: message(cause) })
    }

    bytesBefore += size
  }

  report(files.length, bytesTotal)

  return {
    files: files.length,
    handsImported,
    handsAlreadyPresent,
    handsQuarantined,
    unrecognisedFiles,
    errors,
  }
}
