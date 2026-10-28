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

// Session derivation is domain logic and lives in `core`; re-exported here
// because callers of the store are the ones who ask about sessions.
export { SESSION_GAP_MS, deriveSessions, deriveSessionIds } from '@poker/core'

// `BrowserHandStore` is the sqlite-wasm counterpart to `SqliteHandStore`
// (see `index.ts`): this package's second entry point so a browser bundle
// can import "@poker/store/browser" and never pull in `node:sqlite`.
export { BrowserHandStore } from './browser-hand-store.js'

// For the "delete all data" button: close the store first, then call this.
export { deleteBrowserData } from './driver-browser.js'
