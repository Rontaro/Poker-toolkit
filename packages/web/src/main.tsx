import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { setTransport } from '@poker/ui'

/**
 * Two routes, each its own chunk: `/app` is the analysis app over the Worker,
 * anything else is the public page. Loaded by route so the app never carries
 * the public pages' Tailwind stylesheet and the public pages never start the
 * Worker (which would take the archive's lock for nothing).
 */

const element = document.getElementById('root')
if (element === null) throw new Error('missing #root')
const root = createRoot(element)

function isAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/')
}

async function start(): Promise<void> {
  if (isAppPath(window.location.pathname)) {
    const [{ WebApp }, { WorkerClient }] = await Promise.all([
      import('./app/WebApp.js'),
      import('./worker/client.js'),
    ])
    const client = new WorkerClient(
      new Worker(new URL('./worker/poker-worker.ts', import.meta.url), { type: 'module' }),
    )
    // Before the first render: the views fetch on mount.
    setTransport(client.transport)
    root.render(
      <StrictMode>
        <WebApp client={client} />
      </StrictMode>,
    )
    return
  }

  const { Home } = await import('./pages/Home.js')
  root.render(
    <StrictMode>
      <Home />
    </StrictMode>,
  )
}

void start()
