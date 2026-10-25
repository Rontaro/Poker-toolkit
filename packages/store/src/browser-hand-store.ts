import { deriveSessionIds, type Hand, type HandId, type SessionInput } from '@poker/core'

import { openBrowserDatabase } from './driver-browser.js'
import { buildLimitOffset, buildWhere } from './filter-sql.js'
import { applyMigrations, type MigrationEntry } from './migrate-core.js'
import { hydrateHand, toChips, toHandRow } from './serialize.js'
import type { SqlDatabase } from './sql-database.js'
import {
  getIngestedFile,
  insertNote,
  listNotesForHand,
  listQuarantined,
  quarantine,
  recordIngestedFile,
  searchNotes,
} from './sql-store-extras.js'
import type {
  HandFilter,
  HandNote,
  HandStore,
  IngestedFileInfo,
  IngestedFileRecord,
  QuarantineEntry,
  QuarantinedHand,
  StatsResult,
} from './types.js'

// `?raw` is a Vite/Vitest-only import suffix (see raw-sql.d.ts for the type
// shim it needs, and tsconfig.json for why this file is excluded from the
// Node `tsc` build): it inlines the migration's SQL text at build/test time
// so this file never touches `node:fs`, unlike `migrate.ts`.
import migration0001 from '../migrations/0001_initial.sql?raw'

const MIGRATIONS: readonly MigrationEntry[] = [{ version: 1, name: '0001_initial.sql', sql: migration0001 }]

// Identical to `UPSERT_HAND_SQL` in sqlite-store.ts -- see that file's
// comment for why `session_id` is absent from both the column list and the
// ON CONFLICT clause.
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

/**
 * sqlite-wasm counterpart to `SqliteHandStore`, same `HandStore` contract and
 * the same SQL throughout. The one structural difference is how it comes
 * into being: `openBrowserDatabase()` initialises a WASM module, which is
 * asynchronous, so unlike `SqliteHandStore`'s synchronous constructor this
 * class has a private constructor and an async `create()` factory.
 *
 * In-memory only for now (whatever `openBrowserDatabase()`'s default gives) --
 * OPFS persistence needs a dedicated Worker and is a later task.
 */
export class BrowserHandStore implements HandStore {
  readonly #db: SqlDatabase

  private constructor(db: SqlDatabase) {
    this.#db = db
  }

  static async create(filename?: string): Promise<BrowserHandStore> {
    const db = await openBrowserDatabase(filename)
    // A failed migration must not leave an open, unreachable WASM connection
    // behind -- there is no process exit to reclaim it the way there would
    // be in Node, so the tab would carry the leaked heap for its lifetime.
    try {
      applyMigrations(db, MIGRATIONS)
    } catch (cause) {
      db.close()
      throw cause
    }
    return new BrowserHandStore(db)
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
    quarantine(this.#db, entries)
  }

  async listQuarantined(): Promise<readonly QuarantinedHand[]> {
    return listQuarantined(this.#db)
  }

  // -- Ingested files ----------------------------------------------------------

  async recordIngestedFile(info: IngestedFileRecord): Promise<void> {
    recordIngestedFile(this.#db, info)
  }

  async getIngestedFile(path: string): Promise<IngestedFileInfo | undefined> {
    return getIngestedFile(this.#db, path)
  }

  // -- Notes ---------------------------------------------------------------

  async insertNote(note: HandNote): Promise<void> {
    insertNote(this.#db, note)
  }

  async listNotesForHand(handId: HandId): Promise<readonly HandNote[]> {
    return listNotesForHand(this.#db, handId)
  }

  async searchNotes(query: string): Promise<readonly HandNote[]> {
    return searchNotes(this.#db, query)
  }

  // -- Sessions --------------------------------------------------------------

  /** Recomputes every session id for `hero` from a full played_at-ordered
   * read. Hands can arrive out of order, so there is no cheaper correct
   * option than re-deriving the whole sequence and writing back only the ids
   * that actually changed. Identical to `SqliteHandStore`'s private method
   * of the same name. */
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
