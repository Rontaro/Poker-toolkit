// Shared, driver-agnostic SQL for the quarantine / ingested-file / note
// bookkeeping that both `SqliteHandStore` and `BrowserHandStore` expose on
// top of `HandStore`. Pulled out as plain functions (not a mixin/class) that
// take `db` as their first argument, rather than duplicating this ~80 lines
// of identical SQL a second time -- `SqliteHandStore` is deliberately left
// alone (out of scope for the browser-store task, and no reason to risk a
// regression in code that already works) and keeps its own copies inline.
//
// Imported from `sql-database.js`, never `driver.js`: this file must stay
// usable from `browser-hand-store.ts`, which cannot pull in `node:sqlite`.
import { sha256Hex, type HandId } from '@poker/core'

import type { SqlDatabase as Database } from './sql-database.js'
import type {
  HandNote,
  IngestedFileInfo,
  IngestedFileRecord,
  NoteSource,
  QuarantineEntry,
  QuarantinedHand,
} from './types.js'

// -- Quarantine --------------------------------------------------------------

export function quarantine(db: Database, entries: readonly QuarantineEntry[]): void {
  if (entries.length === 0) return

  const insert = db.prepare(`
    INSERT INTO quarantine (hash, raw, source_path, issues, created_at)
    VALUES (@hash, @raw, @source_path, @issues, @created_at)
    ON CONFLICT(hash) DO NOTHING
  `)

  db.exec('BEGIN')
  try {
    for (const entry of entries) {
      insert.run({
        hash: sha256Hex(entry.raw),
        raw: entry.raw,
        source_path: entry.sourcePath,
        issues: JSON.stringify(entry.issues),
        created_at: Date.now(),
      })
    }
    db.exec('COMMIT')
  } catch (cause) {
    db.exec('ROLLBACK')
    throw cause
  }
}

export function listQuarantined(db: Database): readonly QuarantinedHand[] {
  const rows = db
    .prepare('SELECT hash, raw, source_path, issues, created_at FROM quarantine ORDER BY created_at ASC, id ASC')
    .all()

  return rows.map((row) => ({
    hash: row['hash'] as string,
    raw: row['raw'] as string,
    sourcePath: row['source_path'] as string,
    issues: JSON.parse(row['issues'] as string) as QuarantinedHand['issues'],
    createdAt: new Date(Number(row['created_at'])),
  }))
}

// -- Ingested files ----------------------------------------------------------

export function recordIngestedFile(db: Database, info: IngestedFileRecord): void {
  db.prepare(
    `
    INSERT INTO ingested_files (path, size, mtime, content_hash, ingested_at)
    VALUES (@path, @size, @mtime, @content_hash, @ingested_at)
    ON CONFLICT(path) DO UPDATE SET
      size = excluded.size,
      mtime = excluded.mtime,
      content_hash = excluded.content_hash,
      ingested_at = excluded.ingested_at
    `,
  ).run({
    path: info.path,
    size: info.size,
    mtime: info.mtime.getTime(),
    content_hash: info.contentHash,
    ingested_at: Date.now(),
  })
}

export function getIngestedFile(db: Database, path: string): IngestedFileInfo | undefined {
  const row = db
    .prepare('SELECT path, size, mtime, content_hash, ingested_at FROM ingested_files WHERE path = ?')
    .get(path)
  if (row === undefined) return undefined

  return {
    path: row['path'] as string,
    size: Number(row['size']),
    mtime: new Date(Number(row['mtime'])),
    contentHash: row['content_hash'] as string,
    ingestedAt: new Date(Number(row['ingested_at'])),
  }
}

// -- Notes ---------------------------------------------------------------

export function insertNote(db: Database, note: HandNote): void {
  db.prepare(
    `
    INSERT INTO hand_notes (hand_id, source, content, tags, created_at)
    VALUES (@hand_id, @source, @content, @tags, @created_at)
    `,
  ).run({
    hand_id: note.handId,
    source: note.source,
    content: note.content,
    tags: JSON.stringify(note.tags),
    created_at: note.createdAt.getTime(),
  })
}

export function listNotesForHand(db: Database, handId: HandId): readonly HandNote[] {
  const rows = db
    .prepare(
      'SELECT hand_id, source, content, tags, created_at FROM hand_notes WHERE hand_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(handId)
  return rows.map(rowToNote)
}

/** Substring match on note content, or exact match against one of a note's
 * tags -- "full-text-ish", not real FTS5: this toolkit's note volume never
 * justifies a virtual table and its own index maintenance. */
export function searchNotes(db: Database, query: string): readonly HandNote[] {
  const escaped = escapeLike(query)
  const rows = db
    .prepare(
      `
      SELECT hand_id, source, content, tags, created_at FROM hand_notes
      WHERE content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(`%${escaped}%`, `%"${escaped}"%`)
  return rows.map(rowToNote)
}

function rowToNote(row: Record<string, unknown>): HandNote {
  return {
    handId: row['hand_id'] as HandId,
    source: row['source'] as NoteSource,
    content: row['content'] as string,
    tags: JSON.parse(row['tags'] as string) as readonly string[],
    createdAt: new Date(Number(row['created_at'])),
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}
