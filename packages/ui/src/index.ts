/** Barrel for everything outside this package needs: the 8 views, the shell
 * around them, the public components, and the api/transport surface. */

export { Overview } from './views/Overview.js'
export { Statistics } from './views/Statistics.js'
export { Leaks } from './views/Leaks.js'
export { Timeline } from './views/Timeline.js'
export { Studio } from './views/Studio.js'
export { Equity } from './views/Equity.js'
export { Training } from './views/Training.js'
export { Guide } from './views/Guide.js'

export {
  Empty,
  NoHands,
  Panel,
  Figure,
  Term,
  useResource,
  ImportInstructionsContext,
  LOCAL_IMPORT_INSTRUCTIONS,
  useImportInstructions,
  type ImportInstructions,
} from './components/Common.js'
export { AppShell, GlobalFilters, VIEWS, type ViewId } from './components/Shell.js'
export {
  PlayingCard,
  HiddenPair,
  CardRow,
  DeckGrid,
  Gauge,
  type CardTone,
} from './components/Cards.js'

export {
  get,
  post,
  setTransport,
  httpTransport,
  transportError,
  toQuery,
  fixed,
  signClass,
  EMPTY_FILTERS,
  type Transport,
  type Filters,
  type Verdict,
  type Metric,
  type LeakSummary,
  type LeakEvent,
  type BankrollPoint,
} from './api.js'
