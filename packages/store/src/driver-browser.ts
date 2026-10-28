import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type {
  BindableValue,
  Database as WasmDatabase,
  PreparedStatement as WasmStatement,
  SAHPoolUtil,
  Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'

import type { SqlDatabase, SqlStatement } from './sql-database.js'

/**
 * `sqlite3InitModule()` compiles/instantiates the WASM module and is meant to
 * be called once per process; every `openBrowserDatabase()` call reuses the
 * same initialized module to open its own, independent `oo1.DB` connection.
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
 * reason to opt into. For a database that survives a reload, see
 * `openPersistentBrowserDatabase()`.
 */
export async function openBrowserDatabase(filename = ':memory:'): Promise<SqlDatabase> {
  const sqlite3 = await loadSqlite3()
  const db = new sqlite3.oo1.DB(filename)
  return wrapDatabase(db)
}

// -- Persistence (OPFS) --------------------------------------------------------

/**
 * Persistence uses the "opfs-sahpool" VFS, not the "opfs" one behind
 * `oo1.OpfsDb`. The library's own docs put the line between them: "opfs"
 * proxies OPFS's async API through `SharedArrayBuffer` + `Atomics`, which
 * exist only when the site is served with COOP/COEP headers, and its installer
 * refuses to run without them; the SAH pool instead drives the synchronous
 * access handles directly from the Worker it runs in, and its installer checks
 * only for the OPFS APIs. That keeps COEP `require-corp` -- which breaks any
 * cross-origin resource that does not opt in -- out of the deploy. The price
 * is one connection per pool at a time (a second tab cannot open it while the
 * first holds the handles), which is exactly the one-Worker shape this is for.
 *
 * Only reachable from a dedicated Worker: OPFS sync access handles do not
 * exist on the main thread, and the Node build of the library has no
 * `installOpfsSAHPoolVfs` at all.
 */
let sahPoolPromise: Promise<SAHPoolUtil | undefined> | undefined

/** Installs the SAH pool VFS once per process; resolves to `undefined`
 * (never rejects) when it cannot be installed here, so callers can fall back
 * rather than fail. A failure is cached like a success -- the library caches
 * a failed install per VFS name too, and retrying it needs a reload anyway. */
function loadSahPool(): Promise<SAHPoolUtil | undefined> {
  sahPoolPromise ??= (async () => {
    try {
      const sqlite3 = await loadSqlite3()
      // Typed as always present, but the Node build does not define it.
      if (typeof sqlite3.installOpfsSAHPoolVfs !== 'function') return undefined
      return await sqlite3.installOpfsSAHPoolVfs({
        // Without this, a failed initialisation calls removeVfs(), which
        // deletes the pool's directory -- i.e. every stored hand -- just
        // because, say, another tab was holding the access handles at the
        // time. A failure here must cost persistence for this session, never
        // the data.
        preserveOnInitFailure: true,
      })
    } catch {
      return undefined
    }
  })()
  return sahPoolPromise
}

export interface PersistentDatabase {
  readonly db: SqlDatabase
  /** false when OPFS was not available here (e.g. Node, an old browser, a
   * private window) and the database fell back to memory. */
  readonly persistent: boolean
}

/**
 * Opens `filename` on OPFS through the SAH pool VFS. The VFS requires an
 * absolute path (leading `/`). Never throws for lack of OPFS: if the VFS
 * cannot be installed, or the file cannot be opened on it, the database falls
 * back to memory and `persistent` is false, so the app keeps working and can
 * tell the user their hands will not survive a reload.
 */
export async function openPersistentBrowserDatabase(filename: string): Promise<PersistentDatabase> {
  const pool = await loadSahPool()
  if (pool !== undefined) {
    try {
      return { db: wrapDatabase(new pool.OpfsSAHPoolDb(filename)), persistent: true }
    } catch {
      // Fall through to memory: e.g. the pool has no free slot left.
    }
  }
  return { db: await openBrowserDatabase(':memory:'), persistent: false }
}

/**
 * Deletes every file stored in the persistent VFS -- the database and any
 * journal left behind -- via `SAHPoolUtil#wipeFiles()`, which truncates each
 * pooled file to its header and drops its name. Chosen over `removeVfs()`,
 * which unregisters the VFS until the page is reloaded (so the app could not
 * open a fresh, empty database afterwards), and over `unlink(filename)`, which
 * would leave any other file in the pool behind.
 *
 * The caller must close every database open on it first (`store.close()`):
 * the library leaves the result undefined if a handle is still in use. Then
 * `openPersistentBrowserDatabase()` can be called again for an empty one.
 *
 * A no-op where the persistent VFS is not available (Node, no OPFS). If it was
 * not installed yet in this process it is installed first, so the button
 * still deletes what an earlier visit stored. Errors from the wipe itself
 * propagate: the user has to know when deleting their data did not work.
 */
export async function deleteBrowserData(): Promise<void> {
  const pool = await loadSahPool()
  if (pool === undefined) return
  await pool.wipeFiles()
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
