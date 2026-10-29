import { BrowserHandStore, deleteBrowserData } from '@poker/store/browser'

import { createWorkerHandler } from './handler.js'
import type { WorkerRequest, WorkerResponse } from './protocol.js'

/**
 * The dedicated Worker that owns the hand store. It has to be a Worker: OPFS's
 * synchronous access handles, which the store persists through, exist nowhere
 * else, and parsing and analysing a few thousand hands would freeze the page
 * if it ran on the main thread.
 *
 * Opened once, here, for the life of the page.
 */

// The project compiles against the DOM lib (the page's), not WebWorker's: this
// is the slice of `DedicatedWorkerGlobalScope` the Worker uses.
interface WorkerScope {
  postMessage(message: WorkerResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
}

const scope = self as unknown as WorkerScope

const handle = createWorkerHandler(
  {
    openStore: () => BrowserHandStore.openPersistent(),
    deleteData: deleteBrowserData,
    openDemoStore: () => BrowserHandStore.create(),
    // Its own chunk, fetched from this origin the first time the demo opens:
    // nobody who only looks at their own hands downloads the sample.
    loadDemoHands: async () => (await import('../demo/sample-hands.txt?raw')).default,
  },
  (response) => scope.postMessage(response),
)

scope.addEventListener('message', (event) => {
  void handle(event.data)
})
