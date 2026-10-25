/** The minimal, driver-agnostic shape every SQLite backend (node:sqlite,
 * sqlite-wasm) exposes. Everything in this package that runs a query against
 * `Database` depends on this interface, never on a concrete driver's class. */
export interface SqlStatement {
  run(...args: unknown[]): unknown
  get(...args: unknown[]): Record<string, unknown> | undefined
  all(...args: unknown[]): Record<string, unknown>[]
  iterate(...args: unknown[]): Iterable<Record<string, unknown>>
}

export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
  close(): void
}
