import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Database } from './driver.js'
import { applyMigrations, type MigrationEntry } from './migrate-core.js'

// `src` and `dist` are both one level directly under the package root, so
// this resolves to `packages/store/migrations` whether it runs from source
// (vitest) or from the compiled output (tsc build) without needing to know
// which.
const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const MIGRATION_FILE = /^(\d+)_.+\.sql$/

/**
 * Reads every migration in `migrationsDir` and applies the ones
 * `schema_migrations` doesn't already record, in version order, each inside
 * its own transaction. Never edit an applied migration file -- add a new
 * numbered one instead -- so this only ever needs to move forward.
 *
 * This is the Node-only half: the one file in this package allowed to touch
 * the filesystem. The shared logic that decides what's pending and applies
 * it lives in `migrate-core.ts`, which never imports `node:*` so it can also
 * run against a static import in a browser bundle.
 */
export function runMigrations(db: Database, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): void {
  const entries: MigrationEntry[] = readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILE.test(name))
    .flatMap((name) => {
      const match = MIGRATION_FILE.exec(name)
      if (match === null) return []
      return [{ version: Number(match[1]), name, sql: readFileSync(join(migrationsDir, name), 'utf-8') }]
    })
  applyMigrations(db, entries)
}
