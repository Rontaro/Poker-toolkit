import { decodeText, pokerStarsAdapter } from '@poker/adapter-pokerstars'
import type { Hand, LocalePack, SiteAdapter } from '@poker/core'
import type { QuarantineEntry } from '@poker/store'

/**
 * The pure half of reading a hand history file: bytes in, hands and
 * quarantined hands out. No file system, no store, nothing from Node.
 *
 * It lives apart from `ingest.ts` so the browser app can run exactly the same
 * steps inside its Web Worker -- encoding detection, site and language
 * detection, split, parse, quarantine -- without pulling in `node:fs` or
 * `chokidar`. It is reachable on its own as `@poker/ingest/parse`; importing
 * the package root would bring the watcher along.
 */

export const DEFAULT_ADAPTERS: readonly SiteAdapter<never>[] = [
  pokerStarsAdapter as unknown as SiteAdapter<never>,
]

export interface ParsedFile {
  readonly hands: readonly Hand[]
  readonly quarantine: readonly QuarantineEntry[]
  /** No adapter recognised the file, or none had its language. Nothing was
   * parsed, and it is not an error: it is a file that is not a hand history. */
  readonly unrecognised: boolean
}

/**
 * Decodes, detects, splits and parses one file. A hand that will not parse is
 * set aside with `sourcePath` attached rather than allowed to stop the rest:
 * one malformed hand must not block every hand written after it.
 */
export function parseHandHistory(
  bytes: Uint8Array,
  sourcePath: string,
  adapters: readonly SiteAdapter<never>[] = DEFAULT_ADAPTERS,
): ParsedFile {
  const text = decodeText(bytes).text

  const detected = adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(text) }))
    .filter((entry) => entry.detection.matched)
    .sort((a, b) => b.detection.confidence - a.detection.confidence)[0]

  if (detected === undefined) return { hands: [], quarantine: [], unrecognised: true }

  const locale = detected.adapter.locales.find(
    (candidate) => (candidate as LocalePack).language === detected.detection.language,
  )
  if (locale === undefined) return { hands: [], quarantine: [], unrecognised: true }

  const hands: Hand[] = []
  const quarantine: QuarantineEntry[] = []

  for (const raw of detected.adapter.split(text)) {
    const result = detected.adapter.parse(raw, locale)
    if (result.ok) hands.push(result.value)
    else quarantine.push({ raw: result.raw, sourcePath, issues: result.errors })
  }

  return { hands, quarantine, unrecognised: false }
}
