import type { Chips, GameType, Hand, HandId, ParseIssue, Variant } from '@poker/core'

export interface TableSizeRange {
  readonly min?: number
  readonly max?: number
}

export interface StakesRange {
  /** Big blind size, inclusive. */
  readonly minBb?: Chips
  readonly maxBb?: Chips
}

/** Every field is optional and independent; an empty filter matches everything. */
export interface HandFilter {
  readonly site?: string
  readonly hero?: string
  readonly gameType?: GameType
  readonly variant?: Variant
  /** 6-max and 9-max must never be averaged together, so this is a range over
   * `table.maxSeats`, not an exact match. */
  readonly tableSize?: TableSizeRange
  readonly stakes?: StakesRange
  readonly from?: Date
  readonly to?: Date
  readonly handIds?: readonly HandId[]
  readonly limit?: number
  readonly offset?: number
}

/** Only what a single SQL pass over the indexed columns can produce cheaply.
 * VPIP/PFR/aggression and anything else that needs to walk streets/actions
 * belongs to the `metrics` package, streaming hands from `query()`. */
export interface StatsResult {
  readonly handCount: number
  readonly sessionCount: number
  readonly firstHandAt?: Date
  readonly lastHandAt?: Date
  /** Sum of `results.net[hero]` across matched hands, in raw chip units. Mixes
   * currencies if the filter spans more than one — narrow with `site`/`stakes`
   * when that matters. */
  readonly heroNetChips: Chips
  readonly heroHandsDealtIn: number
  readonly heroNetBb: number
  readonly bb100: number
}

export interface HandStore {
  upsert(hands: readonly Hand[]): Promise<void>
  query(filter: HandFilter): AsyncIterable<Hand>
  stats(filter: HandFilter): Promise<StatsResult>
  // Both implementations already had these; declared here (rather than left
  // as extras on the concrete classes) so callers that only need the shared
  // interface -- like @poker/api-core's note routes -- don't have to depend
  // on either concrete store.
  insertNote(note: HandNote): Promise<void>
  listNotesForHand(handId: HandId): Promise<readonly HandNote[]>
  searchNotes(query: string): Promise<readonly HandNote[]>
  close(): void
}

export type NoteSource = 'claude' | 'me'

export interface HandNote {
  readonly handId: HandId
  readonly source: NoteSource
  readonly content: string
  readonly createdAt: Date
  readonly tags: readonly string[]
}

/** What the caller hands in to quarantine a hand that failed to parse. */
export interface QuarantineEntry {
  readonly raw: string
  readonly sourcePath: string
  readonly issues: readonly ParseIssue[]
}

/** What comes back out: the entry plus the identity/bookkeeping the store adds. */
export interface QuarantinedHand extends QuarantineEntry {
  /** sha256 of `raw`, the dedup key across re-ingests of the same broken hand. */
  readonly hash: string
  readonly createdAt: Date
}

/** What the caller hands in to record (or re-record) a file it ingested. */
export interface IngestedFileRecord {
  readonly path: string
  readonly size: number
  readonly mtime: Date
  readonly contentHash: string
}

export interface IngestedFileInfo extends IngestedFileRecord {
  readonly ingestedAt: Date
}
