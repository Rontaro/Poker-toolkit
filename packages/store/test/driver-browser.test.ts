import { beforeEach, describe, expect, it } from 'vitest'

import { openBrowserDatabase } from '../src/driver-browser.js'
import type { SqlDatabase } from '../src/sql-database.js'

// All in-memory: no OPFS, no Worker. These run under plain Vitest/Node, the
// same way `migrate-core.test.ts` exercises the node:sqlite driver -- wiring
// this into an actual browser Worker/OPFS is a later task.
describe('openBrowserDatabase', () => {
  let db: SqlDatabase

  beforeEach(async () => {
    db = await openBrowserDatabase()
  })

  it('exec() creates a table', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get('widgets')
    expect(row).toMatchObject({ name: 'widgets' })
  })

  it('prepare().run(paramsObject) binds named @placeholders', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER) STRICT')

    db.prepare('INSERT INTO widgets (id, name, qty) VALUES (@id, @name, @qty)').run({
      id: 1,
      name: 'sprocket',
      qty: 7,
    })

    const row = db.prepare('SELECT name, qty FROM widgets WHERE id = 1').get()
    expect(row).toMatchObject({ name: 'sprocket', qty: 7 })
  })

  it('prepare().run(...positionalArgs) binds ? placeholders', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER) STRICT')

    db.prepare('INSERT INTO widgets (id, name, qty) VALUES (?, ?, ?)').run(1, 'sprocket', 7)

    const row = db.prepare('SELECT name, qty FROM widgets WHERE id = ?').get(1)
    expect(row).toMatchObject({ name: 'sprocket', qty: 7 })
  })

  it('prepare().get(...) returns the matching row, positionally bound', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')
    db.prepare('INSERT INTO widgets (id, name) VALUES (?, ?)').run(1, 'sprocket')

    const row = db.prepare('SELECT id, name FROM widgets WHERE id = ?').get(1)
    expect(row).toMatchObject({ id: 1, name: 'sprocket' })
  })

  it('prepare().get(...) returns the matching row, bound by @name', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')
    db.prepare('INSERT INTO widgets (id, name) VALUES (@id, @name)').run({ id: 1, name: 'sprocket' })

    const row = db.prepare('SELECT id, name FROM widgets WHERE id = @id').get({ id: 1 })
    expect(row).toMatchObject({ id: 1, name: 'sprocket' })
  })

  it('prepare().get(...) returns undefined when there is no match', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')

    const row = db.prepare('SELECT id, name FROM widgets WHERE id = ?').get(999)
    expect(row).toBeUndefined()
  })

  it('prepare().all(...) returns every matching row', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER) STRICT')
    const insert = db.prepare('INSERT INTO widgets (id, name, qty) VALUES (@id, @name, @qty)')
    insert.run({ id: 1, name: 'sprocket', qty: 7 })
    insert.run({ id: 2, name: 'widget', qty: 3 })
    insert.run({ id: 3, name: 'sprocket', qty: 2 })

    const rows = db
      .prepare('SELECT id, name, qty FROM widgets WHERE name = ? ORDER BY id ASC')
      .all('sprocket')

    expect(rows).toEqual([
      { id: 1, name: 'sprocket', qty: 7 },
      { id: 3, name: 'sprocket', qty: 2 },
    ])
  })

  it('prepare().iterate(...) yields the same rows as .all(), one at a time', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')
    const insert = db.prepare('INSERT INTO widgets (id, name) VALUES (@id, @name)')
    insert.run({ id: 1, name: 'a' })
    insert.run({ id: 2, name: 'b' })
    insert.run({ id: 3, name: 'c' })

    const expected = db.prepare('SELECT id, name FROM widgets ORDER BY id ASC').all()

    const collected: Record<string, unknown>[] = []
    for (const row of db.prepare('SELECT id, name FROM widgets ORDER BY id ASC').iterate()) {
      collected.push(row)
    }

    expect(collected).toEqual(expected)
    expect(collected).toHaveLength(3)
  })

  it('all() then iterate() on the SAME prepared statement both return correct, independent rows', () => {
    db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT) STRICT')
    const insert = db.prepare('INSERT INTO widgets (id, name) VALUES (@id, @name)')
    insert.run({ id: 1, name: 'a' })
    insert.run({ id: 2, name: 'b' })
    insert.run({ id: 3, name: 'c' })

    // One `prepare()` call, reused for both a full `.all()` drain and a
    // subsequent full `.iterate()` drain -- the actual scenario `bindArgs`'s
    // reset-before-bind is meant to make safe, which the two-`prepare()`
    // comparison above doesn't exercise.
    const stmt = db.prepare('SELECT id, name FROM widgets ORDER BY id ASC')

    const fromAll = stmt.all()
    expect(fromAll).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ])

    const fromIterate: Record<string, unknown>[] = []
    for (const row of stmt.iterate()) fromIterate.push(row)
    expect(fromIterate).toEqual(fromAll)
  })

  it('close() does not throw', () => {
    expect(() => db.close()).not.toThrow()
  })
})
