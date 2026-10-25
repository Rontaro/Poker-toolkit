// Imported from `sql-database.js`, not `driver.js`, so this file's dependency
// graph never points -- even just by type -- at `driver.js`, which loads
// `node:sqlite` at module scope: wrong for a file meant to also run from a
// browser bundle fed by a static import.
import type { SqlDatabase as Database } from './sql-database.js'

export interface MigrationEntry {
  readonly version: number
  readonly name: string
  readonly sql: string
}

/**
 * Applies every migration in `migrations` that `schema_migrations` doesn't
 * already record, in ascending version order, each inside its own
 * transaction. Pure logic over data the caller already has in hand --
 * nothing here reads a filesystem, so this runs identically in Node (fed
 * from disk by `migrate.ts`) and in a browser (fed from a static import).
 */
export function applyMigrations(db: Database, migrations: readonly MigrationEntry[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT
  `)

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row['version'])),
  )

  const pending = migrations
    .slice()
    .sort((a, b) => a.version - b.version)
    .filter((migration) => !applied.has(migration.version))

  for (const migration of pending) {
    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        Date.now(),
      )
      db.exec('COMMIT')
    } catch (cause) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${migration.name} failed: ${(cause as Error).message}`, { cause })
    }
  }
}
