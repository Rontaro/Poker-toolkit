import { describe, expect, it } from 'vitest'

import { DatabaseSync } from '../src/driver.js'
import { applyMigrations, type MigrationEntry } from '../src/migrate-core.js'

const open = (): DatabaseSync => new DatabaseSync(':memory:')

describe('applyMigrations', () => {
  it('applies a migration passed as a literal string', () => {
    const db = open()
    const migration: MigrationEntry = {
      version: 1,
      name: '0001_foo.sql',
      sql: 'CREATE TABLE foo (id INTEGER PRIMARY KEY) STRICT',
    }

    applyMigrations(db, [migration])

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get('foo')
    expect(row).toMatchObject({ name: 'foo' })
    db.close()
  })

  it('records the applied migration in schema_migrations with the right version/name', () => {
    const db = open()
    const migration: MigrationEntry = {
      version: 1,
      name: '0001_foo.sql',
      sql: 'CREATE TABLE foo (id INTEGER PRIMARY KEY) STRICT',
    }

    applyMigrations(db, [migration])

    const row = db.prepare('SELECT version, name FROM schema_migrations WHERE version = ?').get(1)
    expect(row).toMatchObject({ version: 1, name: '0001_foo.sql' })
    db.close()
  })

  it('does not re-apply a migration already recorded', () => {
    const db = open()
    // No `IF NOT EXISTS`: re-running this would throw, so a passing second
    // call is proof the migration was skipped, not silently idempotent.
    const migration: MigrationEntry = {
      version: 1,
      name: '0001_foo.sql',
      sql: 'CREATE TABLE foo (id INTEGER PRIMARY KEY) STRICT',
    }

    applyMigrations(db, [migration])
    expect(() => applyMigrations(db, [migration])).not.toThrow()

    const count = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get() as { n: number }
    expect(count.n).toBe(1)
    db.close()
  })

  it('applies out-of-order migrations in ascending version order', () => {
    const db = open()
    const second: MigrationEntry = {
      version: 2,
      name: '0002_add_bar.sql',
      sql: 'ALTER TABLE foo ADD COLUMN bar TEXT',
    }
    const first: MigrationEntry = {
      version: 1,
      name: '0001_foo.sql',
      sql: 'CREATE TABLE foo (id INTEGER PRIMARY KEY) STRICT',
    }

    // Passed version 2 before version 1: if applied in array order this
    // throws (ALTER TABLE on a table that doesn't exist yet).
    applyMigrations(db, [second, first])

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get('foo')
    expect(row).toMatchObject({ name: 'foo' })

    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => (r as { version: number }).version)
    expect(versions).toEqual([1, 2])
    db.close()
  })
})
