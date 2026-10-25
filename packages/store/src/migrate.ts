import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Database } from './driver.js'

// `src` and `dist` are both one level directly under the package root, so
// this resolves to `packages/store/migrations` whether it runs from source
// (vitest) or from the compiled output (tsc build) without needing to know
// which.
const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const MIGRATION_FILE = /^(\d+)_.+\.sql$/

/**
 * Applies every migration in `migrationsDir` that `schema_migrations` doesn't
 * already record, in filename order, each inside its own transaction. Never
 * edit an applied migration file -- add a new numbered one instead -- so this
 * only ever needs to move forward.
 */
export function runMigrations(db: Database, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): void {
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

  const pending = readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .filter((name) => {
      const match = MIGRATION_FILE.exec(name)
      return match !== null && !applied.has(Number(match[1]))
    })

  for (const file of pending) {
    const match = MIGRATION_FILE.exec(file)
    const version = Number(match?.[1] ?? NaN)
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')

    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        version,
        file,
        Date.now(),
      )
      db.exec('COMMIT')
    } catch (cause) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${(cause as Error).message}`, { cause })
    }
  }
}
