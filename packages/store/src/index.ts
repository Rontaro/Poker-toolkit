export type {
  HandFilter,
  HandNote,
  HandStore,
  IngestedFileInfo,
  IngestedFileRecord,
  NoteSource,
  QuarantineEntry,
  QuarantinedHand,
  StakesRange,
  StatsResult,
  TableSizeRange,
} from './types.js'

// `SqliteHandStore` is the only implementation, deliberately: the sqlite
// driver (`node:sqlite`, see sqlite-store.ts for why not better-sqlite3 on
// this machine) never leaks past this file. Nothing outside the package
// should import `node:sqlite` directly.
export { SqliteHandStore } from './sqlite-store.js'

// Session derivation is domain logic and lives in `core`; re-exported here
// because callers of the store are the ones who ask about sessions.
export { SESSION_GAP_MS, deriveSessions, deriveSessionIds } from '@poker/core'
