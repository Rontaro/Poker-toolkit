import type { HandFilter } from './types.js'

type Param = string | number

export interface WhereClause {
  readonly sql: string
  readonly params: readonly Param[]
}

/** Builds a `WHERE ...` clause (or `''` for an empty filter) plus its bound
 * params, in the order the placeholders appear. Every `HandFilter` field is
 * independent and optional, so this is just a list of conditions joined with
 * AND -- no query planning beyond what the indexes in 0001_initial.sql give
 * SQLite for free. */
export function buildWhere(filter: HandFilter): WhereClause {
  const clauses: string[] = []
  const params: Param[] = []

  if (filter.site !== undefined) {
    clauses.push('site = ?')
    params.push(filter.site)
  }
  if (filter.hero !== undefined) {
    clauses.push('hero = ?')
    params.push(filter.hero)
  }
  if (filter.gameType !== undefined) {
    clauses.push('game_type = ?')
    params.push(filter.gameType)
  }
  if (filter.variant !== undefined) {
    clauses.push('variant = ?')
    params.push(filter.variant)
  }
  if (filter.tableSize?.min !== undefined) {
    clauses.push('table_size >= ?')
    params.push(filter.tableSize.min)
  }
  if (filter.tableSize?.max !== undefined) {
    clauses.push('table_size <= ?')
    params.push(filter.tableSize.max)
  }
  if (filter.stakes?.minBb !== undefined) {
    clauses.push('stakes_bb >= ?')
    params.push(filter.stakes.minBb)
  }
  if (filter.stakes?.maxBb !== undefined) {
    clauses.push('stakes_bb <= ?')
    params.push(filter.stakes.maxBb)
  }
  if (filter.from !== undefined) {
    clauses.push('played_at >= ?')
    params.push(filter.from.getTime())
  }
  if (filter.to !== undefined) {
    clauses.push('played_at <= ?')
    params.push(filter.to.getTime())
  }
  if (filter.handIds !== undefined) {
    // An explicit empty list means "match nothing", not "no filter".
    if (filter.handIds.length === 0) {
      clauses.push('0')
    } else {
      clauses.push(`id IN (${filter.handIds.map(() => '?').join(', ')})`)
      params.push(...filter.handIds)
    }
  }

  return { sql: clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`, params }
}

export interface LimitOffsetClause {
  readonly sql: string
  readonly params: readonly number[]
}

/** SQLite only accepts `OFFSET` alongside `LIMIT`, so an offset with no limit
 * uses `LIMIT -1` (SQLite's "no limit") to keep both usable independently. */
export function buildLimitOffset(filter: HandFilter): LimitOffsetClause {
  const params: number[] = []
  let sql = ''

  if (filter.limit !== undefined) {
    sql += ' LIMIT ?'
    params.push(filter.limit)
    if (filter.offset !== undefined) {
      sql += ' OFFSET ?'
      params.push(filter.offset)
    }
  } else if (filter.offset !== undefined) {
    sql += ' LIMIT -1 OFFSET ?'
    params.push(filter.offset)
  }

  return { sql, params }
}
