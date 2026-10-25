/**
 * Sessions are derived, not recorded: a hand history says when a hand was
 * played, never which sitting it belonged to. A gap longer than half an hour
 * between two consecutive hands is treated as the player having got up.
 *
 * This lives in `core` because both the store (which indexes by session) and
 * the prompt builder (which says "hand 12 of the session") need the same
 * answer, and two implementations of it would eventually disagree.
 */

/** A gap longer than this between consecutive hands starts a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000

export interface SessionInput {
  readonly id: string
  readonly playedAt: number
}

/** Opaque but readable: hero plus the epoch-ms of the session's first hand.
 * Stable across recomputation, which is what makes re-importing idempotent. */
export function sessionId(hero: string, sessionStartMs: number): string {
  return `${hero}#${sessionStartMs}`
}

export interface SessionPlacement {
  readonly sessionId: string
  /** 1 for the first hand of the sitting. Fatigue analysis counts from here. */
  readonly indexInSession: number
}

/**
 * Places every hand into a session.
 *
 * Hands can arrive in any order — files get imported however the caller finds
 * them — so the whole sequence is sorted and walked rather than patched one row
 * at a time. Ties in time are broken by id so the walk is deterministic.
 */
export function deriveSessions(
  rows: readonly SessionInput[],
  hero: string,
  gapMs: number = SESSION_GAP_MS,
): ReadonlyMap<string, SessionPlacement> {
  const ordered = [...rows].sort((a, b) => a.playedAt - b.playedAt || a.id.localeCompare(b.id))

  const result = new Map<string, SessionPlacement>()
  let start = 0
  let previous: number | undefined
  let index = 0

  for (const row of ordered) {
    if (previous === undefined || row.playedAt - previous > gapMs) {
      start = row.playedAt
      index = 0
    }
    index += 1
    result.set(row.id, { sessionId: sessionId(hero, start), indexInSession: index })
    previous = row.playedAt
  }

  return result
}

/** Just the session ids, for callers that only need the grouping. */
export function deriveSessionIds(
  rows: readonly SessionInput[],
  hero: string,
  gapMs: number = SESSION_GAP_MS,
): ReadonlyMap<string, string> {
  const placed = deriveSessions(rows, hero, gapMs)
  return new Map([...placed].map(([id, placement]) => [id, placement.sessionId] as const))
}
