import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Two routes, each its own chunk: `/app` is the analysis app over the Worker,
 * anything else is the public page. Loaded by route so the public pages carry
 * none of the app (views, charts, the Worker) and the app never carries the
 * public pages' Tailwind stylesheet. The public pages also never start the
 * Worker, which would take the archive's lock for nothing.
 */

const element = document.getElementById('root')
if (element === null) throw new Error('missing #root')
const root = createRoot(element)

function isAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/')
}

async function start(): Promise<void> {
  if (isAppPath(window.location.pathname)) {
    const { startApp } = await import('./app/start.js')
    startApp(root)
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
