import { DatabaseSync, type Database } from './driver.js'

import { deriveSessionIds, sha256Hex, type Hand, type HandId, type SessionInput } from '@poker/core'

import { buildLimitOffset, buildWhere } from './filter-sql.js'
import { runMigrations } from './migrate.js'
import { hydrateHand, toChips, toHandRow } from './serialize.js'
import type {
  HandFilter,
  HandNote,
  HandStore,
  IngestedFileInfo,
  IngestedFileRecord,
  NoteSource,
  QuarantineEntry,
  QuarantinedHand,
  StatsResult,
} from './types.js'

const UPSERT_HAND_SQL = `
  INSERT INTO hands (
    id, site, hero, game_type, variant, table_size, stakes_bb, stakes_currency,
    played_at, played_at_local, hero_dealt_in, hero_net, data
  ) VALUES (
    @id, @site, @hero, @game_type, @variant, @table_size, @stakes_bb, @stakes_currency,
    @played_at, @played_at_local, @hero_dealt_in, @hero_net, @data
  )
  ON CONFLICT(id) DO UPDATE SET
    site = excluded.site,
    hero = excluded.hero,
    game_type = excluded.game_type,
    variant = excluded.variant,
    table_size = excluded.table_size,
    stakes_bb = excluded.stakes_bb,
    stakes_currency = excluded.stakes_currency,
    played_at = excluded.played_at,
    played_at_local = excluded.played_at_local,
    hero_dealt_in = excluded.hero_dealt_in,
    hero_net = excluded.hero_net,
    data = excluded.data
`
// session_id is intentionally absent from both the column list and the
// ON CONFLICT clause above: it is not something a caller ever supplies, it's
// recomputed from played_at ordering after the row lands (see
// #recomputeSessionsForHero), and leaving it out of the UPDATE means a
// re-upserted hand keeps its existing session id until that recompute runs.

/**
 * SQLite-backed `HandStore`, plus the quarantine / ingested-file / note
 * bookkeeping the rest of the toolkit needs. Those extra methods live here
 * rather than on `HandStore` because they are about *this* storage layer's
 * bookkeeping, not something a hypothetical second `HandStore` implementation
 * would need to agree on.
 */
export class SqliteHandStore implements HandStore {
  readonly #db: Database

  constructor(path: string) {
    this.#db = new DatabaseSync(path)
    runMigrations(this.#db)
  }

  async upsert(hands: readonly Hand[]): Promise<void> {
    if (hands.length === 0) return

    const insert = this.#db.prepare(UPSERT_HAND_SQL)
    const affectedHeroes = new Set<string>()

    this.#db.exec('BEGIN')
    try {
      for (const hand of hands) {
        insert.run(toHandRow(hand))
        if (hand.hero !== undefined) affectedHeroes.add(hand.hero)
      }
      for (const hero of affectedHeroes) this.#recomputeSessionsForHero(hero)
      this.#db.exec('COMMIT')
    } catch (cause) {
      this.#db.exec('ROLLBACK')
      throw cause
    }
  }

  async *query(filter: HandFilter): AsyncGenerator<Hand> {
    const where = buildWhere(filter)
    const limitOffset = buildLimitOffset(filter)
    const stmt = this.#db.prepare(
      `SELECT data FROM hands ${where.sql} ORDER BY played_at ASC, id ASC${limitOffset.sql}`,
    )
    for (const row of stmt.iterate(...where.params, ...limitOffset.params)) {
      yield hydrateHand(row['data'] as string)
    }
  }

  async stats(filter: HandFilter): Promise<StatsResult> {
    const where = buildWhere(filter)
    const row = this.#db
      .prepare(
        `
        SELECT
          COUNT(*) AS hand_count,
          COUNT(DISTINCT session_id) AS session_count,
          MIN(played_at) AS first_at,
          MAX(played_at) AS last_at,
          COALESCE(SUM(hero_net), 0) AS hero_net_chips,
          COALESCE(SUM(hero_dealt_in), 0) AS hero_dealt_in_count,
          COALESCE(SUM(
            CASE WHEN hero_net IS NOT NULL AND stakes_bb > 0
              THEN CAST(hero_net AS REAL) / stakes_bb
              ELSE 0
            END
          ), 0) AS hero_net_bb
        FROM hands ${where.sql}
        `,
      )
      .get(...where.params)

    if (row === undefined) throw new Error('stats: aggregate query returned no row')

    const heroHandsDealtIn = Number(row['hero_dealt_in_count'])
    const heroNetBb = Number(row['hero_net_bb'])
    const firstAt = row['first_at']
    const lastAt = row['last_at']

    return {
      handCount: Number(row['hand_count']),
      sessionCount: Number(row['session_count']),
      heroNetChips: toChips(Number(row['hero_net_chips'])),
      heroHandsDealtIn,
      heroNetBb,
      bb100: heroHandsDealtIn > 0 ? (heroNetBb / heroHandsDealtIn) * 100 : 0,
      ...(firstAt !== null && firstAt !== undefined ? { firstHandAt: new Date(Number(firstAt)) } : {}),
      ...(lastAt !== null && lastAt !== undefined ? { lastHandAt: new Date(Number(lastAt)) } : {}),
    }
  }

  close(): void {
    this.#db.close()
  }

  // -- Quarantine ------------------------------------------------------------

  async quarantine(entries: readonly QuarantineEntry[]): Promise<void> {
    if (entries.length === 0) return

    const insert = this.#db.prepare(`
      INSERT INTO quarantine (hash, raw, source_path, issues, created_at)
      VALUES (@hash, @raw, @source_path, @issues, @created_at)
      ON CONFLICT(hash) DO NOTHING
    `)

    this.#db.exec('BEGIN')
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
      this.#db.exec('COMMIT')
    } catch (cause) {
      this.#db.exec('ROLLBACK')
      throw cause
    }
  }

  async listQuarantined(): Promise<readonly QuarantinedHand[]> {
    const rows = this.#db
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

  async recordIngestedFile(info: IngestedFileRecord): Promise<void> {
    this.#db
      .prepare(
        `
        INSERT INTO ingested_files (path, size, mtime, content_hash, ingested_at)
        VALUES (@path, @size, @mtime, @content_hash, @ingested_at)
        ON CONFLICT(path) DO UPDATE SET
          size = excluded.size,
          mtime = excluded.mtime,
          content_hash = excluded.content_hash,
          ingested_at = excluded.ingested_at
        `,
      )
      .run({
        path: info.path,
        size: info.size,
        mtime: info.mtime.getTime(),
        content_hash: info.contentHash,
        ingested_at: Date.now(),
      })
  }

  async getIngestedFile(path: string): Promise<IngestedFileInfo | undefined> {
    const row = this.#db
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

  async insertNote(note: HandNote): Promise<void> {
    this.#db
      .prepare(
        `
        INSERT INTO hand_notes (hand_id, source, content, tags, created_at)
        VALUES (@hand_id, @source, @content, @tags, @created_at)
        `,
      )
      .run({
        hand_id: note.handId,
        source: note.source,
        content: note.content,
        tags: JSON.stringify(note.tags),
        created_at: note.createdAt.getTime(),
      })
  }

  async listNotesForHand(handId: HandId): Promise<readonly HandNote[]> {
    const rows = this.#db
      .prepare(
        'SELECT hand_id, source, content, tags, created_at FROM hand_notes WHERE hand_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(handId)
    return rows.map(rowToNote)
  }

  /** Substring match on note content, or exact match against one of a note's
   * tags -- "full-text-ish", not real FTS5: this toolkit's note volume never
   * justifies a virtual table and its own index maintenance. */
  async searchNotes(query: string): Promise<readonly HandNote[]> {
    const escaped = escapeLike(query)
    const rows = this.#db
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

  // -- Sessions --------------------------------------------------------------

  /** Recomputes every session id for `hero` from a full played_at-ordered
   * read. Hands can arrive out of order, so there is no cheaper correct
   * option than re-deriving the whole sequence and writing back only the ids
   * that actually changed. */
  #recomputeSessionsForHero(hero: string): void {
    const rows = this.#db.prepare('SELECT id, played_at, session_id FROM hands WHERE hero = ?').all(hero)

    const inputs: SessionInput[] = rows.map((row) => ({
      id: row['id'] as string,
      playedAt: Number(row['played_at']),
    }))
    const derived = deriveSessionIds(inputs, hero)

    const update = this.#db.prepare('UPDATE hands SET session_id = ? WHERE id = ?')
    for (const row of rows) {
      const id = row['id'] as string
      const currentSessionId = row['session_id'] as string | null
      const nextSessionId = derived.get(id)
      if (nextSessionId !== undefined && nextSessionId !== currentSessionId) {
        update.run(nextSessionId, id)
      }
    }
  }
}

// Duplicated verbatim in sql-store-extras.ts for BrowserHandStore -- keep
// both in sync if you change either.
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
