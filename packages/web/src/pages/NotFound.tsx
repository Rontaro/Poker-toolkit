import type { JSX } from 'react'

import { LINKS, SitePage, primaryCta } from './Layout.js'

/** Any path the site does not have. Served with a 200 by Cloudflare Pages
 * (no root `404.html`, so unknown paths get `index.html`), hence the
 * `noindex` this page adds. */
export function NotFound(): JSX.Element {
  return (
    <SitePage>
      <meta name="robots" content="noindex" />
      <main className="site ledger-paper">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-4 py-24 sm:px-6 sm:py-32">
          <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-amber">404 · pagina non trovata</p>
          <h1 className="font-serif text-[44px] font-normal leading-[1.04] sm:text-[60px]">
            Questa mano <em className="text-jade">non è nell’archivio</em>.
          </h1>
          <p className="text-[18px] leading-relaxed text-chalk">L’indirizzo non corrisponde a nessuna pagina del sito.</p>
          <a href={LINKS.home} className={primaryCta}>
            Torna alla pagina iniziale
          </a>
        </div>
      </main>
    </SitePage>
  )
}
