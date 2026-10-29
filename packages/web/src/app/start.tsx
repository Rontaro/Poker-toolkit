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
  // `/app?demo=1` opens on the sample hands. Asked for before the first
  // render: the Worker answers in order, so the views' first requests already
  // read the sample instead of flashing the user's archive.
  const demoAtStart =
    new URLSearchParams(window.location.search).get('demo') === '1' ? client.enterDemo() : undefined
  // Handled by WebApp once it mounts; until then, not an unhandled rejection.
  demoAtStart?.catch(() => undefined)
  // Before the first render: the views fetch on mount.
  setTransport(client.transport)
  root.render(
    <StrictMode>
      <WebApp client={client} demoAtStart={demoAtStart} />
    </StrictMode>,
  )
}
