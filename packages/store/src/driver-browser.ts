import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type {
  BindableValue,
  Database as WasmDatabase,
  PreparedStatement as WasmStatement,
  Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'

import type { SqlDatabase, SqlStatement } from './sql-database.js'

/**
 * `sqlite3InitModule()` compiles/instantiates the WASM module and is meant to
 * be called once per process; every `openBrowserDatabase()` call reuses the
 * same initialized module to open its own, independent `oo1.DB` connection.
 *
 * This driver only opens **in-memory** databases (`':memory:'`, the
 * default) -- OPFS persistence needs a dedicated Worker (per the library's
 * own docs, OPFS is only reachable from a Worker, and Node itself only
 * supports in-memory use), which is deliberately a separate, later task.
 */
let sqlite3Promise: Promise<Sqlite3Static> | undefined

function loadSqlite3(): Promise<Sqlite3Static> {
  sqlite3Promise ??= sqlite3InitModule()
  return sqlite3Promise
}

/**
 * Opens an in-memory sqlite-wasm database and wraps it as a `SqlDatabase`.
 * No `flags` are passed: the default (`'c'`, create-if-missing) is what's
 * wanted, and the README's `'ct'` example's `t` turns on SQL tracing to
 * `console.log()` for every statement, which is noise this driver has no
 * reason to opt into.
 */
export async function openBrowserDatabase(filename = ':memory:'): Promise<SqlDatabase> {
  const sqlite3 = await loadSqlite3()
  const db = new sqlite3.oo1.DB(filename)
  return wrapDatabase(db)
}

function wrapDatabase(db: WasmDatabase): SqlDatabase {
  return {
    exec(sql: string): void {
      db.exec(sql)
    },
    prepare(sql: string): SqlStatement {
      return wrapStatement(db.prepare(sql))
    },
    close(): void {
      db.close()
    },
  }
}

/**
 * The bind-parameter prefixes SQLite recognises in front of a named
 * parameter. `sqlite3_bind_parameter_index()` -- which is what
 * `PreparedStatement#getParamIndex`/`#bind` resolve names through -- wants
 * the prefix character as part of the name; this package's SQL exclusively
 * uses `@name`, so that's tried first, but `:name`/`$name` are also valid
 * SQLite syntax and cost nothing to support.
 */
const PARAM_PREFIXES = ['@', ':', '$'] as const

/** A single bare (unprefixed) object -- e.g. `insert.run(toHandRow(hand))`
 * -- means "bind by @name"; anything else (no args, a single scalar/array/
 * blob, or several positional args) means "bind by ? position", matching
 * the two calling conventions `sqlite-store.ts` already mixes. */
function isNamedParamsObject(args: readonly unknown[]): args is readonly [Record<string, unknown>] {
  if (args.length !== 1) return false
  const [value] = args
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof ArrayBuffer)
  )
}

function resolveParamName(stmt: WasmStatement, key: string): string {
  for (const prefix of PARAM_PREFIXES) {
    const candidate = `${prefix}${key}`
    const index = stmt.getParamIndex(candidate)
    if (typeof index === 'number' && index > 0) return candidate
  }
  // No bindable parameter matched any prefix -- fall back to this package's
  // own `@name` convention and let sqlite-wasm's own error surface if that's
  // still wrong, rather than silently swallowing a typo'd column name.
  return `@${key}`
}

/** Resets the statement (dropping any previous bindings) and binds `args`
 * using whichever of the two calling conventions `args` matches. Called at
 * the start of every `run`/`get`/`all`/`iterate` so each is safe to call
 * again on the same prepared statement *after* the previous call/iteration
 * has fully finished -- the pattern `sqlite-store.ts` relies on (e.g.
 * `insert` reused across an upsert loop, or one `all()` followed by one
 * `iterate()` on the same statement, see driver-browser.test.ts). This does
 * NOT make two interleaved/concurrent iterators over the same statement
 * safe: SQLite statements have a single cursor, so starting a second
 * `iterate()` before the first is drained resets that one shared cursor out
 * from under it -- a limitation shared with node:sqlite/better-sqlite3, not
 * something this reset-on-entry dispatch fixes, and not a pattern any
 * current caller in `sqlite-store.ts` uses (every call there drains its
 * statement before moving on). */
function bindArgs(stmt: WasmStatement, args: readonly unknown[]): void {
  stmt.reset(true)
  if (args.length === 0) return

  if (isNamedParamsObject(args)) {
    const [params] = args
    const resolved: Record<string, BindableValue> = {}
    for (const [key, value] of Object.entries(params)) {
      resolved[resolveParamName(stmt, key)] = value as BindableValue
    }
    stmt.bind(resolved)
    return
  }

  stmt.bind(args as BindableValue[])
}

function wrapStatement(stmt: WasmStatement): SqlStatement {
  return {
    run(...args: unknown[]): unknown {
      bindArgs(stmt, args)
      stmt.step()
      return undefined
    },

    get(...args: unknown[]): Record<string, unknown> | undefined {
      bindArgs(stmt, args)
      if (!stmt.step()) return undefined
      return stmt.get({})
    },

    all(...args: unknown[]): Record<string, unknown>[] {
      bindArgs(stmt, args)
      const rows: Record<string, unknown>[] = []
      while (stmt.step()) rows.push(stmt.get({}))
      return rows
    },

    iterate(...args: unknown[]): Iterable<Record<string, unknown>> {
      bindArgs(stmt, args)
      return {
        [Symbol.iterator](): Iterator<Record<string, unknown>> {
          return {
            next(): IteratorResult<Record<string, unknown>> {
              if (stmt.step()) return { value: stmt.get({}), done: false }
              return { value: undefined, done: true }
            },
          }
        },
      }
    },
  }
}
