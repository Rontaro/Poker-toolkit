import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'

import { setTransport } from '@poker/ui'

import { WorkerClient } from '../worker/client.js'
import { WebApp } from './WebApp.js'

/**
 * Everything `/app` needs, behind one dynamic import from `main.tsx`: the
 * views, `@poker/ui` and the Worker client stay out of the entry chunk, so the
 * public pages load none of it.
 */
export function startApp(root: Root): void {
  const client = new WorkerClient(
    new Worker(new URL('../worker/poker-worker.ts', import.meta.url), { type: 'module' }),
  )
  // Before the first render: the views fetch on mount.
  setTransport(client.transport)
  root.render(
    <StrictMode>
      <WebApp client={client} />
    </StrictMode>,
  )
}
