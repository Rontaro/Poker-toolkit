import { StrictMode, type JSX } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Four pages and a fallback, each its own chunk, loaded by path:
 * - `/app` is the analysis app over the Worker;
 * - `/`, `/privacy`, `/allenamento` are the public pages, and anything else
 *   gets the "not found" page (Cloudflare Pages serves `index.html` for every
 *   path it has no file for, as long as there is no root `404.html`).
 *
 * Loaded by route so the public pages carry none of the app (views, charts,
 * the Worker) and the app never carries the public pages' Tailwind
 * stylesheet. The public pages also never start the Worker, which would take
 * the archive's lock for nothing: `/allenamento` shows the Training view,
 * which needs neither the Worker nor the transport.
 */

const element = document.getElementById('root')
if (element === null) throw new Error('missing #root')
const root = createRoot(element)

interface Page {
  readonly title: string
  readonly description?: string
  readonly load: () => Promise<() => JSX.Element>
}

const PAGES: Record<string, Page> = {
  '/': {
    title: 'Ledger — analisi post-sessione delle tue hand history PokerStars',
    load: async () => (await import('./pages/Home.js')).Home,
  },
  '/privacy': {
    title: 'Privacy — Ledger',
    description:
      'Le hand history che carichi su Ledger non lasciano mai il tuo browser: niente upload, niente cookie, niente analytics. Dove sono salvate e come cancellarle.',
    load: async () => (await import('./pages/Privacy.js')).Privacy,
  },
  '/allenamento': {
    title: 'Allenamento — Ledger',
    description:
      'Esercizi su out, equity, pot odds e combinazioni: undici livelli e una modalità infinita, direttamente nel browser.',
    load: async () => (await import('./pages/Allenamento.js')).Allenamento,
  },
}

const NOT_FOUND: Page = {
  title: 'Pagina non trovata — Ledger',
  load: async () => (await import('./pages/NotFound.js')).NotFound,
}

/** `/privacy/` is `/privacy`. */
function normalise(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

function isAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/')
}

async function start(): Promise<void> {
  const path = normalise(window.location.pathname)
  if (isAppPath(path)) {
    document.title = 'Ledger — le tue mani'
    const { startApp } = await import('./app/start.js')
    startApp(root)
    return
  }

  const page = PAGES[path] ?? NOT_FOUND
  document.title = page.title
  if (page.description !== undefined) {
    document.querySelector('meta[name="description"]')?.setAttribute('content', page.description)
  }
  const Page = await page.load()
  root.render(
    <StrictMode>
      <Page />
    </StrictMode>,
  )
}

void start()
