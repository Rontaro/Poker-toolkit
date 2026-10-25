import { createRequire } from 'node:module'

/**
 * The SQLite driver, in the one place that is allowed to know which one it is.
 *
 * This is Node's built-in `node:sqlite` rather than `better-sqlite3`, which the
 * project originally specified: `better-sqlite3` publishes no prebuilt binary
 * for Node 24 and this machine has no C++ toolchain for node-gyp to fall back
 * on, so it cannot be installed here. `node:sqlite` is the same idea — an
 * embedded, synchronous SQLite — with nothing to compile. It is still marked
 * experimental by Node, which is the cost of the choice; swapping back is a
 * change to this file and nothing else.
 *
 * It is loaded through `createRequire` rather than a static import because
 * `node:sqlite` is prefix-only: there is no bare `sqlite` builtin, and Vite (so
 * Vitest) resolves `node:` imports by stripping the prefix and looking up the
 * bare name, which fails. A `require` call is opaque to that rewriting and
 * reaches Node untouched. The types are still the real ones, taken from the
 * type-only import below.
 */
const nodeRequire = createRequire(import.meta.url)

type SqliteModule = typeof import('node:sqlite')

export const { DatabaseSync } = nodeRequire('node:sqlite') as SqliteModule

export type Database = InstanceType<SqliteModule['DatabaseSync']>
